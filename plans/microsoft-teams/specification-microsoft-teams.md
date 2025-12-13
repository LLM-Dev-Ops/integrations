# Microsoft Teams Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/teams`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements, interfaces, and constraints for the Microsoft Teams Integration Module. It serves as a thin adapter layer enabling the LLM Dev Ops platform to send messages, receive notifications, and interact with Teams workflows while leveraging shared repository infrastructure.

### 1.2 Methodology

- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Microsoft Teams Integration Module provides a production-ready, type-safe interface for Teams operations. It is a **thin adapter layer** that:
- Sends messages to channels and chats via webhooks and Bot Framework
- Receives and processes incoming messages and events
- Routes messages to appropriate channels/chats based on context
- Supports adaptive cards for rich interactive content
- Enables workflow notifications and approvals
- Supports simulation and replay of communication flows
- Leverages existing Azure credential chain from `azure/auth`
- Delegates resilience, observability, and state to shared primitives

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Webhook Messaging** | Send messages via incoming webhooks |
| **Bot Messaging** | Send proactive messages via Bot Framework |
| **Channel Operations** | List, resolve, and target channels |
| **Chat Operations** | List, create, and message 1:1/group chats |
| **Adaptive Cards** | Build and send interactive card messages |
| **Event Handling** | Process incoming bot events and mentions |
| **Message Routing** | Route messages based on team/channel/user context |
| **Notification Delivery** | Deliver alerts with priority and threading |
| **Workflow Integration** | Action buttons, approvals, task modules |
| **Simulation Mode** | Replay and simulate communication flows |
| **Credential Delegation** | Use shared Azure credential chain |
| **Resilience Hooks** | Integrate with shared retry, circuit breaker |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Incoming Webhooks | POST messages to webhook URLs |
| Outgoing Webhooks | Receive and respond to webhook calls |
| Bot Framework API | Proactive messaging, conversation updates |
| Microsoft Graph API | Teams, channels, chats, members |
| Adaptive Cards | Card builder, templates, actions |
| Activity Processing | Message, reaction, conversation events |
| Message Threading | Reply to threads, start new threads |
| @Mentions | Mention users and channels in messages |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Bot Hosting | Use Azure Bot Service or external hosting |
| App Registration | Managed via Azure Portal |
| Tenant Admin Setup | Platform configuration |
| Teams App Manifest | Deployment artifact |
| Meeting Management | Separate meeting integration |
| Calling/Video | Separate media integration |
| Credential Implementation | Use shared `azure/auth` |
| Resilience Implementation | Use shared primitives |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate logic from shared modules |
| Async-first design | Network I/O bound operations |
| Webhook URL protection | Never log webhook URLs |
| Rate limit awareness | Respect Teams throttling |
| Tenant isolation | Support multi-tenant scenarios |
| Shared credential chain | Reuse from azure/auth |

---

## 3. Dependency Policy

### 3.1 Allowed Internal Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| `azure/auth` | Azure AD credential chain | `@integrations/azure-auth` |
| `shared/resilience` | Retry, circuit breaker, rate limiting | `@integrations/resilience` |
| `shared/observability` | Logging, metrics, tracing | `@integrations/observability` |
| `integrations-logging` | Shared logging abstractions | `integrations_logging` |
| `integrations-tracing` | Distributed tracing | `integrations_tracing` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.11+ | HTTP client |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `chrono` | 0.4+ | Timestamp handling |
| `uuid` | 1.x | Message/conversation IDs |
| `secrecy` | 0.8+ | Webhook URL protection |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `undici` | 6.x | HTTP client |
| `botbuilder` | 4.x | Bot Framework SDK (optional) |

---

## 4. API Coverage

### 4.1 Webhook Operations

| Operation | Method | Endpoint | Service |
|-----------|--------|----------|---------|
| Send Webhook Message | POST | Webhook URL | WebhookService |
| Send Card via Webhook | POST | Webhook URL | WebhookService |

### 4.2 Bot Framework Operations

