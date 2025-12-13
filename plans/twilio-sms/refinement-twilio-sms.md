# Twilio SMS Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/twilio-sms`

---

## 1. Edge Cases and Boundary Conditions

### 1.1 Phone Number Validation

| Edge Case | Handling | Test Scenario |
|-----------|----------|---------------|
| Missing country code | Attempt E.164 normalization with default country | `5551234567` → `+15551234567` |
| Invalid format | Return `InvalidPhoneNumber` error | `abc123` |
| Too short | Return `InvalidPhoneNumber` error | `+1555` |
| Too long | Return `InvalidPhoneNumber` error | `+155512345678901234` |
| Non-numeric characters | Strip and validate | `+1 (555) 123-4567` → `+15551234567` |
| Emergency numbers | Block with `ProhibitedNumber` error | `911`, `112` |
| Premium rate numbers | Configurable blocking | `+1900...` |
| Short codes | Allow if configured | `12345` |

```rust
fn validate_phone_number(number: &str, config: &ValidationConfig) -> Result<E164Number> {
    let normalized = normalize_phone_number(number)?;

    if normalized.len() < MIN_E164_LENGTH {
        return Err(TwilioSmsError::InvalidPhoneNumber {
            number: redact(&normalized),
            reason: "Too short".into(),
        });
    }

    if normalized.len() > MAX_E164_LENGTH {
        return Err(TwilioSmsError::InvalidPhoneNumber {
            number: redact(&normalized),
            reason: "Too long".into(),
        });
    }

    if is_emergency_number(&normalized) {
        return Err(TwilioSmsError::ProhibitedNumber {
            number: redact(&normalized),
            reason: "Emergency numbers not allowed".into(),
        });
    }

    if config.block_premium_rate && is_premium_rate(&normalized) {
        return Err(TwilioSmsError::ProhibitedNumber {
            number: redact(&normalized),
            reason: "Premium rate numbers blocked".into(),
        });
    }

    Ok(E164Number(normalized))
}
```

### 1.2 Message Body Handling

| Edge Case | Handling | Limit |
|-----------|----------|-------|
| Empty body | Return error (unless MMS with media) | N/A |
| SMS segment limit | Allow up to 10 segments | 1600 chars |
| Unicode characters | Proper GSM-7 vs UCS-2 detection | 70 chars/segment UCS-2 |
| Null bytes | Strip from message | N/A |
| Control characters | Strip except newlines | N/A |
| Trailing whitespace | Preserve (intentional) | N/A |
| Leading whitespace | Preserve (intentional) | N/A |

```rust
fn validate_message_body(body: &str, has_media: bool) -> Result<ValidatedBody> {
    if body.is_empty() && !has_media {
        return Err(TwilioSmsError::EmptyMessageBody);
    }

    let cleaned = body
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\r')
        .filter(|c| *c != '\0')
        .collect::<String>();

    let encoding = detect_encoding(&cleaned);
    let segment_count = calculate_segments(&cleaned, encoding);

    if segment_count > MAX_SEGMENTS {
        return Err(TwilioSmsError::MessageTooLong {
            length: cleaned.len(),
            segments: segment_count,
            max_segments: MAX_SEGMENTS,
        });
    }

    Ok(ValidatedBody {
        content: cleaned,
        encoding,
        segment_count,
    })
}

fn detect_encoding(text: &str) -> Encoding {
    if text.chars().all(|c| is_gsm7_char(c)) {
        Encoding::Gsm7
    } else {
        Encoding::Ucs2
    }
}

fn calculate_segments(text: &str, encoding: Encoding) -> usize {
    let char_count = text.chars().count();
    match encoding {
        Encoding::Gsm7 => {
            if char_count <= 160 { 1 }
            else { (char_count + 152) / 153 }  // 153 chars per segment with UDH
        }
        Encoding::Ucs2 => {
            if char_count <= 70 { 1 }
            else { (char_count + 66) / 67 }  // 67 chars per segment with UDH
        }
    }
}
```

### 1.3 Scheduling Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Schedule in past | Return `InvalidScheduleTime` error |
| Schedule too far future | Return error (Twilio limit: 7 days) |
| Invalid timezone | Normalize to UTC |
| DST transitions | Use UTC internally |
| Schedule at exact limit | Accept (7 days - 1 second) |

