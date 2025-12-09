use crate::errors::OpenAIError;
use async_trait::async_trait;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RequestContext {
    pub path: String,
    pub method: String,
    pub attempt: u32,
}

#[derive(Debug, Clone)]
pub struct ResponseContext {
    pub path: String,
    pub method: String,
    pub status_code: Option<u16>,
    pub duration: Duration,
    pub attempt: u32,
}

#[async_trait]
pub trait ResilienceHooks: Send + Sync {
    async fn on_request(&self, ctx: &RequestContext) {}
    async fn on_response(&self, ctx: &ResponseContext) {}
    async fn on_error(&self, ctx: &RequestContext, error: &OpenAIError) {}
    async fn on_retry(&self, ctx: &RequestContext, delay: Duration, attempt: u32) {}
    async fn on_circuit_open(&self) {}
    async fn on_circuit_close(&self) {}
}

pub struct NoOpHooks;

#[async_trait]
impl ResilienceHooks for NoOpHooks {}

pub struct LoggingHooks {
    pub log_requests: bool,
    pub log_responses: bool,
    pub log_errors: bool,
}

impl Default for LoggingHooks {
    fn default() -> Self {
        Self {
            log_requests: true,
            log_responses: true,
            log_errors: true,
        }
    }
}

#[async_trait]
impl ResilienceHooks for LoggingHooks {
    async fn on_request(&self, ctx: &RequestContext) {
        if self.log_requests {
            eprintln!(
                "[DEBUG] Starting request: path={}, method={}, attempt={}",
                ctx.path, ctx.method, ctx.attempt
            );
        }
    }

    async fn on_response(&self, ctx: &ResponseContext) {
        if self.log_responses {
            eprintln!(
                "[DEBUG] Request completed: path={}, method={}, status={:?}, duration={}ms",
                ctx.path,
                ctx.method,
                ctx.status_code,
                ctx.duration.as_millis()
            );
        }
    }

    async fn on_error(&self, ctx: &RequestContext, error: &OpenAIError) {
        if self.log_errors {
            eprintln!(
                "[WARN] Request failed: path={}, method={}, error={}",
                ctx.path, ctx.method, error
            );
        }
    }

    async fn on_retry(&self, ctx: &RequestContext, delay: Duration, attempt: u32) {
        eprintln!(
            "[INFO] Retrying request: path={}, method={}, delay={}ms, attempt={}",
            ctx.path,
            ctx.method,
            delay.as_millis(),
            attempt
        );
    }

    async fn on_circuit_open(&self) {
        eprintln!("[WARN] Circuit breaker opened");
    }

    async fn on_circuit_close(&self) {
        eprintln!("[INFO] Circuit breaker closed");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_noop_hooks() {
        let hooks = NoOpHooks;
        let ctx = RequestContext {
            path: "/v1/chat/completions".to_string(),
            method: "POST".to_string(),
            attempt: 0,
        };
        hooks.on_request(&ctx).await;
    }

    #[tokio::test]
    async fn test_logging_hooks() {
        let hooks = LoggingHooks::default();
        let req_ctx = RequestContext {
            path: "/v1/chat/completions".to_string(),
            method: "POST".to_string(),
            attempt: 1,
        };
        hooks.on_request(&req_ctx).await;

        let resp_ctx = ResponseContext {
            path: "/v1/chat/completions".to_string(),
            method: "POST".to_string(),
            status_code: Some(200),
            duration: Duration::from_millis(150),
            attempt: 1,
        };
        hooks.on_response(&resp_ctx).await;

        hooks.on_retry(&req_ctx, Duration::from_secs(1), 2).await;
    }

    #[tokio::test]
    async fn test_logging_hooks_circuit_breaker() {
        let hooks = LoggingHooks::default();
        hooks.on_circuit_open().await;
        hooks.on_circuit_close().await;
    }
}
