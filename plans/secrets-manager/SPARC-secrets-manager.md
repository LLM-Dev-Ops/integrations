# SPARC Development Cycle: Secrets Manager Integration Module

**Master Index Document**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/secrets-manager`

---

## Overview

This document contains the complete SPARC development cycle for the Secrets Manager Integration Module. This integration provides a thin adapter layer enabling the LLM Dev Ops platform to securely read, reference, and rotate secrets from external secrets management systems (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, GCP Secret Manager).

### Multi-Provider Design

| Provider | Protocol | Primary Use Case |
|----------|----------|------------------|
| AWS Secrets Manager | REST/SigV4 | AWS-native deployments |
| HashiCorp Vault | REST/Token | Multi-cloud, on-prem |
| Azure Key Vault | REST/OAuth2 | Azure-native deployments |
| GCP Secret Manager | REST/OAuth2 | GCP-native deployments |
| Local/File | File system | Development, testing |

---

## SPARC Phases

| Phase | Section | Status |
|-------|---------|--------|
| **S**pecification | [Section 1](#1-specification-phase) | COMPLETE |
| **P**seudocode | [Section 2](#2-pseudocode-phase) | COMPLETE |
| **A**rchitecture | [Section 3](#3-architecture-phase) | COMPLETE |
| **R**efinement (Interfaces) | [Section 4](#4-interfaces-phase) | COMPLETE |
| **C**ompletion (Constraints + Open Questions) | [Section 5](#5-constraints-and-open-questions) | COMPLETE |

---

# 1. SPECIFICATION PHASE

## 1.1 Executive Summary

This specification defines a thin adapter layer for integrating external secrets management systems into the LLM Dev Ops platform. The adapter enables:

- **Secret Retrieval** with caching and automatic refresh
- **Secret Versioning** for rollback and audit compliance
- **Access Scoping** via path-based and label-based filtering
- **Rotation Support** for automated credential lifecycle
- **Provider Abstraction** supporting multiple backends
- **Simulation Mode** for testing secret access patterns

### 1.1.1 Design Philosophy

This integration is a **thin adapter**, not a secrets management system:

| Responsibility | This Module | External (Out of Scope) |
|----------------|-------------|------------------------|
| Secret retrieval | Yes | - |
| Secret caching | Yes | - |
| Version selection | Yes | - |
| Provider abstraction | Yes | - |
| Rotation triggering | Yes | - |
| Secret creation | - | Secrets Manager UI/IaC |
| Encryption key management | - | KMS/Provider |
| Access policies | - | IAM/Provider policies |
| Secret value generation | - | Rotation Lambda/App |

## 1.2 Module Purpose and Scope

### 1.2.1 Purpose Statement

The Secrets Manager Integration Module provides a production-ready, type-safe interface for retrieving and managing secrets from external secrets management systems. It abstracts provider differences, handles caching and refresh, and integrates with the platform's shared infrastructure for authentication, metrics, and resilience.

### 1.2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Secret Retrieval** | Fetch secrets by name/path from configured provider |
| **Version Management** | Retrieve specific versions or staging labels |
| **Caching** | Local cache with TTL and refresh-ahead |
| **Provider Abstraction** | Unified interface across AWS, Vault, Azure, GCP |
| **Rotation Awareness** | Detect rotation, trigger refresh |
| **Reference Resolution** | Resolve `{{secret:path}}` references in configs |
| **Audit Events** | Emit access events for compliance |

### 1.2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| GetSecretValue | Retrieve current secret value |
| GetSecretVersion | Retrieve specific version |
| ListSecrets | Enumerate available secrets (metadata only) |
| DescribeSecret | Get secret metadata without value |
| RotateSecret | Trigger rotation (where supported) |
| Secret Reference Resolution | Parse `{{secret:path}}` in configurations |
| Multi-provider Support | AWS, Vault, Azure, GCP, Local |
| Caching Layer | TTL-based with refresh-ahead |
| Simulation Mode | Mock secrets for testing |

#### Out of Scope

| Item | Reason |
|------|--------|
| CreateSecret | Infrastructure provisioning |
| DeleteSecret | Infrastructure provisioning |
| PutSecretValue | Write operations are provisioning |
| Key Management | KMS is separate concern |
| Access Policy Management | IAM/provider responsibility |
| Secret Value Generation | Application/rotation lambda |
| Encryption/Decryption | Provider handles this |

## 1.3 Provider API Specifications

### 1.3.1 AWS Secrets Manager

**Base URL:** `https://secretsmanager.{region}.amazonaws.com`
**Authentication:** AWS SigV4

| Action | Method | Description |
|--------|--------|-------------|
| `GetSecretValue` | POST | Retrieve secret value |
| `DescribeSecret` | POST | Get metadata |
| `ListSecrets` | POST | List secrets (paginated) |
| `RotateSecret` | POST | Trigger rotation |

**GetSecretValue Request:**
```json
{
  "SecretId": "string",
  "VersionId": "string",
  "VersionStage": "AWSCURRENT|AWSPREVIOUS|AWSPENDING"
}
```

**GetSecretValue Response:**
```json
{
  "ARN": "arn:aws:secretsmanager:...",
  "Name": "my-secret",
  "VersionId": "uuid",
  "SecretString": "...",
  "SecretBinary": "base64...",
  "VersionStages": ["AWSCURRENT"],
  "CreatedDate": "2025-01-01T00:00:00Z"
}
```

### 1.3.2 HashiCorp Vault

