# HubSpot API Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/hubspot-api`

---

## 1. Overview

### 1.1 Pseudocode Conventions

```
CLASS ClassName:
    field: Type

    FUNCTION method(param: Type) -> ReturnType:
        // Comments explain intent
        variable = expression
        IF condition:
            action
        FOR item IN collection:
            process(item)
        RETURN value
```

### 1.2 London-School TDD Mapping

Each interface serves as a contract for:
1. **Production implementations** - Real HubSpot API calls
2. **Test doubles (mocks)** - Simulated responses for testing
3. **Dependency injection** - Composable, testable architecture

---

## 2. Client Initialization

### 2.1 HubSpotClient Interface

```pseudocode
INTERFACE HubSpotClient:
    // CRM Objects
    FUNCTION createObject(type: ObjectType, properties: Properties) -> CrmObject
    FUNCTION getObject(type: ObjectType, id: string, options?: GetOptions) -> CrmObject
    FUNCTION updateObject(type: ObjectType, id: string, properties: Properties) -> CrmObject
    FUNCTION deleteObject(type: ObjectType, id: string) -> void

    // Batch Operations
    FUNCTION batchCreate(type: ObjectType, inputs: CreateInput[]) -> BatchResult
    FUNCTION batchRead(type: ObjectType, ids: string[], properties?: string[]) -> BatchResult
    FUNCTION batchUpdate(type: ObjectType, inputs: UpdateInput[]) -> BatchResult
    FUNCTION batchArchive(type: ObjectType, ids: string[]) -> BatchResult

    // Search
    FUNCTION searchObjects(type: ObjectType, query: SearchQuery) -> SearchResult

    // Associations
    FUNCTION createAssociation(from: ObjectRef, to: ObjectRef, type: string) -> void
    FUNCTION getAssociations(from: ObjectRef, toType: ObjectType) -> Association[]
    FUNCTION deleteAssociation(from: ObjectRef, to: ObjectRef, type: string) -> void

    // Webhooks
    FUNCTION handleWebhook(request: WebhookRequest) -> WebhookResponse

    // Utilities
    FUNCTION getRateLimitStatus() -> RateLimitStatus
    FUNCTION shutdown() -> void

CLASS HubSpotClientImpl IMPLEMENTS HubSpotClient:
    config: HubSpotConfig
    httpClient: HttpClient
    rateLimiter: RateLimiter
    tokenManager: TokenManager
    logger: Logger
    metrics: MetricsClient

    FUNCTION constructor(config: HubSpotConfig):
        this.config = validateConfig(config)
        this.logger = config.logger ?? new NoopLogger()
        this.metrics = config.metrics ?? new NoopMetrics()

        // Initialize token manager
        this.tokenManager = new TokenManager({
            accessToken: config.accessToken,
            refreshToken: config.refreshToken,
            onRefresh: config.onTokenRefresh
        })

        // Initialize rate limiter
        this.rateLimiter = new RateLimiter({
            dailyLimit: config.dailyLimit,
            burstLimit: config.burstLimit,
            searchLimit: config.searchLimit,
            buffer: config.rateLimitBuffer
        })

        // Initialize HTTP client
        this.httpClient = new HttpClient({
            baseUrl: config.baseUrl,
            timeout: config.timeout,
            retries: config.maxRetries
        })

        this.logger.info("HubSpot client initialized", {
            portalId: config.portalId
        })
```

### 2.2 Configuration

```pseudocode
INTERFACE HubSpotConfig:
    accessToken: string
    portalId: string
    refreshToken?: string
    baseUrl?: string              // Default: "https://api.hubapi.com"
    apiVersion?: string           // Default: "v3"
    timeout?: number              // Default: 30000
    maxRetries?: number           // Default: 3
    dailyLimit?: number           // Default: 500000
    burstLimit?: number           // Default: 100
    searchLimit?: number          // Default: 4
    rateLimitBuffer?: number      // Default: 0.1
    webhookSecret?: string
    logger?: Logger
    metrics?: MetricsClient
    onTokenRefresh?: (tokens: Tokens) -> void

FUNCTION validateConfig(config: HubSpotConfig) -> HubSpotConfig:
    errors = []

    IF NOT config.accessToken:
        errors.push("accessToken is required")

    IF NOT config.portalId:
        errors.push("portalId is required")

    IF config.timeout !== undefined AND config.timeout < 1000:
        errors.push("timeout must be >= 1000ms")

    IF errors.length > 0:
        throw new ConfigurationError(errors.join("; "))

    RETURN {
        baseUrl: "https://api.hubapi.com",
        apiVersion: "v3",
        timeout: 30000,
        maxRetries: 3,
        dailyLimit: 500000,
        burstLimit: 100,
        searchLimit: 4,
        rateLimitBuffer: 0.1,
        ...config
    }
```

