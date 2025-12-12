//! Email identity operations for SES v2.
//!
//! This module provides methods for managing email identities (email addresses and domains)
//! for sending emails through SES.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use crate::types::{DkimAttributes, MailFromAttributes, IdentityInfo, Tag, IdentityType};
use super::SesService;

/// Service for email identity operations.
///
/// This service provides methods for:
/// - Creating and deleting email identities
/// - Getting identity information
/// - Listing all identities
/// - Configuring DKIM settings
/// - Configuring MAIL FROM settings
/// - Configuring feedback attributes
pub struct IdentityService {
    http_client: Arc<dyn HttpClient>,
}

impl IdentityService {
    /// Create a new identity service.
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Create a new email identity (email address or domain).
    ///
    /// # Arguments
    ///
    /// * `email_identity` - The email address or domain to verify
    /// * `tags` - Optional tags to associate with the identity
    /// * `configuration_set_name` - Optional configuration set
    ///
    /// # Returns
    ///
    /// Identity type and verification information.
    pub async fn create_email_identity(
        &self,
        email_identity: &str,
        tags: Option<Vec<Tag>>,
        configuration_set_name: Option<String>,
    ) -> SesResult<CreateEmailIdentityResponse> {
        let request = CreateEmailIdentityRequest {
            email_identity: email_identity.to_string(),
            tags,
            dkim_signing_attributes: None,
            configuration_set_name,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize CreateEmailIdentity request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Post, "/v2/email/identities")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize CreateEmailIdentity response: {}", e),
            })
    }

    /// Delete an email identity.
    ///
    /// # Arguments
    ///
    /// * `email_identity` - The email address or domain to delete
    pub async fn delete_email_identity(
        &self,
        email_identity: &str,
    ) -> SesResult<DeleteEmailIdentityResponse> {
        let path = format!("/v2/email/identities/{}", email_identity);
        let ses_request = SesRequest::new(HttpMethod::Delete, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize DeleteEmailIdentity response: {}", e),
            })
    }

    /// Get information about an email identity.
    ///
    /// # Arguments
    ///
    /// * `email_identity` - The email address or domain to query
    ///
    /// # Returns
    ///
    /// Detailed information including verification status, DKIM settings, etc.
    pub async fn get_email_identity(
        &self,
        email_identity: &str,
    ) -> SesResult<GetEmailIdentityResponse> {
        let path = format!("/v2/email/identities/{}", email_identity);
        let ses_request = SesRequest::new(HttpMethod::Get, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize GetEmailIdentity response: {}", e),
            })
    }

    /// List all email identities for the account.
    ///
    /// # Arguments
    ///
    /// * `next_token` - Token for pagination
    /// * `page_size` - Maximum number of results (1-100)
    ///
    /// # Returns
    ///
    /// List of identity information and optional next token for pagination.
    pub async fn list_email_identities(
        &self,
        next_token: Option<String>,
        page_size: Option<i32>,
    ) -> SesResult<ListEmailIdentitiesResponse> {
        let mut path = "/v2/email/identities".to_string();
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
                message: format!("Failed to deserialize ListEmailIdentities response: {}", e),
            })
    }

    /// Configure DKIM signing for an email identity.
    ///
    /// # Arguments
    ///
    /// * `email_identity` - The email address or domain
    /// * `signing_enabled` - Whether to enable DKIM signing
    pub async fn put_email_identity_dkim_attributes(
        &self,
        email_identity: &str,
        signing_enabled: Option<bool>,
    ) -> SesResult<PutEmailIdentityDkimAttributesResponse> {
        let request = PutEmailIdentityDkimAttributesRequest { signing_enabled };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutEmailIdentityDkimAttributes request: {}", e),
            })?;

        let path = format!("/v2/email/identities/{}/dkim", email_identity);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutEmailIdentityDkimAttributes response: {}", e),
            })
    }

    /// Configure MAIL FROM domain for an email identity.
    ///
    /// # Arguments
    ///
    /// * `email_identity` - The email address or domain
    /// * `mail_from_attributes` - MAIL FROM configuration
    pub async fn put_email_identity_mail_from_attributes(
        &self,
        email_identity: &str,
        mail_from_attributes: Option<MailFromAttributes>,
    ) -> SesResult<PutEmailIdentityMailFromAttributesResponse> {
        let request = PutEmailIdentityMailFromAttributesRequest {
            mail_from_attributes,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutEmailIdentityMailFromAttributes request: {}", e),
            })?;

        let path = format!("/v2/email/identities/{}/mail-from", email_identity);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutEmailIdentityMailFromAttributes response: {}", e),
            })
    }

    /// Configure feedback forwarding for an email identity.
    ///
    /// # Arguments
    ///
    /// * `email_identity` - The email address or domain
    /// * `email_forwarding_enabled` - Whether to forward bounces and complaints
    pub async fn put_email_identity_feedback_attributes(
        &self,
        email_identity: &str,
        email_forwarding_enabled: Option<bool>,
    ) -> SesResult<PutEmailIdentityFeedbackAttributesResponse> {
        let request = PutEmailIdentityFeedbackAttributesRequest {
            email_forwarding_enabled,
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutEmailIdentityFeedbackAttributes request: {}", e),
            })?;

        let path = format!("/v2/email/identities/{}/feedback", email_identity);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutEmailIdentityFeedbackAttributes response: {}", e),
            })
    }
}

impl SesService for IdentityService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateEmailIdentityRequest {
    email_identity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<Tag>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dkim_signing_attributes: Option<DkimAttributes>,
    #[serde(skip_serializing_if = "Option::is_none")]
    configuration_set_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutEmailIdentityDkimAttributesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    signing_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutEmailIdentityMailFromAttributesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    mail_from_attributes: Option<MailFromAttributes>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutEmailIdentityFeedbackAttributesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    email_forwarding_enabled: Option<bool>,
}

// Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailIdentityResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_for_sending_status: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dkim_attributes: Option<DkimAttributes>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteEmailIdentityResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetEmailIdentityResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_status: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_for_sending_status: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dkim_attributes: Option<DkimAttributes>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_from_attributes: Option<MailFromAttributes>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policies: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListEmailIdentitiesResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_identities: Option<Vec<IdentityInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutEmailIdentityDkimAttributesResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutEmailIdentityMailFromAttributesResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutEmailIdentityFeedbackAttributesResponse {}
