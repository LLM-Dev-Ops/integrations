# HubSpot API Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/hubspot-api`

---

## 1. Architecture Overview

### 1.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Contact     │  │ Deal        │  │ Marketing   │  │ Webhook     │ │
│  │ Management  │  │ Pipeline    │  │ Automation  │  │ Handler     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
┌─────────▼────────────────▼────────────────▼────────────────▼────────┐
│                        Client Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      HubSpotClient                               ││
│  │         (Unified API, operation routing, validation)            ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                     Orchestration Layer                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐            │
│  │ RateLimiter   │  │ TokenManager  │  │ RequestQueue  │            │
│  │               │  │               │  │               │            │
│  │ - Daily quota │  │ - OAuth flow  │  │ - Priority    │            │
│  │ - Burst limit │  │ - Refresh     │  │ - Backpressure│            │
│  │ - Search limit│  │ - Validation  │  │ - Retry queue │            │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘            │
└──────────┼──────────────────┼──────────────────┼────────────────────┘
           │                  │                  │
┌──────────▼──────────────────▼──────────────────▼────────────────────┐
│                      Transport Layer                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      HttpClient                                  ││
│  │        (Request execution, retry, timeout, tracing)             ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      External Services                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    HubSpot API                                   ││
│  │              https://api.hubapi.com                              ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Single client instance | Centralized rate limit tracking |
| Token bucket rate limiting | Matches HubSpot's quota model |
| Request queue with priority | Critical ops bypass backpressure |
| Webhook signature validation | Security requirement |
| Request/response recording | Enables replay testing |

---

## 2. Component Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                       HubSpotClient                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ config: HubSpotConfig                                           ││
│  │ httpClient: HttpClient                                          ││
│  │ rateLimiter: RateLimiter                                        ││
│  │ tokenManager: TokenManager                                      ││
│  │ webhookProcessor: WebhookProcessor                              ││
│  │ logger: Logger                                                  ││
│  │ metrics: MetricsClient                                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  CRM Operations:                                                     │
│  ├── createObject(type, properties) -> CrmObject                    │
│  ├── getObject(type, id, options?) -> CrmObject                     │
│  ├── updateObject(type, id, properties) -> CrmObject                │
│  ├── deleteObject(type, id) -> void                                 │
│  ├── searchObjects(type, query) -> SearchResult                     │
│  │                                                                   │
│  Batch Operations:                                                   │
│  ├── batchCreate(type, inputs[]) -> BatchResult                     │
│  ├── batchRead(type, ids[]) -> BatchResult                          │
│  ├── batchUpdate(type, inputs[]) -> BatchResult                     │
│  │                                                                   │
│  Association Operations:                                             │
│  ├── createAssociation(from, to, type) -> void                      │
│  ├── getAssociations(from, toType) -> Association[]                 │
│  │                                                                   │
│  Webhook Operations:                                                 │
│  └── handleWebhook(request) -> WebhookResponse                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Rate Limiter Component

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RateLimiter                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ dailyRemaining: number         // Remaining daily calls         ││
│  │ dailyResetAt: Date             // Next midnight UTC             ││
│  │ burstTokens: number            // Current burst bucket          ││
│  │ searchTokens: number           // Current search bucket         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Token Buckets:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  Daily Bucket          Burst Bucket         Search Bucket       ││
│  │  ┌──────────┐          ┌──────────┐         ┌──────────┐        ││
│  │  │ 500,000  │          │   100    │         │    4     │        ││
│  │  │ /day     │          │ /10 sec  │         │ /sec     │        ││
│  │  │          │          │          │         │          │        ││
│  │  │ ████████ │          │ ██████   │         │ ███      │        ││
│  │  │ ████████ │          │          │         │          │        ││
│  │  └──────────┘          └──────────┘         └──────────┘        ││
│  │   Resets: Midnight      Refills: 10s        Refills: 1s         ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Methods:                                                            │
│  ├── waitForSlot(type) -> Promise<void>                             │
│  ├── refillTokens() -> void                                         │
│  ├── handleRateLimitResponse(headers) -> void                       │
│  └── getStatus() -> RateLimitStatus                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Webhook Processor Component

