mod api_key;
mod auth_manager;

pub use api_key::ApiKeyProvider;
pub use auth_manager::{AuthManager, BearerAuthManager, OpenAIAuthManager};

use crate::errors::OpenAIResult;
use async_trait::async_trait;
use http::HeaderMap;

/// Trait for authentication providers
#[async_trait]
pub trait AuthProvider: Send + Sync {
    /// Authenticates the request by adding appropriate headers
    async fn authenticate(&self, headers: &mut HeaderMap) -> OpenAIResult<()>;

    /// Checks if the authentication credentials are valid
    fn is_valid(&self) -> bool;
}
