# Refinement: Discord Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/discord`

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
| Formatting | rustfmt (default config) |
| Linting | clippy (pedantic) |
| Documentation | All public items |

### 1.2 Naming Conventions

```rust
// Types: PascalCase
struct DiscordClient { }
struct WebhookParams { }
enum DiscordError { }

// Functions: snake_case
async fn execute_webhook() { }
async fn send_message() { }
fn parse_webhook_url() { }

// Constants: SCREAMING_SNAKE_CASE
const DISCORD_API_BASE: &str = "https://discord.com/api/v10";
const DISCORD_EPOCH: u64 = 1420070400000;
const DEFAULT_TIMEOUT_SECS: u64 = 30;

// Modules: snake_case
mod rate_limit;
mod simulation;

// Parameters: snake_case
fn with_channel_route(name: &str, channel_id: Snowflake) { }
```

### 1.3 Error Handling Standards

```rust
// Use thiserror for error types
#[derive(Debug, thiserror::Error)]
pub enum DiscordError {
    #[error("rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    #[error("unauthorized: {message}")]
    Unauthorized { message: String },

    #[error("channel route not found: {name}")]
    UnknownChannelRoute { name: String },
}

// Result type alias
pub type DiscordResult<T> = Result<T, DiscordError>;

// Error context with anyhow for internal errors
use anyhow::Context;
let config = load_config()
    .context("failed to load discord configuration")?;
```

### 1.4 Async Standards

```rust
// All I/O operations must be async
impl DiscordClient {
    pub async fn send_message(&self, params: SendMessageParams) -> DiscordResult<Message> {
        // ...
    }
}

// Use tokio for async runtime
#[tokio::main]
async fn main() {
    let client = DiscordClient::new(config).await?;
}

// Cancellation safety
// All async operations must be cancellation-safe
// Use select! with care, prefer tokio::select! over futures::select!
```

### 1.5 Memory Safety

```rust
// Use Arc for shared ownership
pub struct DiscordClient {
    config: Arc<DiscordConfig>,
    http_client: Arc<reqwest::Client>,
    rate_limiter: Arc<RateLimiter>,
}

// Use SecretString for credentials
pub struct DiscordConfig {
    bot_token: Option<secrecy::SecretString>,
    default_webhook_url: Option<secrecy::SecretString>,
}

// Implement Clone for client (cheap Arc clones)
impl Clone for DiscordClient {
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
/// Discord REST API and webhook client.
///
/// Thread-safe and cloneable. Each clone shares the same
/// HTTP client, rate limiter, and configuration.
pub struct DiscordClient {
    // ... internal fields
}

impl DiscordClient {
    /// Create a new Discord client with the given configuration.
    ///
    /// # Errors
    /// Returns error if HTTP client creation fails.
    pub async fn new(config: DiscordConfig) -> DiscordResult<Self>;

    /// Execute a webhook, optionally returning the created message.
    ///
    /// # Arguments
    /// * `params` - Webhook execution parameters
    ///
    /// # Returns
    /// * `Ok(Some(Message))` if `params.wait` is true
    /// * `Ok(None)` if `params.wait` is false
    /// * `Err(DiscordError)` on failure
    pub async fn execute_webhook(&self, params: WebhookParams) -> DiscordResult<Option<Message>>;

    /// Edit a webhook message.
    pub async fn edit_webhook_message(&self, params: EditWebhookParams) -> DiscordResult<Message>;

    /// Delete a webhook message.
    pub async fn delete_webhook_message(&self, params: DeleteWebhookParams) -> DiscordResult<()>;

    /// Send a message to a channel.
    pub async fn send_message(&self, params: SendMessageParams) -> DiscordResult<Message>;

    /// Edit an existing message.
    pub async fn edit_message(&self, params: EditMessageParams) -> DiscordResult<Message>;

    /// Delete a message. Succeeds even if message already deleted.
    pub async fn delete_message(
        &self,
        channel: ChannelTarget,
        message_id: Snowflake,
    ) -> DiscordResult<()>;

    /// Add a reaction to a message.
    pub async fn add_reaction(&self, params: ReactionParams) -> DiscordResult<()>;

    /// Create a thread in a channel.
    pub async fn create_thread(&self, params: CreateThreadParams) -> DiscordResult<Channel>;

    /// Send a message to a thread.
    pub async fn send_to_thread(
        &self,
        thread_id: Snowflake,
        params: SendMessageParams,
    ) -> DiscordResult<Message>;

    /// Send a direct message to a user.
    pub async fn send_dm(
        &self,
        user_id: Snowflake,
        params: SendMessageParams,
    ) -> DiscordResult<Message>;
}
```

