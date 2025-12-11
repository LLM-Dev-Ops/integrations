//! AWS Signature V4 signer implementation.

use super::*;
use crate::credentials::{AwsCredentials, CredentialsProvider};
use crate::error::{S3Error, SigningError};
use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use url::Url;

/// A signed request ready to be sent.
#[derive(Debug, Clone)]
pub struct SignedRequest {
    /// HTTP method.
    pub method: String,
    /// Full URL including query string.
    pub url: Url,
    /// Headers to include.
    pub headers: HashMap<String, String>,
    /// Request body (if any).
    pub body: Option<bytes::Bytes>,
}

/// Trait for AWS request signers.
#[async_trait]
pub trait AwsSigner: Send + Sync {
    /// Sign a request with AWS Signature V4.
    async fn sign(
        &self,
        method: &str,
        url: &Url,
        headers: &HashMap<String, String>,
        body: Option<&[u8]>,
    ) -> Result<SignedRequest, S3Error>;

    /// Create a presigned URL.
    async fn presign(
        &self,
        method: &str,
        url: &Url,
        expires_in: std::time::Duration,
        headers: Option<&HashMap<String, String>>,
    ) -> Result<crate::types::PresignedUrl, S3Error>;
}

/// AWS Signature V4 signer implementation.
pub struct AwsSignerV4 {
    credentials_provider: Arc<dyn CredentialsProvider>,
    region: String,
    service: String,
}

impl AwsSignerV4 {
    /// Create a new signer.
    pub fn new(
        credentials_provider: Arc<dyn CredentialsProvider>,
        region: impl Into<String>,
    ) -> Self {
        Self {
            credentials_provider,
            region: region.into(),
            service: S3_SERVICE.to_string(),
        }
    }

    /// Create a new signer with a specific service name.
    pub fn with_service(
        credentials_provider: Arc<dyn CredentialsProvider>,
        region: impl Into<String>,
        service: impl Into<String>,
    ) -> Self {
        Self {
            credentials_provider,
            region: region.into(),
            service: service.into(),
        }
    }

    /// Get credentials from the provider.
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
        self.credentials_provider.get_credentials().await
    }

    /// Build headers for signing.
    fn build_signing_headers(
        &self,
        url: &Url,
        original_headers: &HashMap<String, String>,
        timestamp: &DateTime<Utc>,
        payload_hash: &str,
    ) -> Vec<(String, String)> {
        let mut headers: Vec<(String, String)> = Vec::new();

        // Add host header
        let host = url.host_str().unwrap_or_default();
        let host_value = if let Some(port) = url.port() {
            format!("{}:{}", host, port)
        } else {
            host.to_string()
        };
        headers.push(("host".to_string(), host_value));

        // Add x-amz-date
        headers.push(("x-amz-date".to_string(), format_datetime(timestamp)));

        // Add x-amz-content-sha256
        headers.push(("x-amz-content-sha256".to_string(), payload_hash.to_string()));

        // Add original headers
        for (name, value) in original_headers {
            let name_lower = name.to_lowercase();
            if name_lower != "host"
                && name_lower != "x-amz-date"
                && name_lower != "x-amz-content-sha256"
            {
                headers.push((name.clone(), value.clone()));
            }
        }

        headers
    }

    /// Calculate the payload hash.
    fn calculate_payload_hash(&self, body: Option<&[u8]>) -> String {
        match body {
            Some(data) => sha256_hex(data),
            None => sha256_hex(b""),
        }
    }
}

#[async_trait]
impl AwsSigner for AwsSignerV4 {
    async fn sign(
        &self,
        method: &str,
        url: &Url,
        headers: &HashMap<String, String>,
        body: Option<&[u8]>,
    ) -> Result<SignedRequest, S3Error> {
        let credentials = self.get_credentials().await?;
        let timestamp = Utc::now();

        // Calculate payload hash
        let payload_hash = self.calculate_payload_hash(body);

        // Build headers for signing
        let signing_headers = self.build_signing_headers(url, headers, &timestamp, &payload_hash);

        // Get the path and query string
        let path = url.path();
        let query = url.query().unwrap_or("");

        // Sign the request
        let authorization = sign_request(
            method,
            path,
            query,
            &signing_headers,
            &payload_hash,
            &credentials,
            &self.region,
            &timestamp,
        )?;

        // Build final headers
        let mut final_headers: HashMap<String, String> = HashMap::new();

        // Add original headers
        for (name, value) in headers {
            final_headers.insert(name.clone(), value.clone());
        }

        // Add signing headers
        for (name, value) in &signing_headers {
            let name_lower = name.to_lowercase();
            if name_lower == "host"
                || name_lower == "x-amz-date"
                || name_lower == "x-amz-content-sha256"
            {
                final_headers.insert(name.clone(), value.clone());
            }
        }

        // Add authorization header
        final_headers.insert("authorization".to_string(), authorization);

        // Add session token if present
        if let Some(token) = credentials.session_token() {
            final_headers.insert("x-amz-security-token".to_string(), token.to_string());
        }

        Ok(SignedRequest {
            method: method.to_string(),
            url: url.clone(),
            headers: final_headers,
            body: body.map(|b| bytes::Bytes::copy_from_slice(b)),
        })
    }

