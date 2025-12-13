# Azure Key Vault Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure/key-vault`

---

## 1. Implementation File Structure

### 1.1 Rust Implementation

```
integrations/
└── azure/
    └── key-vault/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public API exports
            │   ├── client.rs                   # KeyVaultClient implementation
            │   ├── config.rs                   # KeyVaultConfig and builders
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── secrets/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # SecretsService implementation
            │   │   │   ├── operations.rs       # CRUD operations
            │   │   │   ├── recovery.rs         # Backup/restore/recover/purge
            │   │   │   ├── request.rs          # Request types
            │   │   │   └── response.rs         # Response parsing
            │   │   ├── keys/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # KeysService implementation
            │   │   │   ├── management.rs       # Create/get/list/delete/rotate
            │   │   │   ├── crypto.rs           # Encrypt/decrypt/sign/verify
            │   │   │   ├── wrap.rs             # Wrap/unwrap operations
            │   │   │   ├── request.rs          # Request types
            │   │   │   └── response.rs         # Response parsing
            │   │   └── certificates/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # CertificatesService implementation
            │   │       ├── operations.rs       # Get/list/policy operations
            │   │       └── response.rs         # Response parsing
            │   │
            │   ├── cache/
            │   │   ├── mod.rs
            │   │   ├── manager.rs              # CacheManager implementation
            │   │   ├── entry.rs                # CacheEntry with TTL
            │   │   └── policy.rs               # Eviction policies (LRU)
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── http.rs                 # HTTP transport (reqwest)
            │   │   ├── auth.rs                 # Auth integration wrapper
            │   │   └── request.rs              # Request builder
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── secret.rs               # Secret, SecretProperties
            │   │   ├── key.rs                  # Key, KeyProperties, JsonWebKey
            │   │   ├── certificate.rs          # Certificate, CertificateProperties
            │   │   ├── crypto.rs               # Algorithm enums
            │   │   └── common.rs               # Shared types (timestamps, etc.)
            │   │
            │   ├── rotation/
            │   │   ├── mod.rs
            │   │   ├── handler.rs              # RotationHandler trait
            │   │   └── monitor.rs              # ExpiryMonitor implementation
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_client.rs          # MockKeyVaultClient
            │   │   ├── access_log.rs           # AccessLogEntry
            │   │   └── replay.rs               # Replay functionality
            │   │
            │   ├── error.rs                    # KeyVaultError enum
            │   └── validation.rs               # Input validators
            │
            └── tests/
                ├── unit/
                │   ├── services/
                │   │   ├── secrets_test.rs
                │   │   ├── keys_test.rs
                │   │   └── certificates_test.rs
                │   ├── cache/
                │   │   ├── manager_test.rs
                │   │   └── entry_test.rs
                │   ├── types/
                │   │   └── validation_test.rs
                │   └── error_test.rs
                │
                ├── integration/
                │   ├── common/
                │   │   └── mod.rs              # Test utilities, mock setup
                │   ├── secrets_integration_test.rs
                │   ├── keys_integration_test.rs
                │   ├── cache_integration_test.rs
                │   └── retry_integration_test.rs
                │
                ├── e2e/
                │   ├── mod.rs                  # E2E setup (real Azure)
                │   ├── secrets_e2e_test.rs
                │   └── keys_e2e_test.rs
                │
                ├── fixtures/
                │   ├── secrets/
                │   │   ├── get_secret.json
                │   │   ├── list_secrets.json
                │   │   └── set_secret.json
                │   ├── keys/
                │   │   ├── create_key.json
                │   │   ├── encrypt_response.json
                │   │   └── sign_response.json
                │   ├── certificates/
                │   │   └── get_certificate.json
                │   └── errors/
                │       ├── not_found.json
                │       ├── access_denied.json
                │       └── rate_limited.json
                │
                └── mocks/
                    ├── mod.rs
                    ├── transport.rs            # MockHttpTransport
                    └── responses.rs            # Canned responses
```

### 1.2 TypeScript Implementation

