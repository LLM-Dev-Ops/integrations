//! Multipart upload service for S3.

use crate::config::S3Config;
use crate::error::S3Error;
use crate::signing::AwsSigner;
use crate::transport::{HttpRequest, HttpTransport};
use crate::types::*;
use crate::xml;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::Arc;
use url::Url;

/// Service for S3 multipart upload operations.
pub struct MultipartService {
    config: Arc<S3Config>,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
}

impl MultipartService {
    /// Create a new multipart service.
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

    /// Initiate a multipart upload.
    pub async fn create(
        &self,
        request: CreateMultipartUploadRequest,
    ) -> Result<CreateMultipartUploadOutput, S3Error> {
        let url = self.build_url(&request.bucket, Some(&request.key), Some("uploads"))?;

        let mut headers = HashMap::new();

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
        }

        // Add user metadata
        for (key, value) in &request.metadata {
            headers.insert(format!("x-amz-meta-{}", key), value.clone());
        }

        // Add tagging
        if let Some(tags) = &request.tagging {
            let tag_string: String = tags
                .iter()
                .map(|t| format!("{}={}", t.key, t.value))
                .collect::<Vec<_>>()
                .join("&");
            headers.insert("x-amz-tagging".to_string(), tag_string);
        }

        let signed = self.signer.sign("POST", &url, &headers, None).await?;

        let http_request = HttpRequest::new("POST", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body).await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_create_multipart_upload(&body_str)?;
        output.server_side_encryption = response
            .get_header("x-amz-server-side-encryption")
            .map(String::from);
        output.sse_kms_key_id = response
            .get_header("x-amz-server-side-encryption-aws-kms-key-id")
            .map(String::from);
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    /// Upload a part.
    pub async fn upload_part(
        &self,
        request: UploadPartRequest,
    ) -> Result<UploadPartOutput, S3Error> {
        let query = format!("partNumber={}&uploadId={}", request.part_number, request.upload_id);
        let url = self.build_url(&request.bucket, Some(&request.key), Some(&query))?;

        let mut headers = HashMap::new();
        headers.insert("content-length".to_string(), request.body.len().to_string());

        if let Some(md5) = &request.content_md5 {
            headers.insert("content-md5".to_string(), md5.clone());
        }

        let signed = self
            .signer
            .sign("PUT", &url, &headers, Some(&request.body))
            .await?;

        let http_request = HttpRequest::new("PUT", signed.url.as_str())
            .with_headers(signed.headers)
            .with_body(request.body);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body).await);
        }

        Ok(UploadPartOutput {
            e_tag: response
                .etag()
                .map(String::from)
                .unwrap_or_default(),
            server_side_encryption: response
                .get_header("x-amz-server-side-encryption")
                .map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Complete a multipart upload.
    pub async fn complete(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        parts: &[CompletedPart],
    ) -> Result<CompleteMultipartUploadOutput, S3Error> {
        let query = format!("uploadId={}", upload_id);
        let url = self.build_url(bucket, Some(key), Some(&query))?;

        let body = xml::build_complete_multipart_xml(parts);
        let body_bytes = Bytes::from(body);

        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/xml".to_string());
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
            return Err(self.parse_error(&response.body).await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_complete_multipart_upload(&body_str)?;
        output.version_id = response.get_header("x-amz-version-id").map(String::from);
        output.server_side_encryption = response
            .get_header("x-amz-server-side-encryption")
            .map(String::from);
        output.sse_kms_key_id = response
            .get_header("x-amz-server-side-encryption-aws-kms-key-id")
            .map(String::from);
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    /// Abort a multipart upload.
    pub async fn abort(&self, bucket: &str, key: &str, upload_id: &str) -> Result<(), S3Error> {
        let query = format!("uploadId={}", upload_id);
        let url = self.build_url(bucket, Some(key), Some(&query))?;
        let headers = HashMap::new();

        let signed = self.signer.sign("DELETE", &url, &headers, None).await?;

        let http_request = HttpRequest::new("DELETE", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body).await);
        }

        Ok(())
    }

    /// List parts of an upload.
    pub async fn list_parts(&self, request: ListPartsRequest) -> Result<ListPartsOutput, S3Error> {
        let mut query_params = vec![format!("uploadId={}", request.upload_id)];

        if let Some(max_parts) = request.max_parts {
            query_params.push(format!("max-parts={}", max_parts));
        }
        if let Some(marker) = request.part_number_marker {
            query_params.push(format!("part-number-marker={}", marker));
        }

        let url = self.build_url(
            &request.bucket,
            Some(&request.key),
            Some(&query_params.join("&")),
        )?;
        let headers = HashMap::new();

        let signed = self.signer.sign("GET", &url, &headers, None).await?;

        let http_request = HttpRequest::new("GET", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body).await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_list_parts(&body_str)?;
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    /// High-level multipart upload helper.
    ///
    /// Automatically splits the data into parts and uploads them.
    pub async fn upload(
        &self,
        bucket: &str,
        key: &str,
        data: &[u8],
        content_type: Option<&str>,
    ) -> Result<CompleteMultipartUploadOutput, S3Error> {
        let part_size = self.config.multipart_part_size as usize;

        // Create multipart upload
        let mut create_request = CreateMultipartUploadRequest::new(bucket, key);
        if let Some(ct) = content_type {
            create_request.content_type = Some(ct.to_string());
        }
        let create_output = self.create(create_request).await?;
        let upload_id = &create_output.upload_id;

        // Upload parts
        let mut parts: Vec<CompletedPart> = Vec::new();
        let mut offset = 0;
        let mut part_number = 1;

        while offset < data.len() {
            let end = std::cmp::min(offset + part_size, data.len());
            let part_data = &data[offset..end];

            let upload_part_request = UploadPartRequest::new(
                bucket,
                key,
                upload_id,
                part_number,
                Bytes::copy_from_slice(part_data),
            );

            match self.upload_part(upload_part_request).await {
                Ok(output) => {
                    parts.push(CompletedPart {
                        part_number,
                        e_tag: output.e_tag,
                    });
                }
                Err(e) => {
                    // Abort on failure
                    let _ = self.abort(bucket, key, upload_id).await;
                    return Err(e);
                }
            }

            offset = end;
            part_number += 1;
        }

        // Complete the upload
        match self.complete(bucket, key, upload_id, &parts).await {
            Ok(output) => Ok(output),
            Err(e) => {
                // Abort on failure
                let _ = self.abort(bucket, key, upload_id).await;
                Err(e)
            }
        }
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

    async fn parse_error(&self, body: &Bytes) -> S3Error {
        if body.is_empty() {
            return S3Error::Response(crate::error::ResponseError::InvalidResponse {
                message: "Empty error response".to_string(),
            });
        }

        let body_str = String::from_utf8_lossy(body);
        match xml::parse_error_response(&body_str) {
            Ok(error_response) => {
                crate::error::map_s3_error_code(&error_response.code, Some(error_response))
            }
            Err(_) => S3Error::Response(crate::error::ResponseError::InvalidResponse {
                message: format!(
                    "Failed to parse error response: {}",
                    body_str.chars().take(100).collect::<String>()
                ),
            }),
        }
    }
}

impl std::fmt::Debug for MultipartService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MultipartService")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}
