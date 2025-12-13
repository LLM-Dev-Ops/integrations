# Microsoft Teams Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/teams`

---

## 1. Design Review Checklist

### 1.1 API Completeness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Webhook messaging | Covered | send_message, send_card, send_formatted_message |
| Bot proactive messaging | Covered | send_proactive_message, reply |
| Activity processing | Covered | on_message, on_invoke, on_conversation_update |
| Graph API integration | Covered | teams, channels, chats, messages |
| Adaptive Cards | Covered | CardBuilder fluent API, validation |
| Message routing | Covered | Rule-based, multi-destination |
| Simulation/replay | Covered | MockTeamsClient, replay support |

### 1.2 Thin Adapter Validation

| Concern | Delegation Target | Validated |
|---------|-------------------|-----------|
| OAuth2 token acquisition | azure/auth | Yes |
| Bot token management | azure/auth | Yes |
| Retry with backoff | shared/resilience | Yes |
| Circuit breaker | shared/resilience | Yes |
| Rate limiting | shared/resilience | Yes |
| Metrics emission | shared/observability | Yes |
| Distributed tracing | shared/observability | Yes |
| Structured logging | shared/observability | Yes |

### 1.3 Security Review

| Security Concern | Mitigation | Validated |
|------------------|------------|-----------|
| Webhook URL exposure | SecretString, never logged | Yes |
| Bot secret protection | SecretString, zeroization | Yes |
| Access token handling | In-memory only, short TTL | Yes |
| Message content in logs | Redacted in structured logs | Yes |
| HTML injection | Sanitization pipeline | Yes |
| URL validation | HTTPS-only for actions | Yes |
| @mention validation | User ID format validation | Yes |

---

## 2. Edge Case Analysis

### 2.1 Webhook Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Webhook URL expired/revoked | HTTP 400/404 | Return `WebhookConfigurationError`, notify admin |
| Card exceeds 28KB limit | Validation error | Pre-flight validation, return `CardTooLargeError` |
| Webhook rate limited (429) | Retry with Retry-After | Delegate to shared/resilience, honor header |
| Connector disabled by admin | HTTP 403 | Return `PermissionDeniedError`, no retry |
| Invalid card schema | HTTP 400 | Validate locally before send, detailed error |
| Network timeout | Retry then fail | 3 retries with exponential backoff |
| Empty message text | Validation error | Pre-flight check, return `ValidationError` |
| Unicode/emoji handling | Pass through | UTF-8 encoding verified |

```
FUNCTION handle_webhook_error(response: HttpResponse) -> TeamsError:
    MATCH response.status:
        400 =>
            IF body.contains("card"):
                RETURN CardValidationError(body.message)
            ELSE IF body.contains("connector"):
                RETURN WebhookConfigurationError("Connector may be disabled")
            ELSE:
                RETURN ValidationError(body.message)

        403 =>
            RETURN PermissionDeniedError("Webhook access denied - connector may be disabled")

        404 =>
            RETURN WebhookNotFoundError("Webhook URL invalid or expired")

        429 =>
            retry_after = parse_retry_after(response.headers)
            RETURN RateLimitedError(retry_after)

        502, 503 =>
            RETURN TransientError("Teams service temporarily unavailable")

        _ =>
            RETURN UnexpectedError(response.status, body)
```

### 2.2 Bot Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Conversation reference stale | HTTP 404 | Return `ConversationNotFoundError`, clear cache |
| Bot removed from team | HTTP 403 | Return `BotNotInTeamError`, suggest reinstall |
| User blocked bot | HTTP 403 | Return `UserBlockedBotError`, no retry |
| Activity ID not found | HTTP 404 | Return `ActivityNotFoundError` for reply/update |
| Tenant not authorized | HTTP 401 | Return `TenantNotAuthorizedError` |
| Bot token expired during request | HTTP 401 | Refresh token, retry once |
| @mention user not in team | HTTP 400 | Validate members before send |
| Large attachment | HTTP 413 | Pre-validate size, return `AttachmentTooLargeError` |
| Service URL changed | New URL in activity | Update stored conversation references |

