//! Instance Metadata Service (IMDS) credential provider.

use super::{AwsCredentials, CredentialProvider};
use crate::credentials::error::CredentialError;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Default IMDS endpoint.
const IMDS_ENDPOINT: &str = "http://169.254.169.254";

/// IMDS API version.
const IMDS_API_VERSION: &str = "latest";

/// Token TTL header for IMDSv2.
const TOKEN_TTL_HEADER: &str = "X-aws-ec2-metadata-token-ttl-seconds";

/// Token header for IMDSv2.
const TOKEN_HEADER: &str = "X-aws-ec2-metadata-token";

/// Default token TTL in seconds (6 hours).
const DEFAULT_TOKEN_TTL_SECS: &str = "21600";

/// Default request timeout in seconds.
const DEFAULT_TIMEOUT_SECS: u64 = 5;

/// IMDS credentials response format.
#[derive(Debug, Deserialize)]
struct ImdsCredentials {
    #[serde(rename = "AccessKeyId")]
    access_key_id: String,

    #[serde(rename = "SecretAccessKey")]
    secret_access_key: String,

    #[serde(rename = "Token")]
    token: String,

    #[serde(rename = "Expiration")]
    expiration: String,
}

/// Cached IMDS token for IMDSv2.
#[derive(Clone)]
struct ImdsToken {
    /// The token value.
    value: String,
    /// When this token expires.
    expiration: DateTime<Utc>,
}

impl ImdsToken {
    /// Check if the token is expired or will expire soon.
    fn is_expired(&self, buffer_secs: i64) -> bool {
        let now = Utc::now();
        let buffer = chrono::Duration::seconds(buffer_secs);
        now + buffer >= self.expiration
    }
}

/// Credential provider that fetches credentials from EC2 Instance Metadata Service.
///
/// This provider supports both IMDSv1 and IMDSv2:
/// - **IMDSv2**: Session-oriented requests (default, more secure)
/// - **IMDSv1**: Request/response method (fallback)
///
/// # IMDS Versions
///
/// IMDSv2 uses a session token for additional security. The provider will:
/// 1. First attempt to get a session token (IMDSv2)
/// 2. Use the token for credential requests
/// 3. Fall back to IMDSv1 if token retrieval fails
///
/// # IAM Role
///
/// The EC2 instance must have an IAM role attached. The provider will:
/// 1. List available IAM roles
/// 2. Use the first role found
/// 3. Fetch temporary credentials for that role
///
/// # Example
///
/// ```no_run
/// use integrations_aws_ses::credentials::{
///     IMDSCredentialProvider, CredentialProvider
/// };
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = IMDSCredentialProvider::new();
/// let credentials = provider.credentials().await?;
/// # Ok(())
/// # }
/// ```
///
/// # Caching
///
/// This provider does not cache credentials internally. Wrap it with
/// `CachedCredentialProvider` for caching:
///
/// ```no_run
/// use integrations_aws_ses::credentials::{
///     IMDSCredentialProvider, CachedCredentialProvider
/// };
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let provider = IMDSCredentialProvider::new();
/// let cached = CachedCredentialProvider::new(provider);
/// let credentials = cached.credentials().await?;
/// # Ok(())
/// # }
/// ```
pub struct IMDSCredentialProvider {
    /// HTTP client for making IMDS requests.
    client: Client,
    /// IMDS endpoint URL.
    endpoint: String,
    /// Request timeout.
    timeout: Duration,
    /// Cached IMDSv2 token.
    token_cache: Arc<RwLock<Option<ImdsToken>>>,
}

