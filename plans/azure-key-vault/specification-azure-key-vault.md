# Azure Key Vault Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure/key-vault`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements, interfaces, and constraints for the Azure Key Vault Integration Module. It serves as a thin adapter layer enabling the LLM Dev Ops platform to securely access secrets, keys, and certificates stored in Azure Key Vault while leveraging shared repository infrastructure.

### 1.2 Methodology

- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Azure Key Vault Integration Module provides a production-ready, type-safe interface for Azure Key Vault operations. It is a **thin adapter layer** that:
- Retrieves secrets with version support and caching
- Manages cryptographic keys for encrypt/decrypt/sign/verify operations
- Accesses certificates for TLS and authentication
- Supports secret rotation workflows with event hooks
- Provides access scoping via RBAC-aware operations
- Enables audit trail access for compliance
- Supports simulation and replay of secret access for testing
- Leverages existing Azure credential chain from `azure/auth`
- Delegates resilience, observability, and state to shared primitives

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Secret Management** | Get, set, list, delete secrets with versioning |
| **Key Operations** | Create keys, encrypt, decrypt, sign, verify, wrap, unwrap |
| **Certificate Access** | Get, list certificates and policies |
| **Version Control** | Access specific secret/key versions |
| **Rotation Support** | Hooks for rotation events, near-expiry detection |
| **Access Scoping** | Respect vault-level and object-level permissions |
| **Audit Integration** | Surface audit logs for compliance |
| **Simulation Mode** | Replay secret access patterns for testing |
| **Credential Delegation** | Use shared Azure credential chain |
| **Resilience Hooks** | Integrate with shared retry, circuit breaker |
| **Observability Hooks** | Emit metrics and traces via shared primitives |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Secrets API | GetSecret, SetSecret, ListSecrets, DeleteSecret, BackupSecret, RestoreSecret |
| Keys API | CreateKey, GetKey, ListKeys, Encrypt, Decrypt, Sign, Verify, WrapKey, UnwrapKey |
| Certificates API | GetCertificate, ListCertificates, GetCertificatePolicy |
| Versioning | Access specific versions, list versions |
| Soft Delete | Recover and purge deleted items |
| Rotation Events | Near-expiry detection, rotation hooks |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Vault Provisioning | Use Azure Portal/Terraform/ARM |
| Access Policy Management | Managed via Azure IAM |
| HSM Configuration | Hardware security module setup |
| Managed Identity Setup | Platform-level configuration |
| Key Vault Firewall Rules | Network configuration |
| Credential Implementation | Use shared `azure/auth` |
| Resilience Implementation | Use shared primitives |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate logic from shared modules |
| Async-first design | Network I/O bound operations |
| Caching with TTL | Reduce API calls, respect rate limits |
| Version-aware by default | Support rotation workflows |
| Shared credential chain | Reuse from azure/auth |
| Secret masking in logs | Never log secret values |

---

## 3. Dependency Policy

### 3.1 Allowed Internal Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| `azure/auth` | Azure credential chain (shared) | `@integrations/azure-auth` |
| `shared/resilience` | Retry, circuit breaker, rate limiting | `@integrations/resilience` |
| `shared/observability` | Logging, metrics, tracing | `@integrations/observability` |
| `integrations-logging` | Shared logging abstractions | `integrations_logging` |
| `integrations-tracing` | Distributed tracing | `integrations_tracing` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.11+ | HTTP client |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `chrono` | 0.4+ | Timestamp/expiry handling |
| `base64` | 0.21+ | Key material encoding |
| `secrecy` | 0.8+ | Secret value protection |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `undici` | 6.x | HTTP client |

---

## 4. API Coverage

### 4.1 Azure Key Vault REST API Endpoints

