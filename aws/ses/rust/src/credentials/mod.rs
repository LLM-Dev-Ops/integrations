//! AWS credentials management for SES.
//!
//! This module provides a flexible credential provider system following the hexagonal
//! architecture pattern with well-defined ports (traits) and adapters (implementations).
//!
//! # Architecture
//!
//! - **Port**: `CredentialProvider` trait defines the interface for credential retrieval
//! - **Adapters**: Multiple implementations supporting different credential sources:
//!   - `StaticCredentialProvider`: Fixed credentials for testing/development
//!   - `EnvironmentCredentialProvider`: Load from environment variables
//!   - `ProfileCredentialProvider`: Load from AWS profile files
//!   - `IMDSCredentialProvider`: Load from EC2 Instance Metadata Service
//!   - `ChainCredentialProvider`: Chain multiple providers with fallback
//!   - `CachedCredentialProvider`: Add caching to any provider
//!
//! # Credential Chain
//!
//! The `DefaultCredentialProvider` implements the standard AWS credential chain:
//! 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
//! 2. AWS profile files (~/.aws/credentials, ~/.aws/config)
//! 3. EC2 Instance Metadata Service (IMDS)
//!
//! # Example
//!
//! ```no_run
//! use integrations_aws_ses::credentials::{
//!     AwsCredentials, CredentialProvider, DefaultCredentialProvider
//! };
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Use default credential chain
//! let provider = DefaultCredentialProvider::new();
//! let credentials = provider.credentials().await?;
//!
//! println!("Access Key: {}", credentials.access_key_id());
//! # Ok(())
//! # }
//! ```

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use secrecy::{ExposeSecret, SecretString};
use std::fmt;
use zeroize::Zeroize;

pub mod cache;
pub mod chain;
pub mod env;
pub mod error;
pub mod imds;
pub mod profile;
pub mod static_creds;

pub use cache::CachedCredentialProvider;
pub use chain::ChainCredentialProvider;
pub use env::EnvironmentCredentialProvider;
pub use error::CredentialError;
pub use imds::IMDSCredentialProvider;
pub use profile::ProfileCredentialProvider;
pub use static_creds::StaticCredentialProvider;

/// AWS credentials containing access keys and optional session token.
///
/// The secret access key is stored using `SecretString` to ensure it's not
/// accidentally logged or exposed, and is zeroized on drop.
///
/// # Security
///
/// - Secret access key is wrapped in `SecretString` for protection
/// - Credentials are zeroized on drop to prevent memory leaks
/// - Debug implementation redacts sensitive information
///
/// # Example
///
/// ```
/// use integrations_aws_ses::credentials::AwsCredentials;
///
/// let credentials = AwsCredentials::new(
///     "AKIAIOSFODNN7EXAMPLE",
///     "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
/// );
///
/// assert_eq!(credentials.access_key_id(), "AKIAIOSFODNN7EXAMPLE");
/// ```
#[derive(Clone, Zeroize)]
#[zeroize(drop)]
pub struct AwsCredentials {
    /// AWS access key ID.
    access_key_id: String,

    /// AWS secret access key (protected).
    secret_access_key: SecretString,

    /// Optional session token for temporary credentials.
    session_token: Option<String>,

    /// Optional expiration time for temporary credentials.
    expiration: Option<DateTime<Utc>>,
}

