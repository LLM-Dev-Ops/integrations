# OAuth2 Authentication Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`

---

## Table of Contents

1. [Edge Cases and Boundary Conditions](#1-edge-cases-and-boundary-conditions)
2. [Error Handling Refinements](#2-error-handling-refinements)
3. [Performance Optimizations](#3-performance-optimizations)
4. [Security Hardening](#4-security-hardening)
5. [Test Strategy](#5-test-strategy)
6. [Provider-Specific Handling](#6-provider-specific-handling)
7. [Operational Considerations](#7-operational-considerations)
8. [API Ergonomics](#8-api-ergonomics)
9. [Documentation Requirements](#9-documentation-requirements)
10. [Migration and Compatibility](#10-migration-and-compatibility)

---

## 1. Edge Cases and Boundary Conditions

### 1.1 Token Lifecycle Edge Cases

| Edge Case | Scenario | Handling Strategy |
|-----------|----------|-------------------|
| **EC-TL-001** | Token expires exactly during use | Return token, let API call fail, trigger refresh on next request |
| **EC-TL-002** | Refresh token expires during refresh attempt | Clear tokens, return `TokenError::RefreshFailed`, require re-auth |
| **EC-TL-003** | Token response missing `expires_in` | Treat as non-expiring OR use configurable default (1 hour) |
| **EC-TL-004** | Negative `expires_in` value | Treat as already expired, attempt immediate refresh |
| **EC-TL-005** | Very large `expires_in` (> 1 year) | Cap at maximum (configurable, default 90 days) |
| **EC-TL-006** | Refresh returns new refresh_token | Replace stored refresh token |
| **EC-TL-007** | Refresh returns NO refresh_token | Keep existing refresh token |
| **EC-TL-008** | Concurrent refresh attempts | Use per-key mutex, second waiter gets refreshed token |
| **EC-TL-009** | Token storage fails during refresh | Return new tokens but log storage failure |
| **EC-TL-010** | Clock skew between client and server | Add configurable clock skew tolerance (default 30s) |

```
FUNCTION handle_token_expiry_edge_cases(response: TokenResponse, config: OAuth2Config) -> StoredTokens
  now <- Instant::now()

  // EC-TL-003: Missing expires_in
  expires_in <- response.expires_in.unwrap_or(config.default_token_lifetime_secs)

  // EC-TL-004: Negative expires_in
  IF expires_in < 0 THEN
    expires_in <- 0
  END IF

  // EC-TL-005: Very large expires_in
  max_lifetime <- config.max_token_lifetime_secs OR 90 * 24 * 60 * 60  // 90 days
  IF expires_in > max_lifetime THEN
    log_warn("Token expires_in exceeds maximum, capping", {
      original: expires_in,
      capped: max_lifetime
    })
    expires_in <- max_lifetime
  END IF

  // EC-TL-010: Apply clock skew tolerance
  effective_expires_in <- expires_in - config.clock_skew_tolerance_secs

  expires_at <- IF effective_expires_in > 0 THEN
    Some(now + Duration::from_secs(effective_expires_in))
  ELSE
    Some(now)  // Already expired
  END IF

  RETURN StoredTokens {
    access_token: SecretString::new(response.access_token),
    expires_at: expires_at,
    ...
  }
END FUNCTION
```

### 1.2 Authorization Flow Edge Cases

| Edge Case | Scenario | Handling Strategy |
|-----------|----------|-------------------|
| **EC-AF-001** | User cancels authorization | Handle `access_denied` error gracefully |
| **EC-AF-002** | State parameter tampered | Return `StateMismatch` error, log potential attack |
| **EC-AF-003** | State expires before callback | Return `StateMismatch` with hint about expiration |
| **EC-AF-004** | Duplicate callback with same code | Second call fails (code already consumed) |
| **EC-AF-005** | Callback with error AND code | Prioritize error, ignore code |
| **EC-AF-006** | Missing redirect_uri in callback | Use stored redirect_uri from state metadata |
| **EC-AF-007** | Redirect URI mismatch | Fail with `InvalidRedirectUri` |
| **EC-AF-008** | Empty scope in response | Use requested scopes as granted |
| **EC-AF-009** | Scope reduction by provider | Log warning, store actual granted scopes |
| **EC-AF-010** | PKCE verifier mismatch | Provider returns `invalid_grant` |

```
FUNCTION handle_callback_edge_cases(callback: CallbackParams, state_metadata: StateMetadata) -> Result<(), OAuth2Error>
  // EC-AF-005: Error takes priority
  IF callback.error IS Some THEN
    RETURN Error(map_authorization_error(callback.error.unwrap(), ...))
  END IF

  // EC-AF-001: Access denied
  IF callback.error == Some("access_denied") THEN
    log_info("User cancelled authorization")
    RETURN Error(AuthorizationError::AccessDenied { ... })
  END IF

  // EC-AF-006: Use stored redirect_uri
  redirect_uri <- callback.redirect_uri.unwrap_or(state_metadata.redirect_uri)

  // EC-AF-007: Validate redirect_uri matches
  IF redirect_uri != state_metadata.redirect_uri THEN
    log_warn("Redirect URI mismatch - possible attack", {
      expected: state_metadata.redirect_uri,
      received: redirect_uri
    })
    RETURN Error(AuthorizationError::InvalidRequest {
      description: "Redirect URI mismatch"
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 1.3 Network Edge Cases

| Edge Case | Scenario | Handling Strategy |
|-----------|----------|-------------------|
| **EC-NW-001** | DNS resolution fails | Return `DnsResolutionFailed`, retryable |
| **EC-NW-002** | Connection timeout | Return `Timeout`, retryable |
| **EC-NW-003** | TLS handshake fails | Return `TlsError`, NOT retryable (likely config issue) |
| **EC-NW-004** | Connection reset mid-request | Retry with same request |
| **EC-NW-005** | Partial response received | Return `InvalidResponse` |
| **EC-NW-006** | HTTP 429 without Retry-After | Use exponential backoff |
| **EC-NW-007** | HTTP 429 with Retry-After | Honor Retry-After header |
| **EC-NW-008** | HTTP 503 Service Unavailable | Retry with backoff |
| **EC-NW-009** | HTTP redirect (3xx) | Do NOT follow (OAuth2 redirects are browser-based) |
| **EC-NW-010** | Response body too large | Limit to configurable max (default 1MB) |

```
FUNCTION handle_http_response_edge_cases(response: HttpResponse) -> Result<HttpResponse, OAuth2Error>
  // EC-NW-009: Don't follow redirects
  IF response.status.is_redirect() THEN
    RETURN Error(ProtocolError::UnexpectedRedirect {
      location: response.headers.get("Location")
    })
  END IF

  // EC-NW-010: Body size limit
  max_body_size <- config.max_response_body_size OR 1_048_576  // 1MB
  IF response.body.len() > max_body_size THEN
    RETURN Error(ProtocolError::ResponseTooLarge {
      size: response.body.len(),
      max: max_body_size
    })
  END IF

  // EC-NW-006/007: Rate limiting
  IF response.status == 429 THEN
    retry_after <- parse_retry_after_header(response.headers)
      .unwrap_or(Duration::from_secs(60))  // Default 60s if no header

    RETURN Error(NetworkError::RateLimited {
      retry_after: Some(retry_after)
    })
  END IF

  RETURN Ok(response)
END FUNCTION

FUNCTION parse_retry_after_header(headers: HeaderMap) -> Option<Duration>
  header_value <- headers.get("Retry-After")?

  // Try parsing as seconds
  IF let Ok(secs) = header_value.parse::<u64>() THEN
    RETURN Some(Duration::from_secs(secs))
  END IF

  // Try parsing as HTTP date
  IF let Ok(date) = parse_http_date(header_value) THEN
    delay <- date - SystemTime::now()
    IF delay > Duration::ZERO THEN
      RETURN Some(delay)
    END IF
  END IF

  RETURN None
END FUNCTION
```

### 1.4 Device Flow Edge Cases

| Edge Case | Scenario | Handling Strategy |
|-----------|----------|-------------------|
| **EC-DF-001** | User enters wrong code | Provider returns error on poll |
| **EC-DF-002** | Polling too fast | Handle `slow_down`, increase interval |
| **EC-DF-003** | Device code expires | Return `DeviceCodeExpired` |
| **EC-DF-004** | User abandons flow | Eventually expires, return timeout |
| **EC-DF-005** | Network fails during poll | Retry poll, don't abandon flow |
| **EC-DF-006** | Very long polling (> 15 min) | Configurable max wait time |
| **EC-DF-007** | Multiple users on same code | Only first successful auth works |
| **EC-DF-008** | Missing `interval` in response | Use default 5 seconds |

```
FUNCTION device_flow_polling_loop(
  response: DeviceAuthorizationResponse,
  config: DeviceFlowConfig
) -> Result<TokenResponse, OAuth2Error>

  // EC-DF-008: Default interval
  interval <- response.interval.unwrap_or(5)

  // EC-DF-006: Max wait time
  max_wait <- config.max_wait_time OR Duration::from_secs(900)  // 15 min
  deadline <- min(
    Instant::now() + Duration::from_secs(response.expires_in),
    Instant::now() + max_wait
  )

  consecutive_network_failures <- 0
  max_network_failures <- 5

  LOOP
    // Check deadline
    IF Instant::now() >= deadline THEN
      RETURN Error(AuthorizationError::DeviceCodeExpired { ... })
    END IF

    sleep(Duration::from_secs(interval)).await

    TRY
      result <- poll_token(response.device_code).await
      consecutive_network_failures <- 0  // Reset on success

      MATCH result
        CASE DeviceTokenResult::Success(tokens):
          RETURN Ok(tokens)

        CASE DeviceTokenResult::Pending:
          CONTINUE

        CASE DeviceTokenResult::SlowDown { new_interval }:
          // EC-DF-002: Increase interval
          interval <- interval + new_interval
          log_debug("Slowing down device flow polling", { interval })
          CONTINUE

        CASE DeviceTokenResult::Expired:
          RETURN Error(AuthorizationError::DeviceCodeExpired { ... })

        CASE DeviceTokenResult::AccessDenied:
          RETURN Error(AuthorizationError::AccessDenied { ... })
      END MATCH

    CATCH NetworkError AS e
      // EC-DF-005: Retry on network failures
      consecutive_network_failures <- consecutive_network_failures + 1

      IF consecutive_network_failures >= max_network_failures THEN
        RETURN Error(e)
      END IF

      log_warn("Network error during device flow poll, retrying", {
        error: e,
        attempt: consecutive_network_failures
      })
      CONTINUE
    END TRY
  END LOOP
END FUNCTION
```

### 1.5 Storage Edge Cases

| Edge Case | Scenario | Handling Strategy |
|-----------|----------|-------------------|
| **EC-ST-001** | Storage full (file) | Return `StorageError::WriteFailed` |
| **EC-ST-002** | File permissions denied | Return `StorageError::PermissionDenied` |
| **EC-ST-003** | Corrupted storage file | Attempt recovery, else return `CorruptedData` |
| **EC-ST-004** | Concurrent file access | Use file locking |
| **EC-ST-005** | Storage key with special characters | Sanitize or encode keys |
| **EC-ST-006** | Very long storage key | Hash if exceeds limit |
| **EC-ST-007** | Token larger than storage limit | Return `TokenTooLarge` |
| **EC-ST-008** | Encryption key mismatch | Return `DecryptionFailed` |

```
FUNCTION sanitize_storage_key(key: String) -> String
  // EC-ST-005: Replace problematic characters
  sanitized <- key
    .replace("/", "_")
    .replace("\\", "_")
    .replace(":", "_")
    .replace("*", "_")
    .replace("?", "_")
    .replace("\"", "_")
    .replace("<", "_")
    .replace(">", "_")
    .replace("|", "_")

  // EC-ST-006: Hash if too long (max 255 for most filesystems)
  max_length <- 200  // Leave room for file extension
  IF sanitized.len() > max_length THEN
    hash <- sha256(sanitized.as_bytes())
    sanitized <- base64_url_encode_no_padding(hash)
  END IF

  RETURN sanitized
END FUNCTION

FUNCTION handle_storage_corruption(path: PathBuf) -> Result<PersistedTokenStore, OAuth2Error>
  // EC-ST-003: Attempt recovery
  TRY
    contents <- read_file(path)?
    store <- parse_json(contents)?
    RETURN Ok(store)
  CATCH ParseError
    // Try to read backup if exists
    backup_path <- path.with_extension("bak")
    IF backup_path.exists() THEN
      log_warn("Primary storage corrupted, attempting backup recovery")
      TRY
        backup_contents <- read_file(backup_path)?
        store <- parse_json(backup_contents)?
        // Restore from backup
        write_file(path, backup_contents)?
        RETURN Ok(store)
      CATCH
        // Backup also corrupted
      END TRY
    END IF

    log_error("Storage corrupted and no valid backup, starting fresh")
    RETURN Ok(PersistedTokenStore::new())
  END TRY
END FUNCTION
```

---

## 2. Error Handling Refinements

### 2.1 Error Recovery Matrix

| Error Type | Retryable | Auto-Recover | User Action Required |
|------------|-----------|--------------|---------------------|
| `NetworkError::Timeout` | Yes | Automatic retry | None |
| `NetworkError::ConnectionFailed` | Yes | Automatic retry | None |
| `NetworkError::DnsResolutionFailed` | Yes | Automatic retry | Check network |
| `NetworkError::TlsError` | No | None | Fix TLS config |
| `NetworkError::CircuitOpen` | No | Wait for reset | None |
| `NetworkError::RateLimited` | Yes | Wait + retry | None |
| `ProviderError::ServerError` | Yes | Automatic retry | None |
| `ProviderError::TemporarilyUnavailable` | Yes | Wait + retry | None |
| `ProviderError::InvalidClient` | No | None | Fix credentials |
| `ProviderError::InvalidGrant` | Conditional | Re-authenticate | Login again |
| `TokenError::Expired` | Yes | Auto-refresh | None (if refresh_token) |
| `TokenError::NoRefreshToken` | No | None | Re-authenticate |
| `AuthorizationError::AccessDenied` | No | None | User must consent |
| `AuthorizationError::StateMismatch` | No | None | Restart flow |
| `ConfigurationError::*` | No | None | Fix configuration |

### 2.2 Error Context Enrichment

```
STRUCT EnrichedError {
  error: OAuth2Error,
  context: ErrorContext,
  suggestions: Vec<String>,
  documentation_link: Option<String>
}

FUNCTION enrich_error(error: OAuth2Error, operation: String) -> EnrichedError
  suggestions <- []
  doc_link <- None

  MATCH error
    CASE OAuth2Error::Provider(ProviderError::InvalidClient { .. }):
      suggestions.push("Verify client_id is correct")
      suggestions.push("Verify client_secret is correct (if confidential client)")
      suggestions.push("Check if credentials have been rotated")
      doc_link <- Some("https://docs.example.com/oauth2/credentials")

    CASE OAuth2Error::Provider(ProviderError::InvalidGrant { description }):
      IF description.contains("expired") THEN
        suggestions.push("The refresh token has expired")
        suggestions.push("User must re-authenticate")
      ELSE IF description.contains("revoked") THEN
        suggestions.push("The token has been revoked")
        suggestions.push("User may have disconnected the application")
      ELSE
        suggestions.push("The authorization code or refresh token is invalid")
      END IF
      doc_link <- Some("https://docs.example.com/oauth2/token-refresh")

    CASE OAuth2Error::Network(NetworkError::TlsError { message }):
      suggestions.push("Verify the provider's certificate is valid")
      suggestions.push("Check if using a corporate proxy that intercepts TLS")
      suggestions.push("Ensure TLS 1.2 or higher is supported")
      doc_link <- Some("https://docs.example.com/oauth2/tls")

    CASE OAuth2Error::Authorization(AuthorizationError::StateMismatch { .. }):
      suggestions.push("This may indicate a CSRF attack attempt")
      suggestions.push("Restart the authorization flow")
      suggestions.push("Ensure cookies are enabled if using web flow")

    CASE OAuth2Error::Configuration(ConfigurationError::DiscoveryFailed { .. }):
      suggestions.push("Verify the issuer URL is correct")
      suggestions.push("Check if provider supports OIDC discovery")
      suggestions.push("The provider may be temporarily unavailable")

    CASE _:
      // No specific suggestions
  END MATCH

  RETURN EnrichedError {
    error: error,
    context: ErrorContext::new(operation),
    suggestions: suggestions,
    documentation_link: doc_link
  }
END FUNCTION
```

### 2.3 Graceful Degradation

```
STRUCT DegradationConfig {
  allow_expired_token_on_refresh_failure: bool,
  expired_token_grace_period: Duration,
  fallback_to_cached_discovery: bool,
  discovery_cache_stale_ttl: Duration
}

FUNCTION get_access_token_with_degradation(
  key: String,
  config: DegradationConfig
) -> Result<AccessToken, OAuth2Error>

  stored <- storage.get(key)?

  IF stored IS None THEN
    RETURN Error(TokenError::NotFound { key })
  END IF

  tokens <- stored.unwrap()

  // Try refresh if expiring
  IF tokens.is_expiring_soon(refresh_threshold) AND tokens.has_refresh_token() THEN
    TRY
      refreshed <- refresh_tokens(key, tokens).await?
      RETURN Ok(AccessToken::from(refreshed))
    CATCH OAuth2Error AS e
      // Graceful degradation: allow expired token briefly
      IF config.allow_expired_token_on_refresh_failure THEN
        IF let Some(expires_at) = tokens.expires_at THEN
          grace_deadline <- expires_at + config.expired_token_grace_period

          IF Instant::now() < grace_deadline THEN
            log_warn("Token refresh failed, using expired token within grace period", {
              key: key,
              error: e,
              grace_remaining: (grace_deadline - Instant::now()).as_secs()
            })
            RETURN Ok(AccessToken::from(tokens))
          END IF
        END IF
      END IF

      RETURN Error(e)
    END TRY
  END IF

  RETURN Ok(AccessToken::from(tokens))
END FUNCTION

ASYNC FUNCTION fetch_discovery_with_fallback(
  issuer: Url,
  config: DegradationConfig
) -> Result<OIDCDiscoveryDocument, OAuth2Error>

  TRY
    doc <- fetch_discovery_fresh(issuer).await?
    cache.store(issuer, doc.clone(), Instant::now())
    RETURN Ok(doc)

  CATCH OAuth2Error AS e
    // Graceful degradation: use stale cache
    IF config.fallback_to_cached_discovery THEN
      cached <- cache.get(issuer)

      IF cached IS Some THEN
        cached_entry <- cached.unwrap()
        stale_deadline <- cached_entry.fetched_at + config.discovery_cache_stale_ttl

        IF Instant::now() < stale_deadline THEN
          log_warn("Discovery fetch failed, using stale cached document", {
            issuer: issuer,
            error: e,
            cache_age: (Instant::now() - cached_entry.fetched_at).as_secs()
          })
          RETURN Ok(cached_entry.document)
        END IF
      END IF
    END IF

    RETURN Error(e)
  END TRY
END FUNCTION
```

---

## 3. Performance Optimizations

### 3.1 Connection Pooling

```
STRUCT HttpTransportConfig {
  // Connection pool settings
  pool_max_idle_per_host: usize,      // Default: 10
  pool_idle_timeout: Duration,         // Default: 90s
  pool_max_size: Option<usize>,        // Default: None (unlimited)

  // Connection settings
  connect_timeout: Duration,           // Default: 10s
  keep_alive_timeout: Option<Duration>,// Default: 60s
  tcp_nodelay: bool,                   // Default: true

  // HTTP/2 settings
  http2_adaptive_window: bool,         // Default: true
  http2_max_frame_size: Option<u32>,   // Default: None (16KB)
}

FUNCTION create_optimized_http_client(config: HttpTransportConfig) -> HttpClient
  RETURN HttpClientBuilder::new()
    .pool_max_idle_per_host(config.pool_max_idle_per_host)
    .pool_idle_timeout(config.pool_idle_timeout)
    .connect_timeout(config.connect_timeout)
    .tcp_nodelay(config.tcp_nodelay)
    .http2_adaptive_window(config.http2_adaptive_window)
    .build()
END FUNCTION
```

### 3.2 Caching Strategy

```
STRUCT CacheConfig {
  discovery_cache_ttl: Duration,       // Default: 1 hour
  discovery_cache_max_entries: usize,  // Default: 100
  jwks_cache_ttl: Duration,            // Default: 1 hour
  jwks_cache_max_entries: usize,       // Default: 50
  negative_cache_ttl: Duration,        // Default: 5 minutes
}

STRUCT TieredCache<K, V> {
  l1_cache: LruCache<K, CachedEntry<V>>,  // Hot cache, small
  l2_cache: LruCache<K, CachedEntry<V>>,  // Warm cache, larger
  config: CacheConfig
}

IMPL TieredCache {
  FUNCTION get(&self, key: K) -> Option<V>
    // Check L1 (hot)
    IF let Some(entry) = self.l1_cache.get(key) THEN
      IF NOT entry.is_expired() THEN
        RETURN Some(entry.value.clone())
      END IF
    END IF

    // Check L2 (warm)
    IF let Some(entry) = self.l2_cache.get(key) THEN
      IF NOT entry.is_expired() THEN
        // Promote to L1
        self.l1_cache.put(key, entry.clone())
        RETURN Some(entry.value.clone())
      END IF
    END IF

    RETURN None
  END FUNCTION

  FUNCTION put(&self, key: K, value: V, ttl: Duration)
    entry <- CachedEntry {
      value: value,
      expires_at: Instant::now() + ttl
    }

    // Always insert to L1
    evicted <- self.l1_cache.put(key, entry)

    // Demote evicted to L2
    IF evicted IS Some THEN
      self.l2_cache.put(evicted.key, evicted.value)
    END IF
  END FUNCTION
}
```

### 3.3 Lazy Initialization Optimization

```
STRUCT OAuth2ClientImpl {
  config: OAuth2Config,
  shared_services: Arc<SharedServices>,

  // Lazy-initialized using OnceCell for thread-safe single init
  authorization_code_flow: OnceCell<Arc<AuthorizationCodeFlowImpl>>,
  authorization_code_pkce_flow: OnceCell<Arc<AuthorizationCodePkceFlowImpl>>,
  client_credentials_flow: OnceCell<Arc<ClientCredentialsFlowImpl>>,
  device_authorization_flow: OnceCell<Arc<DeviceAuthorizationFlowImpl>>,
  token_manager: OnceCell<Arc<TokenManagerImpl>>,
  token_introspection: OnceCell<Arc<TokenIntrospectionImpl>>,
  token_revocation: OnceCell<Arc<TokenRevocationImpl>>
}

STRUCT SharedServices {
  transport: Arc<HttpTransport>,
  state_manager: Arc<StateManager>,
  pkce_generator: Arc<PkceGenerator>,
  token_storage: Arc<TokenStorage>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  discovery_cache: Arc<DiscoveryCache>,
  logger: Logger,
  tracer: Tracer
}

IMPL OAuth2Client FOR OAuth2ClientImpl {
  FUNCTION authorization_code_pkce(&self) -> &dyn AuthorizationCodePkceFlow
    self.authorization_code_pkce_flow.get_or_init(|| {
      Arc::new(AuthorizationCodePkceFlowImpl::new(
        self.config.clone(),
        self.shared_services.clone()
      ))
    }).as_ref()
  END FUNCTION
}
```

### 3.4 Batch Operations

```
// Batch token refresh for multiple keys
ASYNC FUNCTION batch_refresh_tokens(keys: Vec<String>) -> HashMap<String, Result<AccessToken, OAuth2Error>>
  // Limit concurrency to avoid overwhelming the token endpoint
  max_concurrent <- 5
  semaphore <- Semaphore::new(max_concurrent)

  tasks <- keys.iter().map(|key| {
    permit <- semaphore.acquire().await
    task <- async {
      result <- refresh_token(key.clone()).await
      drop(permit)
      (key.clone(), result)
    }
    task
  })

  results <- join_all(tasks).await
  RETURN results.into_iter().collect()
END FUNCTION

// Pre-warm token cache
ASYNC FUNCTION prewarm_tokens(keys: Vec<String>)
  for key in keys {
    TRY
      // Just trigger a get to ensure tokens are loaded and refreshed if needed
      _ <- token_manager.get_access_token(key).await
    CATCH
      // Log but don't fail prewarm
      log_warn("Failed to prewarm token", { key })
    END TRY
  }
END FUNCTION
```

### 3.5 Memory Optimization

```
// Use compact token representation for storage
STRUCT CompactStoredTokens {
  // Use indices into shared string table for common values
  access_token: SecretString,
  token_type_idx: u8,              // Index into TOKEN_TYPES table
  expires_at_secs: Option<u64>,    // Seconds since epoch (not Instant)
  refresh_token: Option<SecretString>,
  scope_bits: u64,                 // Bitfield for common scopes
  custom_scopes: Vec<String>,      // Only non-common scopes
}

CONST TOKEN_TYPES: [&str; 2] = ["Bearer", "MAC"]

CONST COMMON_SCOPES: [&str; 16] = [
  "openid", "profile", "email", "address", "phone",
  "offline_access", "read", "write", "admin",
  "user:read", "user:write", "repo", "gist",
  "calendar", "contacts", "mail"
]

FUNCTION compress_scopes(scopes: Vec<String>) -> (u64, Vec<String>)
  bits <- 0u64
  custom <- []

  FOR scope IN scopes DO
    IF let Some(idx) = COMMON_SCOPES.iter().position(|s| s == scope) THEN
      bits <- bits | (1 << idx)
    ELSE
      custom.push(scope)
    END IF
  END FOR

  RETURN (bits, custom)
END FUNCTION

FUNCTION decompress_scopes(bits: u64, custom: Vec<String>) -> Vec<String>
  scopes <- []

  FOR (idx, scope) IN COMMON_SCOPES.iter().enumerate() DO
    IF bits & (1 << idx) != 0 THEN
      scopes.push(scope.to_string())
    END IF
  END FOR

  scopes.extend(custom)
  RETURN scopes
END FUNCTION
```

---

## 4. Security Hardening

### 4.1 Input Validation

```
STRUCT ValidationConfig {
  max_client_id_length: usize,         // Default: 256
  max_scope_length: usize,             // Default: 1000
  max_scope_count: usize,              // Default: 50
  max_redirect_uri_length: usize,      // Default: 2000
  max_state_length: usize,             // Default: 512
  max_code_length: usize,              // Default: 512
  allowed_redirect_schemes: Vec<String>,
}

FUNCTION validate_client_id(client_id: &str, config: &ValidationConfig) -> Result<(), ValidationError>
  IF client_id.is_empty() THEN
    RETURN Error(ValidationError::Empty { field: "client_id" })
  END IF

  IF client_id.len() > config.max_client_id_length THEN
    RETURN Error(ValidationError::TooLong {
      field: "client_id",
      max: config.max_client_id_length
    })
  END IF

  // Check for injection characters
  IF client_id.contains('\0') OR client_id.contains('\n') OR client_id.contains('\r') THEN
    RETURN Error(ValidationError::InvalidCharacters { field: "client_id" })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION validate_redirect_uri(uri: &Url, config: &ValidationConfig) -> Result<(), ValidationError>
  // Length check
  IF uri.as_str().len() > config.max_redirect_uri_length THEN
    RETURN Error(ValidationError::TooLong {
      field: "redirect_uri",
      max: config.max_redirect_uri_length
    })
  END IF

  // Scheme check
  scheme <- uri.scheme()
  allowed <- config.allowed_redirect_schemes.contains(scheme)
    OR (scheme == "http" AND is_localhost(uri))

  IF NOT allowed THEN
    RETURN Error(ValidationError::InvalidScheme {
      field: "redirect_uri",
      scheme: scheme.to_string()
    })
  END IF

  // No fragment
  IF uri.fragment().is_some() THEN
    RETURN Error(ValidationError::FragmentNotAllowed { field: "redirect_uri" })
  END IF

  // No credentials
  IF uri.username() != "" OR uri.password().is_some() THEN
    RETURN Error(ValidationError::CredentialsNotAllowed { field: "redirect_uri" })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION validate_scopes(scopes: &[String], config: &ValidationConfig) -> Result<(), ValidationError>
  IF scopes.len() > config.max_scope_count THEN
    RETURN Error(ValidationError::TooMany {
      field: "scopes",
      max: config.max_scope_count
    })
  END IF

  total_length <- scopes.iter().map(|s| s.len()).sum()
  IF total_length > config.max_scope_length THEN
    RETURN Error(ValidationError::TooLong {
      field: "scopes",
      max: config.max_scope_length
    })
  END IF

  FOR scope IN scopes DO
    // RFC 6749: scope-token = 1*( %x21 / %x23-5B / %x5D-7E )
    IF NOT is_valid_scope_token(scope) THEN
      RETURN Error(ValidationError::InvalidScope { scope: scope.clone() })
    END IF
  END FOR

  RETURN Ok(())
END FUNCTION
```

### 4.2 Timing Attack Prevention

```
// Constant-time string comparison for security-sensitive values
FUNCTION secure_compare(a: &[u8], b: &[u8]) -> bool
  IF a.len() != b.len() THEN
    // Still do comparison to avoid length-based timing
    _ <- constant_time_compare(a, &vec![0u8; a.len()])
    RETURN false
  END IF

  RETURN constant_time_compare(a, b)
END FUNCTION

FUNCTION constant_time_compare(a: &[u8], b: &[u8]) -> bool
  result <- 0u8
  FOR i IN 0..a.len() DO
    result <- result | (a[i] ^ b[i])
  END FOR
  RETURN result == 0
END FUNCTION

// Use secure compare for state validation
FUNCTION validate_state_secure(received: &str, expected: &str) -> bool
  RETURN secure_compare(received.as_bytes(), expected.as_bytes())
END FUNCTION
```

### 4.3 Token Exposure Prevention

```
// Ensure tokens never appear in logs or error messages
STRUCT SafeTokenRef<'a> {
  inner: &'a SecretString
}

IMPL Debug FOR SafeTokenRef {
  FUNCTION fmt(&self, f: &mut Formatter) -> fmt::Result
    write(f, "[REDACTED]")
  END FUNCTION
}

IMPL Display FOR SafeTokenRef {
  FUNCTION fmt(&self, f: &mut Formatter) -> fmt::Result
    write(f, "[REDACTED]")
  END FUNCTION
}

// Wrapper that prevents accidental exposure
FUNCTION safe_log_token_response(response: &TokenResponse)
  log_info("Token response received", {
    token_type: response.token_type,
    expires_in: response.expires_in,
    has_refresh_token: response.refresh_token.is_some(),
    scope: response.scope,
    // Never log the actual tokens
    access_token: "[REDACTED]",
    refresh_token: "[REDACTED]",
    id_token: "[REDACTED]"
  })
END FUNCTION

// Sanitize URLs before logging
FUNCTION sanitize_url_for_logging(url: &Url) -> String
  sensitive_params <- ["code", "state", "token", "access_token",
                       "refresh_token", "client_secret", "code_verifier"]

  sanitized <- url.clone()

  IF sanitized.query().is_some() THEN
    new_query <- sanitized.query_pairs()
      .map(|(key, value)| {
        IF sensitive_params.contains(key.as_ref()) THEN
          (key.to_string(), "[REDACTED]".to_string())
        ELSE
          (key.to_string(), value.to_string())
        END IF
      })
      .collect::<Vec<_>>()

    sanitized.set_query(None)
    FOR (key, value) IN new_query DO
      sanitized.query_pairs_mut().append_pair(&key, &value)
    END FOR
  END IF

  RETURN sanitized.to_string()
END FUNCTION
```

### 4.4 Rate Limiting for Security

```
// Security-focused rate limiting
STRUCT SecurityRateLimits {
  // Failed auth attempts
  max_failed_auth_per_minute: u32,      // Default: 5
  failed_auth_lockout_duration: Duration, // Default: 15 min

  // State generation (potential DoS vector)
  max_state_generation_per_minute: u32, // Default: 100

  // Token operations
  max_token_requests_per_minute: u32,   // Default: 60
}

STRUCT SecurityRateLimiter {
  failed_auth_tracker: RwLock<HashMap<String, FailedAuthTracker>>,
  config: SecurityRateLimits
}

STRUCT FailedAuthTracker {
  count: u32,
  first_failure: Instant,
  locked_until: Option<Instant>
}

FUNCTION check_auth_rate_limit(&self, client_id: &str) -> Result<(), OAuth2Error>
  tracker <- self.failed_auth_tracker.read().get(client_id)

  IF tracker IS Some THEN
    t <- tracker.unwrap()

    // Check if locked out
    IF t.locked_until IS Some AND Instant::now() < t.locked_until.unwrap() THEN
      remaining <- t.locked_until.unwrap() - Instant::now()
      RETURN Error(NetworkError::RateLimited {
        retry_after: Some(remaining)
      })
    END IF
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION record_auth_failure(&self, client_id: &str)
  trackers <- self.failed_auth_tracker.write()
  tracker <- trackers.entry(client_id.to_string()).or_insert(FailedAuthTracker {
    count: 0,
    first_failure: Instant::now(),
    locked_until: None
  })

  // Reset if outside window
  IF Instant::now() - tracker.first_failure > Duration::from_secs(60) THEN
    tracker.count <- 0
    tracker.first_failure <- Instant::now()
  END IF

  tracker.count <- tracker.count + 1

  // Lockout if too many failures
  IF tracker.count >= self.config.max_failed_auth_per_minute THEN
    tracker.locked_until <- Some(Instant::now() + self.config.failed_auth_lockout_duration)
    log_warn("Client locked out due to failed auth attempts", {
      client_id: client_id,
      lockout_duration_secs: self.config.failed_auth_lockout_duration.as_secs()
    })
  END IF
END FUNCTION

FUNCTION record_auth_success(&self, client_id: &str)
  // Clear failed attempts on success
  self.failed_auth_tracker.write().remove(client_id)
END FUNCTION
```

---

## 5. Test Strategy

### 5.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Test Strategy Overview                                 │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ UNIT TESTS (London-School TDD)                                             │ │
│  │                                                                             │ │
│  │   Focus: Individual components in isolation with mocked dependencies        │ │
│  │   Coverage Target: 90%+                                                    │ │
│  │                                                                             │ │
│  │   • AuthorizationCodeFlow with MockHttpTransport, MockStateManager          │ │
│  │   • TokenManager with MockTokenStorage, MockHttpTransport                   │ │
│  │   • StateManager (pure functions)                                           │ │
│  │   • PkceGenerator (pure functions)                                          │ │
│  │   • Error mapping functions                                                 │ │
│  │   • Configuration validation                                                │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ INTEGRATION TESTS                                                          │ │
│  │                                                                             │ │
│  │   Focus: Component interactions with fake servers                           │ │
│  │   Coverage Target: Key flows                                               │ │
│  │                                                                             │ │
│  │   • Full authorization code flow against mock OAuth2 server                 │ │
│  │   • Token refresh cycle                                                     │ │
│  │   • Circuit breaker behavior under failures                                 │ │
│  │   • Rate limiter enforcement                                                │ │
│  │   • File-based storage persistence                                          │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CONTRACT TESTS                                                             │ │
│  │                                                                             │ │
│  │   Focus: Ensure mock implementations match real provider behavior           │ │
│  │   Frequency: Run against real providers periodically (not CI)              │ │
│  │                                                                             │ │
│  │   • Google OAuth2 contract                                                  │ │
│  │   • GitHub OAuth2 contract                                                  │ │
│  │   • Microsoft OAuth2 contract                                               │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ PROPERTY-BASED TESTS                                                       │ │
│  │                                                                             │ │
│  │   Focus: Invariants that should hold for any input                         │ │
│  │                                                                             │ │
│  │   • State generation always produces valid state                            │ │
│  │   • PKCE verifier/challenge relationship                                    │ │
│  │   • URL sanitization never loses critical info                              │ │
│  │   • Token serialization round-trip                                          │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ SECURITY TESTS                                                             │ │
│  │                                                                             │ │
│  │   Focus: Security properties and attack vectors                             │ │
│  │                                                                             │ │
│  │   • State parameter entropy                                                 │ │
│  │   • PKCE verifier entropy                                                   │ │
│  │   • No token leakage in logs                                                │ │
│  │   • Timing attack resistance                                                │ │
│  │   • Input validation (injection prevention)                                 │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Mock Factory Patterns

```
// Test fixture builder for OAuth2 testing
STRUCT OAuth2TestFixture {
  client: OAuth2Client,
  mock_transport: Arc<MockHttpTransport>,
  mock_storage: Arc<MockTokenStorage>,
  clock: MockClock
}

STRUCT OAuth2TestFixtureBuilder {
  config: OAuth2Config,
  transport_responses: Vec<MockResponse>,
  stored_tokens: HashMap<String, StoredTokens>,
  clock_time: Instant
}

IMPL OAuth2TestFixtureBuilder {
  FUNCTION new() -> OAuth2TestFixtureBuilder
    RETURN OAuth2TestFixtureBuilder {
      config: OAuth2Config::default(),
      transport_responses: vec![],
      stored_tokens: HashMap::new(),
      clock_time: Instant::now()
    }
  END FUNCTION

  FUNCTION with_provider(provider: ProviderConfig) -> Self
    self.config.provider <- provider
    RETURN self
  END FUNCTION

  FUNCTION with_successful_token_response(response: TokenResponse) -> Self
    self.transport_responses.push(MockResponse {
      status: 200,
      body: serde_json::to_vec(&response).unwrap()
    })
    RETURN self
  END FUNCTION

  FUNCTION with_error_response(status: u16, error: &str) -> Self
    self.transport_responses.push(MockResponse {
      status: status,
      body: format!(r#"{{"error":"{}"}}"#, error).into_bytes()
    })
    RETURN self
  END FUNCTION

  FUNCTION with_stored_token(key: String, tokens: StoredTokens) -> Self
    self.stored_tokens.insert(key, tokens)
    RETURN self
  END FUNCTION

  FUNCTION with_expired_token(key: String) -> Self
    tokens <- StoredTokens {
      access_token: SecretString::new("expired_token"),
      expires_at: Some(Instant::now() - Duration::from_secs(3600)),
      refresh_token: Some(SecretString::new("refresh_token")),
      ...
    }
    self.stored_tokens.insert(key, tokens)
    RETURN self
  END FUNCTION

  FUNCTION with_clock_at(time: Instant) -> Self
    self.clock_time <- time
    RETURN self
  END FUNCTION

  FUNCTION build() -> OAuth2TestFixture
    mock_transport <- Arc::new(MockHttpTransport::with_responses(
      self.transport_responses
    ))

    mock_storage <- Arc::new(MockTokenStorage::with_tokens(
      self.stored_tokens
    ))

    clock <- MockClock::at(self.clock_time)

    client <- OAuth2ClientBuilder::new(self.config)
      .with_transport(mock_transport.clone())
      .with_storage(mock_storage.clone())
      .with_clock(clock.clone())
      .build()
      .unwrap()

    RETURN OAuth2TestFixture {
      client: client,
      mock_transport: mock_transport,
      mock_storage: mock_storage,
      clock: clock
    }
  END FUNCTION
}

// Usage example
#[test]
async fn test_token_refresh_on_expiry() {
  fixture <- OAuth2TestFixtureBuilder::new()
    .with_expired_token("user1", expired_tokens)
    .with_successful_token_response(fresh_tokens)
    .build()

  token <- fixture.client.tokens().get_access_token("user1").await.unwrap()

  assert_eq!(token.token.expose_secret(), "fresh_access_token")
  fixture.mock_transport.assert_called_once()
  fixture.mock_storage.assert_stored("user1")
}
```

### 5.3 Test Scenarios

```
// Authorization Code Flow Tests
MODULE test_authorization_code_flow {

  #[test]
  fn builds_correct_authorization_url()

  #[test]
  fn includes_state_parameter_in_url()

  #[test]
  fn includes_all_scopes_in_url()

  #[test]
  fn handles_extra_params()

  #[test]
  async fn exchanges_code_for_tokens()

  #[test]
  async fn validates_state_on_callback()

  #[test]
  async fn rejects_mismatched_state()

  #[test]
  async fn handles_error_callback()

  #[test]
  async fn handles_access_denied()

  #[test]
  async fn retries_on_network_failure()

  #[test]
  async fn respects_circuit_breaker()
}

// PKCE Flow Tests
MODULE test_pkce_flow {

  #[test]
  fn generates_valid_pkce_verifier()

  #[test]
  fn verifier_meets_length_requirements()

  #[test]
  fn generates_correct_s256_challenge()

  #[test]
  fn stores_verifier_with_state()

  #[test]
  async fn includes_verifier_in_token_request()

  #[test]
  async fn handles_invalid_grant_on_wrong_verifier()
}

// Token Manager Tests
MODULE test_token_manager {

  #[test]
  async fn returns_valid_token()

  #[test]
  async fn refreshes_expiring_token()

  #[test]
  async fn refreshes_expired_token()

  #[test]
  async fn prevents_concurrent_refresh()

  #[test]
  async fn handles_refresh_failure()

  #[test]
  async fn clears_tokens()

  #[test]
  async fn force_refresh_ignores_expiry()
}

// Security Tests
MODULE test_security {

  #[test]
  fn state_has_sufficient_entropy()

  #[test]
  fn pkce_verifier_has_sufficient_entropy()

  #[test]
  fn tokens_not_in_debug_output()

  #[test]
  fn tokens_not_in_error_messages()

  #[test]
  fn state_comparison_is_constant_time()

  #[test]
  fn rejects_http_redirect_uri_in_production()

  #[test]
  fn validates_redirect_uri_format()
}

// Edge Case Tests
MODULE test_edge_cases {

  #[test]
  async fn handles_missing_expires_in()

  #[test]
  async fn handles_negative_expires_in()

  #[test]
  async fn caps_very_large_expires_in()

  #[test]
  async fn handles_refresh_without_new_refresh_token()

  #[test]
  async fn handles_scope_reduction()

  #[test]
  async fn handles_empty_scope_response()
}
```

---

## 6. Provider-Specific Handling

### 6.1 Provider Quirks

```
STRUCT ProviderQuirks {
  // Token endpoint quirks
  requires_basic_auth: bool,           // Some require, some forbid
  accepts_json_body: bool,             // Most want form-urlencoded
  token_in_query_for_device: bool,     // GitHub quirk

  // Response quirks
  expires_in_as_string: bool,          // Some return "3600" instead of 3600
  scope_delimiter: String,             // Usually " ", sometimes ","
  includes_token_type: bool,           // Some omit, assume "Bearer"

  // Authorization quirks
  state_required: bool,                // Most require, some don't
  pkce_required: bool,                 // Increasingly required
  prompt_param_name: Option<String>,   // "prompt" vs "approval_prompt"

  // Device flow quirks
  device_code_param_name: String,      // "device_code" vs "code"
  device_grant_type: String,           // Standard vs custom

  // Discovery quirks
  discovery_path: String,              // Usually /.well-known/openid-configuration
  issuer_trailing_slash: bool,         // Some include, some don't
}

CONST GOOGLE_QUIRKS: ProviderQuirks = ProviderQuirks {
  requires_basic_auth: false,
  accepts_json_body: false,
  token_in_query_for_device: false,
  expires_in_as_string: false,
  scope_delimiter: " ",
  includes_token_type: true,
  state_required: true,
  pkce_required: false,  // Recommended but not required
  prompt_param_name: Some("prompt"),
  device_code_param_name: "device_code",
  device_grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  discovery_path: "/.well-known/openid-configuration",
  issuer_trailing_slash: false
}

CONST GITHUB_QUIRKS: ProviderQuirks = ProviderQuirks {
  requires_basic_auth: false,
  accepts_json_body: true,   // GitHub accepts JSON
  token_in_query_for_device: true,  // GitHub quirk
  expires_in_as_string: false,
  scope_delimiter: ",",      // GitHub uses comma
  includes_token_type: true,
  state_required: true,
  pkce_required: false,
  prompt_param_name: None,   // No prompt parameter
  device_code_param_name: "device_code",
  device_grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  discovery_path: "",        // GitHub doesn't support OIDC discovery
  issuer_trailing_slash: false
}

CONST MICROSOFT_QUIRKS: ProviderQuirks = ProviderQuirks {
  requires_basic_auth: false,
  accepts_json_body: false,
  token_in_query_for_device: false,
  expires_in_as_string: false,
  scope_delimiter: " ",
  includes_token_type: true,
  state_required: true,
  pkce_required: true,       // Required for public clients
  prompt_param_name: Some("prompt"),
  device_code_param_name: "device_code",
  device_grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  discovery_path: "/v2.0/.well-known/openid-configuration",
  issuer_trailing_slash: true  // Microsoft includes trailing slash
}

FUNCTION get_quirks_for_provider(issuer: &str) -> ProviderQuirks
  IF issuer.contains("google") THEN
    RETURN GOOGLE_QUIRKS
  ELSE IF issuer.contains("github") THEN
    RETURN GITHUB_QUIRKS
  ELSE IF issuer.contains("microsoft") OR issuer.contains("login.microsoftonline") THEN
    RETURN MICROSOFT_QUIRKS
  ELSE
    RETURN ProviderQuirks::default()
  END IF
END FUNCTION
```

### 6.2 Provider-Specific Response Parsing

```
FUNCTION parse_token_response_with_quirks(
  body: &[u8],
  quirks: &ProviderQuirks
) -> Result<TokenResponse, OAuth2Error>

  raw <- parse_json::<serde_json::Value>(body)?

  // Handle expires_in as string (EC-PR-001)
  expires_in <- IF quirks.expires_in_as_string THEN
    raw.get("expires_in")
      .and_then(|v| v.as_str())
      .and_then(|s| s.parse::<u64>().ok())
  ELSE
    raw.get("expires_in")
      .and_then(|v| v.as_u64())
  END IF

  // Handle scope delimiter (EC-PR-002)
  scope <- raw.get("scope")
    .and_then(|v| v.as_str())
    .map(|s| {
      IF quirks.scope_delimiter != " " THEN
        s.replace(&quirks.scope_delimiter, " ")
      ELSE
        s.to_string()
      END IF
    })

  // Handle missing token_type (EC-PR-003)
  token_type <- raw.get("token_type")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string())
    .unwrap_or_else(|| {
      IF NOT quirks.includes_token_type THEN
        "Bearer".to_string()
      ELSE
        "Bearer".to_string()  // Default fallback
      END IF
    })

  access_token <- raw.get("access_token")
    .and_then(|v| v.as_str())
    .ok_or_else(|| ProtocolError::MissingField { field: "access_token" })?

  RETURN Ok(TokenResponse {
    access_token: access_token.to_string(),
    token_type: token_type,
    expires_in: expires_in,
    refresh_token: raw.get("refresh_token").and_then(|v| v.as_str()).map(String::from),
    scope: scope,
    id_token: raw.get("id_token").and_then(|v| v.as_str()).map(String::from),
    extra: HashMap::new()
  })
END FUNCTION
```

---

## 7. Operational Considerations

### 7.1 Monitoring and Alerting

```
STRUCT MonitoringConfig {
  // Alert thresholds
  token_refresh_failure_rate_threshold: f64,  // Default: 0.1 (10%)
  circuit_breaker_open_duration_threshold: Duration,
  rate_limit_hit_rate_threshold: f64,

  // SLO definitions
  token_acquisition_p99_latency: Duration,    // Default: 5s
  token_refresh_p99_latency: Duration,        // Default: 3s
}

STRUCT HealthCheck {
  name: String,
  status: HealthStatus,
  details: HashMap<String, String>,
  last_check: Instant
}

ENUM HealthStatus {
  Healthy,
  Degraded,
  Unhealthy
}

FUNCTION check_oauth2_health() -> Vec<HealthCheck>
  checks <- []

  // Check circuit breaker states
  FOR (service, cb) IN circuit_breakers DO
    status <- MATCH cb.state()
      CASE CircuitState::Closed => HealthStatus::Healthy
      CASE CircuitState::HalfOpen => HealthStatus::Degraded
      CASE CircuitState::Open => HealthStatus::Unhealthy
    END MATCH

    checks.push(HealthCheck {
      name: format("circuit_breaker.{}", service),
      status: status,
      details: hashmap!{
        "state" => cb.state().to_string(),
        "failure_count" => cb.failure_count().to_string()
      },
      last_check: Instant::now()
    })
  END FOR

  // Check token storage
  TRY
    _ <- token_storage.list_keys().await
    checks.push(HealthCheck {
      name: "token_storage",
      status: HealthStatus::Healthy,
      details: hashmap!{},
      last_check: Instant::now()
    })
  CATCH e
    checks.push(HealthCheck {
      name: "token_storage",
      status: HealthStatus::Unhealthy,
      details: hashmap!{ "error" => e.to_string() },
      last_check: Instant::now()
    })
  END TRY

  // Check discovery cache
  discovery_age <- discovery_cache.oldest_entry_age()
  IF discovery_age > Duration::from_hours(24) THEN
    checks.push(HealthCheck {
      name: "discovery_cache",
      status: HealthStatus::Degraded,
      details: hashmap!{ "oldest_entry_age_hours" => (discovery_age.as_secs() / 3600).to_string() },
      last_check: Instant::now()
    })
  ELSE
    checks.push(HealthCheck {
      name: "discovery_cache",
      status: HealthStatus::Healthy,
      details: hashmap!{},
      last_check: Instant::now()
    })
  END IF

  RETURN checks
END FUNCTION
```

### 7.2 Operational Runbook

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Operational Runbook                                    │
│                                                                                  │
│  SCENARIO: High token refresh failure rate                                       │
│  ─────────────────────────────────────────                                       │
│  Symptoms: oauth2.token.refreshes{success=false} increasing                      │
│                                                                                  │
│  1. Check provider status page                                                   │
│  2. Check circuit breaker state (should be open if provider down)                │
│  3. Check logs for specific error codes:                                         │
│     • invalid_grant → Refresh tokens expired, users need to re-auth              │
│     • invalid_client → Credentials may have been rotated                         │
│     • server_error → Provider issue, wait for recovery                           │
│  4. If invalid_client, verify credentials haven't changed                        │
│  5. If persistent, consider increasing refresh threshold to reduce load          │
│                                                                                  │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  SCENARIO: Circuit breaker stuck open                                            │
│  ─────────────────────────────────────                                           │
│  Symptoms: oauth2.circuit_breaker.state{state=open} for extended period          │
│                                                                                  │
│  1. Check provider connectivity (curl token endpoint)                            │
│  2. Check for network issues (DNS, firewall)                                     │
│  3. If provider is healthy, consider manual circuit breaker reset                │
│  4. Review failure threshold configuration                                       │
│  5. Check if provider changed IPs (DNS cache issue)                              │
│                                                                                  │
│  Manual reset: POST /admin/oauth2/circuit-breaker/reset                          │
│                                                                                  │
│  ─────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  SCENARIO: Token storage corruption                                              │
│  ───────────────────────────────────                                             │
│  Symptoms: StorageError::CorruptedData in logs                                   │
│                                                                                  │
│  1. Check disk space and permissions                                             │
│  2. Check for concurrent write issues                                            │
│  3. If file storage, check for backup (.bak file)                                │
│  4. If no backup, users will need to re-authenticate                             │
│  5. Consider migrating to more robust storage (Redis, database)                  │
│                                                                                  │
│  Recovery: DELETE /admin/oauth2/storage/{key} then re-auth                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. API Ergonomics

### 8.1 Fluent Builder APIs

```
// Fluent configuration for common use cases
IMPL OAuth2ConfigBuilder {
  // Quick setup for Google
  FUNCTION for_google(client_id: String, client_secret: String) -> Self
    Self::new()
      .provider(WellKnownProviders::google())
      .client_id(client_id)
      .client_secret(client_secret)
      .scopes(vec!["openid", "profile", "email"])
  END FUNCTION

  // Quick setup for GitHub
  FUNCTION for_github(client_id: String, client_secret: String) -> Self
    Self::new()
      .provider(WellKnownProviders::github())
      .client_id(client_id)
      .client_secret(client_secret)
  END FUNCTION

  // Quick setup from OIDC discovery
  ASYNC FUNCTION from_issuer(issuer: String, client_id: String, client_secret: String) -> Result<Self, OAuth2Error>
    discovery <- fetch_discovery(issuer).await?
    RETURN Ok(Self::new()
      .provider(ProviderConfig::from_discovery(discovery))
      .client_id(client_id)
      .client_secret(client_secret))
  END FUNCTION
}

// Fluent authorization params
IMPL AuthorizationParams {
  FUNCTION new(redirect_uri: Url) -> Self
    Self {
      redirect_uri: redirect_uri,
      scopes: vec![],
      state: None,
      ..Default::default()
    }
  END FUNCTION

  FUNCTION with_scope(scope: &str) -> Self
    self.scopes.push(scope.to_string())
    self
  END FUNCTION

  FUNCTION with_scopes(scopes: Vec<&str>) -> Self
    self.scopes.extend(scopes.into_iter().map(String::from))
    self
  END FUNCTION

  FUNCTION prompt_login() -> Self
    self.prompt <- Some(Prompt::Login)
    self
  END FUNCTION

  FUNCTION prompt_consent() -> Self
    self.prompt <- Some(Prompt::Consent)
    self
  END FUNCTION

  FUNCTION with_login_hint(hint: &str) -> Self
    self.login_hint <- Some(hint.to_string())
    self
  END FUNCTION
}
```

### 8.2 Convenience Methods

```
// High-level convenience methods on OAuth2Client
IMPL OAuth2Client {
  // One-liner for getting a usable token header
  ASYNC FUNCTION get_bearer_header(&self, key: &str) -> Result<String, OAuth2Error>
    token <- self.tokens().get_access_token(key.to_string()).await?
    RETURN Ok(token.as_bearer_header())
  END FUNCTION

  // Quick check if user is authenticated
  ASYNC FUNCTION is_authenticated(&self, key: &str) -> bool
    TRY
      tokens <- self.tokens().get_stored_tokens(key.to_string()).await
      IF tokens IS Some THEN
        t <- tokens.unwrap()
        RETURN NOT t.is_expired() OR t.has_refresh_token()
      END IF
      RETURN false
    CATCH
      RETURN false
    END TRY
  END FUNCTION

  // Get authorization URL with sensible defaults
  FUNCTION quick_auth_url(&self, redirect_uri: &str) -> Result<AuthorizationUrl, OAuth2Error>
    self.authorization_code_pkce().build_authorization_url(
      PkceAuthorizationParams::new(Url::parse(redirect_uri)?)
    )
  END FUNCTION

  // Complete callback handling in one call
  ASYNC FUNCTION complete_authorization(
    &self,
    callback_url: &str,
    storage_key: &str
  ) -> Result<TokenResponse, OAuth2Error>
    callback <- CallbackParams::from_url(callback_url)?
    tokens <- self.authorization_code_pkce().handle_callback(callback).await?
    self.tokens().store_tokens(storage_key.to_string(), tokens.clone()).await?
    RETURN Ok(tokens)
  END FUNCTION
}
```

### 8.3 Error Handling Helpers

```
// Extension trait for easier error handling
TRAIT OAuth2ResultExt<T> {
  // Check if error is recoverable through re-authentication
  FUNCTION needs_reauth(&self) -> bool

  // Check if error is transient and should be retried
  FUNCTION is_transient(&self) -> bool

  // Get user-friendly error message
  FUNCTION user_message(&self) -> Option<String>
}

IMPL<T> OAuth2ResultExt<T> FOR Result<T, OAuth2Error> {
  FUNCTION needs_reauth(&self) -> bool
    MATCH self {
      Err(OAuth2Error::Token(TokenError::Expired { .. })) => true,
      Err(OAuth2Error::Token(TokenError::NoRefreshToken { .. })) => true,
      Err(OAuth2Error::Provider(ProviderError::InvalidGrant { .. })) => true,
      Err(OAuth2Error::Authorization(AuthorizationError::AccessDenied { .. })) => true,
      _ => false
    }
  END FUNCTION

  FUNCTION is_transient(&self) -> bool
    MATCH self {
      Err(OAuth2Error::Network(NetworkError::Timeout)) => true,
      Err(OAuth2Error::Network(NetworkError::ConnectionFailed { .. })) => true,
      Err(OAuth2Error::Network(NetworkError::RateLimited { .. })) => true,
      Err(OAuth2Error::Provider(ProviderError::ServerError { .. })) => true,
      Err(OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { .. })) => true,
      _ => false
    }
  END FUNCTION

  FUNCTION user_message(&self) -> Option<String>
    MATCH self {
      Ok(_) => None,
      Err(e) => Some(e.user_friendly_message())
    }
  END FUNCTION
}

IMPL OAuth2Error {
  FUNCTION user_friendly_message(&self) -> String
    MATCH self {
      OAuth2Error::Token(TokenError::Expired { .. }) =>
        "Your session has expired. Please sign in again.",

      OAuth2Error::Authorization(AuthorizationError::AccessDenied { .. }) =>
        "Access was denied. Please try signing in again and grant the requested permissions.",

      OAuth2Error::Network(NetworkError::Timeout) =>
        "The request timed out. Please check your connection and try again.",

      OAuth2Error::Provider(ProviderError::ServerError { .. }) =>
        "The authentication service is temporarily unavailable. Please try again later.",

      _ => "An authentication error occurred. Please try again."
    }
  END FUNCTION
}
```

---

## 9. Documentation Requirements

### 9.1 API Documentation

```
/// OAuth2 client for authenticating with OAuth2/OIDC providers.
///
/// # Example
///
/// ```rust
/// use integrations_oauth2::{OAuth2ConfigBuilder, WellKnownProviders};
///
/// let client = OAuth2ConfigBuilder::new()
///     .provider(WellKnownProviders::google())
///     .client_id("your-client-id")
///     .client_secret("your-client-secret")
///     .scopes(vec!["openid", "profile"])
///     .build()?;
///
/// // Build authorization URL
/// let auth_url = client.authorization_code_pkce()
///     .build_authorization_url(params)?;
///
/// // After user authorizes, handle callback
/// let tokens = client.authorization_code_pkce()
///     .handle_callback(callback).await?;
///
/// // Get access token (auto-refreshes if needed)
/// let token = client.tokens()
///     .get_access_token("user-123").await?;
/// ```
///
/// # Thread Safety
///
/// `OAuth2Client` is `Send + Sync` and can be safely shared across threads.
/// All operations are thread-safe.
///
/// # Token Storage
///
/// By default, tokens are stored in memory. For production use, consider
/// using file-based storage with encryption or implementing a custom
/// `TokenStorage` for Redis/database storage.
```

### 9.2 Migration Guides

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Migration Guide: v0.x to v1.0                                │
│                                                                                  │
│  BREAKING CHANGES                                                                │
│  ────────────────                                                                │
│                                                                                  │
│  1. OAuth2Client is now a trait, not a struct                                    │
│                                                                                  │
│     Before:                                                                      │
│       let client = OAuth2Client::new(config)?;                                  │
│                                                                                  │
│     After:                                                                       │
│       let client = create_oauth2_client(config)?;                               │
│                                                                                  │
│  2. Flow methods now return trait references                                     │
│                                                                                  │
│     Before:                                                                      │
│       client.authorization_code_flow().build_url(...)                           │
│                                                                                  │
│     After:                                                                       │
│       client.authorization_code().build_authorization_url(...)                  │
│                                                                                  │
│  3. TokenResponse fields are now non-optional where required                     │
│                                                                                  │
│     Before:                                                                      │
│       response.access_token.unwrap()                                            │
│                                                                                  │
│     After:                                                                       │
│       response.access_token // Always present                                   │
│                                                                                  │
│  4. Error types restructured into hierarchy                                      │
│                                                                                  │
│     Before:                                                                      │
│       OAuth2Error::TokenExpired                                                 │
│                                                                                  │
│     After:                                                                       │
│       OAuth2Error::Token(TokenError::Expired { key })                           │
│                                                                                  │
│  DEPRECATED                                                                      │
│  ──────────                                                                      │
│                                                                                  │
│  • `OAuth2Client::new()` - Use `create_oauth2_client()` instead                 │
│  • `implicit_flow()` - Implicit grant is deprecated per OAuth2.1                 │
│  • `password_flow()` - Resource owner password is deprecated                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Migration and Compatibility

### 10.1 Version Compatibility Matrix

| OAuth2 Module | Rust | TypeScript | integrations-* |
|---------------|------|------------|----------------|
| 1.0.x | 1.70+ | 5.0+ | 1.x |
| 1.1.x | 1.75+ | 5.0+ | 1.x |

### 10.2 Feature Flags

```toml
# Cargo.toml
[features]
default = ["rustls-tls"]

# TLS implementations
rustls-tls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]

# Optional features
file-storage = []
encryption = ["aes-gcm", "rand"]
jwt-validation = ["jsonwebtoken"]

# Provider presets
google = []
github = []
microsoft = []
all-providers = ["google", "github", "microsoft"]
```

### 10.3 Backward Compatibility Guarantees

```
COMPATIBILITY POLICY
────────────────────

STABLE (no breaking changes in minor versions):
  • Public trait signatures (OAuth2Client, flows, TokenStorage)
  • Public struct fields marked #[non_exhaustive]
  • Error enum variants
  • Configuration struct fields

UNSTABLE (may change in minor versions):
  • Internal module structure
  • Default configuration values
  • Metric names and labels
  • Log message formats

DEPRECATED FEATURES:
  • Will emit deprecation warnings for at least 2 minor versions
  • Removal only in major versions
  • Migration guide provided for all deprecations
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial refinement document |

---

## Summary

This refinement document addresses:

1. **Edge Cases**: Comprehensive handling for token lifecycle, authorization flow, network, device flow, and storage edge cases
2. **Error Handling**: Error recovery matrix, context enrichment, graceful degradation strategies
3. **Performance**: Connection pooling, tiered caching, lazy initialization, batch operations, memory optimization
4. **Security**: Input validation, timing attack prevention, token exposure prevention, security rate limiting
5. **Test Strategy**: London-School TDD approach with mock factories, test scenarios, and coverage targets
6. **Provider Handling**: Provider-specific quirks and response parsing
7. **Operations**: Health checks, monitoring, alerting thresholds, and runbook
8. **API Ergonomics**: Fluent builders, convenience methods, error handling helpers
9. **Documentation**: API docs, migration guides
10. **Compatibility**: Version matrix, feature flags, backward compatibility policy

All refinements maintain compatibility with the London-School TDD principles established in previous phases.