| Category | Operation | Endpoint | Service |
|----------|-----------|----------|---------|
| **Secrets** | Get Secret | `GET /secrets/{name}/{version}` | SecretsService |
| | Set Secret | `PUT /secrets/{name}` | SecretsService |
| | List Secrets | `GET /secrets` | SecretsService |
| | List Secret Versions | `GET /secrets/{name}/versions` | SecretsService |
| | Delete Secret | `DELETE /secrets/{name}` | SecretsService |
| | Backup Secret | `POST /secrets/{name}/backup` | SecretsService |
| | Restore Secret | `POST /secrets/restore` | SecretsService |
| | Recover Deleted | `POST /deletedsecrets/{name}/recover` | SecretsService |
| | Purge Deleted | `DELETE /deletedsecrets/{name}` | SecretsService |
| **Keys** | Create Key | `POST /keys/{name}/create` | KeysService |
| | Get Key | `GET /keys/{name}/{version}` | KeysService |
| | List Keys | `GET /keys` | KeysService |
| | List Key Versions | `GET /keys/{name}/versions` | KeysService |
| | Delete Key | `DELETE /keys/{name}` | KeysService |
| | Encrypt | `POST /keys/{name}/{version}/encrypt` | KeysService |
| | Decrypt | `POST /keys/{name}/{version}/decrypt` | KeysService |
| | Sign | `POST /keys/{name}/{version}/sign` | KeysService |
| | Verify | `POST /keys/{name}/{version}/verify` | KeysService |
| | Wrap Key | `POST /keys/{name}/{version}/wrapkey` | KeysService |
| | Unwrap Key | `POST /keys/{name}/{version}/unwrapkey` | KeysService |
| | Rotate Key | `POST /keys/{name}/rotate` | KeysService |
| **Certificates** | Get Certificate | `GET /certificates/{name}/{version}` | CertificatesService |
| | List Certificates | `GET /certificates` | CertificatesService |
| | Get Policy | `GET /certificates/{name}/policy` | CertificatesService |

### 4.2 API Version

- **Target API Version**: `7.4` (2023-07-01)
- **Base URL Pattern**: `https://{vault-name}.vault.azure.net`

---

## 5. Interface Definitions

### 5.1 Client Configuration

```rust
pub struct KeyVaultConfig {
    pub vault_url: String,              // https://{name}.vault.azure.net
    pub api_version: String,            // Default: "7.4"
    pub cache_ttl: Duration,            // Default: 5 minutes
    pub cache_enabled: bool,            // Default: true
    pub timeout: Duration,              // Default: 30 seconds
    pub max_retries: u32,               // Default: 3
}
```

```typescript
interface KeyVaultConfig {
  vaultUrl: string;
  apiVersion?: string;
  cacheTtl?: number;
  cacheEnabled?: boolean;
  timeout?: number;
  maxRetries?: number;
}
```

### 5.2 SecretsService Interface

```rust
#[async_trait]
pub trait SecretsService: Send + Sync {
    /// Get secret value (latest or specific version)
    async fn get_secret(&self, name: &str, version: Option<&str>) -> Result<Secret, KeyVaultError>;

    /// Set secret value (creates new version)
    async fn set_secret(&self, name: &str, value: SecretString, options: SetSecretOptions) -> Result<Secret, KeyVaultError>;

    /// List all secrets (metadata only, no values)
    async fn list_secrets(&self) -> Result<Vec<SecretProperties>, KeyVaultError>;

    /// List all versions of a secret
    async fn list_secret_versions(&self, name: &str) -> Result<Vec<SecretProperties>, KeyVaultError>;

    /// Delete secret (soft delete if enabled)
    async fn delete_secret(&self, name: &str) -> Result<DeletedSecret, KeyVaultError>;

    /// Recover soft-deleted secret
    async fn recover_deleted_secret(&self, name: &str) -> Result<Secret, KeyVaultError>;

    /// Permanently delete secret
    async fn purge_deleted_secret(&self, name: &str) -> Result<(), KeyVaultError>;

    /// Backup secret for disaster recovery
    async fn backup_secret(&self, name: &str) -> Result<BackupBlob, KeyVaultError>;

    /// Restore secret from backup
    async fn restore_secret(&self, backup: &BackupBlob) -> Result<Secret, KeyVaultError>;
}
```

### 5.3 KeysService Interface

