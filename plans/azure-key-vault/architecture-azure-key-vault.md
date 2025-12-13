# Azure Key Vault Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure/key-vault`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LLM Dev Ops Platform                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   LLM Apps   │    │  Pipelines   │    │   Services   │    │    Agents    │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┴─────────┬─────────┴───────────────────┘          │
│                                       │                                         │
│                                       ▼                                         │
│                    ┌─────────────────────────────────────┐                     │
│                    │   Azure Key Vault Integration       │                     │
│                    │         (Thin Adapter)              │                     │
│                    └─────────────────┬───────────────────┘                     │
│                                      │                                          │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
          ┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
          │   Azure Key     │ │  Azure AD /   │ │  Azure Monitor  │
          │     Vault       │ │  Entra ID     │ │   (Audit Logs)  │
          └─────────────────┘ └───────────────┘ └─────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Azure Key Vault Integration Module                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Public API Layer                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │   │
│  │  │ KeyVaultClient  │  │    Builders     │  │    Type Exports         │  │   │
│  │  │  (Facade)       │  │                 │  │                         │  │   │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  │   │
│  └───────────┼──────────────────────────────────────────────────────────────┘   │
│              │                                                                   │
│  ┌───────────┼──────────────────────────────────────────────────────────────┐   │
│  │           ▼              Service Layer                                    │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │   │
│  │  │ SecretsService  │  │  KeysService    │  │ CertificatesService     │   │   │
│  │  │                 │  │                 │  │                         │   │   │
│  │  │ • get_secret    │  │ • create_key    │  │ • get_certificate       │   │   │
│  │  │ • set_secret    │  │ • encrypt       │  │ • list_certificates     │   │   │
│  │  │ • list_secrets  │  │ • decrypt       │  │ • get_policy            │   │   │
│  │  │ • delete_secret │  │ • sign/verify   │  │                         │   │   │
│  │  │ • backup/restore│  │ • wrap/unwrap   │  │                         │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘   │   │
│  └───────────┼────────────────────┼────────────────────────┼────────────────┘   │
│              │                    │                        │                    │
│  ┌───────────┼────────────────────┼────────────────────────┼────────────────┐   │
│  │           ▼                    ▼                        ▼                │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │                      Cache Layer                                 │    │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │   │
│  │  │  │SecretCache  │  │  KeyCache   │  │    CertCache            │  │    │   │
│  │  │  │ (TTL+LRU)   │  │ (TTL+LRU)   │  │    (TTL+LRU)            │  │    │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  │                        Infrastructure Layer                              │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                      Transport Layer                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │   │
│  │  │ HttpTransport   │  │  AuthProvider   │  │   RequestBuilder        │   │   │
│  │  │ (reqwest)       │  │ (azure/auth)    │  │                         │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘   │   │
│  └───────────┼────────────────────┼─────────────────────────────────────────┘   │
│              │                    │                                             │
└──────────────┼────────────────────┼─────────────────────────────────────────────┘
               │                    │
               ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐
    │   Azure Key     │  │   Azure AD      │
    │   Vault API     │  │   OAuth2        │
    └─────────────────┘  └─────────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Service Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SecretsService                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │   SecretOps      │    │   VersionOps     │    │    RecoveryOps           │  │