    async fn presign(
        &self,
        method: &str,
        url: &Url,
        expires_in: std::time::Duration,
        additional_headers: Option<&HashMap<String, String>>,
    ) -> Result<crate::types::PresignedUrl, S3Error> {
        const MAX_EXPIRATION: u64 = 7 * 24 * 60 * 60; // 7 days in seconds

        let expires_seconds = expires_in.as_secs();
        if expires_seconds > MAX_EXPIRATION {
            return Err(S3Error::Signing(SigningError::InvalidTimestamp {
                message: format!(
                    "Presigned URL expiration exceeds maximum of {} seconds",
                    MAX_EXPIRATION
                ),
            }));
        }

        let credentials = self.get_credentials().await?;
        let timestamp = Utc::now();
        let date_stamp = format_date_stamp(&timestamp);
        let amz_date = format_datetime(&timestamp);

        // Build credential scope
        let credential_scope = build_credential_scope(&date_stamp, &self.region, &self.service);
        let credential_string = build_credential_string(credentials.access_key_id(), &credential_scope);

        // Build headers to sign
        let mut headers_to_sign: Vec<(String, String)> = Vec::new();

        // Always sign host
        let host = url.host_str().unwrap_or_default();
        let host_value = if let Some(port) = url.port() {
            format!("{}:{}", host, port)
        } else {
            host.to_string()
        };
        headers_to_sign.push(("host".to_string(), host_value.clone()));

        // Add any additional headers
        if let Some(additional) = additional_headers {
            for (name, value) in additional {
                let name_lower = name.to_lowercase();
                if name_lower != "host" {
                    headers_to_sign.push((name.clone(), value.clone()));
                }
            }
        }

        let signed_headers = canonical::build_signed_headers(&headers_to_sign);

        // Build query parameters for presigned URL
        let mut query_params: Vec<(String, String)> = Vec::new();

        // Add existing query parameters
        if let Some(query) = url.query() {
            for pair in query.split('&') {
                if !pair.is_empty() {
                    let mut parts = pair.splitn(2, '=');
                    let key = parts.next().unwrap_or("");
                    let value = parts.next().unwrap_or("");
                    query_params.push((key.to_string(), value.to_string()));
                }
            }
        }

        // Add AWS signature query parameters
        query_params.push(("X-Amz-Algorithm".to_string(), AWS_ALGORITHM.to_string()));
        query_params.push(("X-Amz-Credential".to_string(), credential_string));
        query_params.push(("X-Amz-Date".to_string(), amz_date.clone()));
        query_params.push(("X-Amz-Expires".to_string(), expires_seconds.to_string()));
        query_params.push(("X-Amz-SignedHeaders".to_string(), signed_headers.clone()));

        // Add session token if present
        if let Some(token) = credentials.session_token() {
            query_params.push(("X-Amz-Security-Token".to_string(), token.to_string()));
        }

        // Sort and build canonical query string
        query_params.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        let canonical_query = query_params
            .iter()
            .map(|(k, v)| {
                format!(
                    "{}={}",
                    canonical::uri_encode_query(k),
                    canonical::uri_encode_query(v)
                )
            })
            .collect::<Vec<_>>()
            .join("&");

        // Build canonical request (with UNSIGNED-PAYLOAD for presigned URLs)
        let path = url.path();
        let canonical_request = canonical::build_canonical_request(
            method,
            path,
            &canonical_query,
            &headers_to_sign,
            UNSIGNED_PAYLOAD,
        );

        // Calculate hash of canonical request
        let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

        // Build string to sign
        let string_to_sign = format!(
            "{}\n{}\n{}\n{}",
            AWS_ALGORITHM, amz_date, credential_scope, canonical_request_hash
        );

        // Derive signing key and calculate signature
        let signing_key = derive_signing_key(
            credentials.secret_access_key(),
            &date_stamp,
            &self.region,
            &self.service,
        );
        let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

        // Build final URL with signature
        query_params.push(("X-Amz-Signature".to_string(), signature));

        // Build the final URL
        let mut presigned_url = url.clone();
        let final_query = query_params
            .iter()
            .map(|(k, v)| {
                format!(
                    "{}={}",
                    canonical::uri_encode_query(k),
                    canonical::uri_encode_query(v)
                )
            })
            .collect::<Vec<_>>()
            .join("&");
        presigned_url.set_query(Some(&final_query));

        // Calculate expiration time
        let expires_at = timestamp + Duration::seconds(expires_seconds as i64);

        // Build signed headers map
        let mut signed_headers_map = HashMap::new();
        signed_headers_map.insert("host".to_string(), host_value);
        if let Some(additional) = additional_headers {
            for (name, value) in additional {
                signed_headers_map.insert(name.clone(), value.clone());
            }
        }

        Ok(crate::types::PresignedUrl {
            url: presigned_url.to_string(),
            method: method.to_string(),
            expires_at,
            signed_headers: signed_headers_map,
        })
    }
}