| Operation | Method | Endpoint | Service |
|-----------|--------|----------|---------|
| Send Proactive Message | POST | /v3/conversations/{id}/activities | BotService |
| Reply to Activity | POST | /v3/conversations/{id}/activities/{activityId} | BotService |
| Update Activity | PUT | /v3/conversations/{id}/activities/{activityId} | BotService |
| Delete Activity | DELETE | /v3/conversations/{id}/activities/{activityId} | BotService |
| Create Conversation | POST | /v3/conversations | BotService |
| Get Conversation Members | GET | /v3/conversations/{id}/members | BotService |

### 4.3 Microsoft Graph API Operations

| Operation | Method | Endpoint | Service |
|-----------|--------|----------|---------|
| List Joined Teams | GET | /me/joinedTeams | GraphService |
| List Channels | GET | /teams/{teamId}/channels | GraphService |
| Get Channel | GET | /teams/{teamId}/channels/{channelId} | GraphService |
| List Chats | GET | /me/chats | GraphService |
| Get Chat | GET | /chats/{chatId} | GraphService |
| Send Channel Message | POST | /teams/{teamId}/channels/{channelId}/messages | GraphService |
| Reply to Message | POST | /teams/{teamId}/channels/{channelId}/messages/{messageId}/replies | GraphService |
| Send Chat Message | POST | /chats/{chatId}/messages | GraphService |
| List Chat Members | GET | /chats/{chatId}/members | GraphService |

### 4.4 API Versions

- **Bot Framework**: v3
- **Microsoft Graph**: v1.0
- **Adaptive Cards**: Schema 1.5

---

## 5. Interface Definitions

### 5.1 Client Configuration

```rust
pub struct TeamsConfig {
    pub tenant_id: String,                    // Azure AD tenant
    pub bot_id: Option<String>,               // Bot app ID (for Bot Framework)
    pub bot_secret: Option<SecretString>,     // Bot app secret
    pub default_webhook_url: Option<SecretString>, // Default webhook
    pub service_url: Option<String>,          // Bot Framework service URL
    pub graph_base_url: String,               // Default: https://graph.microsoft.com/v1.0
    pub timeout: Duration,                    // Default: 30 seconds
    pub max_retries: u32,                     // Default: 3
}
```

```typescript
interface TeamsConfig {
  tenantId: string;
  botId?: string;
  botSecret?: string;
  defaultWebhookUrl?: string;
  serviceUrl?: string;
  graphBaseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}
```

### 5.2 WebhookService Interface

```rust
#[async_trait]
pub trait WebhookService: Send + Sync {
    /// Send a simple text message via webhook
    async fn send_message(&self, webhook_url: &SecretString, message: &str) -> Result<WebhookResponse, TeamsError>;

    /// Send a message with title and sections
    async fn send_formatted_message(&self, webhook_url: &SecretString, message: FormattedMessage) -> Result<WebhookResponse, TeamsError>;

    /// Send an adaptive card via webhook
    async fn send_card(&self, webhook_url: &SecretString, card: AdaptiveCard) -> Result<WebhookResponse, TeamsError>;

    /// Send using the default webhook URL
    async fn send_to_default(&self, message: impl Into<WebhookPayload>) -> Result<WebhookResponse, TeamsError>;
}
```

### 5.3 BotService Interface

```rust
#[async_trait]
pub trait BotService: Send + Sync {
    /// Send proactive message to a conversation
    async fn send_proactive_message(&self, conversation: &ConversationReference, activity: Activity) -> Result<ResourceResponse, TeamsError>;

    /// Reply to an existing activity
    async fn reply_to_activity(&self, conversation_id: &str, activity_id: &str, reply: Activity) -> Result<ResourceResponse, TeamsError>;

    /// Update an existing activity
    async fn update_activity(&self, conversation_id: &str, activity_id: &str, activity: Activity) -> Result<ResourceResponse, TeamsError>;

    /// Delete an activity
    async fn delete_activity(&self, conversation_id: &str, activity_id: &str) -> Result<(), TeamsError>;

    /// Create a new conversation (1:1 or group)
    async fn create_conversation(&self, params: CreateConversationParams) -> Result<ConversationReference, TeamsError>;

    /// Get members of a conversation
    async fn get_conversation_members(&self, conversation_id: &str) -> Result<Vec<ChannelAccount>, TeamsError>;

    /// Process incoming activity (for bot handlers)
    async fn process_activity(&self, activity: Activity, handler: &dyn ActivityHandler) -> Result<(), TeamsError>;
}
```

