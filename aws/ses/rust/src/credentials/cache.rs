//! Cached credential provider for reducing credential refresh overhead.

use super::{AwsCredentials, CredentialProvider};
use crate::credentials::error::CredentialError;
use async_trait::async_trait;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use std::fmt;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Default cache TTL in seconds (15 minutes).
const DEFAULT_CACHE_TTL_SECS: u64 = 900;

/// Default refresh buffer in seconds (5 minutes before expiration).
const DEFAULT_REFRESH_BUFFER_SECS: i64 = 300;

/// Cached entry for credentials.
#[derive(Clone)]
struct CachedEntry {
    /// The cached credentials.
    credentials: AwsCredentials,
    /// When this cache entry expires.
    cache_expiration: DateTime<Utc>,
}

impl CachedEntry {
    /// Check if this cache entry is expired.
    fn is_expired(&self) -> bool {
        Utc::now() >= self.cache_expiration
    }

    /// Check if credentials need refresh based on their expiration or cache TTL.
    fn needs_refresh(&self, buffer: ChronoDuration) -> bool {
        // Check if cache entry itself is expired
        if self.is_expired() {
            return true;
        }

        // Check if credentials are expired or will expire soon
        if let Some(cred_expiration) = self.credentials.expiration() {
            Utc::now() + buffer >= *cred_expiration
        } else {
            false
        }
    }
}

/// A credential provider that caches credentials from an underlying provider.
///
/// This provider wraps another credential provider and caches the results
/// to avoid repeated calls to the underlying provider. Credentials are
/// automatically refreshed when they expire or before they expire based
/// on a configurable buffer time.
///
/// # Features
///
/// - Caches credentials with configurable TTL
/// - Automatic refresh before expiration
/// - Thread-safe with async/await support
/// - Respects credential expiration times
///
/// # Example
///
/// ```no_run
/// use integrations_aws_ses::credentials::{
///     CachedCredentialProvider, EnvironmentCredentialProvider
/// };
/// use std::time::Duration;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = EnvironmentCredentialProvider::new();
/// let cached = CachedCredentialProvider::new(provider);
///
/// // First call fetches from underlying provider
/// let credentials = cached.credentials().await?;
///
/// // Subsequent calls use cached credentials (if not expired)
/// let credentials = cached.credentials().await?;
/// # Ok(())
/// # }
/// ```
///
/// # Cache Behavior
///
/// - Credentials are cached for the configured TTL (default: 15 minutes)
/// - If credentials have an expiration time, they are refreshed before expiration
/// - The refresh buffer (default: 5 minutes) prevents using credentials too close to expiration
pub struct CachedCredentialProvider<P>
where
    P: CredentialProvider,
{
    /// The underlying credential provider.
    inner: P,
    /// Cached credentials with expiration.
    cache: Arc<RwLock<Option<CachedEntry>>>,
    /// Time-to-live for cached credentials.
    cache_ttl: Duration,
    /// Buffer time before credential expiration to trigger refresh.
    refresh_buffer: ChronoDuration,
}

