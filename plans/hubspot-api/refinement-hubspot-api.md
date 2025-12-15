# HubSpot API Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/hubspot-api`

---

## 1. Overview

### 1.1 Refinement Goals

This document addresses:
- Performance optimizations for high-volume CRM operations
- Edge cases in rate limiting and API behavior
- Security hardening for production deployment
- Webhook reliability and delivery guarantees
- Testing strategies for CRM workflows
- Operational considerations for enterprise scale

### 1.2 Key Refinement Areas

| Area | Priority | Impact |
|------|----------|--------|
| Rate limit optimization | High | Throughput, reliability |
| Batch operation efficiency | High | Performance |
| Webhook idempotency | High | Data integrity |
| Token refresh reliability | High | Availability |
| Search optimization | Medium | Performance |
| Error recovery | Medium | Reliability |
| Request deduplication | Medium | Cost savings |

---

## 2. Performance Optimizations

### 2.1 Request Batching Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Automatic Request Batching                        │
└─────────────────────────────────────────────────────────────────────┘

Problem: Many individual requests waste API quota

Solution: Aggregate requests within time window

┌─────────────────────────────────────────────────────────────────────┐
│ CLASS RequestAggregator:                                            │
│     pending: Map<ObjectType, PendingBatch>                         │
│     flushInterval: number = 50  // ms                              │
│                                                                      │
│     ASYNC FUNCTION queueCreate(type, properties) -> Promise<Object>:│
│         batch = this.getOrCreateBatch(type, "create")              │
│                                                                      │
│         // Add to pending batch                                     │
│         deferred = new Deferred()                                   │
│         batch.items.push({ properties, deferred })                  │
│                                                                      │
│         // Schedule flush if first item                             │
│         IF batch.items.length === 1:                                │
│             setTimeout(() => this.flushBatch(type, "create"),      │
│                        this.flushInterval)                          │
│                                                                      │
│         // Flush immediately if batch full                          │
│         IF batch.items.length >= 100:                               │
│             this.flushBatch(type, "create")                         │
│                                                                      │
│         RETURN deferred.promise                                     │
│                                                                      │
│     ASYNC FUNCTION flushBatch(type, operation):                     │
│         batch = this.pending.get(`${type}:${operation}`)           │
│         IF NOT batch OR batch.items.length === 0:                  │
│             RETURN                                                  │
│                                                                      │
│         items = batch.items                                         │
│         batch.items = []                                            │
│                                                                      │
│         TRY:                                                        │
│             results = await client.batchCreate(type,               │
│                 items.map(i => i.properties))                       │
│                                                                      │
│             // Resolve individual promises                          │
│             FOR i, item IN items:                                   │
│                 IF results.results[i]:                              │
│                     item.deferred.resolve(results.results[i])       │
│                 ELSE:                                               │
│                     item.deferred.reject(results.errors[i])        │
│         CATCH error:                                                │
│             FOR item IN items:                                      │
│                 item.deferred.reject(error)                         │
└─────────────────────────────────────────────────────────────────────┘

Benefits:
- Reduces API calls by up to 100x
- Stays within rate limits
- Transparent to callers
```

### 2.2 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HTTP Connection Optimization                      │
└─────────────────────────────────────────────────────────────────────┘

Configuration:
┌─────────────────────────────────────────────────────────────────────┐
│ httpAgent = new https.Agent({                                       │
│     keepAlive: true,                                                │
│     keepAliveMsecs: 30000,                                          │
│     maxSockets: 50,          // Per host                           │
│     maxFreeSockets: 10,      // Idle connections                   │
│     scheduling: "fifo"       // Fair queuing                       │
│ })                                                                  │
│                                                                      │
│ // DNS caching                                                      │
│ dnsCache = new Map()                                                │
│ dnsTTL = 300000  // 5 minutes                                      │
└─────────────────────────────────────────────────────────────────────┘

Impact:
- Eliminates TCP handshake latency (~50ms saved)
- Reduces TLS negotiation overhead
- Better connection reuse under load
```

### 2.3 Search Optimization

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Search Query Optimization                         │
└─────────────────────────────────────────────────────────────────────┘

