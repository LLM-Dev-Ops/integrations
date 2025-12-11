//! AWS credentials management.
//!
//! This module provides credential types and providers for AWS authentication.
//! It supports multiple credential sources including environment variables,
//! profile files, and the EC2 instance metadata service (IMDS).

mod chain;
mod env;
mod profile;

pub use chain::ChainCredentialsProvider;
pub use env::EnvCredentialsProvider;
pub use profile::ProfileCredentialsProvider;

use crate::error::{CredentialsError, S3Error};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use secrecy::{ExposeSecret, SecretString};
use std::fmt;

/// AWS credentials.
#[derive(Clone)]
pub struct AwsCredentials {
    access_key_id: String,
    secret_access_key: SecretString,
    session_token: Option<SecretString>,
    expiration: Option<DateTime<Utc>>,
}

impl AwsCredentials {
    /// Create new long-term credentials.
    pub fn new(access_key_id: impl Into<String>, secret_access_key: impl Into<String>) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: SecretString::new(secret_access_key.into()),
            session_token: None,
            expiration: None,
        }
    }

    /// Create new temporary credentials with a session token.
    pub fn with_session_token(
        access_key_id: impl Into<String>,
        secret_access_key: impl Into<String>,
        session_token: impl Into<String>,
    ) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: SecretString::new(secret_access_key.into()),
            session_token: Some(SecretString::new(session_token.into())),
            expiration: None,
        }
    }

    /// Create temporary credentials with expiration.
    pub fn temporary(
        access_key_id: impl Into<String>,
        secret_access_key: impl Into<String>,
        session_token: impl Into<String>,
        expiration: DateTime<Utc>,
    ) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: SecretString::new(secret_access_key.into()),
            session_token: Some(SecretString::new(session_token.into())),
            expiration: Some(expiration),
        }
    }

    /// Get the access key ID.
    pub fn access_key_id(&self) -> &str {
        &self.access_key_id
    }

    /// Get the secret access key.
    ///
    /// Note: This exposes the secret. Use carefully and avoid logging.
    pub fn secret_access_key(&self) -> &str {
        self.secret_access_key.expose_secret()
    }

    /// Get the session token, if any.
    pub fn session_token(&self) -> Option<&str> {
        self.session_token.as_ref().map(|s| s.expose_secret().as_str())
    }

    /// Get the expiration time, if any.
    pub fn expiration(&self) -> Option<&DateTime<Utc>> {
        self.expiration.as_ref()
    }

    /// Check if credentials have expired.
    pub fn is_expired(&self) -> bool {
        match &self.expiration {
            Some(exp) => Utc::now() >= *exp,
            None => false,
        }
    }

    /// Check if credentials will expire within the given duration.
    pub fn will_expire_within(&self, duration: chrono::Duration) -> bool {
        match &self.expiration {
            Some(exp) => Utc::now() + duration >= *exp,
            None => false,
        }
    }

    /// Check if credentials are temporary (have a session token).
    pub fn is_temporary(&self) -> bool {
        self.session_token.is_some()
    }
}

impl fmt::Debug for AwsCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AwsCredentials")
            .field("access_key_id", &self.access_key_id)
            .field("secret_access_key", &"[REDACTED]")
            .field(
                "session_token",
                &self.session_token.as_ref().map(|_| "[REDACTED]"),
            )
            .field("expiration", &self.expiration)
            .finish()
    }
}

/// Trait for credential providers.
#[async_trait]
pub trait CredentialsProvider: Send + Sync {
    /// Get credentials from this provider.
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error>;

    /// Refresh credentials if possible.
    ///
    /// Default implementation returns current credentials.
    async fn refresh_credentials(&self) -> Result<AwsCredentials, S3Error> {
        self.get_credentials().await
    }

    /// Provider name for logging/debugging.
    fn name(&self) -> &'static str;
}

/// Static credentials provider for testing or explicit configuration.
pub struct StaticCredentialsProvider {
    credentials: AwsCredentials,
}

impl StaticCredentialsProvider {
    /// Create a new static credentials provider.
    pub fn new(credentials: AwsCredentials) -> Self {
        Self { credentials }
    }
}

#[async_trait]
impl CredentialsProvider for StaticCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
        if self.credentials.is_expired() {
            return Err(S3Error::Credentials(CredentialsError::Expired {
                expiration: self
                    .credentials
                    .expiration()
                    .map(|e| e.to_rfc3339())
                    .unwrap_or_default(),
            }));
        }
        Ok(self.credentials.clone())
    }

    fn name(&self) -> &'static str {
        "static"
    }
}

impl fmt::Debug for StaticCredentialsProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StaticCredentialsProvider")
            .field("credentials", &self.credentials)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credentials_new() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        assert_eq!(creds.access_key_id(), "AKID");
        assert_eq!(creds.secret_access_key(), "SECRET");
        assert!(creds.session_token().is_none());
        assert!(!creds.is_temporary());
    }

    #[test]
    fn test_credentials_with_session_token() {
        let creds = AwsCredentials::with_session_token("AKID", "SECRET", "TOKEN");
        assert_eq!(creds.session_token(), Some("TOKEN"));
        assert!(creds.is_temporary());
    }

    #[test]
    fn test_credentials_expiration() {
        use chrono::Duration;

        // Non-expiring credentials
        let creds = AwsCredentials::new("AKID", "SECRET");
        assert!(!creds.is_expired());
        assert!(!creds.will_expire_within(Duration::hours(1)));

        // Expired credentials
        let expired = AwsCredentials::temporary(
            "AKID",
            "SECRET",
            "TOKEN",
            Utc::now() - Duration::hours(1),
        );
        assert!(expired.is_expired());

        // Soon-to-expire credentials
        let expiring = AwsCredentials::temporary(
            "AKID",
            "SECRET",
            "TOKEN",
            Utc::now() + Duration::minutes(5),
        );
        assert!(!expiring.is_expired());
        assert!(expiring.will_expire_within(Duration::minutes(10)));
    }

    #[test]
    fn test_credentials_debug_redacts_secrets() {
        let creds = AwsCredentials::with_session_token("AKID", "SECRET", "TOKEN");
        let debug = format!("{:?}", creds);

        assert!(debug.contains("AKID"));
        assert!(!debug.contains("SECRET"));
        assert!(!debug.contains("TOKEN"));
        assert!(debug.contains("[REDACTED]"));
    }

    #[tokio::test]
    async fn test_static_provider() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialsProvider::new(creds);

        let result = provider.get_credentials().await;
        assert!(result.is_ok());

        let retrieved = result.unwrap();
        assert_eq!(retrieved.access_key_id(), "AKID");
    }

    #[tokio::test]
    async fn test_static_provider_expired() {
        use chrono::Duration;

        let expired = AwsCredentials::temporary(
            "AKID",
            "SECRET",
            "TOKEN",
            Utc::now() - Duration::hours(1),
        );
        let provider = StaticCredentialsProvider::new(expired);

        let result = provider.get_credentials().await;
        assert!(result.is_err());
    }
}
