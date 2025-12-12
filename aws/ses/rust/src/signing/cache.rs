//! Signing key cache for AWS Signature V4.
//!
//! This module provides a thread-safe cache for derived signing keys used in
//! AWS Signature V4. Since deriving signing keys is computationally expensive
//! (multiple HMAC operations), caching them significantly improves performance.
//!
//! Signing keys are date-specific, so they are cached by date and refreshed
//! when the date changes.

use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::RwLock;

/// A cache entry containing the signing key and its associated date.
#[derive(Clone, Debug)]
struct CacheEntry {
    /// The date stamp this key is valid for (YYYYMMDD format).
    date_stamp: String,
    /// The derived signing key.
    signing_key: Vec<u8>,
}

/// Thread-safe cache for AWS Signature V4 signing keys.
///
/// Signing keys are derived from AWS credentials and are date-specific.
/// This cache stores keys indexed by a composite key of:
/// - Access Key ID
/// - Region
/// - Service name
/// - Date stamp (YYYYMMDD)
///
/// # Thread Safety
///
/// This cache uses `RwLock` for thread-safe access, allowing multiple
/// concurrent readers or a single writer.
///
/// # Example
///
/// ```no_run
/// use integrations_aws_ses::signing::SigningKeyCache;
/// use chrono::Utc;
///
/// let cache = SigningKeyCache::new();
/// let date_stamp = Utc::now().format("%Y%m%d").to_string();
/// let key = vec![1, 2, 3, 4]; // Derived signing key
///
/// cache.put("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", &date_stamp, key.clone());
///
/// if let Some(cached_key) = cache.get("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", &date_stamp) {
///     assert_eq!(cached_key, key);
/// }
/// ```
pub struct SigningKeyCache {
    /// Internal cache storage.
    ///
    /// Key format: "{access_key_id}:{region}:{service}:{date_stamp}"
    cache: RwLock<HashMap<String, CacheEntry>>,
}