```
FUNCTION handle_proactive_message_error(response: HttpResponse, conv_ref: ConversationReference) -> TeamsError:
    MATCH response.status:
        401 =>
            IF is_token_expired(response):
                // Retry will be handled by auth layer
                RETURN TokenExpiredError("Bot token expired")
            ELSE:
                RETURN TenantNotAuthorizedError(conv_ref.tenant_id)

        403 =>
            IF body.contains("blocked"):
                RETURN UserBlockedBotError(conv_ref.user_id)
            ELSE IF body.contains("removed"):
                RETURN BotNotInTeamError(conv_ref.conversation_id)
            ELSE:
                RETURN PermissionDeniedError(body.message)

        404 =>
            // Conversation may have been deleted
            invalidate_conversation_cache(conv_ref.conversation_id)
            RETURN ConversationNotFoundError(conv_ref.conversation_id)

        _ =>
            RETURN forward_to_common_handler(response)
```

### 2.3 Graph Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Team not found | HTTP 404 | Return `TeamNotFoundError` |
| Channel archived | HTTP 403 | Return `ChannelArchivedError` |
| User not in team | HTTP 403 | Return `UserNotInTeamError` |
| Insufficient permissions | HTTP 403 | Return `InsufficientScopesError` with required scopes |
| Throttled by Graph | HTTP 429 | Retry with Retry-After, circuit breaker |
| Team deleted during pagination | 404 on next page | Return partial results with warning |
| Private channel access | HTTP 403 | Check channel membership first |
| Delegated vs app permissions | Different behavior | Document permission model clearly |
| @odata.nextLink pagination | Handle cursors | Support full pagination in list operations |

```
FUNCTION list_channels_with_resilience(team_id: String, options: ListOptions) -> Result<Vec<Channel>, TeamsError>:
    channels = []
    next_link = None

    LOOP:
        request = build_list_channels_request(team_id, next_link, options)

        response = TRY http_client.send(request):
            OK(resp) => resp
            Err(TransientError) =>
                // Retry handled by resilience layer
                CONTINUE
            Err(e) => RETURN Err(e)

        MATCH response.status:
            200 =>
                page = parse_channel_list(response.body)
                channels.extend(page.value)

                IF page.odata_next_link IS Some(link):
                    next_link = Some(link)
                ELSE:
                    BREAK

            404 =>
                IF channels.is_empty():
                    RETURN Err(TeamNotFoundError(team_id))
                ELSE:
                    // Team deleted during pagination
                    log_warning("Team deleted during channel enumeration", team_id)
                    BREAK

            _ =>
                RETURN Err(handle_graph_error(response))

    RETURN Ok(channels)
```

### 2.4 Message Router Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| No matching rules | Default destination or drop | Configurable default_destination |
| Multiple rules match | All matching rules execute | Collect all destinations |
| Circular routing | Detect and prevent | Route ID tracking, max depth = 5 |
| Destination temporarily unavailable | Mark failed, continue others | Partial success reporting |
| All destinations fail | Return aggregate error | RoutingCompletelyFailedError |
| Rule condition throws | Skip rule, log error | Error isolation per rule |
| Empty destination list after filter | Treat as no match | Use default or drop |

```
FUNCTION route_with_resilience(message: RoutableMessage) -> RoutingResult:
    // Circular routing detection
    IF message.routing_depth > MAX_ROUTING_DEPTH:
        RETURN RoutingResult.error(CircularRoutingDetected(message.route_id))

    matched_rules = find_matching_rules(message)

    IF matched_rules.is_empty() AND config.default_destination IS Some(default):
        matched_rules = [create_default_rule(default)]
    ELSE IF matched_rules.is_empty():
        RETURN RoutingResult.dropped("No matching rules")

    results = []

    FOR rule IN matched_rules (sorted by priority):
        FOR destination IN rule.destinations:
            TRY:
                result = deliver_to_destination(destination, message)
                results.push(DeliveryResult.success(destination, result))
            CATCH e:
                results.push(DeliveryResult.failure(destination, e))

                IF rule.stop_on_error:
                    BREAK

    // Analyze results
    success_count = results.filter(r => r.is_success()).count()
    failure_count = results.filter(r => r.is_failure()).count()

    IF success_count == 0 AND failure_count > 0:
        RETURN RoutingResult.complete_failure(results)
    ELSE IF failure_count > 0:
        RETURN RoutingResult.partial_success(results)
    ELSE:
        RETURN RoutingResult.success(results)
```

