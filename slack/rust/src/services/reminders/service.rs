//! Reminders service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for reminders service operations
#[async_trait]
pub trait RemindersServiceTrait: Send + Sync {
    /// Create a reminder
    async fn add(&self, request: AddReminderRequest) -> SlackResult<AddReminderResponse>;

    /// Mark a reminder as complete
    async fn complete(
        &self,
        request: CompleteReminderRequest,
    ) -> SlackResult<CompleteReminderResponse>;

    /// Delete a reminder
    async fn delete(&self, request: DeleteReminderRequest) -> SlackResult<DeleteReminderResponse>;

    /// Get information about a reminder
    async fn info(&self, request: InfoReminderRequest) -> SlackResult<InfoReminderResponse>;

    /// List all reminders
    async fn list(&self, request: ListRemindersRequest) -> SlackResult<ListRemindersResponse>;
}

/// Reminders service implementation
pub struct RemindersService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl RemindersService {
    /// Create a new reminders service
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
impl RemindersServiceTrait for RemindersService {
    #[instrument(skip(self), fields(text = %request.text, time = %request.time))]
    async fn add(&self, request: AddReminderRequest) -> SlackResult<AddReminderResponse> {
        let url = self.build_url("reminders.add");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reminders.add", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(reminder = %request.reminder))]
    async fn complete(
        &self,
        request: CompleteReminderRequest,
    ) -> SlackResult<CompleteReminderResponse> {
        let url = self.build_url("reminders.complete");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reminders.complete", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(reminder = %request.reminder))]
    async fn delete(&self, request: DeleteReminderRequest) -> SlackResult<DeleteReminderResponse> {
        let url = self.build_url("reminders.delete");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reminders.delete", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(reminder = %request.reminder))]
    async fn info(&self, request: InfoReminderRequest) -> SlackResult<InfoReminderResponse> {
        let url = self.build_url("reminders.info");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reminders.info", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self))]
    async fn list(&self, request: ListRemindersRequest) -> SlackResult<ListRemindersResponse> {
        let url = self.build_url("reminders.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reminders.list", &DefaultRetryPolicy, || {
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