### 2.2 Configuration Interface

```rust
/// Discord client configuration.
#[derive(Clone)]
pub struct DiscordConfig {
    /// Bot token for REST API authentication.
    pub bot_token: Option<SecretString>,

    /// Default webhook URL for webhook operations.
    pub default_webhook_url: Option<SecretString>,

    /// Discord API base URL.
    pub base_url: String,

    /// Rate limit configuration.
    pub rate_limit_config: RateLimitConfig,

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Simulation mode.
    pub simulation_mode: SimulationMode,

    /// Named channel routes.
    pub channel_routing: HashMap<String, Snowflake>,
}

/// Builder for DiscordConfig.
pub struct DiscordConfigBuilder { /* ... */ }

impl DiscordConfigBuilder {
    pub fn new() -> Self;
    pub fn with_bot_token(self, token: impl Into<String>) -> Self;
    pub fn with_webhook(self, url: impl Into<String>) -> Self;
    pub fn with_base_url(self, url: impl Into<String>) -> Self;
    pub fn with_rate_limit_config(self, config: RateLimitConfig) -> Self;
    pub fn with_retry_config(self, config: RetryConfig) -> Self;
    pub fn with_simulation(self, mode: SimulationMode) -> Self;
    pub fn with_channel_route(self, name: impl Into<String>, id: Snowflake) -> Self;
    pub fn from_env() -> Result<Self, ConfigError>;
    pub fn build(self) -> Result<DiscordConfig, ConfigError>;
}
```

### 2.3 Type Contracts

```rust
/// Discord Snowflake ID (64-bit unsigned integer).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Snowflake(pub u64);

impl Snowflake {
    /// Create a new Snowflake from a u64.
    pub fn new(id: u64) -> Self;

    /// Parse a Snowflake from a string.
    pub fn parse(s: &str) -> Result<Self, ParseSnowflakeError>;

    /// Get the Unix timestamp when this Snowflake was created.
    pub fn timestamp(&self) -> u64;
}

/// Discord message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: Snowflake,
    pub channel_id: Snowflake,
    pub content: String,
    #[serde(default)]
    pub embeds: Vec<Embed>,
    #[serde(default)]
    pub components: Vec<ActionRow>,
    pub timestamp: DateTime<Utc>,
    pub author: Option<User>,
    pub message_reference: Option<MessageReference>,
}

/// Discord embed.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Embed {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<EmbedFooter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<EmbedMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<EmbedMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<EmbedAuthor>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<EmbedField>,
}

impl Embed {
    pub fn builder() -> EmbedBuilder;
}
```

---

## 3. Testing Requirements

### 3.1 Test Categories

| Category | Coverage Target | Method |
|----------|-----------------|--------|
| Unit Tests | >80% | cargo test |
| Integration (Sim) | All operations | Replay mode |
| Integration (Real) | Critical paths | Discord API (CI only) |
| Rate Limit | Edge cases | Simulated buckets |
| Error Handling | All error types | Mocked responses |