### 2.5 Authentication Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Graph token expired mid-batch | Refresh and retry | Token refresh per request |
| Bot token near expiry | Proactive refresh | Refresh at 80% TTL |
| Multi-tenant token mismatch | Validate tenant_id | Check token claims |
| Concurrent token refresh | Single refresh | Mutex on token refresh |
| Credential rotation | Hot reload | Watch for config changes |
| Certificate expiry | Early warning | Monitor certificate expiry, alert at 30 days |

```
FUNCTION get_token_with_refresh(scope: String, tenant_id: String) -> Result<AccessToken, AuthError>:
    cache_key = format!("{}:{}", tenant_id, scope)

    WITH token_cache.lock():
        IF cached = token_cache.get(cache_key):
            IF cached.expires_at > now() + REFRESH_BUFFER:
                RETURN Ok(cached.token)

            // Proactive refresh
            IF NOT refresh_in_progress.contains(cache_key):
                refresh_in_progress.insert(cache_key)
                spawn_refresh_task(cache_key, scope, tenant_id)

            // Return current token while refreshing
            IF cached.expires_at > now():
                RETURN Ok(cached.token)

    // Token expired, wait for refresh or acquire new
    RETURN acquire_token_sync(scope, tenant_id)
```

---

## 3. Performance Optimizations

### 3.1 Connection Management

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       HTTP Connection Strategy                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Connection Pools (per endpoint):                                                │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────────────┐ │
│  │  Graph API Pool    │  │  Bot Framework Pool│  │  Webhook Pools (per URL)   │ │
│  │  Max: 100 conns    │  │  Max: 50 conns     │  │  Max: 10 conns each        │ │
│  │  Idle: 30s         │  │  Idle: 30s         │  │  Idle: 60s                 │ │
│  └────────────────────┘  └────────────────────┘  └────────────────────────────┘ │
│                                                                                  │
│  HTTP/2 multiplexing enabled for Graph and Bot Framework                        │
│  Keep-alive for webhook connections (reduces TLS handshake overhead)            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Batching Strategy

```
FUNCTION batch_graph_requests(requests: Vec<GraphRequest>) -> Vec<GraphResponse>:
    // Microsoft Graph supports JSON batching up to 20 requests
    CONST BATCH_SIZE = 20

    results = []

    FOR chunk IN requests.chunks(BATCH_SIZE):
        batch_request = BatchRequest {
            requests: chunk.enumerate().map(|(i, req)| {
                BatchRequestItem {
                    id: i.to_string(),
                    method: req.method,
                    url: req.relative_url,
                    body: req.body,
                    headers: req.headers
                }
            })
        }

        response = http_client.post("$batch", batch_request)

        FOR item IN response.responses:
            original_index = parse_int(item.id)
            results[original_index] = parse_response(item)

    RETURN results
```

### 3.3 Card Caching

```
STRUCT CardCache:
    cache: LruCache<CardCacheKey, SerializedCard>
    max_entries: usize = 1000
    ttl: Duration = 5.minutes

FUNCTION get_or_build_card(template: CardTemplate, data: CardData) -> AdaptiveCard:
    cache_key = CardCacheKey {
        template_hash: hash(template),
        data_hash: hash(data.cacheable_fields())
    }

    IF cached = card_cache.get(cache_key):
        // Apply non-cacheable dynamic data
        RETURN apply_dynamic_data(cached, data.dynamic_fields())

    card = build_card(template, data)
    serialized = serialize_card(card)

    card_cache.insert(cache_key, serialized)

    RETURN card
```

### 3.4 Message Routing Optimization

```
STRUCT OptimizedRuleEngine:
    // Pre-compiled rules for fast matching
    tag_index: HashMap<String, Vec<RuleId>>
    severity_index: HashMap<Severity, Vec<RuleId>>
    source_index: HashMap<String, Vec<RuleId>>
    all_rules: Vec<RoutingRule>  // sorted by priority

FUNCTION find_matching_rules(message: RoutableMessage) -> Vec<RoutingRule>:
    // Use indexes to narrow candidate set
    candidates = HashSet::new()

    IF message.tags IS Some(tags):
        FOR tag IN tags:
            IF rule_ids = tag_index.get(tag):
                candidates.extend(rule_ids)

    IF message.severity IS Some(sev):
        IF rule_ids = severity_index.get(sev):
            candidates.extend(rule_ids)

    IF message.source IS Some(src):
        IF rule_ids = source_index.get(src):
            candidates.extend(rule_ids)

    // If no indexed matches, check all rules (for custom predicates)
    IF candidates.is_empty():
        candidates = all_rules.iter().map(r => r.id).collect()

    // Evaluate only candidate rules
    matches = candidates
        .iter()
        .map(id => all_rules.get(id))
        .filter(rule => evaluate_rule(rule, message))
        .sorted_by(r => r.priority)
        .collect()

    RETURN matches
```

