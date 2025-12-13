# Pseudocode: Discord Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/discord`

---

## Table of Contents

1. [Module Structure](#1-module-structure)
2. [Configuration](#2-configuration)
3. [Client Core](#3-client-core)
4. [Webhook Operations](#4-webhook-operations)
5. [Message Operations](#5-message-operations)
6. [Channel Operations](#6-channel-operations)
7. [Rate Limit Handler](#7-rate-limit-handler)
8. [Simulation Layer](#8-simulation-layer)
9. [Error Handling](#9-error-handling)

---

## 1. Module Structure

```
discord/
├── src/
│   ├── lib.rs                 # Public exports
│   ├── client.rs              # DiscordClient
│   ├── config.rs              # Configuration builder
│   ├── webhook/
│   │   ├── mod.rs
│   │   ├── execute.rs         # Execute webhook
│   │   └── manage.rs          # Edit/delete webhook messages
│   ├── message/
│   │   ├── mod.rs
│   │   ├── send.rs            # Send messages
│   │   ├── edit.rs            # Edit messages
│   │   ├── delete.rs          # Delete messages
│   │   └── reaction.rs        # Add reactions
│   ├── channel/
│   │   ├── mod.rs
│   │   ├── thread.rs          # Thread operations
│   │   └── dm.rs              # Direct messages
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   ├── bucket.rs          # Rate limit buckets
│   │   └── queue.rs           # Request queue
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs
│   │   ├── recorder.rs
│   │   └── storage.rs
│   ├── types/
│   │   ├── mod.rs
│   │   ├── message.rs         # Message, Embed
│   │   ├── component.rs       # Buttons, SelectMenu
│   │   └── snowflake.rs       # Snowflake ID
│   └── error.rs
└── tests/
    ├── webhook_test.rs
    ├── message_test.rs
    ├── rate_limit_test.rs
    └── simulation_test.rs
```

---

## 2. Configuration

### 2.1 Config Structure

```rust
STRUCT DiscordConfig {
    bot_token: Option<SecretString>,
    default_webhook_url: Option<SecretString>,
    base_url: String,                          // Default: https://discord.com/api/v10
    rate_limit_config: RateLimitConfig,
    retry_config: RetryConfig,
    simulation_mode: SimulationMode,
    channel_routing: HashMap<String, Snowflake>,
}

STRUCT RateLimitConfig {
    global_limit: u32,                         // Default: 50/sec
    queue_timeout: Duration,                   // Default: 30s
    max_queue_size: usize,                     // Default: 1000
}

STRUCT RetryConfig {
    max_retries: u32,                          // Default: 3
    initial_backoff: Duration,                 // Default: 1s
    max_backoff: Duration,                     // Default: 30s
}
```

### 2.2 Config Builder

```rust
IMPL DiscordConfigBuilder {
    FUNCTION new() -> Self {
        Self {
            bot_token: None,
            default_webhook_url: None,
            base_url: "https://discord.com/api/v10".to_string(),
            rate_limit_config: RateLimitConfig::default(),
            retry_config: RetryConfig::default(),
            simulation_mode: SimulationMode::Disabled,
            channel_routing: HashMap::new(),
        }
    }

    FUNCTION with_bot_token(mut self, token: &str) -> Self {
        self.bot_token = Some(SecretString::new(token))
        RETURN self
    }

    FUNCTION with_webhook(mut self, url: &str) -> Self {
        self.default_webhook_url = Some(SecretString::new(url))
        RETURN self
    }

    FUNCTION with_channel_route(mut self, name: &str, channel_id: Snowflake) -> Self {
        self.channel_routing.insert(name.to_string(), channel_id)
        RETURN self
    }

    FUNCTION with_simulation(mut self, mode: SimulationMode) -> Self {
        self.simulation_mode = mode
        RETURN self
    }

    FUNCTION from_env() -> Result<Self, ConfigError> {
        builder = Self::new()

        IF let Ok(token) = ENV("DISCORD_BOT_TOKEN") {
            builder = builder.with_bot_token(&token)
        }

        IF let Ok(webhook) = ENV("DISCORD_WEBHOOK_URL") {
            builder = builder.with_webhook(&webhook)
        }

        RETURN Ok(builder)
    }

    FUNCTION build(self) -> Result<DiscordConfig, ConfigError> {
        // At least one auth method required
        IF self.bot_token.is_none() AND self.default_webhook_url.is_none() {
            RETURN Err(ConfigError::NoAuthentication)
        }
        RETURN Ok(DiscordConfig { ...self })
    }
}
```

---

## 3. Client Core

```rust
STRUCT DiscordClient {
    config: Arc<DiscordConfig>,
    http_client: Arc<HttpClient>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
}

IMPL DiscordClient {
    ASYNC FUNCTION new(config: DiscordConfig) -> Result<Self, DiscordError> {
        http_client = HttpClient::builder()
            .timeout(Duration::from_secs(30))
            .build()?

        rate_limiter = RateLimiter::new(config.rate_limit_config.clone())
        simulation = SimulationLayer::new(config.simulation_mode.clone())

        RETURN Ok(Self {
            config: Arc::new(config),
            http_client: Arc::new(http_client),
            rate_limiter: Arc::new(rate_limiter),
            simulation: Arc::new(simulation),
        })
    }

    FUNCTION api_url(&self, path: &str) -> String {
        format!("{}{}", self.config.base_url, path)
    }

    ASYNC FUNCTION execute_request<T>(&self, request: DiscordRequest) -> Result<T, DiscordError> {
        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay(&request).await
        }

        // Wait for rate limit slot
        bucket = self.rate_limiter.get_bucket(&request.route)
        bucket.acquire().await?

        // Build HTTP request
        http_request = self.build_http_request(&request)?

        // Execute with retry
        response = self.execute_with_retry(http_request, &bucket).await?

        // Record if in recording mode
        IF self.simulation.is_recording() {
            self.simulation.record(&request, &response).await?
        }

        RETURN parse_response(response)
    }

    ASYNC FUNCTION execute_with_retry(&self, request: Request, bucket: &RateLimitBucket) -> Result<Response, DiscordError> {
        retry_count = 0

        LOOP {
            response = self.http_client.execute(request.clone()).await?

            // Update rate limit state from headers
            bucket.update_from_headers(&response.headers)

            MATCH response.status {
                200..=299 => RETURN Ok(response),

                429 => {
                    // Rate limited
                    retry_after = parse_retry_after(&response)
                    IF retry_count >= self.config.retry_config.max_retries {
                        RETURN Err(DiscordError::RateLimited { retry_after })
                    }
                    sleep(retry_after).await
                    retry_count += 1
                },

                500..=599 => {
                    // Server error, retry
                    IF retry_count >= self.config.retry_config.max_retries {
                        RETURN Err(DiscordError::from_response(response))
                    }
                    backoff = calculate_backoff(retry_count, &self.config.retry_config)
                    sleep(backoff).await
                    retry_count += 1
                },

                _ => RETURN Err(DiscordError::from_response(response)),
            }
        }
    }

    FUNCTION build_http_request(&self, request: &DiscordRequest) -> Result<Request, DiscordError> {
        builder = Request::builder()
            .method(request.method)
            .uri(request.url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "LLMDevOps-Discord/1.0")

        // Add auth header if not webhook
        IF !request.is_webhook {
            token = self.config.bot_token.as_ref()
                .ok_or(DiscordError::NoAuthentication)?
            builder = builder.header("Authorization", format!("Bot {}", token.expose()))
        }

        IF let Some(body) = &request.body {
            builder = builder.body(serde_json::to_vec(body)?)
        }

        RETURN Ok(builder.build()?)
    }
}
```

---

## 4. Webhook Operations

### 4.1 Execute Webhook

```rust
IMPL DiscordClient {
    ASYNC FUNCTION execute_webhook(&self, params: WebhookParams) -> Result<Option<Message>, DiscordError> {
        // Use provided URL or default
        webhook_url = params.url
            .or(self.config.default_webhook_url.clone())
            .ok_or(DiscordError::NoWebhookConfigured)?

        // Parse webhook URL to extract ID and token
        (webhook_id, webhook_token) = parse_webhook_url(&webhook_url)?

        // Build URL with query params
        url = format!("{}/webhooks/{}/{}", self.config.base_url, webhook_id, webhook_token)
        IF params.wait {
            url = format!("{}?wait=true", url)
        }
        IF let Some(thread_id) = params.thread_id {
            url = format!("{}&thread_id={}", url, thread_id)
        }

        // Build message body
        body = WebhookExecuteBody {
            content: params.content,
            username: params.username,
            avatar_url: params.avatar_url,
            embeds: params.embeds,
            components: params.components,
        }

        request = DiscordRequest {
            method: Method::POST,
            url,
            route: format!("webhook:{}", webhook_id),
            body: Some(body),
            is_webhook: true,
        }

        IF params.wait {
            RETURN Ok(Some(self.execute_request(request).await?))
        } ELSE {
            self.execute_request::<()>(request).await?
            RETURN Ok(None)
        }
    }

    ASYNC FUNCTION edit_webhook_message(&self, params: EditWebhookParams) -> Result<Message, DiscordError> {
        webhook_url = params.url.or(self.config.default_webhook_url.clone())?
        (webhook_id, webhook_token) = parse_webhook_url(&webhook_url)?

        url = format!("{}/webhooks/{}/{}/messages/{}",
                      self.config.base_url, webhook_id, webhook_token, params.message_id)

        body = MessageEditBody {
            content: params.content,
            embeds: params.embeds,
            components: params.components,
        }

        request = DiscordRequest {
            method: Method::PATCH,
            url,
            route: format!("webhook:{}:message", webhook_id),
            body: Some(body),
            is_webhook: true,
        }

        RETURN self.execute_request(request).await
    }

    ASYNC FUNCTION delete_webhook_message(&self, params: DeleteWebhookParams) -> Result<(), DiscordError> {
        webhook_url = params.url.or(self.config.default_webhook_url.clone())?
        (webhook_id, webhook_token) = parse_webhook_url(&webhook_url)?

        url = format!("{}/webhooks/{}/{}/messages/{}",
                      self.config.base_url, webhook_id, webhook_token, params.message_id)

        request = DiscordRequest {
            method: Method::DELETE,
            url,
            route: format!("webhook:{}:message", webhook_id),
            body: None,
            is_webhook: true,
        }

        RETURN self.execute_request(request).await
    }
}

FUNCTION parse_webhook_url(url: &str) -> Result<(Snowflake, String), DiscordError> {
    // URL format: https://discord.com/api/webhooks/{id}/{token}
    regex = Regex::new(r"webhooks/(\d+)/([A-Za-z0-9_-]+)")?
    captures = regex.captures(url)
        .ok_or(DiscordError::InvalidWebhookUrl)?

    webhook_id = captures[1].parse::<Snowflake>()?
    webhook_token = captures[2].to_string()

    RETURN Ok((webhook_id, webhook_token))
}
```

---

## 5. Message Operations

### 5.1 Send Message

```rust
IMPL DiscordClient {
    ASYNC FUNCTION send_message(&self, params: SendMessageParams) -> Result<Message, DiscordError> {
        // Resolve channel from routing if named
        channel_id = self.resolve_channel(params.channel)?

        url = self.api_url(&format!("/channels/{}/messages", channel_id))

        body = MessageCreateBody {
            content: params.content,
            embeds: params.embeds,
            components: params.components,
            message_reference: params.reply_to.map(|id| MessageReference {
                message_id: Some(id),
                channel_id: Some(channel_id),
                fail_if_not_exists: Some(false),
            }),
        }

        request = DiscordRequest {
            method: Method::POST,
            url,
            route: format!("channel:{}:messages", channel_id),
            body: Some(body),
            is_webhook: false,
        }

        RETURN self.execute_request(request).await
    }

    FUNCTION resolve_channel(&self, channel: ChannelTarget) -> Result<Snowflake, DiscordError> {
        MATCH channel {
            ChannelTarget::Id(id) => Ok(id),
            ChannelTarget::Name(name) => {
                self.config.channel_routing.get(&name)
                    .copied()
                    .ok_or(DiscordError::UnknownChannelRoute { name })
            }
        }
    }
}

ENUM ChannelTarget {
    Id(Snowflake),
    Name(String),
}
```

### 5.2 Edit Message

```rust
IMPL DiscordClient {
    ASYNC FUNCTION edit_message(&self, params: EditMessageParams) -> Result<Message, DiscordError> {
        channel_id = self.resolve_channel(params.channel)?

        url = self.api_url(&format!("/channels/{}/messages/{}", channel_id, params.message_id))

        body = MessageEditBody {
            content: params.content,
            embeds: params.embeds,
            components: params.components,
        }

        request = DiscordRequest {
            method: Method::PATCH,
            url,
            route: format!("channel:{}:message:{}", channel_id, params.message_id),
            body: Some(body),
            is_webhook: false,
        }

        RETURN self.execute_request(request).await
    }
}
```

### 5.3 Delete Message

```rust
IMPL DiscordClient {
    ASYNC FUNCTION delete_message(&self, channel: ChannelTarget, message_id: Snowflake) -> Result<(), DiscordError> {
        channel_id = self.resolve_channel(channel)?

        url = self.api_url(&format!("/channels/{}/messages/{}", channel_id, message_id))

        request = DiscordRequest {
            method: Method::DELETE,
            url,
            route: format!("channel:{}:message:{}", channel_id, message_id),
            body: None,
            is_webhook: false,
        }

        // Handle 404 gracefully (already deleted)
        MATCH self.execute_request::<()>(request).await {
            Ok(()) => Ok(()),
            Err(DiscordError::NotFound { .. }) => Ok(()),
            Err(e) => Err(e),
        }
    }
}
```

### 5.4 Add Reaction

```rust
IMPL DiscordClient {
    ASYNC FUNCTION add_reaction(&self, params: ReactionParams) -> Result<(), DiscordError> {
        channel_id = self.resolve_channel(params.channel)?

        // Encode emoji for URL
        emoji_encoded = encode_emoji(&params.emoji)

        url = self.api_url(&format!(
            "/channels/{}/messages/{}/reactions/{}/@me",
            channel_id, params.message_id, emoji_encoded
        ))

        request = DiscordRequest {
            method: Method::PUT,
            url,
            route: format!("channel:{}:reactions", channel_id),
            body: None,
            is_webhook: false,
        }

        RETURN self.execute_request(request).await
    }
}

FUNCTION encode_emoji(emoji: &Emoji) -> String {
    MATCH emoji {
        Emoji::Unicode(s) => url_encode(s),
        Emoji::Custom { name, id } => format!("{}:{}", name, id),
    }
}
```

---

## 6. Channel Operations

### 6.1 Create Thread

```rust
IMPL DiscordClient {
    ASYNC FUNCTION create_thread(&self, params: CreateThreadParams) -> Result<Channel, DiscordError> {
        channel_id = self.resolve_channel(params.channel)?

        url = IF let Some(message_id) = params.message_id {
            // Create thread from message
            self.api_url(&format!("/channels/{}/messages/{}/threads", channel_id, message_id))
        } ELSE {
            // Create thread without message
            self.api_url(&format!("/channels/{}/threads", channel_id))
        }

        body = CreateThreadBody {
            name: params.name,
            auto_archive_duration: params.auto_archive_duration.unwrap_or(1440), // 24h
            thread_type: params.thread_type,
            invitable: params.invitable,
        }

        request = DiscordRequest {
            method: Method::POST,
            url,
            route: format!("channel:{}:threads", channel_id),
            body: Some(body),
            is_webhook: false,
        }

        RETURN self.execute_request(request).await
    }

    ASYNC FUNCTION send_to_thread(&self, thread_id: Snowflake, params: SendMessageParams) -> Result<Message, DiscordError> {
        // Threads use same message endpoint as channels
        RETURN self.send_message(SendMessageParams {
            channel: ChannelTarget::Id(thread_id),
            ..params
        }).await
    }
}
```

### 6.2 Direct Messages

```rust
IMPL DiscordClient {
    ASYNC FUNCTION send_dm(&self, user_id: Snowflake, params: SendMessageParams) -> Result<Message, DiscordError> {
        // First, create or get DM channel
        dm_channel = self.get_or_create_dm_channel(user_id).await?

        // Then send message to DM channel
        RETURN self.send_message(SendMessageParams {
            channel: ChannelTarget::Id(dm_channel.id),
            ..params
        }).await
    }

    ASYNC FUNCTION get_or_create_dm_channel(&self, user_id: Snowflake) -> Result<Channel, DiscordError> {
        url = self.api_url("/users/@me/channels")

        body = CreateDMBody {
            recipient_id: user_id,
        }

        request = DiscordRequest {
            method: Method::POST,
            url,
            route: "users:dm".to_string(),
            body: Some(body),
            is_webhook: false,
        }

        RETURN self.execute_request(request).await
    }
}
```

---

## 7. Rate Limit Handler

### 7.1 Rate Limiter

```rust
STRUCT RateLimiter {
    config: RateLimitConfig,
    buckets: RwLock<HashMap<String, Arc<RateLimitBucket>>>,
    global_bucket: Arc<RateLimitBucket>,
}

IMPL RateLimiter {
    FUNCTION new(config: RateLimitConfig) -> Self {
        global_bucket = RateLimitBucket::new_global(config.global_limit)

        Self {
            config,
            buckets: RwLock::new(HashMap::new()),
            global_bucket: Arc::new(global_bucket),
        }
    }

    FUNCTION get_bucket(&self, route: &str) -> Arc<RateLimitBucket> {
        // Check if bucket exists
        IF let Some(bucket) = self.buckets.read().get(route) {
            RETURN bucket.clone()
        }

        // Create new bucket
        bucket = Arc::new(RateLimitBucket::new(route))
        self.buckets.write().insert(route.to_string(), bucket.clone())

        RETURN bucket
    }
}

STRUCT RateLimitBucket {
    route: String,
    remaining: AtomicU32,
    reset_at: AtomicU64,
    semaphore: Semaphore,
}

IMPL RateLimitBucket {
    ASYNC FUNCTION acquire(&self) -> Result<(), DiscordError> {
        // Wait for semaphore permit
        permit = self.semaphore.acquire().await?

        // Check if we need to wait for reset
        now = current_timestamp()
        reset_at = self.reset_at.load()

        IF self.remaining.load() == 0 AND reset_at > now {
            wait_duration = Duration::from_secs(reset_at - now)
            IF wait_duration > Duration::from_secs(30) {
                RETURN Err(DiscordError::RateLimitTimeout)
            }
            sleep(wait_duration).await
        }

        // Decrement remaining
        self.remaining.fetch_sub(1)

        // Release permit after request completes (handled by caller)
        Ok(())
    }

    FUNCTION update_from_headers(&self, headers: &Headers) {
        IF let Some(remaining) = headers.get("X-RateLimit-Remaining") {
            self.remaining.store(remaining.parse().unwrap_or(1))
        }

        IF let Some(reset) = headers.get("X-RateLimit-Reset") {
            self.reset_at.store(reset.parse().unwrap_or(0))
        }
    }
}
```

### 7.2 Request Queue

```rust
STRUCT RequestQueue {
    queue: Mutex<VecDeque<QueuedRequest>>,
    config: RateLimitConfig,
    notify: Notify,
}

STRUCT QueuedRequest {
    request: DiscordRequest,
    response_tx: oneshot::Sender<Result<Response, DiscordError>>,
    queued_at: Instant,
}

IMPL RequestQueue {
    ASYNC FUNCTION enqueue(&self, request: DiscordRequest) -> Result<Response, DiscordError> {
        (tx, rx) = oneshot::channel()

        queued = QueuedRequest {
            request,
            response_tx: tx,
            queued_at: Instant::now(),
        }

        // Check queue size
        guard = self.queue.lock()
        IF guard.len() >= self.config.max_queue_size {
            RETURN Err(DiscordError::QueueFull)
        }
        guard.push_back(queued)
        drop(guard)

        // Notify processor
        self.notify.notify_one()

        // Wait for response with timeout
        timeout(self.config.queue_timeout, rx).await
            .map_err(|_| DiscordError::QueueTimeout)?
            .map_err(|_| DiscordError::QueueCancelled)?
    }
}
```

---

## 8. Simulation Layer

```rust
STRUCT SimulationLayer {
    mode: RwLock<SimulationMode>,
    recorder: RwLock<SimulationRecorder>,
    storage: SimulationStorage,
}

IMPL SimulationLayer {
    FUNCTION new(mode: SimulationMode) -> Self {
        recorder = SimulationRecorder::new()
        storage = SimulationStorage::new()

        IF let SimulationMode::Replay { path } = &mode {
            storage.load(path).expect("Failed to load recordings")
        }

        Self {
            mode: RwLock::new(mode),
            recorder: RwLock::new(recorder),
            storage,
        }
    }

    FUNCTION is_recording(&self) -> bool {
        matches!(*self.mode.read(), SimulationMode::Recording { .. })
    }

    FUNCTION is_replay(&self) -> bool {
        matches!(*self.mode.read(), SimulationMode::Replay { .. })
    }

    ASYNC FUNCTION replay<T>(&self, request: &DiscordRequest) -> Result<T, DiscordError> {
        key = generate_replay_key(request)
        recording = self.storage.find(&key)
            .ok_or(DiscordError::SimulationNoMatch { key })?

        // Generate mock response with fresh IDs
        mock_response = generate_mock_response(&recording)

        RETURN deserialize_response(mock_response)
    }

    ASYNC FUNCTION record(&self, request: &DiscordRequest, response: &Response) -> Result<(), DiscordError> {
        interaction = RecordedInteraction {
            timestamp: now(),
            operation: request.route.clone(),
            request: serialize_request(request),
            response: serialize_response(response),
            rate_limit_info: extract_rate_limit_info(response),
        }

        self.recorder.write().add(interaction)
        Ok(())
    }

    ASYNC FUNCTION save(&self) -> Result<(), DiscordError> {
        IF let SimulationMode::Recording { path } = &*self.mode.read() {
            recordings = self.recorder.read().get_all()
            self.storage.save(path, recordings)?
        }
        Ok(())
    }
}

FUNCTION generate_mock_response(recording: &RecordedInteraction) -> MockResponse {
    // Generate fresh snowflake IDs for messages
    IF recording.operation.contains("messages") {
        mock_message_id = generate_snowflake()
        // Replace message ID in recorded response
        response = recording.response.clone()
        response.replace_id(mock_message_id)
        RETURN response
    }
    RETURN recording.response.clone()
}

FUNCTION generate_snowflake() -> Snowflake {
    // Generate a valid Discord snowflake
    // Format: timestamp (42 bits) | worker (5 bits) | process (5 bits) | increment (12 bits)
    timestamp = (current_millis() - DISCORD_EPOCH) << 22
    RETURN timestamp | (rand() & 0x3FFFFF)
}
```

---

## 9. Error Handling

```rust
ENUM DiscordError {
    // Rate limiting
    RateLimited { retry_after: Duration },
    RateLimitTimeout,
    QueueFull,
    QueueTimeout,

    // Authentication
    NoAuthentication,
    Unauthorized { message: String },
    Forbidden { message: String },

    // Resource errors
    NotFound { resource: String },
    InvalidWebhookUrl,
    UnknownChannelRoute { name: String },
    NoWebhookConfigured,

    // Request errors
    BadRequest { code: i32, message: String },
    ValidationError { errors: Vec<String> },

    // Server errors
    ServerError { status: u16, message: String },
    NetworkError { source: Box<dyn Error> },

    // Simulation errors
    SimulationNoMatch { key: String },
    SimulationLoadError { path: PathBuf, source: Box<dyn Error> },
}

IMPL DiscordError {
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            Self::RateLimited { .. } => true,
            Self::ServerError { .. } => true,
            Self::NetworkError { .. } => true,
            _ => false,
        }
    }

    FUNCTION from_response(response: Response) -> Self {
        status = response.status
        body = response.json::<DiscordApiError>().ok()

        MATCH status {
            401 => Self::Unauthorized {
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            403 => Self::Forbidden {
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            404 => Self::NotFound {
                resource: "unknown".to_string(),
            },
            429 => Self::RateLimited {
                retry_after: parse_retry_after(&response),
            },
            400 => Self::BadRequest {
                code: body.map(|b| b.code).unwrap_or(0),
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            _ IF status >= 500 => Self::ServerError {
                status,
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            _ => Self::BadRequest {
                code: 0,
                message: format!("Unexpected status: {}", status),
            },
        }
    }
}

STRUCT DiscordApiError {
    code: i32,
    message: String,
    errors: Option<HashMap<String, Value>>,
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-DISCORD-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 2 Complete - Proceed to Architecture phase with "Next phase."*
