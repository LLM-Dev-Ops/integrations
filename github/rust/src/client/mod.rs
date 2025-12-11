//! GitHub API client implementation.

use crate::auth::{AuthManager, AuthMethod};
use crate::config::{GitHubConfig, GitHubConfigBuilder};
use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult, RateLimitInfo};
use crate::pagination::{Page, PaginationLinks, PaginationParams};
use crate::resilience::{CircuitBreaker, RateLimitTracker, ResilienceOrchestrator, RetryExecutor};
use crate::services::*;
use chrono::{DateTime, Utc};
use reqwest::{header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT}, Client, Method, Response, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;

/// GitHub error response format.
#[derive(Debug, serde::Deserialize)]
struct GitHubErrorResponse {
    message: String,
    documentation_url: Option<String>,
    errors: Option<Vec<GitHubValidationError>>,
}

/// GitHub validation error.
#[derive(Debug, serde::Deserialize)]
struct GitHubValidationError {
    resource: Option<String>,
    field: Option<String>,
    code: Option<String>,
    message: Option<String>,
}

/// GitHub API client.
pub struct GitHubClient {
    /// HTTP client.
    http: Client,
    /// Configuration.
    config: GitHubConfig,
    /// Authentication manager.
    auth: Arc<AuthManager>,
    /// Resilience orchestrator.
    resilience: Arc<ResilienceOrchestrator>,
}

impl GitHubClient {
    /// Creates a new GitHub client.
    pub fn new(config: GitHubConfig) -> GitHubResult<Self> {
        config.validate()?;

        let http = Client::builder()
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .pool_max_idle_per_host(config.pool.max_idle_per_host)
            .pool_idle_timeout(config.pool.idle_timeout)
            .build()
            .map_err(|e| {
                GitHubError::new(
                    GitHubErrorKind::InvalidConfiguration,
                    format!("Failed to create HTTP client: {}", e),
                )
            })?;

        let auth = Arc::new(AuthManager::new(
            config.auth.clone().ok_or_else(|| {
                GitHubError::new(GitHubErrorKind::MissingAuth, "Authentication required")
            })?,
        ));

        let retry = RetryExecutor::new(
            config.retry.max_attempts,
            config.retry.initial_backoff,
            config.retry.max_backoff,
            config.retry.multiplier,
            config.retry.jitter,
        );

        let circuit_breaker = CircuitBreaker::new(
            config.circuit_breaker.failure_threshold,
            config.circuit_breaker.success_threshold,
            config.circuit_breaker.reset_timeout,
        );

        let rate_limit_tracker = RateLimitTracker::new(config.rate_limit.buffer_percentage);

        let resilience = Arc::new(ResilienceOrchestrator::new(
            retry,
            circuit_breaker,
            rate_limit_tracker,
        ));

        Ok(Self {
            http,
            config,
            auth,
            resilience,
        })
    }

    /// Creates a new client builder.
    pub fn builder() -> GitHubClientBuilder {
        GitHubClientBuilder::new()
    }

    /// Gets the base URL.
    pub fn base_url(&self) -> &str {
        &self.config.base_url
    }

    // Service accessors

    /// Gets the repositories service.
    pub fn repositories(&self) -> RepositoriesService {
        RepositoriesService::new(self)
    }

    /// Gets the issues service.
    pub fn issues(&self) -> IssuesService {
        IssuesService::new(self)
    }

    /// Gets the pull requests service.
    pub fn pull_requests(&self) -> PullRequestsService {
        PullRequestsService::new(self)
    }

    /// Gets the users service.
    pub fn users(&self) -> UsersService {
        UsersService::new(self)
    }

    /// Gets the organizations service.
    pub fn organizations(&self) -> OrganizationsService {
        OrganizationsService::new(self)
    }

    /// Gets the actions service.
    pub fn actions(&self) -> ActionsService {
        ActionsService::new(self)
    }

    /// Gets the gists service.
    pub fn gists(&self) -> GistsService {
        GistsService::new(self)
    }

    /// Gets the search service.
    pub fn search(&self) -> SearchService {
        SearchService::new(self)
    }

    // HTTP methods

    /// Makes a GET request.
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> GitHubResult<T> {
        self.request(Method::GET, path, Option::<()>::None).await
    }

    /// Makes a GET request with query parameters.
    pub async fn get_with_params<T: DeserializeOwned, P: Serialize>(
        &self,
        path: &str,
        params: &P,
    ) -> GitHubResult<T> {
        self.request_with_params(Method::GET, path, params, Option::<()>::None)
            .await
    }

