use secrecy::{ExposeSecret, Secret};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIConfig {
    #[serde(skip_serializing)]
    pub api_key: Secret<String>,

    #[serde(default = "default_base_url")]
    pub base_url: Url,

    #[serde(default)]
    pub organization_id: Option<String>,

    #[serde(default)]
    pub project_id: Option<String>,

    #[serde(default = "default_timeout")]
    pub timeout: Duration,

    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    #[serde(default = "default_max_connections")]
    pub max_connections: usize,

    #[serde(default)]
    pub proxy: Option<Url>,

    #[serde(default = "default_user_agent")]
    pub user_agent: String,
}

impl OpenAIConfig {
    /// Creates a new OpenAIConfig with the given API key
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: Secret::new(api_key.into()),
            base_url: default_base_url(),
            organization_id: None,
            project_id: None,
            timeout: default_timeout(),
            max_retries: default_max_retries(),
            max_connections: default_max_connections(),
            proxy: None,
            user_agent: default_user_agent(),
        }
    }

    /// Creates a new OpenAIConfig from environment variables
    ///
    /// Reads the following environment variables:
    /// - OPENAI_API_KEY (required)
    /// - OPENAI_BASE_URL (optional, defaults to https://api.openai.com/v1)
    /// - OPENAI_ORGANIZATION_ID (optional)
    /// - OPENAI_PROJECT_ID (optional)
    pub fn from_env() -> crate::errors::OpenAIResult<Self> {
        let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| {
            crate::errors::OpenAIError::Configuration(
                crate::errors::ConfigurationError::MissingApiKey(
                    "OPENAI_API_KEY environment variable not found".to_string(),
                ),
            )
        })?;

        let mut config = Self::new(api_key);

        // Optional base URL
        if let Ok(base_url) = std::env::var("OPENAI_BASE_URL") {
            let url = Url::parse(&base_url).map_err(|e| {
                crate::errors::OpenAIError::Configuration(
                    crate::errors::ConfigurationError::InvalidBaseUrl(format!(
                        "Invalid OPENAI_BASE_URL: {}",
                        e
                    )),
                )
            })?;
            config.base_url = url;
        }

        // Optional organization ID
        if let Ok(org_id) = std::env::var("OPENAI_ORGANIZATION_ID") {
            config.organization_id = Some(org_id);
        }

        // Optional project ID
        if let Ok(project_id) = std::env::var("OPENAI_PROJECT_ID") {
            config.project_id = Some(project_id);
        }

        Ok(config)
    }

    /// Validates the configuration
    pub fn validate(&self) -> crate::errors::OpenAIResult<()> {
        use secrecy::ExposeSecret;

        let api_key = self.api_key.expose_secret();

        if api_key.is_empty() {
            return Err(crate::errors::OpenAIError::Configuration(
                crate::errors::ConfigurationError::MissingApiKey(
                    "API key is empty".to_string(),
                ),
            ));
        }

        if api_key.len() < 10 {
            return Err(crate::errors::OpenAIError::Configuration(
                crate::errors::ConfigurationError::InvalidApiKeyFormat(
                    "API key is too short".to_string(),
                ),
            ));
        }

        if self.timeout.as_secs() == 0 {
            return Err(crate::errors::OpenAIError::Configuration(
                crate::errors::ConfigurationError::InvalidTimeout(
                    "Timeout must be greater than 0".to_string(),
                ),
            ));
        }

        Ok(())
    }

    pub fn with_base_url(mut self, base_url: Url) -> Self {
        self.base_url = base_url;
        self
    }

    pub fn with_organization_id(mut self, org_id: impl Into<String>) -> Self {
        self.organization_id = Some(org_id.into());
        self
    }

    pub fn with_project_id(mut self, project_id: impl Into<String>) -> Self {
        self.project_id = Some(project_id.into());
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    pub fn with_proxy(mut self, proxy: Url) -> Self {
        self.proxy = Some(proxy);
        self
    }

    pub fn api_key(&self) -> &str {
        self.api_key.expose_secret()
    }
}

fn default_base_url() -> Url {
    Url::parse("https://api.openai.com/v1").unwrap()
}

fn default_timeout() -> Duration {
    Duration::from_secs(60)
}

fn default_max_retries() -> u32 {
    3
}

fn default_max_connections() -> usize {
    100
}

fn default_user_agent() -> String {
    format!("integrations-openai/{}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_builder() {
        let config = OpenAIConfig::new("test-key")
            .with_organization_id("org-123")
            .with_timeout(Duration::from_secs(30));

        assert_eq!(config.api_key(), "test-key");
        assert_eq!(config.organization_id.as_deref(), Some("org-123"));
        assert_eq!(config.timeout, Duration::from_secs(30));
    }
}