impl SigningKeyCache {
    /// Create a new empty signing key cache.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// ```
    pub fn new() -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
        }
    }

    /// Build a cache key from the signing parameters.
    ///
    /// The cache key uniquely identifies a signing key based on:
    /// - Access Key ID (identifies the credentials)
    /// - Region (signing keys are region-specific)
    /// - Service (signing keys are service-specific)
    /// - Date stamp (signing keys are date-specific)
    fn build_cache_key(
        access_key_id: &str,
        region: &str,
        service: &str,
        date_stamp: &str,
    ) -> String {
        format!("{}:{}:{}:{}", access_key_id, region, service, date_stamp)
    }

    /// Get a signing key from the cache.
    ///
    /// Returns `Some(key)` if a valid key is cached for the given parameters,
    /// or `None` if no key is cached or the cached key is for a different date.
    ///
    /// # Arguments
    ///
    /// * `access_key_id` - The AWS access key ID
    /// * `region` - The AWS region
    /// * `service` - The AWS service name
    /// * `date_stamp` - The date stamp in YYYYMMDD format
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// let key = cache.get("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215");
    /// assert!(key.is_none()); // Cache is empty
    /// ```
    pub fn get(
        &self,
        access_key_id: &str,
        region: &str,
        service: &str,
        date_stamp: &str,
    ) -> Option<Vec<u8>> {
        let cache_key = Self::build_cache_key(access_key_id, region, service, date_stamp);

        // Try to read from cache
        let cache = self.cache.read().ok()?;
        let entry = cache.get(&cache_key)?;

        // Verify the date stamp matches
        if entry.date_stamp == date_stamp {
            Some(entry.signing_key.clone())
        } else {
            // Key is stale (different date)
            None
        }
    }

    /// Store a signing key in the cache.
    ///
    /// If a key already exists for the given parameters, it will be replaced.
    ///
    /// # Arguments
    ///
    /// * `access_key_id` - The AWS access key ID
    /// * `region` - The AWS region
    /// * `service` - The AWS service name
    /// * `date_stamp` - The date stamp in YYYYMMDD format
    /// * `signing_key` - The derived signing key to cache
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// let key = vec![1, 2, 3, 4];
    /// cache.put("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215", key);
    /// ```
    pub fn put(
        &self,
        access_key_id: &str,
        region: &str,
        service: &str,
        date_stamp: &str,
        signing_key: Vec<u8>,
    ) {
        let cache_key = Self::build_cache_key(access_key_id, region, service, date_stamp);
        let entry = CacheEntry {
            date_stamp: date_stamp.to_string(),
            signing_key,
        };

        if let Ok(mut cache) = self.cache.write() {
            cache.insert(cache_key, entry);
        }
    }

    /// Clear all cached signing keys.
    ///
    /// This is useful for testing or when credentials are rotated.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// cache.put("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215", vec![1, 2, 3]);
    /// cache.clear();
    /// assert!(cache.get("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215").is_none());
    /// ```
    pub fn clear(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.clear();
        }
    }

    /// Remove a specific signing key from the cache.
    ///
    /// # Arguments
    ///
    /// * `access_key_id` - The AWS access key ID
    /// * `region` - The AWS region
    /// * `service` - The AWS service name
    /// * `date_stamp` - The date stamp in YYYYMMDD format
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// cache.put("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215", vec![1, 2, 3]);
    /// cache.remove("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215");
    /// assert!(cache.get("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215").is_none());
    /// ```
    pub fn remove(&self, access_key_id: &str, region: &str, service: &str, date_stamp: &str) {
        let cache_key = Self::build_cache_key(access_key_id, region, service, date_stamp);
        if let Ok(mut cache) = self.cache.write() {
            cache.remove(&cache_key);
        }
    }

    /// Get the number of entries in the cache.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// assert_eq!(cache.len(), 0);
    ///
    /// cache.put("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231215", vec![1, 2, 3]);
    /// assert_eq!(cache.len(), 1);
    /// ```
    pub fn len(&self) -> usize {
        self.cache.read().map(|c| c.len()).unwrap_or(0)
    }

    /// Check if the cache is empty.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    ///
    /// let cache = SigningKeyCache::new();
    /// assert!(cache.is_empty());
    /// ```
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Clean up expired entries from the cache.
    ///
    /// Removes all entries that don't match the current date stamp.
    /// This helps prevent the cache from growing unbounded.
    ///
    /// # Arguments
    ///
    /// * `current_timestamp` - The current timestamp to use for determining the current date
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use integrations_aws_ses::signing::SigningKeyCache;
    /// use chrono::Utc;
    ///
    /// let cache = SigningKeyCache::new();
    /// cache.put("AKIAIOSFODNN7EXAMPLE", "us-east-1", "ses", "20231214", vec![1, 2, 3]);
    /// cache.cleanup_expired(&Utc::now());
    /// // Old entries for previous dates are removed
    /// ```
    pub fn cleanup_expired(&self, current_timestamp: &DateTime<Utc>) {
        let current_date = current_timestamp.format("%Y%m%d").to_string();

        if let Ok(mut cache) = self.cache.write() {
            cache.retain(|_, entry| entry.date_stamp == current_date);
        }
    }
}