### 5.4 GraphService Interface

```rust
#[async_trait]
pub trait GraphService: Send + Sync {
    // Team operations
    async fn list_joined_teams(&self) -> Result<Vec<Team>, TeamsError>;
    async fn get_team(&self, team_id: &str) -> Result<Team, TeamsError>;

    // Channel operations
    async fn list_channels(&self, team_id: &str) -> Result<Vec<Channel>, TeamsError>;
    async fn get_channel(&self, team_id: &str, channel_id: &str) -> Result<Channel, TeamsError>;

    // Chat operations
    async fn list_chats(&self) -> Result<Vec<Chat>, TeamsError>;
    async fn get_chat(&self, chat_id: &str) -> Result<Chat, TeamsError>;
    async fn create_chat(&self, params: CreateChatParams) -> Result<Chat, TeamsError>;

    // Messaging via Graph
    async fn send_channel_message(&self, team_id: &str, channel_id: &str, message: ChatMessage) -> Result<ChatMessage, TeamsError>;
    async fn reply_to_channel_message(&self, team_id: &str, channel_id: &str, message_id: &str, reply: ChatMessage) -> Result<ChatMessage, TeamsError>;
    async fn send_chat_message(&self, chat_id: &str, message: ChatMessage) -> Result<ChatMessage, TeamsError>;

    // Members
    async fn list_channel_members(&self, team_id: &str, channel_id: &str) -> Result<Vec<ConversationMember>, TeamsError>;
    async fn list_chat_members(&self, chat_id: &str) -> Result<Vec<ConversationMember>, TeamsError>;
}
```

### 5.5 CardBuilder Interface

```rust
pub struct CardBuilder {
    schema: String,
    version: String,
    body: Vec<CardElement>,
    actions: Vec<CardAction>,
}

impl CardBuilder {
    pub fn new() -> Self;

    // Content elements
    pub fn text_block(self, text: &str) -> Self;
    pub fn text_block_styled(self, text: &str, style: TextStyle) -> Self;
    pub fn fact_set(self, facts: Vec<Fact>) -> Self;
    pub fn image(self, url: &str, alt_text: &str) -> Self;
    pub fn column_set(self, columns: Vec<Column>) -> Self;
    pub fn container(self, items: Vec<CardElement>) -> Self;

    // Actions
    pub fn action_open_url(self, title: &str, url: &str) -> Self;
    pub fn action_submit(self, title: &str, data: Value) -> Self;
    pub fn action_show_card(self, title: &str, card: AdaptiveCard) -> Self;
    pub fn action_execute(self, title: &str, verb: &str, data: Value) -> Self;

    // Build
    pub fn build(self) -> AdaptiveCard;
}
```

### 5.6 Core Types

