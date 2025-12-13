# Refinement: GitHub Container Registry Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ghcr`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Interface Contracts](#2-interface-contracts)
3. [Validation Rules](#3-validation-rules)
4. [Security Hardening](#4-security-hardening)
5. [Performance Optimization](#5-performance-optimization)
6. [Testing Strategy](#6-testing-strategy)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Observability](#8-observability)

---

## 1. Code Standards

### 1.1 Rust Conventions

```rust
// Naming conventions
struct GhcrClient;                    // PascalCase for types
fn push_manifest();                   // snake_case for functions
const CHUNK_SIZE: usize = 5_242_880;  // SCREAMING_SNAKE for constants
type Result<T> = std::result::Result<T, GhcrError>;

// Error handling with thiserror
#[derive(Debug, thiserror::Error)]
pub enum GhcrError {
    #[error("Image not found: {image}")]
    NotFound { image: String },

    #[error("Rate limited, retry after {reset_at}")]
    RateLimited { reset_at: DateTime<Utc> },

    #[error("Digest mismatch: expected {expected}, got {actual}")]
    DigestMismatch { expected: String, actual: String },
}

// Builder pattern for config
impl GhcrConfigBuilder {
    pub fn new() -> Self { Self::default() }

    pub fn registry(mut self, registry: impl Into<String>) -> Self {
        self.registry = Some(registry.into());
        self
    }

    pub fn chunk_size(mut self, size: usize) -> Self {
        self.chunk_size = Some(size);
        self
    }

    pub fn build(self) -> Result<GhcrConfig> {
        Ok(GhcrConfig {
            registry: self.registry.unwrap_or_else(|| "ghcr.io".into()),
            chunk_size: self.chunk_size.unwrap_or(CHUNK_SIZE),
            ..Default::default()
        })
    }
}
```

### 1.2 Documentation Standards

```rust
/// Pushes a container image manifest to the registry.
///
/// # Arguments
///
/// * `image` - Image reference (e.g., "owner/repo:tag")
/// * `manifest` - The manifest to push (Docker v2 or OCI)
///
/// # Returns
///
/// Returns the digest of the pushed manifest.
///
/// # Errors
///
/// * `GhcrError::Unauthorized` - Invalid or expired token
/// * `GhcrError::Forbidden` - Insufficient permissions
/// * `GhcrError::RateLimited` - Rate limit exceeded
///
/// # Example
///
/// ```rust
/// let manifest = Manifest::from_layers(&layers, &config);
/// let digest = client.push_manifest(
///     &ImageRef::parse("ghcr.io/myorg/myapp:v1.0.0")?,
///     &manifest,
/// ).await?;
/// println!("Pushed: {}", digest);
/// ```
pub async fn push_manifest(
    &self,
    image: &ImageRef,
    manifest: &Manifest,
) -> Result<String>
```

### 1.3 Module Organization

```rust
// lib.rs - clean public API
pub mod client;
pub mod config;
pub mod error;
pub mod types;
pub mod operations;

pub use client::GhcrClient;
pub use config::{GhcrConfig, GhcrConfigBuilder};
pub use error::GhcrError;
pub use types::*;

/// Prelude for common imports
pub mod prelude {
    pub use crate::{
        GhcrClient, GhcrConfig, GhcrConfigBuilder,
        ImageRef, Reference, Manifest, MediaType,
        Descriptor, Platform, PackageVersion,
        Severity, Vulnerability, GhcrError,
    };
}
```

---

## 2. Interface Contracts

### 2.1 Client Trait

```rust
#[async_trait]
pub trait RegistryOperations: Send + Sync {
    // Image operations
    async fn image_exists(&self, image: &ImageRef) -> Result<bool>;
    async fn pull_manifest(&self, image: &ImageRef) -> Result<Manifest>;
    async fn push_manifest(&self, image: &ImageRef, manifest: &Manifest) -> Result<String>;
    async fn delete_image(&self, image: &ImageRef) -> Result<()>;
    async fn copy_image(&self, source: &ImageRef, target: &ImageRef) -> Result<String>;

    // Tag operations
    async fn list_tags(&self, image: &str) -> Result<Vec<String>>;
    async fn tag_image(&self, image: &ImageRef, new_tag: &str) -> Result<()>;
    async fn delete_tag(&self, image: &str, tag: &str) -> Result<()>;

    // Blob operations
    async fn blob_exists(&self, image: &ImageRef, digest: &str) -> Result<bool>;
    async fn upload_blob(&self, image: &ImageRef, data: Bytes) -> Result<String>;
    async fn mount_blob(&self, src: &ImageRef, dst: &ImageRef, digest: &str) -> Result<()>;
}

#[async_trait]
pub trait PackageOperations: Send + Sync {
    async fn list_versions(&self, owner: &str, pkg: &str, typ: OwnerType) -> Result<Vec<PackageVersion>>;
    async fn delete_version(&self, owner: &str, pkg: &str, id: u64, typ: OwnerType) -> Result<()>;
    async fn get_vulnerabilities(&self, owner: &str, pkg: &str, id: u64, typ: OwnerType) -> Result<VulnerabilityReport>;
}
```

### 2.2 Credential Provider Contract

```rust
pub struct GhcrCredentials {
    pub username: String,
    pub token: SecretString,
}

#[async_trait]
pub trait CredentialProvider: Send + Sync {
    async fn get_credentials(&self) -> Result<GhcrCredentials>;
    async fn invalidate(&self);
}

// Static provider for simple cases
pub struct StaticCredentialProvider {
    credentials: GhcrCredentials,
}

// Environment-based provider
pub struct EnvCredentialProvider {
    username_var: String,
    token_var: String,
}

impl CredentialProvider for EnvCredentialProvider {
    async fn get_credentials(&self) -> Result<GhcrCredentials> {
        Ok(GhcrCredentials {
            username: std::env::var(&self.username_var)?,
            token: SecretString::new(std::env::var(&self.token_var)?),
        })
    }
}
```

### 2.3 Manifest Type Contract

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Manifest {
    Image(ImageManifest),
    Index(ImageIndex),
}

impl Manifest {
    pub fn media_type(&self) -> &MediaType {
        match self {
            Manifest::Image(m) => &m.media_type,
            Manifest::Index(i) => &i.media_type,
        }
    }

    pub fn digest(&self) -> String {
        let bytes = serde_json::to_vec(self).unwrap();
        format!("sha256:{}", hex::encode(Sha256::digest(&bytes)))
    }

    pub fn is_multi_arch(&self) -> bool {
        matches!(self, Manifest::Index(_))
    }

    pub fn platforms(&self) -> Vec<&Platform> {
        match self {
            Manifest::Index(i) => i.manifests.iter()
                .filter_map(|d| d.platform.as_ref())
                .collect(),
            Manifest::Image(_) => vec![],
        }
    }
}
```

---

## 3. Validation Rules

### 3.1 Image Reference Validation

```rust
impl ImageRef {
    pub fn parse(input: &str) -> Result<Self> {
        // Validate registry
        let (registry, remainder) = if input.contains('/') {
            let parts: Vec<&str> = input.splitn(2, '/').collect();
            if parts[0].contains('.') || parts[0].contains(':') {
                (parts[0].to_string(), parts[1])
            } else {
                ("ghcr.io".to_string(), input)
            }
        } else {
            return Err(GhcrError::InvalidImageRef { input: input.into() });
        };

        // Validate name
        let (name, reference) = Self::parse_name_and_ref(remainder)?;
        validate_image_name(&name)?;

        Ok(Self { registry, name, reference })
    }
}

fn validate_image_name(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 256 {
        return Err(GhcrError::InvalidImageName {
            name: name.into(),
            reason: "Name must be 1-256 characters".into(),
        });
    }

    // Must match: [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*
    let re = Regex::new(r"^[a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*$")?;
    if !re.is_match(name) {
        return Err(GhcrError::InvalidImageName {
            name: name.into(),
            reason: "Invalid characters in name".into(),
        });
    }

    Ok(())
}

fn validate_tag(tag: &str) -> Result<()> {
    if tag.is_empty() || tag.len() > 128 {
        return Err(GhcrError::InvalidTag {
            tag: tag.into(),
            reason: "Tag must be 1-128 characters".into(),
        });
    }

    // Must match: [a-zA-Z0-9_][a-zA-Z0-9._-]*
    let re = Regex::new(r"^[a-zA-Z0-9_][a-zA-Z0-9._-]*$")?;
    if !re.is_match(tag) {
        return Err(GhcrError::InvalidTag {
            tag: tag.into(),
            reason: "Invalid characters in tag".into(),
        });
    }

    Ok(())
}

fn validate_digest(digest: &str) -> Result<()> {
    // Must be: algorithm:hex
    let re = Regex::new(r"^sha256:[a-f0-9]{64}$")?;
    if !re.is_match(digest) {
        return Err(GhcrError::InvalidDigest { digest: digest.into() });
    }
    Ok(())
}
```

### 3.2 Manifest Validation

```rust
impl Manifest {
    pub fn validate(&self) -> Result<()> {
        match self {
            Manifest::Image(m) => {
                // Validate schema version
                if m.schema_version != 2 {
                    return Err(GhcrError::InvalidManifest {
                        reason: "Unsupported schema version".into(),
                    });
                }

                // Validate config
                validate_digest(&m.config.digest)?;

                // Validate layers
                if m.layers.is_empty() {
                    return Err(GhcrError::InvalidManifest {
                        reason: "Manifest must have at least one layer".into(),
                    });
                }
                for layer in &m.layers {
                    validate_digest(&layer.digest)?;
                }

                Ok(())
            }
            Manifest::Index(i) => {
                if i.manifests.is_empty() {
                    return Err(GhcrError::InvalidManifest {
                        reason: "Index must have at least one manifest".into(),
                    });
                }
                for m in &i.manifests {
                    validate_digest(&m.digest)?;
                }
                Ok(())
            }
        }
    }
}
```

### 3.3 Upload Validation

```rust
fn validate_blob_upload(data: &[u8], expected_digest: Option<&str>) -> Result<String> {
    let actual_digest = format!("sha256:{}", hex::encode(Sha256::digest(data)));

    if let Some(expected) = expected_digest {
        if actual_digest != expected {
            return Err(GhcrError::DigestMismatch {
                expected: expected.into(),
                actual: actual_digest,
            });
        }
    }

    Ok(actual_digest)
}

fn validate_chunk_range(start: u64, end: u64, chunk_size: usize) -> Result<()> {
    if end <= start {
        return Err(GhcrError::InvalidChunkRange { start, end });
    }
    if (end - start) as usize != chunk_size {
        return Err(GhcrError::ChunkSizeMismatch {
            expected: chunk_size,
            actual: (end - start) as usize,
        });
    }
    Ok(())
}
```

---

## 4. Security Hardening

### 4.1 Credential Protection

```rust
use secrecy::{ExposeSecret, SecretString};

impl GhcrClient {
    async fn authenticate(&self, scope: &str) -> Result<SecretString> {
        let creds = self.auth.get_credentials().await?;

        let response = self.http_client
            .get(format!("https://{}/token", self.config.registry))
            .query(&[("scope", scope), ("service", &self.config.registry)])
            .basic_auth(&creds.username, Some(creds.token.expose_secret()))
            .send()
            .await?;

        // Token response handling...
    }
}

// Debug impl that never exposes secrets
impl std::fmt::Debug for GhcrClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GhcrClient")
            .field("registry", &self.config.registry)
            .field("auth", &"[REDACTED]")
            .finish()
    }
}

impl std::fmt::Debug for GhcrCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GhcrCredentials")
            .field("username", &self.username)
            .field("token", &"[REDACTED]")
            .finish()
    }
}
```

### 4.2 Token Scope Minimization

```rust
impl GhcrClient {
    fn minimal_scope(&self, operation: Operation, image: &str) -> String {
        match operation {
            Operation::Pull => format!("repository:{}:pull", image),
            Operation::Push => format!("repository:{}:push,pull", image),
            Operation::Delete => format!("repository:{}:delete", image),
            Operation::Mount { from, to } => format!(
                "repository:{}:pull repository:{}:push,pull",
                from, to
            ),
        }
    }
}
```

### 4.3 Digest Verification

```rust
impl GhcrClient {
    async fn pull_and_verify(&self, image: &ImageRef) -> Result<(Manifest, Bytes)> {
        let response = self.get_manifest_response(image).await?;

        let expected_digest = response.headers()
            .get("docker-content-digest")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        let body = response.bytes().await?;

        // Verify digest
        let actual_digest = format!("sha256:{}", hex::encode(Sha256::digest(&body)));

        if let Some(expected) = &expected_digest {
            if &actual_digest != expected {
                return Err(GhcrError::DigestMismatch {
                    expected: expected.clone(),
                    actual: actual_digest,
                });
            }
        }

        let manifest = serde_json::from_slice(&body)?;
        Ok((manifest, body))
    }
}
```

### 4.4 TLS Configuration

```rust
impl GhcrClient {
    pub fn new(config: GhcrConfig, auth: Arc<dyn CredentialProvider>) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .https_only(true)
            .min_tls_version(tls::Version::TLS_1_2)
            .danger_accept_invalid_certs(false)
            .build()?;

        Ok(Self {
            config: Arc::new(config),
            auth,
            http_client: Arc::new(http_client),
            ..Default::default()
        })
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
impl GhcrClient {
    pub fn new(config: GhcrConfig, auth: Arc<dyn CredentialProvider>) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            .build()?;

        Ok(Self { http_client: Arc::new(http_client), ..Default::default() })
    }
}
```

### 5.2 Parallel Layer Upload

```rust
impl GhcrClient {
    pub async fn push_image_parallel(
        &self,
        image: &ImageRef,
        manifest: &Manifest,
        layers: Vec<Bytes>,
        max_concurrency: usize,
    ) -> Result<String> {
        let semaphore = Arc::new(Semaphore::new(max_concurrency));

        // Upload layers in parallel
        let upload_futures: Vec<_> = layers.into_iter()
            .map(|layer| {
                let sem = semaphore.clone();
                let client = self.clone();
                let img = image.clone();

                async move {
                    let _permit = sem.acquire().await?;
                    client.upload_blob(&img, layer).await
                }
            })
            .collect();

        let digests = futures::future::try_join_all(upload_futures).await?;

        // Verify all layers uploaded
        for digest in &digests {
            if !self.blob_exists(image, digest).await? {
                return Err(GhcrError::UploadFailed {
                    reason: format!("Layer {} not found after upload", digest),
                });
            }
        }

        // Push manifest
        self.push_manifest(image, manifest).await
    }
}
```

### 5.3 Streaming Blob Upload

```rust
impl GhcrClient {
    pub async fn upload_blob_streaming<R: AsyncRead + Unpin>(
        &self,
        image: &ImageRef,
        mut reader: R,
        expected_size: Option<u64>,
    ) -> Result<String> {
        let scope = format!("repository:{}:push,pull", image.name);
        let upload_url = self.start_upload(image, &scope).await?;

        let mut hasher = Sha256::new();
        let mut offset = 0u64;
        let mut current_url = upload_url;
        let chunk_size = self.config.chunk_size;

        loop {
            let mut chunk = vec![0u8; chunk_size];
            let bytes_read = reader.read(&mut chunk).await?;

            if bytes_read == 0 {
                break;
            }

            chunk.truncate(bytes_read);
            hasher.update(&chunk);

            let response = self.upload_chunk(
                &current_url,
                &chunk,
                offset,
                offset + bytes_read as u64,
                &scope,
            ).await?;

            offset += bytes_read as u64;

            if let Some(location) = response.headers().get("location") {
                current_url = location.to_str()?.to_string();
            }
        }

        let digest = format!("sha256:{}", hex::encode(hasher.finalize()));
        self.complete_upload(&current_url, &digest, &scope).await?;

        Ok(digest)
    }
}
```

### 5.4 Token Caching

```rust
impl TokenManager {
    const TOKEN_TTL: Duration = Duration::from_secs(270); // 4.5 minutes
    const REFRESH_MARGIN: Duration = Duration::from_secs(30);

    pub async fn get_token(&self, scope: &str) -> Result<SecretString> {
        // Fast path: check cache with read lock
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(scope) {
                if entry.expires_at > Instant::now() + Self::REFRESH_MARGIN {
                    return Ok(entry.token.clone());
                }
            }
        }

        // Slow path: fetch and cache with write lock
        let mut cache = self.cache.write().await;

        // Double-check after acquiring write lock
        if let Some(entry) = cache.get(scope) {
            if entry.expires_at > Instant::now() + Self::REFRESH_MARGIN {
                return Ok(entry.token.clone());
            }
        }

        let token = self.fetch_token(scope).await?;
        cache.insert(scope.to_string(), CachedToken {
            token: token.clone(),
            expires_at: Instant::now() + Self::TOKEN_TTL,
        });

        Ok(token)
    }
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_ref_parse_simple() {
        let img = ImageRef::parse("ghcr.io/owner/repo:v1.0.0").unwrap();
        assert_eq!(img.registry, "ghcr.io");
        assert_eq!(img.name, "owner/repo");
        assert_eq!(img.reference, Reference::Tag("v1.0.0".into()));
    }

    #[test]
    fn test_image_ref_parse_digest() {
        let digest = "sha256:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";
        let img = ImageRef::parse(&format!("ghcr.io/owner/repo@{}", digest)).unwrap();
        assert_eq!(img.reference, Reference::Digest(digest.into()));
    }

    #[test]
    fn test_image_ref_invalid() {
        assert!(ImageRef::parse("").is_err());
        assert!(ImageRef::parse("UPPERCASE/repo").is_err());
        assert!(ImageRef::parse("owner/repo:").is_err());
    }

    #[test]
    fn test_manifest_digest() {
        let manifest = Manifest::Image(ImageManifest {
            schema_version: 2,
            media_type: MediaType::OciManifest,
            config: Descriptor::default(),
            layers: vec![],
            annotations: None,
        });
        let digest = manifest.digest();
        assert!(digest.starts_with("sha256:"));
        assert_eq!(digest.len(), 71); // sha256: + 64 hex chars
    }

    #[test]
    fn test_validate_tag() {
        assert!(validate_tag("v1.0.0").is_ok());
        assert!(validate_tag("latest").is_ok());
        assert!(validate_tag("feature-branch_123").is_ok());
        assert!(validate_tag("").is_err());
        assert!(validate_tag("invalid tag").is_err());
    }
}
```

### 6.2 Integration Tests with Simulation

```rust
#[tokio::test]
async fn test_push_manifest_simulation() {
    let config = GhcrConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/push_manifest.json"),
        })
        .build()
        .unwrap();

    let client = GhcrClient::new(config, mock_credentials()).unwrap();

    let manifest = Manifest::Image(test_manifest());
    let digest = client.push_manifest(
        &ImageRef::parse("ghcr.io/test/repo:v1.0.0").unwrap(),
        &manifest,
    ).await.unwrap();

    assert!(digest.starts_with("sha256:"));
}

#[tokio::test]
async fn test_list_tags_simulation() {
    let config = GhcrConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/list_tags.json"),
        })
        .build()
        .unwrap();

    let client = GhcrClient::new(config, mock_credentials()).unwrap();
    let tags = client.list_tags("test/repo").await.unwrap();

    assert!(tags.contains(&"v1.0.0".to_string()));
    assert!(tags.contains(&"latest".to_string()));
}

#[tokio::test]
async fn test_rate_limit_handling() {
    let config = GhcrConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/rate_limited.json"),
        })
        .build()
        .unwrap();

    let client = GhcrClient::new(config, mock_credentials()).unwrap();

    // Should handle 429 and retry
    let result = client.list_tags("test/repo").await;
    assert!(result.is_ok());
}
```

### 6.3 Blob Upload Tests

```rust
#[tokio::test]
async fn test_chunked_upload() {
    let config = GhcrConfig::builder()
        .chunk_size(1024) // Small chunks for testing
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/chunked_upload.json"),
        })
        .build()
        .unwrap();

    let client = GhcrClient::new(config, mock_credentials()).unwrap();

    let data = Bytes::from(vec![0u8; 4096]); // 4 chunks
    let digest = client.upload_blob(
        &ImageRef::parse("ghcr.io/test/repo:v1").unwrap(),
        data,
    ).await.unwrap();

    assert!(digest.starts_with("sha256:"));
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: GHCR Integration CI

on:
  push:
    paths:
      - 'integrations/ghcr/**'
  pull_request:
    paths:
      - 'integrations/ghcr/**'

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/ghcr

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/ghcr

      - name: Clippy
        run: cargo clippy --all-targets --all-features
        working-directory: integrations/ghcr

      - name: Build
        run: cargo build --all-features
        working-directory: integrations/ghcr

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/ghcr

  integration-tests:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Integration tests (simulation)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: integrations/ghcr

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Security audit
        uses: rustsec/audit-check@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  coverage:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --lcov --output-path lcov.info
        working-directory: integrations/ghcr

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/ghcr/lcov.info
```

### 7.2 Cargo.toml

```toml
[package]
name = "ghcr-integration"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
reqwest = { version = "0.11", features = ["json", "stream"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
tracing = "0.1"
chrono = { version = "0.4", features = ["serde"] }
secrecy = { version = "0.8", features = ["serde"] }
async-trait = "0.1"
futures = "0.3"
sha2 = "0.10"
hex = "0.4"
bytes = "1.5"
regex = "1.10"

[dev-dependencies]
tokio-test = "0.4"
tempfile = "3.8"

[features]
default = []
simulation = []

[lints.rust]
unsafe_code = "forbid"

[lints.clippy]
all = "warn"
pedantic = "warn"
```

---

## 8. Observability

### 8.1 Metrics

```rust
pub struct GhcrMetrics {
    requests_total: CounterVec,
    request_duration: HistogramVec,
    manifests_pushed: Counter,
    manifests_pulled: Counter,
    blobs_uploaded: Counter,
    bytes_uploaded: Counter,
    rate_limit_remaining: Gauge,
    token_refreshes: Counter,
    errors: CounterVec,
}

impl GhcrMetrics {
    pub fn new(registry: &Registry) -> Self {
        Self {
            requests_total: CounterVec::new(
                Opts::new("ghcr_requests_total", "Total GHCR API requests"),
                &["method", "endpoint", "status"]
            ).unwrap(),

            request_duration: HistogramVec::new(
                HistogramOpts::new("ghcr_request_duration_seconds", "Request duration")
                    .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]),
                &["method", "endpoint"]
            ).unwrap(),

            blobs_uploaded: Counter::new(
                "ghcr_blobs_uploaded_total", "Total blobs uploaded"
            ).unwrap(),

            bytes_uploaded: Counter::new(
                "ghcr_bytes_uploaded_total", "Total bytes uploaded"
            ).unwrap(),

            rate_limit_remaining: Gauge::new(
                "ghcr_rate_limit_remaining", "Remaining rate limit"
            ).unwrap(),

            errors: CounterVec::new(
                Opts::new("ghcr_errors_total", "Errors by type"),
                &["error_type"]
            ).unwrap(),
        }
    }
}
```

### 8.2 Tracing

```rust
impl GhcrClient {
    #[tracing::instrument(
        skip(self, manifest),
        fields(
            image = %image.full_name(),
            media_type = %manifest.media_type(),
        )
    )]
    pub async fn push_manifest(
        &self,
        image: &ImageRef,
        manifest: &Manifest,
    ) -> Result<String> {
        let result = self.execute_push(image, manifest).await;

        match &result {
            Ok(digest) => {
                tracing::info!(digest = %digest, "Manifest pushed");
                self.metrics.manifests_pushed.inc();
            }
            Err(e) => {
                tracing::error!(error = %e, "Push failed");
                self.metrics.errors.with_label_values(&[e.error_type()]).inc();
            }
        }

        result
    }
}
```

### 8.3 Health Check

```rust
impl GhcrClient {
    pub async fn health_check(&self) -> Result<HealthStatus> {
        let start = Instant::now();

        // Test token acquisition
        let token_result = self.get_token("repository:healthcheck:pull").await;

        match token_result {
            Ok(_) => Ok(HealthStatus {
                healthy: true,
                latency: start.elapsed(),
                rate_limit: Some(self.rate_limiter.current_state()),
                error: None,
            }),
            Err(e) => Ok(HealthStatus {
                healthy: false,
                latency: start.elapsed(),
                rate_limit: None,
                error: Some(e.to_string()),
            }),
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GHCR-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
