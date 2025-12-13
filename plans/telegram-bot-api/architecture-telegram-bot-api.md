# Architecture: Telegram Bot API Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/telegram-bot-api`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [C4 Model Diagrams](#2-c4-model-diagrams)
3. [Module Architecture](#3-module-architecture)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Update Processing Architecture](#5-update-processing-architecture)
6. [Rate Limiting Architecture](#6-rate-limiting-architecture)
7. [Simulation Architecture](#7-simulation-architecture)
8. [Concurrency Model](#8-concurrency-model)
9. [Error Handling Architecture](#9-error-handling-architecture)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. Architecture Overview

### 1.1 Design Philosophy

| Principle | Implementation |
|-----------|----------------|
| Single Responsibility | Bot API operations only |
| No Infrastructure | No bot/webhook hosting |
| Shared Primitives | Platform logging, metrics, retry |
| Dual Update Modes | Webhook + long polling |
| Testability | Simulation layer for CI/CD |

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Telegram Bot API Integration                │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐   │    │
│  │  │ Update  │  │ Message │  │  Media  │  │   Keyboard    │   │    │
│  │  │ Handler │  │   Ops   │  │   Ops   │  │     Ops       │   │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └───────┬───────┘   │    │
│  │       │            │            │               │           │    │
│  │       └────────────┴────────────┴───────────────┘           │    │
│  │                           │                                  │    │
│  │                    ┌──────┴──────┐                          │    │
│  │                    │   Client    │                          │    │
│  │                    │    Core     │                          │    │
│  │                    └──────┬──────┘                          │    │
│  │       ┌───────────────────┼───────────────────┐             │    │
│  │       │                   │                   │             │    │
│  │  ┌────┴─────┐      ┌──────┴──────┐     ┌──────┴──────┐     │    │
│  │  │   Rate   │      │    HTTP     │     │ Simulation  │     │    │
│  │  │  Limiter │      │   Client    │     │   Layer     │     │    │
│  │  └──────────┘      └─────────────┘     └─────────────┘     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Shared Primitives                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │    │
│  │  │ Logging │  │ Metrics │  │  Retry  │  │  Auth/Secrets   │ │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
   ┌─────────────────────┐           ┌─────────────────────┐
   │   Telegram Bot API  │           │  Platform Webhook   │
   │  api.telegram.org   │           │     Endpoint        │
   └─────────────────────┘           └─────────────────────┘
```

### 1.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Dual update modes | Flexibility for different deployments |
| Token in URL path | Telegram API requirement |
| Per-chat rate limiting | Different limits for users/groups |
| Chat routing map | Named routes for flexibility |
| Multipart uploads | Required for file uploads |

---

## 2. C4 Model Diagrams

### 2.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           «System»                                   │
│                      LLM Dev Ops Platform                            │
│    ┌────────────────────────────────────────────────────────┐       │
│    │           Telegram Bot API Integration                  │       │
│    │                                                         │       │
│    │   Sends messages, handles updates, manages keyboards   │       │
│    │   for Telegram messaging operations                     │       │
│    └────────────────────────────────────────────────────────┘       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ «External»      │  │ «External»      │  │ «External»      │
│ Telegram API    │  │ Telegram Users  │  │ Telegram Groups │
│                 │  │                 │  │   & Channels    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 2.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Telegram Bot API Integration                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐     │
│  │  «Component»   │    │  «Component»   │    │  «Component»   │     │
│  │ Update Handler │    │  Message Ops   │    │   Media Ops    │     │
│  │                │    │                │    │                │     │
│  │ - Webhook      │    │ - Send/Edit    │    │ - Photo        │     │
│  │ - Polling      │    │ - Delete       │    │ - Document     │     │
│  │ - Validation   │    │ - Forward      │    │ - Upload       │     │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘     │
│          │                     │                     │              │
│          └─────────────────────┼─────────────────────┘              │
│                                │                                     │
│                         ┌──────┴──────┐                             │
│                         │ «Component» │                             │
│                         │TelegramClient│                            │
│                         └──────┬──────┘                             │
│                                │                                     │
│          ┌─────────────────────┼─────────────────────┐              │
│          │                     │                     │              │
│  ┌───────┴────────┐    ┌───────┴───────┐    ┌───────┴────────┐     │
│  │  «Component»   │    │  «Component»  │    │  «Component»   │     │
│  │  Rate Limiter  │    │  HTTP Client  │    │   Simulation   │     │
│  │                │    │               │    │     Layer      │     │
│  │ - Global limit │    │ - Retry       │    │ - Record       │     │
│  │ - Per-chat     │    │ - Timeout     │    │ - Replay       │     │
│  │ - Group limit  │    │ - TLS         │    │ - Mock IDs     │     │
│  └────────────────┘    └───────────────┘    └────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TelegramClient                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Internal Components                      │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │   Config    │  │  HttpClient  │  │   RateLimiter    │   │    │
│  │  │   (Arc)     │  │    (Arc)     │  │      (Arc)       │   │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘   │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │                 SimulationLayer (Arc)                 │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Public API:                                                         │
│  ├── handle_webhook(body, headers) -> Result<Option<Update>>       │
│  ├── poll_updates(handler) -> Result<()>                            │
│  ├── send_message(params) -> Result<Message>                        │
│  ├── edit_message_text(params) -> Result<Message>                   │
│  ├── delete_message(chat, msg_id) -> Result<bool>                   │
│  ├── forward_message(params) -> Result<Message>                     │
│  ├── send_photo(params) -> Result<Message>                          │
│  ├── send_document(params) -> Result<Message>                       │
│  ├── answer_callback_query(params) -> Result<bool>                  │
│  └── edit_message_reply_markup(params) -> Result<Message>           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Architecture

### 3.1 Directory Structure

```
integrations/telegram-bot-api/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports
│   ├── client.rs                 # TelegramClient
│   ├── config.rs                 # Configuration & builder
│   │
│   ├── updates/
│   │   ├── mod.rs
│   │   ├── webhook.rs            # Webhook handling
│   │   └── polling.rs            # Long polling
│   │
│   ├── operations/
│   │   ├── mod.rs
│   │   ├── message.rs            # Send/edit/delete/forward
│   │   ├── media.rs              # Photo/document/audio/video
│   │   └── keyboard.rs           # Inline/reply keyboards
│   │
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   ├── limiter.rs            # Rate limiter
│   │   └── chat_limiter.rs       # Per-chat limiting
│   │
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs              # Simulation layer
│   │   ├── recorder.rs           # Interaction recorder
│   │   └── storage.rs            # File persistence
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── update.rs             # Update, CallbackQuery
│   │   ├── message.rs            # Message, MessageEntity
│   │   ├── chat.rs               # Chat, ChatId, User
│   │   ├── keyboard.rs           # Keyboard types
│   │   └── media.rs              # InputFile, Photo
│   │
│   └── error.rs                  # Error types
│
├── tests/
│   ├── integration/
│   │   ├── message_test.rs
│   │   ├── webhook_test.rs
│   │   └── polling_test.rs
│   ├── unit/
│   │   ├── rate_limit_test.rs
│   │   ├── simulation_test.rs
│   │   └── types_test.rs
│   └── fixtures/
│       └── recordings/
│
└── examples/
    ├── send_message.rs
    ├── webhook_handler.rs
    └── polling_bot.rs
```

### 3.2 External Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| tokio | 1.0+ | Async runtime |
| reqwest | 0.11+ | HTTP client (multipart) |
| serde | 1.0+ | Serialization |
| serde_json | 1.0+ | JSON handling |
| secrecy | 0.8+ | Secret handling |
| thiserror | 1.0+ | Error types |
| tracing | 0.1+ | Observability |
| parking_lot | 0.12+ | Synchronization |

---

## 4. Data Flow Architecture

### 4.1 Send Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Send Message Flow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes send_message(params)                             │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │     Check Simulation Mode           │                         │
│     │  Replay? → Return mock message      │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼ (Not replay)                             │
│  3. ┌─────────────────────────────────────┐                         │
│     │     Resolve Chat Target             │                         │
│     │  Name → Lookup in routing map       │                         │
│     │  Id/Username → Use directly         │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  4. ┌─────────────────────────────────────┐                         │
│     │     Acquire Rate Limit Slot         │                         │
│     │  - Global semaphore (30/sec)        │                         │
│     │  - Per-chat limit (1/sec)           │                         │
│     │  - Group limit (20/min)             │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  5. ┌─────────────────────────────────────┐                         │
│     │     Build API Request               │                         │
│     │  POST /bot{token}/sendMessage       │                         │
│     │  Body: { chat_id, text, ... }       │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  6. ┌─────────────────────────────────────┐                         │
│     │     Execute with Retry              │                         │
│     │  429 → Wait retry_after             │                         │
│     │  5xx → Exponential backoff          │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  7. ┌─────────────────────────────────────┐                         │
│     │     Parse API Response              │                         │
│     │  { ok: true, result: Message }      │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  8. ┌─────────────────────────────────────┐                         │
│     │     Record if Recording Mode        │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  9. Return Result<Message>                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Media Upload Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Media Upload Flow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes send_photo(params)                               │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │     Determine Input Type            │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│       ┌──────────────────┼──────────────────┐                       │
│       │                  │                  │                       │
│       ▼                  ▼                  ▼                       │
│  ┌─────────┐       ┌─────────┐       ┌─────────────┐               │
│  │ file_id │       │   URL   │       │   Upload    │               │
│  │ (reuse) │       │ (fetch) │       │ (multipart) │               │
│  └────┬────┘       └────┬────┘       └──────┬──────┘               │
│       │                 │                   │                       │
│       │                 │                   ▼                       │
│       │                 │      ┌────────────────────────┐          │
│       │                 │      │  Build Multipart Form  │          │
│       │                 │      │  - chat_id (text)      │          │
│       │                 │      │  - photo (file part)   │          │
│       │                 │      │  - caption (text)      │          │
│       │                 │      └────────────────────────┘          │
│       │                 │                   │                       │
│       └─────────────────┴───────────────────┘                       │
│                          │                                           │
│                          ▼                                           │
│  3. ┌─────────────────────────────────────┐                         │
│     │     POST to sendPhoto endpoint      │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  4. Return Result<Message> with photo file_id                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Update Processing Architecture

### 5.1 Webhook Mode

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Webhook Architecture                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Telegram Servers                                                    │
│        │                                                             │
│        │ POST /webhook/{path}                                       │
│        │ Header: X-Telegram-Bot-Api-Secret-Token                    │
│        │ Body: Update JSON                                          │
│        │                                                             │
│        ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                Platform HTTP Server                          │    │
│  │  (Not part of this integration - uses existing platform)     │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │               handle_webhook(body, headers)                  │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  1. Verify secret token (if configured)             │    │    │
│  │  │  2. Parse Update JSON                               │    │    │
│  │  │  3. Record if simulation recording                  │    │    │
│  │  │  4. Return Update to caller                         │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Long Polling Mode

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Long Polling Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     poll_updates(handler)                    │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│                    ┌─────────────────┐                              │
│                    │  offset = 0     │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│           ┌─────────────────▼─────────────────┐                     │
│           │              LOOP                  │                     │
│           │  ┌─────────────────────────────┐  │                     │
│           │  │ getUpdates(offset, timeout) │  │                     │
│           │  │ - timeout: 30s (long poll)  │  │                     │
│           │  │ - offset: last_id + 1       │  │                     │
│           │  └──────────────┬──────────────┘  │                     │
│           │                 │                  │                     │
│           │                 ▼                  │                     │
│           │  ┌─────────────────────────────┐  │                     │
│           │  │   FOR each update           │  │                     │
│           │  │   - Update offset           │  │                     │
│           │  │   - Record if recording     │  │                     │
│           │  │   - Call handler(update)    │  │                     │
│           │  └─────────────────────────────┘  │                     │
│           │                 │                  │                     │
│           │                 ▼                  │                     │
│           │         [Continue loop]           │                     │
│           └───────────────────────────────────┘                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Rate Limiting Architecture

### 6.1 Multi-Tier Rate Limiting

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Rate Limiting Architecture                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                       RateLimiter                            │    │
│  │                                                              │    │
│  │  Tier 1: Global Limit                                        │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  Semaphore(30)  - 30 requests/second total          │    │    │
│  │  │  Permits released after 1/30 second delay           │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  │  Tier 2: Per-Chat Limits                                     │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  HashMap<ChatId, ChatLimiter>                        │    │    │
│  │  │                                                       │    │    │
│  │  │  Private Chat: 1 msg/sec                             │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐                    │    │    │
│  │  │  │ Chat: 123   │  │ Chat: 456   │  ...               │    │    │
│  │  │  │ last: 1.2s  │  │ last: 0.5s  │                    │    │    │
│  │  │  └─────────────┘  └─────────────┘                    │    │    │
│  │  │                                                       │    │    │
│  │  │  Group/Channel: 20 msg/min                           │    │    │
│  │  │  ┌─────────────────────────────┐                     │    │    │
│  │  │  │ Group: -789                 │                     │    │    │
│  │  │  │ count: 15/20, minute_start  │                     │    │    │
│  │  │  └─────────────────────────────┘                     │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Rate Limit Acquisition Flow

```
acquire(chat_id) Flow:

1. Acquire global semaphore permit
   └── Timeout? → RateLimitTimeout error

2. If chat_id provided:
   ├── Get/create ChatLimiter for chat_id
   ├── Check time since last message
   │   └── < 1 second? → Sleep remaining time
   ├── If group chat:
   │   ├── Check messages this minute
   │   └── >= 20? → Sleep until next minute
   └── Update last_message timestamp

3. Schedule permit release (1/30 sec delay)

4. Return Ok(())
```

---

## 7. Simulation Architecture

### 7.1 Simulation Layer Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Simulation Architecture                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     SimulationLayer                          │    │
│  │                                                              │    │
│  │  ┌────────────────┐                                          │    │
│  │  │ SimulationMode │                                          │    │
│  │  │ ├── Disabled   │ → Pass-through to real API              │    │
│  │  │ ├── Recording  │ → Execute + record interactions         │    │
│  │  │ └── Replay     │ → Return mock responses                 │    │
│  │  └────────────────┘                                          │    │
│  │                                                              │    │
│  │  ┌────────────────────────────────────────────────────┐     │    │
│  │  │                 SimulationRecorder                  │     │    │
│  │  │  - API calls (method, params, response)             │     │    │
│  │  │  - Incoming updates                                 │     │    │
│  │  │  - Thread-safe (RwLock)                             │     │    │
│  │  └────────────────────────────────────────────────────┘     │    │
│  │                                                              │    │
│  │  ┌────────────────────────────────────────────────────┐     │    │
│  │  │                 SimulationStorage                   │     │    │
│  │  │  - Load recordings from JSON file                   │     │    │
│  │  │  - Save recordings to JSON file                     │     │    │
│  │  │  - Index by method + params hash                    │     │    │
│  │  └────────────────────────────────────────────────────┘     │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Recording Format

```json
{
  "metadata": {
    "version": "1.0",
    "created": "2025-12-13T00:00:00Z",
    "bot_username": "test_bot"
  },
  "api_calls": [
    {
      "id": "uuid-1",
      "timestamp": "2025-12-13T00:00:01Z",
      "method": "sendMessage",
      "request": {
        "chat_id": 123456789,
        "text": "Hello!",
        "parse_mode": "HTML"
      },
      "response": {
        "ok": true,
        "result": {
          "message_id": 42,
          "chat": { "id": 123456789, "type": "private" },
          "text": "Hello!"
        }
      }
    }
  ],
  "updates": [
    {
      "update_id": 100,
      "message": {
        "message_id": 41,
        "chat": { "id": 123456789, "type": "private" },
        "text": "/start"
      }
    }
  ]
}
```

---

## 8. Concurrency Model

### 8.1 Shared State

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Concurrency Model                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  TelegramClient (Cloneable, Send + Sync)                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Arc<TelegramConfig>   - Immutable after creation           │    │
│  │  Arc<HttpClient>       - Internally synchronized            │    │
│  │  Arc<RateLimiter>      - Thread-safe multi-tier             │    │
│  │  Arc<SimulationLayer>  - RwLock protected                   │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  RateLimiter                                                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Semaphore (global_limit)         - Tokio semaphore         │    │
│  │  RwLock<HashMap<i64, ChatLimiter>> - Per-chat state         │    │
│  │                                                              │    │
│  │  ChatLimiter:                                                │    │
│  │  ├── AtomicU64 (last_message)                                │    │
│  │  ├── AtomicU32 (messages_this_minute)                        │    │
│  │  └── AtomicU64 (minute_start)                                │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Thread Safety

| Component | Synchronization | Guarantee |
|-----------|-----------------|-----------|
| TelegramClient | Arc wrapper | Safe to clone/share |
| RateLimiter | Semaphore + RwLock | Concurrent rate limiting |
| ChatLimiter | Atomics | Lock-free per-chat state |
| SimulationLayer | RwLock | Concurrent reads |
| HttpClient | Internal | Connection pooling |

---

## 9. Error Handling Architecture

### 9.1 Error Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Error Handling Architecture                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      TelegramError                           │    │
│  │                                                              │    │
│  │  Retryable Errors:                                           │    │
│  │  ├── RateLimited { retry_after }   → Wait and retry         │    │
│  │  ├── ServerError { status }        → Exponential backoff    │    │
│  │  └── NetworkError                  → Connection retry        │    │
│  │                                                              │    │
│  │  Non-Retryable Errors:                                       │    │
│  │  ├── Unauthorized                  → Invalid token           │    │
│  │  ├── Forbidden                     → Bot blocked/kicked      │    │
│  │  ├── BadRequest                    → Invalid parameters      │    │
│  │  ├── ChatNotFound                  → Chat doesn't exist      │    │
│  │  └── MessageNotFound               → Message deleted         │    │
│  │                                                              │    │
│  │  Configuration Errors:                                       │    │
│  │  ├── UnknownChatRoute              → Route not configured    │    │
│  │  ├── PollingNotConfigured          → Missing polling config  │    │
│  │  └── InvalidWebhookSignature       → Signature mismatch      │    │
│  │                                                              │    │
│  │  Rate Limit Errors:                                          │    │
│  │  ├── RateLimitTimeout              → Queue timeout           │    │
│  │  └── RateLimitClosed               → Limiter shutdown        │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment Architecture

### 10.1 Runtime Requirements

| Requirement | Specification |
|-------------|---------------|
| Rust Version | 1.70+ |
| Async Runtime | Tokio 1.0+ |
| Memory | ~10MB base + state |
| Network | Outbound HTTPS |
| TLS | 1.2+ required |

### 10.2 Configuration Sources

```
Priority Order (highest to lowest):

1. Direct Config
   TelegramConfigBuilder::new("token")
       .with_chat_route("alerts", ChatId::Id(-123))
       .build()

2. Environment Variables
   TELEGRAM_BOT_TOKEN     - Bot token (required)
   TELEGRAM_WEBHOOK_SECRET - Webhook verification
   TELEGRAM_API_BASE_URL   - Custom API endpoint

3. Secrets Manager
   Via shared primitives-secrets
```

### 10.3 Observability Metrics

| Metric | Type | Description |
|--------|------|-------------|
| telegram_messages_sent | Counter | Messages sent |
| telegram_updates_received | Counter | Updates processed |
| telegram_rate_limits_hit | Counter | 429 responses |
| telegram_request_duration_seconds | Histogram | API latency |
| telegram_polling_lag_seconds | Gauge | Polling delay |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-TELEGRAM-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*
