//! IMDS (Instance Metadata Service) credential provider for EC2/ECS environments.

use super::{AwsCredentials, CredentialsProvider};
use crate::error::{CredentialsError, S3Error};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use std::time::Duration;
use tracing::{debug, trace, warn};

/// IMDS version configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImdsVersion {
    /// IMDSv1 (less secure, no token required).
    V1,
    /// IMDSv2 (more secure, requires session token).
    V2,
    /// Auto-detect: try v2 first, fall back to v1.
    Auto,
}

impl Default for ImdsVersion {
    fn default() -> Self {
        Self::Auto
    }
}

/// Configuration for the IMDS credential provider.
#[derive(Debug, Clone)]
pub struct ImdsConfig {
    /// IMDS endpoint URL.
    pub endpoint: String,
    /// IMDS version to use.
    pub version: ImdsVersion,
    /// Timeout for IMDS requests.
    pub timeout: Duration,
    /// Number of retries for IMDS requests.
    pub retries: u32,
    /// Token TTL for IMDSv2 (in seconds).
    pub token_ttl_seconds: u32,
}

impl Default for ImdsConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://169.254.169.254".to_string(),
            version: ImdsVersion::Auto,
            timeout: Duration::from_secs(1),
            retries: 3,
            token_ttl_seconds: 21600, // 6 hours
        }
    }
}

impl ImdsConfig {
    /// Create a new IMDS configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the IMDS endpoint.
    pub fn endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = endpoint.into();
        self
    }

    /// Set the IMDS version.
    pub fn version(mut self, version: ImdsVersion) -> Self {
        self.version = version;
        self
    }

    /// Set the request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the number of retries.
    pub fn retries(mut self, retries: u32) -> Self {
        self.retries = retries;
        self
    }

    /// Create configuration for ECS task role.
    pub fn for_ecs() -> Self {
        // ECS uses the relative URI from environment variable
        Self {
            endpoint: "http://169.254.170.2".to_string(),
            version: ImdsVersion::V1, // ECS doesn't use IMDSv2
            timeout: Duration::from_secs(2),
            retries: 3,
            token_ttl_seconds: 21600,
        }
    }
}

/// Cached IMDS token for v2.
struct CachedToken {
    token: String,
    expires_at: DateTime<Utc>,
}

/// IMDS credential provider for EC2/ECS environments.
///
/// This provider retrieves temporary credentials from the EC2 Instance Metadata Service
/// or ECS task role credentials endpoint.
pub struct ImdsCredentialsProvider {
    config: ImdsConfig,
    http_client: reqwest::Client,
    cached_token: RwLock<Option<CachedToken>>,
    cached_credentials: RwLock<Option<AwsCredentials>>,
    detected_version: RwLock<Option<ImdsVersion>>,
}

impl ImdsCredentialsProvider {
    /// Create a new IMDS credential provider with default configuration.
    pub fn new() -> Result<Self, S3Error> {
        Self::with_config(ImdsConfig::default())
    }

    /// Create a new IMDS credential provider with custom configuration.
    pub fn with_config(config: ImdsConfig) -> Result<Self, S3Error> {
        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .connect_timeout(config.timeout)
            .build()
            .map_err(|e| {
                S3Error::Credentials(CredentialsError::ImdsError {
                    message: format!("Failed to create HTTP client: {}", e),
                })
            })?;

        Ok(Self {
            config,
            http_client,
            cached_token: RwLock::new(None),
            cached_credentials: RwLock::new(None),
            detected_version: RwLock::new(None),
        })
    }

    /// Create a provider configured for ECS.
    pub fn for_ecs() -> Result<Self, S3Error> {
        Self::with_config(ImdsConfig::for_ecs())
    }

    /// Check if running in an ECS environment.
    pub fn is_ecs_environment() -> bool {
        std::env::var("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI").is_ok()
            || std::env::var("AWS_CONTAINER_CREDENTIALS_FULL_URI").is_ok()
    }

    /// Check if running in an EC2 environment (best-effort detection).
    pub async fn is_ec2_environment(&self) -> bool {
        // Try to reach IMDS endpoint
        let url = format!("{}/latest/meta-data/", self.config.endpoint);
        self.http_client
            .get(&url)
            .timeout(Duration::from_millis(500))
            .send()
            .await
            .is_ok()
    }

