//! Chain credentials provider that tries multiple sources.

use super::{
    AwsCredentials, CredentialsProvider, EnvCredentialsProvider, ProfileCredentialsProvider,
};
use crate::error::{CredentialsError, S3Error};
use async_trait::async_trait;
use parking_lot::RwLock;
use std::sync::Arc;
use tracing::{debug, trace};

/// Credentials provider that chains multiple providers.
///
/// The chain tries each provider in order until one succeeds.
/// By default, the chain includes:
/// 1. Environment variables (`AWS_ACCESS_KEY_ID`, etc.)
/// 2. Profile file (`~/.aws/credentials`)
///
/// Credentials are cached and refreshed when they expire or approach expiration.
pub struct ChainCredentialsProvider {
    providers: Vec<Arc<dyn CredentialsProvider>>,
    cached: RwLock<Option<CachedCredentials>>,
    /// Refresh credentials this many seconds before expiration.
    refresh_buffer_seconds: i64,
}

struct CachedCredentials {
    credentials: AwsCredentials,
    provider_name: &'static str,
}

impl ChainCredentialsProvider {
    /// Create a new chain with the default providers.
    pub fn new() -> Self {
        Self {
            providers: vec![
                Arc::new(EnvCredentialsProvider::new()),
                Arc::new(ProfileCredentialsProvider::new()),
            ],
            cached: RwLock::new(None),
            refresh_buffer_seconds: 300, // 5 minutes
        }
    }

    /// Create a chain with custom providers.
    pub fn with_providers(providers: Vec<Arc<dyn CredentialsProvider>>) -> Self {
        Self {
            providers,
            cached: RwLock::new(None),
            refresh_buffer_seconds: 300,
        }
    }

    /// Set the refresh buffer (seconds before expiration to refresh).
    pub fn with_refresh_buffer(mut self, seconds: i64) -> Self {
        self.refresh_buffer_seconds = seconds;
        self
    }

    /// Add a provider to the end of the chain.
    pub fn add_provider(mut self, provider: Arc<dyn CredentialsProvider>) -> Self {
        self.providers.push(provider);
        self
    }

    /// Add a provider to the beginning of the chain.
    pub fn prepend_provider(mut self, provider: Arc<dyn CredentialsProvider>) -> Self {
        self.providers.insert(0, provider);
        self
    }

    fn should_refresh(&self, creds: &AwsCredentials) -> bool {
        if creds.is_expired() {
            return true;
        }

        creds.will_expire_within(chrono::Duration::seconds(self.refresh_buffer_seconds))
    }

    async fn try_providers(&self) -> Result<(AwsCredentials, &'static str), S3Error> {
        let mut last_error: Option<S3Error> = None;

        for provider in &self.providers {
            let name = provider.name();
            trace!("Trying credentials provider: {}", name);

            match provider.get_credentials().await {
                Ok(creds) => {
                    debug!("Credentials loaded from provider: {}", name);
                    return Ok((creds, name));
                }
                Err(e) => {
                    trace!("Provider {} failed: {:?}", name, e);
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            S3Error::Credentials(CredentialsError::NotFound)
        }))
    }
}

impl Default for ChainCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for ChainCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
        // Check cache first
        {
            let cache = self.cached.read();
            if let Some(cached) = cache.as_ref() {
                if !self.should_refresh(&cached.credentials) {
                    trace!(
                        "Using cached credentials from provider: {}",
                        cached.provider_name
                    );
                    return Ok(cached.credentials.clone());
                }
            }
        }

        // Need to refresh - acquire write lock
        let (creds, name) = self.try_providers().await?;

        // Update cache
        {
            let mut cache = self.cached.write();
            *cache = Some(CachedCredentials {
                credentials: creds.clone(),
                provider_name: name,
            });
        }

        Ok(creds)
    }

    async fn refresh_credentials(&self) -> Result<AwsCredentials, S3Error> {
        // Clear cache and get fresh credentials
        {
            let mut cache = self.cached.write();
            *cache = None;
        }
        self.get_credentials().await
    }

    fn name(&self) -> &'static str {
        "chain"
    }
}

impl std::fmt::Debug for ChainCredentialsProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChainCredentialsProvider")
            .field(
                "providers",
                &self.providers.iter().map(|p| p.name()).collect::<Vec<_>>(),
            )
            .field("refresh_buffer_seconds", &self.refresh_buffer_seconds)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::StaticCredentialsProvider;

    struct FailingProvider;

    #[async_trait]
    impl CredentialsProvider for FailingProvider {
        async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
            Err(S3Error::Credentials(CredentialsError::NotFound))
        }

        fn name(&self) -> &'static str {
            "failing"
        }
    }

    #[tokio::test]
    async fn test_chain_uses_first_successful_provider() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = ChainCredentialsProvider::with_providers(vec![
            Arc::new(FailingProvider),
            Arc::new(StaticCredentialsProvider::new(creds)),
        ]);

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().access_key_id(), "AKID");
    }

    #[tokio::test]
    async fn test_chain_caches_credentials() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = ChainCredentialsProvider::with_providers(vec![Arc::new(
            StaticCredentialsProvider::new(creds),
        )]);

        // First call
        let result1 = provider.get_credentials().await;
        assert!(result1.is_ok());

        // Second call should use cache
        let result2 = provider.get_credentials().await;
        assert!(result2.is_ok());

        // Both should return same credentials
        assert_eq!(
            result1.unwrap().access_key_id(),
            result2.unwrap().access_key_id()
        );
    }

    #[tokio::test]
    async fn test_chain_fails_when_all_providers_fail() {
        let provider = ChainCredentialsProvider::with_providers(vec![
            Arc::new(FailingProvider),
            Arc::new(FailingProvider),
        ]);

        let result = provider.get_credentials().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_chain_refresh_clears_cache() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = ChainCredentialsProvider::with_providers(vec![Arc::new(
            StaticCredentialsProvider::new(creds),
        )]);

        // First call to populate cache
        let _ = provider.get_credentials().await;

        // Refresh should clear cache and get new credentials
        let result = provider.refresh_credentials().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_chain_refreshes_expiring_credentials() {
        use chrono::{Duration, Utc};

        // Create credentials that will expire soon
        let expiring = AwsCredentials::temporary(
            "AKID",
            "SECRET",
            "TOKEN",
            Utc::now() + Duration::seconds(60), // Expires in 1 minute
        );

        let provider = ChainCredentialsProvider::with_providers(vec![Arc::new(
            StaticCredentialsProvider::new(expiring),
        )])
        .with_refresh_buffer(120); // Refresh 2 minutes before expiration

        // This should trigger a refresh since credentials expire within buffer
        let result = provider.get_credentials().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_add_provider() {
        let provider = ChainCredentialsProvider::with_providers(vec![Arc::new(FailingProvider)])
            .add_provider(Arc::new(StaticCredentialsProvider::new(AwsCredentials::new(
                "AKID", "SECRET",
            ))));

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_prepend_provider() {
        let provider = ChainCredentialsProvider::with_providers(vec![Arc::new(FailingProvider)])
            .prepend_provider(Arc::new(StaticCredentialsProvider::new(AwsCredentials::new(
                "FIRST", "SECRET",
            ))));

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().access_key_id(), "FIRST");
    }
}
