//! HTTP client implementation for AWS SES API.
//!
//! This module provides the main HTTP client with request signing,
//! retry logic, and rate limiting.

use async_trait::async_trait;
use chrono::Utc;
use reqwest::Request;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use url::Url;

use crate::config::{RateLimiter, SesConfig};
use crate::credentials::AwsCredentials;
use crate::error::{SesError, SesResult};
use crate::signing::{sign_request, SigningParams, SES_SERVICE};
use crate::signing::cache::SigningKeyCache;

use super::pool::ConnectionPool;
use super::request::{HttpMethod, SesRequest};
use super::response::SesResponse;
use super::transport::{ReqwestTransport, Transport};
use super::HttpClient;

/// HTTP client for AWS SES API communication.
///
/// This client handles:
/// - Request signing with AWS Signature V4
/// - Automatic retries with exponential backoff
/// - Rate limiting
/// - Connection pooling
///
/// # Examples
///
/// ```rust,ignore
/// use integrations_aws_ses::config::SesConfig;
/// use integrations_aws_ses::http::SesHttpClient;
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let config = SesConfig::builder()
///     .region("us-east-1")
///     .credentials("access_key", "secret_key")
///     .build()?;
///
/// let client = SesHttpClient::new(config).await?;
///
/// // Use the client to make API requests
/// # Ok(())
/// # }
/// ```
pub struct SesHttpClient {
    /// Client configuration
    config: Arc<SesConfig>,

    /// HTTP transport
    transport: Arc<dyn Transport>,

    /// Rate limiter (if configured)
    rate_limiter: Option<Arc<RateLimiter>>,

    /// Signing key cache
    signing_cache: Arc<SigningKeyCache>,

    /// Endpoint URL
    endpoint: String,
}

impl SesHttpClient {
    /// Create a new SES HTTP client.
    ///
    /// # Arguments
    ///
    /// * `config` - Client configuration
    ///
    /// # Returns
    ///
    /// A new `SesHttpClient` instance or an error if initialization fails.
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use integrations_aws_ses::config::SesConfig;
    /// use integrations_aws_ses::http::SesHttpClient;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = SesConfig::builder()
    ///     .region("us-east-1")
    ///     .credentials("access_key", "secret_key")
    ///     .build()?;
    ///
    /// let client = SesHttpClient::new(config).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn new(config: SesConfig) -> SesResult<Self> {
        let endpoint = config.ses_endpoint();

        // Create transport
        let transport = Arc::new(ReqwestTransport::new(
            config.timeout,
            config.connect_timeout,
        )?) as Arc<dyn Transport>;

        // Create rate limiter if configured
        let rate_limiter = config
            .rate_limit
            .as_ref()
            .map(|cfg| Arc::new(RateLimiter::new(cfg.clone())));