```
integrations/
└── azure/
    └── key-vault/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── README.md
            ├── src/
            │   ├── index.ts                    # Public exports
            │   ├── client.ts                   # KeyVaultClient
            │   ├── config.ts                   # Configuration
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── secrets/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts
            │   │   │   └── types.ts
            │   │   ├── keys/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts
            │   │   │   └── types.ts
            │   │   └── certificates/
            │   │       ├── index.ts
            │   │       ├── service.ts
            │   │       └── types.ts
            │   │
            │   ├── cache/
            │   │   ├── index.ts
            │   │   ├── manager.ts
            │   │   └── entry.ts
            │   │
            │   ├── transport/
            │   │   ├── index.ts
            │   │   ├── http.ts
            │   │   └── auth.ts
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
                ├── unit/
                ├── integration/
                └── mocks/
```

---

## 2. Implementation Order

### Phase 1: Core Infrastructure

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 1.1 | error.rs | shared/errors | KeyVaultError enum, error mapping |
| 1.2 | types/common.rs | chrono | Timestamps, RecoveryLevel |
| 1.3 | types/secret.rs | 1.2, secrecy | Secret, SecretProperties, SecretString |
| 1.4 | types/key.rs | 1.2 | Key, KeyProperties, JsonWebKey |
| 1.5 | types/crypto.rs | None | Algorithm enums |
| 1.6 | types/certificate.rs | 1.2 | Certificate, CertificateProperties |
| 1.7 | validation.rs | None | Name, URL, size validators |
| 1.8 | config.rs | 1.7 | KeyVaultConfig, builder |

### Phase 2: Transport Layer

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 2.1 | transport/auth.rs | azure/auth | Token acquisition wrapper |
| 2.2 | transport/request.rs | 2.1 | Request builder with auth |
| 2.3 | transport/http.rs | 2.2, reqwest | HTTP transport with retry |

### Phase 3: Cache Layer

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 3.1 | cache/entry.rs | Phase 1 | CacheEntry with TTL |
| 3.2 | cache/policy.rs | None | LRU eviction policy |
| 3.3 | cache/manager.rs | 3.1, 3.2 | CacheManager with refresh-ahead |

### Phase 4: Secrets Service

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 4.1 | secrets/response.rs | Phase 1 | Response parsing |
| 4.2 | secrets/request.rs | Phase 1 | Request types |
| 4.3 | secrets/operations.rs | 4.1, 4.2, Phase 2 | Get, set, list, delete |
| 4.4 | secrets/recovery.rs | 4.1, Phase 2 | Backup, restore, recover, purge |
| 4.5 | secrets/service.rs | 4.3, 4.4, Phase 3 | SecretsService facade |

### Phase 5: Keys Service

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 5.1 | keys/response.rs | Phase 1 | Response parsing |
| 5.2 | keys/request.rs | Phase 1 | Request types |
| 5.3 | keys/management.rs | 5.1, 5.2, Phase 2 | Create, get, list, delete, rotate |
| 5.4 | keys/crypto.rs | 5.1, Phase 2 | Encrypt, decrypt, sign, verify |
| 5.5 | keys/wrap.rs | 5.1, Phase 2 | Wrap, unwrap |
| 5.6 | keys/service.rs | 5.3-5.5, Phase 3 | KeysService facade |

### Phase 6: Certificates Service

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 6.1 | certificates/response.rs | Phase 1 | Response parsing |
| 6.2 | certificates/operations.rs | 6.1, Phase 2 | Get, list, policy |
| 6.3 | certificates/service.rs | 6.2, Phase 3 | CertificatesService facade |

### Phase 7: Rotation Support

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 7.1 | rotation/handler.rs | Phase 1 | RotationHandler trait |
| 7.2 | rotation/monitor.rs | 7.1, Phase 4 | ExpiryMonitor |

### Phase 8: Simulation

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 8.1 | simulation/access_log.rs | Phase 1 | AccessLogEntry |
| 8.2 | simulation/mock_client.rs | 8.1, Phases 4-6 | MockKeyVaultClient |
| 8.3 | simulation/replay.rs | 8.1, 8.2 | Replay functionality |

### Phase 9: Client Assembly

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 9.1 | client.rs | All phases | KeyVaultClient facade |
| 9.2 | lib.rs | 9.1 | Public API exports |

### Phase 10: Testing

| Order | Component | Dependencies | Deliverables |
|-------|-----------|--------------|--------------|
| 10.1 | Unit tests | Phases 1-8 | >90% coverage |
| 10.2 | Integration tests | Phase 9 | All operations |
| 10.3 | E2E tests | Phase 9 | Real Azure tests |

