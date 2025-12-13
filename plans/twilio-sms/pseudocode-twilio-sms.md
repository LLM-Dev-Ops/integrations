# Twilio SMS Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/twilio-sms`

---

## 1. Core Client

### 1.1 TwilioSmsClient Initialization

```pseudocode
CLASS TwilioSmsClient:
    config: TwilioConfig
    auth: TwilioAuthProvider
    transport: HttpTransport
    rate_limiter: RateLimiter
    circuit_breaker: CircuitBreaker
    opt_out_cache: OptOutCache

    FUNCTION new(config: TwilioConfig) -> Result<Self>:
        auth = TwilioAuthProvider::new(config.account_sid, config.auth_token)
        transport = HttpTransport::new(
            base_url = "https://api.twilio.com/2010-04-01",
            timeout = config.timeout
        )
        rate_limiter = RateLimiter::new(config.rate_limit_config)
        circuit_breaker = CircuitBreaker::new(config.circuit_breaker_config)
        opt_out_cache = OptOutCache::new(config.opt_out_cache_ttl)

        RETURN Ok(TwilioSmsClient { config, auth, transport, rate_limiter, circuit_breaker, opt_out_cache })

    FUNCTION messages(&self) -> MessageService:
        RETURN MessageService::new(self)

    FUNCTION webhooks(&self) -> WebhookHandler:
        RETURN WebhookHandler::new(self)
```

### 1.2 Authentication

```pseudocode
CLASS TwilioAuthProvider:
    account_sid: String
    auth_token: SecretString

    FUNCTION apply_auth(request: &mut Request) -> Result<()>:
        credentials = base64_encode(format!("{}:{}", account_sid, auth_token.expose()))
        request.headers.insert("Authorization", format!("Basic {}", credentials))
        RETURN Ok(())

    FUNCTION validate_webhook_signature(url: String, params: Map, signature: String) -> bool:
        // Build string to sign
        sorted_params = params.keys().sorted()
        param_string = sorted_params.map(|k| format!("{}{}", k, params[k])).join("")
        data = url + param_string

        // Compute HMAC-SHA1
        expected = hmac_sha1(auth_token.expose(), data)
        expected_b64 = base64_encode(expected)

        RETURN constant_time_compare(expected_b64, signature)
```

---

## 2. Message Service

### 2.1 Send Message

```pseudocode
CLASS MessageService:
    client: TwilioSmsClient

    FUNCTION send(request: SendMessageRequest) -> Result<Message>:
        // Validate phone numbers
        validate_phone_number(request.to)?
        validate_phone_number(request.from)?

        // Check opt-out status
        IF client.opt_out_cache.is_opted_out(request.to):
            RETURN Err(TwilioSmsError::OptedOut { number: request.to })

        // Check rate limit
        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(TwilioSmsError::RateLimited)

        // Check circuit breaker
        IF client.circuit_breaker.is_open():
            RETURN Err(TwilioSmsError::CircuitOpen)

        // Build form data
        form = {
            "To": request.to,
            "From": request.from,
            "Body": request.body
        }

        IF request.status_callback.is_some():
            form["StatusCallback"] = request.status_callback

        IF request.media_url.is_some():
            form["MediaUrl"] = request.media_url

        IF request.schedule_at.is_some():
            form["ScheduleType"] = "fixed"
            form["SendAt"] = request.schedule_at.to_iso8601()

        IF request.validity_period.is_some():
            form["ValidityPeriod"] = request.validity_period.as_secs().to_string()

        // Execute request with retry
        response = execute_with_retry(|| {
            url = format!("{}/Accounts/{}/Messages.json",
                client.transport.base_url,
                client.config.account_sid)

            req = client.transport.post(url)
            client.auth.apply_auth(&mut req)?
            req.form(form.clone())
            req.send().await
        }).await

        MATCH response.status:
            201 =>
                client.circuit_breaker.record_success()
                message = parse_message_response(response)
                emit_metric("twilio_messages_sent_total", { status: "success" })
                RETURN Ok(message)
            429 =>
                client.circuit_breaker.record_failure()
                RETURN Err(TwilioSmsError::RateLimited)
            _ =>
                client.circuit_breaker.record_failure()
                RETURN Err(parse_twilio_error(response))

    FUNCTION send_bulk(requests: Vec<SendMessageRequest>) -> Result<BulkSendResult>:
        results = []

        FOR request IN requests:
            // Respect rate limits between sends
            client.rate_limiter.acquire().await

            result = self.send(request).await
            results.push(SendResult {
                to: request.to,
                result: result
            })

        success_count = results.filter(|r| r.result.is_ok()).count()
        failure_count = results.len() - success_count

        RETURN Ok(BulkSendResult {
            results: results,
            success_count: success_count,
            failure_count: failure_count
        })
```

