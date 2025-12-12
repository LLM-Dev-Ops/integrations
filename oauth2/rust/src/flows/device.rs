//! Device Authorization Flow
//!
//! RFC 8628 - OAuth 2.0 Device Authorization Grant.

use async_trait::async_trait;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use crate::core::{HttpMethod, HttpRequest, HttpTransport};
use crate::error::{DeviceFlowError, OAuth2Error, ProtocolError};
use crate::types::{
    ClientAuthMethod, DeviceAuthorizationResponse, DeviceCodeParams, DeviceTokenResult,
    OAuth2Config, TokenResponse,
};
use crate::error::create_error_from_response;

/// Device Authorization Flow interface.
#[async_trait]
pub trait DeviceAuthorizationFlow: Send + Sync {
    /// Request device and user codes.
    async fn request_device_code(
        &self,
        params: DeviceCodeParams,
    ) -> Result<DeviceAuthorizationResponse, OAuth2Error>;

    /// Poll for token using device code.
    async fn poll_for_token(
        &self,
        device_code: &str,
    ) -> Result<DeviceTokenResult, OAuth2Error>;

    /// Poll for token with automatic retry until completion or expiration.
    async fn poll_until_complete(
        &self,
        device_code: &str,
        interval: Duration,
        expires_in: Duration,
    ) -> Result<TokenResponse, OAuth2Error>;
}

/// Device Authorization Flow implementation.
pub struct DeviceAuthorizationFlowImpl<T: HttpTransport> {
    config: OAuth2Config,
    transport: Arc<T>,
}

impl<T: HttpTransport> DeviceAuthorizationFlowImpl<T> {
    /// Create new Device Authorization Flow.
    pub fn new(config: OAuth2Config, transport: Arc<T>) -> Self {
        Self { config, transport }
    }

    fn build_device_code_request_body(&self, params: &DeviceCodeParams) -> String {
        let mut request_params = vec![];

        // Client ID (always required for device flow)
        request_params.push(("client_id", self.config.credentials.client_id.clone()));

        // Scopes
        let scopes = params
            .scopes
            .as_ref()
            .or(Some(&self.config.default_scopes));
        if let Some(s) = scopes {
            if !s.is_empty() {
                request_params.push(("scope", s.join(" ")));
            }
        }

        // Extra parameters
        for (key, value) in &params.extra_params {
            request_params.push((key.as_str(), value.clone()));
        }

        request_params
            .into_iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(&v)))
            .collect::<Vec<_>>()
            .join("&")
    }

    fn build_token_request_body(&self, device_code: &str) -> String {
        let mut params = vec![
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code".to_string()),
            ("device_code", device_code.to_string()),
            ("client_id", self.config.credentials.client_id.clone()),
        ];

        // Add client secret if using post method
        if self.config.credentials.auth_method == ClientAuthMethod::ClientSecretPost {
            if let Some(secret) = &self.config.credentials.client_secret {
                use secrecy::ExposeSecret;
                params.push(("client_secret", secret.expose_secret().to_string()));
            }
        }

        params
            .into_iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(&v)))
            .collect::<Vec<_>>()
            .join("&")
    }

    fn build_request_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert(
            "content-type".to_string(),
            "application/x-www-form-urlencoded".to_string(),
        );
        headers.insert("accept".to_string(), "application/json".to_string());

        // Add Basic auth header if using that method
        if self.config.credentials.auth_method == ClientAuthMethod::ClientSecretBasic {
            if let Some(secret) = &self.config.credentials.client_secret {
                use secrecy::ExposeSecret;
                let credentials = format!(
                    "{}:{}",
                    self.config.credentials.client_id,
                    secret.expose_secret()
                );
                let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
                headers.insert("authorization".to_string(), format!("Basic {}", encoded));
            }
        }

        headers
    }

    fn parse_poll_error(&self, body: &str) -> DeviceTokenResult {
        // Try to parse as OAuth error response
        #[derive(serde::Deserialize)]
        struct ErrorResponse {
            error: String,
            #[serde(default)]
            error_description: Option<String>,
        }

        if let Ok(error_resp) = serde_json::from_str::<ErrorResponse>(body) {
            match error_resp.error.as_str() {
                "authorization_pending" => DeviceTokenResult::Pending,
                "slow_down" => DeviceTokenResult::SlowDown,
                "access_denied" => DeviceTokenResult::AccessDenied {
                    error_description: error_resp.error_description,
                },
                "expired_token" => DeviceTokenResult::Expired,
                _ => DeviceTokenResult::Error(OAuth2Error::DeviceFlow(
                    DeviceFlowError::DeviceCodeError {
                        error: error_resp.error,
                        error_description: error_resp.error_description,
                    },
                )),
            }
        } else {
            DeviceTokenResult::Error(OAuth2Error::Protocol(ProtocolError::InvalidJson {
                message: "Failed to parse error response".to_string(),
            }))
        }
    }
}

