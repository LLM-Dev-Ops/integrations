# Twilio SMS Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/twilio-sms`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/twilio-sms/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # TwilioSmsClient implementation
│   ├── config.rs                 # Configuration types
│   ├── services/
│   │   ├── mod.rs
│   │   ├── messages.rs           # MessageService implementation
│   │   └── lookup.rs             # Message lookup operations
│   ├── webhooks/
│   │   ├── mod.rs
│   │   ├── handler.rs            # WebhookHandler implementation
│   │   ├── inbound.rs            # Inbound message processing
│   │   └── status.rs             # Status callback processing
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── basic.rs              # Basic auth implementation
│   │   └── signature.rs          # Webhook signature validation
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   ├── limiter.rs            # RateLimiter implementation
│   │   └── token_bucket.rs       # Token bucket algorithm
│   ├── compliance/
│   │   ├── mod.rs
│   │   ├── opt_out.rs            # OptOutCache implementation
│   │   └── keywords.rs           # Keyword detection
│   ├── templates/
│   │   ├── mod.rs
│   │   └── engine.rs             # TemplateEngine implementation
│   ├── transport/
│   │   ├── mod.rs
│   │   └── http.rs               # HTTP transport layer
│   ├── types/
│   │   ├── mod.rs
│   │   ├── messages.rs           # Message types
│   │   ├── webhooks.rs           # Webhook payload types
│   │   └── responses.rs          # API response types
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs               # MockTwilioClient
│   │   ├── recorder.rs           # Request/response recording
│   │   └── replayer.rs           # Deterministic replay
│   └── errors.rs                 # Error types
├── tests/
│   ├── unit/
│   ├── integration/
│   └── simulation/
└── benches/
```

### 1.2 TypeScript Structure

```
integrations/twilio-sms/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # TwilioSmsClient
│   ├── config.ts                 # Configuration types
│   ├── services/
│   │   ├── messages.ts           # MessageService
│   │   └── lookup.ts             # Message lookup
│   ├── webhooks/
│   │   ├── handler.ts            # WebhookHandler
│   │   ├── inbound.ts            # Inbound processing
│   │   └── status.ts             # Status callbacks
│   ├── auth/
│   │   ├── basic.ts              # Basic auth
│   │   └── signature.ts          # Signature validation
│   ├── rate-limit/
│   │   ├── limiter.ts            # RateLimiter
│   │   └── token-bucket.ts       # Token bucket
│   ├── compliance/
│   │   ├── opt-out.ts            # OptOutCache
│   │   └── keywords.ts           # Keyword detection
│   ├── templates/
│   │   └── engine.ts             # TemplateEngine
│   ├── types/
│   │   ├── messages.ts           # Message types
│   │   ├── webhooks.ts           # Webhook types
│   │   └── responses.ts          # Response types
│   ├── simulation/
│   │   ├── mock.ts               # MockTwilioClient
│   │   └── recorder.ts           # Recording
│   └── errors.ts                 # Error types
└── tests/
```

---

## 2. Component Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TwilioSmsClient                               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────┐│
│  │ TwilioConfig  │  │TwilioAuthProv │  │      CircuitBreaker           ││
│  │               │  │               │  │   (from shared/resilience)    ││
│  │ - account_sid │  │ - account_sid │  └───────────────────────────────┘│
│  │ - auth_token  │  │ - auth_token  │  ┌───────────────────────────────┐│
│  │ - timeout     │  │               │  │        RateLimiter            ││
│  │ - rate_limit  │  │ +apply_auth() │  │   - global tokens             ││
│  │ - circuit_cfg │  │ +validate_sig │  │   - per-number buckets        ││
│  └───────────────┘  └───────────────┘  └───────────────────────────────┘│
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────┐│
│  │ HttpTransport │  │  OptOutCache  │  │      TemplateEngine           ││
│  │               │  │               │  │   - templates: Map            ││
│  │ - base_url    │  │ - cache: LRU  │  │   +register()                 ││
│  │ - timeout     │  │ - ttl         │  │   +render()                   ││
│  │ +post()       │  │ +is_opted_out │  └───────────────────────────────┘│
│  │ +get()        │  │ +add_opt_out  │                                   │
│  └───────────────┘  └───────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
                │                                    │
                ▼                                    ▼
┌───────────────────────────┐          ┌───────────────────────────────────┐
│     MessageService        │          │       WebhookHandler              │
│                           │          │                                   │
│ +send(request)            │          │ +handle_inbound(request)          │
│ +send_bulk(requests)      │          │ +handle_status_callback(request)  │
│ +get(message_sid)         │          │ +register_handler(pattern, fn)    │
│ +list(filter)             │          │                                   │
│ +cancel(message_sid)      │          │ - handlers: Map<Pattern, Handler> │
└───────────────────────────┘          └───────────────────────────────────┘
```