---

## 4. Error Recovery Strategies

### 4.1 Webhook Delivery Recovery

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Webhook Delivery State Machine                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                         ┌────────────┐                                          │
│           send()        │            │                                          │
│         ────────────────│  Pending   │                                          │
│                         │            │                                          │
│                         └─────┬──────┘                                          │
│                               │                                                  │
│                   ┌───────────┼───────────┐                                     │
│                   │           │           │                                      │
│                   ▼           ▼           ▼                                      │
│            ┌──────────┐ ┌──────────┐ ┌──────────┐                               │
│            │ Success  │ │Retrying  │ │  Failed  │                               │
│            │          │ │          │ │          │                               │
│            └──────────┘ └────┬─────┘ └──────────┘                               │
│                              │           ▲                                       │
│                              │           │                                       │
│                   ┌──────────┼───────────┘                                      │
│                   │          │                                                   │
│                   │    max retries (3)                                          │
│                   │          │                                                   │
│                   ▼          ▼                                                   │
│            ┌──────────┐ ┌──────────┐                                            │
│            │ Success  │ │Dead Letter│                                           │
│            └──────────┘ └──────────┘                                            │
│                                                                                  │
│  Retry intervals: 1s, 5s, 30s (exponential with jitter)                         │
│  Dead letter: Store for manual retry or investigation                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Conversation Reference Recovery

```
FUNCTION recover_stale_conversation(conv_ref: ConversationReference, error: TeamsError) -> RecoveryAction:
    MATCH error:
        ConversationNotFoundError =>
            // Conversation was deleted - cannot recover
            RETURN RecoveryAction.PermanentFailure("Conversation no longer exists")

        BotNotInTeamError =>
            // Bot was removed - user action required
            RETURN RecoveryAction.RequiresUserAction("Bot must be reinstalled in team")

        TenantNotAuthorizedError =>
            // Tenant consent revoked - admin action required
            RETURN RecoveryAction.RequiresAdminAction("Tenant consent required")

        ServiceUrlChangedError(new_url) =>
            // Update reference and retry
            updated_ref = conv_ref.with_service_url(new_url)
            store_conversation_reference(updated_ref)
            RETURN RecoveryAction.RetryWithUpdatedReference(updated_ref)

        TokenExpiredError =>
            // Auth layer should handle, but if we get here, force refresh
            clear_token_cache(conv_ref.tenant_id)
            RETURN RecoveryAction.RetryAfterTokenRefresh

        _ =>
            RETURN RecoveryAction.Unknown(error)
```

### 4.3 Partial Failure Handling

```
STRUCT DeliveryReport:
    message_id: String
    destinations: Vec<DestinationResult>
    overall_status: DeliveryStatus
    retryable_failures: Vec<DestinationId>
    permanent_failures: Vec<DestinationId>

FUNCTION create_delivery_report(results: Vec<DeliveryResult>) -> DeliveryReport:
    retryable = []
    permanent = []
    successful = []

    FOR result IN results:
        MATCH result:
            Success(dest_id, _) => successful.push(dest_id)

            Failure(dest_id, error) =>
                IF is_retryable(error):
                    retryable.push(dest_id)
                ELSE:
                    permanent.push(dest_id)

    overall_status =
        IF successful.len() == results.len():
            DeliveryStatus.AllSucceeded
        ELSE IF successful.is_empty():
            DeliveryStatus.AllFailed
        ELSE:
            DeliveryStatus.PartialSuccess

    RETURN DeliveryReport {
        message_id: generate_id(),
        destinations: results,
        overall_status,
        retryable_failures: retryable,
        permanent_failures: permanent
    }
```

---

## 5. Security Hardening

### 5.1 Input Validation