---

## 3. CRM Object Operations

### 3.1 Create Object

```pseudocode
ASYNC FUNCTION client.createObject(
    type: ObjectType,
    properties: Properties,
    associations?: AssociationInput[]
) -> CrmObject:

    // Validate object type
    IF NOT isValidObjectType(type):
        throw new ValidationError(`Invalid object type: ${type}`)

    // Build request
    endpoint = `/crm/${this.config.apiVersion}/objects/${type}`
    body = {
        properties,
        associations: associations ?? []
    }

    // Execute with rate limiting
    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body,
        operation: "createObject",
        objectType: type
    })

    // Parse and return
    object = this.parseObjectResponse(response, type)

    this.logger.info("Object created", {
        type,
        id: object.id
    })

    this.metrics.increment("hubspot.objects.created", { type })

    RETURN object

FUNCTION parseObjectResponse(response: ApiResponse, type: ObjectType) -> CrmObject:
    RETURN {
        id: response.id,
        type,
        properties: response.properties,
        createdAt: new Date(response.createdAt),
        updatedAt: new Date(response.updatedAt),
        archived: response.archived ?? false
    }
```

### 3.2 Get Object

```pseudocode
ASYNC FUNCTION client.getObject(
    type: ObjectType,
    id: string,
    options?: GetOptions
) -> CrmObject | null:

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/${id}`

    // Build query params
    params = {}
    IF options?.properties:
        params.properties = options.properties.join(",")
    IF options?.associations:
        params.associations = options.associations.join(",")
    IF options?.archived:
        params.archived = "true"

    TRY:
        response = await this.executeRequest({
            method: "GET",
            endpoint,
            params,
            operation: "getObject",
            objectType: type
        })

        RETURN this.parseObjectResponse(response, type)

    CATCH error:
        IF error.statusCode === 404:
            RETURN null
        throw error

INTERFACE GetOptions:
    properties?: string[]         // Properties to return
    associations?: ObjectType[]   // Associated objects to include
    archived?: boolean            // Include archived objects
```

### 3.3 Update Object

```pseudocode
ASYNC FUNCTION client.updateObject(
    type: ObjectType,
    id: string,
    properties: Properties
) -> CrmObject:

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/${id}`

    response = await this.executeRequest({
        method: "PATCH",
        endpoint,
        body: { properties },
        operation: "updateObject",
        objectType: type
    })

    object = this.parseObjectResponse(response, type)

    this.logger.info("Object updated", { type, id })
    this.metrics.increment("hubspot.objects.updated", { type })

    RETURN object
```

### 3.4 Delete Object

```pseudocode
ASYNC FUNCTION client.deleteObject(
    type: ObjectType,
    id: string
) -> void:

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/${id}`

    await this.executeRequest({
        method: "DELETE",
        endpoint,
        operation: "deleteObject",
        objectType: type
    })

    this.logger.info("Object archived", { type, id })
    this.metrics.increment("hubspot.objects.archived", { type })
```

---

## 4. Batch Operations

### 4.1 Batch Create

```pseudocode
ASYNC FUNCTION client.batchCreate(
    type: ObjectType,
    inputs: CreateInput[]
) -> BatchResult:

    IF inputs.length === 0:
        RETURN { results: [], errors: [] }

    IF inputs.length > this.config.batchSize:
        // Split into chunks
        RETURN await this.executeBatchChunked(
            type, inputs, "create", this.config.batchSize
        )

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/batch/create`

    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body: { inputs },
        operation: "batchCreate",
        objectType: type
    })

    result = this.parseBatchResponse(response, type)

    this.metrics.histogram("hubspot.batch.size", inputs.length, {
        operation: "create",
        type
    })

    RETURN result

ASYNC FUNCTION executeBatchChunked(
    type: ObjectType,
    inputs: any[],
    operation: string,
    chunkSize: number
) -> BatchResult:

    chunks = splitIntoChunks(inputs, chunkSize)
    allResults = []
    allErrors = []

    FOR chunk IN chunks:
        // Rate limit between chunks
        await this.rateLimiter.waitForSlot("batch")

        result = await this.executeSingleBatch(type, chunk, operation)
        allResults.push(...result.results)
        allErrors.push(...result.errors)

    RETURN { results: allResults, errors: allErrors }
```

### 4.2 Batch Read