│  │                  │    │                  │    │                          │  │
│  │  • get_secret    │    │ • list_versions  │    │  • delete_secret         │  │
│  │  • set_secret    │    │ • get_version    │    │  • recover_deleted       │  │
│  │  • list_secrets  │    │                  │    │  • purge_deleted         │  │
│  │                  │    │                  │    │  • backup_secret         │  │
│  │                  │    │                  │    │  • restore_secret        │  │
│  └────────┬─────────┘    └────────┬─────────┘    └────────────┬─────────────┘  │
│           │                       │                           │                 │
│           └───────────────────────┼───────────────────────────┘                 │
│                                   ▼                                             │
│                    ┌──────────────────────────┐                                 │
│                    │      SecretParser        │                                 │
│                    │  • parse_response        │                                 │
│                    │  • parse_properties      │                                 │
│                    │  • extract_identifiers   │                                 │
│                    └──────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                            KeysService                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │   KeyMgmtOps     │    │   CryptoOps      │    │    WrapOps               │  │
│  │                  │    │                  │    │                          │  │
│  │  • create_key    │    │  • encrypt       │    │  • wrap_key              │  │
│  │  • get_key       │    │  • decrypt       │    │  • unwrap_key            │  │
│  │  • list_keys     │    │  • sign          │    │                          │  │
│  │  • delete_key    │    │  • verify        │    │                          │  │
│  │  • rotate_key    │    │                  │    │                          │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
│                                                                                  │
│                    ┌──────────────────────────┐                                 │
│                    │   AlgorithmValidator     │                                 │
│                    │  • validate_encrypt_alg  │                                 │
│                    │  • validate_sign_alg     │                                 │
│                    │  • validate_wrap_alg     │                                 │
│                    └──────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Cache Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             Cache System                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        CacheManager                                      │   │
│  │                                                                          │   │
│  │   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐    │   │
│  │   │  secrets   │   │   keys     │   │   certs    │   │  negative  │    │   │
│  │   │  cache     │   │   cache    │   │   cache    │   │   cache    │    │   │
│  │   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘    │   │
│  │         │                │                │                │           │   │
│  │         └────────────────┴────────┬───────┴────────────────┘           │   │
│  │                                   ▼                                     │   │
│  │                    ┌──────────────────────────┐                         │   │
│  │                    │      CacheEntry<T>       │                         │   │
│  │                    │  • value: T              │                         │   │
│  │                    │  • created_at            │                         │   │
│  │                    │  • expires_at            │                         │   │
│  │                    │  • access_count          │                         │   │
│  │                    └──────────────────────────┘                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Cache Key Format: {vault_host}:{object_type}:{name}:{version|"latest"}         │
│                                                                                  │
│  Eviction Strategy:                                                              │
│  1. TTL expiration (configurable, default 5 min)                                │
│  2. LRU when max_entries reached                                                │
│  3. Explicit invalidation on mutations                                          │
│                                                                                  │
│  Refresh-Ahead:                                                                  │
│  • Trigger at 80% of TTL elapsed                                                │
│  • Background refresh, serve stale while refreshing                             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Get Secret Flow

```
┌────────┐     ┌─────────────┐     ┌───────────┐     ┌───────────┐     ┌─────────┐
│ Client │     │KeyVaultClient│    │SecretsService│   │   Cache   │     │ Azure   │
└───┬────┘     └──────┬──────┘     └─────┬─────┘     └─────┬─────┘     │Key Vault│
    │                 │                   │                 │          └────┬────┘
    │  get_secret()   │                   │                 │               │
    │────────────────>│                   │                 │               │
    │                 │                   │                 │               │
    │                 │   get_secret()    │                 │               │
    │                 │──────────────────>│                 │               │
    │                 │                   │                 │               │
    │                 │                   │   cache.get()   │               │
    │                 │                   │────────────────>│               │
    │                 │                   │                 │               │
    │                 │                   │<─ ─ ─ ─ ─ ─ ─ ─ │               │
    │                 │                   │   cache miss    │               │
    │                 │                   │                 │               │
    │                 │                   │          GET /secrets/{name}    │
    │                 │                   │────────────────────────────────>│
    │                 │                   │                 │               │
    │                 │                   │<────────────────────────────────│
    │                 │                   │           200 OK + JSON         │
    │                 │                   │                 │               │
    │                 │                   │   cache.set()   │               │
    │                 │                   │────────────────>│               │
    │                 │                   │                 │               │
    │                 │<──────────────────│                 │               │
    │                 │     Secret        │                 │               │
    │<────────────────│                   │                 │               │
    │     Secret      │                   │                 │               │
```