```
┌─────────────────────────────────────────────────────────────────────┐
│                      WebhookProcessor                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ secret: string                  // HMAC signing key             ││
│  │ handlers: Map<eventType, fn[]>  // Event handlers               ││
│  │ processedEvents: LRUCache       // Dedup cache                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Webhook Flow:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  Request ──► Validate ──► Parse ──► Dedupe ──► Route ──► ACK   ││
│  │              Signature    Events    Check      Handler          ││
│  │                 │           │         │          │              ││
│  │                 ▼           ▼         ▼          ▼              ││
│  │              Reject     Extract   Skip if    Execute            ││
│  │              if bad     array     duplicate  handlers           ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Methods:                                                            │
│  ├── handleWebhook(request) -> WebhookResponse                      │
│  ├── validateSignature(request) -> boolean                          │
│  ├── processEvent(event) -> ProcessResult                           │
│  └── on(eventType, handler) -> void                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow Architecture

### 3.1 CRM Object Operation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CRM Object Operation Flow                         │
└─────────────────────────────────────────────────────────────────────┘

  1. Request              2. Rate Check           3. Token
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ createObject  │─────▶│ RateLimiter   │─────▶│ TokenManager  │
│ (contact,     │      │               │      │               │
│  properties)  │      │ Check daily   │      │ Get valid     │
│               │      │ Check burst   │      │ access token  │
└───────────────┘      └───────────────┘      └───────┬───────┘
                                                      │
  6. Return             5. Parse                4. Execute
┌───────────────┐      ┌───────────────┐      ┌───────▼───────┐
│ CrmObject     │◀─────│ Response      │◀─────│ HttpClient    │
│               │      │ Parser        │      │               │
│ { id, props,  │      │               │      │ POST /crm/v3/ │
│   createdAt } │      │ Map to types  │      │ objects/      │
└───────────────┘      └───────────────┘      │ contacts      │
                                              └───────────────┘
```

### 3.2 Search Operation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Search Operation Flow                           │
└─────────────────────────────────────────────────────────────────────┘

  Query                    Filter Builder           Rate Check
┌───────────────┐        ┌───────────────┐       ┌───────────────┐
│ searchObjects │───────▶│ Build filter  │──────▶│ Search slot   │
│               │        │ groups        │       │ (4/sec limit) │
│ filters: [    │        │               │       │               │
│  {email: EQ}  │        │ filterGroups: │       │ Wait if       │
│ ]             │        │ [{filters}]   │       │ exhausted     │
└───────────────┘        └───────────────┘       └───────┬───────┘
                                                         │
                                                         ▼
  Paginated              Aggregate                  Execute
  Iterator               Results                   ┌───────────────┐
┌───────────────┐      ┌───────────────┐          │ POST /crm/v3/ │
│ searchAll()   │◀─────│ SearchResult  │◀─────────│ objects/      │
│               │      │               │          │ contacts/     │
│ async gen     │      │ results: []   │          │ search        │
│ yield each    │      │ total: N      │          └───────────────┘
│ object        │      │ paging: {}    │
└───────────────┘      └───────────────┘
```

### 3.3 Batch Operation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Batch Operation Flow                             │
└─────────────────────────────────────────────────────────────────────┘

  Input Array            Chunk                   Execute Chunks
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ batchCreate   │─────▶│ Split into    │─────▶│ For each      │
│ (250 contacts)│      │ 100-item      │      │ chunk:        │
│               │      │ chunks        │      │               │
│               │      │               │      │ - Rate wait   │
│               │      │ [100][100][50]│      │ - Execute     │
└───────────────┘      └───────────────┘      │ - Collect     │
                                              └───────┬───────┘
                                                      │
  Combined Result          Merge                      │
┌───────────────┐      ┌───────────────┐             │
│ BatchResult   │◀─────│ Aggregate     │◀────────────┘
│               │      │               │
│ results: 248  │      │ results: []   │
│ errors: 2     │      │ errors: []    │
└───────────────┘      └───────────────┘
```

---

## 4. Webhook Architecture

### 4.1 Webhook Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Webhook Processing Pipeline                        │
└─────────────────────────────────────────────────────────────────────┘

HubSpot                    Integration                    Application
┌─────────┐              ┌─────────────┐               ┌─────────────┐
│ CRM     │              │  Webhook    │               │  Event      │
│ Event   │─────────────▶│  Endpoint   │──────────────▶│  Handlers   │
│ Trigger │              │             │               │             │
└─────────┘              └──────┬──────┘               └─────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Validation Layer    │
                    ├────────────────────────┤
                    │ 1. Signature Check     │
                    │    x-hubspot-signature │
                    │    HMAC-SHA256         │
                    ├────────────────────────┤
                    │ 2. Timestamp Check     │
                    │    < 5 minutes old     │
                    ├────────────────────────┤
                    │ 3. Deduplication       │
                    │    LRU(eventId)        │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Processing Layer    │
                    ├────────────────────────┤
                    │ 4. Parse Event Array   │
                    │    [{event}, {event}]  │
                    ├────────────────────────┤
                    │ 5. Route to Handlers   │
                    │    contact.creation    │
                    │    deal.propertyChange │
                    ├────────────────────────┤
                    │ 6. Execute & Collect   │
                    │    results             │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼───────────┐
                    │ 7. Acknowledge (200)   │
                    └────────────────────────┘