### 2.2 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                     twilio-sms module                           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────────┐
│    shared/    │    │    shared/    │    │      shared/      │
│  credentials  │    │  resilience   │    │   observability   │
│               │    │               │    │                   │
│ SecretString  │    │ RetryPolicy   │    │ Tracing spans     │
│ CredProvider  │    │ CircuitBreaker│    │ Metrics registry  │
└───────────────┘    │ Backoff       │    │ Structured logs   │
                     └───────────────┘    └───────────────────┘
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
              ┌───────────────┐ ┌───────────────┐
              │    shared/    │ │    shared/    │
              │     http      │ │   webhooks    │
              │               │ │               │
              │ HttpClient    │ │ SignatureVal  │
              │ RequestBuilder│ │ PayloadParser │
              └───────────────┘ └───────────────┘
```

---

## 3. Data Flow Diagrams

### 3.1 Send SMS Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Caller  │────▶│ MessageSvc  │────▶│ Validate     │────▶│ Opt-Out    │
│          │     │   .send()   │     │ Phone Numbers│     │  Check     │
└──────────┘     └─────────────┘     └──────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Rate Limiter  │────▶│ Circuit Breaker│────▶│   Build    │
              │  try_acquire() │     │   is_open()?   │     │  Form Data │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Apply Basic   │────▶│  HTTP POST     │────▶│  Retry on  │
              │  Auth Header   │     │  to Twilio     │     │  Failure   │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Parse JSON    │────▶│ Update Circuit │────▶│  Emit      │
              │  Response      │     │ Breaker State  │     │  Metrics   │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                                                                 ▼
                                                          ┌────────────┐
                                                          │   Return   │
                                                          │   Message  │
                                                          └────────────┘
```

### 3.2 Inbound Webhook Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Twilio  │────▶│  Webhook    │────▶│  Validate    │────▶│ Check for  │
│  POST    │     │  Handler    │     │ X-Twilio-Sig │     │ Opt-Out KW │
└──────────┘     └─────────────┘     └──────────────┘     └────────────┘
                                                                 │
                    ┌────────────────────────────────────────────┤
                    │                                            │
                    ▼                                            ▼
           ┌────────────────┐                           ┌────────────────┐
           │   STOP/END?    │                           │   START/YES?   │
           │   Add to       │                           │   Remove from  │
           │   OptOutCache  │                           │   OptOutCache  │
           └────────────────┘                           └────────────────┘
                    │                                            │
                    └────────────────────┬───────────────────────┘
                                         │
                                         ▼
                               ┌────────────────┐
                               │  Build Inbound │
                               │  Message Obj   │
                               └────────────────┘
                                         │
                                         ▼
                               ┌────────────────┐
                               │  Dispatch to   │
                               │  Registered    │
                               │  Handlers      │
                               └────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
     ┌────────────────┐        ┌────────────────┐         ┌────────────────┐
     │  Handler A     │        │  Handler B     │         │  No Match      │
     │  (matches)     │        │  (no match)    │         │  Empty Resp    │
     └────────────────┘        └────────────────┘         └────────────────┘
              │
              ▼
     ┌────────────────┐
     │  TwiML Response│
     │  or Empty      │
     └────────────────┘