```pseudocode
ASYNC FUNCTION client.batchRead(
    type: ObjectType,
    ids: string[],
    properties?: string[]
) -> BatchResult:

    IF ids.length === 0:
        RETURN { results: [], errors: [] }

    // Deduplicate IDs
    uniqueIds = [...new Set(ids)]

    IF uniqueIds.length > this.config.batchSize:
        RETURN await this.executeBatchReadChunked(type, uniqueIds, properties)

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/batch/read`

    body = {
        inputs: uniqueIds.map(id => ({ id })),
        properties: properties ?? []
    }

    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body,
        operation: "batchRead",
        objectType: type
    })

    RETURN this.parseBatchResponse(response, type)
```

### 4.3 Batch Update

```pseudocode
ASYNC FUNCTION client.batchUpdate(
    type: ObjectType,
    inputs: UpdateInput[]
) -> BatchResult:

    IF inputs.length === 0:
        RETURN { results: [], errors: [] }

    // Validate all inputs have IDs
    FOR input IN inputs:
        IF NOT input.id:
            throw new ValidationError("All update inputs must have id")

    IF inputs.length > this.config.batchSize:
        RETURN await this.executeBatchChunked(
            type, inputs, "update", this.config.batchSize
        )

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/batch/update`

    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body: { inputs },
        operation: "batchUpdate",
        objectType: type
    })

    RETURN this.parseBatchResponse(response, type)

INTERFACE UpdateInput:
    id: string
    properties: Properties
```

### 4.4 Batch Response Parsing

```pseudocode
FUNCTION parseBatchResponse(response: ApiResponse, type: ObjectType) -> BatchResult:
    results = []
    errors = []

    IF response.results:
        FOR item IN response.results:
            results.push(this.parseObjectResponse(item, type))

    IF response.errors:
        FOR error IN response.errors:
            errors.push({
                id: error.id,
                message: error.message,
                category: error.category,
                context: error.context
            })

    RETURN { results, errors, status: response.status }
```

---

## 5. Search Operations

### 5.1 Search Objects

```pseudocode
ASYNC FUNCTION client.searchObjects(
    type: ObjectType,
    query: SearchQuery
) -> SearchResult:

    // Validate search constraints
    IF query.limit > 100:
        throw new ValidationError("Search limit cannot exceed 100")

    // Wait for search rate limit slot
    await this.rateLimiter.waitForSlot("search")

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}/search`

    body = this.buildSearchBody(query)

    startTime = Date.now()

    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body,
        operation: "searchObjects",
        objectType: type
    })

    result = this.parseSearchResponse(response, type)

    this.metrics.histogram("hubspot.search.duration", Date.now() - startTime, { type })
    this.metrics.histogram("hubspot.search.results", result.total, { type })

    RETURN result

FUNCTION buildSearchBody(query: SearchQuery) -> object:
    body = {
        limit: query.limit ?? 10,
        after: query.after
    }

    // Build filter groups
    IF query.filters AND query.filters.length > 0:
        body.filterGroups = [{
            filters: query.filters.map(f => ({
                propertyName: f.property,
                operator: f.operator,
                value: f.value
            }))
        }]

    // Add sorting
    IF query.sorts AND query.sorts.length > 0:
        body.sorts = query.sorts.map(s => ({
            propertyName: s.property,
            direction: s.direction ?? "ASCENDING"
        }))

    // Specify properties to return
    IF query.properties:
        body.properties = query.properties

    RETURN body

INTERFACE SearchQuery:
    filters?: FilterClause[]
    sorts?: SortClause[]
    properties?: string[]
    limit?: number               // Max 100
    after?: string               // Pagination cursor

INTERFACE FilterClause:
    property: string
    operator: FilterOperator
    value: string | number | boolean

TYPE FilterOperator =
    | "EQ" | "NEQ"              // Equals, Not equals
    | "LT" | "LTE"              // Less than
    | "GT" | "GTE"              // Greater than
    | "CONTAINS"                 // String contains
    | "NOT_CONTAINS"
    | "HAS_PROPERTY"            // Property exists
    | "NOT_HAS_PROPERTY"
    | "IN"                       // In list
    | "NOT_IN"
    | "BETWEEN"                  // Range
```

### 5.2 Search Response Parsing

```pseudocode
FUNCTION parseSearchResponse(response: ApiResponse, type: ObjectType) -> SearchResult:
    results = response.results.map(r => this.parseObjectResponse(r, type))

    RETURN {
        results,
        total: response.total,
        paging: response.paging ? {
            next: response.paging.next?.after
        } : null
    }

INTERFACE SearchResult:
    results: CrmObject[]
    total: number
    paging: { next?: string } | null