    /// Makes a paginated GET request.
    pub async fn get_page<T: DeserializeOwned>(
        &self,
        path: &str,
        pagination: &PaginationParams,
    ) -> GitHubResult<Page<T>> {
        let url = self.build_url(path)?;
        let mut params = pagination.to_query();

        let response = self
            .execute_request(Method::GET, &url, &params, Option::<()>::None)
            .await?;

        let links = PaginationLinks::from_headers(response.headers());
        let items: Vec<T> = response.json().await.map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::DeserializationError,
                format!("Failed to deserialize response: {}", e),
            )
        })?;

        Ok(Page::new(items, links)
            .with_page(pagination.page.unwrap_or(1))
            .with_per_page(pagination.per_page.unwrap_or(30)))
    }

    /// Makes a POST request.
    pub async fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> GitHubResult<T> {
        self.request(Method::POST, path, Some(body)).await
    }

    /// Makes a POST request without a response body.
    pub async fn post_no_response<B: Serialize>(&self, path: &str, body: &B) -> GitHubResult<()> {
        self.request_no_response(Method::POST, path, Some(body)).await
    }

    /// Makes a PUT request.
    pub async fn put<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> GitHubResult<T> {
        self.request(Method::PUT, path, Some(body)).await
    }

    /// Makes a PUT request without a response body.
    pub async fn put_no_response<B: Serialize>(&self, path: &str, body: &B) -> GitHubResult<()> {
        self.request_no_response(Method::PUT, path, Some(body)).await
    }

    /// Makes a PATCH request.
    pub async fn patch<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> GitHubResult<T> {
        self.request(Method::PATCH, path, Some(body)).await
    }

    /// Makes a PATCH request without a response body.
    pub async fn patch_no_response<B: Serialize>(&self, path: &str, body: &B) -> GitHubResult<()> {
        self.request_no_response(Method::PATCH, path, Some(body)).await
    }

    /// Makes a DELETE request.
    pub async fn delete(&self, path: &str) -> GitHubResult<()> {
        self.request_no_response(Method::DELETE, path, Option::<()>::None).await
    }

    /// Makes a request and returns the raw response.
    pub async fn raw_request(
        &self,
        method: Method,
        path: &str,
        body: Option<&impl Serialize>,
    ) -> GitHubResult<Response> {
        let url = self.build_url(path)?;
        self.execute_request(method, &url, &[] as &[(&str, &str)], body).await
    }

    // Internal methods

    async fn request<T: DeserializeOwned, B: Serialize>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> GitHubResult<T> {
        let url = self.build_url(path)?;
        let response = self
            .execute_request(method, &url, &[] as &[(&str, &str)], body)
            .await?;

        response.json().await.map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::DeserializationError,
                format!("Failed to deserialize response: {}", e),
            )
        })
    }

    async fn request_with_params<T: DeserializeOwned, P: Serialize, B: Serialize>(
        &self,
        method: Method,
        path: &str,
        params: &P,
        body: Option<&B>,
    ) -> GitHubResult<T> {
        let url = self.build_url(path)?;
        let query_string = serde_urlencoded::to_string(params).map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::InvalidParameter,
                format!("Failed to serialize parameters: {}", e),
            )
        })?;

        let full_url = if query_string.is_empty() {
            url
        } else {
            format!("{}?{}", url, query_string)
        };

        let response = self
            .execute_request(method, &full_url, &[] as &[(&str, &str)], body)
            .await?;

        response.json().await.map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::DeserializationError,
                format!("Failed to deserialize response: {}", e),
            )
        })
    }

    async fn request_no_response<B: Serialize>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> GitHubResult<()> {
        let url = self.build_url(path)?;
        self.execute_request(method, &url, &[] as &[(&str, &str)], body)
            .await?;
        Ok(())
    }

    async fn execute_request<B: Serialize>(
        &self,
        method: Method,
        url: &str,
        params: &[(&str, &str)],
        body: Option<&B>,
    ) -> GitHubResult<Response> {
        let auth_header = self.auth.get_auth_header().await?;

        let http = self.http.clone();
        let url = url.to_string();
        let method_clone = method.clone();
        let user_agent = self.config.user_agent.clone();
        let api_version = self.config.api_version.clone();
        let resilience = self.resilience.clone();

        // Serialize body outside the closure to avoid lifetime issues
        let body_bytes = body.map(|b| serde_json::to_vec(b)).transpose().map_err(|e| {
            GitHubError::new(
                GitHubErrorKind::InvalidParameter,
                format!("Failed to serialize request body: {}", e),
            )
        })?;

        let response = resilience
            .execute(|| {
                let http = http.clone();
                let url = url.clone();
                let method = method_clone.clone();
                let auth_header = auth_header.clone();
                let user_agent = user_agent.clone();
                let api_version = api_version.clone();
                let body_bytes = body_bytes.clone();

                async move {
                    let mut request = http
                        .request(method, &url)
                        .header(AUTHORIZATION, &auth_header)
                        .header(USER_AGENT, &user_agent)
                        .header(ACCEPT, "application/vnd.github+json")
                        .header("X-GitHub-Api-Version", &api_version);

                    if let Some(bytes) = body_bytes {
                        request = request
                            .header("Content-Type", "application/json")
                            .body(bytes);
                    }

                    let response = request.send().await.map_err(|e| {
                        if e.is_timeout() {
                            GitHubError::timeout(format!("Request timed out: {}", e))
                        } else if e.is_connect() {
                            GitHubError::new(
                                GitHubErrorKind::ConnectionFailed,
                                format!("Connection failed: {}", e),
                            )
                        } else {
                            GitHubError::new(
                                GitHubErrorKind::Unknown,
                                format!("Request failed: {}", e),
                            )
                        }
                    })?;

                    // Extract rate limit info
                    let rate_limit = Self::extract_rate_limit(response.headers());

                    // Check for errors
                    let status = response.status();
                    if !status.is_success() {
                        return Err(Self::handle_error_response(response, rate_limit).await);
                    }

                    Ok(response)
                }
            })
            .await?;

        // Update rate limit tracker
        if let Some(info) = Self::extract_rate_limit(response.headers()) {
            self.resilience.update_rate_limit(&info).await;
        }

        Ok(response)
    }

    fn build_url(&self, path: &str) -> GitHubResult<String> {
        let base = self.config.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        Ok(format!("{}/{}", base, path))
    }

    fn extract_rate_limit(headers: &HeaderMap) -> Option<RateLimitInfo> {
        let limit = headers
            .get("x-ratelimit-limit")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())?;

        let remaining = headers
            .get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())?;

        let reset_timestamp: i64 = headers
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())?;

        let reset_at = DateTime::from_timestamp(reset_timestamp, 0)?;

        let retry_after = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok());

        let resource = headers
            .get("x-ratelimit-resource")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        Some(RateLimitInfo {
            limit,
            remaining,
            reset_at,
            retry_after,
            resource,
        })
    }

    async fn handle_error_response(response: Response, rate_limit: Option<RateLimitInfo>) -> GitHubError {
        let status = response.status();
        let request_id = response
            .headers()
            .get("x-github-request-id")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        // Check for rate limit errors
        if status == StatusCode::FORBIDDEN || status == StatusCode::TOO_MANY_REQUESTS {
            if let Some(info) = rate_limit {
                if info.remaining == 0 {
                    return GitHubError::rate_limit(info);
                }
            }
        }

        // Try to parse error body
        let error_body = response.json::<GitHubErrorResponse>().await.ok();

        let message = error_body
            .as_ref()
            .map(|e| e.message.clone())
            .unwrap_or_else(|| format!("HTTP {} error", status.as_u16()));

        let documentation_url = error_body.as_ref().and_then(|e| e.documentation_url.clone());

        let mut error = GitHubError::from_response(
            status.as_u16(),
            message,
            documentation_url,
            request_id,
        );

        if let Some(info) = rate_limit {
            error = error.with_rate_limit(info);
        }

        error
    }
}

