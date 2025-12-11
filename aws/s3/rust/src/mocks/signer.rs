//! Mock signer for testing.

use crate::error::S3Error;
use crate::signing::AwsSigner;
use crate::types::PresignedUrl;
use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use url::Url;

/// Signed request result.
#[derive(Debug, Clone)]
pub struct SignedRequest {
    /// The URL (possibly modified with query params).
    pub url: Url,
    /// Headers to include in the request.
    pub headers: HashMap<String, String>,
}

/// Mock signer for testing.
pub struct MockSigner {
    /// Headers to add when signing.
    headers: Mutex<HashMap<String, String>>,
    /// Error to return.
    error: Mutex<Option<S3Error>>,
    /// Number of sign calls.
    sign_count: AtomicUsize,
    /// Number of presign calls.
    presign_count: AtomicUsize,
    /// Recorded sign requests.
    sign_requests: Mutex<Vec<SignRequest>>,
}

/// Recorded sign request.
#[derive(Debug, Clone)]
pub struct SignRequest {
    pub method: String,
    pub url: Url,
    pub headers: HashMap<String, String>,
    pub has_body: bool,
}

impl MockSigner {
    /// Create a new mock signer.
    pub fn new() -> Self {
        let mut default_headers = HashMap::new();
        default_headers.insert(
            "authorization".to_string(),
            "AWS4-HMAC-SHA256 Credential=mock/signing".to_string(),
        );
        default_headers.insert(
            "x-amz-date".to_string(),
            "20240115T100000Z".to_string(),
        );
        default_headers.insert(
            "x-amz-content-sha256".to_string(),
            "UNSIGNED-PAYLOAD".to_string(),
        );

        Self {
            headers: Mutex::new(default_headers),
            error: Mutex::new(None),
            sign_count: AtomicUsize::new(0),
            presign_count: AtomicUsize::new(0),
            sign_requests: Mutex::new(Vec::new()),
        }
    }

    /// Create a mock signer that returns an error.
    pub fn with_error(error: S3Error) -> Self {
        Self {
            headers: Mutex::new(HashMap::new()),
            error: Mutex::new(Some(error)),
            sign_count: AtomicUsize::new(0),
            presign_count: AtomicUsize::new(0),
            sign_requests: Mutex::new(Vec::new()),
        }
    }

    /// Set custom headers to add when signing.
    pub fn set_headers(&self, headers: HashMap<String, String>) {
        *self.headers.lock().unwrap() = headers;
    }

    /// Set an error to return.
    pub fn set_error(&self, error: Option<S3Error>) {
        *self.error.lock().unwrap() = error;
    }

    /// Get the number of sign calls.
    pub fn sign_count(&self) -> usize {
        self.sign_count.load(Ordering::Relaxed)
    }

    /// Get the number of presign calls.
    pub fn presign_count(&self) -> usize {
        self.presign_count.load(Ordering::Relaxed)
    }

    /// Get recorded sign requests.
    pub fn sign_requests(&self) -> Vec<SignRequest> {
        self.sign_requests.lock().unwrap().clone()
    }

    /// Get the last sign request.
    pub fn last_sign_request(&self) -> Option<SignRequest> {
        self.sign_requests.lock().unwrap().last().cloned()
    }

    /// Clear recorded requests.
    pub fn clear_requests(&self) {
        self.sign_requests.lock().unwrap().clear();
        self.sign_count.store(0, Ordering::Relaxed);
        self.presign_count.store(0, Ordering::Relaxed);
    }
}

impl Default for MockSigner {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AwsSigner for MockSigner {
    async fn sign(
        &self,
        method: &str,
        url: &Url,
        headers: &HashMap<String, String>,
        body: Option<&Bytes>,
    ) -> Result<SignedRequest, S3Error> {
        self.sign_count.fetch_add(1, Ordering::Relaxed);

        // Record the request
        self.sign_requests.lock().unwrap().push(SignRequest {
            method: method.to_string(),
            url: url.clone(),
            headers: headers.clone(),
            has_body: body.is_some(),
        });

        // Check for error
        if let Some(error) = self.error.lock().unwrap().take() {
            return Err(error);
        }

        // Return signed request with mock headers
        let mut signed_headers = headers.clone();
        signed_headers.extend(self.headers.lock().unwrap().clone());

        Ok(SignedRequest {
            url: url.clone(),
            headers: signed_headers,
        })
    }

    async fn presign(
        &self,
        method: &str,
        url: &Url,
        expires_in: Duration,
        additional_headers: Option<&HashMap<String, String>>,
    ) -> Result<PresignedUrl, S3Error> {
        self.presign_count.fetch_add(1, Ordering::Relaxed);

        // Check for error
        if let Some(error) = self.error.lock().unwrap().take() {
            return Err(error);
        }

        // Build a mock presigned URL
        let mut presigned = url.clone();
        presigned
            .query_pairs_mut()
            .append_pair("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
            .append_pair("X-Amz-Credential", "MOCK/20240115/us-east-1/s3/aws4_request")
            .append_pair("X-Amz-Date", "20240115T100000Z")
            .append_pair("X-Amz-Expires", &expires_in.as_secs().to_string())
            .append_pair("X-Amz-SignedHeaders", "host")
            .append_pair("X-Amz-Signature", "mock-signature");

        Ok(PresignedUrl {
            url: presigned,
            method: method.to_string(),
            expires_at: chrono::Utc::now() + chrono::Duration::from_std(expires_in).unwrap_or_default(),
            signed_headers: additional_headers.cloned().unwrap_or_default(),
        })
    }
}

impl std::fmt::Debug for MockSigner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockSigner")
            .field("sign_count", &self.sign_count())
            .field("presign_count", &self.presign_count())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_signer_sign() {
        let signer = MockSigner::new();
        let url = Url::parse("https://bucket.s3.amazonaws.com/key").unwrap();
        let headers = HashMap::new();

        let result = signer.sign("GET", &url, &headers, None).await.unwrap();

        assert!(result.headers.contains_key("authorization"));
        assert!(result.headers.contains_key("x-amz-date"));
        assert_eq!(signer.sign_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_signer_presign() {
        let signer = MockSigner::new();
        let url = Url::parse("https://bucket.s3.amazonaws.com/key").unwrap();

        let result = signer
            .presign("GET", &url, Duration::from_secs(3600), None)
            .await
            .unwrap();

        assert!(result.url.query().unwrap().contains("X-Amz-Algorithm"));
        assert!(result.url.query().unwrap().contains("X-Amz-Signature"));
        assert_eq!(signer.presign_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_signer_error() {
        let signer = MockSigner::with_error(S3Error::Signing(crate::error::SigningError::CredentialsNotAvailable {
            message: "test error".to_string(),
        }));
        let url = Url::parse("https://bucket.s3.amazonaws.com/key").unwrap();
        let headers = HashMap::new();

        let result = signer.sign("GET", &url, &headers, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_signer_records_requests() {
        let signer = MockSigner::new();
        let url = Url::parse("https://bucket.s3.amazonaws.com/key").unwrap();
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "text/plain".to_string());

        signer.sign("PUT", &url, &headers, Some(&Bytes::from("body"))).await.unwrap();

        let recorded = signer.last_sign_request().unwrap();
        assert_eq!(recorded.method, "PUT");
        assert_eq!(recorded.url.as_str(), "https://bucket.s3.amazonaws.com/key");
        assert!(recorded.has_body);
        assert_eq!(recorded.headers.get("content-type"), Some(&"text/plain".to_string()));
    }
}