impl IMDSCredentialProvider {
    /// Create a new IMDS credential provider with default settings.
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::IMDSCredentialProvider;
    ///
    /// let provider = IMDSCredentialProvider::new();
    /// ```
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
                .build()
                .expect("Failed to create HTTP client"),
            endpoint: IMDS_ENDPOINT.to_string(),
            timeout: Duration::from_secs(DEFAULT_TIMEOUT_SECS),
            token_cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Create a new IMDS credential provider with a custom endpoint.
    ///
    /// This is useful for testing or custom IMDS implementations.
    ///
    /// # Arguments
    ///
    /// * `endpoint` - The IMDS endpoint URL
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::IMDSCredentialProvider;
    ///
    /// let provider = IMDSCredentialProvider::with_endpoint(
    ///     "http://localhost:8080"
    /// );
    /// ```
    pub fn with_endpoint(endpoint: impl Into<String>) -> Self {
        let endpoint = endpoint.into();
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
                .build()
                .expect("Failed to create HTTP client"),
            endpoint,
            timeout: Duration::from_secs(DEFAULT_TIMEOUT_SECS),
            token_cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Set a custom request timeout.
    ///
    /// # Arguments
    ///
    /// * `timeout` - The request timeout duration
    ///
    /// # Example
    ///
    /// ```
    /// use integrations_aws_ses::credentials::IMDSCredentialProvider;
    /// use std::time::Duration;
    ///
    /// let provider = IMDSCredentialProvider::new()
    ///     .with_timeout(Duration::from_secs(10));
    /// ```
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self.client = Client::builder()
            .timeout(timeout)
            .build()
            .expect("Failed to create HTTP client");
        self
    }

    /// Get or refresh the IMDSv2 session token.
    async fn get_token(&self) -> Option<String> {
        // Check if we have a valid cached token
        {
            let cache = self.token_cache.read().await;
            if let Some(token) = cache.as_ref() {
                // Use 60 second buffer before token expiration
                if !token.is_expired(60) {
                    return Some(token.value.clone());
                }
            }
        }

        // Fetch a new token
        let token_url = format!("{}/{}/api/token", self.endpoint, IMDS_API_VERSION);

        let response = self
            .client
            .put(&token_url)
            .header(TOKEN_TTL_HEADER, DEFAULT_TOKEN_TTL_SECS)
            .send()
            .await
            .ok()?;

        if !response.status().is_success() {
            return None;
        }

        let token_value = response.text().await.ok()?;

        // Cache the token
        let ttl_secs: i64 = DEFAULT_TOKEN_TTL_SECS.parse().ok()?;
        let expiration = Utc::now() + chrono::Duration::seconds(ttl_secs);

        let token = ImdsToken {
            value: token_value.clone(),
            expiration,
        };

        let mut cache = self.token_cache.write().await;
        *cache = Some(token);

        Some(token_value)
    }

    /// Get the IAM role name from IMDS.
    async fn get_iam_role(&self, token: Option<&str>) -> Result<String, CredentialError> {
        let role_url = format!(
            "{}/{}/meta-data/iam/security-credentials/",
            self.endpoint, IMDS_API_VERSION
        );

        let mut request = self.client.get(&role_url);

        // Add token header if using IMDSv2
        if let Some(token_value) = token {
            request = request.header(TOKEN_HEADER, token_value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| CredentialError::ImdsError {
                message: format!("Failed to fetch IAM role: {}", e),
            })?;

        if !response.status().is_success() {
            return Err(CredentialError::ImdsError {
                message: format!("IMDS returned status: {}", response.status()),
            });
        }

        let role_name = response
            .text()
            .await
            .map_err(|e| CredentialError::ImdsError {
                message: format!("Failed to read IAM role response: {}", e),
            })?;

        // Take the first role if multiple are listed
        let role = role_name
            .lines()
            .next()
            .ok_or_else(|| CredentialError::ImdsError {
                message: "No IAM role found".to_string(),
            })?;

        Ok(role.trim().to_string())
    }

    /// Fetch credentials from IMDS for the given role.
    async fn fetch_credentials(
        &self,
        role: &str,
        token: Option<&str>,
    ) -> Result<AwsCredentials, CredentialError> {
        let creds_url = format!(
            "{}/{}/meta-data/iam/security-credentials/{}",
            self.endpoint, IMDS_API_VERSION, role
        );

        let mut request = self.client.get(&creds_url);

        // Add token header if using IMDSv2
        if let Some(token_value) = token {
            request = request.header(TOKEN_HEADER, token_value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| CredentialError::ImdsError {
                message: format!("Failed to fetch credentials: {}", e),
            })?;

        if !response.status().is_success() {
            return Err(CredentialError::ImdsError {
                message: format!("IMDS returned status: {}", response.status()),
            });
        }

        let imds_creds: ImdsCredentials = response
            .json()
            .await
            .map_err(|e| CredentialError::ImdsError {
                message: format!("Failed to parse credentials response: {}", e),
            })?;

        // Parse expiration time
        let expiration = DateTime::parse_from_rfc3339(&imds_creds.expiration)
            .map_err(|e| CredentialError::ImdsError {
                message: format!("Failed to parse expiration time: {}", e),
            })?
            .with_timezone(&Utc);

        let credentials = AwsCredentials::new(
            imds_creds.access_key_id,
            imds_creds.secret_access_key,
        )
        .with_session_token(imds_creds.token)
        .with_expiration(expiration);

        Ok(credentials)
    }
}

impl Default for IMDSCredentialProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for IMDSCredentialProvider {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            endpoint: self.endpoint.clone(),
            timeout: self.timeout,
            token_cache: Arc::clone(&self.token_cache),
        }
    }
}

