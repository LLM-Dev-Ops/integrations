//! Configuration set operations for SES v2.
//!
//! This module provides methods for managing configuration sets, which allow
//! you to customize email sending behavior and publish events.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use crate::types::{
    TrackingOptions, DeliveryOptions, ReputationOptions, SendingOptions,
    SuppressionOptions, Tag,
};
use super::SesService;

/// Service for configuration set operations.
///
/// This service provides methods for:
/// - Creating and deleting configuration sets
/// - Getting configuration set details
/// - Listing all configuration sets
/// - Updating delivery, reputation, sending, and tracking options
pub struct ConfigurationSetService {
    http_client: Arc<dyn HttpClient>,
}

impl ConfigurationSetService {
    /// Create a new configuration set service.
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Create a new configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Unique name for the configuration set
    /// * `tags` - Optional tags
    pub async fn create_configuration_set(
        &self,
        configuration_set_name: &str,
        tags: Option<Vec<Tag>>,
    ) -> SesResult<CreateConfigurationSetResponse> {
        let request = CreateConfigurationSetRequest {
            configuration_set_name: configuration_set_name.to_string(),
            tracking_options: None,
            delivery_options: None,
            reputation_options: None,
            sending_options: None,
            tags,
            suppression_options: None,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize CreateConfigurationSet request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Post, "/v2/email/configuration-sets")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize CreateConfigurationSet response: {}", e),
            })
    }

    /// Delete a configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Name of the configuration set to delete
    pub async fn delete_configuration_set(
        &self,
        configuration_set_name: &str,
    ) -> SesResult<DeleteConfigurationSetResponse> {
        let path = format!("/v2/email/configuration-sets/{}", configuration_set_name);
        let ses_request = SesRequest::new(HttpMethod::Delete, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize DeleteConfigurationSet response: {}", e),
            })
    }

    /// Get information about a configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Name of the configuration set
    pub async fn get_configuration_set(
        &self,
        configuration_set_name: &str,
    ) -> SesResult<GetConfigurationSetResponse> {
        let path = format!("/v2/email/configuration-sets/{}", configuration_set_name);
        let ses_request = SesRequest::new(HttpMethod::Get, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize GetConfigurationSet response: {}", e),
            })
    }

    /// List all configuration sets.
    ///
    /// # Arguments
    ///
    /// * `next_token` - Token for pagination
    /// * `page_size` - Maximum number of results (1-100)
    pub async fn list_configuration_sets(
        &self,
        next_token: Option<String>,
        page_size: Option<i32>,
    ) -> SesResult<ListConfigurationSetsResponse> {
        let mut path = "/v2/email/configuration-sets".to_string();
        let mut query_params = Vec::new();

        if let Some(token) = next_token {
            query_params.push(format!("NextToken={}", token));
        }
        if let Some(size) = page_size {
            query_params.push(format!("PageSize={}", size));
        }

        if !query_params.is_empty() {
            path.push_str("?");
            path.push_str(&query_params.join("&"));
        }

        let ses_request = SesRequest::new(HttpMethod::Get, &path);
        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize ListConfigurationSets response: {}", e),
            })
    }

    /// Update delivery options for a configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Name of the configuration set
    /// * `delivery_options` - Delivery options to set
    pub async fn put_configuration_set_delivery_options(
        &self,
        configuration_set_name: &str,
        delivery_options: DeliveryOptions,
    ) -> SesResult<PutConfigurationSetDeliveryOptionsResponse> {
        let body = serde_json::to_vec(&delivery_options)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize delivery options: {}", e),
            })?;

        let path = format!("/v2/email/configuration-sets/{}/delivery-options", configuration_set_name);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize response: {}", e),
            })
    }

    /// Update reputation options for a configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Name of the configuration set
    /// * `reputation_options` - Reputation options to set
    pub async fn put_configuration_set_reputation_options(
        &self,
        configuration_set_name: &str,
        reputation_options: ReputationOptions,
    ) -> SesResult<PutConfigurationSetReputationOptionsResponse> {
        let body = serde_json::to_vec(&reputation_options)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize reputation options: {}", e),
            })?;

        let path = format!("/v2/email/configuration-sets/{}/reputation-options", configuration_set_name);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize response: {}", e),
            })
    }

    /// Update sending options for a configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Name of the configuration set
    /// * `sending_options` - Sending options to set
    pub async fn put_configuration_set_sending_options(
        &self,
        configuration_set_name: &str,
        sending_options: SendingOptions,
    ) -> SesResult<PutConfigurationSetSendingOptionsResponse> {
        let body = serde_json::to_vec(&sending_options)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize sending options: {}", e),
            })?;

        let path = format!("/v2/email/configuration-sets/{}/sending", configuration_set_name);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize response: {}", e),
            })
    }

    /// Update tracking options for a configuration set.
    ///
    /// # Arguments
    ///
    /// * `configuration_set_name` - Name of the configuration set
    /// * `tracking_options` - Tracking options to set
    pub async fn put_configuration_set_tracking_options(
        &self,
        configuration_set_name: &str,
        tracking_options: TrackingOptions,
    ) -> SesResult<PutConfigurationSetTrackingOptionsResponse> {
        let body = serde_json::to_vec(&tracking_options)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize tracking options: {}", e),
            })?;

        let path = format!("/v2/email/configuration-sets/{}/tracking-options", configuration_set_name);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize response: {}", e),
            })
    }
}

impl SesService for ConfigurationSetService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateConfigurationSetRequest {
    configuration_set_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tracking_options: Option<TrackingOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delivery_options: Option<DeliveryOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reputation_options: Option<ReputationOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sending_options: Option<SendingOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<Tag>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    suppression_options: Option<SuppressionOptions>,
}

// Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateConfigurationSetResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteConfigurationSetResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetConfigurationSetResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking_options: Option<TrackingOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_options: Option<DeliveryOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reputation_options: Option<ReputationOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_options: Option<SendingOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppression_options: Option<SuppressionOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListConfigurationSetsResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_sets: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutConfigurationSetDeliveryOptionsResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutConfigurationSetReputationOptionsResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutConfigurationSetSendingOptionsResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutConfigurationSetTrackingOptionsResponse {}
