//! Suppression list operations for SES v2.
//!
//! This module provides methods for managing the suppression list, which contains
//! email addresses that have bounced or generated complaints.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use crate::types::{SuppressedDestination, SuppressionReason, SuppressionListReason};
use super::SesService;

/// Service for suppression list operations.
///
/// This service provides methods for:
/// - Adding email addresses to the suppression list
/// - Removing email addresses from the suppression list
/// - Getting suppression information for an email address
/// - Listing all suppressed destinations
pub struct SuppressionService {
    http_client: Arc<dyn HttpClient>,
}

impl SuppressionService {
    /// Create a new suppression service.
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Add an email address to the suppression list.
    ///
    /// # Arguments
    ///
    /// * `email_address` - The email address to suppress
    /// * `reason` - The reason for suppression (Bounce or Complaint)
    pub async fn put_suppressed_destination(
        &self,
        email_address: &str,
        reason: SuppressionListReason,
    ) -> SesResult<PutSuppressedDestinationResponse> {
        let request = PutSuppressedDestinationRequest {
            email_address: email_address.to_string(),
            reason,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutSuppressedDestination request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Put, "/v2/email/suppression/addresses")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutSuppressedDestination response: {}", e),
            })
    }

    /// Get information about a suppressed email address.
    ///
    /// # Arguments
    ///
    /// * `email_address` - The email address to query
    ///
    /// # Returns
    ///
    /// Suppression details including reason and timestamp.
    pub async fn get_suppressed_destination(
        &self,
        email_address: &str,
    ) -> SesResult<GetSuppressedDestinationResponse> {
        let path = format!("/v2/email/suppression/addresses/{}", email_address);
        let ses_request = SesRequest::new(HttpMethod::Get, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize GetSuppressedDestination response: {}", e),
            })
    }

    /// Remove an email address from the suppression list.
    ///
    /// # Arguments
    ///
    /// * `email_address` - The email address to remove
    pub async fn delete_suppressed_destination(
        &self,
        email_address: &str,
    ) -> SesResult<DeleteSuppressedDestinationResponse> {
        let path = format!("/v2/email/suppression/addresses/{}", email_address);
        let ses_request = SesRequest::new(HttpMethod::Delete, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize DeleteSuppressedDestination response: {}", e),
            })
    }

    /// List all suppressed email addresses.
    ///
    /// # Arguments
    ///
    /// * `next_token` - Token for pagination
    /// * `page_size` - Maximum number of results (1-100)
    /// * `reasons` - Optional filter by suppression reasons
    ///
    /// # Returns
    ///
    /// List of suppressed destinations and optional next token for pagination.
    pub async fn list_suppressed_destinations(
        &self,
        next_token: Option<String>,
        page_size: Option<i32>,
        reasons: Option<Vec<SuppressionListReason>>,
    ) -> SesResult<ListSuppressedDestinationsResponse> {
        let mut path = "/v2/email/suppression/addresses".to_string();
        let mut query_params = Vec::new();

        if let Some(token) = next_token {
            query_params.push(format!("NextToken={}", token));
        }
        if let Some(size) = page_size {
            query_params.push(format!("PageSize={}", size));
        }
        if let Some(r) = reasons {
            let reasons_str = r.iter()
                .map(|reason| reason.as_str())
                .collect::<Vec<_>>()
                .join(",");
            query_params.push(format!("Reasons={}", reasons_str));
        }

        if !query_params.is_empty() {
            path.push_str("?");
            path.push_str(&query_params.join("&"));
        }

        let ses_request = SesRequest::new(HttpMethod::Get, &path);
        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize ListSuppressedDestinations response: {}", e),
            })
    }
}

impl SesService for SuppressionService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutSuppressedDestinationRequest {
    email_address: String,
    reason: SuppressionListReason,
}

// Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutSuppressedDestinationResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetSuppressedDestinationResponse {
    pub suppressed_destination: SuppressedDestination,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteSuppressedDestinationResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListSuppressedDestinationsResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppressed_destination_summaries: Option<Vec<SuppressedDestination>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}