### 4.2 Encrypt/Decrypt Flow

```
┌────────┐     ┌─────────────┐     ┌───────────┐     ┌─────────────────────────┐
│ Client │     │KeyVaultClient│    │KeysService│     │   Azure Key Vault       │
└───┬────┘     └──────┬──────┘     └─────┬─────┘     └───────────┬─────────────┘
    │                 │                   │                       │
    │ encrypt(key,    │                   │                       │
    │  algorithm,     │                   │                       │
    │  plaintext)     │                   │                       │
    │────────────────>│                   │                       │
    │                 │                   │                       │
    │                 │  validate_key()   │                       │
    │                 │──────────────────>│                       │
    │                 │                   │                       │
    │                 │  validate_alg()   │                       │
    │                 │──────────────────>│                       │
    │                 │                   │                       │
    │                 │   encrypt()       │                       │
    │                 │──────────────────>│                       │
    │                 │                   │                       │
    │                 │                   │ POST /keys/{name}/encrypt
    │                 │                   │ { alg, value }        │
    │                 │                   │──────────────────────>│
    │                 │                   │                       │
    │                 │                   │<──────────────────────│
    │                 │                   │  { kid, value }       │
    │                 │                   │                       │
    │                 │<──────────────────│                       │
    │                 │  EncryptResult    │                       │
    │<────────────────│                   │                       │
    │  EncryptResult  │                   │                       │
    │  (ciphertext)   │                   │                       │
```

### 4.3 Secret Rotation Flow

```
┌────────────┐   ┌─────────────┐   ┌───────────────┐   ┌─────────────┐   ┌─────────┐
│RotationJob │   │KeyVaultClient│  │SecretsService │   │RotationHandler│ │External │
└─────┬──────┘   └──────┬──────┘   └───────┬───────┘   └──────┬──────┘   │ System  │
      │                 │                   │                  │          └────┬────┘
      │ check_expiring()│                   │                  │               │
      │────────────────>│                   │                  │               │
      │                 │                   │                  │               │
      │                 │  list_secrets()   │                  │               │
      │                 │──────────────────>│                  │               │
      │                 │                   │                  │               │
      │                 │<──────────────────│                  │               │
      │                 │ [secrets w/expiry]│                  │               │
      │                 │                   │                  │               │
      │ FOR each expiring secret:          │                  │               │
      │                 │                   │                  │               │
      │                 │ on_near_expiry()  │                  │               │
      │                 │─────────────────────────────────────>│               │
      │                 │                   │                  │               │
      │                 │                   │                  │  rotate()     │
      │                 │                   │                  │──────────────>│
      │                 │                   │                  │               │
      │                 │                   │                  │<──────────────│
      │                 │                   │                  │  new_value    │
      │                 │                   │                  │               │
      │                 │ set_secret(new_value)                │               │
      │                 │<─────────────────────────────────────│               │
      │                 │                   │                  │               │
      │                 │  set_secret()     │                  │               │
      │                 │──────────────────>│                  │               │
      │                 │                   │                  │               │
      │                 │<──────────────────│                  │               │
      │                 │   new Secret      │                  │               │
      │                 │                   │                  │               │
      │                 │ on_secret_rotated()                  │               │
      │                 │─────────────────────────────────────>│               │
      │<────────────────│                   │                  │               │
      │   complete      │                   │                  │               │
```

---

## 5. Module Structure

### 5.1 Rust Module Layout

