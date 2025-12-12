//! OIDC Discovery
//!
//! OpenID Connect Discovery (RFC 8414) implementation.

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::core::transport::{HttpMethod, HttpRequest, HttpTransport};
use crate::error::{ConfigurationError, OAuth2Error, ProtocolError};
use crate::types::{OIDCDiscoveryDocument, ProviderConfig};

/// Discovery cache entry.
struct DiscoveryCacheEntry {
    document: OIDCDiscoveryDocument,
    fetched_at: Instant,
    expires_at: Instant,
}

/// Discovery client interface (for dependency injection).
#[async_trait]
pub trait DiscoveryClient: Send + Sync {
    /// Fetch discovery document for issuer.
    async fn fetch(&self, issuer: &str) -> Result<OIDCDiscoveryDocument, OAuth2Error>;

    /// Get provider config from discovery.
    async fn get_provider_config(&self, issuer: &str) -> Result<ProviderConfig, OAuth2Error>;

    /// Clear cache for issuer.
    fn clear_cache(&self, issuer: Option<&str>);
}

/// Default discovery client implementation.
pub struct DefaultDiscoveryClient<T: HttpTransport> {
    transport: T,
    cache: Mutex<HashMap<String, DiscoveryCacheEntry>>,
    cache_ttl: Duration,
}

impl<T: HttpTransport> DefaultDiscoveryClient<T> {
    /// Create new discovery client.
    pub fn new(transport: T) -> Self {
        Self::with_cache_ttl(transport, Duration::from_secs(3600)) // 1 hour
    }

    /// Create discovery client with custom cache TTL.
    pub fn with_cache_ttl(transport: T, cache_ttl: Duration) -> Self {
        Self {
            transport,
            cache: Mutex::new(HashMap::new()),
            cache_ttl,
        }
    }

    fn normalize_issuer(issuer: &str) -> String {
        issuer.trim_end_matches('/').to_string()
    }

    fn get_from_cache(&self, issuer: &str) -> Option<OIDCDiscoveryDocument> {
        let key = Self::normalize_issuer(issuer);
        let mut cache = self.cache.lock().unwrap();

        if let Some(entry) = cache.get(&key) {
            if Instant::now() < entry.expires_at {
                return Some(entry.document.clone());
            }
            cache.remove(&key);
        }

        None
    }

    fn set_cache(&self, issuer: &str, document: OIDCDiscoveryDocument) {
        let key = Self::normalize_issuer(issuer);
        let now = Instant::now();

        self.cache.lock().unwrap().insert(
            key,
            DiscoveryCacheEntry {
                document,
                fetched_at: now,
                expires_at: now + self.cache_ttl,
            },
        );
    }
}

#[async_trait]
impl<T: HttpTransport> DiscoveryClient for DefaultDiscoveryClient<T> {
    async fn fetch(&self, issuer: &str) -> Result<OIDCDiscoveryDocument, OAuth2Error> {
        // Check cache first
        if let Some(cached) = self.get_from_cache(issuer) {
            return Ok(cached);
        }

        // Build discovery URL
        let normalized_issuer = Self::normalize_issuer(issuer);
        let discovery_url = format!("{}/.well-known/openid-configuration", normalized_issuer);

        let request = HttpRequest {
            method: HttpMethod::Get,
            url: discovery_url,
            headers: [("accept".to_string(), "application/json".to_string())]
                .into_iter()
                .collect(),
            body: None,
            timeout: None,
        };

        let response = self.transport.send(request).await?;

        if response.status != 200 {
            return Err(OAuth2Error::Configuration(ConfigurationError::DiscoveryFailed {
                message: format!(
                    "Discovery request failed with status {}",
                    response.status
                ),
            }));
        }

        let document: OIDCDiscoveryDocument = serde_json::from_str(&response.body)
            .map_err(|e| {
                OAuth2Error::Protocol(ProtocolError::InvalidJson {
                    message: e.to_string(),
                })
            })?;

        // Validate required fields
        if document.authorization_endpoint.is_empty() || document.token_endpoint.is_empty() {
            return Err(OAuth2Error::Configuration(ConfigurationError::DiscoveryFailed {
                message: "Discovery document missing required endpoints".to_string(),
            }));
        }

        // Validate issuer matches
        let response_issuer = Self::normalize_issuer(&document.issuer);
        if response_issuer != normalized_issuer {
            return Err(OAuth2Error::Configuration(ConfigurationError::DiscoveryFailed {
                message: format!(
                    "Issuer mismatch: expected {}, got {}",
                    normalized_issuer, response_issuer
                ),
            }));
        }

        // Cache the document
        self.set_cache(issuer, document.clone());

        Ok(document)
    }