```rust
fn validate_schedule_time(schedule_at: DateTime<Utc>) -> Result<DateTime<Utc>> {
    let now = Utc::now();
    let min_schedule = now + Duration::minutes(15);  // Twilio minimum
    let max_schedule = now + Duration::days(7);

    if schedule_at < min_schedule {
        return Err(TwilioSmsError::InvalidScheduleTime {
            requested: schedule_at,
            reason: "Must be at least 15 minutes in the future".into(),
        });
    }

    if schedule_at > max_schedule {
        return Err(TwilioSmsError::InvalidScheduleTime {
            requested: schedule_at,
            reason: "Cannot schedule more than 7 days in advance".into(),
        });
    }

    Ok(schedule_at)
}
```

---

## 2. Error Recovery Procedures

### 2.1 Retry Strategy Matrix

| Error Type | Retry | Strategy | Max Attempts | Notes |
|------------|-------|----------|--------------|-------|
| `RateLimitError` (429) | Yes | Exponential + jitter | 5 | Respect Retry-After header |
| `ServiceUnavailable` (503) | Yes | Exponential | 3 | Wait 2-8 seconds |
| `InternalError` (500) | Yes | Exponential | 3 | Wait 1-4 seconds |
| `Timeout` | Yes | Fixed delay | 3 | 1 second delay |
| `ConnectionFailed` | Yes | Exponential | 3 | 500ms base |
| `InvalidCredentials` | No | - | - | Fail fast |
| `InvalidRecipient` | No | - | - | Fail fast |
| `OptedOut` | No | - | - | Fail fast |
| `MessageTooLong` | No | - | - | Fail fast |
| `InsufficientFunds` | No | - | - | Fail fast, alert |

```rust
impl RetryPolicy for TwilioRetryPolicy {
    fn should_retry(&self, error: &TwilioSmsError, attempt: u32) -> RetryDecision {
        if attempt >= self.max_attempts {
            return RetryDecision::DoNotRetry;
        }

        match error {
            TwilioSmsError::RateLimited { retry_after } => {
                let delay = retry_after
                    .unwrap_or_else(|| self.calculate_backoff(attempt));
                RetryDecision::RetryAfter(delay)
            }
            TwilioSmsError::ServiceUnavailable => {
                let delay = self.calculate_backoff_with_jitter(attempt, 2000);
                RetryDecision::RetryAfter(delay)
            }
            TwilioSmsError::InternalError { .. } => {
                let delay = self.calculate_backoff_with_jitter(attempt, 1000);
                RetryDecision::RetryAfter(delay)
            }
            TwilioSmsError::Timeout => {
                RetryDecision::RetryAfter(Duration::from_secs(1))
            }
            TwilioSmsError::ConnectionFailed { .. } => {
                let delay = self.calculate_backoff_with_jitter(attempt, 500);
                RetryDecision::RetryAfter(delay)
            }
            // Non-retryable errors
            _ => RetryDecision::DoNotRetry,
        }
    }

    fn calculate_backoff_with_jitter(&self, attempt: u32, base_ms: u64) -> Duration {
        let base = base_ms * 2u64.pow(attempt);
        let jitter = rand::thread_rng().gen_range(0..base / 4);
        Duration::from_millis(base + jitter)
    }
}
```

### 2.2 Circuit Breaker Recovery

```rust
impl CircuitBreaker {
    fn on_success(&self) {
        match self.state.load() {
            State::Closed => {
                self.consecutive_failures.store(0);
            }
            State::HalfOpen => {
                self.consecutive_successes.fetch_add(1);
                if self.consecutive_successes.load() >= self.config.success_threshold {
                    self.transition_to(State::Closed);
                    emit_event(CircuitBreakerEvent::Closed);
                }
            }
            State::Open => {
                // Should not happen - open circuit blocks requests
            }
        }
    }

    fn on_failure(&self, error: &TwilioSmsError) {
        if !error.is_transient() {
            return;  // Only count transient errors
        }

        match self.state.load() {
            State::Closed => {
                let failures = self.consecutive_failures.fetch_add(1) + 1;
                if failures >= self.config.failure_threshold {
                    self.transition_to(State::Open);
                    self.open_until.store(Instant::now() + self.config.reset_timeout);
                    emit_event(CircuitBreakerEvent::Opened { failures });
                }
            }
            State::HalfOpen => {
                self.transition_to(State::Open);
                self.open_until.store(Instant::now() + self.config.reset_timeout);
                emit_event(CircuitBreakerEvent::Reopened);
            }
            State::Open => {
                // Already open, extend timeout
                self.open_until.store(Instant::now() + self.config.reset_timeout);
            }
        }
    }

    fn attempt_reset(&self) -> bool {
        if self.state.load() != State::Open {
            return true;
        }

        if Instant::now() >= self.open_until.load() {
            self.transition_to(State::HalfOpen);
            self.consecutive_successes.store(0);
            emit_event(CircuitBreakerEvent::HalfOpen);
            return true;
        }

        false
    }
}
```