        Ok(Self {
            config: Arc::new(config),
            transport,
            rate_limiter,
            signing_cache: Arc::new(SigningKeyCache::new()),
            endpoint,
        })
    }

    /// Create a new SES HTTP client with custom transport.
    ///
    /// This is useful for testing or using alternative HTTP implementations.
    ///
    /// # Arguments
    ///
    /// * `config` - Client configuration
    /// * `transport` - Custom transport implementation
    ///
    /// # Returns
    ///
    /// A new `SesHttpClient` instance.
    pub fn with_transport(
        config: SesConfig,
        transport: Arc<dyn Transport>,
    ) -> Self {
        let endpoint = config.ses_endpoint();

        let rate_limiter = config
            .rate_limit
            .as_ref()
            .map(|cfg| Arc::new(RateLimiter::new(cfg.clone())));

        Self {
            config: Arc::new(config),
            transport,
            rate_limiter,
            signing_cache: Arc::new(SigningKeyCache::new()),
            endpoint,
        }
    }

    /// Build a signed HTTP request.
    ///
    /// This method:
    /// 1. Builds the full URL
    /// 2. Creates the HTTP request
    /// 3. Adds required headers
    /// 4. Signs the request with AWS Signature V4
    ///
    /// # Arguments
    ///
    /// * `ses_request` - The SES request to build
    ///
    /// # Returns
    ///
    /// A signed `reqwest::Request` or an error.
    async fn build_request(&self, ses_request: &SesRequest) -> SesResult<Request> {
        // Get credentials
        let credentials = self
            .config
            .credentials_provider
            .credentials()
            .await
            .map_err(|e| SesError::Credential {
                message: format!("Failed to get credentials: {}", e),
            })?;

        // Build URL
        let url = Url::parse(&ses_request.build_url(&self.endpoint))
            .map_err(|e| SesError::Validation {
                message: format!("Invalid URL: {}", e),
                field: Some("url".to_string()),
            })?;

        // Create request builder
        let method = match ses_request.method() {
            HttpMethod::GET => reqwest::Method::GET,
            HttpMethod::POST => reqwest::Method::POST,
            HttpMethod::PUT => reqwest::Method::PUT,
            HttpMethod::DELETE => reqwest::Method::DELETE,
            HttpMethod::PATCH => reqwest::Method::PATCH,
        };

        let mut request_builder = reqwest::Request::new(method, url);

        // Add headers from SesRequest
        for (name, value) in ses_request.headers() {
            request_builder.headers_mut().insert(name.clone(), value.clone());
        }

        // Add Host header if not present
        if !request_builder.headers().contains_key("host") {
            let host = self.extract_host(&self.endpoint)?;
            request_builder.headers_mut().insert(
                "host",
                host.parse().map_err(|e| SesError::Validation {
                    message: format!("Invalid host header: {}", e),
                    field: Some("host".to_string()),
                })?,
            );
        }

        // Add Content-Type header if body is present
        if let Some(content_type) = ses_request.content_type() {
            request_builder.headers_mut().insert(
                "content-type",
                content_type.parse().map_err(|e| SesError::Validation {
                    message: format!("Invalid content-type header: {}", e),
                    field: Some("content-type".to_string()),
                })?,
            );
        }

        // Add User-Agent if configured
        if let Some(ref user_agent) = self.config.user_agent {
            request_builder.headers_mut().insert(
                "user-agent",
                user_agent.parse().map_err(|e| SesError::Validation {
                    message: format!("Invalid user-agent header: {}", e),
                    field: Some("user-agent".to_string()),
                })?,
            );
        }

        // Set body if present
        if let Some(body) = ses_request.body() {
            *request_builder.body_mut() = Some(body.to_vec().into());
        }

        // Sign the request
        let signing_params = self.build_signing_params(&credentials)?;
        let timestamp = Utc::now();

        sign_request(
            ses_request.method().as_str(),
            ses_request.path(),
            ses_request.query_params(),
            request_builder.headers_mut(),
            ses_request.body(),
            &signing_params,
            &timestamp,
            Some(self.signing_cache.clone()),
        )
        .map_err(|e| SesError::Signing {
            message: format!("Failed to sign request: {}", e),
        })?;

        Ok(request_builder)
    }

    /// Build signing parameters from credentials.
    fn build_signing_params(&self, credentials: &AwsCredentials) -> SesResult<SigningParams> {
        let mut params = SigningParams::new(&self.config.region, SES_SERVICE)
            .with_access_key(credentials.access_key_id())
            .with_secret_key(credentials.secret_access_key());

        if let Some(token) = credentials.session_token() {
            params = params.with_session_token(token);
        }

        Ok(params)
    }

    /// Extract the host from an endpoint URL.
    fn extract_host(&self, endpoint: &str) -> SesResult<String> {
        let url = Url::parse(endpoint).map_err(|e| SesError::Configuration {
            message: format!("Invalid endpoint URL: {}", e),
            source: None,
        })?;

        url.host_str()
            .map(|h| h.to_string())
            .ok_or_else(|| SesError::Configuration {
                message: "Endpoint URL has no host".to_string(),
                source: None,
            })
    }

    /// Send a request with retry logic.
    ///
    /// This method implements exponential backoff retry logic for retryable errors.
    async fn send_with_retry(&self, request: Request) -> SesResult<SesResponse> {
        let mut attempt = 0;
        let max_attempts = self.config.max_retries + 1; // +1 for initial attempt

        loop {
            // Clone the request for this attempt
            let req = request
                .try_clone()
                .ok_or_else(|| SesError::Transport {
                    message: "Failed to clone request for retry".to_string(),
                    source: None,
                    retryable: false,
                })?;

            // Send the request
            match self.transport.send(req).await {
                Ok(response) => {
                    let ses_response = SesResponse::from_reqwest(response).await?;

                    // Check if response indicates success
                    if ses_response.is_success() {
                        return Ok(ses_response);
                    }

                    // Convert to error
                    let error = ses_response.into_error();

                    // Check if we should retry
                    if attempt >= max_attempts - 1
                        || !self.config.retry_config.should_retry(attempt, &error)
                    {
                        return Err(error);
                    }

                    // Wait before retrying
                    let delay = if let Some(retry_after) = error.retry_after() {
                        retry_after
                    } else {
                        self.config.retry_config.calculate_delay(attempt)
                    };

                    sleep(delay).await;
                    attempt += 1;
                }
                Err(e) => {
                    // Check if we should retry
                    if attempt >= max_attempts - 1
                        || !self.config.retry_config.should_retry(attempt, &e)
                    {
                        return Err(e);
                    }

                    // Wait before retrying
                    let delay = self.config.retry_config.calculate_delay(attempt);
                    sleep(delay).await;
                    attempt += 1;
                }
            }
        }
    }

    /// Get a reference to the connection pool.
    ///
    /// This is useful for monitoring pool statistics.
    pub fn pool(&self) -> Option<&ConnectionPool> {
        // Try to downcast the transport to ReqwestTransport
        if let Some(reqwest_transport) = (&*self.transport as &dyn std::any::Any)
            .downcast_ref::<ReqwestTransport>()
        {
            Some(reqwest_transport.pool())
        } else {
            None
        }
    }

    /// Get the signing cache.
    ///
    /// This is useful for monitoring cache statistics.
    pub fn signing_cache(&self) -> &SigningKeyCache {
        &self.signing_cache
    }
}