```rust
#[async_trait]
pub trait KeysService: Send + Sync {
    /// Create a new key
    async fn create_key(&self, name: &str, key_type: KeyType, options: CreateKeyOptions) -> Result<Key, KeyVaultError>;

    /// Get key (latest or specific version)
    async fn get_key(&self, name: &str, version: Option<&str>) -> Result<Key, KeyVaultError>;

    /// List all keys (metadata only)
    async fn list_keys(&self) -> Result<Vec<KeyProperties>, KeyVaultError>;

    /// List all versions of a key
    async fn list_key_versions(&self, name: &str) -> Result<Vec<KeyProperties>, KeyVaultError>;

    /// Delete key (soft delete if enabled)
    async fn delete_key(&self, name: &str) -> Result<DeletedKey, KeyVaultError>;

    /// Rotate key (create new version)
    async fn rotate_key(&self, name: &str) -> Result<Key, KeyVaultError>;

    /// Encrypt data with key
    async fn encrypt(&self, name: &str, version: Option<&str>, algorithm: EncryptionAlgorithm, plaintext: &[u8]) -> Result<EncryptResult, KeyVaultError>;

    /// Decrypt data with key
    async fn decrypt(&self, name: &str, version: Option<&str>, algorithm: EncryptionAlgorithm, ciphertext: &[u8]) -> Result<DecryptResult, KeyVaultError>;

    /// Sign data with key
    async fn sign(&self, name: &str, version: Option<&str>, algorithm: SignatureAlgorithm, digest: &[u8]) -> Result<SignResult, KeyVaultError>;

    /// Verify signature
    async fn verify(&self, name: &str, version: Option<&str>, algorithm: SignatureAlgorithm, digest: &[u8], signature: &[u8]) -> Result<VerifyResult, KeyVaultError>;

    /// Wrap (encrypt) a key
    async fn wrap_key(&self, name: &str, version: Option<&str>, algorithm: KeyWrapAlgorithm, key: &[u8]) -> Result<WrapResult, KeyVaultError>;

    /// Unwrap (decrypt) a key
    async fn unwrap_key(&self, name: &str, version: Option<&str>, algorithm: KeyWrapAlgorithm, encrypted_key: &[u8]) -> Result<UnwrapResult, KeyVaultError>;
}
```

### 5.4 CertificatesService Interface

```rust
#[async_trait]
pub trait CertificatesService: Send + Sync {
    /// Get certificate (latest or specific version)
    async fn get_certificate(&self, name: &str, version: Option<&str>) -> Result<Certificate, KeyVaultError>;

    /// List all certificates (metadata only)
    async fn list_certificates(&self) -> Result<Vec<CertificateProperties>, KeyVaultError>;

    /// List all versions of a certificate
    async fn list_certificate_versions(&self, name: &str) -> Result<Vec<CertificateProperties>, KeyVaultError>;

    /// Get certificate policy
    async fn get_certificate_policy(&self, name: &str) -> Result<CertificatePolicy, KeyVaultError>;
}
```

### 5.5 Core Types