```

### 4.2 Webhook Event Routing

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Event Type Routing                                │
└─────────────────────────────────────────────────────────────────────┘

Incoming Event                    Handler Registry
┌─────────────────┐              ┌────────────────────────────────────┐
│ {               │              │                                    │
│   eventId: 123, │              │  contact.creation ──► [handler1]  │
│   subscriptionT │──────────────│  contact.propertyChange ──► [h2]  │
│   ype: "contact │              │  deal.creation ──► [handler3]     │
│   .creation",   │              │  deal.deletion ──► [handler4]     │
│   objectId: 456 │              │  * (wildcard) ──► [logHandler]    │
│ }               │              │                                    │
└─────────────────┘              └────────────────────────────────────┘
         │                                        │
         │                                        │
         └──────────────┬─────────────────────────┘
                        ▼
              ┌─────────────────┐
              │ Execute Matched │
              │ Handlers        │
              │                 │
              │ - handler1()    │
              │ - logHandler()  │
              └─────────────────┘
```

---

## 5. Integration Architecture

### 5.1 Platform Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                 LLM Dev Ops Platform Integration                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     LLM Dev Ops Platform                             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Sales Agent  │  │ Marketing    │  │ Support      │               │
│  │ Workflow     │  │ Automation   │  │ Ticket Bot   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│         └────────────┬────┴─────────────────┘                        │
│                      ▼                                               │
│         ┌────────────────────────┐                                  │
│         │    HubSpot Module      │                                  │
│         │                        │                                  │
│         │  - Sync contacts       │                                  │
│         │  - Update deals        │                                  │
│         │  - Create tickets      │                                  │
│         │  - Log activities      │                                  │
│         └───────────┬────────────┘                                  │
│                     │                                                │
│  ┌──────────────────┼──────────────────┐                            │
│  │                  │                  │                            │
│  ▼                  ▼                  ▼                            │
│ ┌────────┐    ┌──────────┐    ┌────────────┐                        │
│ │shared/ │    │ shared/  │    │  shared/   │                        │
│ │auth    │    │ metrics  │    │ tracing    │                        │
│ └────────┘    └──────────┘    └────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      HubSpot CRM                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │Contacts │  │Companies│  │ Deals   │  │ Tickets │                │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Dependency Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Dependency Architecture                          │
└─────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────────┐
                    │      hubspot-api/      │
                    │                        │
                    │  - HubSpotClient       │
                    │  - RateLimiter         │
                    │  - WebhookProcessor    │
                    │  - TokenManager        │
                    └───────────┬────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │   shared/     │   │   shared/     │   │   shared/     │
   │     auth      │   │ observability │   │   tracing     │
   │               │   │               │   │               │
   │ - OAuth mgmt  │   │ - Logger      │   │ - Span        │
   │ - Token store │   │ - Metrics     │   │ - Context     │
   └───────────────┘   └───────────────┘   └───────────────┘

External:
┌───────────────┐
│    crypto     │   Built-in: HMAC-SHA256 for webhooks
└───────────────┘
```

---

## 6. Error Handling Architecture

### 6.1 Error Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Error Handling Flow                             │
└─────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  API Response   │
                         └────────┬────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
            ▼                     ▼                     ▼
    ┌───────────┐         ┌───────────┐         ┌───────────┐
    │ 2xx       │         │ 4xx       │         │ 5xx       │
    │ Success   │         │ Client    │         │ Server    │
    └───────────┘         └─────┬─────┘         └─────┬─────┘
                                │                     │
              ┌─────────────────┼─────────────────────┤
              │                 │                     │
              ▼                 ▼                     ▼
      ┌───────────┐     ┌───────────┐         ┌───────────┐
      │ 400       │     │ 401       │         │ 429       │
      │ Validation│     │ Auth      │         │ Rate Limit│
      └─────┬─────┘     └─────┬─────┘         └─────┬─────┘
            │                 │                     │
            ▼                 ▼                     ▼
      ┌───────────┐     ┌───────────┐         ┌───────────┐
      │ Parse     │     │ Refresh   │         │ Backoff & │
      │ Error     │     │ Token     │         │ Retry     │
      │ Details   │     │ & Retry   │         │           │
      └───────────┘     └───────────┘         └───────────┘
```

