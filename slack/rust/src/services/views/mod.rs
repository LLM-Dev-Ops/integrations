//! Views service for Slack API.
//!
//! Provides methods for managing modals and home tabs using Block Kit views.

use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tracing::instrument;

/// Request to open a modal view
#[derive(Debug, Clone, Serialize)]
pub struct OpenViewRequest {
    /// Trigger ID from interaction
    pub trigger_id: String,
    /// View definition
    pub view: ViewDefinition,
}

impl OpenViewRequest {
    /// Create a new request
    pub fn new(trigger_id: impl Into<String>, view: ViewDefinition) -> Self {
        Self {
            trigger_id: trigger_id.into(),
            view,
        }
    }
}

/// Request to update a view
#[derive(Debug, Clone, Serialize)]
pub struct UpdateViewRequest {
    /// View definition
    pub view: ViewDefinition,
    /// External ID of the view
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    /// Hash for optimistic locking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    /// View ID to update
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_id: Option<String>,
}

impl UpdateViewRequest {
    /// Update by view ID
    pub fn by_view_id(view_id: impl Into<String>, view: ViewDefinition) -> Self {
        Self {
            view,
            external_id: None,
            hash: None,
            view_id: Some(view_id.into()),
        }
    }

    /// Update by external ID
    pub fn by_external_id(external_id: impl Into<String>, view: ViewDefinition) -> Self {
        Self {
            view,
            external_id: Some(external_id.into()),
            hash: None,
            view_id: None,
        }
    }

    /// Set hash for optimistic locking
    pub fn hash(mut self, hash: impl Into<String>) -> Self {
        self.hash = Some(hash.into());
        self
    }
}

/// Request to push a view onto the stack
#[derive(Debug, Clone, Serialize)]
pub struct PushViewRequest {
    /// Trigger ID from interaction
    pub trigger_id: String,
    /// View definition
    pub view: ViewDefinition,
}

impl PushViewRequest {
    /// Create a new request
    pub fn new(trigger_id: impl Into<String>, view: ViewDefinition) -> Self {
        Self {
            trigger_id: trigger_id.into(),
            view,
        }
    }
}

/// Request to publish a home tab view
#[derive(Debug, Clone, Serialize)]
pub struct PublishViewRequest {
    /// User ID to publish to
    pub user_id: String,
    /// View definition (must be home type)
    pub view: ViewDefinition,
    /// Hash for optimistic locking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

impl PublishViewRequest {
    /// Create a new request
    pub fn new(user_id: impl Into<String>, view: ViewDefinition) -> Self {
        Self {
            user_id: user_id.into(),
            view,
            hash: None,
        }
    }

    /// Set hash for optimistic locking
    pub fn hash(mut self, hash: impl Into<String>) -> Self {
        self.hash = Some(hash.into());
        self
    }
}

/// View definition for modals and home tabs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewDefinition {
    /// View type (modal, home)
    #[serde(rename = "type")]
    pub view_type: ViewType,
    /// Title (modal only, max 24 chars)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<PlainTextElement>,
    /// Submit button text (modal only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submit: Option<PlainTextElement>,
    /// Close button text (modal only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub close: Option<PlainTextElement>,
    /// Blocks in the view (max 100)
    pub blocks: Vec<Value>,
    /// Private metadata (max 3000 chars)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_metadata: Option<String>,
    /// Callback ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callback_id: Option<String>,
    /// Clear on close
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clear_on_close: Option<bool>,
    /// Notify on close
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notify_on_close: Option<bool>,
    /// External ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    /// Submit disabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submit_disabled: Option<bool>,
}

impl ViewDefinition {
    /// Create a new modal view
    pub fn modal(title: impl Into<String>) -> Self {
        Self {
            view_type: ViewType::Modal,
            title: Some(PlainTextElement::new(title)),
            submit: None,
            close: None,
            blocks: Vec::new(),
            private_metadata: None,
            callback_id: None,
            clear_on_close: None,
            notify_on_close: None,
            external_id: None,
            submit_disabled: None,
        }
    }

    /// Create a new home tab view
    pub fn home() -> Self {
        Self {
            view_type: ViewType::Home,
            title: None,
            submit: None,
            close: None,
            blocks: Vec::new(),
            private_metadata: None,
            callback_id: None,
            clear_on_close: None,
            notify_on_close: None,
            external_id: None,
            submit_disabled: None,
        }
    }

    /// Set blocks
    pub fn blocks(mut self, blocks: Vec<Value>) -> Self {
        self.blocks = blocks;
        self
    }

    /// Add a block
    pub fn block(mut self, block: Value) -> Self {
        self.blocks.push(block);
        self
    }

    /// Set submit button
    pub fn submit(mut self, text: impl Into<String>) -> Self {
        self.submit = Some(PlainTextElement::new(text));
        self
    }

    /// Set close button
    pub fn close(mut self, text: impl Into<String>) -> Self {
        self.close = Some(PlainTextElement::new(text));
        self
    }

    /// Set private metadata
    pub fn private_metadata(mut self, metadata: impl Into<String>) -> Self {
        self.private_metadata = Some(metadata.into());
        self
    }