---

## 3. Cargo.toml / package.json

### 3.1 Rust Cargo.toml

```toml
[package]
name = "integrations-azure-keyvault"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "Azure Key Vault integration for LLM Dev Ops"
license = "LLM-Dev-Ops-PSA-1.0"
repository = "https://github.com/org/integrations"

[lib]
name = "integrations_azure_keyvault"
path = "src/lib.rs"

[dependencies]
# Shared primitives
integrations-azure-auth = { path = "../../azure/auth" }
integrations-shared-resilience = { path = "../../shared/resilience" }
integrations-shared-observability = { path = "../../shared/observability" }
integrations-shared-errors = { path = "../../shared/errors" }
integrations-logging = { path = "../../logging" }
integrations-tracing = { path = "../../tracing" }

# Async runtime
tokio = { version = "1.35", features = ["full", "sync", "time"] }
futures = "0.3"

# HTTP client
reqwest = { version = "0.11", features = ["rustls-tls", "json"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# Secret protection
secrecy = { version = "0.8", features = ["serde"] }
zeroize = "1.7"

# Cryptographic utilities
subtle = "2.5"           # Constant-time comparison
base64 = "0.21"

# Tracing
tracing = "0.1"

# Lazy initialization
once_cell = "1.19"

# Error handling
thiserror = "1.0"

# URL handling
url = "2.5"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
tempfile = "3.9"
test-case = "3.3"
pretty_assertions = "1.4"
async-trait = "0.1"

[features]
default = []
test-support = ["wiremock"]
e2e = []
simulation = []

[[test]]
name = "unit"
path = "tests/unit/mod.rs"

[[test]]
name = "integration"
path = "tests/integration/mod.rs"
required-features = ["test-support"]

[[test]]
name = "e2e"
path = "tests/e2e/mod.rs"
required-features = ["e2e"]
```

### 3.2 TypeScript package.json

```json
{
  "name": "@integrations/azure-keyvault",
  "version": "0.1.0",
  "description": "Azure Key Vault integration for LLM Dev Ops",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --testPathPattern=e2e",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "format": "prettier --write src tests"
  },
  "dependencies": {
    "@integrations/azure-auth": "workspace:*",
    "@integrations/shared-resilience": "workspace:*",
    "@integrations/shared-observability": "workspace:*",
    "@integrations/shared-errors": "workspace:*",
    "@integrations/logging": "workspace:*",
    "@integrations/tracing": "workspace:*"
  },
  "devDependencies": {
    "@types/jest": "^29.5.11",
    "@types/node": "^20.10.6",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "msw": "^2.0.11"
  },
  "peerDependencies": {
    "undici": "^6.2.1"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "LLM-Dev-Ops-PSA-1.0"
}
```

---

## 4. Public API Summary

### 4.1 Rust Public Exports

```rust
// lib.rs - Public API

// Client
pub use client::KeyVaultClient;
pub use config::{KeyVaultConfig, KeyVaultConfigBuilder};

// Services (traits)
pub use services::{SecretsService, KeysService, CertificatesService};

// Secret types
pub use types::secret::{
    Secret, SecretProperties, SecretString,
    SetSecretOptions, DeletedSecret, BackupBlob,
};

// Key types
pub use types::key::{
    Key, KeyProperties, JsonWebKey,
    CreateKeyOptions, KeyType, KeyOperation,
};

// Crypto types
pub use types::crypto::{
    EncryptionAlgorithm, SignatureAlgorithm, KeyWrapAlgorithm,
    EncryptResult, DecryptResult, SignResult, VerifyResult,
    WrapResult, UnwrapResult,
};

// Certificate types
pub use types::certificate::{
    Certificate, CertificateProperties, CertificatePolicy,
};

// Rotation
pub use rotation::{RotationHandler, ExpiryMonitor};

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub use simulation::{MockKeyVaultClient, AccessLogEntry, ReplayResult};

// Errors
pub use error::{KeyVaultError, KeyVaultErrorKind};
```

### 4.2 KeyVaultClient Methods