```
STRUCT MessageValidator:

FUNCTION validate_text_message(text: String) -> Result<ValidatedText, ValidationError>:
    // Length check
    IF text.len() > MAX_TEXT_LENGTH (4096):
        RETURN Err(ValidationError.TextTooLong(text.len(), MAX_TEXT_LENGTH))

    // Empty check
    IF text.trim().is_empty():
        RETURN Err(ValidationError.EmptyText)

    // Control character check (except allowed whitespace)
    FOR char IN text.chars():
        IF char.is_control() AND char NOT IN ['\n', '\r', '\t']:
            RETURN Err(ValidationError.InvalidControlCharacter(char))

    RETURN Ok(ValidatedText(text))

FUNCTION validate_adaptive_card(card: AdaptiveCard) -> Result<ValidatedCard, ValidationError>:
    // Schema version check
    IF card.version NOT IN SUPPORTED_VERSIONS:
        RETURN Err(ValidationError.UnsupportedSchemaVersion(card.version))

    // Size check
    serialized = serialize(card)
    IF serialized.len() > MAX_CARD_SIZE (28672):  // 28KB
        RETURN Err(ValidationError.CardTooLarge(serialized.len()))

    // Action URL validation
    FOR action IN card.all_actions():
        IF action IS OpenUrlAction(url):
            validate_action_url(url)?

    // Image URL validation
    FOR element IN card.all_elements():
        IF element IS Image(url):
            validate_image_url(url)?

    RETURN Ok(ValidatedCard(card))

FUNCTION validate_action_url(url: String) -> Result<(), ValidationError>:
    parsed = parse_url(url)?

    // HTTPS required
    IF parsed.scheme != "https":
        RETURN Err(ValidationError.InsecureActionUrl(url))

    // No localhost/internal IPs
    IF is_internal_address(parsed.host):
        RETURN Err(ValidationError.InternalUrlNotAllowed(url))

    RETURN Ok(())
```

### 5.2 HTML Sanitization

```
STRUCT HtmlSanitizer:
    // Teams-safe HTML subset
    allowed_tags: Set<String> = ["b", "i", "strong", "em", "a", "br", "p", "ul", "ol", "li"]
    allowed_attributes: Map<String, Set<String>> = {
        "a": ["href", "title"]
    }

FUNCTION sanitize_html(input: String) -> String:
    output = StringBuilder::new()
    parser = HtmlParser::new(input)

    FOR token IN parser.tokens():
        MATCH token:
            OpenTag(name, attrs) =>
                IF name.to_lower() IN allowed_tags:
                    safe_attrs = filter_attributes(name, attrs)
                    output.append(format!("<{}{}>", name, safe_attrs))
                // Else: skip tag entirely

            CloseTag(name) =>
                IF name.to_lower() IN allowed_tags:
                    output.append(format!("</{}>", name))

            Text(content) =>
                output.append(escape_html(content))

            Comment(_) =>
                // Skip comments
                CONTINUE

    RETURN output.to_string()

FUNCTION escape_html(text: String) -> String:
    RETURN text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#x27;")
```

### 5.3 Webhook URL Protection

```
STRUCT SecureWebhookUrl:
    inner: SecretString

IMPLEMENT SecureWebhookUrl:
    FUNCTION new(url: String) -> Result<Self, ValidationError>:
        // Validate URL format
        parsed = parse_url(url)?

        // Must be HTTPS
        IF parsed.scheme != "https":
            RETURN Err(ValidationError.InsecureWebhookUrl)

        // Must be Microsoft domain
        IF NOT is_microsoft_webhook_domain(parsed.host):
            RETURN Err(ValidationError.InvalidWebhookDomain(parsed.host))

        RETURN Ok(SecureWebhookUrl {
            inner: SecretString::new(url)
        })

    FUNCTION expose_for_request(&self) -> &str:
        // Only expose for actual HTTP request
        self.inner.expose_secret()

    FUNCTION masked(&self) -> String:
        // For logging: "https://outlook.office.com/webhook/***"
        url = self.inner.expose_secret()
        parsed = parse_url(url)
        format!("{}://{}/***/***", parsed.scheme, parsed.host)

FUNCTION is_microsoft_webhook_domain(host: String) -> bool:
    RETURN host.ends_with(".office.com")
        OR host.ends_with(".microsoft.com")
        OR host.ends_with(".office365.com")
```

### 5.4 Bot Activity Validation

