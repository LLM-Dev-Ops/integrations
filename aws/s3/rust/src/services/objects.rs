//! Objects service for S3 object operations.

use crate::config::S3Config;
use crate::error::{ObjectError, S3Error};
use crate::signing::{sha256_hex, AwsSigner};
use crate::transport::{HttpRequest, HttpTransport};
use crate::types::*;
use crate::xml;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::Arc;
use url::Url;

/// Service for S3 object operations.
pub struct ObjectsService {
    config: Arc<S3Config>,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
}

impl ObjectsService {
    /// Create a new objects service.
    pub fn new(
        config: Arc<S3Config>,
        transport: Arc<dyn HttpTransport>,
        signer: Arc<dyn AwsSigner>,
    ) -> Self {
        Self {
            config,
            transport,
            signer,
        }
    }

    /// Put an object into a bucket.
    pub async fn put(&self, request: PutObjectRequest) -> Result<PutObjectOutput, S3Error> {
        let url = self.build_url(&request.bucket, Some(&request.key), None)?;
        let body = request.body.clone().unwrap_or_default();

        let mut headers = HashMap::new();
        headers.insert(
            "content-length".to_string(),
            body.len().to_string(),
        );

        if let Some(content_type) = &request.content_type {
            headers.insert("content-type".to_string(), content_type.clone());
        }

        if let Some(storage_class) = &request.storage_class {
            headers.insert(
                "x-amz-storage-class".to_string(),
                storage_class.as_str().to_string(),
            );
        }

        if let Some(acl) = &request.acl {
            headers.insert("x-amz-acl".to_string(), acl.as_str().to_string());
        }

        if let Some(encryption) = &request.server_side_encryption {
            headers.insert(
                "x-amz-server-side-encryption".to_string(),
                encryption.as_header_value().to_string(),
            );
            if let ServerSideEncryption::AwsKms { key_id: Some(key) } = encryption {
                headers.insert(
                    "x-amz-server-side-encryption-aws-kms-key-id".to_string(),
                    key.clone(),
                );
            }
        }

        if let Some(cache_control) = &request.cache_control {
            headers.insert("cache-control".to_string(), cache_control.clone());
        }

        // Add user metadata
        for (key, value) in &request.metadata {
            headers.insert(format!("x-amz-meta-{}", key), value.clone());
        }

        // Add tagging header if tags present
        if let Some(tags) = &request.tagging {
            let tag_string: String = tags
                .iter()
                .map(|t| format!("{}={}", t.key, t.value))
                .collect::<Vec<_>>()
                .join("&");
            headers.insert("x-amz-tagging".to_string(), tag_string);
        }

        let signed = self
            .signer
            .sign("PUT", &url, &headers, Some(&body))
            .await?;

        let http_request = HttpRequest::new("PUT", signed.url.as_str())
            .with_headers(signed.headers)
            .with_body(body);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        Ok(PutObjectOutput {
            e_tag: response.etag().map(String::from),
            version_id: response.get_header("x-amz-version-id").map(String::from),
            server_side_encryption: response
                .get_header("x-amz-server-side-encryption")
                .map(String::from),
            sse_kms_key_id: response
                .get_header("x-amz-server-side-encryption-aws-kms-key-id")
                .map(String::from),
            bucket_key_enabled: response
                .get_header("x-amz-server-side-encryption-bucket-key-enabled")
                .map(|v| v == "true"),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Get an object from a bucket.
    pub async fn get(&self, request: GetObjectRequest) -> Result<GetObjectOutput, S3Error> {
        let mut query_params = Vec::new();
        if let Some(version_id) = &request.version_id {
            query_params.push(format!("versionId={}", version_id));
        }
        if let Some(part_number) = request.part_number {
            query_params.push(format!("partNumber={}", part_number));
        }

        let query = if query_params.is_empty() {
            None
        } else {
            Some(query_params.join("&"))
        };

        let url = self.build_url(&request.bucket, Some(&request.key), query.as_deref())?;

        let mut headers = HashMap::new();

        if let Some(range) = &request.range {
            headers.insert("range".to_string(), range.clone());
        }
        if let Some(if_match) = &request.if_match {
            headers.insert("if-match".to_string(), if_match.clone());
        }
        if let Some(if_none_match) = &request.if_none_match {
            headers.insert("if-none-match".to_string(), if_none_match.clone());
        }
        if let Some(if_modified_since) = &request.if_modified_since {
            headers.insert("if-modified-since".to_string(), if_modified_since.clone());
        }
        if let Some(if_unmodified_since) = &request.if_unmodified_since {
            headers.insert("if-unmodified-since".to_string(), if_unmodified_since.clone());
        }

        let signed = self.signer.sign("GET", &url, &headers, None).await?;

        let http_request = HttpRequest::new("GET", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if response.status == 304 {
            return Err(S3Error::Object(ObjectError::NotModified {
                bucket: request.bucket.clone(),
                key: request.key.clone(),
                request_id: response.request_id().map(String::from),
            }));
        }

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        // Extract metadata from x-amz-meta-* headers
        let metadata: HashMap<String, String> = response
            .headers
            .iter()
            .filter(|(k, _)| k.to_lowercase().starts_with("x-amz-meta-"))
            .map(|(k, v)| {
                let key = k
                    .to_lowercase()
                    .strip_prefix("x-amz-meta-")
                    .unwrap_or(k)
                    .to_string();
                (key, v.clone())
            })
            .collect();

        Ok(GetObjectOutput {
            body: response.body,
            e_tag: response.etag().map(String::from),
            content_length: response.content_length(),
            content_type: response.content_type().map(String::from),
            content_encoding: response.get_header("content-encoding").map(String::from),
            content_disposition: response.get_header("content-disposition").map(String::from),
            cache_control: response.get_header("cache-control").map(String::from),
            content_language: response.get_header("content-language").map(String::from),
            last_modified: response.get_header("last-modified").map(String::from),
            version_id: response.get_header("x-amz-version-id").map(String::from),
            storage_class: response
                .get_header("x-amz-storage-class")
                .and_then(|v| v.parse().ok()),
            server_side_encryption: response
                .get_header("x-amz-server-side-encryption")
                .map(String::from),
            sse_kms_key_id: response
                .get_header("x-amz-server-side-encryption-aws-kms-key-id")
                .map(String::from),
            metadata,
            tag_count: response
                .get_header("x-amz-tagging-count")
                .and_then(|v| v.parse().ok()),
            delete_marker: response
                .get_header("x-amz-delete-marker")
                .map(|v| v == "true"),
            parts_count: response
                .get_header("x-amz-mp-parts-count")
                .and_then(|v| v.parse().ok()),
            content_range: response.get_header("content-range").map(String::from),
            accept_ranges: response.get_header("accept-ranges").map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Delete an object.
    pub async fn delete(&self, request: DeleteObjectRequest) -> Result<DeleteObjectOutput, S3Error> {
        let mut query_params = Vec::new();
        if let Some(version_id) = &request.version_id {
            query_params.push(format!("versionId={}", version_id));
        }

        let query = if query_params.is_empty() {
            None
        } else {
            Some(query_params.join("&"))
        };

        let url = self.build_url(&request.bucket, Some(&request.key), query.as_deref())?;
        let headers = HashMap::new();

        let signed = self.signer.sign("DELETE", &url, &headers, None).await?;

        let http_request = HttpRequest::new("DELETE", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        Ok(DeleteObjectOutput {
            delete_marker: response
                .get_header("x-amz-delete-marker")
                .map(|v| v == "true"),
            version_id: response.get_header("x-amz-version-id").map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Delete multiple objects.
    pub async fn delete_objects(
        &self,
        request: DeleteObjectsRequest,
    ) -> Result<DeleteObjectsOutput, S3Error> {
        let url = self.build_url(&request.bucket, None, Some("delete"))?;

        let body = xml::build_delete_objects_xml(&request.objects, request.quiet);
        let body_bytes = Bytes::from(body);
        let content_md5 = base64::encode(md5::compute(&body_bytes).0);

        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/xml".to_string());
        headers.insert("content-md5".to_string(), content_md5);
        headers.insert("content-length".to_string(), body_bytes.len().to_string());

        let signed = self
            .signer
            .sign("POST", &url, &headers, Some(&body_bytes))
            .await?;

        let http_request = HttpRequest::new("POST", signed.url.as_str())
            .with_headers(signed.headers)
            .with_body(body_bytes);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_delete_objects(&body_str)?;
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    /// Get object metadata (HEAD).
    pub async fn head(&self, request: HeadObjectRequest) -> Result<HeadObjectOutput, S3Error> {
        let mut query_params = Vec::new();
        if let Some(version_id) = &request.version_id {
            query_params.push(format!("versionId={}", version_id));
        }
        if let Some(part_number) = request.part_number {
            query_params.push(format!("partNumber={}", part_number));
        }

        let query = if query_params.is_empty() {
            None
        } else {
            Some(query_params.join("&"))
        };

        let url = self.build_url(&request.bucket, Some(&request.key), query.as_deref())?;
        let headers = HashMap::new();

        let signed = self.signer.sign("HEAD", &url, &headers, None).await?;

        let http_request = HttpRequest::new("HEAD", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if response.status == 404 {
            return Err(S3Error::Object(ObjectError::NotFound {
                bucket: request.bucket.clone(),
                key: request.key.clone(),
                request_id: response.request_id().map(String::from),
            }));
        }

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        // Extract metadata
        let metadata: HashMap<String, String> = response
            .headers
            .iter()
            .filter(|(k, _)| k.to_lowercase().starts_with("x-amz-meta-"))
            .map(|(k, v)| {
                let key = k
                    .to_lowercase()
                    .strip_prefix("x-amz-meta-")
                    .unwrap_or(k)
                    .to_string();
                (key, v.clone())
            })
            .collect();

        Ok(HeadObjectOutput {
            e_tag: response.etag().map(String::from),
            content_length: response.content_length(),
            content_type: response.content_type().map(String::from),
            content_encoding: response.get_header("content-encoding").map(String::from),
            content_disposition: response.get_header("content-disposition").map(String::from),
            cache_control: response.get_header("cache-control").map(String::from),
            content_language: response.get_header("content-language").map(String::from),
            last_modified: response.get_header("last-modified").map(String::from),
            version_id: response.get_header("x-amz-version-id").map(String::from),
            storage_class: response
                .get_header("x-amz-storage-class")
                .and_then(|v| v.parse().ok()),
            server_side_encryption: response
                .get_header("x-amz-server-side-encryption")
                .map(String::from),
            sse_kms_key_id: response
                .get_header("x-amz-server-side-encryption-aws-kms-key-id")
                .map(String::from),
            metadata,
            delete_marker: response
                .get_header("x-amz-delete-marker")
                .map(|v| v == "true"),
            parts_count: response
                .get_header("x-amz-mp-parts-count")
                .and_then(|v| v.parse().ok()),
            object_lock_mode: response.get_header("x-amz-object-lock-mode").map(String::from),
            object_lock_retain_until_date: response
                .get_header("x-amz-object-lock-retain-until-date")
                .map(String::from),
            object_lock_legal_hold_status: response
                .get_header("x-amz-object-lock-legal-hold")
                .map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Copy an object.
    pub async fn copy(&self, request: CopyObjectRequest) -> Result<CopyObjectOutput, S3Error> {
        let url = self.build_url(&request.dest_bucket, Some(&request.dest_key), None)?;

        let mut copy_source = format!("/{}/{}", request.source_bucket, request.source_key);
        if let Some(version_id) = &request.source_version_id {
            copy_source = format!("{}?versionId={}", copy_source, version_id);
        }

        let mut headers = HashMap::new();
        headers.insert("x-amz-copy-source".to_string(), copy_source);

        if let Some(directive) = &request.metadata_directive {
            headers.insert("x-amz-metadata-directive".to_string(), directive.clone());
        }

        if let Some(content_type) = &request.content_type {
            headers.insert("content-type".to_string(), content_type.clone());
        }

        if let Some(storage_class) = &request.storage_class {
            headers.insert(
                "x-amz-storage-class".to_string(),
                storage_class.as_str().to_string(),
            );
        }

        if let Some(acl) = &request.acl {
            headers.insert("x-amz-acl".to_string(), acl.as_str().to_string());
        }

        let signed = self.signer.sign("PUT", &url, &headers, None).await?;

        let http_request = HttpRequest::new("PUT", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        Ok(CopyObjectOutput {
            e_tag: response.etag().map(String::from),
            last_modified: response.get_header("last-modified").map(String::from),
            version_id: response.get_header("x-amz-version-id").map(String::from),
            copy_source_version_id: response
                .get_header("x-amz-copy-source-version-id")
                .map(String::from),
            server_side_encryption: response
                .get_header("x-amz-server-side-encryption")
                .map(String::from),
            sse_kms_key_id: response
                .get_header("x-amz-server-side-encryption-aws-kms-key-id")
                .map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// List objects (v2).
    pub async fn list(&self, request: ListObjectsV2Request) -> Result<ListObjectsV2Output, S3Error> {
        let mut query_params = vec!["list-type=2".to_string()];

        if let Some(prefix) = &request.prefix {
            query_params.push(format!("prefix={}", prefix));
        }
        if let Some(delimiter) = &request.delimiter {
            query_params.push(format!("delimiter={}", delimiter));
        }
        if let Some(max_keys) = request.max_keys {
            query_params.push(format!("max-keys={}", max_keys));
        }
        if let Some(token) = &request.continuation_token {
            query_params.push(format!("continuation-token={}", token));
        }
        if let Some(start_after) = &request.start_after {
            query_params.push(format!("start-after={}", start_after));
        }
        if request.fetch_owner == Some(true) {
            query_params.push("fetch-owner=true".to_string());
        }

        let url = self.build_url(&request.bucket, None, Some(&query_params.join("&")))?;
        let headers = HashMap::new();

        let signed = self.signer.sign("GET", &url, &headers, None).await?;

        let http_request = HttpRequest::new("GET", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, response.request_id()).await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_list_objects_v2(&body_str)?;
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    fn build_url(
        &self,
        bucket: &str,
        key: Option<&str>,
        query: Option<&str>,
    ) -> Result<Url, S3Error> {
        let endpoint = self.config.resolve_endpoint(Some(bucket));
        let path = self.config.build_path(bucket, key);

        let url_str = if let Some(q) = query {
            format!("{}{}?{}", endpoint.as_str().trim_end_matches('/'), path, q)
        } else {
            format!("{}{}", endpoint.as_str().trim_end_matches('/'), path)
        };

        Url::parse(&url_str).map_err(|e| {
            S3Error::Request(crate::error::RequestError::Validation {
                message: format!("Invalid URL: {}", e),
            })
        })
    }

    async fn parse_error(&self, body: &Bytes, request_id: Option<&str>) -> S3Error {
        if body.is_empty() {
            return S3Error::Response(crate::error::ResponseError::InvalidResponse {
                message: "Empty error response".to_string(),
            });
        }

        let body_str = String::from_utf8_lossy(body);
        match xml::parse_error_response(&body_str) {
            Ok(error_response) => crate::error::map_s3_error_code(&error_response.code, Some(error_response)),
            Err(_) => S3Error::Response(crate::error::ResponseError::InvalidResponse {
                message: format!(
                    "Failed to parse error response: {}",
                    body_str.chars().take(100).collect::<String>()
                ),
            }),
        }
    }
}

impl std::fmt::Debug for ObjectsService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ObjectsService")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}
