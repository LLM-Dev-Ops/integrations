//! Configuration Builder
//!
//! Fluent builder for OAuth2 configuration.

use std::time::Duration;

use crate::error::{ConfigurationError, OAuth2Error};
use crate::types::{ClientAuthMethod, ClientCredentials, GrantType, OAuth2Config, ProviderConfig};
use secrecy::SecretString;

/// OAuth2 configuration builder.
#[derive(Default)]
pub struct OAuth2ConfigBuilder {
    client_id: Option<String>,
    client_secret: Option<SecretString>,
    auth_method: Option<ClientAuthMethod>,
    authorization_endpoint: Option<String>,
    token_endpoint: Option<String>,
    revocation_endpoint: Option<String>,
    introspection_endpoint: Option<String>,
    device_authorization_endpoint: Option<String>,
    userinfo_endpoint: Option<String>,
    jwks_uri: Option<String>,
    issuer: Option<String>,
    scopes_supported: Vec<String>,
    grant_types_supported: Vec<GrantType>,
    default_scopes: Vec<String>,
    timeout: Duration,
    enable_pkce: bool,
    enable_state: bool,
}

impl OAuth2ConfigBuilder {
    /// Create new configuration builder.
    pub fn new() -> Self {
        Self {
            timeout: Duration::from_secs(30),
            enable_pkce: true,
            enable_state: true,
            ..Default::default()
        }
    }

    /// Set client ID.
    pub fn client_id(mut self, client_id: impl Into<String>) -> Self {
        self.client_id = Some(client_id.into());
        self
    }

    /// Set client secret.
    pub fn client_secret(mut self, client_secret: impl Into<String>) -> Self {
        self.client_secret = Some(SecretString::new(client_secret.into()));
        self
    }

    /// Set client authentication method.
    pub fn auth_method(mut self, method: ClientAuthMethod) -> Self {
        self.auth_method = Some(method);
        self
    }

    /// Set authorization endpoint.
    pub fn authorization_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.authorization_endpoint = Some(endpoint.into());
        self
    }

    /// Set token endpoint.
    pub fn token_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.token_endpoint = Some(endpoint.into());
        self
    }

    /// Set revocation endpoint.
    pub fn revocation_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.revocation_endpoint = Some(endpoint.into());
        self
    }

    /// Set introspection endpoint.
    pub fn introspection_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.introspection_endpoint = Some(endpoint.into());
        self
    }

    /// Set device authorization endpoint.
    pub fn device_authorization_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.device_authorization_endpoint = Some(endpoint.into());
        self
    }

    /// Set userinfo endpoint.
    pub fn userinfo_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.userinfo_endpoint = Some(endpoint.into());
        self
    }

    /// Set JWKS URI.
    pub fn jwks_uri(mut self, uri: impl Into<String>) -> Self {
        self.jwks_uri = Some(uri.into());
        self
    }

    /// Set issuer.
    pub fn issuer(mut self, issuer: impl Into<String>) -> Self {
        self.issuer = Some(issuer.into());
        self
    }

    /// Set default scopes.
    pub fn default_scopes(mut self, scopes: Vec<String>) -> Self {
        self.default_scopes = scopes;
        self
    }

    /// Add a default scope.
    pub fn add_default_scope(mut self, scope: impl Into<String>) -> Self {
        self.default_scopes.push(scope.into());
        self
    }

    /// Set supported scopes.
    pub fn scopes_supported(mut self, scopes: Vec<String>) -> Self {
        self.scopes_supported = scopes;
        self
    }

    /// Set supported grant types.
    pub fn grant_types_supported(mut self, grant_types: Vec<GrantType>) -> Self {
        self.grant_types_supported = grant_types;
        self
    }

    /// Set request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Enable or disable PKCE.
    pub fn enable_pkce(mut self, enable: bool) -> Self {
        self.enable_pkce = enable;
        self
    }

    /// Enable or disable state parameter.
    pub fn enable_state(mut self, enable: bool) -> Self {
        self.enable_state = enable;
        self
    }

    /// Configure from provider config (e.g., from discovery).
    pub fn from_provider_config(mut self, provider: ProviderConfig) -> Self {
        self.authorization_endpoint = Some(provider.authorization_endpoint);
        self.token_endpoint = Some(provider.token_endpoint);
        self.revocation_endpoint = provider.revocation_endpoint;
        self.introspection_endpoint = provider.introspection_endpoint;
        self.device_authorization_endpoint = provider.device_authorization_endpoint;
        self.userinfo_endpoint = provider.userinfo_endpoint;
        self.jwks_uri = provider.jwks_uri;
        self.issuer = provider.issuer;
        self.scopes_supported = provider.scopes_supported;
        self.grant_types_supported = provider.grant_types_supported;
        self
    }

    /// Build the OAuth2 configuration.
    pub fn build(self) -> Result<OAuth2Config, OAuth2Error> {
        let client_id = self.client_id.ok_or_else(|| {
            OAuth2Error::Configuration(ConfigurationError::MissingField {
                field: "client_id".to_string(),
            })
        })?;

        let authorization_endpoint = self.authorization_endpoint.ok_or_else(|| {
            OAuth2Error::Configuration(ConfigurationError::MissingField {
                field: "authorization_endpoint".to_string(),
            })
        })?;

        let token_endpoint = self.token_endpoint.ok_or_else(|| {
            OAuth2Error::Configuration(ConfigurationError::MissingField {
                field: "token_endpoint".to_string(),
            })
        })?;

        let auth_method = self.auth_method.unwrap_or(ClientAuthMethod::ClientSecretBasic);

        // Validate: if auth method requires secret, ensure it's provided
        if matches!(
            auth_method,
            ClientAuthMethod::ClientSecretBasic | ClientAuthMethod::ClientSecretPost
        ) && self.client_secret.is_none()
        {
            return Err(OAuth2Error::Configuration(ConfigurationError::MissingField {
                field: "client_secret".to_string(),
            }));
        }

        Ok(OAuth2Config {
            credentials: ClientCredentials {
                client_id,
                client_secret: self.client_secret,
                auth_method,
            },
            provider: ProviderConfig {
                authorization_endpoint,
                token_endpoint,
                revocation_endpoint: self.revocation_endpoint,
                introspection_endpoint: self.introspection_endpoint,
                device_authorization_endpoint: self.device_authorization_endpoint,
                userinfo_endpoint: self.userinfo_endpoint,
                jwks_uri: self.jwks_uri,
                issuer: self.issuer,
                scopes_supported: self.scopes_supported,
                grant_types_supported: self.grant_types_supported,
            },
            default_scopes: self.default_scopes,
            timeout: self.timeout,
            enable_pkce: self.enable_pkce,
            enable_state: self.enable_state,
        })
    }
}

