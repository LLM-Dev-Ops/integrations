# Microsoft Teams Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/teams`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LLM Dev Ops Platform                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   LLM Apps   │    │  Pipelines   │    │   Alerts     │    │   Workflows  │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┴─────────┬─────────┴───────────────────┘          │
│                                       │                                         │
│                                       ▼                                         │
│                    ┌─────────────────────────────────────┐                     │
│                    │   Microsoft Teams Integration       │                     │
│                    │         (Thin Adapter)              │                     │
│                    └─────────────────┬───────────────────┘                     │
│                                      │                                          │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  Teams Webhooks │         │  Bot Framework  │         │ Microsoft Graph │
│  (Connectors)   │         │    Service      │         │      API        │
└─────────────────┘         └─────────────────┘         └─────────────────┘
          │                            │                            │
          └────────────────────────────┼────────────────────────────┘
                                       │
                                       ▼
                            ┌─────────────────┐
                            │ Microsoft Teams │
                            │   (End Users)   │
                            └─────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Microsoft Teams Integration Module                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Public API Layer                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │   │
│  │  │  TeamsClient    │  │  CardBuilder    │  │    Type Exports         │  │   │
│  │  │   (Facade)      │  │                 │  │                         │  │   │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  │   │
│  └───────────┼──────────────────────────────────────────────────────────────┘   │
│              │                                                                   │
│  ┌───────────┼──────────────────────────────────────────────────────────────┐   │
│  │           ▼              Service Layer                                    │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │   │
│  │  │ WebhookService  │  │   BotService    │  │    GraphService         │   │   │
│  │  │                 │  │                 │  │                         │   │   │
│  │  │ • send_message  │  │ • send_proactive│  │ • list_teams           │   │   │
│  │  │ • send_card     │  │ • reply         │  │ • list_channels        │   │   │
│  │  │ • send_formatted│  │ • create_conv   │  │ • send_channel_msg     │   │   │
│  │  │                 │  │ • process_act   │  │ • send_chat_msg        │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘   │   │
│  └───────────┼────────────────────┼────────────────────────┼────────────────┘   │
│              │                    │                        │                    │
│  ┌───────────┼────────────────────┼────────────────────────┼────────────────┐   │
│  │           ▼                    ▼                        ▼                │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │                    Message Router                                │    │   │
│  │  │  • Rule matching  • Multi-destination  • Priority routing       │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  │                        Routing Layer                                     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                      Transport Layer                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │   │
│  │  │ HttpTransport   │  │  AuthProvider   │  │   RequestBuilder        │   │   │
│  │  │ (reqwest)       │  │ (azure/auth)    │  │                         │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘   │   │
│  └───────────┼────────────────────┼─────────────────────────────────────────┘   │
│              │                    │                                             │
└──────────────┼────────────────────┼─────────────────────────────────────────────┘
               │                    │
               ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐
    │  Teams/Graph    │  │   Azure AD      │
    │   Endpoints     │  │   OAuth2        │
    └─────────────────┘  └─────────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Service Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            WebhookService                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  MessageSender   │    │   CardSender     │    │    PayloadBuilder        │  │
