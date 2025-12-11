//! Rerank service implementation.

use super::types::{RerankRequest, RerankResponse};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult, ValidationDetail};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Rerank service trait for testability
#[async_trait]
pub trait RerankService: Send + Sync {
    /// Rerank documents against a query
    async fn rerank(&self, request: RerankRequest) -> CohereResult<RerankResponse>;
}

/// Implementation of the Rerank service
pub struct RerankServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl RerankServiceImpl {
    /// Create a new Rerank service
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
    fn rerank_url(&self) -> CohereResult<String> {
        self.base_url
            .join("/v1/rerank")
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }

    /// Validate a rerank request
    fn validate(&self, request: &RerankRequest) -> CohereResult<()> {
        let mut errors = Vec::new();

        if request.query.is_empty() {
            errors.push(ValidationDetail::new("query", "Query cannot be empty"));
        }

        if request.documents.is_empty() {
            errors.push(ValidationDetail::new(
                "documents",
                "Documents cannot be empty",
            ));
        }

        if request.documents.len() > 10000 {
            errors.push(ValidationDetail::with_value(
                "documents",
                "Cannot rerank more than 10000 documents",
                request.documents.len().to_string(),
            ));
        }

        if let Some(top_n) = request.top_n {
            if top_n == 0 {
                errors.push(ValidationDetail::with_value(
                    "top_n",
                    "top_n must be greater than 0",
                    top_n.to_string(),
                ));
            }
            if top_n as usize > request.documents.len() {
                errors.push(ValidationDetail::with_value(
                    "top_n",
                    "top_n cannot exceed the number of documents",
                    top_n.to_string(),
                ));
            }
        }

        if let Some(max_chunks) = request.max_chunks_per_doc {
            if max_chunks == 0 {
                errors.push(ValidationDetail::with_value(
                    "max_chunks_per_doc",
                    "max_chunks_per_doc must be greater than 0",
                    max_chunks.to_string(),
                ));
            }
        }

        for (i, doc) in request.documents.iter().enumerate() {
            if doc.text_content().is_empty() {
                errors.push(ValidationDetail::new(
                    format!("documents[{}]", i),
                    "Document text cannot be empty",
                ));
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(CohereError::Validation {
                message: format!(
                    "Rerank request validation failed: {} error(s)",
                    errors.len()
                ),
                details: errors,
            })
        }
    }
}

#[async_trait]
impl RerankService for RerankServiceImpl {
    async fn rerank(&self, request: RerankRequest) -> CohereResult<RerankResponse> {
        // Validate request
        self.validate(&request)?;

        // Build URL
        let url = self.rerank_url()?;

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
        let rerank_response: RerankResponse = serde_json::from_slice(&response.body)?;

        Ok(rerank_response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::rerank::types::RerankDocument;

    #[test]
    fn test_validate_valid_request() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            RerankServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let docs = vec![
            RerankDocument::text("doc1"),
            RerankDocument::text("doc2"),
        ];
        let request = RerankRequest::new("query", docs);
        assert!(service.validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_query() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            RerankServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let docs = vec![RerankDocument::text("doc1")];
        let request = RerankRequest::new("", docs);
        assert!(service.validate(&request).is_err());
    }

    #[test]
    fn test_validate_empty_documents() {
        let transport = Arc::new(MockTransport);
        let auth = Arc::new(MockAuth);
        let service =
            RerankServiceImpl::new(transport, auth, Url::parse("https://api.cohere.ai").unwrap());

        let request = RerankRequest::new("query", vec![]);
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