#[async_trait]
impl CredentialProvider for IMDSCredentialProvider {
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        // Try IMDSv2 first (with token)
        let token = self.get_token().await;

        // Get the IAM role
        let role = self.get_iam_role(token.as_deref()).await?;

        // Fetch credentials for the role
        self.fetch_credentials(&role, token.as_deref()).await
    }
}

impl fmt::Debug for IMDSCredentialProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("IMDSCredentialProvider")
            .field("endpoint", &self.endpoint)
            .field("timeout", &self.timeout)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_imds_provider_new() {
        let provider = IMDSCredentialProvider::new();
        assert_eq!(provider.endpoint, IMDS_ENDPOINT);
        assert_eq!(provider.timeout, Duration::from_secs(DEFAULT_TIMEOUT_SECS));
    }

    #[test]
    fn test_imds_provider_with_endpoint() {
        let provider = IMDSCredentialProvider::with_endpoint("http://localhost:8080");
        assert_eq!(provider.endpoint, "http://localhost:8080");
    }

    #[test]
    fn test_imds_provider_with_timeout() {
        let provider = IMDSCredentialProvider::new().with_timeout(Duration::from_secs(10));
        assert_eq!(provider.timeout, Duration::from_secs(10));
    }

    #[test]
    fn test_imds_token_is_expired() {
        use chrono::Duration;

        let token = ImdsToken {
            value: "test-token".to_string(),
            expiration: Utc::now() + Duration::seconds(30),
        };

        // Should not be expired with small buffer
        assert!(!token.is_expired(10));

        // Should be expired with large buffer
        assert!(token.is_expired(60));
    }

    #[test]
    fn test_imds_token_is_expired_past() {
        use chrono::Duration;

        let token = ImdsToken {
            value: "test-token".to_string(),
            expiration: Utc::now() - Duration::seconds(30),
        };

        // Should be expired regardless of buffer
        assert!(token.is_expired(0));
        assert!(token.is_expired(60));
    }

    #[test]
    fn test_imds_provider_clone() {
        let provider = IMDSCredentialProvider::new();
        let cloned = provider.clone();

        assert_eq!(cloned.endpoint, provider.endpoint);
        assert_eq!(cloned.timeout, provider.timeout);
    }

    #[test]
    fn test_imds_provider_debug() {
        let provider = IMDSCredentialProvider::new();
        let debug = format!("{:?}", provider);

        assert!(debug.contains("IMDSCredentialProvider"));
        assert!(debug.contains("endpoint"));
        assert!(debug.contains(IMDS_ENDPOINT));
    }

    // Note: Integration tests that actually call IMDS would require
    // running on an EC2 instance with an IAM role. These tests would
    // be better suited for an integration test suite rather than unit tests.

    #[tokio::test]
    #[ignore] // Only runs on EC2 instances with IAM roles
    async fn test_imds_provider_real_credentials() {
        let provider = IMDSCredentialProvider::new();
        let result = provider.credentials().await;

        // This will only succeed on an EC2 instance with an IAM role
        match result {
            Ok(creds) => {
                assert!(!creds.access_key_id().is_empty());
                assert!(!creds.secret_access_key().is_empty());
                assert!(creds.session_token().is_some());
                assert!(creds.expiration().is_some());
            }
            Err(e) => {
                println!("Expected failure when not running on EC2: {:?}", e);
            }
        }
    }
}
