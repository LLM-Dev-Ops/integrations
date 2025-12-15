# HubSpot API Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/hubspot-api`

---

## 1. Overview

### 1.1 Purpose Statement

The HubSpot API Integration Module provides a **thin adapter layer** that:
- Connects the LLM Dev Ops platform to HubSpot CRM, Marketing, and Sales APIs
- Enables CRUD operations on CRM objects (Contacts, Companies, Deals, Tickets)
- Supports search, filtering, and association management
- Handles webhook events for real-time CRM updates
- Manages rate limits and API quotas intelligently
- Enables simulation/replay of HubSpot interactions for testing

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to HubSpot APIs

---

## 2. Scope Boundaries

### 2.1 In Scope

| Category | Capabilities |
|----------|-------------|
| **CRM Objects** | Contacts, Companies, Deals, Tickets, Custom Objects |
| **Object Operations** | Create, Read, Update, Delete, Batch operations |
| **Search & Filter** | CRM search API, property filters, sorting, pagination |
| **Associations** | Create, read, delete object associations |
| **Pipelines** | Read pipelines, stages, move deals/tickets |
| **Lists** | Static/dynamic list management, membership |
| **Owners** | Owner assignment, team access |
| **Properties** | Read property definitions, validate values |
| **Webhooks** | Receive, validate, route CRM events |
| **Workflows** | Trigger workflow enrollments |
| **Engagements** | Notes, emails, calls, meetings, tasks |
| **Rate Limiting** | Quota tracking, backoff, request prioritization |
| **Replay** | Deterministic re-execution of API calls |

### 2.2 Out of Scope

| Item | Reason |
|------|--------|
| HubSpot account setup | Configuration scope |
| Custom object schema creation | Admin portal scope |
| OAuth app registration | Infrastructure scope |
| Marketing email design | HubSpot UI scope |
| Form/landing page creation | HubSpot UI scope |
| Reporting dashboards | HubSpot UI scope |
| HubSpot CMS operations | Separate integration |

### 2.3 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No business logic duplication |
| Rate limit aware | HubSpot enforces strict quotas |
| Idempotent operations | Safe retry, replay support |
| OAuth 2.0 preferred | Enterprise security requirement |
| Webhook signature validation | Security requirement |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/auth` | OAuth token management |
| `shared/observability` | Logging, metrics emission |
| `shared/tracing` | Span creation for API calls |
| `shared/http` | HTTP client with retry logic |

### 3.2 External Dependencies

| Package | Purpose |
|---------|---------|
| `@hubspot/api-client` | Official HubSpot SDK (optional) |
| Native `fetch` | Direct API calls |
| `crypto` | Webhook signature verification |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| Direct database access | Use HubSpot APIs only |
| Third-party CRM adapters | Maintain thin adapter |

---

## 4. API Coverage

### 4.1 CRM Object Operations

| Operation | Endpoint Pattern | Description |
|-----------|------------------|-------------|
| `createObject` | `POST /crm/v3/objects/{type}` | Create single object |
| `getObject` | `GET /crm/v3/objects/{type}/{id}` | Get by ID |
| `updateObject` | `PATCH /crm/v3/objects/{type}/{id}` | Update properties |
| `deleteObject` | `DELETE /crm/v3/objects/{type}/{id}` | Archive object |
| `batchCreate` | `POST /crm/v3/objects/{type}/batch/create` | Bulk create |
| `batchRead` | `POST /crm/v3/objects/{type}/batch/read` | Bulk read by IDs |
| `batchUpdate` | `POST /crm/v3/objects/{type}/batch/update` | Bulk update |
| `batchArchive` | `POST /crm/v3/objects/{type}/batch/archive` | Bulk delete |

### 4.2 Search Operations

| Operation | Description |
|-----------|-------------|
| `searchObjects` | CRM search with filters, sorting, pagination |
| `filterByProperty` | Query by property value |
| `filterByAssociation` | Query by associated objects |
| `searchWithQuery` | Full-text search across properties |

### 4.3 Association Operations

| Operation | Description |
|-----------|-------------|
| `createAssociation` | Link two objects |
| `getAssociations` | Get associated objects |
| `deleteAssociation` | Remove association |
| `batchAssociate` | Bulk association management |

### 4.4 Pipeline Operations

| Operation | Description |
|-----------|-------------|
| `getPipelines` | List deal/ticket pipelines |
| `getPipelineStages` | Get stages for pipeline |
| `moveToPipelineStage` | Update object stage |

### 4.5 Engagement Operations

| Operation | Description |
|-----------|-------------|
| `createEngagement` | Create note, email, call, meeting, task |
| `getEngagements` | List engagements for object |
| `updateEngagement` | Modify engagement |
| `logActivity` | Log custom activity |

### 4.6 Webhook Operations

| Operation | Description |
|-----------|-------------|
| `validateSignature` | Verify webhook authenticity |
| `parseEvent` | Parse webhook payload |
| `routeEvent` | Dispatch to handlers |
| `acknowledgeEvent` | Respond to HubSpot |

---

## 5. Configuration

### 5.1 Client Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `accessToken` | string | required | OAuth or private app token |
| `portalId` | string | required | HubSpot portal/account ID |
| `apiVersion` | string | `"v3"` | API version |
| `baseUrl` | string | `"https://api.hubapi.com"` | API base URL |
| `timeout` | number | `30000` | Request timeout (ms) |
| `maxRetries` | number | `3` | Retry attempts |
| `rateLimitBuffer` | number | `0.1` | Reserve 10% of quota |

### 5.2 Rate Limit Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dailyLimit` | number | `500000` | Daily API calls (Enterprise) |
| `burstLimit` | number | `100` | Requests per 10 seconds |
| `searchLimit` | number | `4` | Search requests per second |
| `batchSize` | number | `100` | Max items per batch |