    async fn get_provider_config(&self, issuer: &str) -> Result<ProviderConfig, OAuth2Error> {
        let document = self.fetch(issuer).await?;
        Ok(document.to_provider_config())
    }

    fn clear_cache(&self, issuer: Option<&str>) {
        let mut cache = self.cache.lock().unwrap();
        match issuer {
            Some(i) => {
                cache.remove(&Self::normalize_issuer(i));
            }
            None => {
                cache.clear();
            }
        }
    }
}

/// Mock discovery client for testing.
#[derive(Default)]
pub struct MockDiscoveryClient {
    documents: Mutex<HashMap<String, OIDCDiscoveryDocument>>,
    fetch_history: Mutex<Vec<String>>,
}

impl MockDiscoveryClient {
    /// Create new mock discovery client.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set discovery document for issuer.
    pub fn set_document(&self, issuer: &str, document: OIDCDiscoveryDocument) -> &Self {
        self.documents
            .lock()
            .unwrap()
            .insert(issuer.to_string(), document);
        self
    }

    /// Get fetch history.
    pub fn get_fetch_history(&self) -> Vec<String> {
        self.fetch_history.lock().unwrap().clone()
    }
}

#[async_trait]
impl DiscoveryClient for MockDiscoveryClient {
    async fn fetch(&self, issuer: &str) -> Result<OIDCDiscoveryDocument, OAuth2Error> {
        self.fetch_history.lock().unwrap().push(issuer.to_string());

        self.documents
            .lock()
            .unwrap()
            .get(issuer)
            .cloned()
            .ok_or_else(|| {
                OAuth2Error::Configuration(ConfigurationError::DiscoveryFailed {
                    message: format!("No mock document for issuer: {}", issuer),
                })
            })
    }

    async fn get_provider_config(&self, issuer: &str) -> Result<ProviderConfig, OAuth2Error> {
        let document = self.fetch(issuer).await?;
        Ok(document.to_provider_config())
    }

    fn clear_cache(&self, _issuer: Option<&str>) {
        // No-op for mock
    }
}

/// Create mock discovery document for testing.
pub fn create_mock_discovery_document(issuer: &str) -> OIDCDiscoveryDocument {
    OIDCDiscoveryDocument {
        issuer: issuer.to_string(),
        authorization_endpoint: format!("{}/authorize", issuer),
        token_endpoint: format!("{}/token", issuer),
        userinfo_endpoint: Some(format!("{}/userinfo", issuer)),
        jwks_uri: Some(format!("{}/.well-known/jwks.json", issuer)),
        registration_endpoint: None,
        scopes_supported: vec!["openid".to_string(), "profile".to_string(), "email".to_string()],
        response_types_supported: vec!["code".to_string()],
        grant_types_supported: vec![
            "authorization_code".to_string(),
            "refresh_token".to_string(),
            "client_credentials".to_string(),
        ],
        token_endpoint_auth_methods_supported: vec![
            "client_secret_basic".to_string(),
            "client_secret_post".to_string(),
        ],
        device_authorization_endpoint: None,
        revocation_endpoint: Some(format!("{}/revoke", issuer)),
        introspection_endpoint: Some(format!("{}/introspect", issuer)),
    }
}

/// Create mock discovery client for testing.
pub fn create_mock_discovery_client() -> MockDiscoveryClient {
    MockDiscoveryClient::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_discovery_client() {
        let client = MockDiscoveryClient::new();
        let issuer = "https://example.com";
        let document = create_mock_discovery_document(issuer);
        client.set_document(issuer, document);

        let result = client.fetch(issuer).await.unwrap();
        assert_eq!(result.issuer, issuer);
        assert_eq!(result.authorization_endpoint, "https://example.com/authorize");
        assert_eq!(result.token_endpoint, "https://example.com/token");

        let history = client.get_fetch_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0], issuer);
    }

    #[tokio::test]
    async fn test_get_provider_config() {
        let client = MockDiscoveryClient::new();
        let issuer = "https://example.com";
        client.set_document(issuer, create_mock_discovery_document(issuer));

        let config = client.get_provider_config(issuer).await.unwrap();
        assert_eq!(config.authorization_endpoint, "https://example.com/authorize");
        assert_eq!(config.token_endpoint, "https://example.com/token");
        assert_eq!(config.issuer, Some(issuer.to_string()));
    }

    #[tokio::test]
    async fn test_mock_discovery_not_found() {
        let client = MockDiscoveryClient::new();
        let result = client.fetch("https://unknown.com").await;
        assert!(result.is_err());
    }
}
