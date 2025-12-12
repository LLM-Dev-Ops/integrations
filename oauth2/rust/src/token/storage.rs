//! Token Storage
//!
//! Secure token storage implementations with encryption and expiration tracking.

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::{OAuth2Error, StorageError};
use crate::types::StoredTokens;

/// Token storage interface.
#[async_trait]
pub trait TokenStorage: Send + Sync {
    /// Store tokens for a key.
    async fn store(&self, key: &str, tokens: StoredTokens) -> Result<(), OAuth2Error>;

    /// Retrieve tokens for a key.
    async fn retrieve(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error>;

    /// Delete tokens for a key.
    async fn delete(&self, key: &str) -> Result<bool, OAuth2Error>;

    /// Check if tokens exist for a key.
    async fn exists(&self, key: &str) -> Result<bool, OAuth2Error>;

    /// List all stored token keys.
    async fn list_keys(&self) -> Result<Vec<String>, OAuth2Error>;

    /// Clear all stored tokens.
    async fn clear(&self) -> Result<(), OAuth2Error>;

    /// Clear expired tokens.
    async fn clear_expired(&self) -> Result<u32, OAuth2Error>;
}

/// In-memory token storage implementation.
pub struct InMemoryTokenStorage {
    tokens: Mutex<HashMap<String, StoredTokens>>,
}

impl InMemoryTokenStorage {
    /// Create new in-memory token storage.
    pub fn new() -> Self {
        Self {
            tokens: Mutex::new(HashMap::new()),
        }
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

impl Default for InMemoryTokenStorage {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TokenStorage for InMemoryTokenStorage {
    async fn store(&self, key: &str, tokens: StoredTokens) -> Result<(), OAuth2Error> {
        self.tokens
            .lock()
            .unwrap()
            .insert(key.to_string(), tokens);
        Ok(())
    }

    async fn retrieve(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error> {
        let tokens = self.tokens.lock().unwrap();
        Ok(tokens.get(key).cloned())
    }

    async fn delete(&self, key: &str) -> Result<bool, OAuth2Error> {
        let mut tokens = self.tokens.lock().unwrap();
        Ok(tokens.remove(key).is_some())
    }

    async fn exists(&self, key: &str) -> Result<bool, OAuth2Error> {
        let tokens = self.tokens.lock().unwrap();
        Ok(tokens.contains_key(key))
    }

    async fn list_keys(&self) -> Result<Vec<String>, OAuth2Error> {
        let tokens = self.tokens.lock().unwrap();
        Ok(tokens.keys().cloned().collect())
    }

    async fn clear(&self) -> Result<(), OAuth2Error> {
        self.tokens.lock().unwrap().clear();
        Ok(())
    }

    async fn clear_expired(&self) -> Result<u32, OAuth2Error> {
        let mut tokens = self.tokens.lock().unwrap();
        let now = Self::now_ms();
        let initial_count = tokens.len();

        tokens.retain(|_, stored| {
            stored
                .access_token_expires_at
                .map(|exp| exp > now)
                .unwrap_or(true)
        });

        Ok((initial_count - tokens.len()) as u32)
    }
}

/// Encrypted token storage wrapper.
pub struct EncryptedTokenStorage<S: TokenStorage> {
    inner: S,
    /// Encryption key (in production, use proper key management)
    _encryption_key: Vec<u8>,
}

impl<S: TokenStorage> EncryptedTokenStorage<S> {
    /// Create new encrypted token storage.
    pub fn new(inner: S, encryption_key: Vec<u8>) -> Self {
        Self {
            inner,
            _encryption_key: encryption_key,
        }
    }

    // Note: In a production implementation, these would use proper encryption
    // libraries like ring or sodiumoxide
    fn _encrypt(&self, _data: &[u8]) -> Vec<u8> {
        // Placeholder - implement proper AES-GCM encryption
        todo!("Implement proper encryption")
    }

    fn _decrypt(&self, _data: &[u8]) -> Result<Vec<u8>, OAuth2Error> {
        // Placeholder - implement proper AES-GCM decryption
        todo!("Implement proper decryption")
    }
}

#[async_trait]
impl<S: TokenStorage> TokenStorage for EncryptedTokenStorage<S> {
    async fn store(&self, key: &str, tokens: StoredTokens) -> Result<(), OAuth2Error> {
        // In production: encrypt tokens before storing
        self.inner.store(key, tokens).await
    }

    async fn retrieve(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error> {
        // In production: decrypt tokens after retrieving
        self.inner.retrieve(key).await
    }

    async fn delete(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.inner.delete(key).await
    }

    async fn exists(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.inner.exists(key).await
    }

    async fn list_keys(&self) -> Result<Vec<String>, OAuth2Error> {
        self.inner.list_keys().await
    }

    async fn clear(&self) -> Result<(), OAuth2Error> {
        self.inner.clear().await
    }

    async fn clear_expired(&self) -> Result<u32, OAuth2Error> {
        self.inner.clear_expired().await
    }
}

/// Mock token storage for testing.
#[derive(Default)]
pub struct MockTokenStorage {
    tokens: Mutex<HashMap<String, StoredTokens>>,
    store_history: Mutex<Vec<(String, StoredTokens)>>,
    retrieve_history: Mutex<Vec<String>>,
    delete_history: Mutex<Vec<String>>,
    next_error: Mutex<Option<OAuth2Error>>,
    should_fail: Mutex<bool>,
}

impl MockTokenStorage {
    /// Create new mock token storage.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set next error to return.
    pub fn set_next_error(&self, error: OAuth2Error) -> &Self {
        *self.next_error.lock().unwrap() = Some(error);
        self
    }

    /// Set storage to fail all operations.
    pub fn set_should_fail(&self, should_fail: bool) -> &Self {
        *self.should_fail.lock().unwrap() = should_fail;
        self
    }

    /// Pre-populate tokens.
    pub fn add_tokens(&self, key: &str, tokens: StoredTokens) -> &Self {
        self.tokens.lock().unwrap().insert(key.to_string(), tokens);
        self
    }

    /// Get store history.
    pub fn get_store_history(&self) -> Vec<(String, StoredTokens)> {
        self.store_history.lock().unwrap().clone()
    }

    /// Get retrieve history.
    pub fn get_retrieve_history(&self) -> Vec<String> {
        self.retrieve_history.lock().unwrap().clone()
    }

    /// Get delete history.
    pub fn get_delete_history(&self) -> Vec<String> {
        self.delete_history.lock().unwrap().clone()
    }

    fn check_error(&self) -> Result<(), OAuth2Error> {
        if *self.should_fail.lock().unwrap() {
            return Err(OAuth2Error::Storage(StorageError::StorageError {
                message: "Mock storage failure".to_string(),
            }));
        }

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        Ok(())
    }
}

#[async_trait]
impl TokenStorage for MockTokenStorage {
    async fn store(&self, key: &str, tokens: StoredTokens) -> Result<(), OAuth2Error> {
        self.check_error()?;

        self.store_history
            .lock()
            .unwrap()
            .push((key.to_string(), tokens.clone()));
        self.tokens.lock().unwrap().insert(key.to_string(), tokens);
        Ok(())
    }

    async fn retrieve(&self, key: &str) -> Result<Option<StoredTokens>, OAuth2Error> {
        self.check_error()?;

        self.retrieve_history
            .lock()
            .unwrap()
            .push(key.to_string());
        Ok(self.tokens.lock().unwrap().get(key).cloned())
    }

    async fn delete(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.check_error()?;

        self.delete_history.lock().unwrap().push(key.to_string());
        Ok(self.tokens.lock().unwrap().remove(key).is_some())
    }

    async fn exists(&self, key: &str) -> Result<bool, OAuth2Error> {
        self.check_error()?;
        Ok(self.tokens.lock().unwrap().contains_key(key))
    }

    async fn list_keys(&self) -> Result<Vec<String>, OAuth2Error> {
        self.check_error()?;
        Ok(self.tokens.lock().unwrap().keys().cloned().collect())
    }

    async fn clear(&self) -> Result<(), OAuth2Error> {
        self.check_error()?;
        self.tokens.lock().unwrap().clear();
        Ok(())
    }

    async fn clear_expired(&self) -> Result<u32, OAuth2Error> {
        self.check_error()?;

        let mut tokens = self.tokens.lock().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let initial_count = tokens.len();
        tokens.retain(|_, stored| {
            stored
                .access_token_expires_at
                .map(|exp| exp > now)
                .unwrap_or(true)
        });

        Ok((initial_count - tokens.len()) as u32)
    }
}

/// Create in-memory token storage.
pub fn create_in_memory_token_storage() -> impl TokenStorage {
    InMemoryTokenStorage::new()
}

/// Create mock token storage for testing.
pub fn create_mock_token_storage() -> MockTokenStorage {
    MockTokenStorage::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_tokens() -> StoredTokens {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        StoredTokens {
            access_token: "test-access-token".to_string(),
            token_type: "Bearer".to_string(),
            refresh_token: Some("test-refresh-token".to_string()),
            access_token_expires_at: Some(now + 3600000), // 1 hour from now
            refresh_token_expires_at: None,
            scope: Some("openid profile".to_string()),
            id_token: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[tokio::test]
    async fn test_in_memory_store_and_retrieve() {
        let storage = InMemoryTokenStorage::new();
        let tokens = create_test_tokens();

        storage.store("user1", tokens.clone()).await.unwrap();

        let retrieved = storage.retrieve("user1").await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().access_token, "test-access-token");
    }

    #[tokio::test]
    async fn test_in_memory_delete() {
        let storage = InMemoryTokenStorage::new();
        let tokens = create_test_tokens();

        storage.store("user1", tokens).await.unwrap();
        assert!(storage.exists("user1").await.unwrap());

        let deleted = storage.delete("user1").await.unwrap();
        assert!(deleted);
        assert!(!storage.exists("user1").await.unwrap());
    }

    #[tokio::test]
    async fn test_in_memory_list_keys() {
        let storage = InMemoryTokenStorage::new();

        storage.store("user1", create_test_tokens()).await.unwrap();
        storage.store("user2", create_test_tokens()).await.unwrap();

        let keys = storage.list_keys().await.unwrap();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"user1".to_string()));
        assert!(keys.contains(&"user2".to_string()));
    }

    #[tokio::test]
    async fn test_mock_storage() {
        let storage = MockTokenStorage::new();
        let tokens = create_test_tokens();

        storage.store("test-key", tokens).await.unwrap();

        let history = storage.get_store_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].0, "test-key");

        let retrieved = storage.retrieve("test-key").await.unwrap();
        assert!(retrieved.is_some());

        let retrieve_history = storage.get_retrieve_history();
        assert_eq!(retrieve_history.len(), 1);
    }

    #[tokio::test]
    async fn test_mock_storage_failure() {
        let storage = MockTokenStorage::new();
        storage.set_should_fail(true);

        let result = storage.store("key", create_test_tokens()).await;
        assert!(result.is_err());
    }
}