### 6.2 Retry Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Retry Decision Tree                            │
└─────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │  Request Failed │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Check Error Type│
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Retryable     │    │ Refreshable   │    │ Non-Retryable │
│               │    │               │    │               │
│ - 429         │    │ - 401         │    │ - 400         │
│ - 500-503     │    │   (expired)   │    │ - 403         │
│ - Timeout     │    │               │    │ - 404         │
│ - Network     │    │               │    │               │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Exponential   │    │ Refresh Token │    │ Throw Error   │
│ Backoff       │    │ Then Retry    │    │ Immediately   │
│               │    │               │    │               │
│ 1s, 2s, 4s... │    │ Once only     │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

---

## 7. Observability Architecture

### 7.1 Metrics Collection

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Metrics Architecture                              │
└─────────────────────────────────────────────────────────────────────┘

HubSpotClient                    Metrics Collector
┌─────────────┐                 ┌─────────────────┐
│ API Request │────────────────▶│ hubspot.requests│
│             │                 │ .total          │
│             │                 │ {method, type}  │
└─────────────┘                 └─────────────────┘

┌─────────────┐                 ┌─────────────────┐
│ Request     │────────────────▶│ hubspot.requests│
│ Duration    │                 │ .duration       │
│             │                 │ (histogram)     │
└─────────────┘                 └─────────────────┘

┌─────────────┐                 ┌─────────────────┐
│ Rate Limit  │────────────────▶│ hubspot.rate_   │
│ State       │                 │ limit.remaining │
│             │                 │ (gauge)         │
└─────────────┘                 └─────────────────┘

┌─────────────┐                 ┌─────────────────┐
│ Webhook     │────────────────▶│ hubspot.webhooks│
│ Received    │                 │ .received       │
│             │                 │ {event_type}    │
└─────────────┘                 └─────────────────┘

Metric Summary:
┌─────────────────────────────────────────────────────────────────────┐
│ hubspot.requests.total      │ Counter   │ Total API requests       │
│ hubspot.requests.duration   │ Histogram │ Request latency          │
│ hubspot.rate_limit.remaining│ Gauge     │ Remaining quota          │
│ hubspot.batch.size          │ Histogram │ Batch operation size     │
│ hubspot.webhooks.received   │ Counter   │ Webhooks received        │
│ hubspot.webhooks.processed  │ Counter   │ Successfully processed   │
│ hubspot.errors              │ Counter   │ Errors by type           │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tracing Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Trace Structure                                │
└─────────────────────────────────────────────────────────────────────┘

Trace: contact-sync-workflow
│
├── Span: hubspot.search
│   ├── object_type: "contacts"
│   ├── filter_count: 2
│   ├── result_count: 150
│   └── duration: 245ms
│
├── Span: hubspot.batch.update
│   ├── object_type: "contacts"
│   ├── batch_size: 100
│   ├── success_count: 98
│   ├── error_count: 2
│   └── duration: 1.2s
│
└── Span: hubspot.batch.update
    ├── object_type: "contacts"
    ├── batch_size: 50
    ├── success_count: 50
    └── duration: 650ms
```

---

## 8. Security Architecture

### 8.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OAuth 2.0 Token Flow                              │
└─────────────────────────────────────────────────────────────────────┘

  Initial Auth                Token Usage              Token Refresh
┌───────────────┐          ┌───────────────┐        ┌───────────────┐
│ User grants   │          │ API Request   │        │ Token expires │
│ access via    │          │ with Bearer   │        │ (401 response)│
│ OAuth flow    │          │ token         │        │               │
└───────┬───────┘          └───────┬───────┘        └───────┬───────┘
        │                          │                        │
        ▼                          ▼                        ▼
┌───────────────┐          ┌───────────────┐        ┌───────────────┐
│ Receive       │          │ TokenManager  │        │ Use refresh   │
│ access_token  │─────────▶│ validates     │───────▶│ token to get  │
│ refresh_token │          │ expiration    │        │ new access    │
│ expires_in    │          │               │        │ token         │
└───────────────┘          └───────────────┘        └───────────────┘
                                                           │
                                                           ▼
                                                    ┌───────────────┐
                                                    │ Store new     │
                                                    │ tokens via    │
                                                    │ onTokenRefresh│
                                                    │ callback      │
                                                    └───────────────┘
```

### 8.2 Webhook Signature Validation