#[async_trait]
impl HttpClient for SesHttpClient {
    async fn send_request(&self, ses_request: SesRequest) -> SesResult<SesResponse> {
        // Apply rate limiting if configured
        if let Some(ref limiter) = self.rate_limiter {
            limiter.acquire().await?;
        }

        // Build and sign the request
        let request = self.build_request(&ses_request).await?;

        // Send with retry logic
        self.send_with_retry(request).await
    }

    fn endpoint(&self) -> &str {
        &self.endpoint
    }

    fn region(&self) -> &str {
        &self.config.region
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::RetryConfig;
    use crate::credentials::StaticCredentialProvider;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn create_test_client() -> (SesHttpClient, MockServer) {
        let mock_server = MockServer::start().await;

        let config = SesConfig::builder()
            .region("us-east-1")
            .endpoint(&mock_server.uri())
            .credentials_provider(StaticCredentialProvider::new(
                "AKIAIOSFODNN7EXAMPLE".to_string(),
                "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
                None,
            ))
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();

        (client, mock_server)
    }

    #[tokio::test]
    async fn test_client_creation() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await;
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_client_endpoint() {
        let config = SesConfig::builder()
            .region("us-west-2")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();
        assert_eq!(client.endpoint(), "https://email.us-west-2.amazonaws.com");
    }

    #[tokio::test]
    async fn test_client_region() {
        let config = SesConfig::builder()
            .region("eu-west-1")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();
        assert_eq!(client.region(), "eu-west-1");
    }

    #[tokio::test]
    async fn test_send_request_success() {
        let (client, mock_server) = create_test_client().await;

        Mock::given(method("POST"))
            .and(path("/v2/email/outbound-emails"))
            .and(header("authorization", wiremock::matchers::any()))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"MessageId": "test-123"})),
            )
            .mount(&mock_server)
            .await;

        let request = SesRequest::post("/v2/email/outbound-emails")
            .json(&serde_json::json!({"test": "data"}))
            .unwrap();

        let response = client.send_request(request).await;
        assert!(response.is_ok());

        let resp = response.unwrap();
        assert!(resp.is_success());
    }

    #[tokio::test]
    async fn test_send_request_with_retry() {
        let mock_server = MockServer::start().await;

        let mut config = SesConfig::builder()
            .region("us-east-1")
            .endpoint(&mock_server.uri())
            .credentials_provider(StaticCredentialProvider::new(
                "AKIAIOSFODNN7EXAMPLE".to_string(),
                "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
                None,
            ))
            .max_retries(2)
            .retry_config(RetryConfig {
                max_attempts: 2,
                initial_backoff: Duration::from_millis(10),
                max_backoff: Duration::from_millis(100),
                backoff_multiplier: 2.0,
                jitter: false,
            })
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();

        // First request fails, second succeeds
        Mock::given(method("GET"))
            .and(path("/v2/email/identities"))
            .respond_with(ResponseTemplate::new(500))
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;

        Mock::given(method("GET"))
            .and(path("/v2/email/identities"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"Identities": []})))
            .mount(&mock_server)
            .await;

        let request = SesRequest::get("/v2/email/identities");
        let response = client.send_request(request).await;

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_send_request_max_retries_exceeded() {
        let mock_server = MockServer::start().await;

        let config = SesConfig::builder()
            .region("us-east-1")
            .endpoint(&mock_server.uri())
            .credentials_provider(StaticCredentialProvider::new(
                "AKIAIOSFODNN7EXAMPLE".to_string(),
                "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
                None,
            ))
            .max_retries(1)
            .retry_config(RetryConfig {
                max_attempts: 1,
                initial_backoff: Duration::from_millis(10),
                max_backoff: Duration::from_millis(100),
                backoff_multiplier: 2.0,
                jitter: false,
            })
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();

        // All requests fail
        Mock::given(method("GET"))
            .and(path("/v2/email/identities"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;

        let request = SesRequest::get("/v2/email/identities");
        let response = client.send_request(request).await;

        assert!(response.is_err());
        assert!(response.unwrap_err().is_retryable());
    }

    #[tokio::test]
    async fn test_send_request_non_retryable_error() {
        let (client, mock_server) = create_test_client().await;

        Mock::given(method("POST"))
            .and(path("/v2/email/outbound-emails"))
            .respond_with(
                ResponseTemplate::new(400).set_body_json(serde_json::json!({
                    "__type": "ValidationError",
                    "message": "Invalid email address"
                })),
            )
            .mount(&mock_server)
            .await;

        let request = SesRequest::post("/v2/email/outbound-emails")
            .json(&serde_json::json!({"test": "data"}))
            .unwrap();

        let response = client.send_request(request).await;

        assert!(response.is_err());
        let err = response.unwrap_err();
        assert!(!err.is_retryable());
    }

    #[tokio::test]
    async fn test_build_request_adds_required_headers() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();

        let ses_request = SesRequest::get("/v2/email/identities");
        let request = client.build_request(&ses_request).await.unwrap();

        let headers = request.headers();
        assert!(headers.contains_key("host"));
        assert!(headers.contains_key("x-amz-date"));
        assert!(headers.contains_key("x-amz-content-sha256"));
        assert!(headers.contains_key("authorization"));
    }

    #[tokio::test]
    async fn test_extract_host() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();

        let host = client
            .extract_host("https://email.us-east-1.amazonaws.com")
            .unwrap();
        assert_eq!(host, "email.us-east-1.amazonaws.com");
    }

    #[tokio::test]
    async fn test_signing_cache() {
        let config = SesConfig::builder()
            .region("us-east-1")
            .credentials("access_key", "secret_key")
            .build()
            .unwrap();

        let client = SesHttpClient::new(config).await.unwrap();

        // Initially empty
        assert_eq!(client.signing_cache().len(), 0);
    }
}
