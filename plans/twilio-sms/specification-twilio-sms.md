# Twilio SMS Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/twilio-sms`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements for the Twilio SMS Integration Module. It provides a production-ready interface for sending and receiving SMS messages for alerts, notifications, and workflow interactions within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Twilio SMS Integration Module provides a **thin adapter layer** that:
- Sends SMS messages via Twilio API
- Receives inbound SMS via webhooks
- Tracks message delivery status
- Handles opt-in/opt-out compliance
- Integrates with shared auth, logging, and observability
- Enables simulation/replay of messaging flows

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Send SMS** | Single and bulk message sending |
| **Receive SMS** | Webhook handling for inbound messages |
| **Delivery Status** | Track sent/delivered/failed states |
| **Opt-out Handling** | Respect STOP/START keywords |
| **Rate Limiting** | Client-side throttling |
| **Message Lookup** | Query message status by SID |
| **Resilience** | Retry, circuit breaker |
| **Observability** | Tracing, metrics for messaging |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Send SMS | Single and batch messages |
| Receive SMS | Inbound webhook processing |
| Status callbacks | Delivery status webhooks |
| Message lookup | Query by SID |
| Opt-out list | Read opt-out status |
| Rate limiting | Client-side throttling |
| Message scheduling | Delayed send |
| MMS (basic) | Media message support |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Phone number purchase | Infrastructure provisioning |
| Messaging service creation | Infrastructure provisioning |
| A2P 10DLC registration | Compliance/provisioning |
| Carrier lookup | Separate service |
| Voice calls | Separate integration |
| WhatsApp/other channels | Separate integrations |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| Webhook-ready | Inbound message handling |
| No panics | Reliability |
| Trait-based | Testability |
| Account SID/Auth Token | Twilio standard |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Twilio credential management |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport |
| `shared/webhooks` | Webhook signature validation |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `serde` / `serde_json` | Serialization |
| `async-trait` | Async trait support |
| `thiserror` | Error derivation |
| `chrono` | Timestamps |
| `hmac` / `sha1` | Webhook signature |
| `url` | URL encoding |
| `base64` | Encoding |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `twilio-rs` | This module IS the integration |
| Full Twilio SDK | Use internal implementations |

---

## 4. API Coverage

### 4.1 Twilio REST API

**Base URL:** `https://api.twilio.com/2010-04-01`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Send Message | POST | `/Accounts/{AccountSid}/Messages.json` |
| Get Message | GET | `/Accounts/{AccountSid}/Messages/{Sid}.json` |
| List Messages | GET | `/Accounts/{AccountSid}/Messages.json` |
| Cancel Message | POST | `/Accounts/{AccountSid}/Messages/{Sid}.json` |

### 4.2 Send Message Request

```
POST /Accounts/{AccountSid}/Messages.json
Content-Type: application/x-www-form-urlencoded

To=+15551234567
From=+15559876543
Body=Your verification code is 123456
StatusCallback=https://example.com/status
ValidityPeriod=3600
ScheduleType=fixed
SendAt=2025-01-01T12:00:00Z
```

### 4.3 Message Response

```json
{
  "sid": "SMxxxxx",
  "account_sid": "ACxxxxx",
  "messaging_service_sid": null,
  "from": "+15559876543",
  "to": "+15551234567",
  "body": "Your verification code is 123456",
  "status": "queued",
  "direction": "outbound-api",
  "date_created": "2025-01-01T00:00:00Z",
  "date_sent": null,
  "date_updated": "2025-01-01T00:00:00Z",
  "price": null,
  "price_unit": "USD",
  "error_code": null,
  "error_message": null,
  "num_segments": 1,
  "num_media": 0
}
```

### 4.4 Message Status Values

| Status | Description | Terminal |
|--------|-------------|----------|
| `queued` | Accepted, waiting to send | No |
| `sending` | Being sent to carrier | No |
| `sent` | Sent to carrier | No |
| `delivered` | Confirmed delivered | Yes |
| `undelivered` | Failed to deliver | Yes |
| `failed` | Could not send | Yes |
| `canceled` | Canceled before send | Yes |

### 4.5 Status Callback Webhook

```
POST /your-callback-url
Content-Type: application/x-www-form-urlencoded

MessageSid=SMxxxxx
MessageStatus=delivered
To=+15551234567
From=+15559876543
ErrorCode=
ErrorMessage=
```

### 4.6 Inbound Message Webhook

```
POST /your-webhook-url
Content-Type: application/x-www-form-urlencoded

MessageSid=SMxxxxx
AccountSid=ACxxxxx
From=+15551234567
To=+15559876543
Body=Hello from user
NumMedia=0
```

### 4.7 Authentication

