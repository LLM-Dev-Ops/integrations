# Specification: Discord Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/discord`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Objectives](#2-scope-and-objectives)
3. [Discord API Overview](#3-discord-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [System Constraints](#6-system-constraints)
7. [Interface Specifications](#7-interface-specifications)
8. [Data Models](#8-data-models)
9. [Error Handling](#9-error-handling)
10. [Enterprise Workflow Scenarios](#10-enterprise-workflow-scenarios)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines the Discord integration module for the LLM Dev Ops platform. It provides a thin adapter layer enabling messaging, notifications, and lightweight agent interactions via Discord webhooks and REST API, without managing bot hosting or gateway connections.

### 1.2 Key Differentiators

| Feature | Description |
|---------|-------------|
| Webhook Notifications | Fire-and-forget message delivery |
| REST API Messaging | Channel and DM message operations |
| Channel Routing | Dynamic routing to channels/threads |
| Rate Limit Handling | Automatic backoff and retry |
| Embeds & Components | Rich message formatting |
| Simulation/Replay | Record and replay message flows |

### 1.3 Design Philosophy

This integration is explicitly a **thin adapter layer**:
- No bot hosting or process management
- No gateway/WebSocket connections
- No voice or streaming features
- Leverages existing shared authentication, logging, metrics
- Focuses on REST API and webhook operations only

---

## 2. Scope and Objectives

### 2.1 In Scope

| Category | Items |
|----------|-------|
| Webhooks | Execute webhook, manage webhook messages |
| Messages | Send, edit, delete, react to messages |
| Channels | Send to channels, threads, DMs |
| Embeds | Rich embed formatting |
| Components | Buttons, select menus (response only) |
| Rate Limits | Automatic handling and queuing |
| Simulation | Record/replay message flows |

### 2.2 Out of Scope

| Category | Reason |
|----------|--------|
| Bot Hosting | Infrastructure concern |
| Gateway/WebSocket | Real-time event handling |
| Voice Channels | Streaming infrastructure |
| Slash Commands | Requires gateway for registration |
| Guild Management | Admin operations |
| Role/Permission Management | Admin operations |
| Member Management | Admin operations |

### 2.3 Objectives

| ID | Objective | Success Metric |
|----|-----------|----------------|
| OBJ-001 | Webhook delivery | 99.9% success rate |
| OBJ-002 | Message operations | Send, edit, delete, react |
| OBJ-003 | Rate limit handling | Zero 429 errors surfaced |
| OBJ-004 | Rich formatting | Embeds, components support |
| OBJ-005 | Simulation mode | CI/CD without Discord |
| OBJ-006 | Test coverage | >80% line coverage |

---

## 3. Discord API Overview

### 3.1 API Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Discord API Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Webhook API (Stateless, No Auth Token Required)                │
│  POST /webhooks/{id}/{token}                                    │
│  └── Fire-and-forget notifications                              │
│                                                                  │
│  REST API (Requires Bot Token)                                  │
│  POST /channels/{id}/messages                                   │
│  PATCH /channels/{id}/messages/{id}                             │
│  DELETE /channels/{id}/messages/{id}                            │
│  PUT /channels/{id}/messages/{id}/reactions/{emoji}/@me         │
│                                                                  │
│  Rate Limits                                                    │
│  ├── Global: 50 requests/second                                 │
│  ├── Per-route: Varies (headers indicate)                       │
│  └── Webhook: 30 messages/minute per webhook                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Authentication

| Method | Use Case | Token Format |
|--------|----------|--------------|
| Webhook URL | Notifications | URL contains token |
| Bot Token | REST API | `Bot {token}` header |
| Bearer Token | OAuth2 flows | `Bearer {token}` header |

### 3.3 Rate Limit Headers

| Header | Description |
|--------|-------------|
| X-RateLimit-Limit | Max requests in window |
| X-RateLimit-Remaining | Remaining requests |
| X-RateLimit-Reset | Unix timestamp of reset |
| X-RateLimit-Reset-After | Seconds until reset |
| X-RateLimit-Bucket | Rate limit bucket ID |
| Retry-After | Seconds to wait (on 429) |

---

## 4. Functional Requirements

### 4.1 Webhook Operations

#### FR-WH-001: Execute Webhook

| Field | Details |
|-------|---------|
| Input | Webhook URL, content, embeds, components |
| Output | Message ID (if wait=true) |
| Criteria | Support wait param, thread targeting |

#### FR-WH-002: Edit Webhook Message

| Field | Details |
|-------|---------|
| Input | Webhook URL, message ID, new content |
| Output | Updated message |
| Criteria | Partial updates supported |

#### FR-WH-003: Delete Webhook Message

| Field | Details |
|-------|---------|
| Input | Webhook URL, message ID |
| Output | Success confirmation |
| Criteria | Idempotent delete |

### 4.2 Message Operations

#### FR-MSG-001: Send Message

| Field | Details |
|-------|---------|
| Input | Channel ID, content, embeds, components |
| Output | Message object with ID |
| Criteria | Support reply, thread creation |

#### FR-MSG-002: Edit Message

| Field | Details |
|-------|---------|
| Input | Channel ID, message ID, new content |
| Output | Updated message |
| Criteria | Preserve unmodified fields |

#### FR-MSG-003: Delete Message

| Field | Details |
|-------|---------|
| Input | Channel ID, message ID |
| Output | Success confirmation |
| Criteria | Handle already-deleted gracefully |

#### FR-MSG-004: Add Reaction

| Field | Details |
|-------|---------|
| Input | Channel ID, message ID, emoji |
| Output | Success confirmation |
| Criteria | Support Unicode and custom emoji |

### 4.3 Channel Operations

#### FR-CH-001: Create Thread

| Field | Details |
|-------|---------|
| Input | Channel ID, name, auto_archive_duration |
| Output | Thread channel object |
| Criteria | Public and private threads |

#### FR-CH-002: Send to Thread

| Field | Details |
|-------|---------|
| Input | Thread ID, content |
| Output | Message in thread |
| Criteria | Auto-join thread if needed |

### 4.4 Direct Messages

#### FR-DM-001: Send DM

| Field | Details |
|-------|---------|
| Input | User ID, content |
| Output | Message in DM channel |
| Criteria | Create DM channel if needed |

### 4.5 Simulation Layer

#### FR-SIM-001: Recording Mode

| Field | Details |
|-------|---------|
| Input | Enable recording, storage path |
| Output | Recorded interactions |
| Criteria | Capture requests, responses, rate limits |

#### FR-SIM-002: Replay Mode

| Field | Details |
|-------|---------|
| Input | Recording file path |
| Output | Simulated responses |
| Criteria | Deterministic, mock message IDs |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Requirement | Target |
|-------------|--------|
| Webhook delivery | <500ms p99 |
| Message send | <1s p99 |
| Rate limit queue | <5s average wait |
| Throughput | 50 msg/sec (global limit) |

### 5.2 Reliability

| Requirement | Target |
|-------------|--------|
| Retry on 5xx | 3 retries, exponential backoff |
| Rate limit handling | Automatic queue and retry |
| Webhook failover | Configurable fallback |
| Connection recovery | Automatic |

### 5.3 Security

| Requirement | Implementation |
|-------------|----------------|
| Token handling | Via shared auth primitive |
| Webhook URLs | Treated as secrets |
| TLS | Required (HTTPS only) |
| Token rotation | Support hot reload |

### 5.4 Observability

| Requirement | Integration |
|-------------|-------------|
| Structured logging | Shared logging primitive |
| Metrics | Messages sent, rate limits hit |
| Tracing | Request correlation |

---

## 6. System Constraints

### 6.1 Thin Adapter Constraints

| Constraint | Description |
|------------|-------------|
| CON-THIN-001 | No bot hosting |
| CON-THIN-002 | No gateway connections |
| CON-THIN-003 | No voice features |
| CON-THIN-004 | No slash command registration |
| CON-THIN-005 | No guild/role management |

### 6.2 Dependency Constraints

| Constraint | Description |
|------------|-------------|
| CON-DEP-001 | No cross-module dependencies |
| CON-DEP-002 | Shared primitives only |
| CON-DEP-003 | Standard HTTP client |

### 6.3 Discord API Limits

| Limit | Value |
|-------|-------|
| Message content | 2000 characters |
| Embeds per message | 10 |
| Embed total size | 6000 characters |
| Components per message | 5 action rows |
| Buttons per row | 5 |
| Webhook rate | 30/min per webhook |
| Global rate | 50 requests/sec |

---

## 7. Interface Specifications

### 7.1 Client Interface

```
DiscordClient
├── new(config: DiscordConfig) -> Result<Self>
│
├── Webhook Operations
│   ├── execute_webhook(url, message) -> Result<Option<Message>>
│   ├── edit_webhook_message(url, msg_id, message) -> Result<Message>
│   └── delete_webhook_message(url, msg_id) -> Result<()>
│
├── Message Operations
│   ├── send_message(channel_id, message) -> Result<Message>
│   ├── edit_message(channel_id, msg_id, message) -> Result<Message>
│   ├── delete_message(channel_id, msg_id) -> Result<()>
│   └── add_reaction(channel_id, msg_id, emoji) -> Result<()>
│
├── Channel Operations
│   ├── create_thread(channel_id, params) -> Result<Channel>
│   └── send_to_thread(thread_id, message) -> Result<Message>
│
├── DM Operations
│   └── send_dm(user_id, message) -> Result<Message>
│
└── Simulation
    └── with_simulation(mode: SimulationMode) -> Self
```

### 7.2 Configuration Interface

```
DiscordConfig
├── bot_token: Option<SecretString>    // For REST API
├── default_webhook_url: Option<String> // Default webhook
├── rate_limit_config: RateLimitConfig
├── retry_config: RetryConfig
├── simulation_mode: SimulationMode
└── channel_routing: HashMap<String, ChannelId>  // Named routes
```

---

## 8. Data Models

### 8.1 Core Types

```
Message {
    id: Snowflake,
    channel_id: Snowflake,
    content: String,
    embeds: Vec<Embed>,
    components: Vec<ActionRow>,
    timestamp: DateTime,
    author: Option<User>,
    message_reference: Option<MessageReference>,
}

Embed {
    title: Option<String>,
    description: Option<String>,
    url: Option<String>,
    color: Option<u32>,
    timestamp: Option<DateTime>,
    footer: Option<EmbedFooter>,
    image: Option<EmbedMedia>,
    thumbnail: Option<EmbedMedia>,
    author: Option<EmbedAuthor>,
    fields: Vec<EmbedField>,
}

ActionRow {
    components: Vec<Component>,  // Max 5
}

Component: Button | SelectMenu | TextInput

Button {
    style: ButtonStyle,
    label: Option<String>,
    emoji: Option<Emoji>,
    custom_id: Option<String>,
    url: Option<String>,
    disabled: bool,
}

WebhookMessage {
    content: Option<String>,
    username: Option<String>,      // Override webhook name
    avatar_url: Option<String>,    // Override webhook avatar
    embeds: Vec<Embed>,
    components: Vec<ActionRow>,
    thread_id: Option<Snowflake>,  // Send to thread
    wait: bool,                    // Return message object
}
```

### 8.2 Snowflake ID

```
Snowflake: u64
- Discord's unique ID format
- Contains timestamp information
- Sortable by creation time
```

### 8.3 Simulation Types

```
SimulationMode: Disabled | Recording { path } | Replay { path }

RecordedInteraction {
    timestamp: DateTime,
    operation: String,
    request: SerializedRequest,
    response: SerializedResponse,
    rate_limit_info: Option<RateLimitInfo>,
}
```

---

## 9. Error Handling

### 9.1 Error Types

| Error | HTTP Code | Retryable | Description |
|-------|-----------|-----------|-------------|
| RateLimited | 429 | Yes | Rate limit exceeded |
| Unauthorized | 401 | No | Invalid token |
| Forbidden | 403 | No | Missing permissions |
| NotFound | 404 | No | Resource not found |
| BadRequest | 400 | No | Invalid request |
| ServerError | 5xx | Yes | Discord server error |
| NetworkError | - | Yes | Connection failure |
| InvalidWebhook | 404 | No | Webhook deleted |

### 9.2 Error Structure

```
DiscordError {
    kind: ErrorKind,
    message: String,
    code: Option<i32>,       // Discord error code
    retry_after: Option<f64>, // Seconds to wait
    is_retryable: bool,
}
```

### 9.3 Rate Limit Handling

```
ON 429 Response:
1. Parse Retry-After header
2. Check if global rate limit
3. Queue request for retry
4. Wait specified duration
5. Retry request
6. Update rate limit bucket state
```

---

## 10. Enterprise Workflow Scenarios

### 10.1 Alert Notifications

```
Scenario: Send system alerts to Discord
1. Configure webhook for #alerts channel
2. Format alert as embed (color = severity)
3. Execute webhook with structured embed
4. Optional: Add reaction buttons for acknowledgment
5. Track delivery via simulation recording
```

### 10.2 Agent Interaction

```
Scenario: LLM agent responds in Discord
1. Receive trigger (external to this module)
2. Format agent response with embeds
3. Send message to designated channel
4. Add reactions for feedback (👍/👎)
5. Edit message if agent refines response
```

### 10.3 Workflow Status Updates

```
Scenario: Pipeline status to Discord thread
1. Create thread for pipeline run
2. Send initial status message
3. Edit message as stages complete
4. Send final summary with embed
5. Archive thread on completion
```

### 10.4 Multi-Channel Routing

```
Scenario: Route messages by type
1. Configure channel routing map
2. Receive notification with type tag
3. Lookup target channel from routing
4. Send message to appropriate channel
5. Handle unknown routes with fallback
```

### 10.5 CI/CD Testing

```
Scenario: Test Discord flows without API
1. Enable recording mode in development
2. Execute Discord operations against real API
3. Save recordings to test fixtures
4. Enable replay mode in CI
5. Run tests without Discord dependency
```

---

## 11. Acceptance Criteria

### 11.1 Functional Acceptance

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-001 | Execute webhook | Integration test |
| AC-002 | Edit webhook message | Integration test |
| AC-003 | Delete webhook message | Integration test |
| AC-004 | Send channel message | Integration test |
| AC-005 | Edit message | Integration test |
| AC-006 | Delete message | Integration test |
| AC-007 | Add reaction | Integration test |
| AC-008 | Create thread | Integration test |
| AC-009 | Send DM | Integration test |
| AC-010 | Rate limit handling | Load test |
| AC-011 | Simulation recording | Unit test |
| AC-012 | Simulation replay | Unit test |

### 11.2 Performance Acceptance

| ID | Criteria | Target |
|----|----------|--------|
| AC-PERF-001 | Webhook delivery p99 | <500ms |
| AC-PERF-002 | Message send p99 | <1s |
| AC-PERF-003 | Rate limit recovery | <5s |

### 11.3 Quality Acceptance

| ID | Criteria | Target |
|----|----------|--------|
| AC-QUAL-001 | Line coverage | >80% |
| AC-QUAL-002 | Clippy warnings | 0 |
| AC-QUAL-003 | Documentation | >90% public API |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-DISCORD-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*SPARC Phase 1 Complete - Proceed to Pseudocode phase with "Next phase."*