```

### 3.3 Status Callback Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Twilio  │────▶│  Status     │────▶│  Validate    │────▶│   Parse    │
│  POST    │     │  Handler    │     │ Signature    │     │  Payload   │
└──────────┘     └─────────────┘     └──────────────┘     └────────────┘
                                                                 │
                                                                 ▼
                                                        ┌────────────────┐
                                                        │ Create Status  │
                                                        │ Update Object  │
                                                        └────────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┤
                       │                                         │
                       ▼                                         ▼
              ┌────────────────┐                        ┌────────────────┐
              │  Emit Event    │                        │ Update Metrics │
              │  StatusUpdated │                        │ delivery_status│
              └────────────────┘                        └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │ Notify Status  │
              │ Listeners      │
              └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │ Return 200 OK  │
              │ (empty body)   │
              └────────────────┘
```

---

## 4. State Machines

### 4.1 Message Status State Machine

```
                              ┌─────────────────────────────────────┐
                              │                                     │
                              ▼                                     │
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────────┐   │
│ Created │────▶│ Queued  │────▶│ Sending │────▶│    Sent     │   │
└─────────┘     └─────────┘     └─────────┘     └─────────────┘   │
                    │                                   │          │
                    │                                   ▼          │
                    │                           ┌─────────────┐    │
                    │                           │  Delivered  │────┘
                    │                           │  (Terminal) │
                    │                           └─────────────┘
                    │
                    │           ┌─────────────┐
                    ├──────────▶│ Undelivered │
                    │           │  (Terminal) │
                    │           └─────────────┘
                    │
                    │           ┌─────────────┐
                    ├──────────▶│   Failed    │
                    │           │  (Terminal) │
                    │           └─────────────┘
                    │
                    │           ┌─────────────┐
                    └──────────▶│  Canceled   │
                                │  (Terminal) │
                                └─────────────┘

Terminal States: Delivered, Undelivered, Failed, Canceled
```

### 4.2 Rate Limiter State Machine

