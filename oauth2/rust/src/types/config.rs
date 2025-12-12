//! Configuration Types
//!
//! OAuth2 client configuration types.

use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

/// OAuth2 client configuration.
#[derive(Clone)]
pub struct OAuth2Config {
    /// Provider configuration.
    pub provider: ProviderConfig,
    /// Client credentials.
    pub credentials: ClientCredentials,
    /// Default scopes to request.
    pub default_scopes: Vec<String>,
    /// HTTP timeout.
    pub timeout: Duration,
    /// Enable automatic token refresh.
    pub auto_refresh: bool,
    /// Refresh tokens this many seconds before expiry.
    pub refresh_threshold_secs: u64,
}

impl Default for OAuth2Config {
    fn default() -> Self {
        Self {
            provider: ProviderConfig::default(),
            credentials: ClientCredentials::default(),
            default_scopes: Vec::new(),
            timeout: Duration::from_secs(30),
            auto_refresh: true,
            refresh_threshold_secs: 300,
        }
    }
}

/// OAuth2 provider endpoint configuration.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// Authorization endpoint URL.
    pub authorization_endpoint: String,
    /// Token endpoint URL.
    pub token_endpoint: String,
    /// Device authorization endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_authorization_endpoint: Option<String>,
    /// Token introspection endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub introspection_endpoint: Option<String>,
    /// Token revocation endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revocation_endpoint: Option<String>,
    /// OIDC userinfo endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub userinfo_endpoint: Option<String>,
    /// JWKS URI for JWT validation (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jwks_uri: Option<String>,
    /// Issuer identifier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
}

/// Client credentials for OAuth2 authentication.
#[derive(Clone)]
pub struct ClientCredentials {
    /// Client identifier.
    pub client_id: String,
    /// Client secret (for confidential clients).
    pub client_secret: Option<SecretString>,
    /// Client authentication method.
    pub auth_method: ClientAuthMethod,
}

impl Default for ClientCredentials {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: None,
            auth_method: ClientAuthMethod::ClientSecretBasic,
        }
    }
}

impl std::fmt::Debug for ClientCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientCredentials")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .field("auth_method", &self.auth_method)
            .finish()
    }
}

/// Client authentication method.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientAuthMethod {
    /// client_id and client_secret in request body.
    ClientSecretPost,
    /// HTTP Basic Authentication header.
    ClientSecretBasic,
    /// No client authentication (public client).
    None,
}

impl Default for ClientAuthMethod {
    fn default() -> Self {
        Self::ClientSecretBasic
    }
}

/// Grant type.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GrantType {
    #[serde(rename = "authorization_code")]
    AuthorizationCode,
    #[serde(rename = "client_credentials")]
    ClientCredentials,
    #[serde(rename = "refresh_token")]
    RefreshToken,
    #[serde(rename = "urn:ietf:params:oauth:grant-type:device_code")]
    DeviceCode,
}

impl GrantType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AuthorizationCode => "authorization_code",
            Self::ClientCredentials => "client_credentials",
            Self::RefreshToken => "refresh_token",
            Self::DeviceCode => "urn:ietf:params:oauth:grant-type:device_code",
        }
    }
}

/// OIDC Discovery document.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OIDCDiscoveryDocument {
    /// Issuer identifier.
    pub issuer: String,
    /// Authorization endpoint URL.
    pub authorization_endpoint: String,
    /// Token endpoint URL.
    pub token_endpoint: String,
    /// Userinfo endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub userinfo_endpoint: Option<String>,
    /// JWKS URI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jwks_uri: Option<String>,
    /// Registration endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registration_endpoint: Option<String>,
    /// Supported scopes.
    #[serde(default)]
    pub scopes_supported: Vec<String>,
    /// Supported response types.
    #[serde(default)]
    pub response_types_supported: Vec<String>,
    /// Supported grant types.
    #[serde(default)]
    pub grant_types_supported: Vec<String>,
    /// Token endpoint auth methods.
    #[serde(default)]
    pub token_endpoint_auth_methods_supported: Vec<String>,
    /// Device authorization endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_authorization_endpoint: Option<String>,
    /// Revocation endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revocation_endpoint: Option<String>,
    /// Introspection endpoint (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub introspection_endpoint: Option<String>,
}

impl OIDCDiscoveryDocument {
    /// Convert to provider config.
    pub fn to_provider_config(&self) -> ProviderConfig {
        ProviderConfig {
            authorization_endpoint: self.authorization_endpoint.clone(),
            token_endpoint: self.token_endpoint.clone(),
            device_authorization_endpoint: self.device_authorization_endpoint.clone(),
            introspection_endpoint: self.introspection_endpoint.clone(),
            revocation_endpoint: self.revocation_endpoint.clone(),
            userinfo_endpoint: self.userinfo_endpoint.clone(),
            jwks_uri: self.jwks_uri.clone(),
            issuer: Some(self.issuer.clone()),
        }
    }
}

/// Default configuration values.
pub const DEFAULT_TIMEOUT_MS: u64 = 30000;
pub const DEFAULT_REFRESH_THRESHOLD_SECS: u64 = 300;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grant_type_as_str() {
        assert_eq!(GrantType::AuthorizationCode.as_str(), "authorization_code");
        assert_eq!(GrantType::ClientCredentials.as_str(), "client_credentials");
        assert_eq!(GrantType::RefreshToken.as_str(), "refresh_token");
        assert_eq!(
            GrantType::DeviceCode.as_str(),
            "urn:ietf:params:oauth:grant-type:device_code"
        );
    }

    #[test]
    fn test_discovery_to_provider_config() {
        let doc = OIDCDiscoveryDocument {
            issuer: "https://example.com".to_string(),
            authorization_endpoint: "https://example.com/authorize".to_string(),
            token_endpoint: "https://example.com/token".to_string(),
            userinfo_endpoint: Some("https://example.com/userinfo".to_string()),
            jwks_uri: Some("https://example.com/.well-known/jwks.json".to_string()),
            registration_endpoint: None,
            scopes_supported: vec!["openid".to_string()],
            response_types_supported: vec!["code".to_string()],
            grant_types_supported: vec!["authorization_code".to_string()],
            token_endpoint_auth_methods_supported: vec!["client_secret_basic".to_string()],
            device_authorization_endpoint: None,
            revocation_endpoint: None,
            introspection_endpoint: None,
        };

        let config = doc.to_provider_config();
        assert_eq!(config.authorization_endpoint, "https://example.com/authorize");
        assert_eq!(config.token_endpoint, "https://example.com/token");
        assert_eq!(config.issuer, Some("https://example.com".to_string()));
    }
}