```
┌─────────────────────────────────────────────────────────────────────┐
│               Webhook Signature Validation (v3)                      │
└─────────────────────────────────────────────────────────────────────┘

Incoming Request:
┌─────────────────────────────────────────────────────────────────────┐
│ Headers:                                                            │
│   x-hubspot-signature-v3: "abc123..."                              │
│   x-hubspot-request-timestamp: "1705315200000"                     │
│                                                                      │
│ Body: [{"eventId": 1, "objectId": 456, ...}]                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Signature Computation:                                              │
│                                                                      │
│ signatureBase = method + uri + body + timestamp                    │
│               = "POST" + "/webhook" + "[{...}]" + "1705315200000"  │
│                                                                      │
│ expectedSig = HMAC-SHA256(webhookSecret, signatureBase)            │
│                                                                      │
│ valid = timingSafeEqual(signature, expectedSig)                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment Architecture

### 9.1 Container Deployment

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Container Architecture                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Application Container                             │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                   Node.js Application                            ││
│  │  ┌───────────────────────────────────────────────────────────┐  ││
│  │  │                  HubSpot Module                            │  ││
│  │  │                                                            │  ││
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  ││
│  │  │  │ HubSpot     │  │ Webhook     │  │ Rate        │        │  ││
│  │  │  │ Client      │  │ Processor   │  │ Limiter     │        │  ││
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘        │  ││
│  │  └───────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Ports:                                                              │
│  ├── 8080: HTTP API                                                 │
│  ├── 8081: Webhook endpoint                                         │
│  └── 9090: Metrics                                                  │
│                                                                      │
│  Environment:                                                        │
│  ├── HUBSPOT_ACCESS_TOKEN                                           │
│  ├── HUBSPOT_PORTAL_ID                                              │
│  ├── HUBSPOT_WEBHOOK_SECRET                                         │
│  └── HUBSPOT_DAILY_LIMIT                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Kubernetes Deployment

```yaml
┌─────────────────────────────────────────────────────────────────────┐
│                  Kubernetes Resources                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Deployment: hubspot-integration                                      │
│ ├── replicas: 2                                                     │
│ ├── resources:                                                      │
│ │   ├── requests: { cpu: 100m, memory: 256Mi }                     │
│ │   └── limits: { cpu: 500m, memory: 512Mi }                       │
│ └── env:                                                            │
│     └── from: Secret/hubspot-credentials                           │
├─────────────────────────────────────────────────────────────────────┤
│ Service: hubspot-integration                                        │
│ ├── port: 8080 (API)                                               │
│ └── port: 8081 (Webhooks)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Ingress: hubspot-webhooks                                           │
│ └── host: webhooks.example.com                                     │
│     └── path: /hubspot -> hubspot-integration:8081                 │
├─────────────────────────────────────────────────────────────────────┤
│ Secret: hubspot-credentials                                         │
│ ├── accessToken: <encrypted>                                       │
│ ├── portalId: <encrypted>                                          │
│ └── webhookSecret: <encrypted>                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Testing Architecture

### 10.1 Test Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Testing Architecture                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Unit Tests                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ MockHubSpotClient                                                ││
│  │ - In-memory object storage                                       ││
│  │ - Request capture                                                ││
│  │ - Configurable responses                                         ││
│  │ - Error injection                                                ││
│  └─────────────────────────────────────────────────────────────────┘│
│  Tests: Command building, rate limiting, response parsing           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Integration Tests                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ HubSpot Sandbox Account                                          ││
│  │ - Real API calls                                                 ││
│  │ - Test portal data                                               ││
│  │ - Rate limit testing                                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│  Tests: Full CRUD, search, associations, webhooks                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Replay Tests                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Recorded Request/Response                                        ││
│  │ - Deterministic execution                                        ││
│  │ - Offline testing                                                ││
│  │ - Regression testing                                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│  Tests: Complex workflows, error scenarios                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Mock vs Real Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Test Environment Switching                         │
└─────────────────────────────────────────────────────────────────────┘

Production:                      Testing:
┌─────────────────┐             ┌─────────────────┐
│  HubSpotClient  │             │  HubSpotClient  │
│                 │             │                 │
│  HttpClient ────┼─────────────┼── MockExecutor  │
│  (real HTTP)    │             │  (in-memory)    │
└────────┬────────┘             └────────┬────────┘
         │                               │
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│  HubSpot API    │             │  Mock Responses │
│  api.hubapi.com │             │  (configurable) │
└─────────────────┘             └─────────────────┘

Dependency Injection:
┌─────────────────────────────────────────────────────────────────────┐
│ // Production                                                       │
│ const client = createHubSpotClient({ accessToken, portalId })      │
│                                                                      │
│ // Testing                                                          │
│ const client = createMockHubSpotClient()                           │
│ client.setMockResponse("search:contacts", { results: [...] })      │
└─────────────────────────────────────────────────────────────────────┘
```