```
┌───────────────────────────────────────────────────────────────────────┐
│                        Token Bucket State                             │
│                                                                       │
│   tokens: f64          last_refill: Instant                           │
│   ────────────────────────────────────────────────                    │
│                                                                       │
│   ┌─────────────────┐                                                 │
│   │   Refill Check  │◀────────────────────────────────┐               │
│   │                 │                                 │               │
│   │ elapsed = now - │                                 │               │
│   │ last_refill     │                                 │               │
│   └────────┬────────┘                                 │               │
│            │                                          │               │
│            ▼                                          │               │
│   ┌─────────────────┐     ┌─────────────────┐         │               │
│   │  Add Tokens     │────▶│ Cap at Burst    │         │               │
│   │                 │     │     Size        │         │               │
│   │ tokens +=       │     │                 │         │               │
│   │ elapsed * rate  │     │ tokens = min(   │         │               │
│   └─────────────────┘     │  tokens, burst) │         │               │
│                           └────────┬────────┘         │               │
│                                    │                  │               │
│                                    ▼                  │               │
│                           ┌─────────────────┐         │               │
│                           │  Try Acquire    │─────────┤               │
│                           │                 │         │               │
│                           │ tokens >= 1.0?  │         │               │
│                           └────────┬────────┘         │               │
│                              │           │            │               │
│                     Yes ─────┘           └───── No    │               │
│                       │                        │      │               │
│                       ▼                        ▼      │               │
│              ┌─────────────────┐     ┌─────────────┐  │               │
│              │ tokens -= 1.0   │     │   Return    │  │               │
│              │ Return true     │     │   false     │──┘               │
│              └─────────────────┘     └─────────────┘                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.3 Circuit Breaker State Machine

```
                         ┌───────────────────────────────────────────┐
                         │                                           │
         ┌───────────────┼──────────────────┐                        │
         │               │                  │                        │
         │               ▼                  │                        │
         │      ┌─────────────────┐         │                        │
         │      │     CLOSED      │         │                        │
         │      │                 │         │                        │
         │      │ failures = 0    │         │                        │
         │      │ allow requests  │         │                        │
         │      └────────┬────────┘         │                        │
         │               │                  │                        │
         │    Request ───┤                  │                        │
         │               │                  │                        │
         │       ┌───────┴───────┐          │                        │
         │       │               │          │                        │
         │   Success         Failure        │                        │
         │       │               │          │                        │
         │       ▼               ▼          │                        │
         │  ┌─────────┐   ┌───────────┐     │                        │
         │  │ Reset   │   │failures++ │     │                        │
         │  │failures │   │           │     │                        │
         │  │ to 0    │   │ >= thresh?│     │                        │
         │  └────┬────┘   └─────┬─────┘     │                        │
         │       │              │           │                        │
         │       │       Yes ───┤           │                        │
         │       │              │           │                        │
         │       │              ▼           │                        │
         │       │      ┌─────────────────┐ │                        │
         │       │      │      OPEN       │ │                        │
         │       │      │                 │ │                        │
         │       │      │ reject requests │ │                        │
         │       │      │ start timer     │ │                        │
         │       │      └────────┬────────┘ │                        │
         │       │               │          │                        │
         │       │     Timeout ──┘          │                        │
         │       │               │          │                        │
         │       │               ▼          │                        │
         │       │      ┌─────────────────┐ │                        │
         │       │      │   HALF-OPEN     │ │                        │
         │       │      │                 │ │                        │
         │       │      │ allow 1 request │ │                        │
         │       │      └────────┬────────┘ │                        │
         │       │               │          │                        │
         │       │       ┌───────┴───────┐  │                        │
         │       │       │               │  │                        │
         │       │   Success         Failure                         │
         │       │       │               │                           │
         └───────┴───────┘               └───────────────────────────┘