### 2.3 Partial Failure Handling (Bulk Send)

```rust
async fn send_bulk(
    &self,
    requests: Vec<SendMessageRequest>,
) -> Result<BulkSendResult> {
    let mut results = Vec::with_capacity(requests.len());
    let mut should_abort = false;

    for request in requests {
        if should_abort {
            results.push(SendResult {
                to: request.to.clone(),
                result: Err(TwilioSmsError::BulkSendAborted),
            });
            continue;
        }

        // Respect rate limits between sends
        self.client.rate_limiter.acquire().await;

        let result = self.send(request.clone()).await;

        // Check for abort conditions
        if let Err(ref e) = result {
            match e {
                TwilioSmsError::InvalidCredentials { .. } |
                TwilioSmsError::AccountSuspended |
                TwilioSmsError::InsufficientFunds => {
                    // Fatal errors - abort remaining sends
                    should_abort = true;
                    emit_event(BulkSendAbortedEvent {
                        completed: results.len(),
                        remaining: requests.len() - results.len() - 1,
                        reason: e.to_string(),
                    });
                }
                TwilioSmsError::CircuitOpen => {
                    // Circuit open - abort to protect system
                    should_abort = true;
                }
                _ => {
                    // Non-fatal - continue with next message
                }
            }
        }

        results.push(SendResult {
            to: request.to,
            result,
        });
    }

    let success_count = results.iter().filter(|r| r.result.is_ok()).count();
    let failure_count = results.len() - success_count;

    Ok(BulkSendResult {
        results,
        success_count,
        failure_count,
        aborted: should_abort,
    })
}
```

---

## 3. Webhook Edge Cases

### 3.1 Signature Validation Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Missing signature header | Reject with 401 |
| Empty signature | Reject with 401 |
| Malformed base64 | Reject with 401 |
| URL mismatch (proxy/LB) | Support configurable URL override |
| Body encoding issues | Normalize to UTF-8 |
| Duplicate parameters | Use first occurrence |
| URL with query params | Include in signature calculation |
| Trailing slash difference | Normalize URL before validation |

```rust
fn validate_webhook_signature(
    request: &WebhookRequest,
    config: &WebhookConfig,
) -> Result<()> {
    let signature = request
        .headers
        .get("X-Twilio-Signature")
        .ok_or(TwilioSmsError::MissingSignature)?;

    if signature.is_empty() {
        return Err(TwilioSmsError::InvalidSignature {
            reason: "Empty signature header".into(),
        });
    }

    // Use configured URL override or request URL
    let url = config.url_override
        .as_ref()
        .unwrap_or(&request.full_url);

    // Normalize URL
    let normalized_url = normalize_webhook_url(url);

    // Build data string
    let mut params: Vec<_> = request.form_params.iter().collect();
    params.sort_by_key(|(k, _)| *k);

    let param_string: String = params
        .iter()
        .map(|(k, v)| format!("{}{}", k, v))
        .collect();

    let data = format!("{}{}", normalized_url, param_string);

    // Compute expected signature
    let expected = compute_hmac_sha1(&config.auth_token, &data);
    let expected_b64 = base64::encode(&expected);

    // Constant-time comparison
    if !constant_time_eq(expected_b64.as_bytes(), signature.as_bytes()) {
        return Err(TwilioSmsError::InvalidSignature {
            reason: "Signature mismatch".into(),
        });
    }

    Ok(())
}

fn normalize_webhook_url(url: &str) -> String {
    let mut url = url.to_string();

    // Remove trailing slash for consistency
    if url.ends_with('/') {
        url.pop();
    }

    // Ensure HTTPS
    if url.starts_with("http://") {
        url = url.replace("http://", "https://");
    }

    url
}
```

### 3.2 Opt-Out Keyword Detection