    /// Get a session token for IMDSv2.
    async fn get_token(&self) -> Result<String, S3Error> {
        // Check cache first
        {
            let cache = self.cached_token.read();
            if let Some(cached) = cache.as_ref() {
                if Utc::now() < cached.expires_at {
                    return Ok(cached.token.clone());
                }
            }
        }

        // Request new token
        let url = format!("{}/latest/api/token", self.config.endpoint);
        let response = self
            .http_client
            .put(&url)
            .header(
                "X-aws-ec2-metadata-token-ttl-seconds",
                self.config.token_ttl_seconds.to_string(),
            )
            .send()
            .await
            .map_err(|e| {
                S3Error::Credentials(CredentialsError::ImdsError {
                    message: format!("Failed to get IMDS token: {}", e),
                })
            })?;

        if !response.status().is_success() {
            return Err(S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("IMDS token request failed with status: {}", response.status()),
            }));
        }

        let token = response.text().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to read IMDS token response: {}", e),
            })
        })?;

        // Cache the token
        {
            let mut cache = self.cached_token.write();
            *cache = Some(CachedToken {
                token: token.clone(),
                expires_at: Utc::now()
                    + chrono::Duration::seconds(self.config.token_ttl_seconds as i64 - 60), // Refresh 1 minute early
            });
        }

        Ok(token)
    }

    /// Get the IAM role name from IMDS.
    async fn get_role_name(&self, token: Option<&str>) -> Result<String, S3Error> {
        let url = format!(
            "{}/latest/meta-data/iam/security-credentials/",
            self.config.endpoint
        );

        let mut request = self.http_client.get(&url);
        if let Some(t) = token {
            request = request.header("X-aws-ec2-metadata-token", t);
        }

        let response = request.send().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to get IAM role name: {}", e),
            })
        })?;

        if response.status().as_u16() == 401 {
            return Err(S3Error::Credentials(CredentialsError::ImdsError {
                message: "IMDSv2 token required but not provided".to_string(),
            }));
        }

        if !response.status().is_success() {
            return Err(S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to get IAM role name: status {}", response.status()),
            }));
        }

        let role_name = response.text().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to read IAM role name: {}", e),
            })
        })?;

        // The response may contain multiple roles; take the first one
        let role_name = role_name
            .lines()
            .next()
            .ok_or_else(|| {
                S3Error::Credentials(CredentialsError::ImdsError {
                    message: "No IAM role found".to_string(),
                })
            })?
            .trim()
            .to_string();

        Ok(role_name)
    }

    /// Get credentials for a specific role from IMDS.
    async fn get_role_credentials(
        &self,
        role_name: &str,
        token: Option<&str>,
    ) -> Result<AwsCredentials, S3Error> {
        let url = format!(
            "{}/latest/meta-data/iam/security-credentials/{}",
            self.config.endpoint, role_name
        );

        let mut request = self.http_client.get(&url);
        if let Some(t) = token {
            request = request.header("X-aws-ec2-metadata-token", t);
        }

        let response = request.send().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to get role credentials: {}", e),
            })
        })?;

        if !response.status().is_success() {
            return Err(S3Error::Credentials(CredentialsError::ImdsError {
                message: format!(
                    "Failed to get role credentials: status {}",
                    response.status()
                ),
            }));
        }

        let body = response.text().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to read credentials response: {}", e),
            })
        })?;

        self.parse_credentials_response(&body)
    }

    /// Get credentials from ECS task role endpoint.
    async fn get_ecs_credentials(&self) -> Result<AwsCredentials, S3Error> {
        // Check for relative URI first (standard ECS)
        let url = if let Ok(relative_uri) =
            std::env::var("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")
        {
            format!("http://169.254.170.2{}", relative_uri)
        } else if let Ok(full_uri) = std::env::var("AWS_CONTAINER_CREDENTIALS_FULL_URI") {
            full_uri
        } else {
            return Err(S3Error::Credentials(CredentialsError::ImdsError {
                message: "ECS credentials URI not found in environment".to_string(),
            }));
        };

        let mut request = self.http_client.get(&url);

        // Add authorization token if present
        if let Ok(token) = std::env::var("AWS_CONTAINER_AUTHORIZATION_TOKEN") {
            request = request.header("Authorization", token);
        }

        let response = request.send().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to get ECS credentials: {}", e),
            })
        })?;

        if !response.status().is_success() {
            return Err(S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("ECS credentials request failed: {}", response.status()),
            }));
        }

        let body = response.text().await.map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to read ECS credentials: {}", e),
            })
        })?;

        self.parse_credentials_response(&body)
    }

    /// Parse the JSON credentials response from IMDS/ECS.
    fn parse_credentials_response(&self, body: &str) -> Result<AwsCredentials, S3Error> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "PascalCase")]
        struct CredentialsResponse {
            access_key_id: String,
            secret_access_key: String,
            token: Option<String>,
            expiration: Option<String>,
        }

        let creds: CredentialsResponse = serde_json::from_str(body).map_err(|e| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: format!("Failed to parse credentials JSON: {}", e),
            })
        })?;

        let expiration = creds.expiration.as_ref().and_then(|exp| {
            DateTime::parse_from_rfc3339(exp)
                .ok()
                .map(|dt| dt.with_timezone(&Utc))
        });

        let credentials = if let Some(token) = creds.token {
            if let Some(exp) = expiration {
                AwsCredentials::temporary(creds.access_key_id, creds.secret_access_key, token, exp)
            } else {
                AwsCredentials::with_session_token(
                    creds.access_key_id,
                    creds.secret_access_key,
                    token,
                )
            }
        } else {
            AwsCredentials::new(creds.access_key_id, creds.secret_access_key)
        };

        Ok(credentials)
    }

    /// Detect the IMDS version to use.
    async fn detect_version(&self) -> ImdsVersion {
        // Check if already detected
        {
            let detected = self.detected_version.read();
            if let Some(v) = *detected {
                return v;
            }
        }

        // Try IMDSv2 first
        let version = match self.get_token().await {
            Ok(_) => {
                debug!("IMDSv2 is available");
                ImdsVersion::V2
            }
            Err(_) => {
                debug!("IMDSv2 not available, falling back to v1");
                ImdsVersion::V1
            }
        };

        // Cache the detected version
        {
            let mut detected = self.detected_version.write();
            *detected = Some(version);
        }

        version
    }

    /// Fetch credentials using the appropriate IMDS version.
    async fn fetch_credentials(&self) -> Result<AwsCredentials, S3Error> {
        // Check for ECS environment first
        if Self::is_ecs_environment() {
            trace!("ECS environment detected, using ECS credentials endpoint");
            return self.get_ecs_credentials().await;
        }

        // Determine which IMDS version to use
        let version = match self.config.version {
            ImdsVersion::Auto => self.detect_version().await,
            v => v,
        };

        let credentials = match version {
            ImdsVersion::V2 => {
                let token = self.get_token().await?;
                let role_name = self.get_role_name(Some(&token)).await?;
                trace!("Found IAM role: {}", role_name);
                self.get_role_credentials(&role_name, Some(&token)).await?
            }
            ImdsVersion::V1 => {
                let role_name = self.get_role_name(None).await?;
                trace!("Found IAM role: {}", role_name);
                self.get_role_credentials(&role_name, None).await?
            }
            ImdsVersion::Auto => unreachable!(),
        };

        Ok(credentials)
    }
}

