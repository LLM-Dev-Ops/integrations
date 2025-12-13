# Azure Key Vault Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure/key-vault`

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Implementation Notes |
|-------------|--------|---------------------|
| SecretsService (9 operations) | ✅ | All CRUD + backup/restore + soft-delete recovery |
| KeysService (12 operations) | ✅ | CRUD + crypto ops + wrap/unwrap |
| CertificatesService (4 operations) | ✅ | Get, list, versions, policy |
| Version support | ✅ | Optional version parameter on all gets |
| Caching with TTL | ✅ | Configurable TTL, refresh-ahead, LRU eviction |
| Secret value protection | ✅ | SecretString with zeroization |
| Rotation event hooks | ✅ | RotationHandler trait with callbacks |
| Expiry monitoring | ✅ | Configurable thresholds, metric emission |
| Shared auth delegation | ✅ | Uses azure/auth credential chain |
| Shared resilience | ✅ | Retry, circuit breaker, rate limiting |
| Shared observability | ✅ | Metrics, traces, structured logging |
| Simulation mode | ✅ | MockKeyVaultClient with replay |

### 1.2 Thin Adapter Compliance

| Check | Status | Notes |
|-------|--------|-------|
| No vault provisioning logic | ✅ | Only accesses existing vaults |
| No access policy management | ✅ | Respects existing RBAC |
| No HSM configuration | ✅ | Uses vault as configured |
| Delegates authentication | ✅ | azure/auth handles credentials |
| Delegates resilience | ✅ | shared/resilience handles retry |
| Delegates observability | ✅ | shared/observability handles metrics |
| Key Vault-specific logic only | ✅ | Only API operations and caching |

---

## 2. Edge Cases Analysis

### 2.1 Secret Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Secret not found** | Return `SecretNotFound` error, cache negative result for 30s |
| **Secret disabled** | Return `ResourceDisabled` error, do not cache |
| **Secret expired** | Return value with warning log, emit `keyvault_secret_expired` metric |
| **Secret not yet valid (nbf)** | Return `SecretNotYetValid` error with activation time |
| **Secret soft-deleted** | Return `ResourceDeleted` error with recovery instructions |
| **Secret value empty** | Valid case - return empty SecretString |
| **Secret value max size (25KB)** | Validate on set, return `SecretTooLarge` on exceed |
| **Secret name invalid chars** | Validate before request, return `InvalidSecretName` |
| **Version not found** | Return `VersionNotFound` with available versions hint |
| **Concurrent version creation** | Last write wins (Azure behavior), cache invalidated |

```rust
// Expired secret handling
fn check_secret_validity(properties: &SecretProperties) -> Result<(), KeyVaultError> {
    let now = Utc::now();

    // Check not-before
    if let Some(nbf) = properties.not_before {
        if now < nbf {
            return Err(KeyVaultError::SecretNotYetValid {
                name: properties.name.clone(),
                valid_from: nbf,
            });
        }
    }

    // Check expiry - warn but allow access
    if let Some(exp) = properties.expires {
        if now > exp {
            log_warn!("Accessing expired secret: {}", properties.name);
            emit_metric("keyvault_secret_expired", 1, &[
                ("secret_name", &properties.name),
            ]);
        }
    }

    Ok(())
}
```

### 2.2 Key Operation Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Key operation not allowed** | Check `key_ops` before call, return `InvalidKeyOperation` |
| **Algorithm mismatch** | Validate algorithm against key type, return `UnsupportedAlgorithm` |
| **Plaintext too large for RSA** | Return `PlaintextTooLarge` with max size |
| **Decryption failure** | Return `DecryptionFailed` (no detail to prevent oracle) |
| **Invalid signature** | Return `VerifyResult { valid: false }`, not error |
| **Key disabled** | Return `ResourceDisabled` error |
| **HSM key with software operation** | Let Azure return error, map appropriately |
| **Key rotation during operation** | Use version-pinned operations for consistency |