```rust
const OPT_OUT_KEYWORDS: &[&str] = &[
    "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT",
    // International variations
    "ARRET", "ARRETER",  // French
    "PARAR", "CANCELAR",  // Spanish/Portuguese
];

const OPT_IN_KEYWORDS: &[&str] = &[
    "START", "YES", "UNSTOP", "SUBSCRIBE",
    // International variations
    "COMMENCER", "OUI",  // French
    "SI", "INICIAR",  // Spanish
];

fn detect_opt_keyword(body: &str) -> OptKeywordResult {
    let normalized = body.trim().to_uppercase();

    // Check for exact match first
    if OPT_OUT_KEYWORDS.contains(&normalized.as_str()) {
        return OptKeywordResult::OptOut;
    }

    if OPT_IN_KEYWORDS.contains(&normalized.as_str()) {
        return OptKeywordResult::OptIn;
    }

    // Check for keyword at start of message (with optional punctuation)
    let first_word = normalized
        .split_whitespace()
        .next()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .unwrap_or("");

    if OPT_OUT_KEYWORDS.contains(&first_word) {
        return OptKeywordResult::OptOut;
    }

    if OPT_IN_KEYWORDS.contains(&first_word) {
        return OptKeywordResult::OptIn;
    }

    OptKeywordResult::None
}
```

### 3.3 Webhook Timeout Handling

```rust
async fn handle_webhook_with_timeout(
    request: WebhookRequest,
    handler: &WebhookHandler,
) -> WebhookResponse {
    // Twilio expects response within 15 seconds
    const WEBHOOK_TIMEOUT: Duration = Duration::from_secs(14);

    match timeout(WEBHOOK_TIMEOUT, handler.process(request)).await {
        Ok(Ok(response)) => response,
        Ok(Err(e)) => {
            error!("Webhook processing error: {}", e);
            // Return empty TwiML to acknowledge receipt
            WebhookResponse::empty()
        }
        Err(_) => {
            warn!("Webhook processing timeout");
            emit_metric("twilio_webhook_timeouts_total", 1);
            // Return empty response to prevent Twilio retry
            WebhookResponse::empty()
        }
    }
}
```

---

## 4. Performance Optimizations

### 4.1 Connection Pooling

```rust
fn create_http_client(config: &TwilioConfig) -> reqwest::Client {
    reqwest::Client::builder()
        // Connection pool settings
        .pool_max_idle_per_host(config.pool_max_idle.unwrap_or(10))
        .pool_idle_timeout(config.pool_idle_timeout.unwrap_or(Duration::from_secs(90)))

        // Timeouts
        .connect_timeout(config.connect_timeout.unwrap_or(Duration::from_secs(10)))
        .timeout(config.request_timeout.unwrap_or(Duration::from_secs(30)))

        // Keep-alive
        .tcp_keepalive(Duration::from_secs(60))
        .http2_keep_alive_interval(Duration::from_secs(30))
        .http2_keep_alive_timeout(Duration::from_secs(10))

        // TLS
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .https_only(true)

        // Compression
        .gzip(true)

        .build()
        .expect("Failed to create HTTP client")
}
```

### 4.2 Opt-Out Cache Optimization

```rust
impl OptOutCache {
    // Use sharded locks for reduced contention
    fn new(config: OptOutCacheConfig) -> Self {
        let shard_count = config.shard_count.unwrap_or(16);
        let shards: Vec<_> = (0..shard_count)
            .map(|_| RwLock::new(LruCache::new(config.capacity / shard_count)))
            .collect();

        Self {
            shards,
            ttl: config.ttl,
            hasher: DefaultHasher::new(),
        }
    }

    fn get_shard(&self, number: &str) -> usize {
        let mut hasher = self.hasher.clone();
        number.hash(&mut hasher);
        (hasher.finish() as usize) % self.shards.len()
    }

    fn is_opted_out(&self, number: &str) -> bool {
        let normalized = normalize_phone_number(number);
        let shard_idx = self.get_shard(&normalized);

        let shard = self.shards[shard_idx].read();
        if let Some(entry) = shard.peek(&normalized) {
            if entry.expires_at > Instant::now() {
                return entry.opted_out;
            }
        }

        false
    }

    fn add_opt_out(&self, number: &str) {
        let normalized = normalize_phone_number(number);
        let shard_idx = self.get_shard(&normalized);

        let mut shard = self.shards[shard_idx].write();
        shard.put(normalized, OptOutEntry {
            opted_out: true,
            expires_at: Instant::now() + self.ttl,
        });
    }
}
```