│  │                  │    │                  │    │                          │  │
│  │  • send_text     │    │  • send_adaptive │    │  • build_message_card    │  │
│  │  • send_formatted│    │  • validate_card │    │  • build_adaptive        │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BotService                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │ ProactiveMessenger│   │ ActivityProcessor│    │  ConversationManager     │  │
│  │                  │    │                  │    │                          │  │
│  │  • send_message  │    │  • on_message    │    │  • create_conversation   │  │
│  │  • reply         │    │  • on_invoke     │    │  • get_members           │  │
│  │  • update        │    │  • on_update     │    │  • store_reference       │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GraphService                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │   TeamOps        │    │    ChatOps       │    │     MessageOps           │  │
│  │                  │    │                  │    │                          │  │
│  │  • list_teams    │    │  • list_chats    │    │  • send_channel_msg      │  │
│  │  • list_channels │    │  • create_chat   │    │  • send_chat_msg         │  │
│  │  • get_channel   │    │  • get_members   │    │  • reply_to_msg          │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Message Router Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Message Router                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Routing Engine                                   │   │
│  │                                                                          │   │
│  │   Incoming      ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │   │
│  │   Message  ───> │ Rule        │───>│ Destination │───>│ Delivery    │   │   │
│  │                 │ Matcher     │    │ Resolver    │    │ Executor    │   │   │
│  │                 └─────────────┘    └─────────────┘    └─────────────┘   │   │
│  │                        │                                     │          │   │
│  │                        ▼                                     ▼          │   │
│  │                 ┌─────────────┐                      ┌─────────────┐    │   │
│  │                 │ Rule Store  │                      │ Results     │    │   │
│  │                 │ (priority   │                      │ Aggregator  │    │   │
│  │                 │  sorted)    │                      │             │    │   │
│  │                 └─────────────┘                      └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Routing Conditions:                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │    Tag     │  │  Severity  │  │   Source   │  │   Custom   │                │
│  │  Matcher   │  │  Matcher   │  │  Matcher   │  │ Predicate  │                │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘                │
│                                                                                  │
│  Destinations:                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │  Channel   │  │    Chat    │  │    User    │  │  Webhook   │                │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Webhook Message Flow

```
┌────────┐     ┌─────────────┐     ┌───────────────┐     ┌─────────────────┐
│ Client │     │TeamsClient  │     │WebhookService │     │ Teams Connector │
└───┬────┘     └──────┬──────┘     └───────┬───────┘     └────────┬────────┘
    │                 │                    │                      │
    │  send_webhook() │                    │                      │
    │────────────────>│                    │                      │
    │                 │                    │                      │
    │                 │  send_card()       │                      │
    │                 │───────────────────>│                      │
    │                 │                    │                      │
    │                 │                    │  validate_card()     │
    │                 │                    │────────┐             │
    │                 │                    │<───────┘             │
    │                 │                    │                      │
    │                 │                    │  POST webhook_url    │
    │                 │                    │  {adaptive card}     │
    │                 │                    │─────────────────────>│
    │                 │                    │                      │
    │                 │                    │<─────────────────────│
    │                 │                    │      200 OK          │
    │                 │<───────────────────│                      │
    │                 │  WebhookResponse   │                      │
    │<────────────────│                    │                      │
    │     Result      │                    │                      │
```

### 4.2 Bot Proactive Message Flow

```
┌────────┐   ┌─────────────┐   ┌───────────┐   ┌─────────────┐   ┌───────────┐
│ Client │   │TeamsClient  │   │BotService │   │ AuthProvider│   │Bot Framework│
└───┬────┘   └──────┬──────┘   └─────┬─────┘   └──────┬──────┘   └─────┬─────┘
    │               │                │                │                │
    │ send_proactive│                │                │                │
    │──────────────>│                │                │                │
    │               │                │                │                │
    │               │ send_proactive │                │                │
    │               │───────────────>│                │                │
    │               │                │                │                │
    │               │                │  get_bot_token │                │
    │               │                │───────────────>│                │
    │               │                │                │                │
    │               │                │<───────────────│                │
    │               │                │    token       │                │
    │               │                │                │                │
    │               │                │  POST /v3/conversations/{id}/activities
    │               │                │────────────────────────────────>│
    │               │                │                │                │
    │               │                │<────────────────────────────────│
    │               │                │         { id: "activity_id" }   │
    │               │<───────────────│                │                │
    │               │ ResourceResponse                │                │
    │<──────────────│                │                │                │
    │    Result     │                │                │                │
```

### 4.3 Incoming Activity Processing Flow

```
┌───────────┐   ┌─────────────┐   ┌───────────┐   ┌─────────────────┐
│Bot Framework│ │  Endpoint   │   │BotService │   │ ActivityHandler │
└─────┬─────┘   └──────┬──────┘   └─────┬─────┘   └────────┬────────┘
      │                │                │                   │
      │ POST /api/messages              │                   │
      │ (Activity)     │                │                   │
      │───────────────>│                │                   │
      │                │                │                   │
      │                │ process_activity                   │
      │                │───────────────>│                   │
      │                │                │                   │
      │                │                │  MATCH activity_type
      │                │                │────────┐          │
      │                │                │<───────┘          │
      │                │                │                   │
      │                │                │  on_message()     │
      │                │                │──────────────────>│
      │                │                │                   │
      │                │                │<──────────────────│
      │                │                │    response       │
      │                │                │                   │
      │                │<───────────────│                   │
      │<───────────────│                │                   │
      │    200 OK      │                │                   │
```