```rust
// Algorithm validation for encrypt
fn validate_encrypt_algorithm(key: &Key, algorithm: EncryptionAlgorithm) -> Result<(), KeyVaultError> {
    // Check key supports encrypt operation
    if !key.properties.key_ops.contains(&KeyOperation::Encrypt) {
        return Err(KeyVaultError::InvalidKeyOperation {
            key: key.name.clone(),
            operation: "encrypt".to_string(),
        });
    }

    // Check algorithm compatibility with key type
    match (&key.properties.key_type, &algorithm) {
        (KeyType::Rsa | KeyType::RsaHsm, EncryptionAlgorithm::RsaOaep) => Ok(()),
        (KeyType::Rsa | KeyType::RsaHsm, EncryptionAlgorithm::RsaOaep256) => Ok(()),
        (KeyType::Oct | KeyType::OctHsm, EncryptionAlgorithm::A256Gcm) => Ok(()),
        _ => Err(KeyVaultError::UnsupportedAlgorithm {
            algorithm: format!("{:?} with {:?}", algorithm, key.properties.key_type),
        }),
    }
}
```

### 2.3 Certificate Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Certificate expired** | Return with warning, include expiry in properties |
| **Certificate chain incomplete** | Return available data, log warning |
| **Private key not exportable** | Properties indicate, no attempt to export |
| **Certificate pending issuance** | Return `CertificatePending` with status |

### 2.4 Cache Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Cache full** | LRU eviction, log eviction count |
| **Stale cache during refresh** | Serve stale while refresh in progress |
| **Refresh failure** | Keep stale entry, retry on next access |
| **Concurrent cache writes** | Last write wins, use atomic operations |
| **Cache key collision** | Include vault URL in key to prevent collision |
| **Negative cache (not found)** | Cache for shorter TTL (30s), prevent hammering |

```rust
// Negative caching implementation
async fn get_secret_with_negative_cache(&self, name: &str) -> Result<Secret, KeyVaultError> {
    let cache_key = self.build_cache_key("secret", name, None);

    // Check positive cache
    if let Some(secret) = self.cache.get(&cache_key) {
        return Ok(secret);
    }

    // Check negative cache
    let negative_key = format!("{}:negative", cache_key);
    if self.cache.contains(&negative_key) {
        return Err(KeyVaultError::SecretNotFound { name: name.to_string() });
    }

    // Fetch from API
    match self.fetch_secret(name).await {
        Ok(secret) => {
            self.cache.set(&cache_key, secret.clone(), self.config.cache_ttl);
            Ok(secret)
        }
        Err(KeyVaultError::SecretNotFound { .. }) => {
            // Cache negative result for shorter duration
            self.cache.set(&negative_key, (), Duration::from_secs(30));
            Err(KeyVaultError::SecretNotFound { name: name.to_string() })
        }
        Err(e) => Err(e),
    }
}
```

### 2.5 Authentication Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **Token expired during request** | Catch 401, refresh token, retry once |
| **Managed identity unavailable** | Fall through credential chain, clear error if all fail |
| **Token refresh fails** | Return `AuthenticationFailed` with cause |
| **Wrong tenant** | Return `AuthenticationFailed` with tenant hint |
| **Insufficient permissions** | Return `AccessDenied` with required permission |

```rust
// Token refresh on 401
async fn execute_with_auth_retry<T>(&self, request: Request) -> Result<T, KeyVaultError> {
    let response = self.transport.execute(request.clone()).await?;

    if response.status() == 401 {
        // Token may have expired, refresh and retry once
        self.credential.refresh_token().await?;

        let retry_response = self.transport.execute(request).await?;

        if retry_response.status() == 401 {
            return Err(KeyVaultError::AuthenticationFailed {
                message: "Authentication failed after token refresh".to_string(),
            });
        }

        return self.parse_response(retry_response).await;
    }

    self.parse_response(response).await
}
```

### 2.6 Rate Limiting Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| **429 without Retry-After** | Default to 1 second, exponential backoff |
| **429 with long Retry-After** | Cap at max_retry_delay (60s), return error if exceeded |
| **Burst of 429s** | Circuit breaker opens after threshold |
| **Different limits per operation** | Track separately for crypto vs management ops |

```rust
// Rate limit handling with caps
fn calculate_retry_delay(response: &Response, attempt: u32) -> Result<Duration, KeyVaultError> {
    const MAX_RETRY_DELAY: Duration = Duration::from_secs(60);
    const DEFAULT_DELAY: Duration = Duration::from_secs(1);

    let retry_after = response
        .headers()
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_DELAY);

    // Apply exponential backoff for subsequent attempts
    let backoff_delay = DEFAULT_DELAY * 2u32.pow(attempt.saturating_sub(1));
    let total_delay = retry_after.max(backoff_delay);

    if total_delay > MAX_RETRY_DELAY {
        return Err(KeyVaultError::RateLimited {
            retry_after_ms: total_delay.as_millis() as u64,
        });
    }

    Ok(total_delay)
}
```