### 4.3 Batch Send Optimization

```rust
async fn send_bulk_optimized(
    &self,
    requests: Vec<SendMessageRequest>,
    options: BulkSendOptions,
) -> Result<BulkSendResult> {
    let concurrency = options.concurrency.unwrap_or(10);
    let semaphore = Arc::new(Semaphore::new(concurrency));

    // Pre-validate all requests
    let validated: Vec<_> = requests
        .into_iter()
        .map(|r| self.validate_request(&r).map(|_| r))
        .collect();

    // Filter out validation failures
    let (valid, invalid): (Vec<_>, Vec<_>) = validated
        .into_iter()
        .partition(Result::is_ok);

    let mut results: Vec<SendResult> = invalid
        .into_iter()
        .map(|r| SendResult {
            to: "unknown".into(),
            result: r.map(|_| unreachable!()),
        })
        .collect();

    // Send valid requests with controlled concurrency
    let send_futures: Vec<_> = valid
        .into_iter()
        .filter_map(Result::ok)
        .map(|request| {
            let permit = semaphore.clone().acquire_owned();
            let client = self.clone();

            async move {
                let _permit = permit.await;

                // Rate limit check
                client.rate_limiter.acquire().await;

                let to = request.to.clone();
                let result = client.send_single(request).await;

                SendResult { to, result }
            }
        })
        .collect();

    // Execute with stream for backpressure
    let mut stream = futures::stream::iter(send_futures)
        .buffer_unordered(concurrency);

    while let Some(result) = stream.next().await {
        results.push(result);
    }

    // Sort results to match input order (if needed)
    let success_count = results.iter().filter(|r| r.result.is_ok()).count();

    Ok(BulkSendResult {
        results,
        success_count,
        failure_count: results.len() - success_count,
        aborted: false,
    })
}
```

---

## 5. Security Hardening

### 5.1 Rate Limit Protection Against Enumeration

```rust
impl RateLimiter {
    // Prevent phone number enumeration via timing attacks
    fn try_acquire_with_constant_time(&self, number: &str) -> bool {
        let start = Instant::now();

        let result = self.try_acquire_internal(number);

        // Ensure constant-time response
        let elapsed = start.elapsed();
        let min_duration = Duration::from_micros(100);
        if elapsed < min_duration {
            std::thread::sleep(min_duration - elapsed);
        }

        result
    }
}
```

### 5.2 Input Sanitization

```rust
fn sanitize_webhook_input(params: &mut HashMap<String, String>) {
    for (_, value) in params.iter_mut() {
        // Remove null bytes
        *value = value.replace('\0', "");

        // Limit field length
        if value.len() > MAX_FIELD_LENGTH {
            value.truncate(MAX_FIELD_LENGTH);
        }

        // Remove control characters (except newlines in Body)
        *value = value
            .chars()
            .filter(|c| !c.is_control() || *c == '\n' || *c == '\r')
            .collect();
    }
}
```

### 5.3 Credential Rotation Support

```rust
impl TwilioAuthProvider {
    fn with_credential_refresh(
        account_sid: String,
        auth_token: SecretString,
        refresh_fn: impl Fn() -> Result<SecretString> + Send + Sync + 'static,
    ) -> Self {
        let refresh_fn = Arc::new(refresh_fn);
        let current_token = Arc::new(RwLock::new(auth_token));

        // Background refresh task
        let token_clone = current_token.clone();
        let refresh_clone = refresh_fn.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(3600));
            loop {
                interval.tick().await;
                match refresh_clone() {
                    Ok(new_token) => {
                        *token_clone.write() = new_token;
                        info!("Twilio auth token refreshed");
                    }
                    Err(e) => {
                        error!("Failed to refresh Twilio auth token: {}", e);
                    }
                }
            }
        });

        Self {
            account_sid,
            auth_token: current_token,
        }
    }
}
```

---

## 6. Observability Enhancements

### 6.1 Structured Logging

