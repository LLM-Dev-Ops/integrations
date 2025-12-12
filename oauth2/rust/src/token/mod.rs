//! Token Management
//!
//! Token lifecycle management including storage, refresh, introspection, and revocation.
//!
//! This module provides:
//!
//! - **Token Storage**: Secure storage implementations for OAuth2 tokens
//! - **Token Manager**: Token lifecycle management with automatic refresh
//! - **Token Introspection**: RFC 7662 token introspection
//! - **Token Revocation**: RFC 7009 token revocation

pub mod introspection;
pub mod manager;
pub mod revocation;
pub mod storage;

// Token Storage
pub use storage::{
    create_in_memory_token_storage, create_mock_token_storage, EncryptedTokenStorage,
    InMemoryTokenStorage, MockTokenStorage, TokenStorage,
};

// Token Manager
pub use manager::{
    create_mock_token_manager, DefaultTokenManager, MockTokenManager, TokenManager,
    TokenManagerConfig,
};

// Token Introspection
pub use introspection::{
    create_mock_token_introspector, DefaultTokenIntrospector, MockTokenIntrospector,
    TokenIntrospector,
};

// Token Revocation
pub use revocation::{
    create_mock_token_revoker, DefaultTokenRevoker, MockTokenRevoker, TokenRevoker,
};