```rust
/// Secret with value (value protected by secrecy crate)
pub struct Secret {
    pub id: String,                      // Full secret identifier URL
    pub name: String,
    pub value: SecretString,             // Protected value
    pub properties: SecretProperties,
}

pub struct SecretProperties {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub expires: Option<DateTime<Utc>>,
    pub not_before: Option<DateTime<Utc>>,
    pub content_type: Option<String>,
    pub tags: HashMap<String, String>,
    pub recovery_level: RecoveryLevel,
}

pub struct SetSecretOptions {
    pub content_type: Option<String>,
    pub enabled: Option<bool>,
    pub expires: Option<DateTime<Utc>>,
    pub not_before: Option<DateTime<Utc>>,
    pub tags: Option<HashMap<String, String>>,
}

/// Cryptographic key
pub struct Key {
    pub id: String,
    pub name: String,
    pub key_material: JsonWebKey,
    pub properties: KeyProperties,
}

pub struct KeyProperties {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub expires: Option<DateTime<Utc>>,
    pub not_before: Option<DateTime<Utc>>,
    pub key_ops: Vec<KeyOperation>,
    pub key_type: KeyType,
    pub tags: HashMap<String, String>,
    pub managed: bool,                   // Managed by certificate
}

pub enum KeyType {
    Ec,           // Elliptic Curve
    EcHsm,        // EC in HSM
    Rsa,          // RSA
    RsaHsm,       // RSA in HSM
    Oct,          // Symmetric (AES)
    OctHsm,       // Symmetric in HSM
}

pub enum KeyOperation {
    Encrypt,
    Decrypt,
    Sign,
    Verify,
    WrapKey,
    UnwrapKey,
}

pub enum EncryptionAlgorithm {
    RsaOaep,
    RsaOaep256,
    Rsa15,
    A128Gcm,
    A192Gcm,
    A256Gcm,
    A128Cbc,
    A192Cbc,
    A256Cbc,
}

pub enum SignatureAlgorithm {
    Rs256,
    Rs384,
    Rs512,
    Ps256,
    Ps384,
    Ps512,
    Es256,
    Es384,
    Es512,
    Es256K,
}

/// Certificate
pub struct Certificate {
    pub id: String,
    pub name: String,
    pub cer: Vec<u8>,                    // X.509 certificate (DER)
    pub properties: CertificateProperties,
    pub policy: Option<CertificatePolicy>,
}

pub struct CertificateProperties {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub expires: Option<DateTime<Utc>>,
    pub not_before: Option<DateTime<Utc>>,
    pub thumbprint: String,
    pub tags: HashMap<String, String>,
}

pub struct CertificatePolicy {
    pub issuer: IssuerParameters,
    pub key_properties: KeyProperties,
    pub lifetime_actions: Vec<LifetimeAction>,
    pub x509_properties: X509Properties,
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```rust
#[derive(Debug, thiserror::Error)]
pub enum KeyVaultError {
    // Authentication & Authorization
    #[error("Authentication failed: {message}")]
    AuthenticationFailed { message: String },

    #[error("Access denied to {resource}: {message}")]
    AccessDenied { resource: String, message: String },

    // Resource Errors
    #[error("Secret not found: {name}")]
    SecretNotFound { name: String },

    #[error("Key not found: {name}")]
    KeyNotFound { name: String },

    #[error("Certificate not found: {name}")]
    CertificateNotFound { name: String },

    #[error("Version not found: {name}/{version}")]
    VersionNotFound { name: String, version: String },

    // State Errors
    #[error("Resource disabled: {name}")]
    ResourceDisabled { name: String },

    #[error("Resource deleted: {name}")]
    ResourceDeleted { name: String },

    #[error("Secret expired: {name}")]
    SecretExpired { name: String },

    // Cryptographic Errors
    #[error("Unsupported algorithm: {algorithm}")]
    UnsupportedAlgorithm { algorithm: String },

    #[error("Invalid key operation: {operation} not allowed for key {key}")]
    InvalidKeyOperation { key: String, operation: String },

    #[error("Decryption failed: {message}")]
    DecryptionFailed { message: String },

    #[error("Signature verification failed")]
    SignatureVerificationFailed,

    // Rate Limiting
    #[error("Rate limited: retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },

    // Server Errors
    #[error("Service unavailable: {message}")]
    ServiceUnavailable { message: String },

    #[error("Internal server error: {message}")]
    InternalError { message: String },

    // Network Errors
    #[error("Connection error: {message}")]
    ConnectionError { message: String },

    #[error("Request timeout after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },

    // Validation Errors
    #[error("Invalid secret name: {name}")]
    InvalidSecretName { name: String },