```
integrations/
└── azure/
    └── key-vault/
        └── rust/
            ├── Cargo.toml
            ├── src/
            │   ├── lib.rs                    # Public exports
            │   ├── client.rs                 # KeyVaultClient
            │   ├── config.rs                 # Configuration
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── secrets.rs            # SecretsService
            │   │   ├── keys.rs               # KeysService
            │   │   └── certificates.rs       # CertificatesService
            │   │
            │   ├── cache/
            │   │   ├── mod.rs
            │   │   ├── manager.rs            # CacheManager
            │   │   ├── entry.rs              # CacheEntry
            │   │   └── policy.rs             # Eviction policies
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── http.rs               # HTTP transport
            │   │   └── auth.rs               # Auth integration
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── secret.rs             # Secret, SecretProperties
            │   │   ├── key.rs                # Key, KeyProperties, JWK
            │   │   ├── certificate.rs        # Certificate types
            │   │   ├── crypto.rs             # Algorithm enums
            │   │   └── common.rs             # Shared types
            │   │
            │   ├── rotation/
            │   │   ├── mod.rs
            │   │   ├── handler.rs            # RotationHandler trait
            │   │   └── monitor.rs            # ExpiryMonitor
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_client.rs        # MockKeyVaultClient
            │   │   └── replay.rs             # AccessLogReplay
            │   │
            │   ├── error.rs                  # KeyVaultError
            │   └── validation.rs             # Input validators
            │
            └── tests/
                ├── unit/
                ├── integration/
                └── fixtures/
```

### 5.2 TypeScript Module Layout

```
integrations/
└── azure/
    └── key-vault/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts                  # Public exports
            │   ├── client.ts                 # KeyVaultClient
            │   ├── config.ts                 # Configuration
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── secrets.ts            # SecretsService
            │   │   ├── keys.ts               # KeysService
            │   │   └── certificates.ts       # CertificatesService
            │   │
            │   ├── cache/
            │   │   ├── index.ts
            │   │   ├── manager.ts            # CacheManager
            │   │   └── entry.ts              # CacheEntry
            │   │
            │   ├── transport/
            │   │   ├── index.ts
            │   │   ├── http.ts               # HTTP transport
            │   │   └── auth.ts               # Auth integration
            │   │
            │   ├── types/
            │   │   ├── index.ts
            │   │   ├── secret.ts
            │   │   ├── key.ts
            │   │   ├── certificate.ts
            │   │   └── crypto.ts
            │   │
            │   ├── rotation/
            │   │   ├── index.ts
            │   │   ├── handler.ts
            │   │   └── monitor.ts
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   ├── mockClient.ts
            │   │   └── replay.ts
            │   │
            │   ├── error.ts
            │   └── validation.ts
            │
            └── tests/
```

---

## 6. Integration with Shared Modules

### 6.1 Dependency Integration Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Azure Key Vault Integration                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                         ┌─────────────────────┐                                 │
│                         │  KeyVaultClient     │                                 │
│                         └──────────┬──────────┘                                 │
│                                    │                                            │
│         ┌──────────────────────────┼──────────────────────────┐                │
│         │                          │                          │                 │
│         ▼                          ▼                          ▼                 │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐           │
│  │azure/auth   │           │shared/      │           │shared/      │           │
│  │             │           │resilience   │           │observability│           │
│  │• Credential │           │             │           │             │           │
│  │  Chain      │           │• Retry      │           │• Metrics    │           │
│  │• Token      │           │• Circuit    │           │• Tracing    │           │
│  │  Refresh    │           │  Breaker    │           │• Logging    │           │
│  │• Managed    │           │• Rate Limit │           │             │           │
│  │  Identity   │           │             │           │             │           │
│  └─────────────┘           └─────────────┘           └─────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

Integration Points:

┌────────────────────┬────────────────────────────────────────────────────────────┐
│ Shared Module      │ Integration Point                                          │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ azure/auth         │ • get_token("https://vault.azure.net/.default")            │
│                    │ • Automatic token refresh                                  │
│                    │ • DefaultAzureCredential chain                             │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/resilience  │ • RetryPolicy for transient errors (429, 503)              │
│                    │ • CircuitBreaker per vault URL                             │
│                    │ • RateLimiter respecting Azure limits                      │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/observability│ • Metrics: operation latency, cache hits, errors          │
│                    │ • Traces: span per operation with attributes               │
│                    │ • Logs: structured logging (no secret values)              │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ integrations-logging│ • LogContext for correlation                              │
│                    │ • Secret masking middleware                                │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ integrations-tracing│ • Distributed trace context propagation                   │
│                    │ • Span attributes for vault operations                     │
└────────────────────┴────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Secret Value Protection

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Secret Value Lifecycle                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Network    │    │   Memory     │    │    Cache     │    │   Output     │  │
│  │   (TLS 1.2+) │───>│ (SecretString)│───>│ (Encrypted?) │───>│  (Masked)    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                                                  │
│  Protection Layers:                                                              │
│                                                                                  │
│  1. Transport: TLS 1.2+ with Azure certificate validation                       │
│  2. In-Memory: SecretString wrapper (secrecy crate)                             │
│     • Prevents accidental logging via Debug/Display                             │
│     • Zeroizes memory on drop                                                   │
│  3. Cache: Optional encryption at rest                                          │
│  4. Output: Never include in logs, traces, or errors                            │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  SecretString Implementation                                             │   │
│  │                                                                          │   │
│  │  struct SecretString(Secret<String>);                                    │   │
│  │                                                                          │   │
│  │  impl SecretString {                                                     │   │
│  │      fn expose_secret(&self) -> &str;  // Explicit access only          │   │
│  │  }                                                                       │   │
│  │                                                                          │   │
│  │  impl Debug for SecretString {                                           │   │
│  │      fn fmt(&self, f) { write!(f, "[REDACTED]") }                       │   │
│  │  }                                                                       │   │
│  │                                                                          │   │
│  │  impl Drop for SecretString {                                            │   │
│  │      fn drop(&mut self) { self.0.zeroize(); }                           │   │
│  │  }                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Azure Authentication Flow                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    DefaultAzureCredential Chain                          │   │
│  │                                                                          │   │
│  │  1. Environment Variables    ─┐                                          │   │
│  │     (AZURE_CLIENT_ID, etc)    │                                          │   │
│  │                               │                                          │   │
│  │  2. Managed Identity         ─┼──> First successful = Token             │   │
│  │     (System or User)          │                                          │   │
│  │                               │                                          │   │
│  │  3. Azure CLI                ─┤                                          │   │
│  │     (az login)                │                                          │   │
│  │                               │                                          │   │
│  │  4. Azure PowerShell         ─┘                                          │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Token Lifecycle:                                                                │
│  • Scope: https://vault.azure.net/.default                                      │
│  • Cache: In-memory with expiry tracking                                        │
│  • Refresh: Automatic before expiration (5 min buffer)                          │
│  • Retry: On 401, refresh token and retry once                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Error Handling Flow                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  HTTP Response                                                                   │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────────┐                                                            │
│  │ Status Code     │                                                            │
│  │ Parser          │                                                            │
│  └────────┬────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        Error Classification                              │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   │   │
│  │  │  401    │   │  403    │   │  404    │   │  429    │   │ 5xx     │   │   │
│  │  │ AuthErr │   │ Access  │   │ NotFound│   │ Rate    │   │ Server  │   │   │
│  │  │         │   │ Denied  │   │         │   │ Limited │   │ Error   │   │   │
│  │  └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   │   │
│  │       │             │             │             │             │         │   │
│  │       ▼             ▼             ▼             ▼             ▼         │   │
│  │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   │   │
│  │  │Refresh  │   │  Fail   │   │  Fail   │   │ Retry   │   │ Retry   │   │   │
│  │  │Token &  │   │  Fast   │   │  Fast   │   │ After   │   │ Backoff │   │   │
│  │  │Retry    │   │         │   │         │   │ Header  │   │         │   │   │
│  │  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘   │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Circuit Breaker States:                                                         │
│  ┌────────┐     5 failures     ┌────────┐     30s timeout    ┌───────────┐     │
│  │ Closed │ ─────────────────> │  Open  │ ─────────────────> │ Half-Open │     │
│  └────────┘                    └────────┘                    └───────────┘     │
│       ▲                             │                              │            │
│       │                             │                              │            │
│       │         fail fast           │         1 success           │            │
│       └─────────────────────────────┴──────────────────────────────┘            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Deployment Scenarios                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Scenario 1: Azure VM/Container with Managed Identity                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐ │  │
│  │  │ Application │────>│ Key Vault   │────>│ Azure Key Vault             │ │  │
│  │  │ (AKS/ACI)   │     │ Integration │     │ (vault.azure.net)           │ │  │
│  │  └─────────────┘     └─────────────┘     └─────────────────────────────┘ │  │
│  │        │                    │                                             │  │
│  │        │                    │  No credentials in config                   │  │
│  │        │                    │  Token from IMDS endpoint                   │  │
│  │        ▼                    ▼                                             │  │
│  │  ┌─────────────────────────────────────┐                                 │  │
│  │  │ Azure Instance Metadata Service     │                                 │  │
│  │  │ (169.254.169.254)                   │                                 │  │
│  │  └─────────────────────────────────────┘                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Scenario 2: External with Service Principal                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐ │  │
│  │  │ Application │────>│ Key Vault   │────>│ Azure Key Vault             │ │  │
│  │  │ (On-prem)   │     │ Integration │     │ (vault.azure.net)           │ │  │
│  │  └─────────────┘     └─────────────┘     └─────────────────────────────┘ │  │
│  │        │                    │                                             │  │
│  │        │                    │  AZURE_TENANT_ID                            │  │
│  │        │                    │  AZURE_CLIENT_ID                            │  │
│  │        │                    │  AZURE_CLIENT_SECRET                        │  │
│  │        ▼                    ▼                                             │  │
│  │  ┌─────────────────────────────────────┐                                 │  │
│  │  │ Azure AD Token Endpoint             │                                 │  │
│  │  │ (login.microsoftonline.com)         │                                 │  │
│  │  └─────────────────────────────────────┘                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Test Layer Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        Unit Tests                                        │   │
│  │  • Service logic with mocked transport                                   │   │
│  │  • Cache operations                                                      │   │
│  │  • Error mapping                                                         │   │
│  │  • Validation functions                                                  │   │
│  │  • Parser functions                                                      │   │
│  │  Coverage Target: >90%                                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Integration Tests                                    │   │
│  │  • MockKeyVaultClient tests                                              │   │
│  │  • HTTP mock server (wiremock)                                           │   │
│  │  • Full request/response flow                                            │   │
│  │  • Retry and circuit breaker behavior                                    │   │
│  │  Coverage Target: All API operations                                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        E2E Tests (Gated)                                 │   │
│  │  • Real Azure Key Vault                                                  │   │
│  │  • Requires: AZURE_KEYVAULT_URL, credentials                             │   │
│  │  • Gated by: KEYVAULT_E2E_TESTS=true                                     │   │
│  │  Coverage: Happy paths only                                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Test Fixtures:                                                                  │
│  ├── fixtures/                                                                  │
│  │   ├── secrets/                                                               │
│  │   │   ├── get_secret_response.json                                          │
│  │   │   ├── list_secrets_response.json                                        │
│  │   │   └── set_secret_response.json                                          │
│  │   ├── keys/                                                                  │
│  │   │   ├── create_key_response.json                                          │
│  │   │   ├── encrypt_response.json                                             │
│  │   │   └── sign_response.json                                                │
│  │   └── errors/                                                                │
│  │       ├── not_found.json                                                    │
│  │       ├── access_denied.json                                                │
│  │       └── rate_limited.json                                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-azure-key-vault.md | Complete |
| 2. Pseudocode | pseudocode-azure-key-vault.md | Complete |
| 3. Architecture | architecture-azure-key-vault.md | Complete |
| 4. Refinement | refinement-azure-key-vault.md | Pending |
| 5. Completion | completion-azure-key-vault.md | Pending |

---

*Phase 3: Architecture - Complete*