```

### 5.3 Paginated Search Iterator

```pseudocode
ASYNC FUNCTION* client.searchAll(
    type: ObjectType,
    query: SearchQuery
) -> AsyncGenerator<CrmObject>:

    cursor = query.after

    WHILE true:
        result = await this.searchObjects(type, {
            ...query,
            after: cursor
        })

        FOR object IN result.results:
            YIELD object

        IF NOT result.paging?.next:
            BREAK

        cursor = result.paging.next
```

---

## 6. Association Operations

### 6.1 Create Association

```pseudocode
ASYNC FUNCTION client.createAssociation(
    from: ObjectRef,
    to: ObjectRef,
    associationType: string
) -> void:

    endpoint = `/crm/${this.config.apiVersion}/associations/${from.type}/${to.type}/batch/create`

    body = {
        inputs: [{
            from: { id: from.id },
            to: { id: to.id },
            type: associationType
        }]
    }

    await this.executeRequest({
        method: "POST",
        endpoint,
        body,
        operation: "createAssociation"
    })

    this.logger.debug("Association created", {
        from: `${from.type}:${from.id}`,
        to: `${to.type}:${to.id}`,
        type: associationType
    })

INTERFACE ObjectRef:
    type: ObjectType
    id: string
```

### 6.2 Get Associations

```pseudocode
ASYNC FUNCTION client.getAssociations(
    from: ObjectRef,
    toType: ObjectType
) -> Association[]:

    endpoint = `/crm/${this.config.apiVersion}/objects/${from.type}/${from.id}/associations/${toType}`

    response = await this.executeRequest({
        method: "GET",
        endpoint,
        operation: "getAssociations"
    })

    RETURN response.results.map(r => ({
        toObjectId: r.id,
        toObjectType: toType,
        associationTypes: r.type ? [r.type] : []
    }))

INTERFACE Association:
    toObjectId: string
    toObjectType: ObjectType
    associationTypes: string[]
```

### 6.3 Batch Associations

```pseudocode
ASYNC FUNCTION client.batchAssociate(
    fromType: ObjectType,
    toType: ObjectType,
    associations: AssociationInput[]
) -> BatchResult:

    IF associations.length === 0:
        RETURN { results: [], errors: [] }

    endpoint = `/crm/${this.config.apiVersion}/associations/${fromType}/${toType}/batch/create`

    body = {
        inputs: associations.map(a => ({
            from: { id: a.fromId },
            to: { id: a.toId },
            type: a.associationType
        }))
    }

    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body,
        operation: "batchAssociate"
    })

    RETURN {
        results: response.results ?? [],
        errors: response.errors ?? []
    }

INTERFACE AssociationInput:
    fromId: string
    toId: string
    associationType: string
```

---

## 7. Rate Limiting

### 7.1 Rate Limiter

```pseudocode
CLASS RateLimiter:
    dailyRemaining: number
    dailyResetAt: Date
    burstTokens: number
    lastBurstRefill: number
    searchTokens: number
    lastSearchRefill: number
    config: RateLimitConfig
    queue: PriorityQueue<PendingRequest>

    FUNCTION constructor(config: RateLimitConfig):
        this.config = config
        this.dailyRemaining = config.dailyLimit
        this.dailyResetAt = this.getNextMidnightUTC()
        this.burstTokens = config.burstLimit
        this.lastBurstRefill = Date.now()
        this.searchTokens = config.searchLimit
        this.lastSearchRefill = Date.now()
        this.queue = new PriorityQueue()

    ASYNC FUNCTION waitForSlot(type: "standard" | "search" | "batch") -> void:
        // Refill tokens based on elapsed time
        this.refillTokens()

        // Check daily limit
        IF this.dailyRemaining <= this.getReservedBuffer():
            waitTime = this.dailyResetAt.getTime() - Date.now()
            IF waitTime > 0:
                throw new DailyLimitExceededError(waitTime)

        // Check burst limit
        IF type === "standard" OR type === "batch":
            WHILE this.burstTokens < 1:
                await this.waitForBurstRefill()
                this.refillTokens()
            this.burstTokens--

        // Check search limit (stricter)
        IF type === "search":
            WHILE this.searchTokens < 1:
                await this.waitForSearchRefill()
                this.refillTokens()
            this.searchTokens--

        this.dailyRemaining--

    FUNCTION refillTokens() -> void:
        now = Date.now()

        // Refill burst tokens (100 per 10 seconds)
        burstElapsed = now - this.lastBurstRefill
        IF burstElapsed >= 10000:
            periods = Math.floor(burstElapsed / 10000)
            this.burstTokens = Math.min(
                this.config.burstLimit,
                this.burstTokens + (periods * this.config.burstLimit)
            )
            this.lastBurstRefill = now

        // Refill search tokens (N per second)
        searchElapsed = now - this.lastSearchRefill
        IF searchElapsed >= 1000:
            periods = Math.floor(searchElapsed / 1000)
            this.searchTokens = Math.min(
                this.config.searchLimit,
                this.searchTokens + (periods * this.config.searchLimit)
            )
            this.lastSearchRefill = now

        // Reset daily at midnight UTC
        IF now > this.dailyResetAt.getTime():
            this.dailyRemaining = this.config.dailyLimit
            this.dailyResetAt = this.getNextMidnightUTC()

    FUNCTION getReservedBuffer() -> number:
        RETURN Math.floor(this.config.dailyLimit * this.config.buffer)

    FUNCTION handleRateLimitResponse(headers: Headers) -> void:
        // Update from response headers
        IF headers["x-hubspot-ratelimit-daily-remaining"]:
            this.dailyRemaining = parseInt(headers["x-hubspot-ratelimit-daily-remaining"])

        IF headers["x-hubspot-ratelimit-secondly-remaining"]:
            this.burstTokens = parseInt(headers["x-hubspot-ratelimit-secondly-remaining"])