**Base URL:** `https://{vault-host}:{port}/v1`
**Authentication:** Token, AppRole, Kubernetes, AWS IAM

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/secret/data/{path}` | GET | Read KV v2 secret |
| `/secret/metadata/{path}` | GET | Get metadata |
| `/secret/metadata` | LIST | List secrets |
| `/sys/rotate` | POST | Trigger rotation |

**KV v2 Read Response:**
```json
{
  "data": {
    "data": {
      "key1": "value1",
      "key2": "value2"
    },
    "metadata": {
      "created_time": "2025-01-01T00:00:00Z",
      "version": 3
    }
  }
}
```

### 1.3.3 Azure Key Vault

**Base URL:** `https://{vault-name}.vault.azure.net`
**Authentication:** OAuth2 (Azure AD)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/secrets/{name}` | GET | Get current version |
| `/secrets/{name}/{version}` | GET | Get specific version |
| `/secrets` | GET | List secrets |

**Get Secret Response:**
```json
{
  "value": "secret-value",
  "id": "https://vault.vault.azure.net/secrets/name/version",
  "attributes": {
    "enabled": true,
    "created": 1704067200,
    "updated": 1704067200,
    "exp": 1735689600
  },
  "tags": {}
}
```

### 1.3.4 GCP Secret Manager

**Base URL:** `https://secretmanager.googleapis.com/v1`
**Authentication:** OAuth2 (Service Account)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/projects/{p}/secrets/{s}/versions/latest:access` | GET | Get latest |
| `/projects/{p}/secrets/{s}/versions/{v}:access` | GET | Get version |
| `/projects/{p}/secrets` | GET | List secrets |

**Access Secret Response:**
```json
{
  "name": "projects/123/secrets/my-secret/versions/1",
  "payload": {
    "data": "base64-encoded-value"
  }
}
```

## 1.4 Enterprise Features

### 1.4.1 Secret Caching

Intelligent caching to reduce API calls and latency:

| Feature | Description |
|---------|-------------|
| **TTL-based Expiry** | Configurable cache lifetime |
| **Refresh-ahead** | Proactive refresh before expiry |
| **Version Pinning** | Cache specific versions indefinitely |
| **Negative Caching** | Cache "not found" briefly |
| **Memory Limits** | Bounded cache size |

**Cache Configuration:**
```rust
pub struct CacheConfig {
    pub ttl: Duration,              // Default: 5 minutes
    pub refresh_ahead: Duration,    // Default: 1 minute before TTL
    pub max_entries: usize,         // Default: 1000
    pub negative_ttl: Duration,     // Default: 30 seconds
}
```

### 1.4.2 Secret Versioning

Support for version management across providers:

| Feature | Description |
|---------|-------------|
| **Latest Version** | Default behavior |
| **Specific Version** | By version ID |
| **Staging Labels** | CURRENT, PREVIOUS, PENDING (AWS) |
| **Version History** | List available versions |

### 1.4.3 Access Scoping

Path and label-based access control:

| Feature | Description |
|---------|-------------|
| **Path Prefixes** | Limit access to paths like `/app/prod/*` |
| **Tag Filtering** | Filter by tags/labels |
| **Environment Scoping** | Automatic env-based path prefixing |

### 1.4.4 Secret Reference Resolution

Parse and resolve secret references in configurations:

| Pattern | Description |
|---------|-------------|
| `{{secret:path}}` | Retrieve secret at path |
| `{{secret:path#key}}` | Retrieve specific key from JSON |
| `{{secret:path@version}}` | Specific version |
| `{{secret:path#key@version}}` | Key from specific version |

### 1.4.5 Simulation and Replay

For testing and debugging:

| Feature | Description |
|---------|-------------|
| **Mock Mode** | Return predefined values |
| **Record Mode** | Capture access patterns |
| **Replay Mode** | Replay recorded access |
| **Dry Run** | Log access without retrieval |

### 1.4.6 Rotation Support

Automated credential rotation awareness:

| Feature | Description |
|---------|-------------|
| **Rotation Detection** | Detect version changes |
| **Cache Invalidation** | Clear cache on rotation |
| **Rotation Trigger** | Initiate rotation (where supported) |
| **Grace Period** | Use previous version during rotation |

## 1.5 Dependency Policy

### 1.5.1 Allowed Dependencies (Shared Modules)

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Provider authentication |
| `shared/resilience` | Retry, circuit breaker, rate limiting |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport abstraction |
| `aws/iam` | AWS authentication (for AWS SM) |

### 1.5.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `serde` / `serde_json` | 1.x | Serialization |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `base64` | 0.21+ | Binary secret encoding |
| `parking_lot` | 0.12+ | Synchronization |
| `lru` | 0.12+ | LRU cache implementation |

### 1.5.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `aws-sdk-secretsmanager` | This module IS the integration |
| `vaultrs` | This module provides Vault access |
| Provider-specific SDKs | Use internal implementations |

## 1.6 Error Taxonomy

### 1.6.1 Error Hierarchy

```
SecretsError
├── ConfigurationError
│   ├── InvalidProvider
│   ├── MissingEndpoint
│   ├── InvalidCacheConfig
│   └── InvalidPathPattern
│
├── AuthenticationError
│   ├── InvalidCredentials
│   ├── ExpiredCredentials
│   ├── InsufficientPermissions
│   └── TokenRefreshFailed
│
├── SecretNotFoundError
│   ├── SecretDoesNotExist
│   ├── VersionNotFound
│   └── StageNotFound
│
├── AccessError
│   ├── AccessDenied
│   ├── ResourcePolicyDenied
│   └── KmsAccessDenied
│
├── RotationError
│   ├── RotationInProgress
│   ├── RotationFailed
│   └── RotationNotConfigured
│
├── ProviderError
│   ├── ProviderUnavailable
│   ├── RateLimited
│   ├── QuotaExceeded
│   └── InternalError
│
├── CacheError
│   ├── CacheCorrupted
│   └── RefreshFailed
│
├── ParseError
│   ├── InvalidSecretFormat
│   ├── JsonParseError
│   └── InvalidReference
│
└── NetworkError
    ├── ConnectionFailed
    ├── Timeout
    └── TlsError
```

### 1.6.2 Error Mapping by Provider

| AWS Error | Azure Error | Vault Error | SecretsError |
|-----------|-------------|-------------|--------------|
| `ResourceNotFoundException` | 404 | 404 | `SecretNotFoundError` |
| `AccessDeniedException` | 403 | 403 | `AccessError::AccessDenied` |
| `DecryptionFailureException` | - | - | `AccessError::KmsAccessDenied` |
| `InvalidRequestException` | 400 | 400 | `ConfigurationError` |
| `InternalServiceError` | 500 | 500 | `ProviderError::InternalError` |
| `ThrottlingException` | 429 | 429 | `ProviderError::RateLimited` |

## 1.7 Resilience Requirements

### 1.7.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `ProviderError::RateLimited` | Yes | 5 | Exponential (1s base) |
| `ProviderError::InternalError` | Yes | 3 | Exponential (500ms base) |
| `ProviderError::ProviderUnavailable` | Yes | 3 | Exponential (1s base) |
| `NetworkError::*` | Yes | 3 | Exponential (500ms base) |
| Auth/Access errors | No | - | - |
| NotFound errors | No | - | - |

### 1.7.2 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |
| Per-provider isolation | Yes |

### 1.7.3 Cache Fallback

| Scenario | Behavior |
|----------|----------|
| Provider unavailable | Return cached (if not expired) |
| Refresh fails | Extend TTL, return stale |
| Cache miss + failure | Propagate error |

## 1.8 Observability Requirements

### 1.8.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `secrets.get` | `provider`, `secret_path`, `version`, `cached` |
| `secrets.list` | `provider`, `prefix`, `count` |
| `secrets.rotate` | `provider`, `secret_path` |
| `secrets.resolve` | `reference_count`, `resolved_count` |

### 1.8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `secrets_requests_total` | Counter | `provider`, `operation`, `status` |
| `secrets_request_duration_seconds` | Histogram | `provider`, `operation` |
| `secrets_cache_hits_total` | Counter | `provider` |
| `secrets_cache_misses_total` | Counter | `provider` |
| `secrets_cache_size` | Gauge | `provider` |
| `secrets_rotation_total` | Counter | `provider`, `status` |
| `secrets_errors_total` | Counter | `provider`, `error_type` |

### 1.8.3 Logging

| Level | When |
|-------|------|
| ERROR | Auth failures, provider errors |
| WARN | Cache refresh failures, rate limiting |
| INFO | Secret access (path only, never value) |
| DEBUG | Cache operations, version selection |
| TRACE | Provider request/response (sanitized) |

### 1.8.4 Audit Events

All secret access emits audit events:

```rust
pub struct SecretAccessEvent {
    pub timestamp: DateTime<Utc>,
    pub secret_path: String,           // Never the value
    pub version: Option<String>,
    pub operation: SecretOperation,
    pub caller_identity: String,
    pub source_ip: Option<String>,
    pub success: bool,
    pub cached: bool,
}
```

## 1.9 Performance Requirements

### 1.9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Cached retrieval | < 1ms | < 5ms |
| Provider retrieval | < 100ms | < 500ms |
| Reference resolution (10 refs) | < 50ms | < 200ms |
| List secrets | < 200ms | < 1s |

### 1.9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Cached reads | 50000+/sec |
| Provider reads | 100+/sec (provider limited) |
| Concurrent resolves | 1000+ |

## 1.10 Acceptance Criteria

### 1.10.1 Functional Criteria

- [ ] AWS Secrets Manager retrieval works
- [ ] HashiCorp Vault retrieval works
- [ ] Azure Key Vault retrieval works
- [ ] GCP Secret Manager retrieval works
- [ ] Version selection works
- [ ] Caching works (TTL, refresh-ahead)
- [ ] Reference resolution works
- [ ] Rotation trigger works
- [ ] Simulation mode works
- [ ] Multi-provider config works

### 1.10.2 Non-Functional Criteria

- [ ] Secret values never logged
- [ ] Cache properly secured
- [ ] Audit events emitted
- [ ] Retry respects backoff
- [ ] Circuit breaker works
- [ ] Test coverage > 80%

---

# 2. PSEUDOCODE PHASE

## 2.1 Core Client

```pseudocode
CLASS SecretsClient:
    FIELDS:
        config: SecretsConfig
        providers: Map<ProviderType, Provider>
        cache: SecretCache
        circuit_breaker: CircuitBreaker
        metrics: MetricsCollector

    CONSTRUCTOR(config: SecretsConfig):
        VALIDATE config
        FOR EACH provider_config IN config.providers:
            provider = CREATE_PROVIDER(provider_config)
            providers.insert(provider_config.type, provider)
        INITIALIZE cache with config.cache_config
        INITIALIZE circuit_breaker with config.circuit_breaker_config
        INITIALIZE metrics

    METHOD get_secret(path: String, options: GetOptions) -> SecretValue:
        span = START_SPAN("secrets.get")
        span.set_attribute("secret_path", path)
        span.set_attribute("provider", options.provider.to_string())

        TRY:
            // Determine provider
            provider = SELECT_PROVIDER(path, options)

            // Check cache first
            cache_key = build_cache_key(provider, path, options.version)
            IF cached = cache.get(cache_key):
                span.set_attribute("cached", true)
                EMIT_METRIC("secrets_cache_hits_total", provider=provider)
                RETURN cached

            span.set_attribute("cached", false)
            EMIT_METRIC("secrets_cache_misses_total", provider=provider)

            // Check circuit breaker
            circuit_breaker.check(provider)

            // Retrieve from provider
            secret = provider.get_secret(path, options)

            // Update circuit breaker
            circuit_breaker.record_success(provider)

            // Cache the result
            cache.put(cache_key, secret, config.cache_config.ttl)

            // Emit audit event
            EMIT_AUDIT_EVENT(SecretAccessEvent {
                secret_path: path,
                operation: SecretOperation::Get,
                success: true,
                cached: false,
            })

            EMIT_METRIC("secrets_requests_total", provider=provider, status="success")
            RETURN secret

        CATCH error:
            span.record_error(error)
            circuit_breaker.record_failure(provider)
            EMIT_METRIC("secrets_errors_total", provider=provider, error_type=error.type())

            // Try cache fallback for transient errors
            IF error.is_transient() AND cached = cache.get_stale(cache_key):
                LOG_WARN("Using stale cached secret due to provider error")
                RETURN cached

            IF error.is_retryable():
                RETURN RETRY_WITH_BACKOFF(get_secret, path, options)

            THROW error
        FINALLY:
            span.end()

    METHOD resolve_references(config_text: String) -> String:
        span = START_SPAN("secrets.resolve")

        // Find all {{secret:...}} patterns
        references = FIND_REFERENCES(config_text)
        span.set_attribute("reference_count", references.len())

        resolved_count = 0
        result = config_text

        FOR EACH ref IN references:
            TRY:
                parsed = PARSE_REFERENCE(ref)  // path, key, version
                secret = get_secret(parsed.path, GetOptions {
                    version: parsed.version,
                })

                value = IF parsed.key:
                    EXTRACT_JSON_KEY(secret.value, parsed.key)
                ELSE:
                    secret.value

                result = result.replace(ref.full_match, value)
                resolved_count += 1

            CATCH error:
                LOG_ERROR("Failed to resolve reference {ref}: {error}")
                THROW ParseError::InvalidReference(ref, error)

        span.set_attribute("resolved_count", resolved_count)
        RETURN result

    METHOD list_secrets(prefix: String, options: ListOptions) -> List<SecretMetadata>:
        provider = SELECT_PROVIDER(prefix, options)
        circuit_breaker.check(provider)

        secrets = provider.list_secrets(prefix, options)

        EMIT_AUDIT_EVENT(SecretAccessEvent {
            secret_path: prefix,
            operation: SecretOperation::List,
            success: true,
        })

        RETURN secrets

    METHOD trigger_rotation(path: String) -> RotationResult:
        provider = SELECT_PROVIDER(path)
        circuit_breaker.check(provider)

        result = provider.rotate_secret(path)

        // Invalidate cache
        cache.invalidate_prefix(path)

        EMIT_AUDIT_EVENT(SecretAccessEvent {
            secret_path: path,
            operation: SecretOperation::Rotate,
            success: result.success,
        })

        RETURN result
```

## 2.2 Secret Cache

```pseudocode
CLASS SecretCache:
    FIELDS:
        cache: LruCache<String, CachedSecret>
        config: CacheConfig
        refresh_scheduler: RefreshScheduler
        lock: RwLock

    METHOD get(key: String) -> Option<SecretValue>:
        WITH lock.read():
            IF entry = cache.get(key):
                IF entry.is_valid():
                    RETURN Some(entry.value.clone())
                IF entry.needs_refresh():
                    // Trigger async refresh
                    SPAWN refresh_async(key, entry)
                    // Return current value while refreshing
                    IF NOT entry.is_expired():
                        RETURN Some(entry.value.clone())
        RETURN None

    METHOD get_stale(key: String) -> Option<SecretValue>:
        WITH lock.read():
            IF entry = cache.get(key):
                // Return even if expired (for fallback)
                RETURN Some(entry.value.clone())
        RETURN None

    METHOD put(key: String, value: SecretValue, ttl: Duration):
        WITH lock.write():
            entry = CachedSecret {
                value: value,
                cached_at: now(),
                expires_at: now() + ttl,
                refresh_at: now() + ttl - config.refresh_ahead,
            }
            cache.put(key, entry)

            // Schedule refresh-ahead
            IF config.refresh_ahead > Duration::ZERO:
                refresh_scheduler.schedule(key, entry.refresh_at)

    METHOD invalidate(key: String):
        WITH lock.write():
            cache.remove(key)

    METHOD invalidate_prefix(prefix: String):
        WITH lock.write():
            keys_to_remove = cache.keys()
                .filter(|k| k.starts_with(prefix))
                .collect()
            FOR key IN keys_to_remove:
                cache.remove(key)

    METHOD refresh_async(key: String, entry: CachedSecret):
        TRY:
            // Re-fetch from provider
            new_value = client.get_secret_uncached(entry.path, entry.options)
            self.put(key, new_value, config.ttl)
        CATCH error:
            LOG_WARN("Cache refresh failed for {key}: {error}")
            // Extend TTL to prevent thundering herd
            entry.expires_at = now() + config.ttl / 2
```

## 2.3 Provider Implementations

```pseudocode
TRAIT SecretProvider:
    METHOD get_secret(path: String, options: GetOptions) -> SecretValue
    METHOD list_secrets(prefix: String, options: ListOptions) -> List<SecretMetadata>
    METHOD describe_secret(path: String) -> SecretMetadata
    METHOD rotate_secret(path: String) -> RotationResult
    METHOD provider_type() -> ProviderType

CLASS AwsSecretsManagerProvider IMPLEMENTS SecretProvider:
    FIELDS:
        http_client: HttpClient
        signer: AwsSigV4Signer
        region: String

    METHOD get_secret(path: String, options: GetOptions) -> SecretValue:
        body = {
            "SecretId": path,
        }
        IF options.version:
            body["VersionId"] = options.version
        IF options.stage:
            body["VersionStage"] = options.stage

        request = HttpRequest {
            method: POST,
            url: f"https://secretsmanager.{region}.amazonaws.com",
            headers: {
                "X-Amz-Target": "secretsmanager.GetSecretValue",
                "Content-Type": "application/x-amz-json-1.1",
            },
            body: JSON.serialize(body),
        }

        SIGN_REQUEST(request, signer)
        response = http_client.send(request)

        IF response.status != 200:
            THROW PARSE_AWS_ERROR(response)

        result = JSON.deserialize(response.body)

        RETURN SecretValue {
            value: result.SecretString OR base64_decode(result.SecretBinary),
            version: result.VersionId,
            created_at: result.CreatedDate,
            metadata: SecretMetadata {
                name: result.Name,
                arn: result.ARN,
                stages: result.VersionStages,
            },
        }

CLASS VaultProvider IMPLEMENTS SecretProvider:
    FIELDS:
        http_client: HttpClient
        address: Url
        token: SecretString
        mount_path: String  // Default: "secret"

    METHOD get_secret(path: String, options: GetOptions) -> SecretValue:
        url = f"{address}/v1/{mount_path}/data/{path}"
        IF options.version:
            url = f"{url}?version={options.version}"

        request = HttpRequest {
            method: GET,
            url: url,
            headers: {
                "X-Vault-Token": token.expose(),
            },
        }

        response = http_client.send(request)

        IF response.status != 200:
            THROW PARSE_VAULT_ERROR(response)

        result = JSON.deserialize(response.body)

        RETURN SecretValue {
            value: JSON.serialize(result.data.data),  // KV v2 nesting
            version: result.data.metadata.version.to_string(),
            created_at: result.data.metadata.created_time,
            metadata: SecretMetadata {
                name: path,
                version: result.data.metadata.version,
            },
        }
```

## 2.4 Simulation Mode

```pseudocode
CLASS SimulationProvider IMPLEMENTS SecretProvider:
    FIELDS:
        mock_secrets: Map<String, SecretValue>
        access_log: Vec<SecretAccessRecord>
        mode: SimulationMode  // Mock, Record, Replay

    METHOD get_secret(path: String, options: GetOptions) -> SecretValue:
        access_log.push(SecretAccessRecord {
            timestamp: now(),
            path: path,
            options: options,
        })

        MATCH mode:
            SimulationMode::Mock:
                IF secret = mock_secrets.get(path):
                    RETURN secret.clone()
                THROW SecretNotFoundError::SecretDoesNotExist(path)

            SimulationMode::Record:
                // Pass through to real provider, record result
                secret = real_provider.get_secret(path, options)
                recorded_secrets.insert(path, secret.clone())
                RETURN secret

            SimulationMode::Replay:
                IF recorded = recorded_secrets.get(path):
                    RETURN recorded.clone()
                THROW SecretNotFoundError::SecretDoesNotExist(path)

    METHOD set_mock_secret(path: String, value: String):
        mock_secrets.insert(path, SecretValue {
            value: value,
            version: "mock-v1",
            created_at: now(),
        })

    METHOD get_access_log() -> Vec<SecretAccessRecord>:
        RETURN access_log.clone()
```

---

# 3. ARCHITECTURE PHASE

## 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Dev Ops Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Application │  │ Config Loader│  │  Other       │          │
│  │    Code      │  │              │  │  Services    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────┬────┴────────┬────────┘                   │
│                      │             │                            │
│                      ▼             ▼                            │
│  ┌───────────────────────────────────────────────────────┐     │
│  │               Secrets Manager Integration              │     │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │     │
│  │  │   Secrets   │ │  Reference  │ │   Secret    │      │     │
│  │  │   Client    │ │  Resolver   │ │    Cache    │      │     │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘      │     │
│  │         │               │               │              │     │
│  │         ▼               ▼               ▼              │     │
│  │  ┌─────────────────────────────────────────────┐      │     │
│  │  │            Provider Abstraction              │      │     │
│  │  │    ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │      │     │
│  │  │    │ AWS │ │Vault│ │Azure│ │ GCP │         │      │     │
│  │  │    └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘         │      │     │
│  │  └───────┼───────┼───────┼───────┼────────────┘      │     │
│  └──────────┼───────┼───────┼───────┼───────────────────┘     │
│             │       │       │       │                          │
└─────────────┼───────┼───────┼───────┼──────────────────────────┘
              │       │       │       │
              ▼       ▼       ▼       ▼
      ┌───────────────────────────────────────────┐
      │           External Secret Stores           │
      │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
      │  │   AWS   │ │  Vault  │ │  Azure  │ ...  │
      │  │Secrets  │ │         │ │KeyVault │      │
      │  │Manager  │ │         │ │         │      │
      │  └─────────┘ └─────────┘ └─────────┘      │
      └───────────────────────────────────────────┘
```

## 3.2 Module Structure

```
integrations/secrets-manager/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   ├── client/
│   │   ├── mod.rs             # SecretsClient implementation
│   │   ├── config.rs          # Configuration types
│   │   └── builder.rs         # Client builder pattern
│   ├── providers/
│   │   ├── mod.rs             # Provider trait
│   │   ├── aws.rs             # AWS Secrets Manager
│   │   ├── vault.rs           # HashiCorp Vault
│   │   ├── azure.rs           # Azure Key Vault
│   │   ├── gcp.rs             # GCP Secret Manager
│   │   └── local.rs           # Local/file-based (dev)
│   ├── cache/
│   │   ├── mod.rs
│   │   ├── lru.rs             # LRU cache implementation
│   │   └── refresh.rs         # Refresh-ahead scheduler
│   ├── resolver/
│   │   ├── mod.rs
│   │   ├── parser.rs          # Reference parser
│   │   └── interpolate.rs     # Config interpolation
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs            # Mock provider
│   │   ├── recorder.rs        # Access recorder
│   │   └── replayer.rs        # Replay provider
│   ├── types/
│   │   ├── mod.rs
│   │   ├── secret.rs          # Secret types
│   │   ├── error.rs           # Error types
│   │   └── audit.rs           # Audit event types
│   └── transport/
│       ├── mod.rs
│       └── http.rs            # HTTP transport
├── tests/
│   ├── integration/
│   └── unit/
└── benches/
```

## 3.3 Data Flow

```
Secret Retrieval Flow:
──────────────────────

Application
    │
    │ get_secret("db/password")
    ▼
┌─────────────────┐
│ SecretsClient   │ ── Select provider based on path/config
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SecretCache    │ ── Check for cached value
│                 │ ── If valid, return immediately
└────────┬────────┘
         │ cache miss
         ▼
┌─────────────────┐
│ Circuit Breaker │ ── Check provider health
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Provider     │ ── AWS/Vault/Azure/GCP
│   (selected)    │ ── Authenticate, fetch secret
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SecretCache    │ ── Store in cache
│                 │ ── Schedule refresh-ahead
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Audit Logger   │ ── Emit access event
└────────┬────────┘
         │
         ▼
    Return SecretValue
```

## 3.4 Reference Resolution Flow

```
Config with Secret References:
─────────────────────────────

Input: "db_password={{secret:db/creds#password}}"
    │
    ▼
┌─────────────────┐
│ Reference Parser│ ── Find {{secret:...}} patterns
│                 │ ── Parse: path="db/creds", key="password"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ SecretsClient   │ ── get_secret("db/creds")
│                 │ ── Returns JSON: {"user":"admin","password":"xyz"}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ JSON Extractor  │ ── Extract key "password" → "xyz"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Interpolator    │ ── Replace {{secret:...}} with "xyz"
└────────┬────────┘
         │
         ▼
Output: "db_password=xyz"
```

---

# 4. INTERFACES PHASE

## 4.1 Core Traits (Rust)

```rust
/// Main client trait for secrets management
#[async_trait]
pub trait SecretsClient: Send + Sync {
    /// Retrieve a secret by path
    async fn get_secret(&self, path: &str, options: GetSecretOptions) -> Result<SecretValue, SecretsError>;

    /// Retrieve a specific key from a JSON secret
    async fn get_secret_key(&self, path: &str, key: &str) -> Result<String, SecretsError>;

    /// List secrets matching a prefix
    async fn list_secrets(&self, prefix: &str, options: ListOptions) -> Result<Vec<SecretMetadata>, SecretsError>;

    /// Get secret metadata without value
    async fn describe_secret(&self, path: &str) -> Result<SecretMetadata, SecretsError>;

    /// Trigger secret rotation
    async fn rotate_secret(&self, path: &str) -> Result<RotationResult, SecretsError>;

    /// Resolve secret references in a string
    async fn resolve_references(&self, text: &str) -> Result<String, SecretsError>;

    /// Invalidate cached secret
    fn invalidate_cache(&self, path: &str);

    /// Invalidate all cached secrets with prefix
    fn invalidate_cache_prefix(&self, prefix: &str);
}

/// Secret provider trait (implemented per backend)
#[async_trait]
pub trait SecretProvider: Send + Sync {
    /// Get secret value
    async fn get_secret(&self, path: &str, options: GetSecretOptions) -> Result<SecretValue, SecretsError>;

    /// List secrets
    async fn list_secrets(&self, prefix: &str, options: ListOptions) -> Result<Vec<SecretMetadata>, SecretsError>;

    /// Describe secret
    async fn describe_secret(&self, path: &str) -> Result<SecretMetadata, SecretsError>;

    /// Rotate secret
    async fn rotate_secret(&self, path: &str) -> Result<RotationResult, SecretsError>;

    /// Provider type
    fn provider_type(&self) -> ProviderType;

    /// Health check
    async fn health_check(&self) -> Result<(), SecretsError>;
}

/// Reference resolver trait
pub trait ReferenceResolver: Send + Sync {
    /// Resolve all secret references in text
    fn resolve(&self, text: &str) -> impl Future<Output = Result<String, SecretsError>> + Send;

    /// Check if text contains secret references
    fn has_references(&self, text: &str) -> bool;

    /// Extract all references without resolving
    fn extract_references(&self, text: &str) -> Vec<SecretReference>;
}

/// Cache interface
pub trait SecretCache: Send + Sync {
    /// Get cached secret
    fn get(&self, key: &str) -> Option<SecretValue>;

    /// Get potentially stale secret (for fallback)
    fn get_stale(&self, key: &str) -> Option<SecretValue>;

    /// Store secret in cache
    fn put(&self, key: &str, value: SecretValue, ttl: Duration);

    /// Invalidate specific entry
    fn invalidate(&self, key: &str);

    /// Invalidate by prefix
    fn invalidate_prefix(&self, prefix: &str);

    /// Get cache statistics
    fn stats(&self) -> CacheStats;
}
```

## 4.2 Configuration Types

```rust
/// Secrets client configuration
#[derive(Clone, Debug)]
pub struct SecretsConfig {
    /// Provider configurations
    pub providers: Vec<ProviderConfig>,

    /// Default provider (if not specified in path)
    pub default_provider: ProviderType,

    /// Cache configuration
    pub cache: CacheConfig,

    /// Retry configuration
    pub retry: RetryConfig,

    /// Circuit breaker configuration
    pub circuit_breaker: CircuitBreakerConfig,

    /// Enable audit logging
    pub audit_enabled: bool,

    /// Path prefix mappings
    pub path_mappings: Vec<PathMapping>,
}

/// Provider-specific configuration
#[derive(Clone, Debug)]
pub enum ProviderConfig {
    Aws(AwsSecretsManagerConfig),
    Vault(VaultConfig),
    Azure(AzureKeyVaultConfig),
    Gcp(GcpSecretManagerConfig),
    Local(LocalProviderConfig),
    Simulation(SimulationConfig),
}

/// AWS Secrets Manager configuration
#[derive(Clone, Debug)]
pub struct AwsSecretsManagerConfig {
    /// AWS region
    pub region: String,

    /// Credential provider
    pub credentials: Arc<dyn CredentialProvider>,

    /// Custom endpoint (for LocalStack, etc.)
    pub endpoint: Option<Url>,
}

/// HashiCorp Vault configuration
#[derive(Clone, Debug)]
pub struct VaultConfig {
    /// Vault address
    pub address: Url,

    /// Authentication method
    pub auth: VaultAuth,

    /// Secret engine mount path
    pub mount_path: String,

    /// Namespace (Enterprise)
    pub namespace: Option<String>,
}

/// Vault authentication methods
#[derive(Clone)]
pub enum VaultAuth {
    Token(SecretString),
    AppRole { role_id: String, secret_id: SecretString },
    Kubernetes { role: String, jwt_path: PathBuf },
    AwsIam { role: String },
}

/// Cache configuration
#[derive(Clone, Debug)]
pub struct CacheConfig {
    /// Time-to-live for cached secrets
    pub ttl: Duration,

    /// Refresh secrets this long before expiry
    pub refresh_ahead: Duration,

    /// Maximum cache entries
    pub max_entries: usize,

    /// TTL for "not found" responses
    pub negative_ttl: Duration,

    /// Enable stale fallback on errors
    pub stale_fallback: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            ttl: Duration::from_secs(300),           // 5 minutes
            refresh_ahead: Duration::from_secs(60), // 1 minute
            max_entries: 1000,
            negative_ttl: Duration::from_secs(30),
            stale_fallback: true,
        }
    }
}

/// Path to provider mapping
#[derive(Clone, Debug)]
pub struct PathMapping {
    /// Path prefix pattern
    pub pattern: String,

    /// Target provider
    pub provider: ProviderType,
}
```

## 4.3 Value Types

```rust
/// Retrieved secret value
#[derive(Clone)]
pub struct SecretValue {
    /// Secret value (string or JSON)
    pub value: SecretString,

    /// Version identifier
    pub version: String,

    /// Creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last updated timestamp
    pub updated_at: Option<DateTime<Utc>>,

    /// Secret metadata
    pub metadata: SecretMetadata,
}

/// Secret metadata (no value)
#[derive(Clone, Debug)]
pub struct SecretMetadata {
    /// Secret name/path
    pub name: String,

    /// Provider-specific ARN/ID
    pub arn: Option<String>,

    /// Description
    pub description: Option<String>,

    /// Current version
    pub current_version: String,

    /// Version stages (AWS) or labels
    pub stages: Vec<String>,

    /// Tags/labels
    pub tags: HashMap<String, String>,

    /// Rotation enabled
    pub rotation_enabled: bool,

    /// Next rotation date
    pub next_rotation: Option<DateTime<Utc>>,

    /// Creation date
    pub created_at: DateTime<Utc>,

    /// Last accessed date
    pub last_accessed: Option<DateTime<Utc>>,
}

/// Secret reference parsed from config
#[derive(Clone, Debug)]
pub struct SecretReference {
    /// Full match text (e.g., "{{secret:path#key@version}}")
    pub full_match: String,

    /// Secret path
    pub path: String,

    /// JSON key (optional)
    pub key: Option<String>,

    /// Version (optional)
    pub version: Option<String>,

    /// Provider override (optional)
    pub provider: Option<ProviderType>,
}

/// Rotation result
#[derive(Clone, Debug)]
pub struct RotationResult {
    /// Whether rotation was triggered
    pub triggered: bool,

    /// New version ID (if available)
    pub version_id: Option<String>,

    /// Rotation status
    pub status: RotationStatus,
}

#[derive(Clone, Debug)]
pub enum RotationStatus {
    Pending,
    InProgress,
    Completed,
    Failed(String),
    NotConfigured,
}

/// Get secret options
#[derive(Clone, Debug, Default)]
pub struct GetSecretOptions {
    /// Specific version to retrieve
    pub version: Option<String>,

    /// Version stage (AWS: AWSCURRENT, AWSPREVIOUS, AWSPENDING)
    pub stage: Option<String>,

    /// Provider override
    pub provider: Option<ProviderType>,

    /// Skip cache
    pub skip_cache: bool,
}

/// List secrets options
#[derive(Clone, Debug, Default)]
pub struct ListOptions {
    /// Maximum results
    pub max_results: Option<u32>,

    /// Pagination token
    pub next_token: Option<String>,

    /// Filter by tags
    pub tags: Option<HashMap<String, String>>,
}
```

## 4.4 TypeScript Interfaces

```typescript
interface SecretsClient {
  getSecret(path: string, options?: GetSecretOptions): Promise<SecretValue>;
  getSecretKey(path: string, key: string): Promise<string>;
  listSecrets(prefix: string, options?: ListOptions): Promise<SecretMetadata[]>;
  describeSecret(path: string): Promise<SecretMetadata>;
  rotateSecret(path: string): Promise<RotationResult>;
  resolveReferences(text: string): Promise<string>;
  invalidateCache(path: string): void;
  invalidateCachePrefix(prefix: string): void;
}

interface SecretValue {
  value: string;
  version: string;
  createdAt: Date;
  updatedAt?: Date;
  metadata: SecretMetadata;
}

interface SecretMetadata {
  name: string;
  arn?: string;
  description?: string;
  currentVersion: string;
  stages: string[];
  tags: Record<string, string>;
  rotationEnabled: boolean;
  nextRotation?: Date;
  createdAt: Date;
  lastAccessed?: Date;
}

interface SecretsConfig {
  providers: ProviderConfig[];
  defaultProvider: ProviderType;
  cache: CacheConfig;
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
  auditEnabled?: boolean;
  pathMappings?: PathMapping[];
}

type ProviderType = 'aws' | 'vault' | 'azure' | 'gcp' | 'local' | 'simulation';

interface GetSecretOptions {
  version?: string;
  stage?: string;
  provider?: ProviderType;
  skipCache?: boolean;
}

interface CacheConfig {
  ttl?: number;           // milliseconds
  refreshAhead?: number;  // milliseconds
  maxEntries?: number;
  negativeTtl?: number;   // milliseconds
  staleFallback?: boolean;
}
```

---

# 5. CONSTRAINTS AND OPEN QUESTIONS

## 5.1 Functional Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| FC-1 | Read-only operations | No CreateSecret, PutSecretValue |
| FC-2 | Provider abstraction | Unified interface across all providers |
| FC-3 | Cache-first design | Always check cache before provider |
| FC-4 | Reference syntax | Standard `{{secret:path}}` format |
| FC-5 | Version support | All providers must support versioning |

## 5.2 Non-Functional Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| NFC-1 | Secret values never logged | Use SecretString, redact in logs |
| NFC-2 | Cache memory bounded | LRU eviction, max entries |
| NFC-3 | Audit all access | Every retrieval emits audit event |
| NFC-4 | Graceful degradation | Stale cache on provider failure |
| NFC-5 | Provider isolation | Circuit breaker per provider |

## 5.3 Security Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| SC-1 | TLS required | All provider connections use TLS |
| SC-2 | Credential protection | Provider credentials use SecretString |
| SC-3 | Cache encryption | Optional at-rest encryption for cache |
| SC-4 | No credential in errors | Error messages never contain secrets |
| SC-5 | Audit trail | All access logged for compliance |

## 5.4 Integration Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| IC-1 | Shared auth integration | Use platform credential providers |
| IC-2 | Shared observability | Use platform metrics/logging |
| IC-3 | Shared resilience | Use platform retry/circuit breaker |
| IC-4 | Config interpolation | Support in platform config loading |

## 5.5 Provider-Specific Constraints

| Provider | Constraint |
|----------|------------|
| AWS | Requires IAM permissions: `secretsmanager:GetSecretValue` |
| Vault | Requires policy: `read` on secret path |
| Azure | Requires RBAC: `Key Vault Secrets User` |
| GCP | Requires IAM: `secretmanager.versions.access` |

## 5.6 Open Questions

| ID | Question | Impact | Proposed Resolution |
|----|----------|--------|---------------------|
| OQ-1 | Should we support binary secrets natively? | Medium | Yes, return as base64 with flag |
| OQ-2 | How to handle large secrets (>64KB)? | Low | Warn, stream if possible |
| OQ-3 | Cross-provider secret sync? | Low | Out of scope, use external tools |
| OQ-4 | Should cache be persistent (disk)? | Medium | Optional, memory default |
| OQ-5 | Multi-region failover for AWS? | High | Support region list with failover |
| OQ-6 | Vault namespace hierarchy? | Medium | Support via path prefix mapping |
| OQ-7 | Secret change notifications? | High | Webhooks/polling for rotation awareness |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial SPARC document - All phases |

---

**SPARC Cycle Status:**

```
╔═══════════════════════════════════════════════════════════════╗
║  ✅ Specification   ✅ Pseudocode   ✅ Architecture             ║
║  ✅ Interfaces      ✅ Constraints/Open Questions               ║
║                                                               ║
║           READY FOR IMPLEMENTATION                            ║
╚═══════════════════════════════════════════════════════════════╝
```
