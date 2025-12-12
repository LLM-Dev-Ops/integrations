//! Chain credential provider for trying multiple sources in order.

use super::{AwsCredentials, CredentialProvider};
use crate::credentials::error::CredentialError;
use async_trait::async_trait;
use std::fmt;
use std::sync::Arc;

/// A credential provider that chains multiple providers together.
///
/// This provider tries each configured provider in order until one
/// successfully returns credentials. This is useful for implementing
/// fallback behavior across multiple credential sources.
///
/// # Example
///
/// ```no_run
/// use integrations_aws_ses::credentials::{
///     ChainCredentialProvider, EnvironmentCredentialProvider,
///     ProfileCredentialProvider, IMDSCredentialProvider
/// };
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = ChainCredentialProvider::new()
///     .with_provider(EnvironmentCredentialProvider::new())
///     .with_provider(ProfileCredentialProvider::new())
///     .with_provider(IMDSCredentialProvider::new());
///
/// let credentials = provider.credentials().await?;
/// # Ok(())
/// # }
/// ```
///
/// # Provider Order
///
/// Providers are tried in the order they are added. The first provider
/// that successfully returns credentials is used, and subsequent providers
/// are not called.
///
/// # Error Handling
///
/// If all providers fail, the error from the last provider is returned.
/// Errors from earlier providers are not surfaced to the caller.
#[derive(Clone)]
pub struct ChainCredentialProvider {
    providers: Vec<Arc<dyn CredentialProvider + Send + Sync>>,
}