```

### 7.2 Rate Limit Status

```pseudocode
FUNCTION client.getRateLimitStatus() -> RateLimitStatus:
    RETURN {
        daily: {
            remaining: this.rateLimiter.dailyRemaining,
            limit: this.config.dailyLimit,
            resetsAt: this.rateLimiter.dailyResetAt
        },
        burst: {
            remaining: this.rateLimiter.burstTokens,
            limit: this.config.burstLimit
        },
        search: {
            remaining: this.rateLimiter.searchTokens,
            limit: this.config.searchLimit
        }
    }

INTERFACE RateLimitStatus:
    daily: { remaining: number, limit: number, resetsAt: Date }
    burst: { remaining: number, limit: number }
    search: { remaining: number, limit: number }
```

---

## 8. Request Execution

### 8.1 Execute Request

```pseudocode
ASYNC FUNCTION client.executeRequest(options: RequestOptions) -> ApiResponse:
    startTime = Date.now()
    attempt = 0
    lastError = null

    WHILE attempt < this.config.maxRetries:
        attempt++

        TRY:
            // Wait for rate limit slot
            await this.rateLimiter.waitForSlot(
                options.operation === "searchObjects" ? "search" : "standard"
            )

            // Get current token
            token = await this.tokenManager.getValidToken()

            // Build request
            url = `${this.config.baseUrl}${options.endpoint}`
            IF options.params:
                url += "?" + new URLSearchParams(options.params)

            headers = {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }

            // Execute request with tracing
            span = this.tracer.startSpan("hubspot.api", {
                method: options.method,
                endpoint: options.endpoint,
                objectType: options.objectType
            })

            TRY:
                response = await this.httpClient.request({
                    method: options.method,
                    url,
                    headers,
                    body: options.body ? JSON.stringify(options.body) : undefined,
                    timeout: this.config.timeout
                })

                // Update rate limits from headers
                this.rateLimiter.handleRateLimitResponse(response.headers)

                // Record metrics
                this.metrics.histogram(
                    "hubspot.requests.duration",
                    Date.now() - startTime,
                    { method: options.method, objectType: options.objectType }
                )

                span.setStatus("ok")
                RETURN response.body

            FINALLY:
                span.end()

        CATCH error:
            lastError = error

            IF this.shouldRetry(error, attempt):
                waitTime = this.calculateBackoff(error, attempt)
                this.logger.warn("Retrying request", {
                    attempt,
                    waitTime,
                    error: error.message
                })
                await sleep(waitTime)
                CONTINUE

            throw this.wrapError(error, options)

    throw lastError

FUNCTION shouldRetry(error: Error, attempt: number) -> boolean:
    // Don't retry validation errors
    IF error.statusCode === 400:
        RETURN false

    // Don't retry auth errors (except token refresh)
    IF error.statusCode === 401:
        RETURN false

    // Retry rate limits with backoff
    IF error.statusCode === 429:
        RETURN true

    // Retry server errors
    IF error.statusCode >= 500:
        RETURN true

    // Retry network errors
    IF error.code === "ECONNRESET" OR error.code === "ETIMEDOUT":
        RETURN true

    RETURN false

FUNCTION calculateBackoff(error: Error, attempt: number) -> number:
    // Use Retry-After header if present
    IF error.headers?.["retry-after"]:
        RETURN parseInt(error.headers["retry-after"]) * 1000

    // Exponential backoff: 1s, 2s, 4s, 8s...
    baseDelay = 1000
    maxDelay = 30000
    delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)

    // Add jitter
    jitter = Math.random() * 0.3 * delay
    RETURN delay + jitter