### 2.2 Message Lookup

```pseudocode
    FUNCTION get(message_sid: String) -> Result<Message>:
        url = format!("{}/Accounts/{}/Messages/{}.json",
            client.transport.base_url,
            client.config.account_sid,
            message_sid)

        response = execute_with_retry(|| {
            req = client.transport.get(url)
            client.auth.apply_auth(&mut req)?
            req.send().await
        }).await

        MATCH response.status:
            200 => RETURN Ok(parse_message_response(response))
            404 => RETURN Err(TwilioSmsError::MessageNotFound { sid: message_sid })
            _ => RETURN Err(parse_twilio_error(response))

    FUNCTION list(filter: MessageFilter) -> Result<MessageList>:
        url = format!("{}/Accounts/{}/Messages.json",
            client.transport.base_url,
            client.config.account_sid)

        params = []
        IF filter.to.is_some():
            params.push(("To", filter.to))
        IF filter.from.is_some():
            params.push(("From", filter.from))
        IF filter.date_sent.is_some():
            params.push(("DateSent", filter.date_sent.to_string()))
        IF filter.page_size.is_some():
            params.push(("PageSize", filter.page_size.to_string()))

        response = execute_with_retry(|| {
            req = client.transport.get(url).query(params.clone())
            client.auth.apply_auth(&mut req)?
            req.send().await
        }).await

        RETURN parse_message_list(response)

    FUNCTION cancel(message_sid: String) -> Result<Message>:
        url = format!("{}/Accounts/{}/Messages/{}.json",
            client.transport.base_url,
            client.config.account_sid,
            message_sid)

        form = { "Status": "canceled" }

        response = execute_with_retry(|| {
            req = client.transport.post(url).form(form.clone())
            client.auth.apply_auth(&mut req)?
            req.send().await
        }).await

        MATCH response.status:
            200 => RETURN Ok(parse_message_response(response))
            _ => RETURN Err(parse_twilio_error(response))
```

---

## 3. Webhook Handler

### 3.1 Inbound Message Handling

```pseudocode
CLASS WebhookHandler:
    client: TwilioSmsClient
    handlers: Map<String, InboundHandler>

    FUNCTION handle_inbound(request: WebhookRequest) -> Result<WebhookResponse>:
        // Validate signature
        IF NOT validate_signature(request):
            RETURN Err(TwilioSmsError::InvalidSignature)

        // Parse webhook payload
        payload = parse_inbound_payload(request.body)?

        // Check for opt-out keywords
        IF is_opt_out_keyword(payload.body):
            client.opt_out_cache.add_opt_out(payload.from)
            emit_event(OptOutEvent { number: payload.from })
            RETURN Ok(WebhookResponse::empty())

        // Check for opt-in keywords
        IF is_opt_in_keyword(payload.body):
            client.opt_out_cache.remove_opt_out(payload.from)
            emit_event(OptInEvent { number: payload.from })
            RETURN Ok(WebhookResponse::empty())

        // Create inbound message object
        message = InboundMessage {
            sid: payload.message_sid,
            from: payload.from,
            to: payload.to,
            body: payload.body,
            num_media: payload.num_media,
            media_urls: extract_media_urls(payload),
            timestamp: now()
        }

        // Dispatch to registered handlers
        FOR (pattern, handler) IN handlers:
            IF matches_pattern(message.to, pattern):
                response = handler.handle(message).await?
                IF response.is_some():
                    RETURN Ok(response)

        // Default: acknowledge receipt
        emit_metric("twilio_messages_received_total", { to_number: redact(payload.to) })
        RETURN Ok(WebhookResponse::empty())

    FUNCTION is_opt_out_keyword(body: String) -> bool:
        normalized = body.trim().to_uppercase()
        RETURN normalized IN ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]

    FUNCTION is_opt_in_keyword(body: String) -> bool:
        normalized = body.trim().to_uppercase()
        RETURN normalized IN ["START", "YES", "UNSTOP", "SUBSCRIBE"]
```