```rust
/// Activity represents a Bot Framework activity
pub struct Activity {
    pub id: Option<String>,
    pub activity_type: ActivityType,
    pub timestamp: Option<DateTime<Utc>>,
    pub service_url: String,
    pub channel_id: String,
    pub from: ChannelAccount,
    pub conversation: ConversationAccount,
    pub recipient: Option<ChannelAccount>,
    pub text: Option<String>,
    pub attachments: Vec<Attachment>,
    pub entities: Vec<Entity>,
    pub channel_data: Option<Value>,
    pub reply_to_id: Option<String>,
    pub value: Option<Value>,
}

pub enum ActivityType {
    Message,
    ContactRelationUpdate,
    ConversationUpdate,
    Typing,
    EndOfConversation,
    Event,
    Invoke,
    InstallationUpdate,
    MessageReaction,
    MessageUpdate,
    MessageDelete,
}

pub struct ConversationReference {
    pub activity_id: Option<String>,
    pub bot: ChannelAccount,
    pub channel_id: String,
    pub conversation: ConversationAccount,
    pub service_url: String,
    pub user: Option<ChannelAccount>,
}

pub struct ChannelAccount {
    pub id: String,
    pub name: Option<String>,
    pub aad_object_id: Option<String>,
    pub role: Option<String>,
}

pub struct ConversationAccount {
    pub id: String,
    pub name: Option<String>,
    pub conversation_type: Option<String>,
    pub is_group: Option<bool>,
    pub tenant_id: Option<String>,
}

pub struct Team {
    pub id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub visibility: TeamVisibility,
}

pub struct Channel {
    pub id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub membership_type: ChannelMembershipType,
}

pub struct Chat {
    pub id: String,
    pub topic: Option<String>,
    pub chat_type: ChatType,
    pub created_date_time: DateTime<Utc>,
}

pub enum ChatType {
    OneOnOne,
    Group,
    Meeting,
}

pub struct ChatMessage {
    pub id: Option<String>,
    pub body: MessageBody,
    pub from: Option<ChatMessageFrom>,
    pub created_date_time: Option<DateTime<Utc>>,
    pub importance: MessageImportance,
    pub mentions: Vec<ChatMessageMention>,
    pub attachments: Vec<ChatMessageAttachment>,
}

pub struct MessageBody {
    pub content: String,
    pub content_type: ContentType,  // Text or Html
}

pub enum MessageImportance {
    Normal,
    High,
    Urgent,
}

pub struct AdaptiveCard {
    pub schema: String,
    pub card_type: String,
    pub version: String,
    pub body: Vec<CardElement>,
    pub actions: Vec<CardAction>,
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```rust
#[derive(Debug, thiserror::Error)]
pub enum TeamsError {
    // Authentication & Authorization
    #[error("Authentication failed: {message}")]
    AuthenticationFailed { message: String },

    #[error("Access denied to {resource}: {message}")]
    AccessDenied { resource: String, message: String },

    #[error("Insufficient permissions: {permission} required")]
    InsufficientPermissions { permission: String },

    // Resource Errors
    #[error("Team not found: {team_id}")]
    TeamNotFound { team_id: String },

    #[error("Channel not found: {channel_id}")]
    ChannelNotFound { channel_id: String },

    #[error("Chat not found: {chat_id}")]
    ChatNotFound { chat_id: String },

    #[error("Conversation not found: {conversation_id}")]
    ConversationNotFound { conversation_id: String },

    #[error("User not found: {user_id}")]
    UserNotFound { user_id: String },

    // Messaging Errors
    #[error("Message delivery failed: {message}")]
    MessageDeliveryFailed { message: String },

    #[error("Invalid webhook URL")]
    InvalidWebhookUrl,

    #[error("Webhook request failed: {status}")]
    WebhookFailed { status: u16 },

    #[error("Card validation failed: {message}")]
    CardValidationFailed { message: String },

    #[error("Message too large: {size} bytes (max {max_size})")]
    MessageTooLarge { size: usize, max_size: usize },

    // Bot Errors
    #[error("Bot not configured")]
    BotNotConfigured,

    #[error("Invalid activity: {message}")]
    InvalidActivity { message: String },

    #[error("Conversation creation failed: {message}")]
    ConversationCreationFailed { message: String },

    // Rate Limiting
    #[error("Rate limited: retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },

    // Server Errors
    #[error("Service unavailable: {message}")]
    ServiceUnavailable { message: String },

    #[error("Internal server error: {message}")]
    InternalError { message: String },

    // Network Errors
    #[error("Connection error: {message}")]
    ConnectionError { message: String },