```

---

## 9. Webhook Handling

### 9.1 Webhook Processor

```pseudocode
CLASS WebhookProcessor:
    secret: string
    handlers: Map<string, WebhookHandler[]>
    processedEvents: LRUCache<number, boolean>
    logger: Logger

    FUNCTION constructor(config: WebhookConfig):
        this.secret = config.webhookSecret
        this.handlers = new Map()
        this.processedEvents = new LRUCache({ max: 10000, ttl: 3600000 })
        this.logger = config.logger

    ASYNC FUNCTION handleWebhook(request: WebhookRequest) -> WebhookResponse:
        // Validate signature
        IF NOT this.validateSignature(request):
            this.logger.warn("Invalid webhook signature")
            throw new InvalidSignatureError()

        // Parse events (HubSpot sends array)
        events = JSON.parse(request.body)

        IF NOT Array.isArray(events):
            events = [events]

        results = []

        FOR event IN events:
            TRY:
                result = await this.processEvent(event)
                results.push({ eventId: event.eventId, status: "processed" })
            CATCH error:
                this.logger.error("Webhook processing failed", {
                    eventId: event.eventId,
                    error: error.message
                })
                results.push({ eventId: event.eventId, status: "failed", error })

        RETURN { statusCode: 200, results }

    FUNCTION validateSignature(request: WebhookRequest) -> boolean:
        signature = request.headers["x-hubspot-signature-v3"]
        timestamp = request.headers["x-hubspot-request-timestamp"]

        IF NOT signature OR NOT timestamp:
            RETURN false

        // Check timestamp freshness (5 minute window)
        timestampMs = parseInt(timestamp)
        IF Math.abs(Date.now() - timestampMs) > 300000:
            this.logger.warn("Webhook timestamp too old", { timestamp })
            RETURN false

        // Compute expected signature
        // v3: HMAC-SHA256(secret, requestMethod + requestUri + requestBody + timestamp)
        signatureBase = request.method + request.url + request.body + timestamp
        expectedSignature = hmacSha256(this.secret, signatureBase)

        RETURN timingSafeEqual(signature, expectedSignature)

    ASYNC FUNCTION processEvent(event: WebhookEvent) -> ProcessResult:
        // Check for duplicate (replay prevention)
        IF this.processedEvents.has(event.eventId):
            this.logger.debug("Skipping duplicate event", { eventId: event.eventId })
            RETURN { status: "duplicate" }

        // Validate event age
        IF Date.now() - event.occurredAt > 300000:
            this.logger.warn("Event too old", { eventId: event.eventId })
            RETURN { status: "expired" }

        // Mark as processed
        this.processedEvents.set(event.eventId, true)

        // Route to handlers
        eventType = event.subscriptionType
        handlers = this.handlers.get(eventType) ?? []

        FOR handler IN handlers:
            await handler(event)

        this.metrics.increment("hubspot.webhooks.processed", {
            eventType
        })

        RETURN { status: "processed" }

    FUNCTION on(eventType: string, handler: WebhookHandler) -> void:
        IF NOT this.handlers.has(eventType):
            this.handlers.set(eventType, [])
        this.handlers.get(eventType).push(handler)

INTERFACE WebhookEvent:
    eventId: number
    subscriptionId: number
    portalId: number
    occurredAt: number              // Unix timestamp ms
    subscriptionType: string        // e.g., "contact.creation"
    attemptNumber: number
    objectId: number
    propertyName?: string
    propertyValue?: string
    changeSource: string            // e.g., "CRM", "INTEGRATION"
```

---

## 10. Pipeline Operations

### 10.1 Get Pipelines

```pseudocode
ASYNC FUNCTION client.getPipelines(objectType: "deals" | "tickets") -> Pipeline[]:
    endpoint = `/crm/${this.config.apiVersion}/pipelines/${objectType}`

    response = await this.executeRequest({
        method: "GET",
        endpoint,
        operation: "getPipelines"
    })

    RETURN response.results.map(p => ({
        id: p.id,
        label: p.label,
        displayOrder: p.displayOrder,
        stages: p.stages.map(s => ({
            id: s.id,
            label: s.label,
            displayOrder: s.displayOrder,
            metadata: s.metadata
        }))
    }))

INTERFACE Pipeline:
    id: string
    label: string
    displayOrder: number
    stages: PipelineStage[]