impl std::fmt::Debug for AwsSignerV4 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AwsSignerV4")
            .field("region", &self.region)
            .field("service", &self.service)
            // Don't expose credentials provider details
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::StaticCredentialsProvider;

    fn create_test_signer() -> AwsSignerV4 {
        let provider = Arc::new(StaticCredentialsProvider::new(AwsCredentials::new(
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        )));
        AwsSignerV4::new(provider, "us-east-1")
    }

    #[tokio::test]
    async fn test_sign_simple_get() {
        let signer = create_test_signer();
        let url = Url::parse("https://examplebucket.s3.amazonaws.com/test.txt").unwrap();
        let headers = HashMap::new();

        let result = signer.sign("GET", &url, &headers, None).await;
        assert!(result.is_ok());

        let signed = result.unwrap();
        assert_eq!(signed.method, "GET");
        assert!(signed.headers.contains_key("authorization"));
        assert!(signed.headers.contains_key("x-amz-date"));
        assert!(signed.headers.contains_key("x-amz-content-sha256"));
    }

    #[tokio::test]
    async fn test_sign_put_with_body() {
        let signer = create_test_signer();
        let url = Url::parse("https://examplebucket.s3.amazonaws.com/test.txt").unwrap();
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "text/plain".to_string());
        let body = b"Hello, World!";

        let result = signer.sign("PUT", &url, &headers, Some(body)).await;
        assert!(result.is_ok());

        let signed = result.unwrap();
        assert_eq!(signed.method, "PUT");
        assert!(signed.headers.contains_key("authorization"));
        assert!(signed.body.is_some());
    }

    #[tokio::test]
    async fn test_presign_get() {
        let signer = create_test_signer();
        let url = Url::parse("https://examplebucket.s3.amazonaws.com/test.txt").unwrap();

        let result = signer
            .presign("GET", &url, std::time::Duration::from_secs(3600), None)
            .await;
        assert!(result.is_ok());

        let presigned = result.unwrap();
        assert!(presigned.url.contains("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
        assert!(presigned.url.contains("X-Amz-Credential="));
        assert!(presigned.url.contains("X-Amz-Expires=3600"));
        assert!(presigned.url.contains("X-Amz-Signature="));
        assert!(!presigned.is_expired());
    }

    #[tokio::test]
    async fn test_presign_exceeds_max_expiration() {
        let signer = create_test_signer();
        let url = Url::parse("https://examplebucket.s3.amazonaws.com/test.txt").unwrap();

        // 8 days exceeds the 7-day maximum
        let result = signer
            .presign(
                "GET",
                &url,
                std::time::Duration::from_secs(8 * 24 * 60 * 60),
                None,
            )
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_sign_with_session_token() {
        let credentials = AwsCredentials::with_session_token(
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "AQoDYXdzEJr...",
        );
        let provider = Arc::new(StaticCredentialsProvider::new(credentials));
        let signer = AwsSignerV4::new(provider, "us-east-1");

        let url = Url::parse("https://examplebucket.s3.amazonaws.com/test.txt").unwrap();
        let headers = HashMap::new();

        let result = signer.sign("GET", &url, &headers, None).await;
        assert!(result.is_ok());

        let signed = result.unwrap();
        assert!(signed.headers.contains_key("x-amz-security-token"));
    }
}