### 5.3 Webhook Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `webhookSecret` | string | required | Signature verification key |
| `maxEventAge` | number | `300000` | Max event age (5 min) |
| `retryWebhooks` | boolean | `true` | Enable retry handling |

---

## 6. Object Model

### 6.1 Supported Object Types

| Object Type | API Name | Key Properties |
|-------------|----------|----------------|
| Contact | `contacts` | email, firstname, lastname, phone |
| Company | `companies` | name, domain, industry |
| Deal | `deals` | dealname, amount, dealstage, pipeline |
| Ticket | `tickets` | subject, content, hs_pipeline_stage |
| Product | `products` | name, price, hs_sku |
| Line Item | `line_items` | quantity, price, hs_product_id |
| Quote | `quotes` | hs_title, hs_expiration_date |
| Custom Object | `{schemaId}` | User-defined properties |

### 6.2 Common Property Types

| Type | Validation | Example |
|------|------------|---------|
| `string` | Max length | `"John Doe"` |
| `number` | Numeric | `50000` |
| `date` | ISO 8601 | `"2025-01-15"` |
| `datetime` | Unix ms | `1705315200000` |
| `enumeration` | Valid option | `"lead"` |
| `bool` | `true`/`false` | `true` |

---

## 7. Error Taxonomy

### 7.1 Error Hierarchy

```
HubSpotError
├── AuthenticationError
│   ├── InvalidToken
│   ├── ExpiredToken
│   └── InsufficientScopes
│
├── RateLimitError
│   ├── DailyLimitExceeded
│   ├── BurstLimitExceeded
│   └── SearchLimitExceeded
│
├── ValidationError
│   ├── InvalidProperty
│   ├── MissingRequired
│   ├── InvalidFormat
│   └── DuplicateValue
│
├── ObjectError
│   ├── ObjectNotFound
│   ├── ObjectArchived
│   ├── AssociationNotAllowed
│   └── PipelineStageInvalid
│
├── WebhookError
│   ├── InvalidSignature
│   ├── ExpiredEvent
│   └── MalformedPayload
│
└── NetworkError
    ├── Timeout
    ├── ConnectionFailed
    └── ServiceUnavailable
```

### 7.2 Error Handling Strategy

| Error Type | Handling | Retry |
|------------|----------|-------|
| `RateLimitExceeded` | Wait for reset, queue | Yes (with backoff) |
| `InvalidToken` | Refresh token | Once |
| `ObjectNotFound` | Return null/error | No |
| `ValidationError` | Return details | No |
| `Timeout` | Retry with backoff | Yes (3x) |
| `ServiceUnavailable` | Circuit breaker | Yes (exponential) |

---

## 8. Rate Limiting Strategy

### 8.1 HubSpot Rate Limits

| Tier | Daily Limit | Burst (10s) | Search/sec |
|------|-------------|-------------|------------|
| Free | 100 | 10 | 2 |
| Starter | 250,000 | 100 | 4 |
| Professional | 500,000 | 150 | 5 |
| Enterprise | 1,000,000 | 200 | 10 |

### 8.2 Rate Limit Management

| Strategy | Description |
|----------|-------------|
| Token bucket | Track remaining quota |
| Request prioritization | Queue low-priority requests |
| Burst smoothing | Spread requests evenly |
| Quota reservation | Hold buffer for critical ops |
| Retry-After respect | Honor HubSpot headers |