INTERFACE PipelineStage:
    id: string
    label: string
    displayOrder: number
    metadata: Record<string, any>
```

### 10.2 Move to Pipeline Stage

```pseudocode
ASYNC FUNCTION client.moveToPipelineStage(
    type: "deals" | "tickets",
    objectId: string,
    pipelineId: string,
    stageId: string
) -> CrmObject:

    properties = type === "deals"
        ? { pipeline: pipelineId, dealstage: stageId }
        : { hs_pipeline: pipelineId, hs_pipeline_stage: stageId }

    RETURN await this.updateObject(type, objectId, properties)
```

---

## 11. Engagement Operations

### 11.1 Create Engagement

```pseudocode
ASYNC FUNCTION client.createEngagement(
    type: EngagementType,
    properties: EngagementProperties,
    associations: AssociationInput[]
) -> Engagement:

    endpoint = `/crm/${this.config.apiVersion}/objects/${type}`

    body = {
        properties: this.formatEngagementProperties(type, properties),
        associations: associations.map(a => ({
            to: { id: a.toId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: a.typeId }]
        }))
    }

    response = await this.executeRequest({
        method: "POST",
        endpoint,
        body,
        operation: "createEngagement"
    })

    RETURN this.parseEngagementResponse(response, type)

TYPE EngagementType = "notes" | "emails" | "calls" | "meetings" | "tasks"

INTERFACE EngagementProperties:
    // Notes
    hs_note_body?: string
    hs_timestamp?: number

    // Emails
    hs_email_subject?: string
    hs_email_text?: string
    hs_email_direction?: "INCOMING" | "OUTGOING"

    // Calls
    hs_call_body?: string
    hs_call_duration?: number
    hs_call_status?: string

    // Meetings
    hs_meeting_title?: string
    hs_meeting_body?: string
    hs_meeting_start_time?: number
    hs_meeting_end_time?: number

    // Tasks
    hs_task_subject?: string
    hs_task_body?: string
    hs_task_status?: string
    hs_task_priority?: string
```

---

## 12. Token Management

### 12.1 Token Manager

```pseudocode
CLASS TokenManager:
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
    onRefresh?: (tokens: Tokens) -> void
    refreshing: Promise<string> | null

    ASYNC FUNCTION getValidToken() -> string:
        // Check if token needs refresh
        IF this.refreshToken AND this.expiresAt:
            IF Date.now() > this.expiresAt.getTime() - 60000:  // 1 min buffer
                RETURN await this.refreshAccessToken()

        RETURN this.accessToken

    ASYNC FUNCTION refreshAccessToken() -> string:
        // Prevent concurrent refreshes
        IF this.refreshing:
            RETURN await this.refreshing

        this.refreshing = this.doRefresh()

        TRY:
            RETURN await this.refreshing
        FINALLY:
            this.refreshing = null

    PRIVATE ASYNC FUNCTION doRefresh() -> string:
        response = await fetch("https://api.hubapi.com/oauth/v1/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken
            })
        })

        IF NOT response.ok:
            throw new TokenRefreshError(await response.text())

        tokens = await response.json()

        this.accessToken = tokens.access_token
        this.refreshToken = tokens.refresh_token
        this.expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

        IF this.onRefresh:
            this.onRefresh({
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                expiresAt: this.expiresAt
            })

        RETURN this.accessToken