### 3.2 Unit Test Examples

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snowflake_parse() {
        let snowflake = Snowflake::parse("123456789012345678").unwrap();
        assert_eq!(snowflake.0, 123456789012345678);
    }

    #[test]
    fn test_snowflake_timestamp() {
        // Known Discord ID with known timestamp
        let snowflake = Snowflake::new(175928847299117063);
        let timestamp = snowflake.timestamp();
        assert!(timestamp > 0);
    }

    #[test]
    fn test_parse_webhook_url() {
        let url = "https://discord.com/api/webhooks/123456/abcdef-token";
        let (id, token) = parse_webhook_url(url).unwrap();
        assert_eq!(id.0, 123456);
        assert_eq!(token, "abcdef-token");
    }

    #[test]
    fn test_parse_webhook_url_invalid() {
        let url = "https://example.com/not-a-webhook";
        assert!(parse_webhook_url(url).is_err());
    }

    #[test]
    fn test_embed_builder() {
        let embed = Embed::builder()
            .title("Test")
            .description("Description")
            .color(0xFF0000)
            .build();

        assert_eq!(embed.title, Some("Test".to_string()));
        assert_eq!(embed.color, Some(0xFF0000));
    }

    #[test]
    fn test_config_requires_auth() {
        let result = DiscordConfigBuilder::new().build();
        assert!(matches!(result, Err(ConfigError::NoAuthentication)));
    }
}
```

### 3.3 Integration Test Examples

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_webhook_execute_simulation() {
        let config = DiscordConfigBuilder::new()
            .with_webhook("https://discord.com/api/webhooks/123/token")
            .with_simulation(SimulationMode::Replay {
                path: PathBuf::from("tests/fixtures/recordings/webhook.json"),
            })
            .build()
            .unwrap();

        let client = DiscordClient::new(config).await.unwrap();

        let result = client.execute_webhook(WebhookParams {
            content: Some("Test message".to_string()),
            wait: true,
            ..Default::default()
        }).await;

        assert!(result.is_ok());
        let message = result.unwrap().unwrap();
        assert!(!message.content.is_empty());
    }

    #[tokio::test]
    async fn test_rate_limit_handling() {
        let bucket = RateLimitBucket::new("test");

        // Simulate exhausted bucket
        bucket.remaining.store(0, Ordering::SeqCst);
        bucket.reset_at.store(
            (SystemTime::now() + Duration::from_secs(1))
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            Ordering::SeqCst,
        );

        let start = Instant::now();
        bucket.acquire().await.unwrap();
        let elapsed = start.elapsed();

        assert!(elapsed >= Duration::from_millis(900));
    }

    #[tokio::test]
    async fn test_channel_routing() {
        let config = DiscordConfigBuilder::new()
            .with_bot_token("test-token")
            .with_channel_route("alerts", Snowflake::new(123456789))
            .with_simulation(SimulationMode::Replay {
                path: PathBuf::from("tests/fixtures/recordings/message.json"),
            })
            .build()
            .unwrap();

        let client = DiscordClient::new(config).await.unwrap();

        let result = client.send_message(SendMessageParams {
            channel: ChannelTarget::Name("alerts".to_string()),
            content: Some("Alert!".to_string()),
            ..Default::default()
        }).await;

        assert!(result.is_ok());
    }
}
```

### 3.4 Test Fixtures

```
tests/fixtures/recordings/
├── webhook/
│   ├── execute_success.json
│   ├── execute_rate_limited.json
│   └── edit_success.json
├── message/
│   ├── send_success.json
│   ├── edit_success.json
│   ├── delete_success.json
│   └── reaction_success.json
├── channel/
│   ├── create_thread_success.json
│   └── dm_success.json
└── errors/
    ├── unauthorized.json
    ├── forbidden.json
    └── not_found.json
```

---

## 4. Security Considerations

### 4.1 Credential Protection

| Credential | Protection |
|------------|------------|
| Bot Token | SecretString, never logged |
| Webhook URL | SecretString, contains token |
| Webhook Token | Extracted, not stored separately |

```rust
// Secret handling
use secrecy::{ExposeSecret, SecretString};

impl DiscordClient {
    fn build_auth_header(&self) -> Option<String> {
        self.config.bot_token.as_ref().map(|token| {
            // Only expose when needed for request
            format!("Bot {}", token.expose_secret())
        })
    }
}

// Debug implementation hides secrets
impl std::fmt::Debug for DiscordConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DiscordConfig")
            .field("bot_token", &self.bot_token.as_ref().map(|_| "[REDACTED]"))
            .field("default_webhook_url", &self.default_webhook_url.as_ref().map(|_| "[REDACTED]"))
            .field("base_url", &self.base_url)
            .finish()
    }
}
```

### 4.2 Logging Security

```rust
// NEVER log tokens or webhook URLs
tracing::info!(
    channel_id = %channel_id,
    message_id = %message_id,
    "message sent successfully"
);

// Redact in error messages
impl std::fmt::Display for DiscordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidWebhookUrl => write!(f, "invalid webhook URL format"),
            // Don't include the actual URL
            _ => write!(f, "{:?}", self),
        }
    }
}
```

