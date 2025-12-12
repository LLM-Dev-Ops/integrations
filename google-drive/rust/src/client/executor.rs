//! Request executor with auth, resilience, and error handling.

use crate::auth::AuthProvider;
use crate::config::GoogleDriveConfig;
use crate::errors::{GoogleDriveError, GoogleDriveResult, ResponseError, ServerError, QuotaError, AuthorizationError, AuthenticationError, NetworkError};
use crate::transport::{HttpRequest, HttpResponse, HttpMethod, HttpTransport, RequestBody};
use bytes::Bytes;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::StatusCode;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// Request executor that handles HTTP requests with authentication, resilience, and error mapping.
///
/// This is the core component that:
/// - Adds authentication headers to requests
/// - Executes requests through the HTTP transport
/// - Maps HTTP errors to domain errors
/// - Provides resilience hooks (retry, circuit breaker, rate limiting will be added later)
pub struct RequestExecutor {
    /// Configuration
    config: GoogleDriveConfig,
    /// HTTP transport
    transport: Arc<dyn HttpTransport>,
    /// Authentication provider
    auth: Arc<dyn AuthProvider>,
}

impl RequestExecutor {
    /// Creates a new request executor.
    pub fn new(
        config: GoogleDriveConfig,
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
    ) -> Self {
        Self {
            config,
            transport,
            auth,
        }
    }

    /// Executes a request and deserializes the JSON response.
    ///
    /// # Type Parameters
    ///
    /// * `T` - The response type to deserialize into
    ///
    /// # Arguments
    ///
    /// * `method` - HTTP method
    /// * `path` - API path (relative to base URL)
    /// * `body` - Optional request body
    ///
    /// # Returns
    ///
    /// The deserialized response or an error
    pub async fn execute_request<T: DeserializeOwned>(
        &self,
        method: HttpMethod,
        path: &str,
        body: Option<RequestBody>,
    ) -> GoogleDriveResult<T> {
        let response = self.execute_request_raw(method, path, body).await?;

        // Deserialize response
        serde_json::from_slice(&response)
            .map_err(|e| GoogleDriveError::Response(
                ResponseError::DeserializationError(format!("Failed to deserialize response: {}", e))
            ))
    }