```
FUNCTION validate_incoming_activity(activity: Activity, expected_bot_id: String) -> Result<ValidatedActivity, SecurityError>:
    // Validate required fields
    IF activity.type IS None:
        RETURN Err(SecurityError.MissingActivityType)

    IF activity.service_url IS None:
        RETURN Err(SecurityError.MissingServiceUrl)

    // Validate service URL is Microsoft
    service_url = activity.service_url.unwrap()
    IF NOT is_valid_bot_service_url(service_url):
        RETURN Err(SecurityError.InvalidServiceUrl(service_url))

    // Validate recipient is our bot
    IF activity.recipient.id != expected_bot_id:
        RETURN Err(SecurityError.RecipientMismatch(activity.recipient.id, expected_bot_id))

    // Validate conversation reference fields
    IF activity.conversation IS None:
        RETURN Err(SecurityError.MissingConversation)

    // Validate timestamp is recent (within 5 minutes to account for clock skew)
    IF activity.timestamp IS Some(ts):
        IF abs(now() - ts) > Duration.minutes(5):
            RETURN Err(SecurityError.ActivityTimestampOutOfRange(ts))

    RETURN Ok(ValidatedActivity(activity))

FUNCTION is_valid_bot_service_url(url: String) -> bool:
    parsed = parse_url(url)
    valid_hosts = [
        "smba.trafficmanager.net",
        "api.botframework.com",
        "*.botframework.com"
    ]
    RETURN valid_hosts.any(pattern => matches_pattern(parsed.host, pattern))
```

---

## 6. Testing Strategy

### 6.1 Unit Test Coverage

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Unit Test Matrix                                        │
├────────────────────────────┬─────────────────────────────────────────┬──────────┤
│ Component                  │ Test Focus                              │ Coverage │
├────────────────────────────┼─────────────────────────────────────────┼──────────┤
│ WebhookService             │ Payload building, validation, error map │ >95%     │
│ BotService                 │ Activity routing, reply construction    │ >95%     │
│ GraphService               │ Request building, pagination, batching  │ >95%     │
│ CardBuilder                │ Fluent API, all element types           │ >95%     │
│ MessageRouter              │ Rule matching, priority, multi-dest     │ >95%     │
│ HtmlSanitizer              │ All tag/attribute combinations          │ >95%     │
│ Validators                 │ All validation rules, edge cases        │ >95%     │
│ Error Mapping              │ All HTTP status codes                   │ >90%     │
└────────────────────────────┴─────────────────────────────────────────┴──────────┘
```

### 6.2 Integration Test Scenarios

```
DESCRIBE "Webhook Integration":

    TEST "send_card delivers to mock endpoint":
        server = MockServer::start()
        server.expect_post("/webhook/xxx")
            .with_body_json(adaptive_card_matcher())
            .respond_with(status: 200)

        client = TeamsClient::new(config)
        result = client.webhook().send_card(server.url("/webhook/xxx"), card)

        ASSERT result.is_ok()
        server.verify()

    TEST "retry on 429 with Retry-After":
        server = MockServer::start()
        server.expect_post("/webhook/xxx")
            .respond_with(status: 429, headers: {"Retry-After": "2"})
            .times(2)
        server.expect_post("/webhook/xxx")
            .respond_with(status: 200)
            .times(1)

        result = client.webhook().send_card(url, card)

        ASSERT result.is_ok()
        ASSERT elapsed_time >= 4.seconds

    TEST "circuit breaker opens after failures":
        server = MockServer::start()
        server.expect_post("/webhook/xxx")
            .respond_with(status: 503)
            .times(5)

        FOR i IN 1..6:
            client.webhook().send_card(url, card)

        result = client.webhook().send_card(url, card)
        ASSERT result.is_err()
        ASSERT result.error IS CircuitBreakerOpen

DESCRIBE "Bot Proactive Messaging":

    TEST "send_proactive_message with valid conversation reference":
        server = MockServer::start()
        server.expect_post("/v3/conversations/{id}/activities")
            .with_auth_header()
            .respond_with(status: 201, body: {"id": "activity_123"})

        result = client.bot().send_proactive_message(conv_ref, "Hello")

        ASSERT result.is_ok()
        ASSERT result.value.id == "activity_123"

    TEST "handle stale conversation reference":
        server = MockServer::start()
        server.expect_post("/v3/conversations/{id}/activities")
            .respond_with(status: 404)

        result = client.bot().send_proactive_message(conv_ref, "Hello")

        ASSERT result.is_err()
        ASSERT result.error IS ConversationNotFoundError