### 4.3 Input Validation

```rust
impl WebhookParams {
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Content length
        if let Some(content) = &self.content {
            if content.len() > 2000 {
                return Err(ValidationError::ContentTooLong {
                    max: 2000,
                    actual: content.len(),
                });
            }
        }

        // Embed count
        if self.embeds.len() > 10 {
            return Err(ValidationError::TooManyEmbeds {
                max: 10,
                actual: self.embeds.len(),
            });
        }

        // Embed total size
        let embed_size: usize = self.embeds.iter()
            .map(|e| e.total_characters())
            .sum();
        if embed_size > 6000 {
            return Err(ValidationError::EmbedsTooLarge {
                max: 6000,
                actual: embed_size,
            });
        }

        Ok(())
    }
}
```

### 4.4 TLS Requirements

```rust
impl DiscordClient {
    async fn new(config: DiscordConfig) -> DiscordResult<Self> {
        let http_client = reqwest::Client::builder()
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .https_only(true)  // Reject HTTP
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| DiscordError::HttpClientError { source: e })?;

        // ...
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
// reqwest handles connection pooling internally
// Configure pool settings for high throughput
let http_client = reqwest::Client::builder()
    .pool_max_idle_per_host(10)
    .pool_idle_timeout(Duration::from_secs(90))
    .build()?;
```

### 5.2 Rate Limit Optimization

```rust
impl RateLimitBucket {
    // Lock-free fast path for checking remaining
    pub fn can_proceed(&self) -> bool {
        self.remaining.load(Ordering::Relaxed) > 0
    }

    // Atomic update from headers
    pub fn update_from_headers(&self, headers: &HeaderMap) {
        if let Some(remaining) = headers.get("X-RateLimit-Remaining") {
            if let Ok(val) = remaining.to_str().and_then(|s| s.parse().ok()) {
                self.remaining.store(val, Ordering::Release);
            }
        }

        if let Some(reset) = headers.get("X-RateLimit-Reset") {
            if let Ok(val) = reset.to_str().and_then(|s| s.parse().ok()) {
                self.reset_at.store(val, Ordering::Release);
            }
        }
    }
}
```

### 5.3 Serialization Optimization

```rust
// Use serde with skip_serializing_if for smaller payloads
#[derive(Serialize)]
struct WebhookExecuteBody {
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    avatar_url: Option<String>,

    #[serde(skip_serializing_if = "Vec::is_empty")]
    embeds: Vec<Embed>,

    #[serde(skip_serializing_if = "Vec::is_empty")]
    components: Vec<ActionRow>,
}
```

### 5.4 Memory Optimization

```rust
// Use Cow for flexible string handling
use std::borrow::Cow;

pub struct SendMessageParams<'a> {
    pub channel: ChannelTarget,
    pub content: Option<Cow<'a, str>>,
    pub embeds: Vec<Embed>,
}

// Avoid cloning large structures
impl DiscordClient {
    pub async fn send_message(&self, params: SendMessageParams<'_>) -> DiscordResult<Message> {
        // params is moved, not cloned
        // ...
    }
}
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
name: Discord Integration CI

on:
  push:
    paths:
      - 'integrations/discord/**'
  pull_request:
    paths:
      - 'integrations/discord/**'

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/discord

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/discord

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings
        working-directory: integrations/discord

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/discord

      - name: Run tests
        run: cargo test --all-features
        working-directory: integrations/discord

      - name: Run tests with coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --output-dir coverage
        working-directory: integrations/discord

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/discord/coverage/cobertura.xml
          flags: discord

  integration-test:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run integration tests
        run: cargo test --features integration-test
        working-directory: integrations/discord
        env:
          DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
          DISCORD_TEST_CHANNEL: ${{ secrets.DISCORD_TEST_CHANNEL }}
          DISCORD_TEST_WEBHOOK: ${{ secrets.DISCORD_TEST_WEBHOOK }}

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-audit
        run: cargo install cargo-audit

      - name: Security audit
        run: cargo audit
        working-directory: integrations/discord

      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: integrations/discord
```

### 6.2 Test Environment