```rust
fn log_send_attempt(request: &SendMessageRequest, attempt: u32) {
    info!(
        target: "twilio_sms",
        to = %redact_phone(&request.to),
        from = %redact_phone(&request.from),
        body_length = request.body.len(),
        has_media = request.media_url.is_some(),
        scheduled = request.schedule_at.is_some(),
        attempt = attempt,
        "Sending SMS"
    );
}

fn log_send_result(
    request: &SendMessageRequest,
    result: &Result<Message>,
    duration: Duration,
) {
    match result {
        Ok(message) => {
            info!(
                target: "twilio_sms",
                message_sid = %message.sid,
                to = %redact_phone(&request.to),
                status = %message.status,
                segments = message.num_segments,
                duration_ms = duration.as_millis() as u64,
                "SMS sent successfully"
            );
        }
        Err(e) => {
            error!(
                target: "twilio_sms",
                to = %redact_phone(&request.to),
                error = %e,
                error_type = %error_type_name(e),
                retryable = e.is_retryable(),
                duration_ms = duration.as_millis() as u64,
                "SMS send failed"
            );
        }
    }
}
```

### 6.2 Metric Cardinality Control

```rust
// Avoid high-cardinality labels
fn record_send_metric(result: &Result<Message>, from: &str) {
    let status = match result {
        Ok(_) => "success",
        Err(TwilioSmsError::RateLimited { .. }) => "rate_limited",
        Err(TwilioSmsError::OptedOut { .. }) => "opted_out",
        Err(TwilioSmsError::InvalidRecipient { .. }) => "invalid_recipient",
        Err(_) => "error",
    };

    // Use from number prefix instead of full number
    let from_prefix = extract_prefix(from);  // e.g., "+1555" from "+15551234567"

    counter!("twilio_messages_sent_total", 1,
        "status" => status,
        "from_prefix" => from_prefix,
    );
}
```

### 6.3 Health Check Endpoint

```rust
impl TwilioSmsClient {
    async fn health_check(&self) -> HealthStatus {
        let mut checks = Vec::new();

        // Check circuit breaker state
        let circuit_state = self.circuit_breaker.state();
        checks.push(HealthCheck {
            name: "circuit_breaker".into(),
            status: match circuit_state {
                State::Closed => CheckStatus::Healthy,
                State::HalfOpen => CheckStatus::Degraded,
                State::Open => CheckStatus::Unhealthy,
            },
            details: Some(format!("state: {:?}", circuit_state)),
        });

        // Check rate limiter
        let rate_limit_tokens = self.rate_limiter.available_tokens();
        checks.push(HealthCheck {
            name: "rate_limiter".into(),
            status: if rate_limit_tokens > 0.0 {
                CheckStatus::Healthy
            } else {
                CheckStatus::Degraded
            },
            details: Some(format!("tokens: {:.1}", rate_limit_tokens)),
        });

        // Optional: Ping Twilio API
        if self.config.health_check_ping {
            match self.ping_api().await {
                Ok(latency) => {
                    checks.push(HealthCheck {
                        name: "api_connectivity".into(),
                        status: if latency < Duration::from_secs(1) {
                            CheckStatus::Healthy
                        } else {
                            CheckStatus::Degraded
                        },
                        details: Some(format!("latency: {}ms", latency.as_millis())),
                    });
                }
                Err(e) => {
                    checks.push(HealthCheck {
                        name: "api_connectivity".into(),
                        status: CheckStatus::Unhealthy,
                        details: Some(format!("error: {}", e)),
                    });
                }
            }
        }

        HealthStatus::from_checks(checks)
    }
}
```

---

## 7. Template Engine Refinements

### 7.1 Template Validation

```rust
impl TemplateEngine {
    fn register(&mut self, name: &str, template: &str) -> Result<()> {
        // Validate template syntax
        let placeholders = self.extract_placeholders(template)?;

        // Check for balanced braces
        if !self.validate_braces(template) {
            return Err(TemplateError::UnbalancedBraces);
        }

        // Check template length (max possible size)
        if template.len() > MAX_TEMPLATE_LENGTH {
            return Err(TemplateError::TemplateTooLong {
                length: template.len(),
                max: MAX_TEMPLATE_LENGTH,
            });
        }

        // Validate placeholder names
        for placeholder in &placeholders {
            if !self.is_valid_placeholder_name(placeholder) {
                return Err(TemplateError::InvalidPlaceholderName {
                    name: placeholder.clone(),
                });
            }
        }

        self.templates.insert(name.to_string(), MessageTemplate {
            content: template.to_string(),
            placeholders,
        });

        Ok(())
    }

    fn render(&self, name: &str, variables: &HashMap<String, String>) -> Result<String> {
        let template = self.templates.get(name)
            .ok_or(TemplateError::NotFound { name: name.to_string() })?;

        let mut result = template.content.clone();

        // Replace all placeholders
        for placeholder in &template.placeholders {
            let value = variables.get(placeholder)
                .ok_or(TemplateError::MissingVariable {
                    name: placeholder.clone(),
                })?;

            // Sanitize value to prevent injection
            let sanitized = self.sanitize_value(value);

            let pattern = format!("{{{{{}}}}}", placeholder);
            result = result.replace(&pattern, &sanitized);
        }

        // Validate final message length
        if result.len() > MAX_MESSAGE_LENGTH {
            return Err(TemplateError::RenderedTooLong {
                length: result.len(),
                max: MAX_MESSAGE_LENGTH,
            });
        }

        Ok(result)
    }

    fn sanitize_value(&self, value: &str) -> String {
        value
            .chars()
            .filter(|c| !c.is_control() || *c == '\n')
            .take(MAX_VARIABLE_LENGTH)
            .collect()
    }
}
```

