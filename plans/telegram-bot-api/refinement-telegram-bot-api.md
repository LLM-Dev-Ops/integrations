# Refinement: Telegram Bot API Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/telegram-bot-api`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Interface Contracts](#2-interface-contracts)
3. [Testing Requirements](#3-testing-requirements)
4. [Security Considerations](#4-security-considerations)
5. [Performance Optimization](#5-performance-optimization)
6. [CI/CD Configuration](#6-cicd-configuration)
7. [Documentation Requirements](#7-documentation-requirements)
8. [Review Checklist](#8-review-checklist)

---

## 1. Code Standards

### 1.1 Rust Standards

| Standard | Requirement |
|----------|-------------|
| Edition | Rust 2021 |
| MSRV | 1.70.0 |
| Formatting | rustfmt (default) |
| Linting | clippy (pedantic) |
| Documentation | All public items |

### 1.2 Naming Conventions

```rust
// Types: PascalCase
struct TelegramClient { }
struct SendMessageParams { }
enum TelegramError { }

// Functions: snake_case
async fn send_message() { }
async fn handle_webhook() { }
fn resolve_chat() { }

// Constants: SCREAMING_SNAKE_CASE
const TELEGRAM_API_BASE: &str = "https://api.telegram.org";
const DEFAULT_POLLING_TIMEOUT: u32 = 30;
const MAX_MESSAGE_LENGTH: usize = 4096;

// Modules: snake_case
mod rate_limit;
mod simulation;
```

### 1.3 Error Handling Standards

```rust
#[derive(Debug, thiserror::Error)]
pub enum TelegramError {
    #[error("rate limited, retry after {retry_after} seconds")]
    RateLimited { retry_after: i32 },

    #[error("unauthorized: invalid bot token")]
    Unauthorized { message: String },

    #[error("chat not found: {chat_id}")]
    ChatNotFound { chat_id: String },
}

pub type TelegramResult<T> = Result<T, TelegramError>;
```

### 1.4 Async Standards

```rust
// All I/O operations must be async
impl TelegramClient {
    pub async fn send_message(&self, params: SendMessageParams) -> TelegramResult<Message> {
        // ...
    }
}

// Long polling must be cancellation-safe
pub async fn poll_updates<F, Fut>(&self, handler: F) -> TelegramResult<()>
where
    F: Fn(Update) -> Fut,
    Fut: Future<Output = TelegramResult<()>>,
{
    // Use tokio::select! for graceful shutdown
}
```

### 1.5 Memory Safety

```rust
// Use Arc for shared ownership
pub struct TelegramClient {
    config: Arc<TelegramConfig>,
    http_client: Arc<reqwest::Client>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
}

// SecretString for tokens
pub struct TelegramConfig {
    bot_token: secrecy::SecretString,
    webhook_secret: Option<secrecy::SecretString>,
}

// Clone is cheap (Arc clones)
impl Clone for TelegramClient {
    fn clone(&self) -> Self {
        Self {
            config: Arc::clone(&self.config),
            http_client: Arc::clone(&self.http_client),
            rate_limiter: Arc::clone(&self.rate_limiter),
            simulation: Arc::clone(&self.simulation),
        }
    }
}
```

---

## 2. Interface Contracts

### 2.1 Client Interface

```rust
/// Telegram Bot API client.
///
/// Thread-safe and cloneable. Supports both webhook and polling modes.
pub struct TelegramClient { /* ... */ }

impl TelegramClient {
    /// Create a new client with the given configuration.
    pub async fn new(config: TelegramConfig) -> TelegramResult<Self>;

    // Update Handling
    /// Process an incoming webhook update.
    pub async fn handle_webhook(&self, body: &[u8], headers: &HeaderMap) -> TelegramResult<Option<Update>>;

    /// Start long polling for updates.
    pub async fn poll_updates<F, Fut>(&self, handler: F) -> TelegramResult<()>
    where
        F: Fn(Update) -> Fut,
        Fut: Future<Output = TelegramResult<()>>;

    // Message Operations
    pub async fn send_message(&self, params: SendMessageParams) -> TelegramResult<Message>;
    pub async fn edit_message_text(&self, params: EditMessageParams) -> TelegramResult<Message>;
    pub async fn delete_message(&self, chat: ChatTarget, message_id: i64) -> TelegramResult<bool>;
    pub async fn forward_message(&self, params: ForwardParams) -> TelegramResult<Message>;
    pub async fn copy_message(&self, params: CopyParams) -> TelegramResult<MessageId>;

    // Media Operations
    pub async fn send_photo(&self, params: SendPhotoParams) -> TelegramResult<Message>;
    pub async fn send_document(&self, params: SendDocumentParams) -> TelegramResult<Message>;

    // Keyboard Operations
    pub async fn answer_callback_query(&self, params: AnswerCallbackParams) -> TelegramResult<bool>;
    pub async fn edit_message_reply_markup(&self, params: EditReplyMarkupParams) -> TelegramResult<Message>;

    // Webhook Management
    pub async fn set_webhook(&self, url: &str, secret: Option<&str>) -> TelegramResult<bool>;
    pub async fn delete_webhook(&self) -> TelegramResult<bool>;
}
```

### 2.2 Configuration Interface

```rust
pub struct TelegramConfig {
    pub bot_token: SecretString,
    pub api_base_url: String,
    pub webhook_secret: Option<SecretString>,
    pub rate_limit_config: RateLimitConfig,
    pub retry_config: RetryConfig,
    pub simulation_mode: SimulationMode,
    pub chat_routing: HashMap<String, ChatId>,
    pub polling_config: Option<PollingConfig>,
}

pub struct TelegramConfigBuilder { /* ... */ }

impl TelegramConfigBuilder {
    pub fn new(bot_token: impl Into<String>) -> Self;
    pub fn with_webhook_secret(self, secret: impl Into<String>) -> Self;
    pub fn with_chat_route(self, name: impl Into<String>, chat_id: ChatId) -> Self;
    pub fn with_polling(self, config: PollingConfig) -> Self;
    pub fn with_simulation(self, mode: SimulationMode) -> Self;
    pub fn from_env() -> Result<Self, ConfigError>;
    pub fn build(self) -> Result<TelegramConfig, ConfigError>;
}
```

### 2.3 Type Contracts

```rust
/// Chat identifier - numeric ID or @username.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChatId {
    Id(i64),
    Username(String),
}

/// Target for sending messages.
pub enum ChatTarget {
    Id(i64),
    Username(String),
    Name(String),  // Lookup in chat_routing
}

/// Telegram message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub message_id: i64,
    pub chat: Chat,
    pub from: Option<User>,
    pub date: i64,
    pub text: Option<String>,
    #[serde(default)]
    pub entities: Vec<MessageEntity>,
    pub reply_markup: Option<InlineKeyboardMarkup>,
}

/// Incoming update from Telegram.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Update {
    pub update_id: i64,
    pub message: Option<Message>,
    pub edited_message: Option<Message>,
    pub channel_post: Option<Message>,
    pub callback_query: Option<CallbackQuery>,
}
```

---

## 3. Testing Requirements

### 3.1 Test Categories

| Category | Coverage Target | Method |
|----------|-----------------|--------|
| Unit Tests | >80% | cargo test |
| Integration (Sim) | All operations | Replay mode |
| Integration (Real) | Critical paths | Telegram API (CI) |
| Rate Limit | Edge cases | Simulated limits |
| Webhook | Signature verification | Unit tests |

### 3.2 Unit Test Examples

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_id_serialization() {
        let id = ChatId::Id(123456789);
        assert_eq!(serde_json::to_string(&id).unwrap(), "123456789");

        let username = ChatId::Username("@testchannel".to_string());
        assert_eq!(serde_json::to_string(&username).unwrap(), "\"@testchannel\"");
    }

    #[test]
    fn test_update_parsing() {
        let json = r#"{"update_id": 123, "message": {"message_id": 1, "chat": {"id": 456, "type": "private"}, "date": 1234567890, "text": "Hello"}}"#;
        let update: Update = serde_json::from_str(json).unwrap();
        assert_eq!(update.update_id, 123);
        assert!(update.message.is_some());
    }

    #[test]
    fn test_inline_keyboard_builder() {
        let keyboard = InlineKeyboardBuilder::new()
            .button("Yes", "confirm_yes")
            .button("No", "confirm_no")
            .row()
            .url_button("Help", "https://example.com")
            .build();

        assert_eq!(keyboard.inline_keyboard.len(), 2);
        assert_eq!(keyboard.inline_keyboard[0].len(), 2);
    }

    #[test]
    fn test_webhook_signature_verification() {
        let secret = "test_secret";
        let valid_token = "test_secret";
        assert!(verify_webhook_signature(secret, valid_token));

        let invalid_token = "wrong_secret";
        assert!(!verify_webhook_signature(secret, invalid_token));
    }
}
```

### 3.3 Integration Test Examples

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_send_message_simulation() {
        let config = TelegramConfigBuilder::new("test:token")
            .with_simulation(SimulationMode::Replay {
                path: PathBuf::from("tests/fixtures/recordings/send_message.json"),
            })
            .build()
            .unwrap();

        let client = TelegramClient::new(config).await.unwrap();

        let result = client.send_message(SendMessageParams {
            chat: ChatTarget::Id(123456789),
            text: "Hello!".to_string(),
            ..Default::default()
        }).await;

        assert!(result.is_ok());
        let message = result.unwrap();
        assert!(!message.text.unwrap_or_default().is_empty());
    }

    #[tokio::test]
    async fn test_rate_limiter_per_chat() {
        let limiter = RateLimiter::new(RateLimitConfig::default());

        let start = Instant::now();

        // Send two messages to same chat
        limiter.acquire(Some(123)).await.unwrap();
        limiter.acquire(Some(123)).await.unwrap();

        let elapsed = start.elapsed();
        // Should take at least 1 second (1 msg/sec per chat)
        assert!(elapsed >= Duration::from_millis(900));
    }

    #[tokio::test]
    async fn test_chat_routing() {
        let config = TelegramConfigBuilder::new("test:token")
            .with_chat_route("alerts", ChatId::Id(-1001234567890))
            .with_simulation(SimulationMode::Replay {
                path: PathBuf::from("tests/fixtures/recordings/routing.json"),
            })
            .build()
            .unwrap();

        let client = TelegramClient::new(config).await.unwrap();

        let result = client.send_message(SendMessageParams {
            chat: ChatTarget::Name("alerts".to_string()),
            text: "Alert!".to_string(),
            ..Default::default()
        }).await;

        assert!(result.is_ok());
    }
}
```

### 3.4 Test Fixtures

```
tests/fixtures/recordings/
├── messages/
│   ├── send_message.json
│   ├── edit_message.json
│   └── delete_message.json
├── media/
│   ├── send_photo.json
│   └── send_document.json
├── updates/
│   ├── message_update.json
│   ├── callback_query.json
│   └── polling_batch.json
└── errors/
    ├── rate_limited.json
    ├── chat_not_found.json
    └── forbidden.json
```

---

## 4. Security Considerations

### 4.1 Token Protection

```rust
// Token in URL path - never logged
impl TelegramClient {
    fn api_url(&self, method: &str) -> String {
        format!("{}/bot{}/{}",
            self.config.api_base_url,
            self.config.bot_token.expose_secret(),  // Only expose when needed
            method
        )
    }
}

// Debug hides token
impl std::fmt::Debug for TelegramConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TelegramConfig")
            .field("bot_token", &"[REDACTED]")
            .field("webhook_secret", &self.webhook_secret.as_ref().map(|_| "[REDACTED]"))
            .field("api_base_url", &self.api_base_url)
            .finish()
    }
}
```

### 4.2 Webhook Verification

```rust
impl TelegramClient {
    pub async fn handle_webhook(&self, body: &[u8], headers: &HeaderMap) -> TelegramResult<Option<Update>> {
        // Verify secret token if configured
        if let Some(secret) = &self.config.webhook_secret {
            let provided = headers
                .get("X-Telegram-Bot-Api-Secret-Token")
                .and_then(|v| v.to_str().ok())
                .ok_or(TelegramError::InvalidWebhookSignature)?;

            // Constant-time comparison
            if !constant_time_eq(secret.expose_secret().as_bytes(), provided.as_bytes()) {
                return Err(TelegramError::InvalidWebhookSignature);
            }
        }

        // Parse and return update
        let update: Update = serde_json::from_slice(body)?;
        Ok(Some(update))
    }
}
```

### 4.3 Input Validation

```rust
impl SendMessageParams {
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Text length
        if self.text.len() > 4096 {
            return Err(ValidationError::TextTooLong {
                max: 4096,
                actual: self.text.len(),
            });
        }

        // Inline keyboard limits
        if let Some(ReplyMarkup::InlineKeyboard(kb)) = &self.reply_markup {
            let button_count: usize = kb.inline_keyboard.iter().map(|row| row.len()).sum();
            if button_count > 100 {
                return Err(ValidationError::TooManyButtons {
                    max: 100,
                    actual: button_count,
                });
            }
        }

        Ok(())
    }
}
```

### 4.4 TLS Requirements

```rust
impl TelegramClient {
    async fn new(config: TelegramConfig) -> TelegramResult<Self> {
        let http_client = reqwest::Client::builder()
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .https_only(true)
            .timeout(Duration::from_secs(60))
            .build()?;
        // ...
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
let http_client = reqwest::Client::builder()
    .pool_max_idle_per_host(10)
    .pool_idle_timeout(Duration::from_secs(90))
    .tcp_keepalive(Duration::from_secs(60))
    .build()?;
```

### 5.2 Rate Limit Optimization

```rust
impl RateLimiter {
    // Lock-free check for global limit
    pub fn can_proceed_global(&self) -> bool {
        self.global_semaphore.available_permits() > 0
    }

    // Atomic per-chat state updates
    pub fn update_chat_timestamp(&self, chat_id: i64) {
        if let Some(limiter) = self.chat_limiters.read().get(&chat_id) {
            limiter.last_message.store(
                Instant::now().elapsed().as_millis() as u64,
                Ordering::Release
            );
        }
    }
}
```

### 5.3 Serialization Optimization

```rust
#[derive(Serialize)]
struct SendMessageApiParams<'a> {
    chat_id: &'a ChatId,
    text: &'a str,

    #[serde(skip_serializing_if = "Option::is_none")]
    parse_mode: Option<&'a ParseMode>,

    #[serde(skip_serializing_if = "Option::is_none")]
    disable_notification: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    reply_to_message_id: Option<i64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    reply_markup: Option<&'a ReplyMarkup>,
}
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
name: Telegram Bot API Integration CI

on:
  push:
    paths:
      - 'integrations/telegram-bot-api/**'
  pull_request:
    paths:
      - 'integrations/telegram-bot-api/**'

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/telegram-bot-api

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings
        working-directory: integrations/telegram-bot-api

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Run tests
        run: cargo test --all-features
        working-directory: integrations/telegram-bot-api

      - name: Coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --output-dir coverage
        working-directory: integrations/telegram-bot-api

      - uses: codecov/codecov-action@v3
        with:
          files: integrations/telegram-bot-api/coverage/cobertura.xml

  integration-test:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Integration tests
        run: cargo test --features integration-test
        working-directory: integrations/telegram-bot-api
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_TEST_CHAT_ID: ${{ secrets.TELEGRAM_TEST_CHAT_ID }}

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Security audit
        run: |
          cargo install cargo-audit
          cargo audit
        working-directory: integrations/telegram-bot-api
```

### 6.2 Quality Gates

| Gate | Threshold |
|------|-----------|
| Line coverage | >80% |
| Clippy warnings | 0 |
| Format check | Pass |
| Security audit | 0 critical |
| Doc coverage | >90% public |

---

## 7. Documentation Requirements

### 7.1 Module Documentation

```rust
//! # Telegram Bot API Integration
//!
//! Thin adapter for Telegram Bot API operations.
//!
//! ## Features
//!
//! - Dual update modes: webhook and long polling
//! - Message operations: send, edit, delete, forward
//! - Media: photos, documents with upload support
//! - Keyboards: inline and reply keyboards
//! - Rate limiting: automatic multi-tier limiting
//! - Simulation: record/replay for CI/CD
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use telegram_bot_api::{TelegramClient, TelegramConfigBuilder, SendMessageParams, ChatTarget};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = TelegramConfigBuilder::new("BOT_TOKEN")
//!         .build()?;
//!
//!     let client = TelegramClient::new(config).await?;
//!
//!     client.send_message(SendMessageParams {
//!         chat: ChatTarget::Id(123456789),
//!         text: "Hello from Rust!".to_string(),
//!         ..Default::default()
//!     }).await?;
//!
//!     Ok(())
//! }
//! ```
```

### 7.2 API Documentation Example

```rust
/// Send a text message to a chat.
///
/// # Arguments
///
/// * `params` - Message parameters including chat, text, and formatting
///
/// # Returns
///
/// The sent message on success.
///
/// # Rate Limits
///
/// - 30 messages/second globally
/// - 1 message/second per private chat
/// - 20 messages/minute per group
///
/// # Examples
///
/// ```rust,no_run
/// # use telegram_bot_api::*;
/// # async fn example(client: TelegramClient) -> Result<(), TelegramError> {
/// // Simple text message
/// client.send_message(SendMessageParams {
///     chat: ChatTarget::Id(123456789),
///     text: "Hello!".to_string(),
///     ..Default::default()
/// }).await?;
///
/// // HTML formatted with keyboard
/// let keyboard = InlineKeyboardBuilder::new()
///     .button("Click me", "button_clicked")
///     .build();
///
/// client.send_message(SendMessageParams {
///     chat: ChatTarget::Id(123456789),
///     text: "<b>Bold</b> and <i>italic</i>".to_string(),
///     parse_mode: Some(ParseMode::HTML),
///     reply_markup: Some(ReplyMarkup::InlineKeyboard(keyboard)),
///     ..Default::default()
/// }).await?;
/// # Ok(())
/// # }
/// ```
pub async fn send_message(&self, params: SendMessageParams) -> TelegramResult<Message>;
```

---

## 8. Review Checklist

### 8.1 Pre-Implementation

| Item | Status |
|------|--------|
| Specification reviewed | Required |
| Pseudocode reviewed | Required |
| Architecture reviewed | Required |
| Security requirements clear | Required |
| Test strategy defined | Required |

### 8.2 Implementation Review

| Item | Verification |
|------|--------------|
| All public APIs documented | Doc coverage |
| Error handling complete | All Results handled |
| Rate limiting implemented | Integration tests |
| Simulation mode works | Unit tests |
| No tokens in logs | Code review |
| TLS enforced | Config check |
| Webhook verification | Unit tests |

### 8.3 Pre-Merge

| Item | Required |
|------|----------|
| CI pipeline green | Yes |
| Code reviewed | Yes |
| Documentation updated | Yes |
| CHANGELOG updated | Yes |
| Security review passed | Yes |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-TELEGRAM-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*SPARC Phase 4 Complete - Proceed to Completion phase with "Next phase."*