**Basic Auth:**
```
Authorization: Basic base64(AccountSid:AuthToken)
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
TwilioSmsError
├── ConfigurationError
│   ├── InvalidAccountSid
│   ├── InvalidAuthToken
│   └── InvalidPhoneNumber
│
├── AuthenticationError
│   ├── InvalidCredentials
│   └── AccountSuspended
│
├── MessageError
│   ├── InvalidRecipient
│   ├── InvalidSender
│   ├── MessageTooLong
│   ├── OptedOut
│   ├── UnreachableNumber
│   └── CarrierRejected
│
├── RateLimitError
│   ├── AccountRateLimited
│   ├── NumberRateLimited
│   └── QueueFull
│
├── WebhookError
│   ├── InvalidSignature
│   ├── PayloadParseError
│   └── MissingFields
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── DnsResolutionFailed
│
└── ServerError
    ├── InternalError
    ├── ServiceUnavailable
    └── TemporarilyUnavailable
```

### 5.2 Twilio Error Code Mapping

| Code | Error Type | Retryable |
|------|------------|-----------|
| 20003 | `AuthenticationError` | No |
| 21211 | `MessageError::InvalidRecipient` | No |
| 21408 | `RateLimitError` | Yes |
| 21610 | `MessageError::OptedOut` | No |
| 21614 | `MessageError::InvalidRecipient` | No |
| 30003 | `MessageError::UnreachableNumber` | No |
| 30005 | `MessageError::CarrierRejected` | No |
| 30006 | `MessageError::CarrierRejected` | No |
| 30007 | `MessageError::CarrierRejected` | No |
| 429 | `RateLimitError` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `RateLimitError` | Yes | 5 | Exponential (1s base) |
| `ServiceUnavailable` | Yes | 3 | Exponential (2s base) |
| `InternalError` | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `ConnectionFailed` | Yes | 3 | Exponential (500ms) |

### 6.2 Rate Limiting

| Limit Type | Default | Configurable |
|------------|---------|--------------|
| Messages per second | 10 | Yes |
| Burst size | 30 | Yes |
| Per-number limit | 1/sec | Yes |

### 6.3 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `twilio.send_sms` | `to`, `from`, `message_sid`, `status` |
| `twilio.receive_sms` | `from`, `to`, `message_sid` |
| `twilio.status_callback` | `message_sid`, `status` |
| `twilio.lookup` | `message_sid` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `twilio_messages_sent_total` | Counter | `status`, `from_number` |
| `twilio_messages_received_total` | Counter | `to_number` |
| `twilio_send_latency_seconds` | Histogram | - |
| `twilio_delivery_status_total` | Counter | `status` |
| `twilio_errors_total` | Counter | `error_type` |
| `twilio_rate_limit_hits_total` | Counter | - |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Send failures, auth errors |
| WARN | Rate limiting, retries, opt-outs |
| INFO | Message sent/received, status updates |
| DEBUG | Request/response details |
| TRACE | Full payloads (redacted) |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Auth token never logged | `SecretString` wrapper |
| Account SID protected | Minimal exposure |
| Webhook secrets secured | Signature validation |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Enforced |
| HTTPS only | No HTTP fallback |
| Certificate validation | Enabled |

### 8.3 Webhook Security

| Requirement | Implementation |
|-------------|----------------|
| Signature validation | X-Twilio-Signature header |
| Replay protection | Timestamp validation |
| URL validation | Whitelist callback URLs |

### 8.4 Data Protection

| Requirement | Implementation |
|-------------|----------------|
| PII redaction in logs | Phone number masking |
| Message body protection | Optional redaction |
| Opt-out compliance | Automatic handling |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Send SMS | < 200ms | < 1s |
| Webhook processing | < 50ms | < 200ms |
| Message lookup | < 100ms | < 500ms |
| Status callback | < 50ms | < 200ms |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Messages per second | 100+ |
| Concurrent sends | 50+ |
| Webhook concurrency | 100+ |

---

## 10. Enterprise Features

### 10.1 Delivery Tracking

| Feature | Description |
|---------|-------------|
| Status callbacks | Real-time delivery updates |
| Status polling | Query message status |
| Batch status | Bulk status lookup |

### 10.2 Opt-out Management

| Feature | Description |
|---------|-------------|
| Auto opt-out | Detect STOP keywords |
| Auto opt-in | Detect START keywords |
| Opt-out check | Pre-send validation |
| Opt-out list | Query opted-out numbers |

### 10.3 Message Templates

| Feature | Description |
|---------|-------------|
| Template rendering | Variable substitution |
| Template validation | Pre-send validation |

### 10.4 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Simulate send/receive |
| Record mode | Capture message flows |
| Replay mode | Deterministic testing |
| Magic numbers | Test phone numbers |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Send single SMS
- [ ] Send bulk SMS
- [ ] Receive inbound SMS (webhook)
- [ ] Status callback handling
- [ ] Message lookup by SID
- [ ] Scheduled message send
- [ ] Opt-out detection (STOP)
- [ ] Opt-in detection (START)
- [ ] Pre-send opt-out check
- [ ] MMS with media URL
- [ ] Webhook signature validation
- [ ] Rate limiting (client-side)

### 11.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Phone numbers redacted in logs
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for message sending, webhook handling, rate limiting, and opt-out management.