#[async_trait]
impl<T: HttpTransport> DeviceAuthorizationFlow for DeviceAuthorizationFlowImpl<T> {
    async fn request_device_code(
        &self,
        params: DeviceCodeParams,
    ) -> Result<DeviceAuthorizationResponse, OAuth2Error> {
        // Get device authorization endpoint
        let device_endpoint = self
            .config
            .provider
            .device_authorization_endpoint
            .as_ref()
            .ok_or_else(|| {
                OAuth2Error::DeviceFlow(DeviceFlowError::DeviceFlowNotSupported)
            })?;

        let body = self.build_device_code_request_body(&params);
        let headers = self.build_request_headers();

        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url: device_endpoint.clone(),
            headers,
            body: Some(body),
            timeout: Some(self.config.timeout),
        };

        let response = self.transport.send(http_request).await?;

        if response.status != 200 {
            return Err(create_error_from_response(response.status, &response.body));
        }

        let device_response: DeviceAuthorizationResponse =
            serde_json::from_str(&response.body).map_err(|e| {
                OAuth2Error::Protocol(ProtocolError::InvalidJson {
                    message: e.to_string(),
                })
            })?;

        Ok(device_response)
    }

    async fn poll_for_token(&self, device_code: &str) -> Result<DeviceTokenResult, OAuth2Error> {
        let body = self.build_token_request_body(device_code);
        let headers = self.build_request_headers();

        let http_request = HttpRequest {
            method: HttpMethod::Post,
            url: self.config.provider.token_endpoint.clone(),
            headers,
            body: Some(body),
            timeout: Some(self.config.timeout),
        };

        let response = self.transport.send(http_request).await?;

        if response.status == 200 {
            let token_response: TokenResponse =
                serde_json::from_str(&response.body).map_err(|e| {
                    OAuth2Error::Protocol(ProtocolError::InvalidJson {
                        message: e.to_string(),
                    })
                })?;
            return Ok(DeviceTokenResult::Success(token_response));
        }

        // Handle polling errors (400 status is expected during polling)
        if response.status == 400 {
            return Ok(self.parse_poll_error(&response.body));
        }

        Err(create_error_from_response(response.status, &response.body))
    }

    async fn poll_until_complete(
        &self,
        device_code: &str,
        interval: Duration,
        expires_in: Duration,
    ) -> Result<TokenResponse, OAuth2Error> {
        let start = std::time::Instant::now();
        let mut current_interval = interval;

        loop {
            // Check for expiration
            if start.elapsed() >= expires_in {
                return Err(OAuth2Error::DeviceFlow(DeviceFlowError::DeviceCodeExpired));
            }

            // Wait before polling
            tokio::time::sleep(current_interval).await;

            match self.poll_for_token(device_code).await? {
                DeviceTokenResult::Success(token) => return Ok(token),
                DeviceTokenResult::Pending => {
                    // Continue polling at current interval
                    continue;
                }
                DeviceTokenResult::SlowDown => {
                    // Increase interval by 5 seconds as per RFC 8628
                    current_interval += Duration::from_secs(5);
                    continue;
                }
                DeviceTokenResult::AccessDenied { error_description } => {
                    return Err(OAuth2Error::DeviceFlow(DeviceFlowError::DeviceCodeError {
                        error: "access_denied".to_string(),
                        error_description,
                    }));
                }
                DeviceTokenResult::Expired => {
                    return Err(OAuth2Error::DeviceFlow(DeviceFlowError::DeviceCodeExpired));
                }
                DeviceTokenResult::Error(e) => return Err(e),
            }
        }
    }
}