| Environment | Purpose | Discord Access |
|-------------|---------|----------------|
| Local Dev | Unit tests | Simulation only |
| CI (PR) | Unit + simulation | Simulation only |
| CI (main) | Full integration | Real Discord API |
| Staging | End-to-end | Test server |

### 6.3 Quality Gates

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Line Coverage | >80% | CI failure |
| Clippy Warnings | 0 | CI failure |
| Format Check | Pass | CI failure |
| Security Audit | 0 critical | CI failure |
| Doc Coverage | >90% public | CI warning |

---

## 7. Documentation Requirements

### 7.1 Module Documentation

```rust
//! # Discord Integration Module
//!
//! Thin adapter layer for Discord REST API and webhook operations.
//!
//! ## Features
//!
//! - Webhook execution with optional message return
//! - Channel and DM message operations
//! - Thread creation and messaging
//! - Automatic rate limit handling
//! - Simulation mode for testing
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use discord::{DiscordClient, DiscordConfigBuilder, WebhookParams};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = DiscordConfigBuilder::new()
//!         .with_webhook("https://discord.com/api/webhooks/...")
//!         .build()?;
//!
//!     let client = DiscordClient::new(config).await?;
//!
//!     client.execute_webhook(WebhookParams {
//!         content: Some("Hello from Rust!".to_string()),
//!         ..Default::default()
//!     }).await?;
//!
//!     Ok(())
//! }
//! ```
//!
//! ## Simulation Mode
//!
//! For testing without Discord API access:
//!
//! ```rust,no_run
//! use discord::{DiscordConfigBuilder, SimulationMode};
//! use std::path::PathBuf;
//!
//! let config = DiscordConfigBuilder::new()
//!     .with_webhook("https://discord.com/api/webhooks/123/token")
//!     .with_simulation(SimulationMode::Replay {
//!         path: PathBuf::from("fixtures/recordings.json"),
//!     })
//!     .build()?;
//! ```
```

### 7.2 API Documentation

```rust
/// Execute a Discord webhook.
///
/// Sends a message via webhook. Webhooks don't require bot token
/// authentication - the token is embedded in the webhook URL.
///
/// # Arguments
///
/// * `params` - Webhook execution parameters
///
/// # Returns
///
/// * `Ok(Some(Message))` - The created message (if `wait` is true)
/// * `Ok(None)` - Success without message (if `wait` is false)
/// * `Err(DiscordError)` - On failure
///
/// # Rate Limits
///
/// Webhooks are limited to 30 messages per minute per webhook.
/// The client automatically handles rate limiting with queuing.
///
/// # Examples
///
/// ```rust,no_run
/// # use discord::{DiscordClient, WebhookParams, Embed};
/// # async fn example(client: DiscordClient) -> Result<(), Box<dyn std::error::Error>> {
/// // Simple text message
/// client.execute_webhook(WebhookParams {
///     content: Some("Hello!".to_string()),
///     wait: false,
///     ..Default::default()
/// }).await?;
///
/// // Rich embed with custom username
/// let embed = Embed::builder()
///     .title("Alert")
///     .description("Something happened")
///     .color(0xFF0000)
///     .build();
///
/// let message = client.execute_webhook(WebhookParams {
///     username: Some("Alert Bot".to_string()),
///     embeds: vec![embed],
///     wait: true,
///     ..Default::default()
/// }).await?.unwrap();
///
/// println!("Created message: {}", message.id);
/// # Ok(())
/// # }
/// ```
pub async fn execute_webhook(&self, params: WebhookParams) -> DiscordResult<Option<Message>>;
```

---

## 8. Review Checklist

### 8.1 Pre-Implementation Review

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
| All public APIs documented | Doc coverage check |
| Error handling complete | All Result types handled |
| Rate limiting implemented | Integration tests |
| Simulation mode works | Unit tests |
| No secrets in logs | Code review |
| TLS enforced | Configuration check |
| Tests pass | CI pipeline |
| Coverage meets target | Coverage report |

### 8.3 Pre-Merge Checklist

| Item | Required |
|------|----------|
| CI pipeline green | Yes |
| Code reviewed | Yes |
| Documentation updated | Yes |
| CHANGELOG updated | Yes |
| Security review passed | Yes |
| No TODO/FIXME remaining | Yes |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-DISCORD-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*SPARC Phase 4 Complete - Proceed to Completion phase with "Next phase."*