    #[error("Secret value too large: {size} bytes (max {max_size})")]
    SecretTooLarge { size: usize, max_size: usize },
}
```

### 6.2 HTTP Status Code Mapping

| HTTP Status | Error Type |
|-------------|------------|
| 401 | `AuthenticationFailed` |
| 403 | `AccessDenied` |
| 404 | `SecretNotFound` / `KeyNotFound` / `CertificateNotFound` |
| 409 | `ResourceDeleted` (conflict with soft-delete) |
| 429 | `RateLimited` |
| 500 | `InternalError` |
| 503 | `ServiceUnavailable` |

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

| Error Type | Retryable | Strategy |
|------------|-----------|----------|
| `RateLimited` | Yes | Respect `Retry-After` header |
| `ServiceUnavailable` | Yes | Exponential backoff |
| `InternalError` | Yes | Exponential backoff |
| `Timeout` | Yes | Linear retry |
| `ConnectionError` | Yes | Exponential backoff |
| `AuthenticationFailed` | No | Fail fast |
| `AccessDenied` | No | Fail fast |
| `SecretNotFound` | No | Fail fast |
| `InvalidKeyOperation` | No | Fail fast |

### 7.2 Circuit Breaker

- **Scope**: Per vault URL
- **Failure threshold**: 5 failures in 60 seconds
- **Recovery timeout**: 30 seconds
- **Half-open requests**: 1

### 7.3 Rate Limiting

Azure Key Vault limits (per vault):
- **Transactions**: 4,000/10 seconds (standard), 8,000/10 seconds (premium)
- **RSA operations**: 1,000/10 seconds (HSM), 2,000/10 seconds (HSM-premium)

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Credential source | Delegate to `azure/auth` (DefaultAzureCredential) |
| Token caching | Managed by credential provider |
| Supported auth | Managed Identity, Service Principal, CLI, Environment |
| Scope | `https://vault.azure.net/.default` |

### 8.2 Secret Protection

| Requirement | Implementation |
|-------------|----------------|
| In-memory protection | Use `secrecy::SecretString` |
| Log masking | Never log secret values |
| Trace masking | Redact values in spans |
| Cache encryption | Optional at-rest encryption |
| Secure disposal | Zeroize on drop |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS version | TLS 1.2+ required |
| Certificate validation | Verify Azure certificate chain |
| Hostname verification | Required |

---

## 9. Observability Requirements

### 9.1 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `keyvault_operation_duration_ms` | Histogram | `operation`, `vault`, `status` |
| `keyvault_operation_total` | Counter | `operation`, `vault`, `status` |
| `keyvault_cache_hits` | Counter | `vault`, `object_type` |
| `keyvault_cache_misses` | Counter | `vault`, `object_type` |
| `keyvault_secret_expiry_days` | Gauge | `vault`, `secret_name` |
| `keyvault_errors_total` | Counter | `vault`, `error_type` |

### 9.2 Tracing

| Span | Attributes |
|------|------------|
| `keyvault.get_secret` | `vault`, `secret_name`, `version`, `cache_hit` |
| `keyvault.set_secret` | `vault`, `secret_name`, `content_type` |
| `keyvault.encrypt` | `vault`, `key_name`, `algorithm` |
| `keyvault.decrypt` | `vault`, `key_name`, `algorithm` |
| `keyvault.sign` | `vault`, `key_name`, `algorithm` |
| `keyvault.verify` | `vault`, `key_name`, `algorithm`, `valid` |

### 9.3 Logging

| Level | Event |
|-------|-------|
| DEBUG | Cache hit/miss |
| INFO | Secret accessed (name only), key operation completed |
| WARN | Secret near expiry, deprecated algorithm used |
| ERROR | Operation failed, authentication error |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | P50 | P99 |
|-----------|-----|-----|
| Get secret (cached) | <1ms | <5ms |
| Get secret (API call) | <100ms | <500ms |
| Encrypt/Decrypt | <200ms | <1000ms |
| Sign/Verify | <200ms | <1000ms |
| List secrets | <300ms | <1500ms |

### 10.2 Caching Strategy

```rust
pub struct CacheConfig {
    pub enabled: bool,                   // Default: true
    pub ttl: Duration,                   // Default: 5 minutes
    pub max_entries: usize,              // Default: 1000
    pub negative_ttl: Duration,          // Default: 30 seconds
    pub refresh_ahead: bool,             // Default: true
    pub refresh_threshold: f32,          // Default: 0.8 (80% of TTL)
}
```

- **Cache key**: `{vault_url}:{object_type}:{name}:{version}`
- **Invalidation**: On set/delete operations
- **Refresh-ahead**: Proactive refresh at 80% TTL

---

## 11. Rotation Support

### 11.1 Rotation Event Hooks

