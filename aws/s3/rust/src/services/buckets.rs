//! Buckets service for S3 bucket operations.

use crate::config::S3Config;
use crate::error::{BucketError, S3Error};
use crate::signing::AwsSigner;
use crate::transport::{HttpRequest, HttpTransport};
use crate::types::*;
use crate::xml;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::Arc;
use url::Url;

/// Service for S3 bucket operations.
pub struct BucketsService {
    config: Arc<S3Config>,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
}

impl BucketsService {
    /// Create a new buckets service.
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

    /// Create a new bucket.
    pub async fn create(&self, request: CreateBucketRequest) -> Result<CreateBucketOutput, S3Error> {
        let url = self.build_url(Some(&request.bucket), None)?;

        let mut headers = HashMap::new();

        if let Some(acl) = &request.acl {
            headers.insert("x-amz-acl".to_string(), acl.as_str().to_string());
        }

        if let Some(grant_read) = &request.grant_read {
            headers.insert("x-amz-grant-read".to_string(), grant_read.clone());
        }

        if let Some(grant_write) = &request.grant_write {
            headers.insert("x-amz-grant-write".to_string(), grant_write.clone());
        }

        if let Some(grant_full_control) = &request.grant_full_control {
            headers.insert(
                "x-amz-grant-full-control".to_string(),
                grant_full_control.clone(),
            );
        }

        if request.object_lock_enabled == Some(true) {
            headers.insert(
                "x-amz-bucket-object-lock-enabled".to_string(),
                "true".to_string(),
            );
        }

        // Build body with location constraint if not us-east-1
        let region = request
            .location_constraint
            .as_ref()
            .unwrap_or(&self.config.region);

        let body = if region != "us-east-1" {
            let xml = xml::build_create_bucket_xml(region);
            Some(Bytes::from(xml))
        } else {
            None
        };

        if let Some(ref b) = body {
            headers.insert("content-type".to_string(), "application/xml".to_string());
            headers.insert("content-length".to_string(), b.len().to_string());
        }

        let signed = self
            .signer
            .sign("PUT", &url, &headers, body.as_deref().map(|b| b.as_ref()))
            .await?;

        let mut http_request = HttpRequest::new("PUT", signed.url.as_str())
            .with_headers(signed.headers);

        if let Some(b) = body {
            http_request = http_request.with_body(b);
        }

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, &request.bucket).await);
        }

        Ok(CreateBucketOutput {
            location: response.get_header("location").map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Delete a bucket.
    pub async fn delete(&self, request: DeleteBucketRequest) -> Result<(), S3Error> {
        let url = self.build_url(Some(&request.bucket), None)?;
        let headers = HashMap::new();

        let signed = self.signer.sign("DELETE", &url, &headers, None).await?;

        let http_request = HttpRequest::new("DELETE", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, &request.bucket).await);
        }

        Ok(())
    }

    /// Check if a bucket exists (HEAD bucket).
    pub async fn head(&self, request: HeadBucketRequest) -> Result<HeadBucketOutput, S3Error> {
        let url = self.build_url(Some(&request.bucket), None)?;
        let headers = HashMap::new();

        let signed = self.signer.sign("HEAD", &url, &headers, None).await?;

        let http_request = HttpRequest::new("HEAD", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if response.status == 404 {
            return Err(S3Error::Bucket(BucketError::NotFound {
                bucket: request.bucket.clone(),
                request_id: response.request_id().map(String::from),
            }));
        }

        if !response.is_success() {
            return Err(self.parse_error(&response.body, &request.bucket).await);
        }

        Ok(HeadBucketOutput {
            bucket_region: response.get_header("x-amz-bucket-region").map(String::from),
            access_point_alias: response
                .get_header("x-amz-access-point-alias")
                .map(|v| v == "true"),
            request_id: response.request_id().map(String::from),
        })
    }

    /// List all buckets.
    pub async fn list(&self) -> Result<ListBucketsOutput, S3Error> {
        let url = self.build_url(None, None)?;
        let headers = HashMap::new();

        let signed = self.signer.sign("GET", &url, &headers, None).await?;

        let http_request = HttpRequest::new("GET", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, "").await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_list_buckets(&body_str)?;
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    /// Get the location (region) of a bucket.
    pub async fn get_location(&self, bucket: &str) -> Result<String, S3Error> {
        let url = self.build_url(Some(bucket), Some("location"))?;
        let headers = HashMap::new();

        let signed = self.signer.sign("GET", &url, &headers, None).await?;

        let http_request = HttpRequest::new("GET", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body, bucket).await);
        }

        // Parse location from response
        let body_str = String::from_utf8_lossy(&response.body);

        // The response is XML like: <LocationConstraint>region</LocationConstraint>
        // If empty, the bucket is in us-east-1
        if body_str.contains("<LocationConstraint/>") || body_str.contains("<LocationConstraint></LocationConstraint>") {
            return Ok("us-east-1".to_string());
        }

        // Extract region from XML
        if let Some(start) = body_str.find("<LocationConstraint>") {
            let start = start + 20; // Length of "<LocationConstraint>"
            if let Some(end) = body_str[start..].find("</LocationConstraint>") {
                return Ok(body_str[start..start + end].to_string());
            }
        }

        // Default to us-east-1 if we can't parse
        Ok("us-east-1".to_string())
    }

    /// Check if a bucket exists.
    pub async fn exists(&self, bucket: &str) -> Result<bool, S3Error> {
        match self.head(HeadBucketRequest::new(bucket)).await {
            Ok(_) => Ok(true),
            Err(S3Error::Bucket(BucketError::NotFound { .. })) => Ok(false),
            Err(e) => Err(e),
        }
    }

    fn build_url(&self, bucket: Option<&str>, query: Option<&str>) -> Result<Url, S3Error> {
        let endpoint = self.config.resolve_endpoint(bucket);

        let url_str = if let Some(bucket) = bucket {
            let path = self.config.build_path(bucket, None);
            if let Some(q) = query {
                format!("{}{}?{}", endpoint.as_str().trim_end_matches('/'), path, q)
            } else {
                format!("{}{}", endpoint.as_str().trim_end_matches('/'), path)
            }
        } else {
            endpoint.to_string()
        };

        Url::parse(&url_str).map_err(|e| {
            S3Error::Request(crate::error::RequestError::Validation {
                message: format!("Invalid URL: {}", e),
            })
        })
    }

    async fn parse_error(&self, body: &Bytes, bucket: &str) -> S3Error {
        if body.is_empty() {
            return S3Error::Response(crate::error::ResponseError::InvalidResponse {
                message: "Empty error response".to_string(),
            });
        }

        let body_str = String::from_utf8_lossy(body);
        match xml::parse_error_response(&body_str) {
            Ok(mut error_response) => {
                if error_response.bucket.is_none() && !bucket.is_empty() {
                    error_response.bucket = Some(bucket.to_string());
                }
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

impl std::fmt::Debug for BucketsService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BucketsService")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}