impl<P> CachedCredentialProvider<P>
where
    P: CredentialProvider,
{
    /// Create a new cached credential provider with default settings.
    ///
    /// # Arguments
    ///
    /// * `provider` - The underlying credential provider to cache
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::{
    ///     CachedCredentialProvider, EnvironmentCredentialProvider
    /// };
    ///
    /// let provider = EnvironmentCredentialProvider::new();
    /// let cached = CachedCredentialProvider::new(provider);
    /// ```
    pub fn new(provider: P) -> Self {
        Self {
            inner: provider,
            cache: Arc::new(RwLock::new(None)),
            cache_ttl: Duration::from_secs(DEFAULT_CACHE_TTL_SECS),
            refresh_buffer: ChronoDuration::seconds(DEFAULT_REFRESH_BUFFER_SECS),
        }
    }

    /// Create a new cached credential provider with a custom cache TTL.
    ///
    /// # Arguments
    ///
    /// * `provider` - The underlying credential provider to cache
    /// * `ttl` - Time-to-live for cached credentials
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::{
    ///     CachedCredentialProvider, EnvironmentCredentialProvider
    /// };
    /// use std::time::Duration;
    ///
    /// let provider = EnvironmentCredentialProvider::new();
    /// let cached = CachedCredentialProvider::with_ttl(
    ///     provider,
    ///     Duration::from_secs(600)
    /// );
    /// ```
    pub fn with_ttl(provider: P, ttl: Duration) -> Self {
        Self {
            inner: provider,
            cache: Arc::new(RwLock::new(None)),
            cache_ttl: ttl,
            refresh_buffer: ChronoDuration::seconds(DEFAULT_REFRESH_BUFFER_SECS),
        }
    }

    /// Set the refresh buffer time.
    ///
    /// Credentials will be refreshed when they are within this duration
    /// of their expiration time.
    ///
    /// # Arguments
    ///
    /// * `buffer` - Duration before expiration to trigger refresh
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::{
    ///     CachedCredentialProvider, EnvironmentCredentialProvider
    /// };
    /// use chrono::Duration;
    ///
    /// let provider = EnvironmentCredentialProvider::new();
    /// let cached = CachedCredentialProvider::new(provider)
    ///     .with_refresh_buffer(Duration::minutes(10));
    /// ```
    pub fn with_refresh_buffer(mut self, buffer: ChronoDuration) -> Self {
        self.refresh_buffer = buffer;
        self
    }

    /// Clear the cache, forcing the next call to fetch fresh credentials.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use integrations_aws_ses::credentials::{
    ///     CachedCredentialProvider, EnvironmentCredentialProvider
    /// };
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let provider = EnvironmentCredentialProvider::new();
    /// let cached = CachedCredentialProvider::new(provider);
    ///
    /// // Clear the cache
    /// cached.clear_cache().await;
    ///
    /// // Next call will fetch fresh credentials
    /// let credentials = cached.credentials().await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        *cache = None;
    }

    /// Check if there are cached credentials available.
    ///
    /// # Returns
    ///
    /// `true` if credentials are cached and not expired, `false` otherwise.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use integrations_aws_ses::credentials::{
    ///     CachedCredentialProvider, EnvironmentCredentialProvider
    /// };
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let provider = EnvironmentCredentialProvider::new();
    /// let cached = CachedCredentialProvider::new(provider);
    ///
    /// if !cached.has_cached_credentials().await {
    ///     println!("No cached credentials available");
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub async fn has_cached_credentials(&self) -> bool {
        let cache = self.cache.read().await;
        cache.as_ref().map_or(false, |entry| !entry.is_expired())
    }

    /// Fetch fresh credentials from the underlying provider and cache them.
    async fn fetch_and_cache(&self) -> Result<AwsCredentials, CredentialError> {
        // Fetch fresh credentials
        let credentials = self.inner.credentials().await?;

        // Calculate cache expiration
        let cache_expiration = if let Some(cred_expiration) = credentials.expiration() {
            // Use credential expiration if it's sooner than cache TTL
            let ttl_expiration = Utc::now() + ChronoDuration::from_std(self.cache_ttl)
                .unwrap_or_else(|_| ChronoDuration::seconds(DEFAULT_CACHE_TTL_SECS as i64));
            std::cmp::min(*cred_expiration, ttl_expiration)
        } else {
            // No credential expiration, use cache TTL
            Utc::now() + ChronoDuration::from_std(self.cache_ttl)
                .unwrap_or_else(|_| ChronoDuration::seconds(DEFAULT_CACHE_TTL_SECS as i64))
        };

        // Cache the credentials
        let entry = CachedEntry {
            credentials: credentials.clone(),
            cache_expiration,
        };

        let mut cache = self.cache.write().await;
        *cache = Some(entry);

        Ok(credentials)
    }
}

impl<P> Clone for CachedCredentialProvider<P>
where
    P: CredentialProvider + Clone,
{
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            cache: Arc::clone(&self.cache),
            cache_ttl: self.cache_ttl,
            refresh_buffer: self.refresh_buffer,
        }
    }
}

#[async_trait]
impl<P> CredentialProvider for CachedCredentialProvider<P>
where
    P: CredentialProvider,
{
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        // Check if we have valid cached credentials
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.as_ref() {
                if !entry.needs_refresh(self.refresh_buffer) {
                    return Ok(entry.credentials.clone());
                }
            }
        }

        // Cache miss or credentials need refresh
        self.fetch_and_cache().await
    }

    fn is_expired(&self) -> bool {
        // We can't check without blocking, so default to false
        // The credentials() method will handle expiration properly
        false
    }
}

