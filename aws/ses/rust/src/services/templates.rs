//! Email template operations for SES v2.
//!
//! This module provides methods for managing email templates, including
//! creating, updating, deleting, listing, and testing template rendering.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use super::SesService;

/// Service for email template operations.
///
/// This service provides methods for:
/// - Creating email templates
/// - Updating existing templates
/// - Deleting templates
/// - Listing all templates
/// - Getting template details
/// - Testing template rendering with sample data
pub struct TemplateService {
    http_client: Arc<dyn HttpClient>,
}

impl TemplateService {
    /// Create a new template service.
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Create a new email template.
    ///
    /// # Arguments
    ///
    /// * `template_name` - Unique name for the template
    /// * `subject` - Email subject (may contain {{variables}})
    /// * `html` - Optional HTML body
    /// * `text` - Optional text body
    ///
    /// # Errors
    ///
    /// Returns an error if a template with the same name already exists.
    pub async fn create_email_template(
        &self,
        template_name: &str,
        subject: Option<String>,
        html: Option<String>,
        text: Option<String>,
    ) -> SesResult<CreateEmailTemplateResponse> {
        let request = CreateEmailTemplateRequest {
            template_name: template_name.to_string(),
            template_content: TemplateContent { subject, html, text },
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize CreateEmailTemplate request: {}", e),
            })?;

        let ses_request = SesRequest::new(HttpMethod::Post, "/v2/email/templates")
            .with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize CreateEmailTemplate response: {}", e),
            })
    }

    /// Delete an email template.
    ///
    /// # Arguments
    ///
    /// * `template_name` - Name of the template to delete
    pub async fn delete_email_template(
        &self,
        template_name: &str,
    ) -> SesResult<DeleteEmailTemplateResponse> {
        let path = format!("/v2/email/templates/{}", template_name);
        let ses_request = SesRequest::new(HttpMethod::Delete, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize DeleteEmailTemplate response: {}", e),
            })
    }

    /// Get an email template.
    ///
    /// # Arguments
    ///
    /// * `template_name` - Name of the template to retrieve
    ///
    /// # Returns
    ///
    /// The template content including subject, HTML, and text parts.
    pub async fn get_email_template(
        &self,
        template_name: &str,
    ) -> SesResult<GetEmailTemplateResponse> {
        let path = format!("/v2/email/templates/{}", template_name);
        let ses_request = SesRequest::new(HttpMethod::Get, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize GetEmailTemplate response: {}", e),
            })
    }

    /// List all email templates.
    ///
    /// # Arguments
    ///
    /// * `next_token` - Token for pagination (from previous response)
    /// * `page_size` - Maximum number of results to return (1-100)
    ///
    /// # Returns
    ///
    /// A list of template metadata and an optional next token for pagination.
    pub async fn list_email_templates(
        &self,
        next_token: Option<String>,
        page_size: Option<i32>,
    ) -> SesResult<ListEmailTemplatesResponse> {
        let mut path = "/v2/email/templates".to_string();
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
                message: format!("Failed to deserialize ListEmailTemplates response: {}", e),
            })
    }

    /// Update an existing email template.
    ///
    /// # Arguments
    ///
    /// * `template_name` - Name of the template to update
    /// * `subject` - Updated subject line
    /// * `html` - Updated HTML body
    /// * `text` - Updated text body
    pub async fn update_email_template(
        &self,
        template_name: &str,
        subject: Option<String>,
        html: Option<String>,
        text: Option<String>,
    ) -> SesResult<UpdateEmailTemplateResponse> {
        let request = UpdateEmailTemplateRequest {
            template_content: TemplateContent { subject, html, text },
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize UpdateEmailTemplate request: {}", e),
            })?;

        let path = format!("/v2/email/templates/{}", template_name);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize UpdateEmailTemplate response: {}", e),
            })
    }

    /// Test rendering an email template with sample data.
    ///
    /// # Arguments
    ///
    /// * `template_name` - Name of the template to test
    /// * `template_data` - JSON string with template variables
    ///
    /// # Returns
    ///
    /// The rendered subject, HTML, and text with variables replaced.
    pub async fn test_render_email_template(
        &self,
        template_name: &str,
        template_data: &str,
    ) -> SesResult<TestRenderEmailTemplateResponse> {
        let request = TestRenderEmailTemplateRequest {
            template_data: template_data.to_string(),
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize TestRenderEmailTemplate request: {}", e),
            })?;

        let path = format!("/v2/email/templates/{}/render", template_name);
        let ses_request = SesRequest::new(HttpMethod::Post, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize TestRenderEmailTemplate response: {}", e),
            })
    }
}

impl SesService for TemplateService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateEmailTemplateRequest {
    template_name: String,
    template_content: TemplateContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TemplateContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct UpdateEmailTemplateRequest {
    template_content: TemplateContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TestRenderEmailTemplateRequest {
    template_data: String,
}

// Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailTemplateResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteEmailTemplateResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetEmailTemplateResponse {
    pub template_name: String,
    pub template_content: TemplateContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListEmailTemplatesResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub templates_metadata: Option<Vec<EmailTemplateMetadata>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmailTemplateMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct UpdateEmailTemplateResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TestRenderEmailTemplateResponse {
    pub rendered_subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendered_html_part: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendered_text_part: Option<String>,
}