```

---

## 5. Webhook Request Validation

### 5.1 Signature Validation Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Webhook Signature Validation                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. Extract X-Twilio-Signature header                                  │
│     ┌─────────────────────────────────────────────────────────┐        │
│     │ signature = request.headers["X-Twilio-Signature"]       │        │
│     └─────────────────────────────────────────────────────────┘        │
│                                    │                                   │
│                                    ▼                                   │
│  2. Build data string from URL and sorted form params                  │
│     ┌─────────────────────────────────────────────────────────┐        │
│     │ url = "https://example.com/webhook"                     │        │
│     │ params = sort(body.keys())                              │        │
│     │ data = url + join(params.map(k => k + body[k]))         │        │
│     │                                                         │        │
│     │ Example:                                                │        │
│     │   URL: https://example.com/webhook                      │        │
│     │   Body: {From: "+1555...", To: "+1555...", Body: "Hi"}  │        │
│     │   Data: "https://...Body=HiFrom=+1555...To=+1555..."    │        │
│     └─────────────────────────────────────────────────────────┘        │
│                                    │                                   │
│                                    ▼                                   │
│  3. Compute HMAC-SHA1 with auth token                                  │
│     ┌─────────────────────────────────────────────────────────┐        │
│     │ computed = hmac_sha1(auth_token, data)                  │        │
│     │ computed_b64 = base64_encode(computed)                  │        │
│     └─────────────────────────────────────────────────────────┘        │
│                                    │                                   │
│                                    ▼                                   │
│  4. Constant-time comparison                                           │
│     ┌─────────────────────────────────────────────────────────┐        │
│     │ valid = constant_time_compare(computed_b64, signature)  │        │
│     └─────────────────────────────────────────────────────────┘        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Rate Limiting Architecture

### 6.1 Two-Level Rate Limiting

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Rate Limiting System                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Global Rate Limiter                          │    │
│  │                                                                 │    │
│  │    Rate: 10 msg/sec (configurable)                              │    │
│  │    Burst: 30 messages                                           │    │
│  │                                                                 │    │
│  │    ┌─────────────────────────────────────────────────────┐      │    │
│  │    │  Token Bucket                                       │      │    │
│  │    │  [████████████████████░░░░░░░░░░░]                  │      │    │
│  │    │   ^                   ^           ^                 │      │    │
│  │    │   0                current      burst               │      │    │
│  │    └─────────────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                    │
│                         Global Check Passes                             │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                Per-Number Rate Limiters                         │    │
│  │                                                                 │    │
│  │    Rate: 1 msg/sec per number                                   │    │
│  │    Burst: 3 messages per number                                 │    │
│  │                                                                 │    │
│  │    ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐   │    │
│  │    │ +15551234567    │  │ +15559876543    │  │ +15550001111 │   │    │
│  │    │ [███░]          │  │ [██░░]          │  │ [█░░░]       │   │    │
│  │    └─────────────────┘  └─────────────────┘  └──────────────┘   │    │
│  │                                                                 │    │
│  │    Map<PhoneNumber, TokenBucket>                                │    │
│  │    Lazy initialization on first message to number              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Error Handling Architecture

### 7.1 Error Propagation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Error Handling Flow                              │
│                                                                         │
│   Twilio API Response                                                   │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────────┐                                                  │
│   │ Status Code?     │                                                  │
│   └────────┬─────────┘                                                  │
│            │                                                            │
│   ┌────────┼────────┬────────────┬────────────┬──────────────┐          │
│   │        │        │            │            │              │          │
│   ▼        ▼        ▼            ▼            ▼              ▼          │
│  201      400      401          404          429           5xx          │
│   │        │        │            │            │              │          │
│   ▼        ▼        ▼            ▼            ▼              ▼          │
│ Success  Parse    Auth       Not Found   Rate Limit    Server Err      │
│          Error   Error                                                  │
│   │        │        │            │            │              │          │
│   ▼        ▼        ▼            ▼            ▼              ▼          │
│ Return   Extract  Return      Return       Return        Return         │
│ Message  Twilio   AuthError   NotFound    RateLimited   ServerError     │
│          Error               Error        (retryable)   (retryable)     │
│          Code                                                           │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Twilio Error Code Mapping                    │   │
│   │                                                                 │   │
│   │   21211 → InvalidRecipient (non-retryable)                      │   │
│   │   21408 → RateLimited (retryable)                               │   │
│   │   21610 → OptedOut (non-retryable)                              │   │
│   │   30003 → UnreachableNumber (non-retryable)                     │   │
│   │   30005 → CarrierRejected (non-retryable)                       │   │
│   │   ...                                                           │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Integration

### 8.1 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Trace Hierarchy                                 │
│                                                                         │
│   twilio.send_sms                                                       │
│   ├── twilio.validate_phone                                             │
│   │   └── [validation spans]                                            │
│   ├── twilio.check_opt_out                                              │
│   │   └── [cache lookup spans]                                          │
│   ├── twilio.rate_limit                                                 │
│   │   └── [rate limit check spans]                                      │
│   ├── twilio.circuit_breaker                                            │
│   │   └── [circuit check spans]                                         │
│   └── twilio.http_request                                               │
│       ├── [retry attempt 1]                                             │
│       │   └── http.send                                                 │
│       └── [retry attempt 2] (if needed)                                 │
│           └── http.send                                                 │
│                                                                         │
│   Span Attributes:                                                      │
│   - twilio.account_sid (redacted)                                       │
│   - twilio.message_sid                                                  │
│   - twilio.from (redacted phone)                                        │
│   - twilio.to (redacted phone)                                          │
│   - twilio.status                                                       │
│   - twilio.segments                                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Metrics Flow                                  │
│                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│   │   Send      │────▶│  Success    │────▶│  Counter    │               │
│   │   Message   │     │             │     │  twilio_    │               │
│   └─────────────┘     └─────────────┘     │  messages_  │               │
│         │                                 │  sent_total │               │
│         │             ┌─────────────┐     │  {status}   │               │
│         └────────────▶│  Failure    │────▶└─────────────┘               │
│                       │             │                                   │
│                       └─────────────┘                                   │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────┐               │
│   │  Latency    │────────────────────────▶│  Histogram  │               │
│   │  Timer      │                         │  twilio_    │               │
│   └─────────────┘                         │  send_      │               │
│                                           │  latency_   │               │
│                                           │  seconds    │               │
│                                           └─────────────┘               │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────┐               │
│   │  Webhook    │────────────────────────▶│  Counter    │               │
│   │  Received   │                         │  twilio_    │               │
│   └─────────────┘                         │  messages_  │               │
│                                           │  received_  │               │
│                                           │  total      │               │
│                                           └─────────────┘               │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────┐               │
│   │  Rate Limit │────────────────────────▶│  Counter    │               │
│   │  Hit        │                         │  twilio_    │               │
│   └─────────────┘                         │  rate_limit │               │
│                                           │  _hits_total│               │
│                                           └─────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Simulation Architecture

### 9.1 Mock Client Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Mock/Simulation Layer                              │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │                    TwilioSmsClient (trait)                    │     │
│   │                                                               │     │
│   │  +messages() -> MessageService                                │     │
│   │  +webhooks() -> WebhookHandler                                │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                              ▲                                          │
│                              │                                          │
│           ┌──────────────────┴──────────────────┐                       │
│           │                                     │                       │
│   ┌───────────────────┐               ┌───────────────────┐             │
│   │ RealTwilioClient  │               │  MockTwilioClient │             │
│   │                   │               │                   │             │
│   │ - HttpTransport   │               │ - sent_messages   │             │
│   │ - TwilioAuthProv  │               │ - inbound_msgs    │             │
│   │                   │               │ - simulated_resp  │             │
│   │ (Production)      │               │ - should_fail     │             │
│   └───────────────────┘               │                   │             │
│                                       │ (Testing)         │             │
│                                       └───────────────────┘             │
│                                                                         │
│   Usage in Tests:                                                       │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │ let mock = MockTwilioClient::new()                            │     │
│   │     .expect_send("+15551234567")                              │     │
│   │     .with_response("+15551234567", mock_message)              │     │
│   │     .simulate_failure(TwilioSmsError::RateLimited);           │     │
│   │                                                               │     │
│   │ let result = mock.messages().send(request).await;             │     │
│   │ mock.verify()?;                                               │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Record/Replay Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Record/Replay System                                │
│                                                                         │
│   ┌────────────────────────┐     ┌────────────────────────┐             │
│   │     Recording Mode     │     │      Replay Mode       │             │
│   │                        │     │                        │             │
│   │  Request ─┬─▶ Twilio   │     │  Request ────▶ Matcher │             │
│   │           │     │      │     │                  │     │             │
│   │           │     ▼      │     │                  ▼     │             │
│   │           │  Response  │     │           ┌──────────┐ │             │
│   │           │     │      │     │           │ Recording│ │             │
│   │           ▼     ▼      │     │           │   File   │ │             │
│   │        Recorder        │     │           └──────────┘ │             │
│   │           │            │     │                  │     │             │
│   │           ▼            │     │                  ▼     │             │
│   │     ┌──────────┐       │     │           Response     │             │
│   │     │ JSON File│       │     │                        │             │
│   │     └──────────┘       │     │                        │             │
│   └────────────────────────┘     └────────────────────────┘             │
│                                                                         │
│   Recording Format:                                                     │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ {                                                               │   │
│   │   "interactions": [                                             │   │
│   │     {                                                           │   │
│   │       "request": {                                              │   │
│   │         "method": "POST",                                       │   │
│   │         "path": "/Accounts/AC.../Messages.json",                │   │
│   │         "body": { "To": "+15551234567", ... }                   │   │
│   │       },                                                        │   │
│   │       "response": {                                             │   │
│   │         "status": 201,                                          │   │
│   │         "body": { "sid": "SM...", ... }                         │   │
│   │       },                                                        │   │
│   │       "timestamp": "2025-01-01T00:00:00Z"                       │   │
│   │     }                                                           │   │
│   │   ]                                                             │   │
│   │ }                                                               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Security Architecture

### 10.1 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Credential Security Model                            │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    SecretString Wrapper                         │   │
│   │                                                                 │   │
│   │   struct SecretString(String)                                   │   │
│   │                                                                 │   │
│   │   - No Debug impl (prevents accidental logging)                 │   │
│   │   - Zeroize on drop (memory security)                           │   │
│   │   - expose() -> &str (explicit access required)                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Auth Token Flow                              │   │
│   │                                                                 │   │
│   │   Environment/Vault                                             │   │
│   │         │                                                       │   │
│   │         ▼                                                       │   │
│   │   ┌─────────────┐                                               │   │
│   │   │CredProvider │  (from shared/credentials)                    │   │
│   │   └──────┬──────┘                                               │   │
│   │          │                                                      │   │
│   │          ▼                                                      │   │
│   │   ┌─────────────┐                                               │   │
│   │   │SecretString │  (wrapped, protected)                         │   │
│   │   └──────┬──────┘                                               │   │
│   │          │                                                      │   │
│   │          ▼  expose() only at auth application point             │   │
│   │   ┌─────────────┐                                               │   │
│   │   │ Basic Auth  │  Authorization: Basic base64(sid:token)       │   │
│   │   │   Header    │                                               │   │
│   │   └─────────────┘                                               │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Phone Number Redaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PII Redaction in Logs                                │
│                                                                         │
│   Input: +15551234567                                                   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │   Redaction Rules:                                              │   │
│   │                                                                 │   │
│   │   Full:    +15551234567  →  +1555***4567                        │   │
│   │   Partial: +15551234567  →  +1*********67                       │   │
│   │   Hash:    +15551234567  →  hash:a1b2c3d4                       │   │
│   │                                                                 │   │
│   │   Configurable per log level:                                   │   │
│   │   - ERROR/WARN: Partial redaction                               │   │
│   │   - INFO: Full redaction                                        │   │
│   │   - DEBUG: Hash only                                            │   │
│   │   - TRACE: Full (development only)                              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   Implementation:                                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │   fn redact_phone(number: &str, level: RedactLevel) -> String   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Thread Safety Model

### 11.1 Concurrency Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Thread Safety Design                                 │
│                                                                         │
│   TwilioSmsClient: Arc<Inner>                                           │
│   ├── config: TwilioConfig (immutable)                                  │
│   ├── auth: TwilioAuthProvider (immutable)                              │
│   ├── transport: HttpClient (Send + Sync)                               │
│   ├── rate_limiter: Arc<RateLimiter>                                    │
│   │   ├── tokens: AtomicF64                                             │
│   │   ├── last_refill: AtomicInstant                                    │
│   │   └── per_number: DashMap<String, TokenBucket>                      │
│   ├── circuit_breaker: Arc<CircuitBreaker>                              │
│   │   ├── state: AtomicU8                                               │
│   │   ├── failures: AtomicU32                                           │
│   │   └── last_failure: AtomicInstant                                   │
│   └── opt_out_cache: Arc<RwLock<LruCache>>                              │
│                                                                         │
│   Concurrency Guarantees:                                               │
│   - Client is Clone + Send + Sync                                       │
│   - Safe to share across tokio tasks                                    │
│   - Rate limiter uses atomic operations                                 │
│   - Cache uses RwLock for read-heavy workload                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture phase |

---

**Next Phase:** Refinement - Edge case handling, error recovery procedures, performance optimizations, and security hardening.