### 4.4 Message Routing Flow

```
┌────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────┐
│ Client │   │TeamsClient  │   │MessageRouter│   │ RuleMatcher  │   │ Services │
└───┬────┘   └──────┬──────┘   └──────┬──────┘   └──────┬───────┘   └────┬─────┘
    │               │                 │                 │                │
    │  route(msg)   │                 │                 │                │
    │──────────────>│                 │                 │                │
    │               │                 │                 │                │
    │               │   route(msg)    │                 │                │
    │               │────────────────>│                 │                │
    │               │                 │                 │                │
    │               │                 │  find_matches() │                │
    │               │                 │────────────────>│                │
    │               │                 │                 │                │
    │               │                 │<────────────────│                │
    │               │                 │  [destinations] │                │
    │               │                 │                 │                │
    │               │                 │  FOR EACH destination:          │
    │               │                 │                 │                │
    │               │                 │  deliver(dest, msg)             │
    │               │                 │────────────────────────────────>│
    │               │                 │                 │                │
    │               │                 │<────────────────────────────────│
    │               │                 │         DeliveryResult          │
    │               │<────────────────│                 │                │
    │               │ [DeliveryResults]                 │                │
    │<──────────────│                 │                 │                │
    │   Results     │                 │                 │                │
```

---

## 5. Module Structure

### 5.1 Rust Module Layout

```
integrations/
└── microsoft/
    └── teams/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public exports
            │   ├── client.rs                   # TeamsClient facade
            │   ├── config.rs                   # TeamsConfig
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── webhook/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # WebhookService
            │   │   │   ├── payload.rs          # Payload builders
            │   │   │   └── types.rs            # Webhook types
            │   │   ├── bot/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # BotService
            │   │   │   ├── activity.rs         # Activity processing
            │   │   │   ├── conversation.rs     # Conversation management
            │   │   │   └── types.rs            # Bot types
            │   │   └── graph/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # GraphService
            │   │       ├── teams.rs            # Team/channel operations
            │   │       ├── chats.rs            # Chat operations
            │   │       ├── messages.rs         # Messaging operations
            │   │       └── types.rs            # Graph types
            │   │
            │   ├── cards/
            │   │   ├── mod.rs
            │   │   ├── builder.rs              # CardBuilder
            │   │   ├── elements.rs             # Card elements
            │   │   ├── actions.rs              # Card actions
            │   │   └── validation.rs           # Card validation
            │   │
            │   ├── routing/
            │   │   ├── mod.rs
            │   │   ├── router.rs               # MessageRouter
            │   │   ├── rules.rs                # RoutingRule, conditions
            │   │   └── destination.rs          # Destination types
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── http.rs                 # HTTP transport
            │   │   └── auth.rs                 # Auth integration
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── activity.rs             # Activity, ActivityType
            │   │   ├── conversation.rs         # ConversationReference
            │   │   ├── channel.rs              # Team, Channel
            │   │   ├── chat.rs                 # Chat, ChatMessage
            │   │   ├── card.rs                 # AdaptiveCard
            │   │   └── common.rs               # Shared types
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_client.rs          # MockTeamsClient
            │   │   └── replay.rs               # Message replay
            │   │
            │   ├── error.rs                    # TeamsError
            │   └── validation.rs               # Input validators
            │
            └── tests/
                ├── unit/
                ├── integration/
                └── fixtures/
```

### 5.2 TypeScript Module Layout

