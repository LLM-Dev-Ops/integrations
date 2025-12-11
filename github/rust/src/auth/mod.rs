//! Authentication mechanisms for GitHub API.

use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult};
use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Authentication method for GitHub API.
#[derive(Debug, Clone)]
pub enum AuthMethod {
    /// Personal Access Token (classic or fine-grained).
    Pat(SecretString),
    /// GitHub App authentication.
    App(AppAuth),
    /// OAuth token.
    OAuth(OAuthToken),
    /// GitHub Actions token (from GITHUB_TOKEN).
    Actions(SecretString),
}

impl AuthMethod {
    /// Creates a PAT authentication method.
    pub fn pat(token: impl Into<String>) -> Self {
        Self::Pat(SecretString::new(token.into()))
    }

    /// Creates an OAuth authentication method.
    pub fn oauth(token: impl Into<String>) -> Self {
        Self::OAuth(OAuthToken {
            access_token: SecretString::new(token.into()),
            refresh_token: None,
            expires_at: None,
        })
    }

    /// Creates a GitHub Actions token authentication method.
    pub fn actions(token: impl Into<String>) -> Self {
        Self::Actions(SecretString::new(token.into()))
    }

    /// Creates a GitHub App authentication method.
    pub fn app(app_id: u64, private_key: impl Into<String>) -> Self {
        Self::App(AppAuth {
            app_id,
            private_key: SecretString::new(private_key.into()),
            installation_id: None,
        })
    }

    /// Gets the token prefix for logging.
    pub fn token_prefix(&self) -> &'static str {
        match self {
            Self::Pat(t) => {
                let exposed = t.expose_secret();
                if exposed.starts_with("ghp_") {
                    "ghp_***"
                } else if exposed.starts_with("github_pat_") {
                    "github_pat_***"
                } else {
                    "***"
                }
            }
            Self::OAuth(_) => "gho_***",
            Self::Actions(_) => "ghs_***",
            Self::App(_) => "app_jwt",
        }
    }
}

/// OAuth token with optional refresh.
#[derive(Debug, Clone)]
pub struct OAuthToken {
    /// Access token.
    pub access_token: SecretString,
    /// Refresh token.
    pub refresh_token: Option<SecretString>,
    /// Token expiration time.
    pub expires_at: Option<DateTime<Utc>>,
}

/// GitHub App authentication configuration.
#[derive(Debug, Clone)]
pub struct AppAuth {
    /// GitHub App ID.
    pub app_id: u64,
    /// Private key (PEM format).
    pub private_key: SecretString,
    /// Installation ID (optional, for installation token).
    pub installation_id: Option<u64>,
}

impl AppAuth {
    /// Sets the installation ID.
    pub fn with_installation(mut self, installation_id: u64) -> Self {
        self.installation_id = Some(installation_id);
        self
    }
}

/// JWT claims for GitHub App authentication.
#[derive(Debug, Serialize, Deserialize)]
struct JwtClaims {
    /// Issued at (Unix timestamp).
    iat: i64,
    /// Expiration (Unix timestamp).
    exp: i64,
    /// Issuer (App ID).
    iss: String,
}

/// Installation token response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationToken {
    /// Access token.
    pub token: String,
    /// Expiration time.
    pub expires_at: DateTime<Utc>,
    /// Permissions granted.
    pub permissions: std::collections::HashMap<String, String>,
    /// Repository selection.
    pub repository_selection: Option<String>,
}

/// Cached installation token.
#[derive(Debug, Clone)]
struct CachedToken {
    token: SecretString,
    expires_at: DateTime<Utc>,
}

/// Authentication manager for handling token refresh and caching.
pub struct AuthManager {
    method: AuthMethod,
    cached_installation_token: Arc<RwLock<Option<CachedToken>>>,
}

impl AuthManager {
    /// Creates a new authentication manager.
    pub fn new(method: AuthMethod) -> Self {
        Self {
            method,
            cached_installation_token: Arc::new(RwLock::new(None)),
        }
    }

    /// Gets the authentication method.
    pub fn method(&self) -> &AuthMethod {
        &self.method
    }

    /// Generates the Authorization header value.
    pub async fn get_auth_header(&self) -> GitHubResult<String> {
        match &self.method {
            AuthMethod::Pat(token) => Ok(format!("Bearer {}", token.expose_secret())),
            AuthMethod::OAuth(oauth) => Ok(format!("Bearer {}", oauth.access_token.expose_secret())),
            AuthMethod::Actions(token) => Ok(format!("Bearer {}", token.expose_secret())),
            AuthMethod::App(app) => {
                if app.installation_id.is_some() {
                    // For installation tokens, check cache first
                    let cached = self.get_cached_installation_token().await;
                    if let Some(token) = cached {
                        return Ok(format!("Bearer {}", token.expose_secret()));
                    }
                }
                // Generate JWT for app-level auth
                let jwt = self.generate_jwt(app)?;
                Ok(format!("Bearer {}", jwt))
            }
        }
    }