    /// Executes a request and returns raw bytes.
    ///
    /// # Arguments
    ///
    /// * `method` - HTTP method
    /// * `path` - API path (relative to base URL)
    /// * `body` - Optional request body
    ///
    /// # Returns
    ///
    /// The raw response bytes or an error
    pub async fn execute_request_raw(
        &self,
        method: HttpMethod,
        path: &str,
        body: Option<RequestBody>,
    ) -> GoogleDriveResult<Bytes> {
        // Build URL
        let url = self.build_url(path)?;

        // Get access token
        let token = self.auth
            .get_access_token()
            .await
            .map_err(|e| GoogleDriveError::Authentication(e))?;

        // Build headers
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token.token.expose_secret()))
                .map_err(|e| GoogleDriveError::Request(
                    crate::errors::RequestError::ValidationError(format!("Invalid auth header: {}", e))
                ))?
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&self.config.user_agent)
                .map_err(|e| GoogleDriveError::Request(
                    crate::errors::RequestError::ValidationError(format!("Invalid user agent: {}", e))
                ))?
        );
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/json")
        );

        // Build HTTP request
        let http_request = HttpRequest {
            method,
            url,
            headers,
            body,
            timeout: Some(self.config.timeout),
        };

        // Send request
        let response = self.transport
            .send(http_request)
            .await
            .map_err(|e| GoogleDriveError::from(e))?;

        // Check for errors
        if !response.status.is_success() {
            return Err(self.handle_error_response(response)?);
        }

        Ok(response.body)
    }

    /// Builds a full URL from a path.
    ///
    /// # Arguments
    ///
    /// * `path` - API path (relative to base URL)
    ///
    /// # Returns
    ///
    /// The full URL or an error
    pub fn build_url(&self, path: &str) -> GoogleDriveResult<Url> {
        let base = &self.config.base_url;
        let path = path.trim_start_matches('/');

        base.join(path)
            .map_err(|e| GoogleDriveError::Request(
                crate::errors::RequestError::ValidationError(format!("Invalid URL: {}", e))
            ))
    }

    /// Builds a full upload URL from a path.
    pub fn build_upload_url(&self, path: &str) -> GoogleDriveResult<Url> {
        let base = &self.config.upload_url;
        let path = path.trim_start_matches('/');

        base.join(path)
            .map_err(|e| GoogleDriveError::Request(
                crate::errors::RequestError::ValidationError(format!("Invalid upload URL: {}", e))
            ))
    }

    /// Adds authentication header to a header map.
    pub async fn add_auth_header(&self, headers: &mut HeaderMap) -> GoogleDriveResult<()> {
        let token = self.auth
            .get_access_token()
            .await
            .map_err(|e| GoogleDriveError::Authentication(e))?;

        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token.token.expose_secret()))
                .map_err(|e| GoogleDriveError::Request(
                    crate::errors::RequestError::ValidationError(format!("Invalid auth header: {}", e))
                ))?
        );

        Ok(())
    }

    /// Handles error responses from the API.
    ///
    /// Maps HTTP status codes and error responses to domain errors.
    fn handle_error_response(&self, response: HttpResponse) -> GoogleDriveResult<GoogleDriveError> {
        let status = response.status;

        // Try to parse error body
        #[derive(serde::Deserialize)]
        struct ErrorResponse {
            error: ErrorDetail,
        }

        #[derive(serde::Deserialize)]
        struct ErrorDetail {
            code: u16,
            message: String,
            errors: Option<Vec<ErrorItem>>,
        }

        #[derive(serde::Deserialize)]
        struct ErrorItem {
            reason: Option<String>,
            message: Option<String>,
        }

        let error_detail: Option<ErrorResponse> = serde_json::from_slice(&response.body).ok();

        let (message, reason) = error_detail
            .as_ref()
            .map(|e| {
                let reason = e.error.errors.as_ref()
                    .and_then(|errs| errs.first())
                    .and_then(|err| err.reason.clone());
                (e.error.message.clone(), reason)
            })
            .unwrap_or_else(|| (
                format!("HTTP {}: {}", status.as_u16(), String::from_utf8_lossy(&response.body)),
                None
            ));

        // Extract retry-after header if present
        let retry_after = response.headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .map(Duration::from_secs);

        // Map to domain errors based on status code and reason
        let error = match status {
            StatusCode::BAD_REQUEST => {
                if let Some(ref r) = reason {
                    match r.as_str() {
                        "invalidParameter" => GoogleDriveError::Request(
                            crate::errors::RequestError::InvalidParameter(message)
                        ),
                        "invalidQuery" => GoogleDriveError::Request(
                            crate::errors::RequestError::InvalidQuery(message)
                        ),
                        _ => GoogleDriveError::Request(
                            crate::errors::RequestError::ValidationError(message)
                        ),
                    }
                } else {
                    GoogleDriveError::Request(
                        crate::errors::RequestError::ValidationError(message)
                    )
                }
            }
            StatusCode::UNAUTHORIZED => {
                GoogleDriveError::Authentication(AuthenticationError::InvalidToken(message))
            }
            StatusCode::FORBIDDEN => {
                if let Some(ref r) = reason {
                    match r.as_str() {
                        "userRateLimitExceeded" => GoogleDriveError::Quota(
                            QuotaError::UserRateLimitExceeded {
                                message,
                                retry_after,
                            }
                        ),
                        "rateLimitExceeded" => GoogleDriveError::Quota(
                            QuotaError::ProjectRateLimitExceeded {
                                message,
                                retry_after,
                            }
                        ),
                        "storageQuotaExceeded" => GoogleDriveError::Quota(
                            QuotaError::StorageQuotaExceeded {
                                message,
                                limit: 0,
                                used: 0,
                            }
                        ),
                        "insufficientPermissions" | "forbidden" => GoogleDriveError::Authorization(
                            AuthorizationError::InsufficientPermissions(message)
                        ),
                        "domainPolicy" => GoogleDriveError::Authorization(
                            AuthorizationError::DomainPolicy(message)
                        ),
                        _ => GoogleDriveError::Authorization(
                            AuthorizationError::Forbidden(message)
                        ),
                    }
                } else {
                    GoogleDriveError::Authorization(AuthorizationError::Forbidden(message))
                }
            }
            StatusCode::NOT_FOUND => {
                GoogleDriveError::Resource(crate::errors::ResourceError::FileNotFound(message))
            }
            StatusCode::TOO_MANY_REQUESTS => {
                GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                    message,
                    retry_after,
                })
            }
            StatusCode::INTERNAL_SERVER_ERROR => {
                GoogleDriveError::Server(ServerError::InternalError(message))
            }
            StatusCode::BAD_GATEWAY => {
                GoogleDriveError::Server(ServerError::BadGateway(message))
            }
            StatusCode::SERVICE_UNAVAILABLE => {
                GoogleDriveError::Server(ServerError::ServiceUnavailable {
                    message,
                    retry_after,
                })
            }
            _ => {
                GoogleDriveError::Server(ServerError::InternalError(
                    format!("HTTP {}: {}", status.as_u16(), message)
                ))
            }
        };

        Ok(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_url() {
        use crate::auth::OAuth2Provider;

        let auth = OAuth2Provider::new_with_strings("id", "secret", "refresh");
        let config = GoogleDriveConfig::builder()
            .auth_provider(auth)
            .build()
            .unwrap();

        let transport = Arc::new(crate::transport::ReqwestTransport::default().unwrap());
        let auth = config.auth_provider.clone();
        let executor = RequestExecutor::new(config, transport, auth);

        let url = executor.build_url("/files").unwrap();
        assert_eq!(url.as_str(), "https://www.googleapis.com/drive/v3/files");

        let url = executor.build_url("files/123").unwrap();
        assert_eq!(url.as_str(), "https://www.googleapis.com/drive/v3/files/123");
    }
}