```rust
impl KeyVaultClient {
    // Construction
    pub fn builder() -> KeyVaultClientBuilder;
    pub async fn new(config: KeyVaultConfig) -> Result<Self, KeyVaultError>;
    pub async fn from_env() -> Result<Self, KeyVaultError>;

    // Service accessors
    pub fn secrets(&self) -> &dyn SecretsService;
    pub fn keys(&self) -> &dyn KeysService;
    pub fn certificates(&self) -> &dyn CertificatesService;

    // Rotation support
    pub fn register_rotation_handler(&mut self, handler: Box<dyn RotationHandler>);
    pub fn expiry_monitor(&self) -> &ExpiryMonitor;

    // --- Convenience methods ---

    // Secrets
    pub async fn get_secret(&self, name: &str) -> Result<Secret, KeyVaultError>;
    pub async fn get_secret_version(&self, name: &str, version: &str) -> Result<Secret, KeyVaultError>;
    pub async fn set_secret(&self, name: &str, value: &str) -> Result<Secret, KeyVaultError>;

    // Keys
    pub async fn get_key(&self, name: &str) -> Result<Key, KeyVaultError>;
    pub async fn encrypt(&self, key_name: &str, algorithm: EncryptionAlgorithm, plaintext: &[u8]) -> Result<Vec<u8>, KeyVaultError>;
    pub async fn decrypt(&self, key_name: &str, algorithm: EncryptionAlgorithm, ciphertext: &[u8]) -> Result<Vec<u8>, KeyVaultError>;

    // Certificates
    pub async fn get_certificate(&self, name: &str) -> Result<Certificate, KeyVaultError>;

    // Health
    pub async fn health_check(&self) -> HealthStatus;
}
```

---

## 5. Test Fixtures

### 5.1 Secret Fixtures

```json
// fixtures/secrets/get_secret.json
{
  "value": "my-secret-value-123",
  "id": "https://myvault.vault.azure.net/secrets/db-password/abc123def456",
  "attributes": {
    "enabled": true,
    "created": 1702483200,
    "updated": 1702483200,
    "recoveryLevel": "Recoverable+Purgeable",
    "recoverableDays": 90
  },
  "contentType": "text/plain",
  "tags": {
    "environment": "production",
    "application": "api-server"
  }
}

// fixtures/secrets/list_secrets.json
{
  "value": [
    {
      "id": "https://myvault.vault.azure.net/secrets/db-password",
      "attributes": {
        "enabled": true,
        "created": 1702483200,
        "updated": 1702483200
      },
      "tags": {}
    },
    {
      "id": "https://myvault.vault.azure.net/secrets/api-key",
      "attributes": {
        "enabled": true,
        "created": 1702400000,
        "updated": 1702400000,
        "exp": 1735689600
      },
      "tags": {}
    }
  ],
  "nextLink": null
}
```

### 5.2 Key Fixtures

```json
// fixtures/keys/create_key.json
{
  "key": {
    "kid": "https://myvault.vault.azure.net/keys/my-rsa-key/abc123",
    "kty": "RSA",
    "key_ops": ["encrypt", "decrypt", "sign", "verify", "wrapKey", "unwrapKey"],
    "n": "0vx7agoebGcQ...",
    "e": "AQAB"
  },
  "attributes": {
    "enabled": true,
    "created": 1702483200,
    "updated": 1702483200,
    "recoveryLevel": "Recoverable+Purgeable"
  },
  "tags": {}
}

// fixtures/keys/encrypt_response.json
{
  "kid": "https://myvault.vault.azure.net/keys/my-rsa-key/abc123",
  "value": "base64-encoded-ciphertext..."
}

// fixtures/keys/sign_response.json
{
  "kid": "https://myvault.vault.azure.net/keys/my-rsa-key/abc123",
  "value": "base64-encoded-signature..."
}
```

### 5.3 Error Fixtures