DESCRIBE "Message Router":

    TEST "route to multiple destinations":
        router = MessageRouter::new()
        router.add_rule(RoutingRule {
            conditions: [TagCondition("critical")],
            destinations: [
                ChannelDestination(team_id, channel_id),
                WebhookDestination(webhook_url)
            ]
        })

        message = RoutableMessage {
            tags: ["critical"],
            content: "Alert!"
        }

        result = router.route(message)

        ASSERT result.successful_deliveries.len() == 2
```

### 6.3 Property-Based Tests

```
PROPERTY_TEST "CardBuilder produces valid JSON for any element combination":
    FORALL elements: Vec<CardElement> (non-empty, depth < 10):
        card = CardBuilder::new()
        FOR element IN elements:
            card.add_element(element)
        result = card.build()

        ASSERT result.is_ok()
        ASSERT is_valid_json(result.value.serialize())
        ASSERT result.value.serialize().len() <= MAX_CARD_SIZE

PROPERTY_TEST "Message router handles any rule combination":
    FORALL rules: Vec<RoutingRule>, message: RoutableMessage:
        router = MessageRouter::new()
        FOR rule IN rules:
            router.add_rule(rule)

        result = router.route(message)

        ASSERT result IS NOT Panic
        ASSERT result.routing_depth <= MAX_ROUTING_DEPTH

PROPERTY_TEST "HTML sanitizer never produces invalid HTML":
    FORALL input: String (valid UTF-8):
        output = HtmlSanitizer::sanitize(input)

        ASSERT is_valid_html(output)
        ASSERT NOT contains_script_tag(output)
        ASSERT NOT contains_event_handler(output)
```

---

## 7. Observability Enhancements

### 7.1 Metrics Definitions

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Metrics Catalog                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Counter: teams.webhook.messages_sent                                           │
│  Labels: status (success|failure), tenant_id                                    │
│                                                                                  │
│  Counter: teams.bot.proactive_messages_sent                                     │
│  Labels: status, tenant_id, conversation_type (personal|group|channel)          │
│                                                                                  │
│  Counter: teams.bot.activities_processed                                        │
│  Labels: activity_type, tenant_id                                               │
│                                                                                  │
│  Counter: teams.graph.requests                                                  │
│  Labels: operation (list_teams|list_channels|send_message|...), status          │
│                                                                                  │
│  Counter: teams.routing.messages_routed                                         │
│  Labels: rule_id, destination_type, status                                      │
│                                                                                  │
│  Histogram: teams.webhook.latency_ms                                            │
│  Buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]                              │
│                                                                                  │
│  Histogram: teams.bot.message_latency_ms                                        │
│  Buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]                              │
│                                                                                  │
│  Histogram: teams.graph.latency_ms                                              │
│  Buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]                              │
│                                                                                  │
│  Gauge: teams.circuit_breaker.state                                             │
│  Labels: endpoint (graph|bot|webhook_{id})                                      │
│  Values: 0=closed, 1=half-open, 2=open                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Structured Logging

```
STRUCT TeamsLogContext:
    tenant_id: Option<String>
    team_id: Option<String>
    channel_id: Option<String>
    conversation_id: Option<String>  // Hashed for privacy
    activity_type: Option<String>
    operation: String
    duration_ms: Option<u64>
    error_code: Option<String>

FUNCTION log_webhook_send(url: SecureWebhookUrl, result: Result, duration: Duration):
    log_info({
        "event": "teams.webhook.send",
        "operation": "send_card",
        "webhook_url": url.masked(),  // Never log full URL
        "status": result.is_ok() ? "success" : "failure",
        "error_code": result.err().map(e => e.code()),
        "duration_ms": duration.as_millis(),
        "card_size_bytes": card.serialized_size()
    })

FUNCTION log_bot_proactive(conv_ref: ConversationReference, result: Result, duration: Duration):
    log_info({
        "event": "teams.bot.proactive_send",
        "operation": "send_proactive_message",
        "tenant_id": conv_ref.tenant_id,
        "conversation_id_hash": hash(conv_ref.conversation_id),  // Privacy
        "conversation_type": conv_ref.conversation_type,
        "status": result.is_ok() ? "success" : "failure",
        "error_code": result.err().map(e => e.code()),
        "duration_ms": duration.as_millis()
        // Note: message content NEVER logged
    })
