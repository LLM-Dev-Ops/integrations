//! Classify service implementation.

use super::types::{ClassifyRequest, ClassifyResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult, ValidationDetail};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Classify service trait for testability
#[async_trait]
pub trait ClassifyService: Send + Sync {
    /// Classify texts
    async fn classify(&self, request: ClassifyRequest) -> CohereResult<ClassifyResponse>;
}

/// Implementation of the Classify service
pub struct ClassifyServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl ClassifyServiceImpl {
    /// Create a new Classify service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        base_url: Url,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            base_url,
        }
    }

    /// Build headers for a request
    fn build_headers(&self) -> HeaderMap {
        self.auth_manager.get_headers()
    }

    /// Build endpoint URL
    fn classify_url(&self) -> CohereResult<String> {
        self.base_url
            .join("/v1/classify")
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }

    /// Validate a classify request
    fn validate(&self, request: &ClassifyRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.inputs.is_empty() {
            errors.push(ValidationDetail::new("inputs", "Inputs cannot be empty"));
        }

        if request.inputs.len() > 96 {
            errors.push(ValidationDetail::with_value(
                "inputs",
                "Cannot classify more than 96 inputs at once",
                request.inputs.len().to_string(),
            ));
        }

        // Need either examples or preset
        if request.examples.is_none() && request.preset.is_none() {
            errors.push(ValidationDetail::new(
                "examples/preset",
                "Either examples or preset must be provided",
            ));
        }

        // Validate examples if provided
        if let Some(ref examples) = request.examples {
            if examples.len() < 2 {
                errors.push(ValidationDetail::with_value(
                    "examples",
                    "At least 2 examples are required",
                    examples.len().to_string(),
                ));
            }

            // Check for at least 2 unique labels
            let unique_labels: std::collections::HashSet<_> =
                examples.iter().map(|e| &e.label).collect();
            if unique_labels.len() < 2 {
                errors.push(ValidationDetail::new(
                    "examples",
                    "Examples must have at least 2 unique labels",
                ));
            }

            for (i, example) in examples.iter().enumerate() {
                if example.text.is_empty() {
                    errors.push(ValidationDetail::new(
                        format!("examples[{}].text", i),
                        "Example text cannot be empty",
                    ));
                }
                if example.label.is_empty() {
                    errors.push(ValidationDetail::new(
                        format!("examples[{}].label", i),
                        "Example label cannot be empty",
                    ));
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!(
                    "Classify request validation failed: {} error(s)",
                    errors.len()
                ),
                details: errors,
            })
        }
    }
}

#[async_trait]
impl ClassifyService for ClassifyServiceImpl {
    async fn classify(&self, request: ClassifyRequest) -> CohereResult<ClassifyResponse> {
        // Validate request
        self.validate(&request)?;

        // Build URL
        let url = self.classify_url()?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self
            .transport
            .execute(Method::POST, url, headers, Some(body))
            .await?;

        // Parse response
        let classify_response: ClassifyResponse = serde_json::from_slice(&response.body)?;

        Ok(classify_response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::classify::types::ClassifyExample;

    fn create_service() -> ClassifyServiceImpl {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        ClassifyServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap())
    }

    #[test]
    fn test_validate_valid_request() {
        let service = create_service();
        let request = ClassifyRequest::builder(vec!["text1".to_string()])
            .add_example("positive example", "positive")
            .add_example("negative example", "negative")
            .build();

        assert!(service.validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_inputs() {
        let service = create_service();
        let request = ClassifyRequest::builder(vec![])
            .add_example("example", "label")
            .build();

        assert!(service.validate(&request).is_err());
    }

    #[test]
    fn test_validate_no_examples_or_preset() {
        let service = create_service();
        let request = ClassifyRequest::new(vec!["text".to_string()]);
        assert!(service.validate(&request).is_err());
    }

    // Mock implementations
    struct MockTransport;

    #[async_trait]
    impl HttpTransport for MockTransport {
        async fn send(
            &self,
            _method: Method,
            _url: Url,
            _headers: HeaderMap,
            _body: Option<bytes::Bytes>,
        ) -> CohereResult<crate::transport::TransportResponse> {
            unimplemented!()
        }

        async fn send_streaming(
            &self,
            _method: Method,
            _url: Url,
            _headers: HeaderMap,
            _body: Option<bytes::Bytes>,
        ) -> CohereResult<
            std::pin::Pin<Box<dyn futures::Stream<Item = CohereResult<bytes::Bytes>> + Send>>,
        > {
            unimplemented!()
        }
    }

    struct MockAuth;

    #[async_trait]
    impl AuthManager for MockAuth {
        fn get_headers(&self) -> HeaderMap {
            HeaderMap::new()
        }

        fn add_auth_headers(&self, _headers: &mut HeaderMap) {}

        fn validate_api_key(&self) -> Result<(), String> {
            Ok(())
        }
    }
}
