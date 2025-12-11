//! Presign service for generating presigned URLs.

use crate::config::S3Config;
use crate::error::S3Error;
use crate::signing::AwsSigner;
use crate::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// Service for generating presigned URLs.
pub struct PresignService {
    config: Arc<S3Config>,
    signer: Arc<dyn AwsSigner>,
}

impl PresignService {
    /// Create a new presign service.
    pub fn new(config: Arc<S3Config>, signer: Arc<dyn AwsSigner>) -> Self {
        Self { config, signer }
    }

    /// Generate a presigned URL for GET (download).
    pub async fn presign_get(
        &self,
        request: PresignGetRequest,
    ) -> Result<PresignedUrl, S3Error> {
        let mut query_params = Vec::new();

        if let Some(version_id) = &request.version_id {
            query_params.push(format!("versionId={}", version_id));
        }
        if let Some(content_type) = &request.response_content_type {
            query_params.push(format!("response-content-type={}", content_type));
        }
        if let Some(disposition) = &request.response_content_disposition {
            query_params.push(format!("response-content-disposition={}", disposition));
        }

        let query = if query_params.is_empty() {
            None
        } else {
            Some(query_params.join("&"))
        };

        let url = self.build_url(&request.bucket, Some(&request.key), query.as_deref())?;

        self.signer.presign("GET", &url, request.expires_in, None).await
    }

    /// Generate a presigned URL for PUT (upload).
    pub async fn presign_put(
        &self,
        request: PresignPutRequest,
    ) -> Result<PresignedUrl, S3Error> {
        let url = self.build_url(&request.bucket, Some(&request.key), None)?;

        let mut headers = HashMap::new();

        if let Some(content_type) = &request.content_type {
            headers.insert("content-type".to_string(), content_type.clone());
        }
        if let Some(content_length) = request.content_length {
            headers.insert("content-length".to_string(), content_length.to_string());
        }
        if let Some(storage_class) = &request.storage_class {
            headers.insert(
                "x-amz-storage-class".to_string(),
                storage_class.as_str().to_string(),
            );
        }

        let additional_headers = if headers.is_empty() {
            None
        } else {
            Some(&headers)
        };

        self.signer
            .presign("PUT", &url, request.expires_in, additional_headers)
            .await
    }

    /// Generate a presigned URL for DELETE.
    pub async fn presign_delete(
        &self,
        request: PresignDeleteRequest,
    ) -> Result<PresignedUrl, S3Error> {
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

        self.signer.presign("DELETE", &url, request.expires_in, None).await
    }

    /// Generate a presigned URL for HEAD (metadata).
    pub async fn presign_head(
        &self,
        bucket: &str,
        key: &str,
        expires_in: Duration,
    ) -> Result<PresignedUrl, S3Error> {
        let url = self.build_url(bucket, Some(key), None)?;
        self.signer.presign("HEAD", &url, expires_in, None).await
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
}

impl std::fmt::Debug for PresignService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PresignService")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}