impl<P> fmt::Debug for CachedCredentialProvider<P>
where
    P: CredentialProvider + fmt::Debug,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CachedCredentialProvider")
            .field("inner", &self.inner)
            .field("cache_ttl", &self.cache_ttl)
            .field("refresh_buffer", &self.refresh_buffer)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::StaticCredentialProvider;
    use tokio::time::sleep;

    #[tokio::test]
    async fn test_cached_provider_caches_credentials() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);
        let cached = CachedCredentialProvider::new(provider);

        // First call fetches from provider
        let result1 = cached.credentials().await;
        assert!(result1.is_ok());

        // Second call should return cached credentials
        let result2 = cached.credentials().await;
        assert!(result2.is_ok());

        assert_eq!(result1.unwrap().access_key_id(), result2.unwrap().access_key_id());
    }

    #[tokio::test]
    async fn test_cached_provider_respects_ttl() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);
        let cached = CachedCredentialProvider::with_ttl(provider, Duration::from_millis(100));

        // Fetch credentials
        let result1 = cached.credentials().await;
        assert!(result1.is_ok());

        // Wait for TTL to expire
        sleep(Duration::from_millis(150)).await;

        // Should fetch fresh credentials
        let result2 = cached.credentials().await;
        assert!(result2.is_ok());
    }

    #[tokio::test]
    async fn test_cached_provider_respects_credential_expiration() {
        use chrono::Duration;

        // Credentials that expire in 1 second
        let creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() + Duration::seconds(1));
        let provider = StaticCredentialProvider::new(creds.clone());

        // Use a refresh buffer of 2 seconds
        let cached = CachedCredentialProvider::new(provider)
            .with_refresh_buffer(ChronoDuration::seconds(2));

        // Should immediately need refresh due to buffer
        let result = cached.credentials().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cached_provider_clear_cache() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);
        let cached = CachedCredentialProvider::new(provider);

        // Fetch and cache
        let _ = cached.credentials().await;
        assert!(cached.has_cached_credentials().await);

        // Clear cache
        cached.clear_cache().await;
        assert!(!cached.has_cached_credentials().await);
    }

    #[tokio::test]
    async fn test_cached_provider_has_cached_credentials() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);
        let cached = CachedCredentialProvider::new(provider);

        // No credentials cached initially
        assert!(!cached.has_cached_credentials().await);

        // Fetch credentials
        let _ = cached.credentials().await;

        // Should have cached credentials now
        assert!(cached.has_cached_credentials().await);
    }

    #[tokio::test]
    async fn test_cached_provider_expired_credentials() {
        use chrono::Duration;

        // Already expired credentials
        let creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() - Duration::hours(1));
        let provider = StaticCredentialProvider::new(creds);
        let cached = CachedCredentialProvider::new(provider);

        // Should fail because credentials are expired
        let result = cached.credentials().await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CredentialError::Expired));
    }

    #[tokio::test]
    async fn test_cached_provider_clone() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialProvider::new(creds);
        let cached = CachedCredentialProvider::new(provider);

        // Fetch credentials
        let _ = cached.credentials().await;

        // Clone should share the cache
        let cloned = cached.clone();
        assert!(cloned.has_cached_credentials().await);
    }

    #[tokio::test]
    async fn test_cached_provider_with_custom_buffer() {
        use chrono::Duration;

        let creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() + Duration::minutes(20));
        let provider = StaticCredentialProvider::new(creds);

        // Use a 10-minute refresh buffer
        let cached = CachedCredentialProvider::new(provider)
            .with_refresh_buffer(ChronoDuration::minutes(10));

        let result = cached.credentials().await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_cached_entry_is_expired() {
        use chrono::Duration;

        let creds = AwsCredentials::new("AKID", "SECRET");
        let entry = CachedEntry {
            credentials: creds,
            cache_expiration: Utc::now() - Duration::hours(1),
        };

        assert!(entry.is_expired());
    }

    #[test]
    fn test_cached_entry_needs_refresh() {
        use chrono::Duration;

        // Entry with future cache expiration but credential expiring soon
        let creds = AwsCredentials::new("AKID", "SECRET")
            .with_expiration(Utc::now() + Duration::minutes(3));
        let entry = CachedEntry {
            credentials: creds,
            cache_expiration: Utc::now() + Duration::hours(1),
        };

        // With a 5-minute buffer, should need refresh
        assert!(entry.needs_refresh(ChronoDuration::minutes(5)));

        // With a 1-minute buffer, should not need refresh
        assert!(!entry.needs_refresh(ChronoDuration::minutes(1)));
    }
}