---

## 9. Webhook Events

### 9.1 Supported Event Types

| Category | Events |
|----------|--------|
| **Contact** | `contact.creation`, `contact.propertyChange`, `contact.deletion` |
| **Company** | `company.creation`, `company.propertyChange`, `company.deletion` |
| **Deal** | `deal.creation`, `deal.propertyChange`, `deal.deletion` |
| **Ticket** | `ticket.creation`, `ticket.propertyChange`, `ticket.deletion` |
| **Conversation** | `conversation.creation`, `conversation.newMessage` |
| **Form** | `form.submission` |
| **List** | `list.membership.added`, `list.membership.removed` |

### 9.2 Webhook Payload Structure

```typescript
interface WebhookEvent {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource: string;
}
```

---

## 10. Security Requirements

### 10.1 Authentication

| Method | Use Case |
|--------|----------|
| OAuth 2.0 | Multi-portal, user context |
| Private App Token | Single portal, service context |
| API Key (deprecated) | Legacy support only |

### 10.2 Permission Scopes

| Scope | Access |
|-------|--------|
| `crm.objects.contacts.read` | Read contacts |
| `crm.objects.contacts.write` | Create/update contacts |
| `crm.objects.companies.read/write` | Company access |
| `crm.objects.deals.read/write` | Deal access |
| `crm.objects.custom.read/write` | Custom objects |
| `crm.schemas.read` | Read object schemas |
| `automation` | Workflow triggers |

### 10.3 Webhook Security

| Requirement | Implementation |
|-------------|----------------|
| Signature validation | HMAC-SHA256 verification |
| Timestamp validation | Reject events > 5 min old |
| Replay prevention | Track processed eventIds |
| HTTPS only | Reject non-TLS callbacks |

---

## 11. Observability Requirements

### 11.1 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `hubspot.requests.total` | Counter | method, object_type, status |
| `hubspot.requests.duration` | Histogram | method, object_type |
| `hubspot.rate_limit.remaining` | Gauge | limit_type |
| `hubspot.rate_limit.resets` | Counter | limit_type |
| `hubspot.webhooks.received` | Counter | event_type |
| `hubspot.webhooks.processed` | Counter | event_type, status |
| `hubspot.batch.size` | Histogram | operation |
| `hubspot.errors` | Counter | error_type |

### 11.2 Logging

| Level | Events |
|-------|--------|
| ERROR | API failures, auth errors, webhook validation failures |
| WARN | Rate limit approaching, retries, deprecated API usage |
| INFO | Object CRUD operations, webhook events processed |
| DEBUG | Request/response details, rate limit state |

### 11.3 Tracing

| Span | Attributes |
|------|------------|
| `hubspot.api` | method, object_type, object_id, status_code |
| `hubspot.search` | object_type, filter_count, result_count |
| `hubspot.batch` | operation, batch_size, success_count |
| `hubspot.webhook` | event_type, event_id, processing_time |

---

## 12. Performance Requirements

### 12.1 Latency Targets

| Operation | Target |
|-----------|--------|
| Single object read | < 200ms |
| Single object create/update | < 300ms |
| Batch operation (100 items) | < 2s |
| Search query | < 500ms |
| Webhook processing | < 100ms |

### 12.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 50 |
| Batch operations/sec | 5 |
| Webhooks/sec | 100 |
| Search queries/sec | 4 (API limit) |

---

## 13. Testing Requirements

### 13.1 Mock Client

Provide `MockHubSpotClient` for testing:
- Simulates API responses
- Captures request parameters
- Supports failure injection
- Tracks rate limit simulation

### 13.2 Replay Support

| Feature | Description |
|---------|-------------|
| Request recording | Capture API calls with responses |
| Deterministic replay | Re-execute with same results |
| Webhook simulation | Inject test webhook events |
| Rate limit simulation | Test quota exhaustion scenarios |

---

## 14. Acceptance Criteria

### 14.1 Functional

- [ ] CRUD operations work for all CRM object types
- [ ] Batch operations handle 100+ items
- [ ] Search supports filters, sorting, pagination
- [ ] Associations can be created and queried
- [ ] Webhooks validate and route correctly
- [ ] Rate limits are respected automatically
- [ ] Token refresh works transparently

### 14.2 Non-Functional

- [ ] No data loss during rate limit backoff
- [ ] Graceful degradation on API errors
- [ ] Webhook signature validation secure
- [ ] Mock client enables full test coverage
- [ ] Replay produces deterministic results
