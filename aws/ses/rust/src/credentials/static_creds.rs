//! Static credentials provider for testing and explicit configuration.

use super::{AwsCredentials, CredentialProvider};
use crate::credentials::error::CredentialError;
use async_trait::async_trait;
use std::fmt;

/// Static credentials provider that returns a fixed set of credentials.
///
/// This provider is useful for:
/// - Testing and development
/// - Explicit credential injection
/// - Applications with hard-coded credentials (not recommended for production)
///
/// # Example
///
/// ```no_run
/// use aws_ses_rust::credentials::{AwsCredentials, StaticCredentialProvider};
///
/// let credentials = AwsCredentials::new("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
/// let provider = StaticCredentialProvider::new(credentials);
/// ```
#[derive(Clone)]
pub struct StaticCredentialProvider {
    credentials: AwsCredentials,
}

impl StaticCredentialProvider {
    /// Create a new static credentials provider.
    ///
    /// # Arguments
    ///
    /// * `credentials` - The credentials to return
    pub fn new(credentials: AwsCredentials) -> Self {
        Self { credentials }
    }
}

#[async_trait]
impl CredentialProvider for StaticCredentialProvider {
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        if self.credentials.is_expired() {
            return Err(CredentialError::Expired);
        }
        Ok(self.credentials.clone())
    }

    fn is_expired(&self) -> bool {
        self.credentials.is_expired()
    }
}

impl fmt::Debug for StaticCredentialProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StaticCredentialProvider")
            .field("credentials", &self.credentials)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_static_provider_returns_credentials() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);

        let result = provider.credentials().await;
        assert!(result.is_ok());

        let retrieved = result.unwrap();
        assert_eq!(retrieved.access_key_id(), "AKID");
        assert_eq!(retrieved.secret_access_key(), "SECRET");
    }

    #[tokio::test]
    async fn test_static_provider_expired_credentials() {
        use chrono::{Duration, Utc};

        let expired = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() - Duration::hours(1));
        let provider = StaticCredentialProvider::new(expired);

        let result = provider.credentials().await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CredentialError::Expired));
    }

    #[tokio::test]
    async fn test_static_provider_with_session_token() {
        let creds = AwsCredentials::new("AKID", "SECRET")
            .with_session_token("TOKEN");
        let provider = StaticCredentialProvider::new(creds);

        let result = provider.credentials().await;
        assert!(result.is_ok());

        let retrieved = result.unwrap();
        assert_eq!(retrieved.session_token(), Some("TOKEN"));
    }

    #[test]
    fn test_is_expired() {
        use chrono::{Duration, Utc};

        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);
        assert!(!provider.is_expired());

        let expired = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() - Duration::hours(1));
        let provider = StaticCredentialProvider::new(expired);
        assert!(provider.is_expired());
    }
}