    /// Set callback ID
    pub fn callback_id(mut self, id: impl Into<String>) -> Self {
        self.callback_id = Some(id.into());
        self
    }

    /// Set external ID
    pub fn external_id(mut self, id: impl Into<String>) -> Self {
        self.external_id = Some(id.into());
        self
    }

    /// Notify on close
    pub fn notify_on_close(mut self, notify: bool) -> Self {
        self.notify_on_close = Some(notify);
        self
    }

    /// Clear on close
    pub fn clear_on_close(mut self, clear: bool) -> Self {
        self.clear_on_close = Some(clear);
        self
    }

    /// Disable submit button
    pub fn submit_disabled(mut self, disabled: bool) -> Self {
        self.submit_disabled = Some(disabled);
        self
    }
}

/// View type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewType {
    /// Modal view
    Modal,
    /// Home tab view
    Home,
}

/// Plain text element for view components
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlainTextElement {
    /// Element type (always "plain_text")
    #[serde(rename = "type")]
    pub element_type: String,
    /// Text content
    pub text: String,
    /// Whether to render emoji
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<bool>,
}

impl PlainTextElement {
    /// Create a new plain text element
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            element_type: "plain_text".to_string(),
            text: text.into(),
            emoji: Some(true),
        }
    }
}

/// Response from views.open, views.update, views.push
#[derive(Debug, Clone, Deserialize)]
pub struct ViewResponse {
    /// Success indicator
    pub ok: bool,
    /// View information
    #[serde(default)]
    pub view: Option<ViewInfo>,
}

/// View information in response
#[derive(Debug, Clone, Deserialize)]
pub struct ViewInfo {
    /// View ID
    pub id: String,
    /// Team ID
    pub team_id: String,
    /// View type
    #[serde(rename = "type")]
    pub view_type: String,
    /// Block kit blocks
    #[serde(default)]
    pub blocks: Vec<Value>,
    /// Private metadata
    #[serde(default)]
    pub private_metadata: Option<String>,
    /// Callback ID
    #[serde(default)]
    pub callback_id: Option<String>,
    /// State values
    #[serde(default)]
    pub state: Option<ViewState>,
    /// Hash for updates
    #[serde(default)]
    pub hash: Option<String>,
    /// Clear on close flag
    #[serde(default)]
    pub clear_on_close: Option<bool>,
    /// Notify on close flag
    #[serde(default)]
    pub notify_on_close: Option<bool>,
    /// Root view ID
    #[serde(default)]
    pub root_view_id: Option<String>,
    /// App ID
    #[serde(default)]
    pub app_id: Option<String>,
    /// External ID
    #[serde(default)]
    pub external_id: Option<String>,
    /// App installed team ID
    #[serde(default)]
    pub app_installed_team_id: Option<String>,
    /// Bot ID
    #[serde(default)]
    pub bot_id: Option<String>,
}

/// View state containing form values
#[derive(Debug, Clone, Deserialize)]
pub struct ViewState {
    /// Values by block ID and action ID
    pub values: Value,
}

/// Trait for views service operations
#[async_trait]
pub trait ViewsServiceTrait: Send + Sync {
    /// Open a modal view
    async fn open(&self, request: OpenViewRequest) -> SlackResult<ViewResponse>;

    /// Update an existing view
    async fn update(&self, request: UpdateViewRequest) -> SlackResult<ViewResponse>;

    /// Push a new view onto the view stack
    async fn push(&self, request: PushViewRequest) -> SlackResult<ViewResponse>;

    /// Publish a home tab view
    async fn publish(&self, request: PublishViewRequest) -> SlackResult<ViewResponse>;
}

/// Views service implementation
#[derive(Clone)]
pub struct ViewsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl ViewsService {
    /// Create a new views service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth: AuthManager,
        base_url: String,
        resilience: Arc<ResilienceOrchestrator>,
    ) -> Self {
        Self {
            transport,
            auth,
            base_url,
            resilience,
        }
    }

    fn build_url(&self, endpoint: &str) -> String {
        format!("{}/{}", self.base_url.trim_end_matches('/'), endpoint)
    }
}

#[async_trait]
impl ViewsServiceTrait for ViewsService {
    #[instrument(skip(self, request), fields(trigger_id = %request.trigger_id))]
    async fn open(&self, request: OpenViewRequest) -> SlackResult<ViewResponse> {
        let url = self.build_url("views.open");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("views.open", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self, request))]
    async fn update(&self, request: UpdateViewRequest) -> SlackResult<ViewResponse> {
        let url = self.build_url("views.update");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("views.update", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self, request), fields(trigger_id = %request.trigger_id))]
    async fn push(&self, request: PushViewRequest) -> SlackResult<ViewResponse> {
        let url = self.build_url("views.push");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("views.push", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self, request), fields(user_id = %request.user_id))]
    async fn publish(&self, request: PublishViewRequest) -> SlackResult<ViewResponse> {
        let url = self.build_url("views.publish");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("views.publish", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }
}
