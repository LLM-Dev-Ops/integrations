//! Callback Types
//!
//! Types for handling authorization callbacks.

use url::Url;

/// Callback parameters from authorization redirect.
#[derive(Clone, Debug)]
pub struct CallbackParams {
    /// Authorization code (if success).
    pub code: Option<String>,
    /// State parameter.
    pub state: Option<String>,
    /// Error code (if authorization failed).
    pub error: Option<String>,
    /// Error description.
    pub error_description: Option<String>,
    /// Error URI.
    pub error_uri: Option<String>,
}

impl CallbackParams {
    /// Parse callback parameters from URL.
    pub fn from_url(url: &Url) -> Self {
        let mut params = Self {
            code: None,
            state: None,
            error: None,
            error_description: None,
            error_uri: None,
        };

        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "code" => params.code = Some(value.into_owned()),
                "state" => params.state = Some(value.into_owned()),
                "error" => params.error = Some(value.into_owned()),
                "error_description" => params.error_description = Some(value.into_owned()),
                "error_uri" => params.error_uri = Some(value.into_owned()),
                _ => {}
            }
        }

        params
    }

    /// Parse callback parameters from URL string.
    pub fn from_url_str(url_str: &str) -> Result<Self, url::ParseError> {
        let url = Url::parse(url_str)?;
        Ok(Self::from_url(&url))
    }

    /// Check if callback contains an error.
    pub fn is_error(&self) -> bool {
        self.error.is_some()
    }

    /// Check if callback is successful.
    pub fn is_success(&self) -> bool {
        self.code.is_some() && self.error.is_none()
    }
}

/// State metadata stored during authorization flow.
#[derive(Clone, Debug)]
pub struct StateMetadata {
    /// Redirect URI used in authorization request.
    pub redirect_uri: String,
    /// Scopes requested.
    pub scopes: Vec<String>,
    /// PKCE verifier (for PKCE flow).
    pub pkce_verifier: Option<String>,
    /// Creation timestamp (Unix milliseconds).
    pub created_at: u64,
    /// Custom data.
    pub custom_data: Option<String>,
}

impl StateMetadata {
    /// Create new state metadata.
    pub fn new(redirect_uri: String, scopes: Vec<String>) -> Self {
        Self {
            redirect_uri,
            scopes,
            pkce_verifier: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            custom_data: None,
        }
    }

    /// Add PKCE verifier.
    pub fn with_pkce_verifier(mut self, verifier: String) -> Self {
        self.pkce_verifier = Some(verifier);
        self
    }

    /// Add custom data.
    pub fn with_custom_data(mut self, data: String) -> Self {
        self.custom_data = Some(data);
        self
    }

    /// Check if state has expired.
    pub fn is_expired(&self, max_age_ms: u64) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        now - self.created_at > max_age_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_callback_params_from_url() {
        let url = Url::parse("https://example.com/callback?code=abc123&state=xyz789").unwrap();
        let params = CallbackParams::from_url(&url);

        assert_eq!(params.code, Some("abc123".to_string()));
        assert_eq!(params.state, Some("xyz789".to_string()));
        assert!(params.error.is_none());
        assert!(params.is_success());
    }

    #[test]
    fn test_callback_params_error() {
        let url = Url::parse(
            "https://example.com/callback?error=access_denied&error_description=User%20denied",
        )
        .unwrap();
        let params = CallbackParams::from_url(&url);

        assert!(params.code.is_none());
        assert_eq!(params.error, Some("access_denied".to_string()));
        assert_eq!(params.error_description, Some("User denied".to_string()));
        assert!(params.is_error());
        assert!(!params.is_success());
    }

    #[test]
    fn test_state_metadata() {
        let metadata = StateMetadata::new(
            "https://example.com/callback".to_string(),
            vec!["openid".to_string()],
        );

        assert_eq!(metadata.redirect_uri, "https://example.com/callback");
        assert_eq!(metadata.scopes, vec!["openid"]);
        assert!(metadata.pkce_verifier.is_none());
        assert!(!metadata.is_expired(60000)); // 60 seconds
    }

    #[test]
    fn test_state_metadata_with_pkce() {
        let metadata = StateMetadata::new(
            "https://example.com/callback".to_string(),
            vec!["openid".to_string()],
        )
        .with_pkce_verifier("test-verifier".to_string());

        assert_eq!(metadata.pkce_verifier, Some("test-verifier".to_string()));
    }
}