impl AwsCredentials {
    /// Create new AWS credentials.
    ///
    /// # Arguments
    ///
    /// * `access_key_id` - The AWS access key ID
    /// * `secret_access_key` - The AWS secret access key
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::AwsCredentials;
    ///
    /// let credentials = AwsCredentials::new(
    ///     "AKIAIOSFODNN7EXAMPLE",
    ///     "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    /// );
    /// ```
    pub fn new(
        access_key_id: impl Into<String>,
        secret_access_key: impl Into<String>,
    ) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: SecretString::new(secret_access_key.into()),
            session_token: None,
            expiration: None,
        }
    }

    /// Add a session token to the credentials.
    ///
    /// # Arguments
    ///
    /// * `token` - The session token
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::AwsCredentials;
    ///
    /// let credentials = AwsCredentials::new("AKID", "SECRET")
    ///     .with_session_token("TOKEN");
    /// ```
    pub fn with_session_token(mut self, token: impl Into<String>) -> Self {
        self.session_token = Some(token.into());
        self
    }

    /// Add an expiration time to the credentials.
    ///
    /// # Arguments
    ///
    /// * `expiration` - The expiration timestamp
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::AwsCredentials;
    /// use chrono::{Duration, Utc};
    ///
    /// let credentials = AwsCredentials::new("AKID", "SECRET")
    ///     .with_expiration(Utc::now() + Duration::hours(1));
    /// ```
    pub fn with_expiration(mut self, expiration: DateTime<Utc>) -> Self {
        self.expiration = Some(expiration);
        self
    }

    /// Get the access key ID.
    ///
    /// # Returns
    ///
    /// A reference to the access key ID string.
    pub fn access_key_id(&self) -> &str {
        &self.access_key_id
    }

    /// Get the secret access key.
    ///
    /// # Returns
    ///
    /// The secret access key as a string slice.
    ///
    /// # Security
    ///
    /// This exposes the secret. Use with caution and ensure the value
    /// is not logged or persisted in plaintext.
    pub fn secret_access_key(&self) -> &str {
        self.secret_access_key.expose_secret()
    }

    /// Get the session token if present.
    ///
    /// # Returns
    ///
    /// An optional reference to the session token.
    pub fn session_token(&self) -> Option<&str> {
        self.session_token.as_deref()
    }

    /// Get the expiration time if present.
    ///
    /// # Returns
    ///
    /// An optional reference to the expiration timestamp.
    pub fn expiration(&self) -> Option<&DateTime<Utc>> {
        self.expiration.as_ref()
    }

    /// Check if the credentials are expired.
    ///
    /// # Returns
    ///
    /// `true` if the credentials have an expiration time and it has passed,
    /// `false` otherwise.
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::AwsCredentials;
    /// use chrono::{Duration, Utc};
    ///
    /// let expired = AwsCredentials::new("AKID", "SECRET")
    ///     .with_expiration(Utc::now() - Duration::hours(1));
    ///
    /// assert!(expired.is_expired());
    ///
    /// let valid = AwsCredentials::new("AKID", "SECRET");
    /// assert!(!valid.is_expired());
    /// ```
    pub fn is_expired(&self) -> bool {
        if let Some(expiration) = self.expiration {
            Utc::now() >= expiration
        } else {
            false
        }
    }

    /// Check if credentials will expire within the given duration.
    ///
    /// # Arguments
    ///
    /// * `within` - The duration to check against
    ///
    /// # Returns
    ///
    /// `true` if the credentials will expire within the given duration,
    /// `false` otherwise.
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::AwsCredentials;
    /// use chrono::{Duration, Utc};
    ///
    /// let credentials = AwsCredentials::new("AKID", "SECRET")
    ///     .with_expiration(Utc::now() + Duration::minutes(30));
    ///
    /// assert!(credentials.expires_within(Duration::hours(1)));
    /// assert!(!credentials.expires_within(Duration::minutes(15)));
    /// ```
    pub fn expires_within(&self, within: chrono::Duration) -> bool {
        if let Some(expiration) = self.expiration {
            Utc::now() + within >= expiration
        } else {
            false
        }
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
///
/// Implementations of this trait can retrieve AWS credentials from various sources
/// such as environment variables, configuration files, or remote services.
///
/// # Example
///
/// ```no_run
/// use integrations_aws_ses::credentials::{
///     AwsCredentials, CredentialProvider, EnvironmentCredentialProvider
/// };
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = EnvironmentCredentialProvider::new();
/// let credentials = provider.credentials().await?;
/// # Ok(())
/// # }
/// ```
#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Retrieve AWS credentials.
    ///
    /// # Returns
    ///
    /// A `Result` containing the credentials or an error.
    ///
    /// # Errors
    ///
    /// Returns `CredentialError` if credentials cannot be retrieved or are invalid.
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError>;

    /// Check if the provider's credentials are expired.
    ///
    /// # Returns
    ///
    /// `true` if the credentials are known to be expired, `false` otherwise.
    ///
    /// The default implementation returns `false`, assuming credentials
    /// should be fetched to check expiration.
    fn is_expired(&self) -> bool {
        false
    }
}

