//! Mock implementations for testing
//!
//! This module provides mock implementations of the core traits used throughout
//! the OpenAI integration, following the London School TDD approach. These mocks
//! allow for isolated unit testing of services without actual HTTP calls or
//! external dependencies.

#[cfg(test)]
mod mock_auth;
#[cfg(test)]
mod mock_resilience;
#[cfg(test)]
mod mock_transport;

#[cfg(test)]
pub use mock_auth::{MockAuthManager, MockAuthProvider};
#[cfg(test)]
pub use mock_resilience::MockResilienceOrchestrator;
#[cfg(test)]
pub use mock_transport::MockHttpTransport;