### 3.2 Status Callback Handling

```pseudocode
    FUNCTION handle_status_callback(request: WebhookRequest) -> Result<WebhookResponse>:
        // Validate signature
        IF NOT validate_signature(request):
            RETURN Err(TwilioSmsError::InvalidSignature)

        // Parse status payload
        payload = parse_status_payload(request.body)?

        // Create status update object
        status_update = StatusUpdate {
            message_sid: payload.message_sid,
            status: parse_message_status(payload.message_status),
            error_code: payload.error_code,
            error_message: payload.error_message,
            timestamp: now()
        }

        // Emit event for status tracking
        emit_event(MessageStatusEvent {
            message_sid: status_update.message_sid,
            status: status_update.status,
            is_terminal: status_update.status.is_terminal()
        })

        // Update metrics
        emit_metric("twilio_delivery_status_total", { status: status_update.status.to_string() })

        // Notify registered listeners
        notify_status_listeners(status_update)

        RETURN Ok(WebhookResponse::empty())

    FUNCTION validate_signature(request: WebhookRequest) -> bool:
        signature = request.headers.get("X-Twilio-Signature")
        IF signature.is_none():
            RETURN false

        url = request.full_url()
        params = request.form_params()

        RETURN client.auth.validate_webhook_signature(url, params, signature)
```

---

## 4. Rate Limiter

```pseudocode
CLASS RateLimiter:
    config: RateLimitConfig
    tokens: AtomicF64
    last_refill: AtomicInstant
    per_number_limiters: Map<String, TokenBucket>

    FUNCTION new(config: RateLimitConfig) -> Self:
        RETURN RateLimiter {
            config: config,
            tokens: AtomicF64::new(config.burst_size),
            last_refill: AtomicInstant::new(now()),
            per_number_limiters: Map::new()
        }

    FUNCTION try_acquire() -> bool:
        refill_tokens()

        current = tokens.load()
        IF current >= 1.0:
            tokens.fetch_sub(1.0)
            RETURN true
        RETURN false

    FUNCTION acquire() -> Future<()>:
        WHILE NOT try_acquire():
            // Calculate wait time
            wait_time = Duration::from_secs_f64(1.0 / config.rate_per_second)
            sleep(wait_time).await

    FUNCTION try_acquire_for_number(number: String) -> bool:
        // Global rate limit
        IF NOT try_acquire():
            RETURN false

        // Per-number rate limit
        IF NOT per_number_limiters.contains(number):
            per_number_limiters.insert(number, TokenBucket::new(config.per_number_rate))

        RETURN per_number_limiters[number].try_acquire()

    FUNCTION refill_tokens():
        now = Instant::now()
        elapsed = now.duration_since(last_refill.load())

        tokens_to_add = elapsed.as_secs_f64() * config.rate_per_second
        new_tokens = min(tokens.load() + tokens_to_add, config.burst_size)

        tokens.store(new_tokens)
        last_refill.store(now)
```

---

## 5. Opt-Out Cache