---

## 8. Testing Strategy Refinements

### 8.1 Mock Response Patterns

```rust
impl MockTwilioClient {
    // Simulate realistic Twilio behavior
    fn with_realistic_delays(mut self) -> Self {
        self.config.simulate_latency = true;
        self.config.latency_range = Duration::from_millis(50)..Duration::from_millis(200);
        self
    }

    // Simulate intermittent failures
    fn with_failure_rate(mut self, rate: f64) -> Self {
        self.config.failure_rate = rate;
        self
    }

    // Simulate rate limiting after N requests
    fn with_rate_limit_after(mut self, count: usize) -> Self {
        self.config.rate_limit_after = Some(count);
        self
    }

    // Capture requests for verification
    fn capture_requests(&self) -> Vec<CapturedRequest> {
        self.captured_requests.lock().clone()
    }

    // Verify specific interactions
    fn verify(&self) -> Result<()> {
        for expected in &self.expected_sends {
            if !self.captured_requests.lock().iter()
                .any(|r| r.to == *expected)
            {
                return Err(MockError::ExpectedSendNotFound {
                    to: expected.clone(),
                });
            }
        }
        Ok(())
    }
}
```

### 8.2 Property-Based Testing

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn phone_normalization_idempotent(s in "[+]?[0-9]{10,15}") {
            let normalized = normalize_phone_number(&s);
            let double_normalized = normalize_phone_number(&normalized);
            prop_assert_eq!(normalized, double_normalized);
        }

        #[test]
        fn message_segmentation_consistent(body in ".{1,1600}") {
            let encoding = detect_encoding(&body);
            let segments = calculate_segments(&body, encoding);

            // Segments should be positive and bounded
            prop_assert!(segments > 0);
            prop_assert!(segments <= 10);
        }

        #[test]
        fn rate_limiter_never_negative(ops in 0..1000u32) {
            let limiter = RateLimiter::new(RateLimitConfig {
                rate_per_second: 10.0,
                burst_size: 30.0,
            });

            for _ in 0..ops {
                limiter.try_acquire();
            }

            prop_assert!(limiter.available_tokens() >= 0.0);
        }
    }
}
```

---

## 9. Configuration Validation

```rust
impl TwilioConfig {
    fn validate(&self) -> Result<()> {
        // Account SID format: AC followed by 32 hex characters
        if !self.account_sid.starts_with("AC") || self.account_sid.len() != 34 {
            return Err(ConfigError::InvalidAccountSid);
        }

        // Auth token length
        if self.auth_token.expose().len() != 32 {
            return Err(ConfigError::InvalidAuthToken);
        }

        // Rate limit bounds
        if self.rate_limit.rate_per_second <= 0.0 {
            return Err(ConfigError::InvalidRateLimit {
                reason: "Rate must be positive".into(),
            });
        }

        if self.rate_limit.rate_per_second > 100.0 {
            warn!("Rate limit exceeds Twilio recommendations");
        }

        // Timeout bounds
        if self.timeout < Duration::from_secs(1) {
            return Err(ConfigError::InvalidTimeout {
                reason: "Timeout too short".into(),
            });
        }

        if self.timeout > Duration::from_secs(120) {
            return Err(ConfigError::InvalidTimeout {
                reason: "Timeout too long".into(),
            });
        }

        Ok(())
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement phase |

---

**Next Phase:** Completion - Test coverage requirements, implementation checklist, security sign-off, and operational readiness criteria.