impl ChainCredentialProvider {
    /// Create a new empty chain credential provider.
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::ChainCredentialProvider;
    ///
    /// let provider = ChainCredentialProvider::new();
    /// ```
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
        }
    }

    /// Add a provider to the chain.
    ///
    /// Providers are tried in the order they are added.
    ///
    /// # Arguments
    ///
    /// * `provider` - The credential provider to add
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::{
    ///     ChainCredentialProvider, EnvironmentCredentialProvider
    /// };
    ///
    /// let provider = ChainCredentialProvider::new()
    ///     .with_provider(EnvironmentCredentialProvider::new());
    /// ```
    pub fn with_provider<P>(mut self, provider: P) -> Self
    where
        P: CredentialProvider + Send + Sync + 'static,
    {
        self.providers.push(Arc::new(provider));
        self
    }

    /// Add a boxed provider to the chain.
    ///
    /// This is useful when you have a provider trait object.
    ///
    /// # Arguments
    ///
    /// * `provider` - The credential provider to add
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::{
    ///     ChainCredentialProvider, EnvironmentCredentialProvider
    /// };
    /// use std::sync::Arc;
    ///
    /// let env_provider = Arc::new(EnvironmentCredentialProvider::new());
    /// let provider = ChainCredentialProvider::new()
    ///     .with_arc_provider(env_provider);
    /// ```
    pub fn with_arc_provider(
        mut self,
        provider: Arc<dyn CredentialProvider + Send + Sync>,
    ) -> Self {
        self.providers.push(provider);
        self
    }

    /// Get the number of providers in the chain.
    ///
    /// # Returns
    ///
    /// The number of configured providers.
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::{
    ///     ChainCredentialProvider, EnvironmentCredentialProvider,
    ///     ProfileCredentialProvider
    /// };
    ///
    /// let provider = ChainCredentialProvider::new()
    ///     .with_provider(EnvironmentCredentialProvider::new())
    ///     .with_provider(ProfileCredentialProvider::new());
    ///
    /// assert_eq!(provider.provider_count(), 2);
    /// ```
    pub fn provider_count(&self) -> usize {
        self.providers.len()
    }
}

impl Default for ChainCredentialProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialProvider for ChainCredentialProvider {
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        if self.providers.is_empty() {
            return Err(CredentialError::Missing {
                message: "No credential providers configured in chain".to_string(),
            });
        }

        let mut last_error = None;

        for provider in &self.providers {
            match provider.credentials().await {
                Ok(credentials) => {
                    // First successful provider wins
                    return Ok(credentials);
                }
                Err(e) => {
                    // Store error and try next provider
                    last_error = Some(e);
                }
            }
        }

        // All providers failed, return the last error
        Err(last_error.unwrap_or_else(|| CredentialError::Missing {
            message: "All credential providers in chain failed".to_string(),
        }))
    }

    fn is_expired(&self) -> bool {
        // Chain is expired if all providers are expired
        // If any provider might have valid creds, we should try fetching
        !self.providers.is_empty() && self.providers.iter().all(|p| p.is_expired())
    }
}

impl fmt::Debug for ChainCredentialProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ChainCredentialProvider")
            .field("provider_count", &self.providers.len())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::{EnvironmentCredentialProvider, StaticCredentialProvider};

    #[tokio::test]
    async fn test_chain_empty() {
        let provider = ChainCredentialProvider::new();
        let result = provider.credentials().await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CredentialError::Missing { .. }));
    }

    #[tokio::test]
    async fn test_chain_first_succeeds() {
        let static_creds = AwsCredentials::new("AKID1", "SECRET1");
        let provider1 = StaticCredentialProvider::new(static_creds);

        let static_creds2 = AwsCredentials::new("AKID2", "SECRET2");
        let provider2 = StaticCredentialProvider::new(static_creds2);

        let chain = ChainCredentialProvider::new()
            .with_provider(provider1)
            .with_provider(provider2);

        let result = chain.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        // Should get credentials from first provider
        assert_eq!(creds.access_key_id(), "AKID1");
    }

    #[tokio::test]
    async fn test_chain_first_fails_second_succeeds() {
        // Environment provider will fail if vars not set
        let provider1 = EnvironmentCredentialProvider::new();

        let static_creds = AwsCredentials::new("AKID2", "SECRET2");
        let provider2 = StaticCredentialProvider::new(static_creds);

        let chain = ChainCredentialProvider::new()
            .with_provider(provider1)
            .with_provider(provider2);

        let result = chain.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        // Should get credentials from second provider
        assert_eq!(creds.access_key_id(), "AKID2");
    }

    #[tokio::test]
    async fn test_chain_all_fail() {
        // Both environment providers will fail if vars not set
        let provider1 = EnvironmentCredentialProvider::new();
        let provider2 = EnvironmentCredentialProvider::new();

        let chain = ChainCredentialProvider::new()
            .with_provider(provider1)
            .with_provider(provider2);

        let result = chain.credentials().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_chain_with_arc_provider() {
        let static_creds = AwsCredentials::new("AKID", "SECRET");
        let provider = Arc::new(StaticCredentialProvider::new(static_creds));

        let chain = ChainCredentialProvider::new().with_arc_provider(provider);

        let result = chain.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKID");
    }

    #[test]
    fn test_chain_provider_count() {
        let chain = ChainCredentialProvider::new();
        assert_eq!(chain.provider_count(), 0);

        let static_creds1 = AwsCredentials::new("AKID1", "SECRET1");
        let static_creds2 = AwsCredentials::new("AKID2", "SECRET2");

        let chain = chain
            .with_provider(StaticCredentialProvider::new(static_creds1))
            .with_provider(StaticCredentialProvider::new(static_creds2));

        assert_eq!(chain.provider_count(), 2);
    }

    #[test]
    fn test_chain_is_expired() {
        use chrono::{Duration, Utc};

        // Empty chain is not expired
        let chain = ChainCredentialProvider::new();
        assert!(!chain.is_expired());

        // Chain with non-expired credentials
        let valid_creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() + Duration::hours(1));
        let chain = ChainCredentialProvider::new()
            .with_provider(StaticCredentialProvider::new(valid_creds));
        assert!(!chain.is_expired());

        // Chain with expired credentials
        let expired_creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() - Duration::hours(1));
        let chain = ChainCredentialProvider::new()
            .with_provider(StaticCredentialProvider::new(expired_creds));
        assert!(chain.is_expired());
    }

    #[test]
    fn test_chain_clone() {
        let static_creds = AwsCredentials::new("AKID", "SECRET");
        let chain = ChainCredentialProvider::new()
            .with_provider(StaticCredentialProvider::new(static_creds));

        let cloned = chain.clone();
        assert_eq!(cloned.provider_count(), 1);
    }

    #[test]
    fn test_chain_debug() {
        let static_creds = AwsCredentials::new("AKID", "SECRET");
        let chain = ChainCredentialProvider::new()
            .with_provider(StaticCredentialProvider::new(static_creds));

        let debug = format!("{:?}", chain);
        assert!(debug.contains("ChainCredentialProvider"));
        assert!(debug.contains("provider_count"));
    }
}