/// Create a new OAuth2 configuration builder.
pub fn oauth2_config() -> OAuth2ConfigBuilder {
    OAuth2ConfigBuilder::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_success() {
        let config = OAuth2ConfigBuilder::new()
            .client_id("test-client")
            .client_secret("test-secret")
            .authorization_endpoint("https://example.com/authorize")
            .token_endpoint("https://example.com/token")
            .add_default_scope("openid")
            .add_default_scope("profile")
            .build()
            .unwrap();

        assert_eq!(config.credentials.client_id, "test-client");
        assert_eq!(
            config.provider.authorization_endpoint,
            "https://example.com/authorize"
        );
        assert_eq!(config.default_scopes, vec!["openid", "profile"]);
    }

    #[test]
    fn test_builder_missing_client_id() {
        let result = OAuth2ConfigBuilder::new()
            .client_secret("test-secret")
            .authorization_endpoint("https://example.com/authorize")
            .token_endpoint("https://example.com/token")
            .build();

        assert!(result.is_err());
    }

    #[test]
    fn test_builder_missing_secret_with_basic_auth() {
        let result = OAuth2ConfigBuilder::new()
            .client_id("test-client")
            .auth_method(ClientAuthMethod::ClientSecretBasic)
            .authorization_endpoint("https://example.com/authorize")
            .token_endpoint("https://example.com/token")
            .build();

        assert!(result.is_err());
    }

    #[test]
    fn test_builder_no_secret_required_for_none_auth() {
        let config = OAuth2ConfigBuilder::new()
            .client_id("test-client")
            .auth_method(ClientAuthMethod::None)
            .authorization_endpoint("https://example.com/authorize")
            .token_endpoint("https://example.com/token")
            .build()
            .unwrap();

        assert!(config.credentials.client_secret.is_none());
    }

    #[test]
    fn test_builder_from_provider_config() {
        let provider = ProviderConfig {
            authorization_endpoint: "https://example.com/authorize".to_string(),
            token_endpoint: "https://example.com/token".to_string(),
            revocation_endpoint: Some("https://example.com/revoke".to_string()),
            introspection_endpoint: None,
            device_authorization_endpoint: None,
            userinfo_endpoint: Some("https://example.com/userinfo".to_string()),
            jwks_uri: Some("https://example.com/.well-known/jwks.json".to_string()),
            issuer: Some("https://example.com".to_string()),
            scopes_supported: vec!["openid".to_string()],
            grant_types_supported: vec![GrantType::AuthorizationCode],
        };

        let config = OAuth2ConfigBuilder::new()
            .client_id("test-client")
            .client_secret("test-secret")
            .from_provider_config(provider)
            .build()
            .unwrap();

        assert_eq!(config.provider.issuer, Some("https://example.com".to_string()));
        assert!(config.provider.revocation_endpoint.is_some());
    }
}