---

## 3. Performance Optimizations

### 3.1 Caching Optimizations

| Optimization | Implementation |
|--------------|----------------|
| **Refresh-ahead** | Trigger background refresh at 80% TTL |
| **Batch cache warming** | Warm cache on startup with list operations |
| **Adaptive TTL** | Longer TTL for stable secrets, shorter for frequently rotated |
| **Memory-efficient storage** | Store compressed for large secrets |

```rust
// Refresh-ahead implementation
async fn get_with_refresh_ahead(&self, key: &str) -> Option<T> {
    let entry = self.entries.get(key)?;

    if entry.should_refresh(0.8) && !entry.refresh_in_progress.swap(true, Ordering::SeqCst) {
        // Spawn background refresh
        let cache = self.clone();
        let key = key.to_string();
        tokio::spawn(async move {
            if let Ok(new_value) = cache.fetch_fresh(&key).await {
                cache.set(&key, new_value, cache.default_ttl);
            }
            cache.entries.get(&key).map(|e| e.refresh_in_progress.store(false, Ordering::SeqCst));
        });
    }

    Some(entry.value.clone())
}
```

### 3.2 Connection Optimizations

| Optimization | Implementation |
|--------------|----------------|
| **Connection pooling** | Reuse HTTP connections per vault |
| **Keep-alive** | Enable HTTP keep-alive for connection reuse |
| **Parallel requests** | Support concurrent operations with connection pool |

### 3.3 Serialization Optimizations

| Optimization | Implementation |
|--------------|----------------|
| **Zero-copy parsing** | Use `serde` with borrowing where possible |
| **Lazy deserialization** | Only parse needed fields for list operations |
| **Pre-allocated buffers** | Reuse buffers for base64 encoding/decoding |

---

## 4. Error Recovery Strategies

### 4.1 Transient Error Recovery

| Error Type | Recovery Strategy |
|------------|-------------------|
| `RateLimited` | Wait for Retry-After, exponential backoff |
| `ServiceUnavailable` | Retry with exponential backoff (max 3 attempts) |
| `Timeout` | Retry once with same timeout |
| `ConnectionError` | Retry with backoff, check network |

### 4.2 Non-Recoverable Errors

| Error Type | Handling |
|------------|----------|
| `AuthenticationFailed` | Fail fast, log for investigation |
| `AccessDenied` | Fail fast, include required permission in error |
| `SecretNotFound` | Fail fast, cache negative result |
| `InvalidKeyOperation` | Fail fast, validation error |

### 4.3 Partial Failure Recovery

```rust
// Batch operation with partial failure handling
async fn get_secrets_batch(&self, names: &[&str]) -> BatchResult<Secret> {
    let mut results = BatchResult::new();

    // Use concurrent requests with limit
    let semaphore = Arc::new(Semaphore::new(10));
    let futures: Vec<_> = names.iter().map(|name| {
        let sem = semaphore.clone();
        let name = name.to_string();
        async move {
            let _permit = sem.acquire().await;
            (name.clone(), self.get_secret(&name, None).await)
        }
    }).collect();

    let outcomes = futures::future::join_all(futures).await;

    for (name, result) in outcomes {
        match result {
            Ok(secret) => results.successes.push(secret),
            Err(e) => results.failures.push((name, e)),
        }
    }

    results
}
```

---

## 5. Security Hardening

### 5.1 Secret Value Protection

| Control | Implementation |
|---------|----------------|
| **Memory protection** | SecretString with zeroization on drop |
| **No logging** | Debug/Display impl returns "[REDACTED]" |
| **No error inclusion** | Error messages never include secret values |
| **Trace masking** | Span attributes exclude values |
| **Secure comparison** | Constant-time comparison for secret equality |

```rust
// Secure secret comparison
impl PartialEq for SecretString {
    fn eq(&self, other: &Self) -> bool {
        use subtle::ConstantTimeEq;
        self.expose_secret()
            .as_bytes()
            .ct_eq(other.expose_secret().as_bytes())
            .into()
    }
}
```