/// Mock Device Authorization Flow for testing.
#[derive(Default)]
pub struct MockDeviceAuthorizationFlow {
    device_code_history: std::sync::Mutex<Vec<DeviceCodeParams>>,
    poll_history: std::sync::Mutex<Vec<String>>,
    next_device_response: std::sync::Mutex<Option<DeviceAuthorizationResponse>>,
    next_poll_result: std::sync::Mutex<Option<DeviceTokenResult>>,
    next_error: std::sync::Mutex<Option<OAuth2Error>>,
    poll_count: std::sync::Mutex<u32>,
    polls_until_success: std::sync::Mutex<Option<u32>>,
}

impl MockDeviceAuthorizationFlow {
    /// Create new mock flow.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set next device code response.
    pub fn set_next_device_response(&self, response: DeviceAuthorizationResponse) -> &Self {
        *self.next_device_response.lock().unwrap() = Some(response);
        self
    }

    /// Set next poll result.
    pub fn set_next_poll_result(&self, result: DeviceTokenResult) -> &Self {
        *self.next_poll_result.lock().unwrap() = Some(result);
        self
    }

    /// Set next error.
    pub fn set_next_error(&self, error: OAuth2Error) -> &Self {
        *self.next_error.lock().unwrap() = Some(error);
        self
    }

    /// Set number of polls until success.
    pub fn set_polls_until_success(&self, count: u32) -> &Self {
        *self.polls_until_success.lock().unwrap() = Some(count);
        self
    }

    /// Get device code request history.
    pub fn get_device_code_history(&self) -> Vec<DeviceCodeParams> {
        self.device_code_history.lock().unwrap().clone()
    }

    /// Get poll history.
    pub fn get_poll_history(&self) -> Vec<String> {
        self.poll_history.lock().unwrap().clone()
    }

    /// Get poll count.
    pub fn get_poll_count(&self) -> u32 {
        *self.poll_count.lock().unwrap()
    }
}

#[async_trait]
impl DeviceAuthorizationFlow for MockDeviceAuthorizationFlow {
    async fn request_device_code(
        &self,
        params: DeviceCodeParams,
    ) -> Result<DeviceAuthorizationResponse, OAuth2Error> {
        self.device_code_history.lock().unwrap().push(params);

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        if let Some(response) = self.next_device_response.lock().unwrap().take() {
            return Ok(response);
        }

        Ok(DeviceAuthorizationResponse {
            device_code: "mock-device-code".to_string(),
            user_code: "ABCD-EFGH".to_string(),
            verification_uri: "https://example.com/device".to_string(),
            verification_uri_complete: Some(
                "https://example.com/device?user_code=ABCD-EFGH".to_string(),
            ),
            expires_in: 1800,
            interval: Some(5),
        })
    }

    async fn poll_for_token(&self, device_code: &str) -> Result<DeviceTokenResult, OAuth2Error> {
        self.poll_history
            .lock()
            .unwrap()
            .push(device_code.to_string());

        let mut count = self.poll_count.lock().unwrap();
        *count += 1;

        if let Some(error) = self.next_error.lock().unwrap().take() {
            return Err(error);
        }

        if let Some(result) = self.next_poll_result.lock().unwrap().take() {
            return Ok(result);
        }

        // Check if we should return success after N polls
        if let Some(polls_needed) = *self.polls_until_success.lock().unwrap() {
            if *count >= polls_needed {
                return Ok(DeviceTokenResult::Success(TokenResponse {
                    access_token: "mock-device-token".to_string(),
                    token_type: "Bearer".to_string(),
                    expires_in: Some(3600),
                    refresh_token: Some("mock-refresh-token".to_string()),
                    scope: Some("openid profile".to_string()),
                    id_token: None,
                    extra: HashMap::new(),
                }));
            }
        }

        Ok(DeviceTokenResult::Pending)
    }