```
integrations/
└── microsoft/
    └── teams/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts                    # Public exports
            │   ├── client.ts                   # TeamsClient
            │   ├── config.ts                   # Configuration
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── webhook/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts
            │   │   │   └── types.ts
            │   │   ├── bot/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts
            │   │   │   └── types.ts
            │   │   └── graph/
            │   │       ├── index.ts
            │   │       ├── service.ts
            │   │       └── types.ts
            │   │
            │   ├── cards/
            │   │   ├── index.ts
            │   │   ├── builder.ts
            │   │   └── validation.ts
            │   │
            │   ├── routing/
            │   │   ├── index.ts
            │   │   ├── router.ts
            │   │   └── rules.ts
            │   │
            │   ├── types/
            │   │   └── index.ts
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   └── mockClient.ts
            │   │
            │   ├── error.ts
            │   └── validation.ts
            │
            └── tests/
```

---

## 6. Integration with Shared Modules

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Microsoft Teams Integration                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                         ┌─────────────────────┐                                 │
│                         │    TeamsClient      │                                 │
│                         └──────────┬──────────┘                                 │
│                                    │                                            │
│         ┌──────────────────────────┼──────────────────────────┐                │
│         │                          │                          │                 │
│         ▼                          ▼                          ▼                 │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐           │
│  │azure/auth   │           │shared/      │           │shared/      │           │
│  │             │           │resilience   │           │observability│           │
│  │• Graph Token│           │             │           │             │           │
│  │• Bot Token  │           │• Retry      │           │• Metrics    │           │
│  │• Credential │           │• Circuit    │           │• Tracing    │           │
│  │  Chain      │           │  Breaker    │           │• Logging    │           │
│  └─────────────┘           └─────────────┘           └─────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┬────────────────────────────────────────────────────────────┐
│ Shared Module      │ Integration Point                                          │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ azure/auth         │ • Graph API token: https://graph.microsoft.com/.default    │
│                    │ • Bot token: https://api.botframework.com/.default         │
│                    │ • Multi-tenant support via tenant_id                       │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/resilience  │ • RetryPolicy for transient errors (429, 502, 503)         │
│                    │ • CircuitBreaker per endpoint (Graph, Bot, Webhook)        │
│                    │ • RateLimiter per webhook URL                              │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/observability│ • Metrics: message counts, latency, errors                │
│                    │ • Traces: span per operation                               │
│                    │ • Logs: structured (no webhook URLs or message content)    │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ integrations-logging│ • Webhook URL masking                                     │
│                    │ • Message content redaction                                │
└────────────────────┴────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Credential Flow                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    Protected Values                                      │   │
│  │                                                                          │   │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐   │   │
│  │   │ Webhook URLs   │  │  Bot Secret    │  │   Access Tokens        │   │   │
│  │   │ (SecretString) │  │ (SecretString) │  │   (in-memory only)     │   │   │
│  │   └───────┬────────┘  └───────┬────────┘  └───────────┬────────────┘   │   │
│  │           │                   │                       │                │   │
│  │           └───────────────────┴───────────┬───────────┘                │   │
│  │                                           │                            │   │
│  │                                           ▼                            │   │
│  │                            ┌──────────────────────────┐                │   │
│  │                            │     Security Controls    │                │   │
│  │                            │                          │                │   │
│  │                            │  • Never logged          │                │   │
│  │                            │  • Never in errors       │                │   │
│  │                            │  • Zeroized on drop      │                │   │
│  │                            │  • expose_secret() only  │                │   │
│  │                            └──────────────────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Message Content Security

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Message Security Pipeline                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Input Message                                                                   │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────┐                                                            │
│  │ HTML Sanitizer  │  ─── Escape <, >, &, ", ' in text content                  │
│  └────────┬────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                            │
│  │ URL Validator   │  ─── Validate action URLs (https only)                     │
│  └────────┬────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                            │
│  │Mention Validator│  ─── Validate user IDs in @mentions                        │
│  └────────┬────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                            │
│  │ Size Validator  │  ─── Ensure < 28KB for cards, < 4KB for text               │
│  └────────┬────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  Sanitized Message                                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Error Classification                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Error Categories                                     │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │   │
│  │  │   Retry     │   │  Fail Fast  │   │   Notify    │   │   Ignore    │  │   │
│  │  │             │   │             │   │             │   │             │  │   │
│  │  │ • 429       │   │ • 400       │   │ • 403       │   │ • 409       │  │   │
│  │  │ • 502       │   │ • 401       │   │ • Quota     │   │ • Duplicate │  │   │
│  │  │ • 503       │   │ • 404       │   │             │   │             │  │   │
│  │  │ • Timeout   │   │ • Invalid   │   │             │   │             │  │   │
│  │  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Circuit Breaker (per endpoint):                                                 │
│  ┌────────┐     5 failures     ┌────────┐     30s timeout    ┌───────────┐     │
│  │ Closed │ ─────────────────> │  Open  │ ─────────────────> │ Half-Open │     │
│  └────────┘                    └────────┘                    └───────────┘     │
│       ▲                                                            │            │
│       └────────────────────────────────────────────────────────────┘            │
│                              success                                             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Multi-Tenant Support                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Tenant Isolation                                     │   │
│  │                                                                          │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │   │
│  │   │  Tenant A   │    │  Tenant B   │    │  Tenant C   │                 │   │
│  │   │             │    │             │    │             │                 │   │
│  │   │ • Config    │    │ • Config    │    │ • Config    │                 │   │
│  │   │ • Tokens    │    │ • Tokens    │    │ • Tokens    │                 │   │
│  │   │ • Webhooks  │    │ • Webhooks  │    │ • Webhooks  │                 │   │
│  │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                 │   │
│  │          │                  │                  │                        │   │
│  │          └──────────────────┼──────────────────┘                        │   │
│  │                             │                                           │   │
│  │                             ▼                                           │   │
│  │                  ┌─────────────────────┐                                │   │
│  │                  │  TeamsClientFactory │                                │   │
│  │                  │                     │                                │   │
│  │                  │  get_client(tenant) │                                │   │
│  │                  └─────────────────────┘                                │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Token Scoping:                                                                  │
│  • Graph API: Token per tenant (tenant_id in auth request)                      │
│  • Bot API: Multi-tenant bot token (single app registration)                    │
│  • Webhooks: Isolated per tenant (separate URLs)                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Test Layer Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        Unit Tests                                        │   │
│  │  • Service logic with mocked transport                                   │   │
│  │  • Card builder and validation                                           │   │
│  │  • Router rule matching                                                  │   │
│  │  • Error mapping                                                         │   │
│  │  Coverage Target: >90%                                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Integration Tests                                    │   │
│  │  • MockTeamsClient full flows                                            │   │
│  │  • HTTP mock server (wiremock)                                           │   │
│  │  • Activity processing pipeline                                          │   │
│  │  • Multi-destination routing                                             │   │
│  │  Coverage Target: All API operations                                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        E2E Tests (Gated)                                 │   │
│  │  • Real Teams webhook                                                    │   │
│  │  • Requires: TEAMS_WEBHOOK_URL, bot credentials                          │   │
│  │  • Gated by: TEAMS_E2E_TESTS=true                                        │   │
│  │  Coverage: Happy paths only                                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Test Fixtures:                                                                  │
│  ├── fixtures/                                                                  │
│  │   ├── activities/                                                            │
│  │   │   ├── message_activity.json                                             │
│  │   │   ├── conversation_update.json                                          │
│  │   │   └── invoke_activity.json                                              │
│  │   ├── graph/                                                                 │
│  │   │   ├── teams_list.json                                                   │
│  │   │   ├── channels_list.json                                                │
│  │   │   └── chat_message.json                                                 │
│  │   ├── cards/                                                                 │
│  │   │   └── adaptive_card.json                                                │
│  │   └── errors/                                                                │
│  │       ├── rate_limited.json                                                 │
│  │       └── not_found.json                                                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-microsoft-teams.md | Complete |
| 2. Pseudocode | pseudocode-microsoft-teams.md | Complete |
| 3. Architecture | architecture-microsoft-teams.md | Complete |
| 4. Refinement | refinement-microsoft-teams.md | Pending |
| 5. Completion | completion-microsoft-teams.md | Pending |

---

*Phase 3: Architecture - Complete*