impl Default for SigningKeyCache {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for SigningKeyCache {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SigningKeyCache")
            .field("entries", &self.len())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_cache_new() {
        let cache = SigningKeyCache::new();
        assert!(cache.is_empty());
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_cache_put_and_get() {
        let cache = SigningKeyCache::new();
        let key = vec![1, 2, 3, 4, 5];

        cache.put("AKID", "us-east-1", "ses", "20231215", key.clone());

        let retrieved = cache.get("AKID", "us-east-1", "ses", "20231215");
        assert_eq!(retrieved, Some(key));
    }

    #[test]
    fn test_cache_get_nonexistent() {
        let cache = SigningKeyCache::new();
        let retrieved = cache.get("AKID", "us-east-1", "ses", "20231215");
        assert_eq!(retrieved, None);
    }

    #[test]
    fn test_cache_different_dates() {
        let cache = SigningKeyCache::new();
        let key1 = vec![1, 2, 3];
        let key2 = vec![4, 5, 6];

        cache.put("AKID", "us-east-1", "ses", "20231215", key1.clone());
        cache.put("AKID", "us-east-1", "ses", "20231216", key2.clone());

        let retrieved1 = cache.get("AKID", "us-east-1", "ses", "20231215");
        let retrieved2 = cache.get("AKID", "us-east-1", "ses", "20231216");

        assert_eq!(retrieved1, Some(key1));
        assert_eq!(retrieved2, Some(key2));
    }

    #[test]
    fn test_cache_different_regions() {
        let cache = SigningKeyCache::new();
        let key1 = vec![1, 2, 3];
        let key2 = vec![4, 5, 6];

        cache.put("AKID", "us-east-1", "ses", "20231215", key1.clone());
        cache.put("AKID", "us-west-2", "ses", "20231215", key2.clone());

        let retrieved1 = cache.get("AKID", "us-east-1", "ses", "20231215");
        let retrieved2 = cache.get("AKID", "us-west-2", "ses", "20231215");

        assert_eq!(retrieved1, Some(key1));
        assert_eq!(retrieved2, Some(key2));
    }

    #[test]
    fn test_cache_different_services() {
        let cache = SigningKeyCache::new();
        let key1 = vec![1, 2, 3];
        let key2 = vec![4, 5, 6];

        cache.put("AKID", "us-east-1", "ses", "20231215", key1.clone());
        cache.put("AKID", "us-east-1", "s3", "20231215", key2.clone());

        let retrieved1 = cache.get("AKID", "us-east-1", "ses", "20231215");
        let retrieved2 = cache.get("AKID", "us-east-1", "s3", "20231215");

        assert_eq!(retrieved1, Some(key1));
        assert_eq!(retrieved2, Some(key2));
    }

    #[test]
    fn test_cache_different_access_keys() {
        let cache = SigningKeyCache::new();
        let key1 = vec![1, 2, 3];
        let key2 = vec![4, 5, 6];

        cache.put("AKID1", "us-east-1", "ses", "20231215", key1.clone());
        cache.put("AKID2", "us-east-1", "ses", "20231215", key2.clone());

        let retrieved1 = cache.get("AKID1", "us-east-1", "ses", "20231215");
        let retrieved2 = cache.get("AKID2", "us-east-1", "ses", "20231215");

        assert_eq!(retrieved1, Some(key1));
        assert_eq!(retrieved2, Some(key2));
    }

    #[test]
    fn test_cache_replace() {
        let cache = SigningKeyCache::new();
        let key1 = vec![1, 2, 3];
        let key2 = vec![4, 5, 6];

        cache.put("AKID", "us-east-1", "ses", "20231215", key1);
        cache.put("AKID", "us-east-1", "ses", "20231215", key2.clone());

        let retrieved = cache.get("AKID", "us-east-1", "ses", "20231215");
        assert_eq!(retrieved, Some(key2));
    }

    #[test]
    fn test_cache_clear() {
        let cache = SigningKeyCache::new();
        cache.put("AKID1", "us-east-1", "ses", "20231215", vec![1, 2, 3]);
        cache.put("AKID2", "us-west-2", "ses", "20231216", vec![4, 5, 6]);

        assert_eq!(cache.len(), 2);

        cache.clear();

        assert_eq!(cache.len(), 0);
        assert!(cache.is_empty());
    }

    #[test]
    fn test_cache_remove() {
        let cache = SigningKeyCache::new();
        let key = vec![1, 2, 3];

        cache.put("AKID", "us-east-1", "ses", "20231215", key.clone());
        assert_eq!(cache.len(), 1);

        cache.remove("AKID", "us-east-1", "ses", "20231215");
        assert_eq!(cache.len(), 0);

        let retrieved = cache.get("AKID", "us-east-1", "ses", "20231215");
        assert_eq!(retrieved, None);
    }

    #[test]
    fn test_cache_cleanup_expired() {
        let cache = SigningKeyCache::new();

        // Add keys for different dates
        cache.put("AKID", "us-east-1", "ses", "20231214", vec![1, 2, 3]);
        cache.put("AKID", "us-east-1", "ses", "20231215", vec![4, 5, 6]);
        cache.put("AKID", "us-east-1", "ses", "20231216", vec![7, 8, 9]);

        assert_eq!(cache.len(), 3);

        // Clean up with current date = 2023-12-15
        let current_date = Utc.with_ymd_and_hms(2023, 12, 15, 12, 0, 0).unwrap();
        cache.cleanup_expired(&current_date);

        // Only the entry for 2023-12-15 should remain
        assert_eq!(cache.len(), 1);
        assert!(cache.get("AKID", "us-east-1", "ses", "20231215").is_some());
        assert!(cache.get("AKID", "us-east-1", "ses", "20231214").is_none());
        assert!(cache.get("AKID", "us-east-1", "ses", "20231216").is_none());
    }

    #[test]
    fn test_cache_len() {
        let cache = SigningKeyCache::new();
        assert_eq!(cache.len(), 0);

        cache.put("AKID1", "us-east-1", "ses", "20231215", vec![1]);
        assert_eq!(cache.len(), 1);

        cache.put("AKID2", "us-east-1", "ses", "20231215", vec![2]);
        assert_eq!(cache.len(), 2);

        cache.remove("AKID1", "us-east-1", "ses", "20231215");
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn test_cache_is_empty() {
        let cache = SigningKeyCache::new();
        assert!(cache.is_empty());

        cache.put("AKID", "us-east-1", "ses", "20231215", vec![1, 2, 3]);
        assert!(!cache.is_empty());

        cache.clear();
        assert!(cache.is_empty());
    }

    #[test]
    fn test_cache_debug() {
        let cache = SigningKeyCache::new();
        let debug_str = format!("{:?}", cache);
        assert!(debug_str.contains("SigningKeyCache"));
        assert!(debug_str.contains("entries"));
    }

    #[test]
    fn test_cache_default() {
        let cache = SigningKeyCache::default();
        assert!(cache.is_empty());
    }

    #[test]
    fn test_build_cache_key() {
        let key1 = SigningKeyCache::build_cache_key("AKID", "us-east-1", "ses", "20231215");
        let key2 = SigningKeyCache::build_cache_key("AKID", "us-east-1", "ses", "20231215");
        let key3 = SigningKeyCache::build_cache_key("AKID", "us-west-2", "ses", "20231215");

        assert_eq!(key1, key2);
        assert_ne!(key1, key3);
        assert_eq!(key1, "AKID:us-east-1:ses:20231215");
    }

    #[test]
    fn test_stale_date_returns_none() {
        let cache = SigningKeyCache::new();

        // Put a key for an old date
        cache.put("AKID", "us-east-1", "ses", "20231214", vec![1, 2, 3]);

        // Try to get with a different date - should return None
        let retrieved = cache.get("AKID", "us-east-1", "ses", "20231215");
        assert_eq!(retrieved, None);
    }

    #[test]
    fn test_concurrent_access() {
        use std::sync::Arc;
        use std::thread;

        let cache = Arc::new(SigningKeyCache::new());
        let mut handles = vec![];

        // Spawn multiple threads that write to the cache
        for i in 0..10 {
            let cache_clone = Arc::clone(&cache);
            let handle = thread::spawn(move || {
                let key = vec![i; 32];
                cache_clone.put(
                    &format!("AKID{}", i),
                    "us-east-1",
                    "ses",
                    "20231215",
                    key,
                );
            });
            handles.push(handle);
        }

        // Wait for all threads to complete
        for handle in handles {
            handle.join().unwrap();
        }

        // Verify all entries were added
        assert_eq!(cache.len(), 10);
    }
}