    /// Generates a JWT for GitHub App authentication.
    fn generate_jwt(&self, app: &AppAuth) -> GitHubResult<String> {
        let now = Utc::now();
        // Issued at: 60 seconds in the past for clock drift tolerance
        let iat = (now - Duration::seconds(60)).timestamp();
        // Expires in 9 minutes (max allowed is 10)
        let exp = (now + Duration::minutes(9)).timestamp();

        let claims = JwtClaims {
            iat,
            exp,
            iss: app.app_id.to_string(),
        };

        let key = EncodingKey::from_rsa_pem(app.private_key.expose_secret().as_bytes())
            .map_err(|e| {
                GitHubError::new(
                    GitHubErrorKind::InvalidAppCredentials,
                    format!("Failed to parse private key: {}", e),
                )
            })?;

        let header = Header::new(Algorithm::RS256);
        encode(&header, &claims, &key).map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::AppAuthenticationFailed,
                format!("Failed to generate JWT: {}", e),
            )
        })
    }

    /// Gets cached installation token if valid.
    async fn get_cached_installation_token(&self) -> Option<SecretString> {
        let cache = self.cached_installation_token.read().await;
        if let Some(ref cached) = *cache {
            // Check if token is still valid (5 minute buffer)
            if cached.expires_at > Utc::now() + Duration::minutes(5) {
                return Some(cached.token.clone());
            }
        }
        None
    }

    /// Caches an installation token.
    pub async fn cache_installation_token(&self, token: &str, expires_at: DateTime<Utc>) {
        let mut cache = self.cached_installation_token.write().await;
        *cache = Some(CachedToken {
            token: SecretString::new(token.to_string()),
            expires_at,
        });
    }

    /// Clears the installation token cache.
    pub async fn clear_cache(&self) {
        let mut cache = self.cached_installation_token.write().await;
        *cache = None;
    }

    /// Returns true if authentication requires an installation token.
    pub fn requires_installation_token(&self) -> bool {
        matches!(&self.method, AuthMethod::App(app) if app.installation_id.is_some())
    }

    /// Gets the installation ID if applicable.
    pub fn installation_id(&self) -> Option<u64> {
        match &self.method {
            AuthMethod::App(app) => app.installation_id,
            _ => None,
        }
    }
}

/// Credential provider trait for dynamic credential resolution.
#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Gets the current authentication method.
    async fn get_auth(&self) -> GitHubResult<AuthMethod>;

    /// Refreshes credentials if needed.
    async fn refresh(&self) -> GitHubResult<()>;

    /// Checks if credentials are valid.
    async fn is_valid(&self) -> bool;
}

/// Static credential provider using fixed credentials.
pub struct StaticCredentialProvider {
    method: AuthMethod,
}

impl StaticCredentialProvider {
    /// Creates a new static credential provider.
    pub fn new(method: AuthMethod) -> Self {
        Self { method }
    }
}

#[async_trait]
impl CredentialProvider for StaticCredentialProvider {
    async fn get_auth(&self) -> GitHubResult<AuthMethod> {
        Ok(self.method.clone())
    }

    async fn refresh(&self) -> GitHubResult<()> {
        // Static credentials cannot be refreshed
        Ok(())
    }

    async fn is_valid(&self) -> bool {
        true
    }
}

/// Environment variable credential provider.
pub struct EnvCredentialProvider {
    token_var: String,
}

impl EnvCredentialProvider {
    /// Creates a provider from GITHUB_TOKEN environment variable.
    pub fn from_github_token() -> Self {
        Self {
            token_var: "GITHUB_TOKEN".to_string(),
        }
    }

    /// Creates a provider from a custom environment variable.
    pub fn from_env_var(var_name: impl Into<String>) -> Self {
        Self {
            token_var: var_name.into(),
        }
    }
}

#[async_trait]
impl CredentialProvider for EnvCredentialProvider {
    async fn get_auth(&self) -> GitHubResult<AuthMethod> {
        std::env::var(&self.token_var)
            .map(AuthMethod::pat)
            .map_err(|_| {
                GitHubError::new(
                    GitHubErrorKind::MissingAuth,
                    format!("Environment variable {} not set", self.token_var),
                )
            })
    }

    async fn refresh(&self) -> GitHubResult<()> {
        // Environment variables are re-read each time
        Ok(())
    }

    async fn is_valid(&self) -> bool {
        std::env::var(&self.token_var).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pat_auth() {
        let auth = AuthMethod::pat("ghp_xxxxxxxxxxxx");
        assert_eq!(auth.token_prefix(), "ghp_***");
    }

    #[test]
    fn test_oauth_auth() {
        let auth = AuthMethod::oauth("gho_xxxxxxxxxxxx");
        assert_eq!(auth.token_prefix(), "gho_***");
    }

    #[test]
    fn test_app_auth() {
        let auth = AuthMethod::app(12345, "private_key_pem");
        assert_eq!(auth.token_prefix(), "app_jwt");
    }

    #[tokio::test]
    async fn test_auth_manager_pat() {
        let manager = AuthManager::new(AuthMethod::pat("ghp_test"));
        let header = manager.get_auth_header().await.unwrap();
        assert_eq!(header, "Bearer ghp_test");
    }

    #[tokio::test]
    async fn test_static_credential_provider() {
        let provider = StaticCredentialProvider::new(AuthMethod::pat("test"));
        assert!(provider.is_valid().await);
    }
}