```rust
pub trait RotationHandler: Send + Sync {
    /// Called when a secret is near expiry
    async fn on_near_expiry(&self, secret: &SecretProperties, days_until_expiry: i64);

    /// Called when a new secret version is created
    async fn on_secret_rotated(&self, secret: &Secret, previous_version: &str);

    /// Called when a key is rotated
    async fn on_key_rotated(&self, key: &Key, previous_version: &str);
}
```

### 11.2 Expiry Monitoring

- **Check interval**: Configurable (default: 1 hour)
- **Warning thresholds**: 30 days, 7 days, 1 day
- **Metric exposure**: `keyvault_secret_expiry_days` gauge

---

## 12. Testing and Simulation

### 12.1 Simulation Mode

```rust
pub struct MockKeyVaultClient {
    secrets: HashMap<String, Vec<Secret>>,
    keys: HashMap<String, Vec<Key>>,
    access_log: Vec<AccessLogEntry>,
}

impl MockKeyVaultClient {
    /// Register a mock secret
    pub fn register_secret(&mut self, name: &str, value: &str, version: &str);

    /// Simulate access denied
    pub fn deny_access(&mut self, name: &str);

    /// Get access log for replay verification
    pub fn get_access_log(&self) -> &[AccessLogEntry];

    /// Replay recorded access patterns
    pub fn replay(&self, log: &[AccessLogEntry]) -> ReplayResult;
}

pub struct AccessLogEntry {
    pub timestamp: DateTime<Utc>,
    pub operation: String,
    pub object_name: String,
    pub version: Option<String>,
    pub result: AccessResult,
}
```

### 12.2 Test Fixtures

| Fixture | Purpose |
|---------|---------|
| `mock_secret_response.json` | Standard secret response |
| `mock_key_response.json` | Standard key response |
| `mock_certificate_response.json` | Standard certificate response |
| `error_not_found.json` | 404 error response |
| `error_access_denied.json` | 403 error response |
| `error_rate_limited.json` | 429 error with Retry-After |

---

## 13. Acceptance Criteria

### 13.1 Functional Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| F1 | Get secret by name returns latest version | Unit + Integration test |
| F2 | Get secret by version returns specific version | Unit + Integration test |
| F3 | Set secret creates new version | Unit + Integration test |
| F4 | List secrets returns metadata without values | Unit + Integration test |
| F5 | Delete secret performs soft-delete | Integration test |
| F6 | Encrypt/Decrypt round-trip succeeds | Unit + Integration test |
| F7 | Sign/Verify round-trip succeeds | Unit + Integration test |
| F8 | Cache returns cached value within TTL | Unit test |
| F9 | Cache invalidates on set/delete | Unit test |
| F10 | Near-expiry detection fires at threshold | Unit test |

### 13.2 Non-Functional Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| NF1 | P99 latency for cached gets < 5ms | Benchmark |
| NF2 | Secret values never appear in logs | Log audit |
| NF3 | Retries respect rate limit headers | Integration test |
| NF4 | Circuit breaker opens after failures | Unit test |
| NF5 | Metrics emitted for all operations | Integration test |
| NF6 | Traces include required attributes | Integration test |

### 13.3 Security Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| S1 | Use TLS 1.2+ for all connections | TLS audit |
| S2 | SecretString zeroized on drop | Memory audit |
| S3 | No secret values in error messages | Code review |
| S4 | Token refresh handled automatically | Integration test |

---

## 14. Service Summary

| Service | Operations | Primary Use Case |
|---------|------------|------------------|
| **SecretsService** | 9 operations | Secret storage and retrieval |
| **KeysService** | 12 operations | Cryptographic operations |
| **CertificatesService** | 4 operations | Certificate access |
| **RotationService** | 2 hooks | Rotation workflow support |
| **CacheService** | Internal | Performance optimization |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-azure-key-vault.md | Complete |
| 2. Pseudocode | pseudocode-azure-key-vault.md | Pending |
| 3. Architecture | architecture-azure-key-vault.md | Pending |
| 4. Refinement | refinement-azure-key-vault.md | Pending |
| 5. Completion | completion-azure-key-vault.md | Pending |

---

*Phase 1: Specification - Complete*