    #[error("Request timeout after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },
}
```

### 6.2 HTTP Status Code Mapping

| HTTP Status | Error Type |
|-------------|------------|
| 400 | `InvalidActivity` / `CardValidationFailed` |
| 401 | `AuthenticationFailed` |
| 403 | `AccessDenied` / `InsufficientPermissions` |
| 404 | `TeamNotFound` / `ChannelNotFound` / `ChatNotFound` |
| 413 | `MessageTooLarge` |
| 429 | `RateLimited` |
| 500 | `InternalError` |
| 502/503 | `ServiceUnavailable` |

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

| Error Type | Retryable | Strategy |
|------------|-----------|----------|
| `RateLimited` | Yes | Respect `Retry-After` header |
| `ServiceUnavailable` | Yes | Exponential backoff |
| `InternalError` | Yes | Exponential backoff |
| `Timeout` | Yes | Linear retry |
| `ConnectionError` | Yes | Exponential backoff |
| `AuthenticationFailed` | No | Fail fast |
| `AccessDenied` | No | Fail fast |
| `InvalidWebhookUrl` | No | Fail fast |

### 7.2 Circuit Breaker

- **Scope**: Per service URL (Graph, Bot Framework, Webhook)
- **Failure threshold**: 5 failures in 60 seconds
- **Recovery timeout**: 30 seconds
- **Half-open requests**: 1

### 7.3 Rate Limits (Teams)

| Operation | Limit |
|-----------|-------|
| Webhook messages | 4 requests/second per webhook |
| Bot messages (per conversation) | 1 message/second |
| Bot messages (global) | 50 messages/second |
| Graph API | 10,000 requests/10 minutes |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Bot secret | Use `SecretString`, never log |
| Webhook URLs | Use `SecretString`, never log |
| Graph tokens | Delegate to `azure/auth` |
| Token scope | `https://graph.microsoft.com/.default` |

### 8.2 Message Security

| Requirement | Implementation |
|-------------|----------------|
| Content sanitization | Escape HTML in text messages |
| URL validation | Validate action URLs |
| Mention validation | Validate user IDs in mentions |
| Card schema validation | Validate against Adaptive Card schema |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS version | TLS 1.2+ required |
| Certificate validation | Verify Microsoft certificate chain |

---

## 9. Observability Requirements

### 9.1 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `teams_message_sent_total` | Counter | `method`, `destination_type`, `status` |
| `teams_message_duration_ms` | Histogram | `method`, `destination_type` |
| `teams_webhook_requests_total` | Counter | `status` |
| `teams_bot_activities_total` | Counter | `activity_type`, `direction` |
| `teams_graph_requests_total` | Counter | `operation`, `status` |
| `teams_errors_total` | Counter | `error_type` |

### 9.2 Tracing

| Span | Attributes |
|------|------------|
| `teams.send_webhook` | `destination_type`, `has_card` |
| `teams.send_bot_message` | `conversation_id`, `activity_type` |
| `teams.graph_request` | `operation`, `team_id`, `channel_id` |
| `teams.process_activity` | `activity_type`, `from_id` |

### 9.3 Logging

| Level | Event |
|-------|-------|
| DEBUG | Message payload structure (no content) |
| INFO | Message sent, activity processed |
| WARN | Rate limit approaching, retry attempt |
| ERROR | Delivery failed, authentication error |

---

## 10. Message Routing

### 10.1 Routing Configuration

```rust
pub struct RoutingConfig {
    pub rules: Vec<RoutingRule>,
    pub default_destination: Option<Destination>,
    pub fallback_webhook: Option<SecretString>,
}

pub struct RoutingRule {
    pub name: String,
    pub conditions: Vec<RoutingCondition>,
    pub destination: Destination,
    pub priority: i32,
}

pub enum RoutingCondition {
    Tag(String),
    Severity(Severity),
    Source(String),
    Custom(Box<dyn Fn(&Message) -> bool + Send + Sync>),
}

pub enum Destination {
    Channel { team_id: String, channel_id: String },
    Chat { chat_id: String },
    User { user_id: String },
    Webhook { url: SecretString },
}
```

### 10.2 Router Interface

