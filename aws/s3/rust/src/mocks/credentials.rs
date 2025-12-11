//! Mock credentials provider for testing.

use crate::credentials::{AwsCredentials, CredentialsProvider};
use crate::error::S3Error;
use async_trait::async_trait;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// Mock credentials provider for testing.
pub struct MockCredentialsProvider {
    credentials: Mutex<Option<AwsCredentials>>,
    error: Mutex<Option<S3Error>>,
    call_count: AtomicUsize,
}

impl MockCredentialsProvider {
    /// Create a mock credentials provider with static credentials.
    pub fn new() -> Self {
        Self {
            credentials: Mutex::new(Some(AwsCredentials::new(
                "AKIAIOSFODNN7EXAMPLE",
                "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            ))),
            error: Mutex::new(None),
            call_count: AtomicUsize::new(0),
        }
    }

    /// Create a mock credentials provider that returns an error.
    pub fn with_error(error: S3Error) -> Self {
        Self {
            credentials: Mutex::new(None),
            error: Mutex::new(Some(error)),
            call_count: AtomicUsize::new(0),
        }
    }

    /// Create a mock credentials provider with custom credentials.
    pub fn with_credentials(credentials: AwsCredentials) -> Self {
        Self {
            credentials: Mutex::new(Some(credentials)),
            error: Mutex::new(None),
            call_count: AtomicUsize::new(0),
        }
    }

    /// Create a mock credentials provider with session token.
    pub fn with_session_token() -> Self {
        Self {
            credentials: Mutex::new(Some(
                AwsCredentials::new(
                    "AKIAIOSFODNN7EXAMPLE",
                    "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                )
                .with_session_token("session-token-example"),
            )),
            error: Mutex::new(None),
            call_count: AtomicUsize::new(0),
        }
    }

    /// Set the credentials to return.
    pub fn set_credentials(&self, credentials: Option<AwsCredentials>) {
        *self.credentials.lock().unwrap() = credentials;
    }

    /// Set an error to return.
    pub fn set_error(&self, error: Option<S3Error>) {
        *self.error.lock().unwrap() = error;
    }

    /// Get the number of times credentials were requested.
    pub fn call_count(&self) -> usize {
        self.call_count.load(Ordering::Relaxed)
    }

    /// Reset the call count.
    pub fn reset_call_count(&self) {
        self.call_count.store(0, Ordering::Relaxed);
    }
}

impl Default for MockCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for MockCredentialsProvider {
    async fn credentials(&self) -> Result<AwsCredentials, S3Error> {
        self.call_count.fetch_add(1, Ordering::Relaxed);

        // Check for error first
        if let Some(error) = self.error.lock().unwrap().take() {
            return Err(error);
        }

        // Return credentials
        self.credentials
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| S3Error::Credentials(crate::error::CredentialsError::NotFound {
                message: "No credentials configured in mock".to_string(),
            }))
    }

    fn is_expired(&self) -> bool {
        false
    }
}

impl std::fmt::Debug for MockCredentialsProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockCredentialsProvider")
            .field("has_credentials", &self.credentials.lock().unwrap().is_some())
            .field("call_count", &self.call_count())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_credentials_default() {
        let provider = MockCredentialsProvider::new();
        let creds = provider.credentials().await.unwrap();

        assert_eq!(creds.access_key_id(), "AKIAIOSFODNN7EXAMPLE");
        assert!(creds.session_token().is_none());
        assert_eq!(provider.call_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_credentials_with_session() {
        let provider = MockCredentialsProvider::with_session_token();
        let creds = provider.credentials().await.unwrap();

        assert!(creds.session_token().is_some());
    }

    #[tokio::test]
    async fn test_mock_credentials_error() {
        let provider = MockCredentialsProvider::with_error(
            S3Error::Credentials(crate::error::CredentialsError::NotFound {
                message: "test error".to_string(),
            })
        );

        let result = provider.credentials().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_credentials_custom() {
        let custom_creds = AwsCredentials::new("CUSTOM_KEY", "CUSTOM_SECRET");
        let provider = MockCredentialsProvider::with_credentials(custom_creds);
        let creds = provider.credentials().await.unwrap();

        assert_eq!(creds.access_key_id(), "CUSTOM_KEY");
    }

    #[tokio::test]
    async fn test_mock_credentials_set_credentials() {
        let provider = MockCredentialsProvider::new();

        let new_creds = AwsCredentials::new("NEW_KEY", "NEW_SECRET");
        provider.set_credentials(Some(new_creds));

        let creds = provider.credentials().await.unwrap();
        assert_eq!(creds.access_key_id(), "NEW_KEY");
    }
}