impl Default for ImdsCredentialsProvider {
    fn default() -> Self {
        Self::new().expect("Failed to create IMDS provider")
    }
}

#[async_trait]
impl CredentialsProvider for ImdsCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
        // Check cache first
        {
            let cache = self.cached_credentials.read();
            if let Some(creds) = cache.as_ref() {
                // Refresh if expiring within 5 minutes
                if !creds.will_expire_within(chrono::Duration::minutes(5)) {
                    return Ok(creds.clone());
                }
            }
        }

        // Fetch new credentials
        let mut last_error = None;
        for attempt in 0..=self.config.retries {
            if attempt > 0 {
                trace!("IMDS retry attempt {}/{}", attempt, self.config.retries);
                tokio::time::sleep(Duration::from_millis(100 * (1 << attempt))).await;
            }

            match self.fetch_credentials().await {
                Ok(creds) => {
                    // Cache the credentials
                    {
                        let mut cache = self.cached_credentials.write();
                        *cache = Some(creds.clone());
                    }
                    return Ok(creds);
                }
                Err(e) => {
                    warn!("IMDS credentials fetch failed: {:?}", e);
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            S3Error::Credentials(CredentialsError::ImdsError {
                message: "IMDS credentials fetch failed after retries".to_string(),
            })
        }))
    }

    async fn refresh_credentials(&self) -> Result<AwsCredentials, S3Error> {
        // Clear cache
        {
            let mut cache = self.cached_credentials.write();
            *cache = None;
        }
        self.get_credentials().await
    }

    fn name(&self) -> &'static str {
        "imds"
    }
}

impl std::fmt::Debug for ImdsCredentialsProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ImdsCredentialsProvider")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_imds_config_default() {
        let config = ImdsConfig::default();
        assert_eq!(config.endpoint, "http://169.254.169.254");
        assert_eq!(config.version, ImdsVersion::Auto);
        assert_eq!(config.timeout, Duration::from_secs(1));
        assert_eq!(config.retries, 3);
    }

    #[test]
    fn test_imds_config_builder() {
        let config = ImdsConfig::new()
            .endpoint("http://localhost:1234")
            .version(ImdsVersion::V2)
            .timeout(Duration::from_secs(5))
            .retries(5);

        assert_eq!(config.endpoint, "http://localhost:1234");
        assert_eq!(config.version, ImdsVersion::V2);
        assert_eq!(config.timeout, Duration::from_secs(5));
        assert_eq!(config.retries, 5);
    }

    #[test]
    fn test_ecs_config() {
        let config = ImdsConfig::for_ecs();
        assert_eq!(config.endpoint, "http://169.254.170.2");
        assert_eq!(config.version, ImdsVersion::V1);
    }

    #[test]
    fn test_provider_creation() {
        let provider = ImdsCredentialsProvider::new();
        assert!(provider.is_ok());
    }

    #[test]
    fn test_ecs_environment_detection() {
        // Should return false in test environment
        assert!(!ImdsCredentialsProvider::is_ecs_environment());
    }
}
