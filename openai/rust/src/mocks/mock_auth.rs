//! Mock authentication managers for testing

use crate::auth::{AuthManager, AuthProvider};
use crate::errors::OpenAIResult;
use async_trait::async_trait;
use http::{HeaderMap, HeaderValue};
use std::sync::{Arc, Mutex};

/// Mock authentication manager that allows configuring auth behavior
#[derive(Clone)]
pub struct MockAuthManager {
    inner: Arc<Mutex<MockAuthManagerInner>>,
}

struct MockAuthManagerInner {
    should_succeed: bool,
    error_message: Option<String>,
    auth_calls: usize,
}

impl MockAuthManager {
    /// Create a new mock auth manager that succeeds by default
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MockAuthManagerInner {
                should_succeed: true,
                error_message: None,
                auth_calls: 0,
            })),
        }
    }

    /// Configure the mock to fail with the given error message
    pub fn with_error(self, error: impl Into<String>) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.should_succeed = false;
        inner.error_message = Some(error.into());
        drop(inner);
        self
    }

    /// Configure the mock to succeed
    pub fn with_success(self) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.should_succeed = true;
        inner.error_message = None;
        drop(inner);
        self
    }

    /// Get the number of times apply_auth was called
    pub fn auth_call_count(&self) -> usize {
        let inner = self.inner.lock().unwrap();
        inner.auth_calls
    }

    /// Reset the mock
    pub fn reset(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.should_succeed = true;
        inner.error_message = None;
        inner.auth_calls = 0;
    }
}

impl Default for MockAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AuthManager for MockAuthManager {
    async fn apply_auth(&self, headers: &mut HeaderMap) -> OpenAIResult<()> {
        let mut inner = self.inner.lock().unwrap();
        inner.auth_calls += 1;

        if inner.should_succeed {
            headers.insert(
                "Authorization",
                HeaderValue::from_static("Bearer mock-api-key"),
            );
            Ok(())
        } else {
            let error_msg = inner
                .error_message
                .clone()
                .unwrap_or_else(|| "Mock authentication failed".to_string());
            Err(crate::errors::OpenAIError::authentication(error_msg))
        }
    }

    fn get_organization(&self) -> Option<String> {
        None
    }

    fn get_project(&self) -> Option<String> {
        None
    }
}

/// Mock authentication provider for testing
#[derive(Clone)]
pub struct MockAuthProvider {
    should_succeed: bool,
    is_valid: bool,
}

impl MockAuthProvider {
    /// Create a new mock auth provider that succeeds and is valid by default
    pub fn new() -> Self {
        Self {
            should_succeed: true,
            is_valid: true,
        }
    }

    /// Configure the mock to fail authentication
    pub fn with_auth_failure(mut self) -> Self {
        self.should_succeed = false;
        self
    }

    /// Configure the mock to be invalid
    pub fn with_invalid(mut self) -> Self {
        self.is_valid = false;
        self
    }
}

impl Default for MockAuthProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AuthProvider for MockAuthProvider {
    async fn authenticate(&self, headers: &mut HeaderMap) -> OpenAIResult<()> {
        if self.should_succeed {
            headers.insert(
                "Authorization",
                HeaderValue::from_static("Bearer mock-api-key"),
            );
            Ok(())
        } else {
            Err(crate::errors::OpenAIError::authentication(
                "Mock authentication failed",
            ))
        }
    }

    fn is_valid(&self) -> bool {
        self.is_valid
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_auth_manager_success() {
        let mock = MockAuthManager::new();
        let mut headers = HeaderMap::new();

        let result = mock.apply_auth(&mut headers).await;
        assert!(result.is_ok());
        assert!(headers.contains_key("Authorization"));
        assert_eq!(mock.auth_call_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_auth_manager_failure() {
        let mock = MockAuthManager::new().with_error("Invalid API key");
        let mut headers = HeaderMap::new();

        let result = mock.apply_auth(&mut headers).await;
        assert!(result.is_err());
        assert_eq!(mock.auth_call_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_auth_provider() {
        let provider = MockAuthProvider::new();
        assert!(provider.is_valid());

        let mut headers = HeaderMap::new();
        let result = provider.authenticate(&mut headers).await;
        assert!(result.is_ok());
    }
}