```rust
#[async_trait]
pub trait MessageRouter: Send + Sync {
    /// Route a message based on configured rules
    async fn route(&self, message: &RoutableMessage) -> Result<Vec<DeliveryResult>, TeamsError>;

    /// Add a routing rule
    fn add_rule(&mut self, rule: RoutingRule);

    /// Remove a routing rule by name
    fn remove_rule(&mut self, name: &str) -> Option<RoutingRule>;

    /// Get current routing rules
    fn get_rules(&self) -> &[RoutingRule];
}
```

---

## 11. Testing and Simulation

### 11.1 Simulation Mode

```rust
pub struct MockTeamsClient {
    sent_messages: Vec<SentMessage>,
    channels: HashMap<String, Vec<Channel>>,
    chats: HashMap<String, Chat>,
    webhook_responses: HashMap<String, WebhookResponse>,
}

impl MockTeamsClient {
    /// Register a mock channel
    pub fn register_channel(&mut self, team_id: &str, channel: Channel);

    /// Register a mock chat
    pub fn register_chat(&mut self, chat: Chat);

    /// Configure webhook response
    pub fn set_webhook_response(&mut self, url_pattern: &str, response: WebhookResponse);

    /// Get all sent messages
    pub fn get_sent_messages(&self) -> &[SentMessage];

    /// Replay recorded message flow
    pub fn replay(&self, flow: &[SentMessage]) -> ReplayResult;

    /// Simulate incoming activity
    pub fn simulate_incoming(&self, activity: Activity) -> Result<(), TeamsError>;
}

pub struct SentMessage {
    pub timestamp: DateTime<Utc>,
    pub destination: Destination,
    pub content: MessageContent,
    pub result: DeliveryResult,
}
```

### 11.2 Test Fixtures

| Fixture | Purpose |
|---------|---------|
| `incoming_message.json` | Sample incoming activity |
| `channel_list.json` | Graph channels response |
| `chat_message.json` | Chat message response |
| `adaptive_card.json` | Sample adaptive card |
| `webhook_success.json` | Successful webhook response |
| `error_rate_limited.json` | 429 error response |

---

## 12. Acceptance Criteria

### 12.1 Functional Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| F1 | Send text message via webhook | Unit + Integration test |
| F2 | Send adaptive card via webhook | Unit + Integration test |
| F3 | Send proactive bot message | Unit + Integration test |
| F4 | Reply to message thread | Unit + Integration test |
| F5 | List teams and channels | Unit + Integration test |
| F6 | Send message to channel via Graph | Unit + Integration test |
| F7 | Create 1:1 chat conversation | Unit + Integration test |
| F8 | Route message based on rules | Unit test |
| F9 | Process incoming bot activity | Unit + Integration test |
| F10 | Build and validate adaptive cards | Unit test |

### 12.2 Non-Functional Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| NF1 | P99 latency for webhook < 500ms | Benchmark |
| NF2 | Webhook URLs never in logs | Log audit |
| NF3 | Respect rate limits | Integration test |
| NF4 | Circuit breaker activates correctly | Unit test |
| NF5 | Metrics emitted for all operations | Integration test |

### 12.3 Security Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| S1 | TLS 1.2+ for all connections | TLS audit |
| S2 | Bot secret protected by SecretString | Code review |
| S3 | Webhook URLs protected by SecretString | Code review |
| S4 | Input sanitization for messages | Unit test |

---

## 13. Service Summary

| Service | Operations | Primary Use Case |
|---------|------------|------------------|
| **WebhookService** | 4 operations | Simple notifications via webhooks |
| **BotService** | 6 operations | Interactive bot messaging |
| **GraphService** | 11 operations | Teams/channel/chat management |
| **CardBuilder** | Builder API | Rich adaptive card creation |
| **MessageRouter** | 4 operations | Context-based message routing |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-microsoft-teams.md | Complete |
| 2. Pseudocode | pseudocode-microsoft-teams.md | Pending |
| 3. Architecture | architecture-microsoft-teams.md | Pending |
| 4. Refinement | refinement-microsoft-teams.md | Pending |
| 5. Completion | completion-microsoft-teams.md | Pending |

---

*Phase 1: Specification - Complete*