### 5.2 Input Validation

| Input | Validation |
|-------|------------|
| **Secret name** | 1-127 chars, alphanumeric + hyphen, no leading/trailing hyphen |
| **Secret value** | Max 25KB |
| **Key name** | Same as secret name |
| **Algorithm** | Must be in allowed enum values |
| **Vault URL** | Must match `https://*.vault.azure.net` pattern |

```rust
// Vault URL validation
fn validate_vault_url(url: &str) -> Result<(), KeyVaultError> {
    let parsed = Url::parse(url).map_err(|_| KeyVaultError::InvalidConfiguration {
        message: "Invalid vault URL format".to_string(),
    })?;

    if parsed.scheme() != "https" {
        return Err(KeyVaultError::InvalidConfiguration {
            message: "Vault URL must use HTTPS".to_string(),
        });
    }

    let host = parsed.host_str().ok_or_else(|| KeyVaultError::InvalidConfiguration {
        message: "Vault URL must have a host".to_string(),
    })?;

    if !host.ends_with(".vault.azure.net") {
        return Err(KeyVaultError::InvalidConfiguration {
            message: "Vault URL must end with .vault.azure.net".to_string(),
        });
    }

    Ok(())
}
```

### 5.3 Audit Logging

| Event | Log Level | Attributes |
|-------|-----------|------------|
| Secret accessed | INFO | secret_name, version, cache_hit |
| Secret modified | INFO | secret_name, operation |
| Key operation | INFO | key_name, operation, algorithm |
| Access denied | WARN | resource, principal (if available) |
| Authentication failure | ERROR | error_type, vault |

```rust
// Audit log entry (no secret values)
fn log_secret_access(name: &str, version: Option<&str>, cache_hit: bool) {
    info!(
        target: "audit",
        event = "secret_accessed",
        secret_name = name,
        version = version.unwrap_or("latest"),
        cache_hit = cache_hit,
        "Secret accessed"
    );
}
```

---

## 6. Testing Strategy

### 6.1 Unit Test Coverage

| Component | Test Cases |
|-----------|------------|
| **SecretsService** | Get (cached/uncached), set, list, delete, backup/restore |
| **KeysService** | Create, get, encrypt/decrypt, sign/verify, wrap/unwrap |
| **CertificatesService** | Get, list, get_policy |
| **Cache** | TTL expiration, LRU eviction, refresh-ahead, invalidation |
| **Error mapping** | All HTTP status codes, error response parsing |
| **Validation** | Valid/invalid names, size limits, algorithms |

### 6.2 Integration Test Scenarios

| Scenario | Test Steps |
|----------|------------|
| **Secret lifecycle** | Create → Get → Update → List versions → Delete → Recover |
| **Key crypto round-trip** | Create key → Encrypt → Decrypt → Verify match |
| **Sign/Verify round-trip** | Create key → Sign → Verify → Assert valid |
| **Cache behavior** | Get → Verify cached → Wait TTL → Verify refreshed |
| **Error handling** | Mock 404, 403, 429, 500 → Verify correct error types |
| **Retry behavior** | Mock 429 → Verify retry with backoff → Success |
| **Circuit breaker** | Mock 5x 500 → Verify circuit opens → Verify fail fast |

### 6.3 Test Fixtures

```json
// fixtures/secrets/get_secret_response.json
{
  "value": "my-secret-value",
  "id": "https://myvault.vault.azure.net/secrets/my-secret/abc123",
  "attributes": {
    "enabled": true,
    "created": 1702483200,
    "updated": 1702483200,
    "recoveryLevel": "Recoverable+Purgeable"
  },
  "tags": {
    "environment": "production"
  }
}

// fixtures/errors/rate_limited.json
{
  "error": {
    "code": "Throttled",
    "message": "Operations per second rate limit reached."
  }
}
```

### 6.4 Mock Client Test Example

