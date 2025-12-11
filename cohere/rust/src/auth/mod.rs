//! Authentication and authorization for the Cohere API.

use async_trait::async_trait;
use http::HeaderMap;
use secrecy::{ExposeSecret, SecretString};

/// Trait for managing authentication headers
#[async_trait]
pub trait AuthManager: Send + Sync {
    /// Get the authentication headers for a request
    fn get_headers(&self) -> HeaderMap;

    /// Add authentication headers to an existing header map
    fn add_auth_headers(&self, headers: &mut HeaderMap);

    /// Validate the API key format (basic format validation only)
    fn validate_api_key(&self) -> Result<(), String>;
}

/// Bearer token authentication manager for Cohere API
pub struct BearerAuthManager {
    api_key: SecretString,
    client_name: Option<String>,
    user_agent_suffix: Option<String>,
}

impl BearerAuthManager {
    /// Create a new bearer authentication manager
    pub fn new(api_key: SecretString) -> Self {
        Self {
            api_key,
            client_name: None,
            user_agent_suffix: None,
        }
    }

    /// Create a new bearer authentication manager with client name
    pub fn with_client_name(api_key: SecretString, client_name: Option<String>) -> Self {
        Self {
            api_key,
            client_name,
            user_agent_suffix: None,
        }
    }

    /// Create a new bearer authentication manager with all options
    pub fn with_options(
        api_key: SecretString,
        client_name: Option<String>,
        user_agent_suffix: Option<String>,
    ) -> Self {
        Self {
            api_key,
            client_name,
            user_agent_suffix,
        }
    }

    /// Build the User-Agent header value
    fn build_user_agent(&self) -> String {
        let base = format!("integrations-cohere/{}", env!("CARGO_PKG_VERSION"));
        let mut parts = vec![base];

        if let Some(ref name) = self.client_name {
            parts.push(name.clone());
        }

        if let Some(ref suffix) = self.user_agent_suffix {
            parts.push(suffix.clone());
        }

        parts.join(" ")
    }
}

#[async_trait]
impl AuthManager for BearerAuthManager {
    fn get_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        self.add_auth_headers(&mut headers);
        headers
    }

    fn add_auth_headers(&self, headers: &mut HeaderMap) {
        // Add Authorization header with Bearer token
        let auth_value = format!("Bearer {}", self.api_key.expose_secret());
        headers.insert(
            "authorization",
            auth_value.parse().expect("Invalid auth header value"),
        );

        // Add content type
        headers.insert(
            "content-type",
            "application/json".parse().expect("Invalid content-type"),
        );

        // Add Accept header
        headers.insert(
            "accept",
            "application/json".parse().expect("Invalid accept header"),
        );

        // Add User-Agent
        headers.insert(
            "user-agent",
            self.build_user_agent()
                .parse()
                .expect("Invalid user-agent"),
        );

        // Add X-Client-Name if configured
        if let Some(ref name) = self.client_name {
            if let Ok(value) = name.parse() {
                headers.insert("x-client-name", value);
            }
        }
    }

    fn validate_api_key(&self) -> Result<(), String> {
        let key = self.api_key.expose_secret();

        if key.is_empty() {
            return Err("API key cannot be empty".to_string());
        }

        // Cohere API keys are typically alphanumeric strings
        // They can start with various prefixes depending on the key type
        if key.len() < 10 {
            return Err("API key appears to be too short".to_string());
        }

        Ok(())
    }
}

/// Request signing manager for advanced authentication scenarios
pub struct RequestSigner {
    auth_manager: BearerAuthManager,
}

impl RequestSigner {
    /// Create a new request signer
    pub fn new(auth_manager: BearerAuthManager) -> Self {
        Self { auth_manager }
    }

    /// Sign a request by adding authentication headers
    pub fn sign_request(&self, headers: &mut HeaderMap) {
        self.auth_manager.add_auth_headers(headers);
    }

    /// Get the underlying auth manager
    pub fn auth_manager(&self) -> &BearerAuthManager {
        &self.auth_manager
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bearer_auth_manager_headers() {
        let manager = BearerAuthManager::new(SecretString::new("test-api-key-12345".to_string()));

        let headers = manager.get_headers();

        assert_eq!(
            headers.get("authorization").unwrap(),
            "Bearer test-api-key-12345"
        );
        assert_eq!(headers.get("content-type").unwrap(), "application/json");
        assert_eq!(headers.get("accept").unwrap(), "application/json");
        assert!(headers.get("user-agent").is_some());
    }

    #[test]
    fn test_bearer_auth_manager_with_client_name() {
        let manager = BearerAuthManager::with_client_name(
            SecretString::new("test-api-key-12345".to_string()),
            Some("my-app".to_string()),
        );

        let headers = manager.get_headers();

        let user_agent = headers.get("user-agent").unwrap().to_str().unwrap();
        assert!(user_agent.contains("my-app"));
        assert_eq!(headers.get("x-client-name").unwrap(), "my-app");
    }

    #[test]
    fn test_validate_api_key() {
        let manager =
            BearerAuthManager::new(SecretString::new("valid-api-key-12345".to_string()));
        assert!(manager.validate_api_key().is_ok());

        let empty_manager = BearerAuthManager::new(SecretString::new("".to_string()));
        assert!(empty_manager.validate_api_key().is_err());

        let short_manager = BearerAuthManager::new(SecretString::new("short".to_string()));
        assert!(short_manager.validate_api_key().is_err());
    }

    #[test]
    fn test_add_auth_headers() {
        let manager = BearerAuthManager::new(SecretString::new("test-api-key-12345".to_string()));

        let mut headers = HeaderMap::new();
        headers.insert("x-custom-header", "custom-value".parse().unwrap());

        manager.add_auth_headers(&mut headers);

        // Original header should still be there
        assert_eq!(headers.get("x-custom-header").unwrap(), "custom-value");
        // Auth headers should be added
        assert!(headers.get("authorization").is_some());
        assert!(headers.get("content-type").is_some());
    }

    #[test]
    fn test_request_signer() {
        let auth_manager =
            BearerAuthManager::new(SecretString::new("test-api-key-12345".to_string()));
        let signer = RequestSigner::new(auth_manager);

        let mut headers = HeaderMap::new();
        signer.sign_request(&mut headers);

        assert!(headers.get("authorization").is_some());
    }
}
