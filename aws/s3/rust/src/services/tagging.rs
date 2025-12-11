//! Tagging service for S3 object tagging operations.

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

/// Service for S3 object tagging operations.
pub struct TaggingService {
    config: Arc<S3Config>,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
}

impl TaggingService {
    /// Create a new tagging service.
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

    /// Get object tagging.
    pub async fn get(
        &self,
        request: GetObjectTaggingRequest,
    ) -> Result<GetObjectTaggingOutput, S3Error> {
        let mut query = "tagging".to_string();
        if let Some(version_id) = &request.version_id {
            query = format!("{}&versionId={}", query, version_id);
        }

        let url = self.build_url(&request.bucket, Some(&request.key), Some(&query))?;
        let headers = HashMap::new();

        let signed = self.signer.sign("GET", &url, &headers, None).await?;

        let http_request = HttpRequest::new("GET", signed.url.as_str())
            .with_headers(signed.headers);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body).await);
        }

        let body_str = String::from_utf8_lossy(&response.body);
        let mut output = xml::parse_get_object_tagging(&body_str)?;
        output.version_id = response.get_header("x-amz-version-id").map(String::from);
        output.request_id = response.request_id().map(String::from);

        Ok(output)
    }

    /// Put object tagging.
    pub async fn put(
        &self,
        request: PutObjectTaggingRequest,
    ) -> Result<PutObjectTaggingOutput, S3Error> {
        let mut query = "tagging".to_string();
        if let Some(version_id) = &request.version_id {
            query = format!("{}&versionId={}", query, version_id);
        }

        let url = self.build_url(&request.bucket, Some(&request.key), Some(&query))?;

        let body = xml::build_put_tagging_xml(&request.tags);
        let body_bytes = Bytes::from(body);
        let content_md5 = base64::encode(md5::compute(&body_bytes).0);

        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/xml".to_string());
        headers.insert("content-md5".to_string(), content_md5);
        headers.insert("content-length".to_string(), body_bytes.len().to_string());

        let signed = self
            .signer
            .sign("PUT", &url, &headers, Some(&body_bytes))
            .await?;

        let http_request = HttpRequest::new("PUT", signed.url.as_str())
            .with_headers(signed.headers)
            .with_body(body_bytes);

        let response = self.transport.send(http_request).await?;

        if !response.is_success() {
            return Err(self.parse_error(&response.body).await);
        }

        Ok(PutObjectTaggingOutput {
            version_id: response.get_header("x-amz-version-id").map(String::from),
            request_id: response.request_id().map(String::from),
        })
    }

    /// Delete object tagging.
    pub async fn delete(&self, bucket: &str, key: &str, version_id: Option<&str>) -> Result<(), S3Error> {
        let mut query = "tagging".to_string();
        if let Some(vid) = version_id {
            query = format!("{}&versionId={}", query, vid);
        }

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

impl std::fmt::Debug for TaggingService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TaggingService")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}
