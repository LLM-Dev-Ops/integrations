# Refinement: Azure Active Directory OAuth2 Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/azure-active-directory`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Testing Requirements](#2-testing-requirements)
3. [Interface Contracts](#3-interface-contracts)
4. [Constraints and Invariants](#4-constraints-and-invariants)
5. [Performance Requirements](#5-performance-requirements)
6. [Quality Gates](#6-quality-gates)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Open Questions](#8-open-questions)

---

## 1. Code Standards

### 1.1 Rust Code Standards

#### 1.1.1 Formatting (rustfmt)

```toml
# rustfmt.toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Unix"
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

#### 1.1.2 Linting (Clippy)

```toml
# Cargo.toml
[lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
pedantic = "warn"
missing_docs = "warn"
# Security-specific
hardcoded_credentials = "deny"
```

#### 1.1.3 Security-Specific Standards

```rust
// GOOD: Use SecretString for credentials
pub struct ClientCredentials {
    client_id: String,
    client_secret: SecretString,  // Zeroized on drop
}

// GOOD: Implement Debug manually to redact secrets
impl Debug for ClientCredentials {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("ClientCredentials")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .finish()
    }
}

// BAD: Never log tokens or secrets
log::debug!("Token: {}", token);  // PROHIBITED
log::debug!("Secret: {}", secret.expose());  // PROHIBITED

// GOOD: Log sanitized information
log::debug!("Token acquired, expires_in={}s", expires_in);
```

#### 1.1.4 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Crates | snake_case | `azure_active_directory` |
| Modules | snake_case | `client_credentials` |
| Types | PascalCase | `AccessToken` |
| Functions | snake_case | `acquire_token` |
| Constants | SCREAMING_SNAKE | `IMDS_ENDPOINT` |

### 1.2 TypeScript Code Standards

#### 1.2.1 Formatting (Prettier)

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5"
}
```

#### 1.2.2 Security Standards

```typescript
// GOOD: Use branded types for sensitive data
type SecretString = string & { readonly __brand: 'secret' };

// GOOD: Clear sensitive data after use
function clearSecret(secret: Uint8Array): void {
  secret.fill(0);
}

// BAD: Never include secrets in error messages
throw new Error(`Invalid secret: ${secret}`);  // PROHIBITED
```

---

## 2. Testing Requirements

### 2.1 Test Categories

| Component | Coverage | Key Test Cases |
|-----------|----------|----------------|
| ClientCredentialsFlow | 90% | Secret auth, cert auth, caching |
| AuthorizationCodeFlow | 90% | PKCE gen, code exchange, state |
| DeviceCodeFlow | 85% | Initiation, polling, timeout |
| ManagedIdentityFlow | 85% | System, user-assigned, IMDS errors |
| TokenCache | 95% | Hit, miss, expiry, eviction |
| TokenValidation | 95% | Signature, claims, expiry |
| SimulationLayer | 95% | Record, replay, mock tokens |

### 2.2 Test Fixtures

```rust
// tests/fixtures/tokens.rs
pub fn mock_access_token() -> AccessToken {
    AccessToken {
        token: "mock_access_token_12345".to_string(),
        token_type: "Bearer".to_string(),
        expires_on: Utc::now() + Duration::hours(1),
        scopes: vec!["https://graph.microsoft.com/.default".to_string()],
        tenant_id: "test-tenant-id".to_string(),
    }
}

pub fn mock_token_response() -> TokenResponse {
    TokenResponse {
        access_token: mock_access_token(),
        refresh_token: Some("mock_refresh_token_67890".to_string()),
        id_token: Some(mock_id_token_jwt()),
        expires_in: 3600,
    }
}

pub fn mock_token_claims() -> TokenClaims {
    TokenClaims {
        sub: "user-object-id".to_string(),
        aud: "test-client-id".to_string(),
        iss: "https://login.microsoftonline.com/test-tenant-id/v2.0".to_string(),
        exp: (Utc::now() + Duration::hours(1)).timestamp() as u64,
        iat: Utc::now().timestamp() as u64,
        nbf: Some(Utc::now().timestamp() as u64),
        oid: Some("user-object-id".to_string()),
        tid: Some("test-tenant-id".to_string()),
        roles: vec!["User".to_string()],
        ..Default::default()
    }
}
```

### 2.3 Mock Implementations

```rust
pub struct MockHttpClient {
    responses: Arc<RwLock<VecDeque<MockResponse>>>,
    requests: Arc<RwLock<Vec<Request>>>,
}

impl MockHttpClient {
    pub fn expect_token_response(&self, response: TokenResponse) {
        let body = serde_json::to_string(&response).unwrap();
        self.responses.write().unwrap().push_back(MockResponse {
            status: 200,
            body,
        });
    }

    pub fn expect_error(&self, error: &str, description: &str) {
        let body = serde_json::json!({
            "error": error,
            "error_description": description
        }).to_string();
        self.responses.write().unwrap().push_back(MockResponse {
            status: 400,
            body,
        });
    }
}
```

---

## 3. Interface Contracts

### 3.1 Token Acquisition Contract

```rust
/// Token acquisition contract
trait TokenAcquisitionContract {
    /// Preconditions:
    /// - Valid tenant_id and client_id configured
    /// - Appropriate credentials for flow type
    /// - Scopes are valid Azure AD scopes
    ///
    /// Postconditions:
    /// - Returns valid AccessToken on success
    /// - Token is cached for subsequent calls
    /// - Token contains requested scopes (may be subset)
    ///
    /// Invariants:
    /// - Thread-safe (can be called concurrently)
    /// - Secrets never logged or exposed in errors
    /// - Automatic retry on transient failures
    async fn acquire_token(&self, scopes: &[&str]) -> Result<AccessToken, AzureAdError>;
}
```

### 3.2 Token Validation Contract

```rust
/// Token validation contract
trait TokenValidationContract {
    /// Preconditions:
    /// - Token is a valid JWT format
    /// - JWKS endpoint is reachable (or cached)
    ///
    /// Postconditions:
    /// - Returns TokenClaims if valid
    /// - Signature verified against JWKS
    /// - Claims validated (exp, nbf, iss, aud)
    ///
    /// Invariants:
    /// - JWKS cached for 24h
    /// - Background refresh before cache expiry
    async fn validate_token(&self, token: &str) -> Result<TokenClaims, AzureAdError>;
}
```

### 3.3 Cache Contract

```rust
/// Token cache contract
trait TokenCacheContract {
    /// Invariants:
    /// - Thread-safe concurrent access
    /// - Memory-bounded (max_entries)
    /// - Expired tokens are evicted
    /// - Cache key includes tenant+client+scopes
    fn get(&self, key: &str) -> Option<AccessToken>;
    fn set(&self, key: String, token: AccessToken);
    fn clear(&self);
}
```

---

## 4. Constraints and Invariants

### 4.1 Thin Adapter Constraints

| Constraint | Verification |
|------------|--------------|
| No app registration | API audit |
| No tenant configuration | API audit |
| No conditional access | Code review |
| No user/group management | API audit |
| Shared primitives only | Dependency check |

### 4.2 Security Invariants

```
INVARIANT: SecretHandling
- Secrets use SecretString (zeroized on drop)
- Secrets never appear in logs
- Secrets never in error messages
- Secrets never serialized to disk

INVARIANT: TokenHandling
- Tokens stored in memory only
- Tokens redacted in logs
- Token cache cleared on client drop
- Refresh tokens encrypted at rest (if persisted)

INVARIANT: TransportSecurity
- TLS 1.2+ required
- Certificate validation enabled
- No HTTP fallback
- IMDS exception (localhost only)
```

### 4.3 OAuth2 Invariants

```
INVARIANT: PKCE
- Required for all authorization code flows
- code_verifier is 43-128 characters
- code_challenge uses SHA256
- Verifier stored securely until exchange

INVARIANT: StateParameter
- Required for authorization code flows
- Cryptographically random
- Validated on callback
- Single-use (prevent replay)

INVARIANT: TokenRefresh
- Refresh 5 minutes before expiry
- Retry on transient failure
- Fall back to re-acquisition
- Clear cache on permanent failure
```

### 4.4 Error Invariants

```
INVARIANT: ErrorSafety
- No secrets in error messages
- Correlation ID preserved
- Error codes mapped correctly
- Retryable errors identified
```

---

## 5. Performance Requirements

### 5.1 Latency Targets

| Operation | p50 | p99 |
|-----------|-----|-----|
| Token cache hit | <1ms | <5ms |
| Client credentials (cached creds) | <100ms | <300ms |
| Managed identity | <50ms | <150ms |
| Token validation (cached JWKS) | <5ms | <20ms |
| JWKS fetch | <200ms | <500ms |

### 5.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Token acquisitions/sec | 1000+ (cached) |
| Concurrent requests | 100+ |
| Cache operations/sec | 10000+ |

### 5.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Token cache entries | 1000 (default) |
| JWKS cache TTL | 24 hours |
| Token refresh buffer | 5 minutes |
| Max retry attempts | 3 |
| Retry backoff max | 8 seconds |

### 5.4 Benchmarks

```rust
#[bench]
fn bench_cache_hit(b: &mut Bencher) {
    let cache = TokenCache::new(CacheConfig::default());
    let token = fixtures::mock_access_token();
    cache.set("test-key".to_string(), token);

    b.iter(|| {
        cache.get("test-key")
    });
}

#[bench]
fn bench_pkce_generation(b: &mut Bencher) {
    b.iter(|| {
        generate_pkce()
    });
}

#[bench]
fn bench_jwt_validation(b: &mut Bencher) {
    let client = setup_client_with_mock_jwks();
    let token = fixtures::mock_jwt_token();

    b.iter(|| {
        runtime.block_on(client.validate_token(&token))
    });
}
```

---

## 6. Quality Gates

### 6.1 Code Quality

| Gate | Threshold | Tool |
|------|-----------|------|
| Line coverage | >80% | cargo-llvm-cov |
| Branch coverage | >70% | cargo-llvm-cov |
| Clippy warnings | 0 | clippy |
| Formatting | 100% | rustfmt |
| Doc coverage | >90% | cargo-doc |
| Security audit | 0 critical | cargo-audit |

### 6.2 Security Gates

| Gate | Threshold | Tool |
|------|-----------|------|
| Hardcoded credentials | 0 | clippy + manual |
| Secret logging | 0 | Log audit |
| Unsafe code | 0 (or audited) | Manual review |
| Dependency vulnerabilities | 0 critical | cargo-audit |

### 6.3 Performance Gates

| Gate | Threshold | Tool |
|------|-----------|------|
| Cache hit p99 | <5ms | criterion |
| Token acquisition p99 | <300ms | criterion |
| Memory growth | <1MB/1000 tokens | valgrind |

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions Workflow

```yaml
name: Azure AD OAuth2 Integration CI

on:
  push:
    paths:
      - 'azure-active-directory/**'
  pull_request:
    paths:
      - 'azure-active-directory/**'

jobs:
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Check formatting
        run: cargo fmt --check
        working-directory: azure-active-directory/rust

      - name: Clippy (including security lints)
        run: cargo clippy --all-targets -- -D warnings -D clippy::hardcoded_credentials
        working-directory: azure-active-directory/rust

      - name: Security audit
        run: |
          cargo install cargo-audit
          cargo audit
        working-directory: azure-active-directory/rust

      - name: Unit tests
        run: cargo test --lib
        working-directory: azure-active-directory/rust

      - name: Integration tests (simulation)
        run: cargo test --test '*'
        working-directory: azure-active-directory/rust
        env:
          AZURE_AD_SIMULATION: replay

      - name: Coverage
        run: |
          cargo install cargo-llvm-cov
          cargo llvm-cov --lcov --output-path lcov.info
        working-directory: azure-active-directory/rust

  test-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install & Test
        run: |
          npm ci
          npm run lint
          npm run typecheck
          npm test -- --coverage
        working-directory: azure-active-directory/typescript

  # Integration test with real Azure AD (main branch only)
  integration-test-real:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: azure-integration
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Integration tests (real Azure AD)
        run: cargo test --test '*' --features real-azure
        working-directory: azure-active-directory/rust
        env:
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
```

### 7.2 Pre-commit Hooks

```yaml
repos:
  - repo: local
    hooks:
      - id: rust-fmt
        name: Rust Format
        entry: cargo fmt --manifest-path azure-active-directory/rust/Cargo.toml --
        language: system
        types: [rust]

      - id: rust-clippy
        name: Rust Clippy
        entry: cargo clippy --manifest-path azure-active-directory/rust/Cargo.toml -- -D warnings
        language: system
        types: [rust]

      - id: secret-scan
        name: Secret Scanner
        entry: git secrets --scan
        language: system

      - id: rust-test
        name: Rust Tests
        entry: cargo test --manifest-path azure-active-directory/rust/Cargo.toml --lib
        language: system
        types: [rust]
```

### 7.3 Secret Scanning

```yaml
# .gitleaks.toml
[extend]
useDefault = true

[[rules]]
description = "Azure Client Secret"
regex = '''(?i)(client[_-]?secret|azure[_-]?secret)['":\s]*[=:]\s*['"]?[a-zA-Z0-9~_.-]{30,}['"]?'''
tags = ["azure", "secret"]

[[rules]]
description = "Azure Tenant ID"
regex = '''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'''
tags = ["azure", "tenant"]
allowlist = ["test-tenant-id", "00000000-0000-0000-0000-000000000000"]
```

---

## 8. Open Questions

### 8.1 Design Questions

| Question | Options | Decision |
|----------|---------|----------|
| Token cache persistence | In-memory only / Optional disk | TBD - In-memory for security |
| Multi-tenant support | Single tenant / Multi-tenant | TBD - Start single, add multi |
| Azure CLI credential | Support / Not support | TBD - Add for local dev |

### 8.2 Implementation Questions

| Question | Context | Resolution |
|----------|---------|------------|
| JWKS refresh strategy | Background vs on-demand | Background refresh before expiry |
| Certificate formats | PEM, PFX, or both | Support both |
| Token encryption | At-rest encryption for refresh | Not needed (in-memory only) |

### 8.3 Security Questions

| Question | Context | Resolution |
|----------|---------|------------|
| Refresh token storage | Secure storage options | In-memory only, re-auth if lost |
| Secret rotation | How to handle rotation | Support hot reload via env |
| Audit logging | What to log | Flow type, scopes, success/fail |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AZURE-AD-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*SPARC Phase 4 Complete - Proceed to Completion phase with "Next phase."*
