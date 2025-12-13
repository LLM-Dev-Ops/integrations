# Pseudocode: Telegram Bot API Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/telegram-bot-api`

---

## Table of Contents

1. [Module Structure](#1-module-structure)
2. [Configuration](#2-configuration)
3. [Client Core](#3-client-core)
4. [Update Handling](#4-update-handling)
5. [Message Operations](#5-message-operations)
6. [Media Operations](#6-media-operations)
7. [Keyboard Operations](#7-keyboard-operations)
8. [Rate Limit Handler](#8-rate-limit-handler)
9. [Simulation Layer](#9-simulation-layer)
10. [Error Handling](#10-error-handling)

---

## 1. Module Structure

```
telegram-bot-api/
├── src/
│   ├── lib.rs                 # Public exports
│   ├── client.rs              # TelegramClient
│   ├── config.rs              # Configuration builder
│   ├── updates/
│   │   ├── mod.rs
│   │   ├── webhook.rs         # Webhook handler
│   │   └── polling.rs         # Long polling
│   ├── message/
│   │   ├── mod.rs
│   │   ├── send.rs            # Send messages
│   │   ├── edit.rs            # Edit messages
│   │   ├── delete.rs          # Delete messages
│   │   └── forward.rs         # Forward/copy
│   ├── media/
│   │   ├── mod.rs
│   │   ├── photo.rs
│   │   ├── document.rs
│   │   └── upload.rs          # File uploads
│   ├── keyboard/
│   │   ├── mod.rs
│   │   ├── inline.rs
│   │   └── reply.rs
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   └── limiter.rs
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs
│   │   └── storage.rs
│   ├── types/
│   │   ├── mod.rs
│   │   ├── update.rs
│   │   ├── message.rs
│   │   ├── chat.rs
│   │   └── keyboard.rs
│   └── error.rs
└── tests/
    ├── message_test.rs
    ├── webhook_test.rs
    └── simulation_test.rs
```

---

## 2. Configuration

### 2.1 Config Structure

```rust
STRUCT TelegramConfig {
    bot_token: SecretString,
    api_base_url: String,                      // Default: https://api.telegram.org
    webhook_secret: Option<SecretString>,
    rate_limit_config: RateLimitConfig,
    retry_config: RetryConfig,
    simulation_mode: SimulationMode,
    chat_routing: HashMap<String, ChatId>,
    polling_config: Option<PollingConfig>,
}

STRUCT RateLimitConfig {
    messages_per_second: u32,                  // Default: 30
    messages_per_chat_second: u32,             // Default: 1
    group_messages_per_minute: u32,            // Default: 20
    queue_timeout: Duration,                   // Default: 30s
}

STRUCT PollingConfig {
    timeout: u32,                              // Default: 30 seconds
    allowed_updates: Vec<String>,              // Filter update types
    limit: u32,                                // Max updates per request
}
```

### 2.2 Config Builder

```rust
IMPL TelegramConfigBuilder {
    FUNCTION new(bot_token: &str) -> Self {
        Self {
            bot_token: SecretString::new(bot_token),
            api_base_url: "https://api.telegram.org".to_string(),
            webhook_secret: None,
            rate_limit_config: RateLimitConfig::default(),
            retry_config: RetryConfig::default(),
            simulation_mode: SimulationMode::Disabled,
            chat_routing: HashMap::new(),
            polling_config: None,
        }
    }

    FUNCTION with_webhook_secret(mut self, secret: &str) -> Self {
        self.webhook_secret = Some(SecretString::new(secret))
        RETURN self
    }

    FUNCTION with_chat_route(mut self, name: &str, chat_id: ChatId) -> Self {
        self.chat_routing.insert(name.to_string(), chat_id)
        RETURN self
    }

    FUNCTION with_polling(mut self, config: PollingConfig) -> Self {
        self.polling_config = Some(config)
        RETURN self
    }

    FUNCTION with_simulation(mut self, mode: SimulationMode) -> Self {
        self.simulation_mode = mode
        RETURN self
    }

    FUNCTION from_env() -> Result<Self, ConfigError> {
        token = ENV("TELEGRAM_BOT_TOKEN")?
        builder = Self::new(&token)

        IF let Ok(secret) = ENV("TELEGRAM_WEBHOOK_SECRET") {
            builder = builder.with_webhook_secret(&secret)
        }

        RETURN Ok(builder)
    }

    FUNCTION build(self) -> Result<TelegramConfig, ConfigError> {
        RETURN Ok(TelegramConfig { ...self })
    }
}
```

---

## 3. Client Core

```rust
STRUCT TelegramClient {
    config: Arc<TelegramConfig>,
    http_client: Arc<HttpClient>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
}

IMPL TelegramClient {
    ASYNC FUNCTION new(config: TelegramConfig) -> Result<Self, TelegramError> {
        http_client = HttpClient::builder()
            .timeout(Duration::from_secs(60))
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

    FUNCTION api_url(&self, method: &str) -> String {
        format!("{}/bot{}/{}",
            self.config.api_base_url,
            self.config.bot_token.expose(),
            method
        )
    }

    ASYNC FUNCTION call_api<T, R>(&self, method: &str, params: &T) -> Result<R, TelegramError> {
        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay(method, params).await
        }

        // Extract chat_id for rate limiting
        chat_id = extract_chat_id(params)

        // Wait for rate limit slot
        self.rate_limiter.acquire(chat_id).await?

        // Build request
        url = self.api_url(method)
        request = Request::builder()
            .method(Method::POST)
            .uri(url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(params)?)?

        // Execute with retry
        response = self.execute_with_retry(request).await?

        // Record if in recording mode
        IF self.simulation.is_recording() {
            self.simulation.record(method, params, &response).await?
        }

        // Parse response
        api_response: ApiResponse<R> = response.json().await?

        IF api_response.ok {
            RETURN Ok(api_response.result.unwrap())
        } ELSE {
            RETURN Err(TelegramError::from_api_error(
                api_response.error_code,
                api_response.description
            ))
        }
    }

    ASYNC FUNCTION execute_with_retry(&self, request: Request) -> Result<Response, TelegramError> {
        retry_count = 0

        LOOP {
            response = self.http_client.execute(request.clone()).await?

            MATCH response.status {
                200 => RETURN Ok(response),

                429 => {
                    // Rate limited by Telegram
                    retry_after = parse_retry_after(&response)
                    IF retry_count >= self.config.retry_config.max_retries {
                        RETURN Err(TelegramError::RateLimited { retry_after })
                    }
                    sleep(Duration::from_secs(retry_after)).await
                    retry_count += 1
                },

                500..=599 => {
                    // Server error, retry
                    IF retry_count >= self.config.retry_config.max_retries {
                        RETURN Err(TelegramError::from_response(response))
                    }
                    backoff = calculate_backoff(retry_count, &self.config.retry_config)
                    sleep(backoff).await
                    retry_count += 1
                },

                _ => RETURN Err(TelegramError::from_response(response)),
            }
        }
    }
}

STRUCT ApiResponse<T> {
    ok: bool,
    result: Option<T>,
    error_code: Option<i32>,
    description: Option<String>,
    parameters: Option<ResponseParameters>,
}

STRUCT ResponseParameters {
    retry_after: Option<i32>,
    migrate_to_chat_id: Option<i64>,
}
```

---

## 4. Update Handling

### 4.1 Webhook Handler

```rust
IMPL TelegramClient {
    ASYNC FUNCTION handle_webhook(&self, body: &[u8], headers: &Headers) -> Result<Option<Update>, TelegramError> {
        // Verify webhook secret if configured
        IF let Some(secret) = &self.config.webhook_secret {
            signature = headers.get("X-Telegram-Bot-Api-Secret-Token")
                .ok_or(TelegramError::InvalidWebhookSignature)?

            IF signature != secret.expose() {
                RETURN Err(TelegramError::InvalidWebhookSignature)
            }
        }

        // Parse update
        update: Update = serde_json::from_slice(body)?

        // Record if in recording mode
        IF self.simulation.is_recording() {
            self.simulation.record_update(&update).await?
        }

        RETURN Ok(Some(update))
    }
}

STRUCT Update {
    update_id: i64,
    message: Option<Message>,
    edited_message: Option<Message>,
    channel_post: Option<Message>,
    edited_channel_post: Option<Message>,
    callback_query: Option<CallbackQuery>,
}

IMPL Update {
    FUNCTION get_chat_id(&self) -> Option<i64> {
        IF let Some(msg) = &self.message {
            RETURN Some(msg.chat.id)
        }
        IF let Some(msg) = &self.edited_message {
            RETURN Some(msg.chat.id)
        }
        IF let Some(cb) = &self.callback_query {
            RETURN cb.message.as_ref().map(|m| m.chat.id)
        }
        RETURN None
    }

    FUNCTION get_text(&self) -> Option<&str> {
        self.message.as_ref().and_then(|m| m.text.as_deref())
    }
}
```

### 4.2 Long Polling

```rust
IMPL TelegramClient {
    ASYNC FUNCTION poll_updates<F>(&self, handler: F) -> Result<(), TelegramError>
    WHERE F: Fn(Update) -> Future<Output = Result<(), TelegramError>>
    {
        polling_config = self.config.polling_config.as_ref()
            .ok_or(TelegramError::PollingNotConfigured)?

        offset: i64 = 0

        LOOP {
            // Check simulation mode
            IF self.simulation.is_replay() {
                updates = self.simulation.replay_updates().await?
            } ELSE {
                params = GetUpdatesParams {
                    offset: IF offset > 0 { Some(offset) } ELSE { None },
                    timeout: Some(polling_config.timeout),
                    allowed_updates: polling_config.allowed_updates.clone(),
                    limit: Some(polling_config.limit),
                }

                updates: Vec<Update> = self.call_api("getUpdates", &params).await?
            }

            FOR update IN updates {
                // Update offset to acknowledge
                offset = update.update_id + 1

                // Record if recording
                IF self.simulation.is_recording() {
                    self.simulation.record_update(&update).await?
                }

                // Handle update
                handler(update).await?
            }
        }
    }

    ASYNC FUNCTION delete_webhook(&self) -> Result<bool, TelegramError> {
        params = DeleteWebhookParams { drop_pending_updates: Some(false) }
        RETURN self.call_api("deleteWebhook", &params).await
    }

    ASYNC FUNCTION set_webhook(&self, url: &str, secret: Option<&str>) -> Result<bool, TelegramError> {
        params = SetWebhookParams {
            url: url.to_string(),
            secret_token: secret.map(|s| s.to_string()),
            allowed_updates: None,
            max_connections: Some(40),
        }
        RETURN self.call_api("setWebhook", &params).await
    }
}
```

---

## 5. Message Operations

### 5.1 Send Message

```rust
IMPL TelegramClient {
    ASYNC FUNCTION send_message(&self, params: SendMessageParams) -> Result<Message, TelegramError> {
        // Resolve chat from routing if named
        chat_id = self.resolve_chat(params.chat)?

        api_params = SendMessageApiParams {
            chat_id,
            text: params.text,
            parse_mode: params.parse_mode,
            entities: params.entities,
            disable_notification: params.disable_notification,
            reply_to_message_id: params.reply_to_message_id,
            reply_markup: params.reply_markup,
        }

        RETURN self.call_api("sendMessage", &api_params).await
    }

    FUNCTION resolve_chat(&self, chat: ChatTarget) -> Result<ChatId, TelegramError> {
        MATCH chat {
            ChatTarget::Id(id) => Ok(ChatId::Id(id)),
            ChatTarget::Username(u) => Ok(ChatId::Username(u)),
            ChatTarget::Name(name) => {
                self.config.chat_routing.get(&name)
                    .cloned()
                    .ok_or(TelegramError::UnknownChatRoute { name })
            }
        }
    }
}

STRUCT SendMessageParams {
    chat: ChatTarget,
    text: String,
    parse_mode: Option<ParseMode>,           // Markdown, MarkdownV2, HTML
    entities: Option<Vec<MessageEntity>>,
    disable_notification: Option<bool>,
    reply_to_message_id: Option<i64>,
    reply_markup: Option<ReplyMarkup>,
}

ENUM ChatTarget {
    Id(i64),
    Username(String),
    Name(String),                            // Lookup in chat_routing
}

ENUM ParseMode {
    Markdown,
    MarkdownV2,
    HTML,
}

ENUM ReplyMarkup {
    InlineKeyboard(InlineKeyboardMarkup),
    ReplyKeyboard(ReplyKeyboardMarkup),
    ReplyKeyboardRemove(ReplyKeyboardRemove),
    ForceReply(ForceReply),
}
```

### 5.2 Edit Message

```rust
IMPL TelegramClient {
    ASYNC FUNCTION edit_message_text(&self, params: EditMessageParams) -> Result<Message, TelegramError> {
        chat_id = self.resolve_chat(params.chat)?

        api_params = EditMessageTextParams {
            chat_id: Some(chat_id),
            message_id: Some(params.message_id),
            inline_message_id: None,
            text: params.text,
            parse_mode: params.parse_mode,
            entities: params.entities,
            reply_markup: params.reply_markup,
        }

        RETURN self.call_api("editMessageText", &api_params).await
    }

    ASYNC FUNCTION edit_message_caption(&self, params: EditCaptionParams) -> Result<Message, TelegramError> {
        chat_id = self.resolve_chat(params.chat)?

        api_params = EditMessageCaptionParams {
            chat_id: Some(chat_id),
            message_id: Some(params.message_id),
            caption: params.caption,
            parse_mode: params.parse_mode,
            reply_markup: params.reply_markup,
        }

        RETURN self.call_api("editMessageCaption", &api_params).await
    }
}
```

### 5.3 Delete Message

```rust
IMPL TelegramClient {
    ASYNC FUNCTION delete_message(&self, chat: ChatTarget, message_id: i64) -> Result<bool, TelegramError> {
        chat_id = self.resolve_chat(chat)?

        params = DeleteMessageParams {
            chat_id,
            message_id,
        }

        // Handle already-deleted gracefully
        MATCH self.call_api::<_, bool>("deleteMessage", &params).await {
            Ok(result) => Ok(result),
            Err(TelegramError::BadRequest { description }) IF description.contains("message to delete not found") => {
                Ok(true)  // Already deleted
            },
            Err(e) => Err(e),
        }
    }
}
```

### 5.4 Forward and Copy

```rust
IMPL TelegramClient {
    ASYNC FUNCTION forward_message(&self, params: ForwardParams) -> Result<Message, TelegramError> {
        from_chat = self.resolve_chat(params.from_chat)?
        to_chat = self.resolve_chat(params.to_chat)?

        api_params = ForwardMessageParams {
            chat_id: to_chat,
            from_chat_id: from_chat,
            message_id: params.message_id,
            disable_notification: params.disable_notification,
        }

        RETURN self.call_api("forwardMessage", &api_params).await
    }

    ASYNC FUNCTION copy_message(&self, params: CopyParams) -> Result<MessageId, TelegramError> {
        from_chat = self.resolve_chat(params.from_chat)?
        to_chat = self.resolve_chat(params.to_chat)?

        api_params = CopyMessageParams {
            chat_id: to_chat,
            from_chat_id: from_chat,
            message_id: params.message_id,
            caption: params.caption,
            parse_mode: params.parse_mode,
            disable_notification: params.disable_notification,
        }

        RETURN self.call_api("copyMessage", &api_params).await
    }
}

STRUCT MessageId {
    message_id: i64,
}
```

---

## 6. Media Operations

### 6.1 Send Photo

```rust
IMPL TelegramClient {
    ASYNC FUNCTION send_photo(&self, params: SendPhotoParams) -> Result<Message, TelegramError> {
        chat_id = self.resolve_chat(params.chat)?

        // Handle different photo sources
        MATCH params.photo {
            InputFile::FileId(file_id) => {
                // Send by file_id (already on Telegram servers)
                api_params = SendPhotoParams {
                    chat_id,
                    photo: file_id,
                    caption: params.caption,
                    parse_mode: params.parse_mode,
                    has_spoiler: params.has_spoiler,
                    reply_markup: params.reply_markup,
                }
                RETURN self.call_api("sendPhoto", &api_params).await
            },
            InputFile::Url(url) => {
                // Send by URL
                api_params = SendPhotoParams {
                    chat_id,
                    photo: url,
                    caption: params.caption,
                    parse_mode: params.parse_mode,
                    has_spoiler: params.has_spoiler,
                    reply_markup: params.reply_markup,
                }
                RETURN self.call_api("sendPhoto", &api_params).await
            },
            InputFile::Upload { data, filename } => {
                // Upload file
                RETURN self.upload_photo(chat_id, data, filename, params).await
            }
        }
    }

    ASYNC FUNCTION upload_photo(&self, chat_id: ChatId, data: Vec<u8>, filename: String, params: SendPhotoParams) -> Result<Message, TelegramError> {
        // Build multipart form
        form = multipart::Form::new()
            .text("chat_id", chat_id.to_string())
            .part("photo", multipart::Part::bytes(data).file_name(filename))

        IF let Some(caption) = params.caption {
            form = form.text("caption", caption)
        }
        IF let Some(parse_mode) = params.parse_mode {
            form = form.text("parse_mode", parse_mode.to_string())
        }

        url = self.api_url("sendPhoto")
        response = self.http_client.post(url).multipart(form).send().await?

        RETURN parse_api_response(response).await
    }
}

ENUM InputFile {
    FileId(String),
    Url(String),
    Upload { data: Vec<u8>, filename: String },
}
```

### 6.2 Send Document

```rust
IMPL TelegramClient {
    ASYNC FUNCTION send_document(&self, params: SendDocumentParams) -> Result<Message, TelegramError> {
        chat_id = self.resolve_chat(params.chat)?

        MATCH params.document {
            InputFile::FileId(file_id) | InputFile::Url(file_id) => {
                api_params = SendDocumentApiParams {
                    chat_id,
                    document: file_id,
                    caption: params.caption,
                    parse_mode: params.parse_mode,
                    disable_content_type_detection: params.disable_content_type_detection,
                }
                RETURN self.call_api("sendDocument", &api_params).await
            },
            InputFile::Upload { data, filename } => {
                RETURN self.upload_document(chat_id, data, filename, params).await
            }
        }
    }
}
```

---

## 7. Keyboard Operations

### 7.1 Inline Keyboard Builder

```rust
STRUCT InlineKeyboardBuilder {
    rows: Vec<Vec<InlineKeyboardButton>>,
    current_row: Vec<InlineKeyboardButton>,
}

IMPL InlineKeyboardBuilder {
    FUNCTION new() -> Self {
        Self { rows: Vec::new(), current_row: Vec::new() }
    }

    FUNCTION button(mut self, text: &str, callback_data: &str) -> Self {
        self.current_row.push(InlineKeyboardButton {
            text: text.to_string(),
            callback_data: Some(callback_data.to_string()),
            url: None,
        })
        RETURN self
    }

    FUNCTION url_button(mut self, text: &str, url: &str) -> Self {
        self.current_row.push(InlineKeyboardButton {
            text: text.to_string(),
            url: Some(url.to_string()),
            callback_data: None,
        })
        RETURN self
    }

    FUNCTION row(mut self) -> Self {
        IF !self.current_row.is_empty() {
            self.rows.push(std::mem::take(&mut self.current_row))
        }
        RETURN self
    }

    FUNCTION build(mut self) -> InlineKeyboardMarkup {
        // Finalize any pending row
        IF !self.current_row.is_empty() {
            self.rows.push(self.current_row)
        }
        InlineKeyboardMarkup { inline_keyboard: self.rows }
    }
}
```

### 7.2 Answer Callback Query

```rust
IMPL TelegramClient {
    ASYNC FUNCTION answer_callback_query(&self, params: AnswerCallbackParams) -> Result<bool, TelegramError> {
        api_params = AnswerCallbackQueryParams {
            callback_query_id: params.callback_query_id,
            text: params.text,
            show_alert: params.show_alert,
            url: params.url,
            cache_time: params.cache_time,
        }

        RETURN self.call_api("answerCallbackQuery", &api_params).await
    }

    ASYNC FUNCTION edit_message_reply_markup(&self, params: EditReplyMarkupParams) -> Result<Message, TelegramError> {
        chat_id = self.resolve_chat(params.chat)?

        api_params = EditMessageReplyMarkupParams {
            chat_id: Some(chat_id),
            message_id: Some(params.message_id),
            inline_message_id: None,
            reply_markup: params.reply_markup,
        }

        RETURN self.call_api("editMessageReplyMarkup", &api_params).await
    }
}
```

---

## 8. Rate Limit Handler

```rust
STRUCT RateLimiter {
    config: RateLimitConfig,
    global_semaphore: Semaphore,
    chat_limiters: RwLock<HashMap<i64, ChatLimiter>>,
}

STRUCT ChatLimiter {
    last_message: Instant,
    is_group: bool,
    messages_this_minute: AtomicU32,
    minute_start: AtomicU64,
}

IMPL RateLimiter {
    FUNCTION new(config: RateLimitConfig) -> Self {
        Self {
            config,
            global_semaphore: Semaphore::new(config.messages_per_second as usize),
            chat_limiters: RwLock::new(HashMap::new()),
        }
    }

    ASYNC FUNCTION acquire(&self, chat_id: Option<i64>) -> Result<(), TelegramError> {
        // Acquire global permit
        permit = timeout(self.config.queue_timeout, self.global_semaphore.acquire())
            .await
            .map_err(|_| TelegramError::RateLimitTimeout)?
            .map_err(|_| TelegramError::RateLimitClosed)?

        // Check per-chat limits
        IF let Some(chat_id) = chat_id {
            self.acquire_chat_slot(chat_id).await?
        }

        // Release global permit after delay (1/rate seconds)
        tokio::spawn(async move {
            sleep(Duration::from_millis(1000 / 30)).await
            drop(permit)
        });

        Ok(())
    }

    ASYNC FUNCTION acquire_chat_slot(&self, chat_id: i64) -> Result<(), TelegramError> {
        limiter = self.get_or_create_chat_limiter(chat_id)

        // Check time since last message to this chat
        elapsed = limiter.last_message.elapsed()
        min_interval = Duration::from_secs(1)  // 1 msg/sec per chat

        IF elapsed < min_interval {
            sleep(min_interval - elapsed).await
        }

        // Check group rate limit (20/min)
        IF limiter.is_group {
            now = current_timestamp()
            minute_start = limiter.minute_start.load()

            IF now - minute_start >= 60 {
                limiter.minute_start.store(now)
                limiter.messages_this_minute.store(0)
            }

            count = limiter.messages_this_minute.fetch_add(1)
            IF count >= self.config.group_messages_per_minute {
                // Wait for next minute
                wait_time = 60 - (now - minute_start)
                sleep(Duration::from_secs(wait_time)).await
                limiter.messages_this_minute.store(1)
                limiter.minute_start.store(current_timestamp())
            }
        }

        limiter.last_message = Instant::now()
        Ok(())
    }

    FUNCTION get_or_create_chat_limiter(&self, chat_id: i64) -> &ChatLimiter {
        // Get existing or create new
        IF !self.chat_limiters.read().contains_key(&chat_id) {
            self.chat_limiters.write().insert(chat_id, ChatLimiter::new())
        }
        self.chat_limiters.read().get(&chat_id).unwrap()
    }
}
```

---

## 9. Simulation Layer

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

    ASYNC FUNCTION replay<T, R>(&self, method: &str, params: &T) -> Result<R, TelegramError> {
        key = generate_replay_key(method, params)
        recording = self.storage.find(&key)
            .ok_or(TelegramError::SimulationNoMatch { key })?

        // Generate mock response with fresh message IDs
        mock_response = generate_mock_response(&recording)
        RETURN deserialize_response(mock_response)
    }

    ASYNC FUNCTION replay_updates(&self) -> Result<Vec<Update>, TelegramError> {
        RETURN self.storage.get_updates()
    }

    ASYNC FUNCTION record<T>(&self, method: &str, params: &T, response: &Response) -> Result<(), TelegramError> {
        interaction = RecordedInteraction {
            timestamp: now(),
            method: method.to_string(),
            request: serialize_request(params),
            response: serialize_response(response),
        }

        self.recorder.write().add(interaction)
        Ok(())
    }

    ASYNC FUNCTION record_update(&self, update: &Update) -> Result<(), TelegramError> {
        self.recorder.write().add_update(update.clone())
        Ok(())
    }

    ASYNC FUNCTION save(&self) -> Result<(), TelegramError> {
        IF let SimulationMode::Recording { path } = &*self.mode.read() {
            recordings = self.recorder.read().get_all()
            self.storage.save(path, recordings)?
        }
        Ok(())
    }
}

FUNCTION generate_mock_message_id() -> i64 {
    // Generate incrementing message ID for simulation
    STATIC counter: AtomicI64 = AtomicI64::new(1000000)
    counter.fetch_add(1, Ordering::SeqCst)
}
```

---

## 10. Error Handling

```rust
ENUM TelegramError {
    // Rate limiting
    RateLimited { retry_after: i32 },
    RateLimitTimeout,
    RateLimitClosed,

    // Authentication
    Unauthorized { message: String },

    // Request errors
    BadRequest { description: String },
    Forbidden { description: String },
    ChatNotFound { chat_id: String },
    MessageNotFound { message_id: i64 },

    // Server errors
    ServerError { status: u16, message: String },
    NetworkError { source: Box<dyn Error> },

    // Configuration errors
    UnknownChatRoute { name: String },
    PollingNotConfigured,
    InvalidWebhookSignature,

    // Simulation errors
    SimulationNoMatch { key: String },
    SimulationLoadError { path: PathBuf, source: Box<dyn Error> },
}

IMPL TelegramError {
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            Self::RateLimited { .. } => true,
            Self::ServerError { .. } => true,
            Self::NetworkError { .. } => true,
            _ => false,
        }
    }

    FUNCTION from_api_error(code: Option<i32>, description: Option<String>) -> Self {
        desc = description.unwrap_or_default()
        code = code.unwrap_or(0)

        MATCH code {
            401 => Self::Unauthorized { message: desc },
            403 => Self::Forbidden { description: desc },
            429 => {
                retry_after = parse_retry_after_from_description(&desc).unwrap_or(30)
                Self::RateLimited { retry_after }
            },
            400 => {
                IF desc.contains("chat not found") {
                    Self::ChatNotFound { chat_id: extract_chat_id(&desc) }
                } ELSE IF desc.contains("message") AND desc.contains("not found") {
                    Self::MessageNotFound { message_id: 0 }
                } ELSE {
                    Self::BadRequest { description: desc }
                }
            },
            _ IF code >= 500 => Self::ServerError { status: code as u16, message: desc },
            _ => Self::BadRequest { description: desc },
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-TELEGRAM-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 2 Complete - Proceed to Architecture phase with "Next phase."*