```rust
#[tokio::test]
async fn test_get_secret_with_mock() {
    let mut mock = MockKeyVaultClient::new();

    // Register mock secret
    mock.register_secret("db-password", "secret123", "v1");

    // Test retrieval
    let secret = mock.secrets().get_secret("db-password", None).await.unwrap();
    assert_eq!(secret.name, "db-password");

    // Verify access was logged
    let log = mock.get_access_log();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].operation, "get_secret");
    assert_eq!(log[0].object_name, "db-password");
}

#[tokio::test]
async fn test_access_denied() {
    let mut mock = MockKeyVaultClient::new();

    // Deny access to specific secret
    mock.deny_access("restricted-secret");

    // Verify access denied error
    let result = mock.secrets().get_secret("restricted-secret", None).await;
    assert!(matches!(result, Err(KeyVaultError::AccessDenied { .. })));
}
```

---

## 7. Observability Refinements

### 7.1 Metrics Refinement

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `keyvault_operation_duration_ms` | Histogram | operation, vault, status | P99 > 1000ms |
| `keyvault_operation_total` | Counter | operation, vault, status | Error rate > 1% |
| `keyvault_cache_hit_ratio` | Gauge | vault, object_type | < 80% |
| `keyvault_secret_expiry_days` | Gauge | vault, secret_name | < 7 days |
| `keyvault_circuit_breaker_state` | Gauge | vault | state = open |
| `keyvault_retry_total` | Counter | vault, attempt | attempt > 2 |

### 7.2 Trace Span Attributes

| Operation | Required Attributes | Optional Attributes |
|-----------|---------------------|---------------------|
| `keyvault.get_secret` | vault, secret_name, cache_hit | version |
| `keyvault.set_secret` | vault, secret_name | content_type, has_expiry |
| `keyvault.encrypt` | vault, key_name, algorithm | version |
| `keyvault.decrypt` | vault, key_name, algorithm | version |
| `keyvault.sign` | vault, key_name, algorithm | version |
| `keyvault.verify` | vault, key_name, algorithm, valid | version |

### 7.3 Structured Log Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "target": "integrations_azure_keyvault::services::secrets",
  "message": "Secret accessed",
  "event": "secret_accessed",
  "vault": "myvault.vault.azure.net",
  "secret_name": "db-password",
  "version": "abc123",
  "cache_hit": true,
  "duration_ms": 2,
  "trace_id": "abc123def456",
  "span_id": "789xyz"
}
```

---

## 8. Configuration Refinements

### 8.1 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AZURE_KEYVAULT_URL` | Vault URL | Required |
| `AZURE_KEYVAULT_CACHE_TTL_SECS` | Cache TTL in seconds | 300 |
| `AZURE_KEYVAULT_CACHE_ENABLED` | Enable caching | true |
| `AZURE_KEYVAULT_TIMEOUT_SECS` | Request timeout | 30 |
| `AZURE_KEYVAULT_MAX_RETRIES` | Max retry attempts | 3 |

### 8.2 Configuration Validation

```rust
impl KeyVaultConfig {
    pub fn validate(&self) -> Result<(), KeyVaultError> {
        validate_vault_url(&self.vault_url)?;

        if self.cache_ttl < Duration::from_secs(1) {
            return Err(KeyVaultError::InvalidConfiguration {
                message: "Cache TTL must be at least 1 second".to_string(),
            });
        }

        if self.timeout < Duration::from_secs(1) {
            return Err(KeyVaultError::InvalidConfiguration {
                message: "Timeout must be at least 1 second".to_string(),
            });
        }

        if self.max_retries > 10 {
            return Err(KeyVaultError::InvalidConfiguration {
                message: "Max retries cannot exceed 10".to_string(),
            });
        }

        Ok(())
    }
}
```

---

## 9. API Compatibility Notes

### 9.1 Azure Key Vault API Version

- **Target Version**: 7.4 (2023-07-01)
- **Minimum Supported**: 7.2
- **Version Header**: `api-version` query parameter

### 9.2 Breaking Change Handling

| API Change | Handling Strategy |
|------------|-------------------|
| New required field | Add with default, warn on missing |
| Removed field | Gracefully ignore in response |
| Changed field type | Support both types during transition |
| New error code | Map to generic error, log for analysis |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-azure-key-vault.md | Complete |
| 2. Pseudocode | pseudocode-azure-key-vault.md | Complete |
| 3. Architecture | architecture-azure-key-vault.md | Complete |
| 4. Refinement | refinement-azure-key-vault.md | Complete |
| 5. Completion | completion-azure-key-vault.md | Pending |

---

*Phase 4: Refinement - Complete*
