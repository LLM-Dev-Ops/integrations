//! Authentication and header management

use crate::config::BetaFeature;
use http::{HeaderMap, HeaderName, HeaderValue};
use secrecy::{ExposeSecret, SecretString};
use std::str::FromStr;

/// Authentication manager trait
pub trait AuthManager: Send + Sync {
    /// Add authentication headers to the request
    fn add_auth_headers(&self, headers: &mut HeaderMap);
}

/// Implementation of the authentication manager
pub struct AuthManagerImpl {
    api_key: SecretString,
    api_version: String,
    beta_features: Vec<BetaFeature>,
}

impl AuthManagerImpl {
    pub fn new(
        api_key: SecretString,
        api_version: String,
        beta_features: Vec<BetaFeature>,
    ) -> Self {
        Self {
            api_key,
            api_version,
            beta_features,
        }
    }
}

impl AuthManager for AuthManagerImpl {
    fn add_auth_headers(&self, headers: &mut HeaderMap) {
        // Add API key
        let auth_value = HeaderValue::from_str(self.api_key.expose_secret())
            .expect("Invalid API key");
        headers.insert(
            HeaderName::from_static("x-api-key"),
            auth_value,
        );

        // Add API version
        let version_value = HeaderValue::from_str(&self.api_version)
            .expect("Invalid API version");
        headers.insert(
            HeaderName::from_static("anthropic-version"),
            version_value,
        );

        // Add beta features if any
        if !self.beta_features.is_empty() {
            let beta_values: Vec<String> = self.beta_features
                .iter()
                .map(|f| f.header_value())
                .collect();
            let beta_header = beta_values.join(",");
            let beta_value = HeaderValue::from_str(&beta_header)
                .expect("Invalid beta features");
            headers.insert(
                HeaderName::from_static("anthropic-beta"),
                beta_value,
            );
        }

        // Add content type
        headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("application/json"),
        );
    }
}
