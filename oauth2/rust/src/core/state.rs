//! State Management
//!
//! OAuth2 state parameter generation and validation.

use rand::Rng;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::{AuthorizationError, OAuth2Error};
use crate::types::StateMetadata;

/// State manager interface (for dependency injection).
pub trait StateManager: Send + Sync {
    /// Generate a new state parameter with metadata.
    fn generate(&self, metadata: StateMetadata) -> String;

    /// Validate and consume a state parameter.
    fn consume(&self, state: &str) -> Option<StateMetadata>;

    /// Check if state exists.
    fn exists(&self, state: &str) -> bool;

    /// Clear expired states.
    fn clear_expired(&self);
}

/// In-memory state manager implementation.
pub struct InMemoryStateManager {
    states: Mutex<HashMap<String, StateMetadata>>,
    max_age_ms: u64,
}

impl InMemoryStateManager {
    /// Create new state manager with default TTL (10 minutes).
    pub fn new() -> Self {
        Self::with_max_age(Duration::from_secs(600))
    }

    /// Create state manager with custom TTL.
    pub fn with_max_age(max_age: Duration) -> Self {
        Self {
            states: Mutex::new(HashMap::new()),
            max_age_ms: max_age.as_millis() as u64,
        }
    }

    fn generate_random_state() -> String {
        let mut rng = rand::thread_rng();
        let bytes: [u8; 32] = rng.gen();
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes)
    }
}

impl Default for InMemoryStateManager {
    fn default() -> Self {
        Self::new()
    }
}

impl StateManager for InMemoryStateManager {
    fn generate(&self, metadata: StateMetadata) -> String {
        let state = Self::generate_random_state();
        self.states
            .lock()
            .unwrap()
            .insert(state.clone(), metadata);
        state
    }

    fn consume(&self, state: &str) -> Option<StateMetadata> {
        let mut states = self.states.lock().unwrap();
        let metadata = states.remove(state)?;

        // Check if expired
        if metadata.is_expired(self.max_age_ms) {
            return None;
        }

        Some(metadata)
    }

    fn exists(&self, state: &str) -> bool {
        let states = self.states.lock().unwrap();
        if let Some(metadata) = states.get(state) {
            !metadata.is_expired(self.max_age_ms)
        } else {
            false
        }
    }

    fn clear_expired(&self) {
        let mut states = self.states.lock().unwrap();
        states.retain(|_, metadata| !metadata.is_expired(self.max_age_ms));
    }
}

/// Mock state manager for testing.
#[derive(Default)]
pub struct MockStateManager {
    states: Mutex<HashMap<String, StateMetadata>>,
    generate_history: Mutex<Vec<StateMetadata>>,
    consume_history: Mutex<Vec<String>>,
    next_state: Mutex<Option<String>>,
}

impl MockStateManager {
    /// Create new mock state manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the next state to generate.
    pub fn set_next_state(&self, state: String) -> &Self {
        *self.next_state.lock().unwrap() = Some(state);
        self
    }

    /// Pre-populate a state.
    pub fn add_state(&self, state: String, metadata: StateMetadata) -> &Self {
        self.states.lock().unwrap().insert(state, metadata);
        self
    }

    /// Get generate history.
    pub fn get_generate_history(&self) -> Vec<StateMetadata> {
        self.generate_history.lock().unwrap().clone()
    }

    /// Get consume history.
    pub fn get_consume_history(&self) -> Vec<String> {
        self.consume_history.lock().unwrap().clone()
    }
}

impl StateManager for MockStateManager {
    fn generate(&self, metadata: StateMetadata) -> String {
        self.generate_history.lock().unwrap().push(metadata.clone());

        let state = self
            .next_state
            .lock()
            .unwrap()
            .take()
            .unwrap_or_else(|| format!("mock-state-{}", rand::random::<u32>()));

        self.states.lock().unwrap().insert(state.clone(), metadata);
        state
    }

    fn consume(&self, state: &str) -> Option<StateMetadata> {
        self.consume_history
            .lock()
            .unwrap()
            .push(state.to_string());
        self.states.lock().unwrap().remove(state)
    }

    fn exists(&self, state: &str) -> bool {
        self.states.lock().unwrap().contains_key(state)
    }

    fn clear_expired(&self) {
        // No-op for mock
    }
}

/// Validate state parameter.
pub fn validate_state(
    received: &str,
    state_manager: &dyn StateManager,
) -> Result<StateMetadata, OAuth2Error> {
    state_manager.consume(received).ok_or_else(|| {
        OAuth2Error::Authorization(AuthorizationError::StateMismatch {
            expected: "valid state".to_string(),
            received: received.to_string(),
        })
    })
}

/// Create in-memory state manager.
pub fn create_state_manager() -> impl StateManager {
    InMemoryStateManager::new()
}

/// Create mock state manager for testing.
pub fn create_mock_state_manager() -> MockStateManager {
    MockStateManager::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_generation() {
        let manager = InMemoryStateManager::new();
        let metadata = StateMetadata::new(
            "https://example.com/callback".to_string(),
            vec!["openid".to_string()],
        );

        let state = manager.generate(metadata);
        assert!(!state.is_empty());
        assert!(manager.exists(&state));
    }

    #[test]
    fn test_state_consumption() {
        let manager = InMemoryStateManager::new();
        let metadata = StateMetadata::new(
            "https://example.com/callback".to_string(),
            vec!["openid".to_string()],
        );

        let state = manager.generate(metadata);
        assert!(manager.exists(&state));

        let consumed = manager.consume(&state);
        assert!(consumed.is_some());
        assert_eq!(consumed.unwrap().redirect_uri, "https://example.com/callback");

        // State should be consumed
        assert!(!manager.exists(&state));
        assert!(manager.consume(&state).is_none());
    }

    #[test]
    fn test_mock_state_manager() {
        let manager = MockStateManager::new();
        manager.set_next_state("test-state-123".to_string());

        let metadata = StateMetadata::new(
            "https://example.com/callback".to_string(),
            Vec::new(),
        );

        let state = manager.generate(metadata);
        assert_eq!(state, "test-state-123");

        let history = manager.get_generate_history();
        assert_eq!(history.len(), 1);
    }
}