/// Builder for GitHubClient.
pub struct GitHubClientBuilder {
    config_builder: GitHubConfigBuilder,
}

impl GitHubClientBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self {
            config_builder: GitHubConfig::builder(),
        }
    }

    /// Sets the base URL.
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.base_url(url);
        self
    }

    /// Sets the authentication method.
    pub fn auth(mut self, auth: AuthMethod) -> Self {
        self.config_builder = self.config_builder.auth(auth);
        self
    }

    /// Sets a personal access token.
    pub fn pat(self, token: impl Into<String>) -> Self {
        self.auth(AuthMethod::pat(token))
    }

    /// Sets the timeout.
    pub fn timeout(mut self, timeout: std::time::Duration) -> Self {
        self.config_builder = self.config_builder.timeout(timeout);
        self
    }

    /// Sets the User-Agent.
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.user_agent(ua);
        self
    }

    /// Disables retries.
    pub fn no_retry(mut self) -> Self {
        self.config_builder = self.config_builder.no_retry();
        self
    }

    /// Disables circuit breaker.
    pub fn no_circuit_breaker(mut self) -> Self {
        self.config_builder = self.config_builder.no_circuit_breaker();
        self
    }

    /// Builds the client.
    pub fn build(self) -> GitHubResult<GitHubClient> {
        let config = self.config_builder.build()?;
        GitHubClient::new(config)
    }
}

impl Default for GitHubClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_url() {
        let config = GitHubConfig::builder()
            .auth(AuthMethod::pat("test"))
            .build()
            .unwrap();
        let client = GitHubClient::new(config).unwrap();

        assert_eq!(
            client.build_url("/repos/owner/repo").unwrap(),
            "https://api.github.com/repos/owner/repo"
        );
        assert_eq!(
            client.build_url("repos/owner/repo").unwrap(),
            "https://api.github.com/repos/owner/repo"
        );
    }

    #[test]
    fn test_client_builder() {
        let result = GitHubClient::builder()
            .pat("ghp_xxxx")
            .user_agent("test-client/1.0")
            .build();

        assert!(result.is_ok());
    }
}