```

### 7.3 Distributed Tracing

```
FUNCTION create_teams_span(operation: String, parent: Option<SpanContext>) -> Span:
    span = tracer.start_span(
        name: format!("teams.{}", operation),
        parent: parent,
        kind: SpanKind.Client
    )

    span.set_attribute("rpc.system", "http")
    span.set_attribute("rpc.service", "microsoft_teams")

    RETURN span

FUNCTION trace_webhook_send(url: SecureWebhookUrl, card: AdaptiveCard) -> Result:
    span = create_teams_span("webhook.send_card", current_span())
    span.set_attribute("teams.webhook.card_size", card.serialized_size())

    TRY:
        result = do_webhook_send(url, card)
        span.set_attribute("teams.response.status", "success")
        RETURN result
    CATCH error:
        span.set_attribute("teams.response.status", "error")
        span.set_attribute("teams.error.type", error.type_name())
        span.record_exception(error)
        RAISE error
    FINALLY:
        span.end()
```

---

## 8. Configuration Refinement

### 8.1 Complete Configuration Schema

```
STRUCT TeamsConfig:
    // Authentication
    auth: TeamsAuthConfig

    // Service endpoints (typically defaults)
    endpoints: TeamsEndpoints

    // Resilience settings
    resilience: TeamsResilienceConfig

    // Routing configuration
    routing: Option<RoutingConfig>

    // Multi-tenant settings
    multi_tenant: MultiTenantConfig

STRUCT TeamsAuthConfig:
    // For Graph API
    client_id: String
    client_secret: SecretString  // Or certificate
    tenant_id: String  // "common" for multi-tenant

    // For Bot
    bot_app_id: String
    bot_app_secret: SecretString

STRUCT TeamsEndpoints:
    graph_base_url: String = "https://graph.microsoft.com/v1.0"
    bot_framework_url: String = "https://smba.trafficmanager.net"

STRUCT TeamsResilienceConfig:
    // Retry settings
    max_retries: u32 = 3
    initial_backoff_ms: u64 = 1000
    max_backoff_ms: u64 = 30000

    // Circuit breaker
    circuit_breaker_threshold: u32 = 5
    circuit_breaker_timeout_ms: u64 = 30000

    // Rate limiting
    webhook_rate_limit_per_second: f64 = 4.0
    bot_rate_limit_per_second: f64 = 1.0

    // Timeouts
    request_timeout_ms: u64 = 30000
    connection_timeout_ms: u64 = 10000

STRUCT MultiTenantConfig:
    enabled: bool = false
    allowed_tenants: Option<Vec<String>>  // None = all tenants
    tenant_isolation: TenantIsolation = TenantIsolation.Strict
```

### 8.2 Environment Variable Mapping

```
┌─────────────────────────────────────┬────────────────────────────────────────────┐
│ Environment Variable                │ Config Path                                │
├─────────────────────────────────────┼────────────────────────────────────────────┤
│ TEAMS_CLIENT_ID                     │ auth.client_id                             │
│ TEAMS_CLIENT_SECRET                 │ auth.client_secret                         │
│ TEAMS_TENANT_ID                     │ auth.tenant_id                             │
│ TEAMS_BOT_APP_ID                    │ auth.bot_app_id                            │
│ TEAMS_BOT_APP_SECRET                │ auth.bot_app_secret                        │
│ TEAMS_GRAPH_URL                     │ endpoints.graph_base_url                   │
│ TEAMS_MAX_RETRIES                   │ resilience.max_retries                     │
│ TEAMS_REQUEST_TIMEOUT_MS            │ resilience.request_timeout_ms              │
│ TEAMS_MULTI_TENANT_ENABLED          │ multi_tenant.enabled                       │
│ TEAMS_ALLOWED_TENANTS               │ multi_tenant.allowed_tenants (comma-sep)   │
└─────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-microsoft-teams.md | Complete |
| 2. Pseudocode | pseudocode-microsoft-teams.md | Complete |
| 3. Architecture | architecture-microsoft-teams.md | Complete |
| 4. Refinement | refinement-microsoft-teams.md | Complete |
| 5. Completion | completion-microsoft-teams.md | Pending |

---

*Phase 4: Refinement - Complete*