/// Default credential provider that implements the standard AWS credential chain.
///
/// This provider tries the following credential sources in order:
/// 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
/// 2. AWS profile files (~/.aws/credentials, ~/.aws/config)
/// 3. EC2 Instance Metadata Service (IMDS)
///
/// The first provider that successfully returns credentials is used.
/// Credentials are cached with automatic refresh before expiration.
///
/// # Example
///
/// ```no_run
/// use integrations_aws_ses::credentials::{
///     CredentialProvider, DefaultCredentialProvider
/// };
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = DefaultCredentialProvider::new();
/// let credentials = provider.credentials().await?;
/// # Ok(())
/// # }
/// ```
#[derive(Debug, Clone)]
pub struct DefaultCredentialProvider {
    inner: CachedCredentialProvider<ChainCredentialProvider>,
}

impl DefaultCredentialProvider {
    /// Create a new default credential provider.
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::DefaultCredentialProvider;
    ///
    /// let provider = DefaultCredentialProvider::new();
    /// ```
    pub fn new() -> Self {
        let chain = ChainCredentialProvider::new()
            .with_provider(EnvironmentCredentialProvider::new())
            .with_provider(ProfileCredentialProvider::new())
            .with_provider(IMDSCredentialProvider::new());

        Self {
            inner: CachedCredentialProvider::new(chain),
        }
    }

    /// Create a new default credential provider with a custom cache TTL.
    ///
    /// # Arguments
    ///
    /// * `ttl` - Time-to-live for cached credentials
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::DefaultCredentialProvider;
    /// use std::time::Duration;
    ///
    /// let provider = DefaultCredentialProvider::with_cache_ttl(
    ///     Duration::from_secs(600)
    /// );
    /// ```
    pub fn with_cache_ttl(ttl: std::time::Duration) -> Self {
        let chain = ChainCredentialProvider::new()
            .with_provider(EnvironmentCredentialProvider::new())
            .with_provider(ProfileCredentialProvider::new())
            .with_provider(IMDSCredentialProvider::new());

        Self {
            inner: CachedCredentialProvider::with_ttl(chain, ttl),
        }
    }
}

impl Default for DefaultCredentialProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialProvider for DefaultCredentialProvider {
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        self.inner.credentials().await
    }

    fn is_expired(&self) -> bool {
        self.inner.is_expired()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_credentials_new() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        assert_eq!(creds.access_key_id(), "AKID");
        assert_eq!(creds.secret_access_key(), "SECRET");
        assert!(creds.session_token().is_none());
        assert!(creds.expiration().is_none());
    }

    #[test]
    fn test_credentials_with_session_token() {
        let creds = AwsCredentials::new("AKID", "SECRET").with_session_token("TOKEN");
        assert_eq!(creds.session_token(), Some("TOKEN"));
    }

    #[test]
    fn test_credentials_with_expiration() {
        let exp = Utc::now() + Duration::hours(1);
        let creds = AwsCredentials::new("AKID", "SECRET").with_expiration(exp);
        assert_eq!(creds.expiration(), Some(&exp));
    }

    #[test]
    fn test_credentials_is_expired() {
        let expired = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() - Duration::hours(1));
        assert!(expired.is_expired());

        let valid = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() + Duration::hours(1));
        assert!(!valid.is_expired());

        let no_expiration = AwsCredentials::new("AKID", "SECRET");
        assert!(!no_expiration.is_expired());
    }

    #[test]
    fn test_credentials_expires_within() {
        let creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() + Duration::minutes(30));

        assert!(creds.expires_within(Duration::hours(1)));
        assert!(!creds.expires_within(Duration::minutes(15)));

        let no_expiration = AwsCredentials::new("AKID", "SECRET");
        assert!(!no_expiration.expires_within(Duration::hours(1)));
    }

    #[test]
    fn test_credentials_debug_redacts_secrets() {
        let creds = AwsCredentials::new("AKID", "SECRET").with_session_token("TOKEN");
        let debug = format!("{:?}", creds);

        assert!(debug.contains("AKID"));
        assert!(!debug.contains("SECRET"));
        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains("TOKEN"));
    }

    #[test]
    fn test_credentials_clone() {
        let creds = AwsCredentials::new("AKID", "SECRET").with_session_token("TOKEN");
        let cloned = creds.clone();

        assert_eq!(cloned.access_key_id(), "AKID");
        assert_eq!(cloned.secret_access_key(), "SECRET");
        assert_eq!(cloned.session_token(), Some("TOKEN"));
    }
}
