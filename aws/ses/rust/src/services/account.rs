//! Account-level operations for SES v2.
//!
//! This module provides methods for querying and updating account-level
//! settings and quotas.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use crate::types::SuppressionOptions;
use super::SesService;

/// Service for account-level operations.
///
/// This service provides methods for:
/// - Getting account information and quotas
/// - Updating account details
/// - Configuring account-level sending attributes
/// - Configuring account-level suppression attributes
pub struct AccountService {
    http_client: Arc<dyn HttpClient>,
}

impl AccountService {
    /// Create a new account service.
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Get information about the account.
    ///
    /// # Returns
    ///
    /// Account details including sending quota, production access status,
    /// and enforcement status.
    pub async fn get_account(&self) -> SesResult<GetAccountResponse> {
        let ses_request = SesRequest::new(HttpMethod::Get, "/v2/email/account");
        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize GetAccount response: {}", e),
            })
    }

    /// Update account details.
    ///
    /// # Arguments
    ///
    /// * `production_access_enabled` - Whether production access is enabled
    /// * `mail_type` - Type of mail being sent
    /// * `website_url` - Website URL
    /// * `contact_language` - Preferred contact language
    /// * `use_case_description` - Description of the use case
    pub async fn put_account_details(
        &self,
        production_access_enabled: Option<bool>,
        mail_type: Option<String>,
        website_url: Option<String>,
        contact_language: Option<String>,
        use_case_description: Option<String>,
    ) -> SesResult<PutAccountDetailsResponse> {
        let request = PutAccountDetailsRequest {
            production_access_enabled,
            mail_type,
            website_url,
            contact_language,
            use_case_description,
            additional_contact_email_addresses: None,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutAccountDetails request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Put, "/v2/email/account/details")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutAccountDetails response: {}", e),
            })
    }

    /// Update account sending attributes.
    ///
    /// # Arguments
    ///
    /// * `sending_enabled` - Whether sending is enabled for the account
    pub async fn put_account_sending_attributes(
        &self,
        sending_enabled: Option<bool>,
    ) -> SesResult<PutAccountSendingAttributesResponse> {
        let request = PutAccountSendingAttributesRequest { sending_enabled };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutAccountSendingAttributes request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Put, "/v2/email/account/sending")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutAccountSendingAttributes response: {}", e),
            })
    }

    /// Update account suppression attributes.
    ///
    /// # Arguments
    ///
    /// * `suppression_options` - Suppression options to set
    pub async fn put_account_suppression_attributes(
        &self,
        suppression_options: SuppressionOptions,
    ) -> SesResult<PutAccountSuppressionAttributesResponse> {
        let body = serde_json::to_vec(&suppression_options)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize suppression options: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Put, "/v2/email/account/suppression")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize response: {}", e),
            })
    }
}

impl SesService for AccountService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutAccountDetailsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    production_access_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mail_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    website_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contact_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    use_case_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    additional_contact_email_addresses: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutAccountSendingAttributesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    sending_enabled: Option<bool>,
}

// Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetAccountResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_ip_auto_warmup_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enforcement_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub production_access_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_quota: Option<SendQuota>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppression_attributes: Option<SuppressionOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendQuota {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_send_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max24_hour_send: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_last24_hours: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutAccountDetailsResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutAccountSendingAttributesResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutAccountSuppressionAttributesResponse {}
