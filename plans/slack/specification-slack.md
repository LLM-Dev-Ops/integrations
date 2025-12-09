# Slack Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/slack`
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Purpose](#2-module-purpose)
3. [Responsibilities](#3-responsibilities)
4. [Boundaries](#4-boundaries)
5. [Interface Surface](#5-interface-surface)
   - 5.1 [Rust Interface](#51-rust-interface)
   - 5.2 [TypeScript Interface](#52-typescript-interface)
6. [API Coverage](#6-api-coverage)
   - 6.1 [Web API - Conversations](#61-web-api---conversations)
   - 6.2 [Web API - Messages](#62-web-api---messages)
   - 6.3 [Web API - Users](#63-web-api---users)
   - 6.4 [Web API - Channels](#64-web-api---channels)
   - 6.5 [Web API - Files](#65-web-api---files)
   - 6.6 [Web API - Reactions](#66-web-api---reactions)
   - 6.7 [Web API - Pins](#67-web-api---pins)
   - 6.8 [Web API - Bookmarks](#68-web-api---bookmarks)
   - 6.9 [Web API - Teams](#69-web-api---teams)
   - 6.10 [Web API - Apps](#610-web-api---apps)
   - 6.11 [Web API - OAuth](#611-web-api---oauth)
   - 6.12 [Web API - Views](#612-web-api---views)
   - 6.13 [Events API](#613-events-api)
   - 6.14 [Socket Mode](#614-socket-mode)
   - 6.15 [Webhooks](#615-webhooks)
7. [Dependency Policy](#7-dependency-policy)
8. [Error Taxonomy](#8-error-taxonomy)
9. [Phase-3-Ready Hooks](#9-phase-3-ready-hooks)
   - 9.1 [Retry Policy](#91-retry-policy)
   - 9.2 [Rate Limiting](#92-rate-limiting)
   - 9.3 [Circuit Breaker](#93-circuit-breaker)
10. [Security Handling](#10-security-handling)
11. [Telemetry Requirements](#11-telemetry-requirements)
12. [Future-Proofing Rules](#12-future-proofing-rules)
13. [London-School TDD Principles](#13-london-school-tdd-principles)
14. [Glossary](#14-glossary)

---

## 1. Executive Summary

The Slack Integration Module provides a unified, type-safe interface for interacting with Slack's platform APIs within the LLM-Dev-Ops Integration Repository. This module is designed as a standalone component that depends exclusively on shared Integration Repo primitives (errors, retry, circuit-breaker, rate-limits, tracing, logging, types, and config) and does **not** implement or depend on ruvbase (Layer 0).

The module exposes dual interfaces in **Rust** and **TypeScript**, enabling seamless integration across polyglot environments. It adheres to London-School TDD principles, emphasizing interface-first design, mock-based testing, and clear dependency boundaries.

### Key Design Principles

1. **Single Responsibility**: Handle Slack API interactions only
2. **Interface Segregation**: Separate interfaces per API domain (Conversations, Messages, Users, etc.)
3. **Dependency Inversion**: Depend on abstractions, not concretions
4. **Explicit Boundaries**: Clear separation from other integration modules
5. **Fail-Fast with Recovery**: Graceful degradation with circuit breakers
6. **Real-Time Support**: Socket Mode and Events API for real-time interactions

---

## 2. Module Purpose

### Primary Purpose

Provide a production-ready, resilient client for Slack's Web API, Events API, Socket Mode, and Webhooks that:

- Abstracts HTTP/WebSocket complexity behind strongly-typed interfaces
- Handles authentication, token management, and credential rotation
- Implements real-time event handling via Socket Mode
- Provides unified error handling with semantic error types
- Supports both synchronous and asynchronous execution models
- Enables comprehensive observability through structured logging and tracing

### Secondary Purpose

- Serve as a reference implementation for other messaging platform integrations
- Provide extension points for custom middleware and interceptors
- Enable offline testing through mockable interfaces
- Support multi-workspace deployments with token isolation
- Enable bot and user token workflows

### Non-Goals

- This module does NOT provide:
  - Message templating utilities (handled by higher layers)
  - Response caching (handled by caching layer)
  - Billing/usage tracking (handled by observability layer)
  - Workspace selection logic (handled by routing layer)
  - Cross-platform abstraction (each platform has its own module)
  - Slack CLI commands or slash command hosting
  - Block Kit builder utilities (type definitions only)

---

## 3. Responsibilities

### 3.1 Core Responsibilities

| Responsibility | Description |
|---------------|-------------|
| **API Communication** | HTTP/HTTPS requests to Slack Web API endpoints |
| **Authentication** | Bot token, User token, and App-level token management |
| **Request Building** | Type-safe request construction and validation |
| **Response Parsing** | Deserialization with schema validation |
| **Real-Time Events** | Socket Mode WebSocket connection management |
| **Event Handling** | Events API payload parsing and acknowledgment |
| **Error Translation** | Map API errors to semantic error types |
| **Timeout Management** | Per-request and per-operation timeouts |
| **Webhook Handling** | Incoming webhook signature verification |

### 3.2 Delegated Responsibilities

| Responsibility | Delegated To |
|---------------|--------------|
| **Retry Logic** | `@integrations/retry` primitive |
| **Rate Limiting** | `@integrations/rate-limits` primitive |
| **Circuit Breaking** | `@integrations/circuit-breaker` primitive |
| **Structured Logging** | `@integrations/logging` primitive |
| **Distributed Tracing** | `@integrations/tracing` primitive |
| **Configuration** | `@integrations/config` primitive |
| **Error Base Types** | `@integrations/errors` primitive |
| **Common Types** | `@integrations/types` primitive |

### 3.3 Explicitly Excluded

- **NOT** responsible for: message templates, response caching, workspace routing, usage analytics aggregation, cross-platform fallback, Block Kit visual builder

---

## 4. Boundaries

### 4.1 Module Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Application Layer (Consumer)                      │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Slack Integration Module                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Public Interface                           │   │
│  │  • SlackClient (Rust/TS)                                     │   │
│  │  • ConversationsService                                       │   │
│  │  • MessagesService                                            │   │
│  │  • UsersService                                               │   │
│  │  • FilesService                                               │   │
│  │  • ReactionsService                                           │   │
│  │  • EventsHandler                                              │   │
│  │  • SocketModeClient                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 Internal Implementation                       │   │
│  │  • HttpTransport                                              │   │
│  │  • WebSocketTransport                                         │   │
│  │  • RequestBuilder                                             │   │
│  │  • ResponseParser                                             │   │
│  │  • EventDispatcher                                            │   │
│  │  • AuthManager                                                │   │
│  │  • SignatureVerifier                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Integration Repo Primitives                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐ ┌──────────────────┐   │
│  │ errors  │ │  retry  │ │ circuit-breaker │ │   rate-limits    │   │
│  └─────────┘ └─────────┘ └─────────────────┘ └──────────────────┘   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐                   │
│  │ tracing │ │ logging │ │  types  │ │  config  │                   │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Slack Platform                               │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐           │
│  │    Web API     │ │  Events API    │ │  Socket Mode   │           │
│  │ api.slack.com  │ │   (Webhooks)   │ │  (WebSocket)   │           │
│  └────────────────┘ └────────────────┘ └────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dependency Rules

| Rule | Description |
|------|-------------|
| **MUST depend on** | Integration Repo primitives only |
| **MUST NOT depend on** | Other integration modules (OpenAI, GitHub, etc.) |
| **MUST NOT depend on** | ruvbase (Layer 0) |
| **MUST NOT depend on** | Application-specific code |
| **MAY depend on** | Standard library (std in Rust, native TS libs) |
| **MAY depend on** | Approved third-party crates/packages (listed in §7) |

### 4.3 Inter-Module Isolation

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  slack module   │     │  openai module  │     │  github module  │
│                 │     │                 │     │                 │
│  NO DIRECT      │◄───►│   NO DIRECT     │◄───►│   NO DIRECT     │
│  DEPENDENCIES   │     │   DEPENDENCIES  │     │   DEPENDENCIES  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Shared Primitives     │
                    │  (errors, retry, etc.) │
                    └────────────────────────┘
```

---

## 5. Interface Surface

### 5.1 Rust Interface

#### 5.1.1 Client Configuration

```rust
/// Configuration for the Slack client
pub struct SlackConfig {
    /// Bot token for authentication (xoxb-*)
    pub bot_token: Option<SecretString>,

    /// User token for user-level operations (xoxp-*)
    pub user_token: Option<SecretString>,

    /// App-level token for Socket Mode (xapp-*)
    pub app_token: Option<SecretString>,

    /// Signing secret for webhook verification
    pub signing_secret: Option<SecretString>,

    /// Client ID for OAuth flows
    pub client_id: Option<String>,

    /// Client secret for OAuth flows
    pub client_secret: Option<SecretString>,

    /// Base URL override (default: https://slack.com/api)
    pub base_url: Option<Url>,

    /// Default timeout for requests
    pub timeout: Duration,

    /// Maximum retries (delegated to retry primitive)
    pub max_retries: u32,

    /// Custom headers to include in all requests
    pub default_headers: HeaderMap,

    /// Socket Mode configuration
    pub socket_mode: Option<SocketModeConfig>,
}

impl Default for SlackConfig {
    fn default() -> Self {
        Self {
            bot_token: None,
            user_token: None,
            app_token: None,
            signing_secret: None,
            client_id: None,
            client_secret: None,
            base_url: None,
            timeout: Duration::from_secs(30),
            max_retries: 3,
            default_headers: HeaderMap::new(),
            socket_mode: None,
        }
    }
}

/// Socket Mode configuration
pub struct SocketModeConfig {
    /// Enable Socket Mode
    pub enabled: bool,

    /// Reconnection settings
    pub reconnect: ReconnectConfig,

    /// Ping interval
    pub ping_interval: Duration,

    /// Connection timeout
    pub connect_timeout: Duration,
}
```

#### 5.1.2 Main Client Trait

```rust
/// Primary interface for Slack API interactions
#[async_trait]
pub trait SlackClient: Send + Sync {
    /// Access conversations operations
    fn conversations(&self) -> &dyn ConversationsService;

    /// Access messages operations
    fn messages(&self) -> &dyn MessagesService;

    /// Access users operations
    fn users(&self) -> &dyn UsersService;

    /// Access channels operations (legacy, maps to conversations)
    fn channels(&self) -> &dyn ChannelsService;

    /// Access files operations
    fn files(&self) -> &dyn FilesService;

    /// Access reactions operations
    fn reactions(&self) -> &dyn ReactionsService;

    /// Access pins operations
    fn pins(&self) -> &dyn PinsService;

    /// Access bookmarks operations
    fn bookmarks(&self) -> &dyn BookmarksService;

    /// Access team operations
    fn team(&self) -> &dyn TeamService;

    /// Access apps operations
    fn apps(&self) -> &dyn AppsService;

    /// Access oauth operations
    fn oauth(&self) -> &dyn OAuthService;

    /// Access views operations (modals, home tabs)
    fn views(&self) -> &dyn ViewsService;

    /// Access reminders operations
    fn reminders(&self) -> &dyn RemindersService;

    /// Access search operations
    fn search(&self) -> &dyn SearchService;

    /// Access stars operations
    fn stars(&self) -> &dyn StarsService;

    /// Access usergroups operations
    fn usergroups(&self) -> &dyn UsergroupsService;

    /// Access admin operations (Enterprise Grid)
    fn admin(&self) -> &dyn AdminService;

    /// Test API connectivity
    async fn test(&self) -> Result<ApiTestResponse, SlackError>;

    /// Get authentication test info
    async fn auth_test(&self) -> Result<AuthTestResponse, SlackError>;
}

/// Factory for creating Slack clients
pub trait SlackClientFactory {
    /// Create a new client with the given configuration
    fn create(config: SlackConfig) -> Result<Box<dyn SlackClient>, SlackError>;

    /// Create a client from environment variables
    fn from_env() -> Result<Box<dyn SlackClient>, SlackError>;
}
```

#### 5.1.3 Conversations Service Interface

```rust
/// Conversations service interface
#[async_trait]
pub trait ConversationsService: Send + Sync {
    /// Archive a conversation
    async fn archive(
        &self,
        channel: &str,
    ) -> Result<(), SlackError>;

    /// Close a direct message or multi-person direct message
    async fn close(
        &self,
        channel: &str,
    ) -> Result<(), SlackError>;

    /// Create a public or private channel
    async fn create(
        &self,
        request: CreateConversationRequest,
    ) -> Result<Conversation, SlackError>;

    /// Fetch conversation history
    async fn history(
        &self,
        request: ConversationHistoryRequest,
    ) -> Result<ConversationHistory, SlackError>;

    /// Get information about a conversation
    async fn info(
        &self,
        channel: &str,
        include_locale: Option<bool>,
        include_num_members: Option<bool>,
    ) -> Result<Conversation, SlackError>;

    /// Invite users to a conversation
    async fn invite(
        &self,
        channel: &str,
        users: &[String],
    ) -> Result<Conversation, SlackError>;

    /// Join an existing conversation
    async fn join(
        &self,
        channel: &str,
    ) -> Result<JoinConversationResponse, SlackError>;

    /// Remove a user from a conversation
    async fn kick(
        &self,
        channel: &str,
        user: &str,
    ) -> Result<(), SlackError>;

    /// Leave a conversation
    async fn leave(
        &self,
        channel: &str,
    ) -> Result<(), SlackError>;

    /// List all channels
    async fn list(
        &self,
        request: ListConversationsRequest,
    ) -> Result<ConversationList, SlackError>;

    /// Get conversation members
    async fn members(
        &self,
        channel: &str,
        cursor: Option<&str>,
        limit: Option<u32>,
    ) -> Result<ConversationMembers, SlackError>;

    /// Open or resume a direct message
    async fn open(
        &self,
        request: OpenConversationRequest,
    ) -> Result<OpenConversationResponse, SlackError>;

    /// Rename a conversation
    async fn rename(
        &self,
        channel: &str,
        name: &str,
    ) -> Result<Conversation, SlackError>;

    /// Retrieve thread replies
    async fn replies(
        &self,
        request: ConversationRepliesRequest,
    ) -> Result<ConversationReplies, SlackError>;

    /// Set the purpose of a conversation
    async fn set_purpose(
        &self,
        channel: &str,
        purpose: &str,
    ) -> Result<SetPurposeResponse, SlackError>;

    /// Set the topic of a conversation
    async fn set_topic(
        &self,
        channel: &str,
        topic: &str,
    ) -> Result<SetTopicResponse, SlackError>;

    /// Unarchive a conversation
    async fn unarchive(
        &self,
        channel: &str,
    ) -> Result<(), SlackError>;

    /// Mark a conversation as read
    async fn mark(
        &self,
        channel: &str,
        ts: &str,
    ) -> Result<(), SlackError>;
}
```

#### 5.1.4 Messages Service Interface

```rust
/// Messages service interface
#[async_trait]
pub trait MessagesService: Send + Sync {
    /// Post a message to a channel
    async fn post(
        &self,
        request: PostMessageRequest,
    ) -> Result<PostMessageResponse, SlackError>;

    /// Update an existing message
    async fn update(
        &self,
        request: UpdateMessageRequest,
    ) -> Result<UpdateMessageResponse, SlackError>;

    /// Delete a message
    async fn delete(
        &self,
        channel: &str,
        ts: &str,
    ) -> Result<DeleteMessageResponse, SlackError>;

    /// Schedule a message
    async fn schedule(
        &self,
        request: ScheduleMessageRequest,
    ) -> Result<ScheduleMessageResponse, SlackError>;

    /// Delete a scheduled message
    async fn delete_scheduled(
        &self,
        channel: &str,
        scheduled_message_id: &str,
    ) -> Result<(), SlackError>;

    /// List scheduled messages
    async fn list_scheduled(
        &self,
        request: ListScheduledMessagesRequest,
    ) -> Result<ScheduledMessageList, SlackError>;

    /// Get permalink for a message
    async fn get_permalink(
        &self,
        channel: &str,
        message_ts: &str,
    ) -> Result<String, SlackError>;

    /// Share a message to a channel
    async fn share(
        &self,
        request: ShareMessageRequest,
    ) -> Result<ShareMessageResponse, SlackError>;

    /// Send an ephemeral message
    async fn post_ephemeral(
        &self,
        request: PostEphemeralRequest,
    ) -> Result<PostEphemeralResponse, SlackError>;

    /// Unfurl URLs in a message
    async fn unfurl(
        &self,
        request: UnfurlRequest,
    ) -> Result<(), SlackError>;

    /// Send a message using a response URL (from interactions)
    async fn respond(
        &self,
        response_url: &str,
        request: ResponseMessageRequest,
    ) -> Result<(), SlackError>;
}
```

#### 5.1.5 Users Service Interface

```rust
/// Users service interface
#[async_trait]
pub trait UsersService: Send + Sync {
    /// Get user info
    async fn info(
        &self,
        user: &str,
        include_locale: Option<bool>,
    ) -> Result<User, SlackError>;

    /// List all users
    async fn list(
        &self,
        request: ListUsersRequest,
    ) -> Result<UserList, SlackError>;

    /// Get user's presence
    async fn get_presence(
        &self,
        user: &str,
    ) -> Result<UserPresence, SlackError>;

    /// Set user's presence
    async fn set_presence(
        &self,
        presence: Presence,
    ) -> Result<(), SlackError>;

    /// Get user profile
    async fn profile_get(
        &self,
        user: Option<&str>,
        include_labels: Option<bool>,
    ) -> Result<UserProfile, SlackError>;

    /// Set user profile
    async fn profile_set(
        &self,
        request: SetProfileRequest,
    ) -> Result<UserProfile, SlackError>;

    /// Look up users by email
    async fn lookup_by_email(
        &self,
        email: &str,
    ) -> Result<User, SlackError>;

    /// Get user's conversations
    async fn conversations(
        &self,
        request: UserConversationsRequest,
    ) -> Result<UserConversationsList, SlackError>;

    /// Get user identity (OAuth)
    async fn identity(
        &self,
    ) -> Result<UserIdentity, SlackError>;

    /// Set user's photo
    async fn set_photo(
        &self,
        image: &[u8],
        crop_params: Option<CropParams>,
    ) -> Result<(), SlackError>;

    /// Delete user's photo
    async fn delete_photo(
        &self,
    ) -> Result<(), SlackError>;
}
```

#### 5.1.6 Files Service Interface

```rust
/// Files service interface
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Upload a file
    async fn upload(
        &self,
        request: FileUploadRequest,
    ) -> Result<File, SlackError>;

    /// Upload a file using v2 API (recommended)
    async fn upload_v2(
        &self,
        request: FileUploadV2Request,
    ) -> Result<FileUploadV2Response, SlackError>;

    /// Get file info
    async fn info(
        &self,
        file: &str,
        count: Option<u32>,
        page: Option<u32>,
    ) -> Result<FileInfo, SlackError>;

    /// List files
    async fn list(
        &self,
        request: ListFilesRequest,
    ) -> Result<FileList, SlackError>;

    /// Delete a file
    async fn delete(
        &self,
        file: &str,
    ) -> Result<(), SlackError>;

    /// Share a file to a channel
    async fn share_public_url(
        &self,
        file: &str,
    ) -> Result<SharedPublicUrl, SlackError>;

    /// Revoke public sharing for a file
    async fn revoke_public_url(
        &self,
        file: &str,
    ) -> Result<File, SlackError>;

    /// Complete an upload started with upload_v2
    async fn complete_upload_external(
        &self,
        files: &[FileComplete],
        channel_id: Option<&str>,
        initial_comment: Option<&str>,
        thread_ts: Option<&str>,
    ) -> Result<Vec<File>, SlackError>;

    /// Get an upload URL for external file
    async fn get_upload_url_external(
        &self,
        filename: &str,
        length: u64,
        alt_txt: Option<&str>,
        snippet_type: Option<&str>,
    ) -> Result<ExternalUploadUrl, SlackError>;

    /// Remote files operations
    fn remote(&self) -> &dyn RemoteFilesService;
}

/// Remote files service interface
#[async_trait]
pub trait RemoteFilesService: Send + Sync {
    /// Add a remote file
    async fn add(
        &self,
        request: AddRemoteFileRequest,
    ) -> Result<RemoteFile, SlackError>;

    /// Get remote file info
    async fn info(
        &self,
        external_id: Option<&str>,
        file: Option<&str>,
    ) -> Result<RemoteFile, SlackError>;

    /// List remote files
    async fn list(
        &self,
        request: ListRemoteFilesRequest,
    ) -> Result<RemoteFileList, SlackError>;

    /// Remove a remote file
    async fn remove(
        &self,
        external_id: Option<&str>,
        file: Option<&str>,
    ) -> Result<(), SlackError>;

    /// Share a remote file
    async fn share(
        &self,
        channels: &[String],
        external_id: Option<&str>,
        file: Option<&str>,
    ) -> Result<RemoteFile, SlackError>;

    /// Update a remote file
    async fn update(
        &self,
        request: UpdateRemoteFileRequest,
    ) -> Result<RemoteFile, SlackError>;
}
```

#### 5.1.7 Reactions Service Interface

```rust
/// Reactions service interface
#[async_trait]
pub trait ReactionsService: Send + Sync {
    /// Add a reaction to an item
    async fn add(
        &self,
        channel: &str,
        timestamp: &str,
        name: &str,
    ) -> Result<(), SlackError>;

    /// Get reactions for an item
    async fn get(
        &self,
        request: GetReactionsRequest,
    ) -> Result<ReactionItem, SlackError>;

    /// List reactions by user
    async fn list(
        &self,
        request: ListReactionsRequest,
    ) -> Result<ReactionList, SlackError>;

    /// Remove a reaction
    async fn remove(
        &self,
        channel: &str,
        timestamp: &str,
        name: &str,
    ) -> Result<(), SlackError>;
}
```

#### 5.1.8 Views Service Interface

```rust
/// Views service interface (modals, home tabs)
#[async_trait]
pub trait ViewsService: Send + Sync {
    /// Open a modal view
    async fn open(
        &self,
        trigger_id: &str,
        view: View,
    ) -> Result<ViewResponse, SlackError>;

    /// Push a new view onto the stack
    async fn push(
        &self,
        trigger_id: &str,
        view: View,
    ) -> Result<ViewResponse, SlackError>;

    /// Update an existing view
    async fn update(
        &self,
        request: UpdateViewRequest,
    ) -> Result<ViewResponse, SlackError>;

    /// Publish a view to a user's Home tab
    async fn publish(
        &self,
        user_id: &str,
        view: View,
        hash: Option<&str>,
    ) -> Result<ViewResponse, SlackError>;
}
```

#### 5.1.9 Socket Mode Interface

```rust
/// Socket Mode client for real-time events
#[async_trait]
pub trait SocketModeClient: Send + Sync {
    /// Connect to Socket Mode
    async fn connect(&self) -> Result<(), SlackError>;

    /// Disconnect from Socket Mode
    async fn disconnect(&self) -> Result<(), SlackError>;

    /// Check if connected
    fn is_connected(&self) -> bool;

    /// Send an acknowledgment for an envelope
    async fn acknowledge(
        &self,
        envelope_id: &str,
        payload: Option<AckPayload>,
    ) -> Result<(), SlackError>;

    /// Register an event handler
    fn on_event<F>(&self, handler: F)
    where
        F: Fn(SocketModeEvent) + Send + Sync + 'static;

    /// Register an interaction handler
    fn on_interaction<F>(&self, handler: F)
    where
        F: Fn(InteractionPayload) + Send + Sync + 'static;

    /// Register a slash command handler
    fn on_slash_command<F>(&self, handler: F)
    where
        F: Fn(SlashCommandPayload) + Send + Sync + 'static;

    /// Register a view submission handler
    fn on_view_submission<F>(&self, handler: F)
    where
        F: Fn(ViewSubmissionPayload) + Send + Sync + 'static;

    /// Get event stream
    fn events(&self) -> impl Stream<Item = SocketModeEvent>;
}

/// Socket Mode event types
pub enum SocketModeEvent {
    /// Events API event
    EventsApi(EventsApiEnvelope),

    /// Interactive component
    Interactive(InteractiveEnvelope),

    /// Slash command
    SlashCommand(SlashCommandEnvelope),

    /// Hello event (connection established)
    Hello(HelloPayload),

    /// Disconnect event
    Disconnect(DisconnectPayload),
}
```

#### 5.1.10 Events Handler Interface

```rust
/// Events API handler for webhook-based events
pub trait EventsHandler: Send + Sync {
    /// Verify the request signature
    fn verify_signature(
        &self,
        body: &[u8],
        timestamp: &str,
        signature: &str,
    ) -> Result<bool, SlackError>;

    /// Parse an event payload
    fn parse_event(
        &self,
        body: &[u8],
    ) -> Result<EventPayload, SlackError>;

    /// Handle URL verification challenge
    fn handle_url_verification(
        &self,
        challenge: &str,
    ) -> String;
}

/// Event payload types
pub enum EventPayload {
    /// URL verification challenge
    UrlVerification { challenge: String },

    /// Event callback
    EventCallback(EventCallback),

    /// App rate limited
    AppRateLimited(AppRateLimited),
}

/// Event callback containing the actual event
pub struct EventCallback {
    pub token: String,
    pub team_id: String,
    pub api_app_id: String,
    pub event: Event,
    pub event_id: String,
    pub event_time: i64,
    pub authorizations: Option<Vec<Authorization>>,
    pub is_ext_shared_channel: Option<bool>,
    pub event_context: Option<String>,
}
```

#### 5.1.11 Webhook Types

```rust
/// Incoming webhook client
#[async_trait]
pub trait IncomingWebhook: Send + Sync {
    /// Send a message via incoming webhook
    async fn send(
        &self,
        webhook_url: &str,
        message: WebhookMessage,
    ) -> Result<(), SlackError>;
}

/// Webhook message structure
pub struct WebhookMessage {
    /// Message text
    pub text: Option<String>,

    /// Blocks for rich formatting
    pub blocks: Option<Vec<Block>>,

    /// Attachments (legacy)
    pub attachments: Option<Vec<Attachment>>,

    /// Username override
    pub username: Option<String>,

    /// Icon emoji override
    pub icon_emoji: Option<String>,

    /// Icon URL override
    pub icon_url: Option<String>,

    /// Channel override (if enabled)
    pub channel: Option<String>,

    /// Thread timestamp for replies
    pub thread_ts: Option<String>,

    /// Whether to unfurl links
    pub unfurl_links: Option<bool>,

    /// Whether to unfurl media
    pub unfurl_media: Option<bool>,
}
```

### 5.2 TypeScript Interface

#### 5.2.1 Client Configuration

```typescript
/**
 * Configuration options for the Slack client
 */
export interface SlackConfig {
  /** Bot token for authentication (xoxb-*) */
  botToken?: string;

  /** User token for user-level operations (xoxp-*) */
  userToken?: string;

  /** App-level token for Socket Mode (xapp-*) */
  appToken?: string;

  /** Signing secret for webhook verification */
  signingSecret?: string;

  /** Client ID for OAuth flows */
  clientId?: string;

  /** Client secret for OAuth flows */
  clientSecret?: string;

  /** Base URL override (default: https://slack.com/api) */
  baseUrl?: string;

  /** Default timeout for requests in milliseconds */
  timeout?: number;

  /** Maximum retries (delegated to retry primitive) */
  maxRetries?: number;

  /** Custom headers to include in all requests */
  defaultHeaders?: Record<string, string>;

  /** Socket Mode configuration */
  socketMode?: SocketModeConfig;

  /** Custom fetch implementation for testing */
  fetch?: typeof fetch;
}

/**
 * Socket Mode configuration
 */
export interface SocketModeConfig {
  /** Enable Socket Mode */
  enabled: boolean;

  /** Reconnection settings */
  reconnect?: ReconnectConfig;

  /** Ping interval in milliseconds */
  pingInterval?: number;

  /** Connection timeout in milliseconds */
  connectTimeout?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<SlackConfig, 'botToken' | 'userToken' | 'appToken' | 'signingSecret' | 'clientId' | 'clientSecret' | 'fetch' | 'socketMode'>> = {
  baseUrl: 'https://slack.com/api',
  timeout: 30000,
  maxRetries: 3,
  defaultHeaders: {},
};
```

#### 5.2.2 Main Client Interface

```typescript
/**
 * Primary interface for Slack API interactions
 */
export interface SlackClient {
  /** Access conversations operations */
  readonly conversations: ConversationsService;

  /** Access messages operations */
  readonly messages: MessagesService;

  /** Access users operations */
  readonly users: UsersService;

  /** Access channels operations */
  readonly channels: ChannelsService;

  /** Access files operations */
  readonly files: FilesService;

  /** Access reactions operations */
  readonly reactions: ReactionsService;

  /** Access pins operations */
  readonly pins: PinsService;

  /** Access bookmarks operations */
  readonly bookmarks: BookmarksService;

  /** Access team operations */
  readonly team: TeamService;

  /** Access apps operations */
  readonly apps: AppsService;

  /** Access oauth operations */
  readonly oauth: OAuthService;

  /** Access views operations */
  readonly views: ViewsService;

  /** Access reminders operations */
  readonly reminders: RemindersService;

  /** Access search operations */
  readonly search: SearchService;

  /** Access stars operations */
  readonly stars: StarsService;

  /** Access usergroups operations */
  readonly usergroups: UsergroupsService;

  /** Access admin operations */
  readonly admin: AdminService;

  /** Test API connectivity */
  test(): Promise<ApiTestResponse>;

  /** Get authentication test info */
  authTest(): Promise<AuthTestResponse>;
}

/**
 * Factory function for creating Slack clients
 */
export function createSlackClient(config: SlackConfig): SlackClient;

/**
 * Create a client from environment variables
 * Reads SLACK_BOT_TOKEN, SLACK_USER_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET
 */
export function createSlackClientFromEnv(): SlackClient;
```

#### 5.2.3 Service Interfaces

```typescript
/**
 * Conversations service interface
 */
export interface ConversationsService {
  archive(channel: string): Promise<void>;
  close(channel: string): Promise<void>;
  create(request: CreateConversationRequest): Promise<Conversation>;
  history(request: ConversationHistoryRequest): Promise<ConversationHistory>;
  info(channel: string, options?: ConversationInfoOptions): Promise<Conversation>;
  invite(channel: string, users: string[]): Promise<Conversation>;
  join(channel: string): Promise<JoinConversationResponse>;
  kick(channel: string, user: string): Promise<void>;
  leave(channel: string): Promise<void>;
  list(request?: ListConversationsRequest): Promise<ConversationList>;
  members(channel: string, options?: PaginationOptions): Promise<ConversationMembers>;
  open(request: OpenConversationRequest): Promise<OpenConversationResponse>;
  rename(channel: string, name: string): Promise<Conversation>;
  replies(request: ConversationRepliesRequest): Promise<ConversationReplies>;
  setPurpose(channel: string, purpose: string): Promise<SetPurposeResponse>;
  setTopic(channel: string, topic: string): Promise<SetTopicResponse>;
  unarchive(channel: string): Promise<void>;
  mark(channel: string, ts: string): Promise<void>;
}

/**
 * Messages service interface
 */
export interface MessagesService {
  post(request: PostMessageRequest): Promise<PostMessageResponse>;
  update(request: UpdateMessageRequest): Promise<UpdateMessageResponse>;
  delete(channel: string, ts: string): Promise<DeleteMessageResponse>;
  schedule(request: ScheduleMessageRequest): Promise<ScheduleMessageResponse>;
  deleteScheduled(channel: string, scheduledMessageId: string): Promise<void>;
  listScheduled(request?: ListScheduledMessagesRequest): Promise<ScheduledMessageList>;
  getPermalink(channel: string, messageTs: string): Promise<string>;
  share(request: ShareMessageRequest): Promise<ShareMessageResponse>;
  postEphemeral(request: PostEphemeralRequest): Promise<PostEphemeralResponse>;
  unfurl(request: UnfurlRequest): Promise<void>;
  respond(responseUrl: string, request: ResponseMessageRequest): Promise<void>;
}

/**
 * Users service interface
 */
export interface UsersService {
  info(user: string, options?: UserInfoOptions): Promise<User>;
  list(request?: ListUsersRequest): Promise<UserList>;
  getPresence(user: string): Promise<UserPresence>;
  setPresence(presence: Presence): Promise<void>;
  profileGet(options?: ProfileGetOptions): Promise<UserProfile>;
  profileSet(request: SetProfileRequest): Promise<UserProfile>;
  lookupByEmail(email: string): Promise<User>;
  conversations(request?: UserConversationsRequest): Promise<UserConversationsList>;
  identity(): Promise<UserIdentity>;
  setPhoto(image: Blob | ArrayBuffer, cropParams?: CropParams): Promise<void>;
  deletePhoto(): Promise<void>;
}

/**
 * Files service interface
 */
export interface FilesService {
  upload(request: FileUploadRequest): Promise<File>;
  uploadV2(request: FileUploadV2Request): Promise<FileUploadV2Response>;
  info(file: string, options?: FileInfoOptions): Promise<FileInfo>;
  list(request?: ListFilesRequest): Promise<FileList>;
  delete(file: string): Promise<void>;
  sharePublicUrl(file: string): Promise<SharedPublicUrl>;
  revokePublicUrl(file: string): Promise<File>;
  completeUploadExternal(request: CompleteExternalUploadRequest): Promise<File[]>;
  getUploadUrlExternal(request: GetUploadUrlRequest): Promise<ExternalUploadUrl>;
  readonly remote: RemoteFilesService;
}

/**
 * Views service interface
 */
export interface ViewsService {
  open(triggerId: string, view: View): Promise<ViewResponse>;
  push(triggerId: string, view: View): Promise<ViewResponse>;
  update(request: UpdateViewRequest): Promise<ViewResponse>;
  publish(userId: string, view: View, hash?: string): Promise<ViewResponse>;
}
```

#### 5.2.4 Socket Mode Interface

```typescript
/**
 * Socket Mode client for real-time events
 */
export interface SocketModeClient {
  /** Connect to Socket Mode */
  connect(): Promise<void>;

  /** Disconnect from Socket Mode */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Send acknowledgment for an envelope */
  acknowledge(envelopeId: string, payload?: AckPayload): Promise<void>;

  /** Register event handler */
  onEvent(handler: (event: SocketModeEvent) => void): void;

  /** Register interaction handler */
  onInteraction(handler: (payload: InteractionPayload) => void): void;

  /** Register slash command handler */
  onSlashCommand(handler: (payload: SlashCommandPayload) => void): void;

  /** Register view submission handler */
  onViewSubmission(handler: (payload: ViewSubmissionPayload) => void): void;

  /** Get async iterator of events */
  events(): AsyncIterable<SocketModeEvent>;
}

/**
 * Socket Mode event types
 */
type SocketModeEvent =
  | { type: 'events_api'; payload: EventsApiEnvelope }
  | { type: 'interactive'; payload: InteractiveEnvelope }
  | { type: 'slash_command'; payload: SlashCommandEnvelope }
  | { type: 'hello'; payload: HelloPayload }
  | { type: 'disconnect'; payload: DisconnectPayload };
```

#### 5.2.5 Events Handler Interface

```typescript
/**
 * Events API handler for webhook-based events
 */
export interface EventsHandler {
  /** Verify request signature */
  verifySignature(body: string | Buffer, timestamp: string, signature: string): boolean;

  /** Parse event payload */
  parseEvent(body: string | Buffer): EventPayload;

  /** Handle URL verification challenge */
  handleUrlVerification(challenge: string): string;
}

/**
 * Event payload types
 */
type EventPayload =
  | { type: 'url_verification'; challenge: string }
  | { type: 'event_callback'; payload: EventCallback }
  | { type: 'app_rate_limited'; payload: AppRateLimited };
```

---

## 6. API Coverage

### 6.1 Web API - Conversations

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `conversations.archive` | POST | Full | Archive a conversation |
| `conversations.close` | POST | Full | Close a DM or MPDM |
| `conversations.create` | POST | Full | Create a channel |
| `conversations.history` | GET | Full | Get conversation history |
| `conversations.info` | GET | Full | Get conversation info |
| `conversations.invite` | POST | Full | Invite users |
| `conversations.join` | POST | Full | Join a conversation |
| `conversations.kick` | POST | Full | Remove a user |
| `conversations.leave` | POST | Full | Leave a conversation |
| `conversations.list` | GET | Full | List conversations |
| `conversations.mark` | POST | Full | Mark as read |
| `conversations.members` | GET | Full | List members |
| `conversations.open` | POST | Full | Open/resume DM |
| `conversations.rename` | POST | Full | Rename channel |
| `conversations.replies` | GET | Full | Get thread replies |
| `conversations.setPurpose` | POST | Full | Set purpose |
| `conversations.setTopic` | POST | Full | Set topic |
| `conversations.unarchive` | POST | Full | Unarchive |
| `conversations.acceptSharedInvite` | POST | Full | Accept shared channel |
| `conversations.approveSharedInvite` | POST | Full | Approve shared channel |
| `conversations.declineSharedInvite` | POST | Full | Decline shared channel |
| `conversations.inviteShared` | POST | Full | Invite to shared channel |
| `conversations.listConnectInvites` | GET | Full | List shared invites |

### 6.2 Web API - Messages

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `chat.delete` | POST | Full | Delete message |
| `chat.deleteScheduledMessage` | POST | Full | Delete scheduled |
| `chat.getPermalink` | GET | Full | Get permalink |
| `chat.meMessage` | POST | Full | /me message |
| `chat.postEphemeral` | POST | Full | Ephemeral message |
| `chat.postMessage` | POST | Full | Post message |
| `chat.scheduleMessage` | POST | Full | Schedule message |
| `chat.scheduledMessages.list` | GET | Full | List scheduled |
| `chat.unfurl` | POST | Full | Unfurl URLs |
| `chat.update` | POST | Full | Update message |

#### Supported Message Features

- [x] Plain text messages
- [x] Block Kit formatting
- [x] Attachments (legacy)
- [x] Threading (thread_ts)
- [x] Ephemeral messages
- [x] Scheduled messages
- [x] Message metadata
- [x] Link unfurling
- [x] Markdown formatting (mrkdwn)
- [x] User/channel mentions
- [x] Emoji
- [x] Reply broadcast

### 6.3 Web API - Users

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `users.conversations` | GET | Full | User's conversations |
| `users.deletePhoto` | POST | Full | Delete profile photo |
| `users.getPresence` | GET | Full | Get presence |
| `users.identity` | GET | Full | OAuth identity |
| `users.info` | GET | Full | Get user info |
| `users.list` | GET | Full | List users |
| `users.lookupByEmail` | GET | Full | Lookup by email |
| `users.setActive` | POST | Full | Mark active |
| `users.setPhoto` | POST | Full | Set profile photo |
| `users.setPresence` | POST | Full | Set presence |
| `users.profile.get` | GET | Full | Get profile |
| `users.profile.set` | POST | Full | Set profile |

### 6.4 Web API - Channels

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| Legacy channel methods | - | Mapped | Map to conversations.* |

### 6.5 Web API - Files

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `files.completeUploadExternal` | POST | Full | Complete external upload |
| `files.delete` | POST | Full | Delete file |
| `files.getUploadURLExternal` | GET | Full | Get upload URL |
| `files.info` | GET | Full | Get file info |
| `files.list` | GET | Full | List files |
| `files.revokePublicURL` | POST | Full | Revoke public URL |
| `files.sharedPublicURL` | POST | Full | Share publicly |
| `files.upload` | POST | Full | Upload file (v1) |
| `files.remote.add` | POST | Full | Add remote file |
| `files.remote.info` | GET | Full | Get remote info |
| `files.remote.list` | GET | Full | List remote files |
| `files.remote.remove` | POST | Full | Remove remote |
| `files.remote.share` | POST | Full | Share remote |
| `files.remote.update` | POST | Full | Update remote |

### 6.6 Web API - Reactions

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `reactions.add` | POST | Full | Add reaction |
| `reactions.get` | GET | Full | Get reactions |
| `reactions.list` | GET | Full | List reactions |
| `reactions.remove` | POST | Full | Remove reaction |

### 6.7 Web API - Pins

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `pins.add` | POST | Full | Pin an item |
| `pins.list` | GET | Full | List pins |
| `pins.remove` | POST | Full | Remove pin |

### 6.8 Web API - Bookmarks

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `bookmarks.add` | POST | Full | Add bookmark |
| `bookmarks.edit` | POST | Full | Edit bookmark |
| `bookmarks.list` | GET | Full | List bookmarks |
| `bookmarks.remove` | POST | Full | Remove bookmark |

### 6.9 Web API - Teams

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `team.accessLogs` | GET | Full | Access logs |
| `team.billableInfo` | GET | Full | Billable info |
| `team.info` | GET | Full | Team info |
| `team.integrationLogs` | GET | Full | Integration logs |
| `team.profile.get` | GET | Full | Team profile |

### 6.10 Web API - Apps

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `apps.connections.open` | POST | Full | Socket Mode URL |
| `apps.event.authorizations.list` | GET | Full | Event authorizations |
| `apps.manifest.create` | POST | Full | Create manifest |
| `apps.manifest.delete` | POST | Full | Delete manifest |
| `apps.manifest.export` | GET | Full | Export manifest |
| `apps.manifest.update` | POST | Full | Update manifest |
| `apps.manifest.validate` | POST | Full | Validate manifest |
| `apps.uninstall` | GET | Full | Uninstall app |

### 6.11 Web API - OAuth

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `oauth.access` | POST | Deprecated | OAuth v1 (legacy) |
| `oauth.v2.access` | POST | Full | OAuth v2 |
| `oauth.v2.exchange` | POST | Full | Token exchange |
| `openid.connect.token` | POST | Full | OpenID Connect |
| `openid.connect.userInfo` | GET | Full | OpenID user info |

#### OAuth Flow Support

| Flow | Support Level |
|------|---------------|
| OAuth 2.0 Authorization Code | Full |
| OAuth 2.0 with PKCE | Full |
| Sign in with Slack (OpenID Connect) | Full |
| Token rotation | Full |
| Bot token scopes | Full |
| User token scopes | Full |
| App-level tokens | Full |

### 6.12 Web API - Views

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `views.open` | POST | Full | Open modal |
| `views.publish` | POST | Full | Publish Home tab |
| `views.push` | POST | Full | Push view |
| `views.update` | POST | Full | Update view |

### 6.13 Events API

#### Supported Event Types

| Event | Category | Description |
|-------|----------|-------------|
| `app_home_opened` | App | User opens App Home |
| `app_mention` | Message | App mentioned |
| `app_rate_limited` | App | Rate limit hit |
| `app_requested` | App | App install requested |
| `app_uninstalled` | App | App uninstalled |
| `channel_archive` | Channel | Channel archived |
| `channel_created` | Channel | Channel created |
| `channel_deleted` | Channel | Channel deleted |
| `channel_history_changed` | Channel | History changed |
| `channel_id_changed` | Channel | ID changed |
| `channel_left` | Channel | User left |
| `channel_rename` | Channel | Channel renamed |
| `channel_shared` | Channel | Channel shared |
| `channel_unarchive` | Channel | Unarchived |
| `channel_unshared` | Channel | Unshared |
| `emoji_changed` | Emoji | Emoji added/removed |
| `file_change` | File | File changed |
| `file_comment_added` | File | Comment added |
| `file_comment_deleted` | File | Comment deleted |
| `file_comment_edited` | File | Comment edited |
| `file_created` | File | File created |
| `file_deleted` | File | File deleted |
| `file_public` | File | File made public |
| `file_shared` | File | File shared |
| `file_unshared` | File | File unshared |
| `group_archive` | Group | Group archived |
| `group_close` | Group | Group closed |
| `group_deleted` | Group | Group deleted |
| `group_history_changed` | Group | History changed |
| `group_left` | Group | User left |
| `group_open` | Group | Group opened |
| `group_rename` | Group | Group renamed |
| `group_unarchive` | Group | Unarchived |
| `im_close` | DM | DM closed |
| `im_created` | DM | DM created |
| `im_history_changed` | DM | History changed |
| `im_open` | DM | DM opened |
| `invite_requested` | Team | Invite requested |
| `link_shared` | Message | Link shared |
| `member_joined_channel` | Member | User joined |
| `member_left_channel` | Member | User left |
| `message` | Message | Message posted |
| `message.app_home` | Message | App Home message |
| `message.channels` | Message | Public channel |
| `message.groups` | Message | Private channel |
| `message.im` | Message | DM message |
| `message.mpim` | Message | MPDM message |
| `pin_added` | Pin | Pin added |
| `pin_removed` | Pin | Pin removed |
| `reaction_added` | Reaction | Reaction added |
| `reaction_removed` | Reaction | Reaction removed |
| `star_added` | Star | Star added |
| `star_removed` | Star | Star removed |
| `subteam_created` | Usergroup | Usergroup created |
| `subteam_members_changed` | Usergroup | Members changed |
| `subteam_self_added` | Usergroup | Added to usergroup |
| `subteam_self_removed` | Usergroup | Removed from usergroup |
| `subteam_updated` | Usergroup | Usergroup updated |
| `team_access_granted` | Team | Access granted |
| `team_access_revoked` | Team | Access revoked |
| `team_domain_change` | Team | Domain changed |
| `team_join` | Team | User joined team |
| `team_rename` | Team | Team renamed |
| `tokens_revoked` | Token | Tokens revoked |
| `url_verification` | System | URL verification |
| `user_change` | User | User changed |
| `user_huddle_changed` | User | Huddle changed |
| `user_profile_changed` | User | Profile changed |
| `user_status_changed` | User | Status changed |
| `workflow_deleted` | Workflow | Workflow deleted |
| `workflow_published` | Workflow | Workflow published |
| `workflow_step_deleted` | Workflow | Step deleted |
| `workflow_step_execute` | Workflow | Step executed |
| `workflow_unpublished` | Workflow | Workflow unpublished |

### 6.14 Socket Mode

| Feature | Support Level | Notes |
|---------|---------------|-------|
| Connection establishment | Full | WebSocket connection |
| Reconnection | Full | Automatic reconnect |
| Event acknowledgment | Full | 3-second window |
| Events API envelope | Full | Event delivery |
| Interactive envelope | Full | Interactions |
| Slash command envelope | Full | Commands |
| Hello event | Full | Connection ready |
| Disconnect event | Full | Clean disconnect |
| Ping/pong | Full | Keep-alive |

### 6.15 Webhooks

| Feature | Support Level | Notes |
|---------|---------------|-------|
| Incoming webhooks | Full | Send messages |
| Response URLs | Full | Respond to interactions |
| Request signature verification | Full | HMAC-SHA256 |

---

## 7. Dependency Policy

### 7.1 Required Dependencies (Integration Repo Primitives)

| Primitive | Purpose | Interface |
|-----------|---------|-----------|
| `@integrations/errors` | Base error types and traits | `IntegrationError` trait |
| `@integrations/retry` | Retry logic with backoff | `RetryPolicy`, `RetryExecutor` |
| `@integrations/circuit-breaker` | Circuit breaker pattern | `CircuitBreaker` trait |
| `@integrations/rate-limits` | Rate limiting enforcement | `RateLimiter` trait |
| `@integrations/tracing` | Distributed tracing | `Span`, `Tracer` traits |
| `@integrations/logging` | Structured logging | `Logger` trait |
| `@integrations/types` | Common type definitions | Shared types |
| `@integrations/config` | Configuration management | `ConfigProvider` trait |

### 7.2 Approved Third-Party Dependencies

#### Rust Crates

| Crate | Version | Purpose | Justification |
|-------|---------|---------|---------------|
| `reqwest` | ^0.12 | HTTP client | Industry standard, async support |
| `tokio` | ^1.0 | Async runtime | Required by reqwest |
| `tokio-tungstenite` | ^0.21 | WebSocket client | Socket Mode support |
| `serde` | ^1.0 | Serialization | De-facto standard |
| `serde_json` | ^1.0 | JSON handling | Required for API |
| `secrecy` | ^0.8 | Secret handling | Secure credential management |
| `bytes` | ^1.0 | Byte buffers | Efficient data handling |
| `futures` | ^0.3 | Async utilities | Stream handling |
| `async-trait` | ^0.1 | Async traits | Ergonomic async interfaces |
| `thiserror` | ^1.0 | Error derivation | Clean error types |
| `url` | ^2.0 | URL parsing | Safe URL handling |
| `http` | ^1.0 | HTTP types | Standard types |
| `mime` | ^0.3 | MIME types | File upload handling |
| `hmac` | ^0.12 | HMAC signing | Signature verification |
| `sha2` | ^0.10 | SHA-256 | Signature verification |
| `hex` | ^0.4 | Hex encoding | Signature comparison |
| `chrono` | ^0.4 | Timestamps | Event timestamps |

#### TypeScript Packages

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `ws` | ^8.0 | WebSocket client | Socket Mode (Node.js) |
| None beyond primitives | - | - | Zero external dependencies |

### 7.3 Forbidden Dependencies

| Category | Examples | Reason |
|----------|----------|--------|
| Other integration modules | `@integrations/openai`, `@integrations/github` | Module isolation |
| ruvbase | `ruvbase`, `layer-0` | Layer separation |
| ORM/Database | `diesel`, `sqlx`, `prisma` | Out of scope |
| Web frameworks | `actix-web`, `axum`, `express` | Out of scope |
| Official Slack SDKs | `@slack/bolt`, `@slack/web-api` | This IS the integration |

---

## 8. Error Taxonomy

### 8.1 Error Hierarchy

```
SlackError (root)
├── ConfigurationError
│   ├── MissingToken
│   ├── InvalidToken
│   ├── MissingSigningSecret
│   └── InvalidConfiguration
├── AuthenticationError
│   ├── InvalidAuth
│   ├── AccountInactive
│   ├── TokenRevoked
│   ├── TokenExpired
│   └── EnterpriseIsRestricted
├── AuthorizationError
│   ├── MissingScope
│   ├── CannotFindChannel
│   ├── ChannelNotFound
│   ├── NotInChannel
│   ├── UserNotFound
│   ├── UserNotVisible
│   └── NotAuthed
├── RequestError
│   ├── InvalidArguments
│   ├── InvalidFormData
│   ├── InvalidJson
│   ├── JsonNotObject
│   ├── RequestTimeout
│   ├── TooManyAttachments
│   └── MsgTooLong
├── RateLimitError
│   ├── RateLimited
│   │   ├── retry_after: Duration
│   │   └── tier: Option<String>
│   └── TooManyRequests
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
├── SocketModeError
│   ├── ConnectionFailed
│   ├── ConnectionClosed
│   ├── ReconnectFailed
│   ├── AcknowledgmentTimeout
│   └── InvalidEnvelope
├── ServerError
│   ├── InternalError
│   ├── ServiceUnavailable
│   ├── TeamAddedToOrg
│   └── FatalError
├── ResponseError
│   ├── DeserializationError
│   ├── UnexpectedResponse
│   └── MissingOkField
├── WebhookError
│   ├── InvalidSignature
│   ├── ExpiredTimestamp
│   └── InvalidPayload
└── ChannelError
    ├── ChannelArchived
    ├── ChannelNotArchived
    ├── ChannelIsMpim
    ├── MethodNotSupportedForChannelType
    └── AlreadyInChannel
```

### 8.2 Error Type Definitions (Rust)

```rust
use thiserror::Error;
use integrations_errors::IntegrationError;

/// Root error type for Slack integration
#[derive(Error, Debug)]
pub enum SlackError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Socket Mode error: {0}")]
    SocketMode(#[from] SocketModeError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Webhook error: {0}")]
    Webhook(#[from] WebhookError),

    #[error("Channel error: {0}")]
    Channel(#[from] ChannelError),
}

impl IntegrationError for SlackError {
    fn error_code(&self) -> &'static str {
        match self {
            Self::Configuration(_) => "SLACK_CONFIG",
            Self::Authentication(_) => "SLACK_AUTH",
            Self::Authorization(_) => "SLACK_AUTHZ",
            Self::Request(_) => "SLACK_REQUEST",
            Self::RateLimit(_) => "SLACK_RATE_LIMIT",
            Self::Network(_) => "SLACK_NETWORK",
            Self::SocketMode(_) => "SLACK_SOCKET_MODE",
            Self::Server(_) => "SLACK_SERVER",
            Self::Response(_) => "SLACK_RESPONSE",
            Self::Webhook(_) => "SLACK_WEBHOOK",
            Self::Channel(_) => "SLACK_CHANNEL",
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network(NetworkError::Timeout)
                | Self::Network(NetworkError::ConnectionFailed)
                | Self::RateLimit(RateLimitError::RateLimited { .. })
                | Self::Server(ServerError::ServiceUnavailable)
                | Self::SocketMode(SocketModeError::ConnectionClosed)
        )
    }

    fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::RateLimit(RateLimitError::RateLimited { retry_after, .. }) => Some(*retry_after),
            _ => None,
        }
    }

    fn http_status(&self) -> Option<u16> {
        match self {
            Self::Authentication(_) => Some(401),
            Self::Authorization(_) => Some(403),
            Self::RateLimit(_) => Some(429),
            Self::Server(ServerError::ServiceUnavailable) => Some(503),
            Self::Server(ServerError::InternalError) => Some(500),
            _ => None,
        }
    }
}

#[derive(Error, Debug)]
pub enum ConfigurationError {
    #[error("Bot token is missing")]
    MissingToken,

    #[error("Invalid token format: {0}")]
    InvalidToken(String),

    #[error("Signing secret is missing")]
    MissingSigningSecret,

    #[error("Invalid configuration: {message}")]
    InvalidConfiguration { message: String },
}

#[derive(Error, Debug)]
pub enum AuthenticationError {
    #[error("Invalid authentication credentials")]
    InvalidAuth,

    #[error("Account is inactive")]
    AccountInactive,

    #[error("Token has been revoked")]
    TokenRevoked,

    #[error("Token has expired")]
    TokenExpired,

    #[error("Enterprise Grid restriction")]
    EnterpriseIsRestricted,
}

#[derive(Error, Debug)]
pub enum RateLimitError {
    #[error("Rate limited")]
    RateLimited {
        retry_after: Duration,
        tier: Option<String>,
    },

    #[error("Too many requests")]
    TooManyRequests,
}

#[derive(Error, Debug)]
pub enum SocketModeError {
    #[error("Failed to connect: {message}")]
    ConnectionFailed { message: String },

    #[error("Connection closed: {reason}")]
    ConnectionClosed { reason: String },

    #[error("Failed to reconnect after {attempts} attempts")]
    ReconnectFailed { attempts: u32 },

    #[error("Acknowledgment timeout for envelope {envelope_id}")]
    AcknowledgmentTimeout { envelope_id: String },

    #[error("Invalid envelope: {message}")]
    InvalidEnvelope { message: String },
}

#[derive(Error, Debug)]
pub enum WebhookError {
    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Timestamp is too old: {timestamp}")]
    ExpiredTimestamp { timestamp: i64 },

    #[error("Invalid payload: {message}")]
    InvalidPayload { message: String },
}
```

### 8.3 Error Mapping from Slack API

| Slack Error Code | Error Type | Retryable |
|-----------------|------------|-----------|
| `invalid_auth` | `AuthenticationError::InvalidAuth` | No |
| `account_inactive` | `AuthenticationError::AccountInactive` | No |
| `token_revoked` | `AuthenticationError::TokenRevoked` | No |
| `token_expired` | `AuthenticationError::TokenExpired` | No |
| `missing_scope` | `AuthorizationError::MissingScope` | No |
| `channel_not_found` | `AuthorizationError::ChannelNotFound` | No |
| `user_not_found` | `AuthorizationError::UserNotFound` | No |
| `ratelimited` | `RateLimitError::RateLimited` | Yes |
| `service_unavailable` | `ServerError::ServiceUnavailable` | Yes |
| `internal_error` | `ServerError::InternalError` | Yes |
| `invalid_arguments` | `RequestError::InvalidArguments` | No |
| `channel_is_archived` | `ChannelError::ChannelArchived` | No |
| `not_in_channel` | `AuthorizationError::NotInChannel` | No |

---

## 9. Phase-3-Ready Hooks

### 9.1 Retry Policy

#### 9.1.1 Retry Configuration

```rust
/// Retry configuration for Slack requests
pub struct SlackRetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,

    /// Initial backoff duration
    pub initial_backoff: Duration,

    /// Maximum backoff duration
    pub max_backoff: Duration,

    /// Backoff multiplier
    pub backoff_multiplier: f64,

    /// Jitter factor (0.0 to 1.0)
    pub jitter: f64,

    /// Respect Retry-After headers
    pub respect_retry_after: bool,

    /// Retryable error codes from Slack
    pub retryable_errors: Vec<String>,
}

impl Default for SlackRetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            backoff_multiplier: 2.0,
            jitter: 0.1,
            respect_retry_after: true,
            retryable_errors: vec![
                "ratelimited".to_string(),
                "service_unavailable".to_string(),
                "internal_error".to_string(),
            ],
        }
    }
}
```

#### 9.1.2 Retry Hook Interface

```rust
/// Hook for customizing retry behavior
#[async_trait]
pub trait RetryHook: Send + Sync {
    /// Called before each retry attempt
    async fn on_retry(
        &self,
        attempt: u32,
        error: &SlackError,
        next_delay: Duration,
    ) -> RetryDecision;

    /// Called when all retries are exhausted
    async fn on_exhausted(&self, error: &SlackError, attempts: u32);
}

/// Decision returned by retry hook
pub enum RetryDecision {
    /// Proceed with retry after specified delay
    Retry(Duration),

    /// Abort retrying immediately
    Abort,

    /// Use default behavior
    Default,
}
```

### 9.2 Rate Limiting

#### 9.2.1 Rate Limit Configuration

Slack uses a tiered rate limiting system based on API method categories.

```rust
/// Rate limit configuration for Slack
pub struct SlackRateLimitConfig {
    /// Enable client-side rate limit tracking
    pub enable_tracking: bool,

    /// Pre-emptive throttling buffer percentage
    pub throttle_buffer_percent: u8,

    /// Per-tier rate limits (requests per minute)
    pub tier_limits: HashMap<RateLimitTier, u32>,

    /// Maximum concurrent requests per workspace
    pub max_concurrent: Option<u32>,

    /// Custom endpoint tier overrides
    pub endpoint_tiers: HashMap<String, RateLimitTier>,
}

/// Slack rate limit tiers
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub enum RateLimitTier {
    /// Tier 1: 1+ per minute
    Tier1,
    /// Tier 2: 20+ per minute
    Tier2,
    /// Tier 3: 50+ per minute
    Tier3,
    /// Tier 4: 100+ per minute
    Tier4,
    /// Special: Varies by endpoint
    Special,
}

impl Default for SlackRateLimitConfig {
    fn default() -> Self {
        let mut tier_limits = HashMap::new();
        tier_limits.insert(RateLimitTier::Tier1, 1);
        tier_limits.insert(RateLimitTier::Tier2, 20);
        tier_limits.insert(RateLimitTier::Tier3, 50);
        tier_limits.insert(RateLimitTier::Tier4, 100);

        Self {
            enable_tracking: true,
            throttle_buffer_percent: 10,
            tier_limits,
            max_concurrent: Some(50),
            endpoint_tiers: HashMap::new(),
        }
    }
}
```

#### 9.2.2 Rate Limit Hook Interface

```rust
/// Hook for customizing rate limit behavior
#[async_trait]
pub trait RateLimitHook: Send + Sync {
    /// Called when a request is about to be rate limited
    async fn on_rate_limit(
        &self,
        endpoint: &str,
        tier: RateLimitTier,
        retry_after: Duration,
    ) -> RateLimitDecision;

    /// Called when rate limit headers are received
    async fn on_rate_limit_response(&self, headers: &RateLimitHeaders);
}

/// Slack rate limit headers
pub struct RateLimitHeaders {
    pub retry_after: Option<Duration>,
}

/// Decision returned by rate limit hook
pub enum RateLimitDecision {
    /// Wait and retry
    Wait(Duration),

    /// Queue the request
    Queue,

    /// Reject immediately
    Reject,

    /// Use default behavior
    Default,
}
```

### 9.3 Circuit Breaker

#### 9.3.1 Circuit Breaker Configuration

```rust
/// Circuit breaker configuration for Slack
pub struct SlackCircuitBreakerConfig {
    /// Failure threshold to open circuit
    pub failure_threshold: u32,

    /// Success threshold to close circuit
    pub success_threshold: u32,

    /// Time window for counting failures
    pub failure_window: Duration,

    /// Time to wait before half-open state
    pub recovery_timeout: Duration,

    /// Separate circuit breakers per workspace
    pub per_workspace: bool,

    /// Errors that count as failures
    pub failure_predicates: Vec<CircuitBreakerPredicate>,
}

/// Predicates for circuit breaker failures
#[derive(Debug, Clone)]
pub enum CircuitBreakerPredicate {
    /// Server errors (5xx)
    ServerError,
    /// Timeouts
    Timeout,
    /// Rate limits
    RateLimit,
    /// Socket Mode connection failures
    SocketModeFailure,
}

impl Default for SlackCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
            recovery_timeout: Duration::from_secs(30),
            per_workspace: false,
            failure_predicates: vec![
                CircuitBreakerPredicate::ServerError,
                CircuitBreakerPredicate::Timeout,
            ],
        }
    }
}
```

#### 9.3.2 Circuit Breaker Hook Interface

```rust
/// Hook for customizing circuit breaker behavior
#[async_trait]
pub trait CircuitBreakerHook: Send + Sync {
    /// Called when circuit state changes
    async fn on_state_change(
        &self,
        from: CircuitState,
        to: CircuitState,
        stats: &CircuitStats,
    );

    /// Called when a request is rejected due to open circuit
    async fn on_rejected(&self, endpoint: &str, workspace: Option<&str>);

    /// Called on each request outcome
    async fn on_outcome(&self, outcome: RequestOutcome, endpoint: &str);
}

/// Circuit breaker states
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}
```

---

## 10. Security Handling

### 10.1 Credential Management

#### 10.1.1 Token Handling

```rust
use secrecy::{ExposeSecret, SecretString, Zeroize};

/// Secure token wrapper for Slack tokens
pub struct SlackToken {
    token: SecretString,
    token_type: TokenType,
}

#[derive(Debug, Clone, Copy)]
pub enum TokenType {
    /// Bot token (xoxb-*)
    Bot,
    /// User token (xoxp-*)
    User,
    /// App-level token (xapp-*)
    App,
}

impl SlackToken {
    /// Create a new token from a string
    pub fn new(token: impl Into<String>) -> Result<Self, ConfigurationError> {
        let token_str = token.into();
        let token_type = Self::detect_type(&token_str)?;
        Ok(Self {
            token: SecretString::new(token_str),
            token_type,
        })
    }

    /// Detect token type from prefix
    fn detect_type(token: &str) -> Result<TokenType, ConfigurationError> {
        if token.starts_with("xoxb-") {
            Ok(TokenType::Bot)
        } else if token.starts_with("xoxp-") {
            Ok(TokenType::User)
        } else if token.starts_with("xapp-") {
            Ok(TokenType::App)
        } else {
            Err(ConfigurationError::InvalidToken(
                "Token must start with xoxb-, xoxp-, or xapp-".to_string(),
            ))
        }
    }

    /// Get token type
    pub fn token_type(&self) -> TokenType {
        self.token_type
    }

    /// Expose the token for use in requests (internal only)
    pub(crate) fn expose(&self) -> &str {
        self.token.expose_secret()
    }
}

// Prevent accidental logging
impl std::fmt::Debug for SlackToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SlackToken({:?}, [REDACTED])", self.token_type)
    }
}
```

#### 10.1.2 Credential Sources (Priority Order)

1. **Explicit Configuration** - Passed directly to client constructor
2. **Environment Variables** - `SLACK_BOT_TOKEN`, `SLACK_USER_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`
3. **Configuration File** - Loaded via `@integrations/config` primitive

### 10.2 Request Signature Verification

Slack signs webhook requests using HMAC-SHA256.

```rust
/// Verify Slack request signature
pub fn verify_signature(
    body: &[u8],
    timestamp: &str,
    signature: &str,
    signing_secret: &SecretString,
) -> Result<bool, WebhookError> {
    // Check timestamp is not too old (5 minutes)
    let ts: i64 = timestamp.parse()
        .map_err(|_| WebhookError::InvalidPayload {
            message: "Invalid timestamp".to_string(),
        })?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if (now - ts).abs() > 300 {
        return Err(WebhookError::ExpiredTimestamp { timestamp: ts });
    }

    // Compute expected signature
    let base_string = format!("v0:{}:{}", timestamp, String::from_utf8_lossy(body));

    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let mut mac = HmacSha256::new_from_slice(signing_secret.expose_secret().as_bytes())
        .map_err(|_| WebhookError::InvalidSignature)?;

    mac.update(base_string.as_bytes());

    let expected = format!("v0={}", hex::encode(mac.finalize().into_bytes()));

    // Constant-time comparison
    Ok(constant_time_eq(signature.as_bytes(), expected.as_bytes()))
}
```

### 10.3 Transport Security

```rust
/// TLS configuration requirements
pub struct TlsConfig {
    /// Minimum TLS version (must be 1.2 or higher)
    pub min_version: TlsVersion,

    /// Enable certificate verification
    pub verify_certificates: bool,
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            min_version: TlsVersion::Tls12,
            verify_certificates: true,
        }
    }
}
```

### 10.4 Data Handling

#### 10.4.1 PII Considerations

| Data Type | Handling | Logging Policy |
|-----------|----------|----------------|
| Tokens | `SecretString` | Never log |
| Signing secrets | `SecretString` | Never log |
| User messages | Pass-through | Log only with explicit opt-in |
| User IDs | Pass-through | May log for debugging |
| Channel IDs | Pass-through | May log for debugging |
| File contents | Pass-through | Never log content |
| Webhook payloads | Sanitize | Redact sensitive fields |

---

## 11. Telemetry Requirements

### 11.1 Metrics

#### 11.1.1 Required Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `slack_requests_total` | Counter | `endpoint`, `status`, `method` | Total requests |
| `slack_request_duration_seconds` | Histogram | `endpoint`, `method` | Request latency |
| `slack_errors_total` | Counter | `endpoint`, `error_type` | Error counts |
| `slack_rate_limit_hits_total` | Counter | `tier` | Rate limit events |
| `slack_circuit_breaker_state` | Gauge | `workspace` | Circuit state |
| `slack_retry_attempts_total` | Counter | `endpoint`, `attempt_number` | Retry attempts |
| `slack_socket_mode_connected` | Gauge | `workspace` | Connection status |
| `slack_socket_mode_events_total` | Counter | `event_type` | Events received |
| `slack_socket_mode_reconnects_total` | Counter | - | Reconnection count |
| `slack_webhook_events_total` | Counter | `event_type` | Webhook events |
| `slack_webhook_verification_failures` | Counter | - | Signature failures |

### 11.2 Tracing

#### 11.2.1 Span Structure

```
slack.request (root span)
├── slack.build_request
├── slack.rate_limit_check
├── slack.http_request
│   ├── http.connection
│   └── http.response
├── slack.parse_response
└── slack.retry (if applicable)
    └── slack.http_request (retry attempt)
```

For Socket Mode:

```
slack.socket_mode.connection
├── slack.socket_mode.websocket_connect
├── slack.socket_mode.hello
├── slack.socket_mode.event
│   ├── slack.socket_mode.parse_envelope
│   └── slack.socket_mode.acknowledge
└── slack.socket_mode.disconnect
```

#### 11.2.2 Required Span Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `slack.endpoint` | string | API endpoint |
| `slack.method` | string | HTTP method |
| `slack.workspace` | string | Workspace ID (if known) |
| `slack.channel` | string | Channel ID (if applicable) |
| `slack.user` | string | User ID (if applicable) |
| `slack.rate_limit_tier` | string | Rate limit tier |
| `slack.retry_count` | int | Retry attempt number |
| `slack.event_type` | string | Event type (Events API) |
| `http.status_code` | int | HTTP response status |

### 11.3 Logging

#### 11.3.1 Log Levels

| Level | Use Case |
|-------|----------|
| ERROR | Authentication failures, configuration errors, webhook verification failures |
| WARN | Rate limits hit, retries, circuit breaker state changes |
| INFO | Request completion, Socket Mode connection status, events received |
| DEBUG | Request/response details (sanitized), parsing details |
| TRACE | Full wire-level details (development only) |

#### 11.3.2 Structured Log Fields

```rust
/// Standard log fields for Slack operations
pub struct SlackLogContext {
    /// Correlation ID for request tracing
    pub correlation_id: String,

    /// API endpoint
    pub endpoint: String,

    /// Workspace ID
    pub workspace_id: Option<String>,

    /// Channel ID
    pub channel_id: Option<String>,

    /// User ID
    pub user_id: Option<String>,

    /// Duration in milliseconds
    pub duration_ms: Option<u64>,

    /// HTTP status code
    pub status_code: Option<u16>,

    /// Slack error code (if error)
    pub error_code: Option<String>,

    /// Event type (for events)
    pub event_type: Option<String>,
}
```

---

## 12. Future-Proofing Rules

### 12.1 API Stability

#### 12.1.1 Response Field Handling

```rust
use serde::de::IgnoredAny;

/// Response type with forward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub name: Option<String>,
    pub is_channel: bool,
    pub is_group: bool,
    pub is_im: bool,
    pub is_mpim: bool,
    pub is_private: bool,
    pub created: i64,
    pub creator: Option<String>,
    pub is_archived: bool,
    pub is_general: bool,
    pub is_member: bool,
    pub topic: Option<ChannelTopic>,
    pub purpose: Option<ChannelPurpose>,

    /// Capture unknown fields for forward compatibility
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}
```

#### 12.1.2 Enum Extensibility

```rust
/// Extensible enum pattern for forward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageSubtype {
    BotMessage,
    MeMessage,
    MessageChanged,
    MessageDeleted,
    MessageReplied,
    ThreadBroadcast,
    ChannelJoin,
    ChannelLeave,
    ChannelTopic,
    ChannelPurpose,
    ChannelName,
    FileShare,
    FileComment,

    /// Unknown subtype (forward compatibility)
    #[serde(other)]
    Unknown,
}
```

### 12.2 Extension Points

#### 12.2.1 Middleware System

```rust
/// Middleware for request/response interception
#[async_trait]
pub trait Middleware: Send + Sync {
    /// Process outgoing request
    async fn process_request(&self, request: &mut SlackRequest) -> Result<(), SlackError>;

    /// Process incoming response
    async fn process_response(&self, response: &mut SlackResponse) -> Result<(), SlackError>;
}
```

#### 12.2.2 Custom Event Handlers

```rust
/// Custom event handler for Socket Mode
#[async_trait]
pub trait EventHandler: Send + Sync {
    /// Handle an event
    async fn handle(&self, event: &Event) -> Result<Option<AckPayload>, SlackError>;

    /// Check if this handler handles the given event type
    fn handles(&self, event_type: &str) -> bool;
}
```

### 12.3 Compatibility Guidelines

| Rule | Description |
|------|-------------|
| **Additive Changes Only** | New fields MUST be optional |
| **Unknown Fields Preserved** | Use `#[serde(flatten)]` for extra fields |
| **Enum Extensibility** | Use `#[serde(other)]` for unknown variants |
| **Deprecation Period** | 6 months minimum before removal |
| **Event Versioning** | Handle multiple event schema versions |
| **API Versioning** | Support `X-Slack-No-Retry` and other headers |

---

## 13. London-School TDD Principles

### 13.1 Interface-First Design

All public types are defined as traits (Rust) or interfaces (TypeScript) before implementation:

```rust
// Define the interface first
#[async_trait]
pub trait MessagesService: Send + Sync {
    async fn post(&self, request: PostMessageRequest) -> Result<PostMessageResponse, SlackError>;
    async fn update(&self, request: UpdateMessageRequest) -> Result<UpdateMessageResponse, SlackError>;
    async fn delete(&self, channel: &str, ts: &str) -> Result<DeleteMessageResponse, SlackError>;
}

// Implementation comes after tests are written
pub struct MessagesServiceImpl {
    transport: Box<dyn HttpTransport>,
    config: SlackConfig,
}

#[async_trait]
impl MessagesService for MessagesServiceImpl {
    // Implementation
}
```

### 13.2 Mock Boundaries

#### 13.2.1 Mockable Dependencies

| Dependency | Mock Strategy |
|------------|---------------|
| HTTP Transport | Mock `HttpTransport` trait |
| WebSocket Transport | Mock `WebSocketTransport` trait |
| Clock/Time | Mock `TimeProvider` trait |
| Random/Jitter | Mock `RandomProvider` trait |
| Configuration | Mock `ConfigProvider` trait |
| Metrics | Mock `MetricsHook` trait |
| Tracing | Mock `TracingHook` trait |

#### 13.2.2 Test Double Patterns

```rust
/// Mock HTTP transport for testing
pub struct MockHttpTransport {
    responses: Vec<MockResponse>,
    calls: Arc<Mutex<Vec<SlackRequest>>>,
}

impl MockHttpTransport {
    pub fn new() -> Self {
        Self {
            responses: vec![],
            calls: Arc::new(Mutex::new(vec![])),
        }
    }

    pub fn with_response(mut self, response: MockResponse) -> Self {
        self.responses.push(response);
        self
    }

    pub fn calls(&self) -> Vec<SlackRequest> {
        self.calls.lock().unwrap().clone()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn send(&self, request: SlackRequest) -> Result<SlackResponse, NetworkError> {
        self.calls.lock().unwrap().push(request);
        // Return next queued response
    }
}
```

### 13.3 Test Organization

```
tests/
├── unit/
│   ├── client_test.rs
│   ├── conversations_test.rs
│   ├── messages_test.rs
│   ├── users_test.rs
│   ├── files_test.rs
│   ├── error_handling_test.rs
│   ├── signature_verification_test.rs
│   └── serialization_test.rs
├── integration/
│   ├── mock_server_test.rs
│   ├── socket_mode_test.rs
│   └── contract_test.rs
└── fixtures/
    ├── conversation_response.json
    ├── message_response.json
    ├── error_response.json
    └── event_payloads/
        ├── message.json
        ├── reaction_added.json
        └── app_mention.json
```

### 13.4 Test Categories

| Category | Description | Mocks |
|----------|-------------|-------|
| Unit | Single component behavior | All dependencies mocked |
| Integration | Component interaction | External services mocked |
| Contract | API contract verification | Mock server with real schemas |
| E2E | Full stack (CI only) | Real Slack API (limited) |

---

## 14. Glossary

| Term | Definition |
|------|------------|
| **App Token** | Token starting with `xapp-` for Socket Mode connections |
| **Block Kit** | Slack's UI framework for building interactive messages |
| **Bot Token** | Token starting with `xoxb-` for bot-level operations |
| **Channel** | A conversation space (public, private, DM, or MPDM) |
| **Conversation** | Generic term for any message container in Slack |
| **Events API** | Webhook-based system for receiving Slack events |
| **Integration Repo** | Parent repository containing all service integrations |
| **London-School TDD** | Test-driven development emphasizing mocks and interfaces |
| **MPDM** | Multi-person direct message |
| **Primitive** | Shared utility module in the Integration Repo |
| **ruvbase** | Layer 0 foundation (explicitly excluded from this module) |
| **Signing Secret** | Secret used to verify webhook request signatures |
| **Socket Mode** | WebSocket-based connection for receiving events |
| **SPARC** | Specification -> Pseudocode -> Architecture -> Refinement -> Completion |
| **User Token** | Token starting with `xoxp-` for user-level operations |
| **Webhook** | HTTP callback for receiving events |
| **Workspace** | A Slack organization/team |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*This document defines the complete specification for the Slack Integration Module. The next phase (Pseudocode) will provide algorithmic implementations for each interface defined here.*