```json
// fixtures/errors/not_found.json
{
  "error": {
    "code": "SecretNotFound",
    "message": "A secret with (name/id) my-secret was not found in this key vault."
  }
}

// fixtures/errors/access_denied.json
{
  "error": {
    "code": "Forbidden",
    "message": "The user, group or application 'appid=xxx' does not have secrets get permission on key vault 'myvault'."
  }
}

// fixtures/errors/rate_limited.json
{
  "error": {
    "code": "Throttled",
    "message": "Operations per second rate limit reached. Please retry after 1 seconds."
  }
}
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/azure-keyvault-integration.yml
name: Azure Key Vault Integration

on:
  push:
    paths:
      - 'integrations/azure/key-vault/**'
  pull_request:
    paths:
      - 'integrations/azure/key-vault/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test-rust:
    name: Rust Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Cache cargo
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-keyvault-${{ hashFiles('**/Cargo.lock') }}

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/azure/key-vault/rust

      - name: Clippy
        run: cargo clippy -- -D warnings
        working-directory: integrations/azure/key-vault/rust

      - name: Unit tests
        run: cargo test --test unit
        working-directory: integrations/azure/key-vault/rust

      - name: Doc tests
        run: cargo test --doc
        working-directory: integrations/azure/key-vault/rust

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        working-directory: integrations/azure/key-vault/typescript

      - name: Lint
        run: npm run lint
        working-directory: integrations/azure/key-vault/typescript

      - name: Build
        run: npm run build
        working-directory: integrations/azure/key-vault/typescript

      - name: Unit tests
        run: npm run test:unit
        working-directory: integrations/azure/key-vault/typescript

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run Rust integration tests
        run: cargo test --test integration --features test-support
        working-directory: integrations/azure/key-vault/rust

  e2e-tests:
    name: E2E Tests (Manual)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    needs: [integration-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Run E2E tests
        run: cargo test --test e2e --features e2e
        working-directory: integrations/azure/key-vault/rust
        env:
          AZURE_KEYVAULT_URL: ${{ secrets.AZURE_KEYVAULT_URL }}
          KEYVAULT_E2E_TESTS: true

  coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    needs: [test-rust]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --lcov --output-path lcov.info
        working-directory: integrations/azure/key-vault/rust

      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: integrations/azure/key-vault/rust/lcov.info
          flags: azure-keyvault
```

---

## 7. Usage Examples

### 7.1 Rust Usage

```rust
use integrations_azure_keyvault::{KeyVaultClient, EncryptionAlgorithm};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client from environment
    let client = KeyVaultClient::from_env().await?;

    // Get a secret
    let secret = client.get_secret("db-password").await?;
    println!("Secret retrieved (value hidden)");

    // Use the secret value (explicit exposure)
    let conn_string = format!("postgres://user:{}@host/db",
        secret.value.expose_secret());

    // Get a specific version
    let old_secret = client.get_secret_version("db-password", "abc123").await?;

    // Set a new secret
    let new_secret = client.set_secret("api-key", "new-api-key-value").await?;
    println!("Created secret version: {}", new_secret.properties.version);

    // List all secrets
    let secrets = client.secrets().list_secrets().await?;
    for s in secrets {
        println!("Secret: {} (enabled: {})", s.name, s.enabled);
    }

    // Encrypt data with a key
    let plaintext = b"sensitive data";
    let ciphertext = client.encrypt(
        "my-encryption-key",
        EncryptionAlgorithm::RsaOaep256,
        plaintext
    ).await?;

    // Decrypt data
    let decrypted = client.decrypt(
        "my-encryption-key",
        EncryptionAlgorithm::RsaOaep256,
        &ciphertext
    ).await?;

    assert_eq!(plaintext, decrypted.as_slice());

    Ok(())
}
```

### 7.2 TypeScript Usage

```typescript
import { KeyVaultClient, EncryptionAlgorithm } from '@integrations/azure-keyvault';

async function main() {
    // Create client from environment
    const client = await KeyVaultClient.fromEnv();

    // Get a secret
    const secret = await client.getSecret('db-password');
    console.log('Secret retrieved (value hidden)');

    // Use the secret value
    const connString = `postgres://user:${secret.value.expose()}@host/db`;

    // List all secrets
    const secrets = await client.secrets().listSecrets();
    for (const s of secrets) {
        console.log(`Secret: ${s.name} (enabled: ${s.enabled})`);
    }

    // Encrypt/decrypt
    const plaintext = Buffer.from('sensitive data');
    const ciphertext = await client.encrypt(
        'my-encryption-key',
        EncryptionAlgorithm.RsaOaep256,
        plaintext
    );

    const decrypted = await client.decrypt(
        'my-encryption-key',
        EncryptionAlgorithm.RsaOaep256,
        ciphertext
    );

    console.log('Round-trip successful:', plaintext.equals(decrypted));
}

main().catch(console.error);
```

### 7.3 Rotation Handler Example

```rust
use integrations_azure_keyvault::{
    KeyVaultClient, RotationHandler, SecretProperties, Secret
};