1. Property Selection (reduce payload):
┌─────────────────────────────────────────────────────────────────────┐
│ // BAD: Returns all properties                                      │
│ await client.searchObjects("contacts", { filters })                │
│                                                                      │
│ // GOOD: Only needed properties                                     │
│ await client.searchObjects("contacts", {                           │
│     filters,                                                        │
│     properties: ["email", "firstname", "lastname"]                 │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘

2. Filter Optimization:
┌─────────────────────────────────────────────────────────────────────┐
│ // Use indexed properties for primary filters                       │
│ indexedProperties = ["email", "hs_object_id", "createdate"]        │
│                                                                      │
│ // Combine filters in single group when possible (AND)             │
│ filters: [                                                          │
│     { property: "email", operator: "CONTAINS", value: "@acme" },   │
│     { property: "createdate", operator: "GT", value: timestamp }   │
│ ]                                                                   │
│                                                                      │
│ // Use IN operator for multiple values                             │
│ { property: "hs_lead_status", operator: "IN",                      │
│   values: ["NEW", "OPEN", "QUALIFIED"] }                           │
└─────────────────────────────────────────────────────────────────────┘

3. Pagination Strategy:
┌─────────────────────────────────────────────────────────────────────┐
│ // For large result sets, use cursor-based pagination              │
│ ASYNC FUNCTION* searchAllOptimized(type, query):                    │
│     cursor = null                                                   │
│     batchSize = 100  // Max allowed                                │
│                                                                      │
│     WHILE true:                                                     │
│         result = await client.searchObjects(type, {                │
│             ...query,                                               │
│             limit: batchSize,                                       │
│             after: cursor                                           │
│         })                                                          │
│                                                                      │
│         YIELD* result.results                                       │
│                                                                      │
│         IF NOT result.paging?.next:                                │
│             BREAK                                                   │
│                                                                      │
│         cursor = result.paging.next                                 │
│                                                                      │
│         // Rate limit between pages                                 │
│         await sleep(250)  // 4 searches/sec limit                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.4 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Response Caching                                │
└─────────────────────────────────────────────────────────────────────┘

Cacheable Resources:
┌─────────────────────────────────────────────────────────────────────┐
│ Resource          │ TTL      │ Invalidation                        │
├───────────────────┼──────────┼─────────────────────────────────────┤
│ Pipelines         │ 1 hour   │ Manual or webhook                   │
│ Pipeline stages   │ 1 hour   │ Manual or webhook                   │
│ Property schemas  │ 1 hour   │ Manual                              │
│ Owners list       │ 5 min    │ On 404 during assignment            │
│ Object by ID      │ 30 sec   │ On update/webhook                   │
└───────────────────┴──────────┴─────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────┐
│ CLASS CachedHubSpotClient:                                          │
│     cache: LRUCache                                                 │
│     client: HubSpotClient                                          │
│                                                                      │
│     ASYNC FUNCTION getPipelines(type):                              │
│         cacheKey = `pipelines:${type}`                             │
│                                                                      │
│         cached = this.cache.get(cacheKey)                          │
│         IF cached:                                                  │
│             RETURN cached                                           │
│                                                                      │
│         result = await this.client.getPipelines(type)              │
│         this.cache.set(cacheKey, result, { ttl: 3600000 })        │
│         RETURN result                                               │
│                                                                      │
│     FUNCTION invalidate(pattern: string):                           │
│         FOR key IN this.cache.keys():                              │
│             IF key.match(pattern):                                  │
│                 this.cache.delete(key)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rate Limit Edge Cases

### 3.1 Quota Exhaustion Recovery

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Rate Limit Recovery Strategy                        │
└─────────────────────────────────────────────────────────────────────┘

Scenario: Daily limit exhausted mid-operation

┌─────────────────────────────────────────────────────────────────────┐
│ CLASS RateLimitRecovery:                                            │
│     persistentQueue: DurableQueue  // Survives restart             │
│                                                                      │
│     ASYNC FUNCTION handleDailyLimitExhausted(request):              │
│         resetTime = this.rateLimiter.dailyResetAt                  │
│         waitMs = resetTime.getTime() - Date.now()                  │
│                                                                      │
│         IF request.priority === "critical":                         │
│             // Critical requests wait (up to limit)                 │
│             IF waitMs < 3600000:  // Less than 1 hour              │
│                 await sleep(waitMs + 1000)                          │
│                 RETURN await this.retry(request)                    │
│                                                                      │
│         // Queue for later execution                                │
│         await this.persistentQueue.enqueue({                       │
│             request,                                                │
│             scheduledFor: resetTime,                                │
│             attempts: 0                                             │
│         })                                                          │
│                                                                      │
│         throw new DailyLimitExceededError(waitMs, {                │
│             queued: true,                                           │
│             scheduledFor: resetTime                                 │
│         })                                                          │
│                                                                      │
│     // Background processor                                         │
│     ASYNC FUNCTION processQueue():                                  │
│         WHILE true:                                                 │
│             await this.rateLimiter.waitForDailyReset()             │
│                                                                      │
│             WHILE this.persistentQueue.hasItems():                 │
│                 item = await this.persistentQueue.dequeue()        │
│                 TRY:                                                │
│                     await this.execute(item.request)               │
│                 CATCH error:                                        │
│                     IF error instanceof RateLimitError:            │
│                         // Re-queue if hit limit again             │
│                         await this.persistentQueue.enqueue(item)   │
│                         BREAK                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Burst Limit Smoothing

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Burst Limit Smoothing                             │
└─────────────────────────────────────────────────────────────────────┘

Problem: Bursty traffic exhausts 10-second window

Solution: Spread requests evenly

┌─────────────────────────────────────────────────────────────────────┐
│ CLASS BurstSmoother:                                                │
│     windowMs: number = 10000                                       │
│     maxRequests: number = 100                                      │
│     minIntervalMs: number  // = windowMs / maxRequests = 100ms    │
│     lastRequestTime: number = 0                                    │
│                                                                      │
│     ASYNC FUNCTION throttle():                                      │
│         now = Date.now()                                            │
│         elapsed = now - this.lastRequestTime                       │
│                                                                      │
│         IF elapsed < this.minIntervalMs:                           │
│             await sleep(this.minIntervalMs - elapsed)              │
│                                                                      │
│         this.lastRequestTime = Date.now()                          │
│                                                                      │
│ // Usage in rate limiter                                            │
│ ASYNC FUNCTION waitForSlot(type):                                   │
│     // Existing token bucket check...                               │
│                                                                      │
│     // Add smoothing for high-volume scenarios                     │
│     IF this.requestsInWindow > this.burstLimit * 0.8:             │
│         await this.burstSmoother.throttle()                        │
└─────────────────────────────────────────────────────────────────────┘

Before (bursty):
[████████████████████].....................[████████████████████]
  100 requests          10 seconds idle       100 requests

After (smooth):
[█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.█.]
  Evenly distributed across window
```

### 3.3 Multi-Instance Coordination

```
┌─────────────────────────────────────────────────────────────────────┐
│              Distributed Rate Limit Coordination                     │
└─────────────────────────────────────────────────────────────────────┘

Problem: Multiple instances share same HubSpot quota

Solution: Centralized rate limit tracking

┌─────────────────────────────────────────────────────────────────────┐
│ // Using Redis for coordination                                     │
│ CLASS DistributedRateLimiter:                                       │
│     redis: RedisClient                                              │
│     portalId: string                                               │
│                                                                      │
│     ASYNC FUNCTION acquireSlot(type: string) -> boolean:           │
│         key = `hubspot:${this.portalId}:${type}`                   │
│                                                                      │
│         // Lua script for atomic check-and-decrement               │
│         result = await this.redis.eval(`                           │
│             local current = redis.call('GET', KEYS[1])             │
│             if current and tonumber(current) > 0 then              │
│                 redis.call('DECR', KEYS[1])                        │
│                 return 1                                            │
│             end                                                     │
│             return 0                                                │
│         `, [key])                                                   │
│                                                                      │
│         RETURN result === 1                                         │
│                                                                      │
│     ASYNC FUNCTION refillTokens():                                  │
│         // Run on single instance via distributed lock             │
│         lock = await this.redis.acquireLock("hubspot:refill")     │
│         IF NOT lock:                                                │
│             RETURN                                                  │
│                                                                      │
│         TRY:                                                        │
│             // Refill burst tokens every 10 seconds                │
│             await this.redis.set(                                  │
│                 `hubspot:${this.portalId}:burst`,                  │
│                 this.burstLimit,                                    │
│                 "EX", 10                                            │
│             )                                                       │
│         FINALLY:                                                    │
│             await lock.release()                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Webhook Reliability

### 4.1 Idempotent Processing

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Webhook Idempotency                                │
└─────────────────────────────────────────────────────────────────────┘

Problem: HubSpot may retry webhooks, causing duplicate processing

Solution: Idempotency tracking with TTL

┌─────────────────────────────────────────────────────────────────────┐
│ CLASS IdempotentWebhookProcessor:                                   │
│     processed: Map<string, ProcessedEvent>  // Or Redis            │
│     ttl: number = 86400000  // 24 hours                            │
│                                                                      │
│     ASYNC FUNCTION processEvent(event):                             │
│         idempotencyKey = this.getIdempotencyKey(event)             │
│                                                                      │
│         // Check if already processed                               │
│         existing = await this.getProcessed(idempotencyKey)         │
│         IF existing:                                                │
│             this.logger.debug("Duplicate event skipped", {         │
│                 eventId: event.eventId,                             │
│                 originallyProcessedAt: existing.processedAt        │
│             })                                                      │
│             RETURN existing.result                                  │
│                                                                      │
│         // Process event                                            │
│         result = await this.executeHandlers(event)                 │
│                                                                      │
│         // Mark as processed                                        │
│         await this.markProcessed(idempotencyKey, {                 │
│             eventId: event.eventId,                                 │
│             processedAt: Date.now(),                                │
│             result                                                  │
│         })                                                          │
│                                                                      │
│         RETURN result                                               │
│                                                                      │
│     FUNCTION getIdempotencyKey(event) -> string:                    │
│         // Combine event ID with subscription for uniqueness        │
│         RETURN `${event.subscriptionId}:${event.eventId}`          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Webhook Retry Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Webhook Delivery Handling                          │
└─────────────────────────────────────────────────────────────────────┘

HubSpot Retry Behavior:
- Retries on non-2xx response
- Up to 10 retries over 24 hours
- Exponential backoff

Our Response Strategy:
┌─────────────────────────────────────────────────────────────────────┐
│ ASYNC FUNCTION handleWebhook(request):                              │
│     TRY:                                                            │
│         // Validate quickly                                         │
│         IF NOT this.validateSignature(request):                    │
│             RETURN { status: 401 }  // Don't retry                 │
│                                                                      │
│         events = JSON.parse(request.body)                          │
│                                                                      │
│         // Process with timeout                                     │
│         results = await Promise.race([                             │
│             this.processEvents(events),                             │
│             timeout(25000)  // HubSpot times out at 30s            │
│         ])                                                          │
│                                                                      │
│         // Return 200 even if some events failed                   │
│         // (we'll handle retries internally)                       │
│         RETURN { status: 200, body: { processed: results.length }}│
│                                                                      │
│     CATCH error:                                                    │
│         IF error instanceof TimeoutError:                          │
│             // Queue for async processing, return 200              │
│             await this.queueForLaterProcessing(events)             │
│             RETURN { status: 200, body: { queued: true }}         │
│                                                                      │
│         // 500 tells HubSpot to retry                              │
│         RETURN { status: 500 }                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Event Ordering

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Event Ordering Guarantees                         │
└─────────────────────────────────────────────────────────────────────┘

Problem: Events may arrive out of order

Solution: Use occurredAt timestamp for ordering

┌─────────────────────────────────────────────────────────────────────┐
│ CLASS OrderedEventProcessor:                                        │
│     lastProcessedTimestamp: Map<string, number>                    │
│                                                                      │
│     ASYNC FUNCTION processEvent(event):                             │
│         objectKey = `${event.objectType}:${event.objectId}`        │
│         lastTimestamp = this.lastProcessedTimestamp.get(objectKey) │
│                                                                      │
│         // Skip if older than last processed                        │
│         IF lastTimestamp AND event.occurredAt < lastTimestamp:     │
│             this.logger.warn("Out-of-order event skipped", {       │
│                 eventId: event.eventId,                             │
│                 occurredAt: event.occurredAt,                       │
│                 lastProcessed: lastTimestamp                        │
│             })                                                      │
│             RETURN { status: "skipped", reason: "out_of_order" }   │
│                                                                      │
│         // Process event                                            │
│         result = await this.executeHandlers(event)                 │
│                                                                      │
│         // Update timestamp                                         │
│         this.lastProcessedTimestamp.set(objectKey, event.occurredAt)│
│                                                                      │
│         RETURN result                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Security Hardening

### 5.1 Token Security

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Token Security                                  │
└─────────────────────────────────────────────────────────────────────┘

Storage:
┌─────────────────────────────────────────────────────────────────────┐
│ // Never store tokens in:                                          │
│ // - Source code                                                    │
│ // - Environment variables in logs                                  │
│ // - Unencrypted config files                                      │
│                                                                      │
│ // Recommended: Use secret manager                                  │
│ CLASS SecureTokenManager:                                           │
│     secretManager: SecretManager  // AWS SM, Vault, etc.           │
│                                                                      │
│     ASYNC FUNCTION getAccessToken():                                │
│         secret = await this.secretManager.getSecret(               │
│             `hubspot/${this.portalId}/access_token`                │
│         )                                                           │
│         RETURN decrypt(secret)                                      │
│                                                                      │
│     ASYNC FUNCTION storeRefreshedTokens(tokens):                    │
│         await this.secretManager.putSecret(                        │
│             `hubspot/${this.portalId}/access_token`,               │
│             encrypt(tokens.accessToken)                             │
│         )                                                           │
│         await this.secretManager.putSecret(                        │
│             `hubspot/${this.portalId}/refresh_token`,              │
│             encrypt(tokens.refreshToken)                            │
│         )                                                           │
└─────────────────────────────────────────────────────────────────────┘

Logging:
┌─────────────────────────────────────────────────────────────────────┐
│ // Redact tokens from logs                                         │
│ FUNCTION sanitizeForLogging(data):                                 │
│     IF typeof data === "string":                                   │
│         // Redact Bearer tokens                                     │
│         RETURN data.replace(/Bearer [A-Za-z0-9\-_]+/g,            │
│                             "Bearer [REDACTED]")                    │
│                                                                      │
│     IF typeof data === "object":                                   │
│         result = {}                                                 │
│         FOR key, value IN Object.entries(data):                    │
│             IF key.match(/token|secret|password|key/i):           │
│                 result[key] = "[REDACTED]"                         │
│             ELSE:                                                   │
│                 result[key] = sanitizeForLogging(value)            │
│         RETURN result                                               │
│                                                                      │
│     RETURN data                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Webhook Security

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Webhook Security Hardening                         │
└─────────────────────────────────────────────────────────────────────┘

1. Signature Validation (required):
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION validateSignature(request) -> boolean:                     │
│     signature = request.headers["x-hubspot-signature-v3"]          │
│     timestamp = request.headers["x-hubspot-request-timestamp"]     │
│                                                                      │
│     // Reject if missing headers                                    │
│     IF NOT signature OR NOT timestamp:                             │
│         this.metrics.increment("webhook.security.missing_headers") │
│         RETURN false                                                │
│                                                                      │
│     // Reject if timestamp too old (replay attack)                 │
│     age = Date.now() - parseInt(timestamp)                         │
│     IF age > 300000:  // 5 minutes                                 │
│         this.metrics.increment("webhook.security.stale_timestamp") │
│         RETURN false                                                │
│                                                                      │
│     // Compute and compare signature                                │
│     expected = computeHmacSha256(                                  │
│         this.webhookSecret,                                         │
│         request.method + request.url + request.body + timestamp    │
│     )                                                               │
│                                                                      │
│     // Timing-safe comparison                                       │
│     IF NOT crypto.timingSafeEqual(                                 │
│         Buffer.from(signature),                                     │
│         Buffer.from(expected)                                       │
│     ):                                                              │
│         this.metrics.increment("webhook.security.invalid_sig")     │
│         RETURN false                                                │
│                                                                      │
│     RETURN true                                                     │
└─────────────────────────────────────────────────────────────────────┘

2. IP Allowlisting (optional, additional layer):
┌─────────────────────────────────────────────────────────────────────┐
│ // HubSpot webhook IPs (check docs for current list)               │
│ HUBSPOT_WEBHOOK_IPS = [                                             │
│     "34.226.237.0/24",                                              │
│     "52.1.136.0/24",                                                │
│     // ... additional ranges                                        │
│ ]                                                                   │
│                                                                      │
│ FUNCTION isAllowedIP(request) -> boolean:                          │
│     clientIP = request.headers["x-forwarded-for"]?.split(",")[0]   │
│                ?? request.connection.remoteAddress                  │
│                                                                      │
│     RETURN HUBSPOT_WEBHOOK_IPS.some(range =>                       │
│         ipRangeCheck(clientIP, range)                              │
│     )                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Input Validation

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Input Validation                                 │
└─────────────────────────────────────────────────────────────────────┘

Property Validation:
┌─────────────────────────────────────────────────────────────────────┐
│ FUNCTION validateProperties(type, properties) -> ValidationResult: │
│     errors = []                                                     │
│                                                                      │
│     // Get schema for object type (cached)                         │
│     schema = await this.getPropertySchema(type)                    │
│                                                                      │
│     FOR [name, value] IN Object.entries(properties):               │
│         propDef = schema.get(name)                                 │
│                                                                      │
│         IF NOT propDef:                                             │
│             errors.push({ property: name, error: "unknown" })      │
│             CONTINUE                                                │
│                                                                      │
│         // Type validation                                          │
│         IF propDef.type === "number" AND typeof value !== "number":│
│             errors.push({ property: name, error: "type_mismatch" })│
│                                                                      │
│         // Enum validation                                          │
│         IF propDef.type === "enumeration":                         │
│             IF NOT propDef.options.includes(value):                │
│                 errors.push({                                       │
│                     property: name,                                 │
│                     error: "invalid_option",                        │
│                     validOptions: propDef.options                  │
│                 })                                                  │
│                                                                      │
│         // Length validation                                        │
│         IF propDef.maxLength AND value.length > propDef.maxLength: │
│             errors.push({ property: name, error: "too_long" })     │
│                                                                      │
│     RETURN { valid: errors.length === 0, errors }                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Recovery

### 6.1 Partial Batch Failure

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Partial Batch Failure Recovery                      │
└─────────────────────────────────────────────────────────────────────┘

Problem: Batch of 100 items, 5 fail

┌─────────────────────────────────────────────────────────────────────┐
│ ASYNC FUNCTION batchCreateWithRecovery(type, inputs):               │
│     result = await client.batchCreate(type, inputs)                │
│                                                                      │
│     IF result.errors.length === 0:                                 │
│         RETURN result                                               │
│                                                                      │
│     // Categorize errors                                            │
│     retryable = []                                                  │
│     permanent = []                                                  │
│                                                                      │
│     FOR error IN result.errors:                                    │
│         IF isRetryableError(error):                                │
│             retryable.push(inputs[error.index])                    │
│         ELSE:                                                       │
│             permanent.push(error)                                   │
│                                                                      │
│     // Retry retryable errors                                       │
│     IF retryable.length > 0:                                       │
│         await sleep(1000)                                           │
│         retryResult = await client.batchCreate(type, retryable)    │
│         result.results.push(...retryResult.results)                │
│         permanent.push(...retryResult.errors)                      │
│                                                                      │
│     // Log permanent failures for manual review                    │
│     IF permanent.length > 0:                                       │
│         this.logger.error("Permanent batch failures", {            │
│             count: permanent.length,                                │
│             errors: permanent                                       │
│         })                                                          │
│                                                                      │
│     RETURN {                                                        │
│         results: result.results,                                    │
│         errors: permanent,                                          │
│         retried: retryable.length                                   │
│     }                                                               │
│                                                                      │
│ FUNCTION isRetryableError(error) -> boolean:                        │
│     // Rate limit within batch                                      │
│     IF error.category === "RATE_LIMITS":                           │
│         RETURN true                                                 │
│     // Temporary conflict                                           │
│     IF error.category === "CONFLICT" AND                           │
│        error.message.includes("concurrent"):                        │
│         RETURN true                                                 │
│     RETURN false                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Association Failure Recovery

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Association Failure Recovery                         │
└─────────────────────────────────────────────────────────────────────┘

Problem: Object created but association fails

┌─────────────────────────────────────────────────────────────────────┐
│ ASYNC FUNCTION createObjectWithAssociations(type, props, assocs):   │
│     object = null                                                   │
│                                                                      │
│     TRY:                                                            │
│         // Create object                                            │
│         object = await client.createObject(type, props)            │
│                                                                      │
│         // Create associations                                      │
│         FOR assoc IN assocs:                                       │
│             TRY:                                                    │
│                 await client.createAssociation(                    │
│                     { type, id: object.id },                       │
│                     { type: assoc.toType, id: assoc.toId },       │
│                     assoc.associationType                           │
│                 )                                                   │
│             CATCH assocError:                                       │
│                 // Log but don't fail entire operation             │
│                 this.logger.error("Association failed", {          │
│                     objectId: object.id,                            │
│                     association: assoc,                             │
│                     error: assocError                               │
│                 })                                                  │
│                                                                      │
│                 // Queue for retry                                  │
│                 await this.queueAssociationRetry({                 │
│                     objectId: object.id,                            │
│                     ...assoc                                        │
│                 })                                                  │
│                                                                      │
│         RETURN object                                               │
│                                                                      │
│     CATCH createError:                                              │
│         // Object creation failed                                   │
│         throw createError                                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Testing Strategy

### 7.1 Unit Test Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Unit Test Categories                              │
└─────────────────────────────────────────────────────────────────────┘

1. Rate Limiter Tests:
- Token bucket refill timing
- Daily reset at midnight UTC
- Search vs standard slot differentiation
- Burst smoothing behavior
- Header parsing accuracy

2. Webhook Processor Tests:
- Signature validation (valid/invalid/missing)
- Timestamp validation (fresh/stale)
- Event deduplication
- Handler routing
- Batch event processing

3. Request Builder Tests:
- Filter serialization
- Sort serialization
- Property selection
- Pagination params

4. Error Parser Tests:
- Rate limit detection
- Validation error extraction
- Auth error classification
- Retry-After parsing
```

### 7.2 Integration Test Scenarios

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Integration Test Scenarios                           │
└─────────────────────────────────────────────────────────────────────┘

Using HubSpot sandbox account:

┌─────────────────────────────────────────────────────────────────────┐
│ describe("Contact Operations", () => {                              │
│     it("creates contact with properties", async () => {             │
│         contact = await client.createObject("contacts", {          │
│             email: `test-${Date.now()}@example.com`,               │
│             firstname: "Test",                                      │
│             lastname: "Contact"                                     │
│         })                                                          │
│         expect(contact.id).toBeDefined()                           │
│     })                                                              │
│                                                                      │
│     it("searches contacts by email domain", async () => {          │
│         results = await client.searchObjects("contacts", {         │
│             filters: [{ property: "email",                         │
│                        operator: "CONTAINS",                        │
│                        value: "@example.com" }]                    │
│         })                                                          │
│         expect(results.total).toBeGreaterThan(0)                   │
│     })                                                              │
│                                                                      │
│     it("handles batch create with partial failure", async () => {  │
│         inputs = [                                                  │
│             { email: "valid@example.com" },                        │
│             { email: "invalid-email" },  // Will fail             │
│         ]                                                           │
│         result = await client.batchCreate("contacts", inputs)      │
│         expect(result.results).toHaveLength(1)                     │
│         expect(result.errors).toHaveLength(1)                      │
│     })                                                              │
│ })                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Load Testing

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Load Test Scenarios                             │
└─────────────────────────────────────────────────────────────────────┘

Scenario 1: Burst Handling
┌─────────────────────────────────────────────────────────────────────┐
│ Target: 100 concurrent requests                                     │
│ Expected: Rate limiter queues excess, no 429 errors                │
│ Measure: Queue depth, completion time                              │
└─────────────────────────────────────────────────────────────────────┘

Scenario 2: Sustained Load
┌─────────────────────────────────────────────────────────────────────┐
│ Target: 10 req/sec for 10 minutes                                  │
│ Expected: Stays within burst limit                                  │
│ Measure: Latency p50/p95/p99, error rate                          │
└─────────────────────────────────────────────────────────────────────┘

Scenario 3: Webhook Throughput
┌─────────────────────────────────────────────────────────────────────┐
│ Target: 50 webhooks/sec                                            │
│ Expected: All processed within 100ms                               │
│ Measure: Processing time, duplicate detection                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Operational Considerations

### 8.1 Health Checks

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Health Check Implementation                     │
└─────────────────────────────────────────────────────────────────────┘

FUNCTION healthCheck() -> HealthStatus:
    checks = {}

    // 1. Token validity
    TRY:
        await tokenManager.getValidToken()
        checks.token = { status: "healthy" }
    CATCH error:
        checks.token = { status: "unhealthy", error: error.message }

    // 2. Rate limit status
    rateLimits = rateLimiter.getStatus()
    checks.rateLimit = {
        status: rateLimits.daily.remaining > 1000 ? "healthy" : "warning",
        dailyRemaining: rateLimits.daily.remaining,
        dailyLimit: rateLimits.daily.limit
    }

    // 3. API connectivity
    TRY:
        await client.getObject("contacts", "1")  // Will 404, but proves connectivity
    CATCH error:
        IF error.statusCode === 404:
            checks.api = { status: "healthy" }
        ELSE:
            checks.api = { status: "unhealthy", error: error.message }

    // 4. Webhook processor
    checks.webhooks = {
        status: "healthy",
        processedLast24h: metrics.get("webhooks.processed.24h"),
        errorRate: metrics.get("webhooks.error_rate")
    }

    allHealthy = Object.values(checks).every(c => c.status !== "unhealthy")

    RETURN {
        status: allHealthy ? "healthy" : "unhealthy",
        checks,
        timestamp: new Date().toISOString()
    }
```

### 8.2 Alerting Rules

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Alerting Rules                                │
└─────────────────────────────────────────────────────────────────────┘

| Alert | Condition | Severity |
|-------|-----------|----------|
| Daily limit approaching | remaining < 10% | Warning |
| Daily limit exhausted | remaining = 0 | Critical |
| High error rate | errors > 5% for 5min | Warning |
| Auth failures | 401 errors > 0 | Critical |
| Webhook backlog | unprocessed > 100 | Warning |
| API latency high | p95 > 2s for 5min | Warning |
| Token refresh failing | refresh errors > 0 | Critical |
```

---

## 9. Refinement Checklist

| Category | Item | Priority |
|----------|------|----------|
| **Performance** | | |
| | Request batching aggregator | High |
| | Connection pooling | Medium |
| | Response caching | Medium |
| | Search optimization | Medium |
| **Rate Limiting** | | |
| | Burst smoothing | High |
| | Multi-instance coordination | High |
| | Quota exhaustion recovery | High |
| **Webhooks** | | |
| | Idempotent processing | High |
| | Event ordering | Medium |
| | Retry handling | High |
| **Security** | | |
| | Token storage encryption | High |
| | Log sanitization | High |
| | Input validation | Medium |
| **Reliability** | | |
| | Partial batch recovery | High |
| | Association failure recovery | Medium |
| **Testing** | | |
| | Unit test coverage > 80% | High |
| | Integration test suite | High |
| | Load testing | Medium |
| **Operations** | | |
| | Health checks | High |
| | Alerting rules | High |