    async fn poll_until_complete(
        &self,
        device_code: &str,
        interval: Duration,
        expires_in: Duration,
    ) -> Result<TokenResponse, OAuth2Error> {
        let start = std::time::Instant::now();
        let mut current_interval = interval;

        loop {
            if start.elapsed() >= expires_in {
                return Err(OAuth2Error::DeviceFlow(DeviceFlowError::DeviceCodeExpired));
            }

            tokio::time::sleep(current_interval).await;

            match self.poll_for_token(device_code).await? {
                DeviceTokenResult::Success(token) => return Ok(token),
                DeviceTokenResult::Pending => continue,
                DeviceTokenResult::SlowDown => {
                    current_interval += Duration::from_secs(5);
                    continue;
                }
                DeviceTokenResult::AccessDenied { error_description } => {
                    return Err(OAuth2Error::DeviceFlow(DeviceFlowError::DeviceCodeError {
                        error: "access_denied".to_string(),
                        error_description,
                    }));
                }
                DeviceTokenResult::Expired => {
                    return Err(OAuth2Error::DeviceFlow(DeviceFlowError::DeviceCodeExpired));
                }
                DeviceTokenResult::Error(e) => return Err(e),
            }
        }
    }
}

/// Create mock Device Authorization Flow for testing.
pub fn create_mock_device_authorization_flow() -> MockDeviceAuthorizationFlow {
    MockDeviceAuthorizationFlow::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_device_code_request() {
        let flow = MockDeviceAuthorizationFlow::new();

        let params = DeviceCodeParams {
            scopes: Some(vec!["openid".to_string()]),
            ..Default::default()
        };

        let response = flow.request_device_code(params).await.unwrap();
        assert_eq!(response.device_code, "mock-device-code");
        assert_eq!(response.user_code, "ABCD-EFGH");
        assert!(response.verification_uri_complete.is_some());

        let history = flow.get_device_code_history();
        assert_eq!(history.len(), 1);
    }

    #[tokio::test]
    async fn test_mock_poll_pending() {
        let flow = MockDeviceAuthorizationFlow::new();

        let result = flow.poll_for_token("test-device-code").await.unwrap();
        assert!(matches!(result, DeviceTokenResult::Pending));

        let history = flow.get_poll_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0], "test-device-code");
    }

    #[tokio::test]
    async fn test_mock_poll_until_success() {
        let flow = MockDeviceAuthorizationFlow::new();
        flow.set_polls_until_success(2);

        // First poll should be pending
        let result = flow.poll_for_token("test-code").await.unwrap();
        assert!(matches!(result, DeviceTokenResult::Pending));

        // Second poll should succeed
        let result = flow.poll_for_token("test-code").await.unwrap();
        match result {
            DeviceTokenResult::Success(token) => {
                assert_eq!(token.access_token, "mock-device-token");
            }
            _ => panic!("Expected success"),
        }

        assert_eq!(flow.get_poll_count(), 2);
    }

    #[tokio::test]
    async fn test_mock_custom_device_response() {
        let flow = MockDeviceAuthorizationFlow::new();
        flow.set_next_device_response(DeviceAuthorizationResponse {
            device_code: "custom-code".to_string(),
            user_code: "CUSTOM".to_string(),
            verification_uri: "https://custom.example.com/device".to_string(),
            verification_uri_complete: None,
            expires_in: 900,
            interval: Some(10),
        });

        let params = DeviceCodeParams::default();
        let response = flow.request_device_code(params).await.unwrap();
        assert_eq!(response.device_code, "custom-code");
        assert_eq!(response.expires_in, 900);
    }
}