struct MyRotationHandler;

#[async_trait]
impl RotationHandler for MyRotationHandler {
    async fn on_near_expiry(&self, secret: &SecretProperties, days_until_expiry: i64) {
        println!("Secret {} expires in {} days", secret.name, days_until_expiry);

        // Trigger rotation workflow
        if days_until_expiry <= 7 {
            self.trigger_rotation(&secret.name).await;
        }
    }

    async fn on_secret_rotated(&self, secret: &Secret, previous_version: &str) {
        println!("Secret {} rotated from {} to {}",
            secret.name, previous_version, secret.properties.version);

        // Notify dependent services
        self.notify_services(&secret.name).await;
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = KeyVaultClient::from_env().await?;

    // Register rotation handler
    client.register_rotation_handler(Box::new(MyRotationHandler));

    // Start expiry monitoring (checks every hour)
    client.expiry_monitor().start(Duration::from_secs(3600)).await;

    Ok(())
}
```

---

## 8. Compliance Matrix

### 8.1 API Coverage

| Operation | Endpoint | Service | Status |
|-----------|----------|---------|--------|
| GetSecret | GET /secrets/{name}/{version} | SecretsService | ✅ |
| SetSecret | PUT /secrets/{name} | SecretsService | ✅ |
| ListSecrets | GET /secrets | SecretsService | ✅ |
| ListSecretVersions | GET /secrets/{name}/versions | SecretsService | ✅ |
| DeleteSecret | DELETE /secrets/{name} | SecretsService | ✅ |
| BackupSecret | POST /secrets/{name}/backup | SecretsService | ✅ |
| RestoreSecret | POST /secrets/restore | SecretsService | ✅ |
| RecoverDeletedSecret | POST /deletedsecrets/{name}/recover | SecretsService | ✅ |
| PurgeDeletedSecret | DELETE /deletedsecrets/{name} | SecretsService | ✅ |
| CreateKey | POST /keys/{name}/create | KeysService | ✅ |
| GetKey | GET /keys/{name}/{version} | KeysService | ✅ |
| ListKeys | GET /keys | KeysService | ✅ |
| DeleteKey | DELETE /keys/{name} | KeysService | ✅ |
| RotateKey | POST /keys/{name}/rotate | KeysService | ✅ |
| Encrypt | POST /keys/{name}/{version}/encrypt | KeysService | ✅ |
| Decrypt | POST /keys/{name}/{version}/decrypt | KeysService | ✅ |
| Sign | POST /keys/{name}/{version}/sign | KeysService | ✅ |
| Verify | POST /keys/{name}/{version}/verify | KeysService | ✅ |
| WrapKey | POST /keys/{name}/{version}/wrapkey | KeysService | ✅ |
| UnwrapKey | POST /keys/{name}/{version}/unwrapkey | KeysService | ✅ |
| GetCertificate | GET /certificates/{name}/{version} | CertificatesService | ✅ |
| ListCertificates | GET /certificates | CertificatesService | ✅ |
| GetCertificatePolicy | GET /certificates/{name}/policy | CertificatesService | ✅ |

### 8.2 Shared Module Integration

| Module | Integration |
|--------|-------------|
| azure/auth | DefaultAzureCredential chain |
| shared/resilience | Retry, circuit breaker, rate limiting |
| shared/observability | Metrics, traces, logging |
| integrations-logging | Structured logging |
| integrations-tracing | Distributed tracing |

### 8.3 Testing Coverage

| Category | Target | Status |
|----------|--------|--------|
| Unit Tests | >90% | ✅ |
| Integration Tests | All operations | ✅ |
| E2E Tests | Happy paths | ✅ |
| Error Scenarios | All error types | ✅ |
| Edge Cases | Per refinement doc | ✅ |

---

## SPARC Phases Complete

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-azure-key-vault.md | ✅ Complete |
| 2. Pseudocode | pseudocode-azure-key-vault.md | ✅ Complete |
| 3. Architecture | architecture-azure-key-vault.md | ✅ Complete |
| 4. Refinement | refinement-azure-key-vault.md | ✅ Complete |
| 5. Completion | completion-azure-key-vault.md | ✅ Complete |

---

*Phase 5: Completion - Complete*

*Azure Key Vault Integration SPARC Documentation Complete*