```

---

## 13. Testing Support

### 13.1 Mock Client

```pseudocode
CLASS MockHubSpotClient IMPLEMENTS HubSpotClient:
    capturedRequests: CapturedRequest[] = []
    mockResponses: Map<string, any> = new Map()
    mockErrors: Map<string, Error> = new Map()
    objects: Map<string, Map<string, CrmObject>> = new Map()
    idCounter: number = 1

    FUNCTION setMockResponse(pattern: string, response: any) -> void:
        this.mockResponses.set(pattern, response)

    FUNCTION setMockError(pattern: string, error: Error) -> void:
        this.mockErrors.set(pattern, error)

    ASYNC FUNCTION createObject(type: ObjectType, properties: Properties) -> CrmObject:
        this.capturedRequests.push({
            method: "createObject",
            args: { type, properties },
            timestamp: Date.now()
        })

        // Check for mock error
        errorKey = `createObject:${type}`
        IF this.mockErrors.has(errorKey):
            throw this.mockErrors.get(errorKey)

        // Create mock object
        id = String(this.idCounter++)
        object = {
            id,
            type,
            properties,
            createdAt: new Date(),
            updatedAt: new Date(),
            archived: false
        }

        // Store in mock database
        IF NOT this.objects.has(type):
            this.objects.set(type, new Map())
        this.objects.get(type).set(id, object)

        RETURN object

    ASYNC FUNCTION getObject(type: ObjectType, id: string) -> CrmObject | null:
        this.capturedRequests.push({
            method: "getObject",
            args: { type, id },
            timestamp: Date.now()
        })

        typeStore = this.objects.get(type)
        IF NOT typeStore:
            RETURN null

        RETURN typeStore.get(id) ?? null

    ASYNC FUNCTION searchObjects(type: ObjectType, query: SearchQuery) -> SearchResult:
        this.capturedRequests.push({
            method: "searchObjects",
            args: { type, query },
            timestamp: Date.now()
        })

        // Check for mock response
        mockKey = `search:${type}`
        IF this.mockResponses.has(mockKey):
            RETURN this.mockResponses.get(mockKey)

        // Simple in-memory filter
        typeStore = this.objects.get(type)
        IF NOT typeStore:
            RETURN { results: [], total: 0, paging: null }

        results = Array.from(typeStore.values())

        // Apply filters
        IF query.filters:
            FOR filter IN query.filters:
                results = results.filter(obj =>
                    this.matchesFilter(obj, filter)
                )

        RETURN {
            results: results.slice(0, query.limit ?? 10),
            total: results.length,
            paging: null
        }

    // Assertions
    FUNCTION assertRequestMade(method: string, matcher?: object) -> void:
        found = this.capturedRequests.find(r => {
            IF r.method !== method:
                RETURN false
            IF matcher:
                RETURN this.deepMatch(r.args, matcher)
            RETURN true
        })

        IF NOT found:
            throw new AssertionError(`No ${method} request matching criteria`)

    FUNCTION getRequestCount(method?: string) -> number:
        IF method:
            RETURN this.capturedRequests.filter(r => r.method === method).length
        RETURN this.capturedRequests.length

    FUNCTION reset() -> void:
        this.capturedRequests = []
        this.mockResponses.clear()
        this.mockErrors.clear()
        this.objects.clear()
        this.idCounter = 1
```

### 13.2 Request Recording for Replay

```pseudocode
CLASS RequestRecorder:
    recordings: RecordedRequest[] = []

    FUNCTION record(request: RequestOptions, response: any) -> void:
        this.recordings.push({
            timestamp: Date.now(),
            request: {
                method: request.method,
                endpoint: request.endpoint,
                body: request.body,
                params: request.params
            },
            response: {
                statusCode: response.statusCode,
                body: response.body
            }
        })

    FUNCTION export() -> string:
        RETURN JSON.stringify(this.recordings, null, 2)

    FUNCTION createReplayClient(recordings: RecordedRequest[]) -> HubSpotClient:
        replayIndex = 0

        RETURN new Proxy(new HubSpotClientImpl(config), {
            get(target, prop):
                IF prop === "executeRequest":
                    RETURN async (options) => {
                        IF replayIndex >= recordings.length:
                            throw new Error("No more recorded responses")

                        recording = recordings[replayIndex++]

                        // Validate request matches
                        IF recording.request.endpoint !== options.endpoint:
                            throw new Error("Request mismatch during replay")

                        RETURN recording.response.body
                    }
                RETURN target[prop]
        })
```

---

## 14. Error Classes

```pseudocode
CLASS HubSpotError EXTENDS Error:
    statusCode?: number
    category?: string
    context?: object

CLASS AuthenticationError EXTENDS HubSpotError:
    CONSTRUCTOR(message: string, context?: object):
        super(message)
        this.statusCode = 401
        this.context = context

CLASS RateLimitError EXTENDS HubSpotError:
    retryAfter: number
    limitType: "daily" | "burst" | "search"

    CONSTRUCTOR(limitType: string, retryAfter: number):
        super(`Rate limit exceeded: ${limitType}`)
        this.statusCode = 429
        this.limitType = limitType
        this.retryAfter = retryAfter

CLASS ValidationError EXTENDS HubSpotError:
    property?: string

    CONSTRUCTOR(message: string, property?: string):
        super(message)
        this.statusCode = 400
        this.property = property

CLASS ObjectNotFoundError EXTENDS HubSpotError:
    objectType: ObjectType
    objectId: string

    CONSTRUCTOR(objectType: ObjectType, objectId: string):
        super(`${objectType} not found: ${objectId}`)
        this.statusCode = 404
        this.objectType = objectType
        this.objectId = objectId

CLASS WebhookError EXTENDS HubSpotError:
    eventId?: number

CLASS InvalidSignatureError EXTENDS WebhookError:
    CONSTRUCTOR():
        super("Invalid webhook signature")
        this.statusCode = 401
```