```pseudocode
CLASS OptOutCache:
    cache: LruCache<String, OptOutEntry>
    ttl: Duration

    FUNCTION new(ttl: Duration) -> Self:
        RETURN OptOutCache {
            cache: LruCache::new(10000),
            ttl: ttl
        }

    FUNCTION is_opted_out(number: String) -> bool:
        normalized = normalize_phone_number(number)

        IF cache.contains(normalized):
            entry = cache.get(normalized)
            IF entry.expires_at > now():
                RETURN entry.opted_out
            ELSE:
                cache.remove(normalized)

        // Cache miss - could query Twilio or external store
        RETURN false

    FUNCTION add_opt_out(number: String):
        normalized = normalize_phone_number(number)
        cache.insert(normalized, OptOutEntry {
            opted_out: true,
            expires_at: now() + ttl
        })

    FUNCTION remove_opt_out(number: String):
        normalized = normalize_phone_number(number)
        cache.insert(normalized, OptOutEntry {
            opted_out: false,
            expires_at: now() + ttl
        })

    FUNCTION check_with_refresh(number: String) -> Result<bool>:
        normalized = normalize_phone_number(number)

        // Check cache first
        IF cache.contains(normalized) AND cache.get(normalized).expires_at > now():
            RETURN Ok(cache.get(normalized).opted_out)

        // Query Twilio for opt-out status (if available via API)
        // For now, return cached or false
        RETURN Ok(false)
```

---

## 6. Template Rendering

```pseudocode
CLASS TemplateEngine:
    templates: Map<String, MessageTemplate>

    FUNCTION register(name: String, template: String) -> Result<()>:
        parsed = parse_template(template)?
        templates.insert(name, parsed)
        RETURN Ok(())

    FUNCTION render(name: String, variables: Map<String, String>) -> Result<String>:
        template = templates.get(name)
        IF template.is_none():
            RETURN Err(TemplateError::NotFound { name })

        result = template.content.clone()

        FOR (key, value) IN variables:
            placeholder = format!("{{{{{}}}}}", key)  // {{key}}
            result = result.replace(placeholder, value)

        // Check for unresolved placeholders
        IF contains_placeholder(result):
            missing = extract_placeholders(result)
            RETURN Err(TemplateError::MissingVariables { missing })

        // Validate length
        IF result.len() > 1600:
            RETURN Err(TemplateError::MessageTooLong { length: result.len() })

        RETURN Ok(result)

FUNCTION parse_template(template: String) -> Result<MessageTemplate>:
    placeholders = extract_placeholders(template)
    RETURN Ok(MessageTemplate {
        content: template,
        placeholders: placeholders
    })
```

---

## 7. Simulation Layer

```pseudocode
CLASS MockTwilioClient:
    sent_messages: Vec<SendMessageRequest>
    inbound_messages: Vec<InboundMessage>
    status_updates: Vec<StatusUpdate>
    simulated_responses: Map<String, Message>
    should_fail: Option<TwilioSmsError>

    FUNCTION expect_send(to: String) -> Self:
        expected_sends.push(to)
        RETURN self

    FUNCTION with_response(to: String, message: Message) -> Self:
        simulated_responses.insert(to, message)
        RETURN self

    FUNCTION simulate_failure(error: TwilioSmsError) -> Self:
        should_fail = Some(error)
        RETURN self

    FUNCTION simulate_inbound(message: InboundMessage):
        inbound_messages.push(message)

    FUNCTION verify() -> Result<()>:
        FOR expected IN expected_sends:
            IF NOT sent_messages.any(|m| m.to == expected):
                RETURN Err(VerificationError::ExpectedSendNotFound { to: expected })
        RETURN Ok(())

CLASS MockMessageService:
    mock: MockTwilioClient

    FUNCTION send(request: SendMessageRequest) -> Result<Message>:
        IF mock.should_fail.is_some():
            RETURN Err(mock.should_fail.clone())

        mock.sent_messages.push(request.clone())

        IF mock.simulated_responses.contains(request.to):
            RETURN Ok(mock.simulated_responses[request.to].clone())

        // Generate mock response
        RETURN Ok(Message {
            sid: generate_mock_sid(),
            to: request.to,
            from: request.from,
            body: request.body,
            status: MessageStatus::Queued,
            date_created: now(),
            ..Default::default()
        })
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode phase |

---

**Next Phase:** Architecture - Module structure, data flow diagrams, webhook processing flows, and rate limiting design.
