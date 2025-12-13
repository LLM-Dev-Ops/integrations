# Refinement: OneDrive Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/onedrive`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Interface Contracts](#2-interface-contracts)
3. [Testing Requirements](#3-testing-requirements)
4. [Security Considerations](#4-security-considerations)
5. [Performance Optimization](#5-performance-optimization)
6. [CI/CD Configuration](#6-cicd-configuration)
7. [Documentation Requirements](#7-documentation-requirements)
8. [Review Checklist](#8-review-checklist)

---

## 1. Code Standards

### 1.1 Rust Standards

| Standard | Requirement |
|----------|-------------|
| Edition | Rust 2021 |
| MSRV | 1.70.0 |
| Formatting | rustfmt (default) |
| Linting | clippy (pedantic) |
| Documentation | All public items |

### 1.2 Naming Conventions

```rust
// Types: PascalCase
struct OneDriveClient { }
struct DriveItem { }
enum OneDriveError { }

// Functions: snake_case
async fn upload_small() { }
async fn download() { }
fn drive_url() { }

// Constants: SCREAMING_SNAKE_CASE
const GRAPH_API_BASE: &str = "https://graph.microsoft.com/v1.0";
const MAX_SIMPLE_UPLOAD_SIZE: usize = 4 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE: usize = 10 * 1024 * 1024;

// Modules: snake_case
mod upload_session;
mod simulation;
```

### 1.3 Error Handling Standards

```rust
#[derive(Debug, thiserror::Error)]
pub enum OneDriveError {
    #[error("rate limited, retry after {retry_after:?}")]
    Throttled { retry_after: Duration },

    #[error("item not found: {item}")]
    NotFound { item: String },

    #[error("file too large for simple upload: {size} bytes (max: {max})")]
    FileTooLarge { size: usize, max: usize },

    #[error("upload session expired")]
    UploadSessionExpired,
}

pub type OneDriveResult<T> = Result<T, OneDriveError>;
```

### 1.4 Streaming Standards

```rust
// Use async streams for large data
use futures::Stream;
use bytes::Bytes;

pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, OneDriveError>> + Send>>;

// Implement AsyncRead for upload sources
impl OneDriveClient {
    pub async fn upload_large<R: AsyncRead + Unpin + Send>(
        &self,
        params: LargeUploadParams<R>,
    ) -> OneDriveResult<DriveItem>;
}
```

### 1.5 Memory Safety

```rust
// Use Arc for shared ownership
pub struct OneDriveClient {
    config: Arc<OneDriveConfig>,
    auth: Arc<AzureAdClient>,
    http_client: Arc<reqwest::Client>,
    simulation: Arc<SimulationLayer>,
}

// Implement Clone (cheap Arc clones)
impl Clone for OneDriveClient {
    fn clone(&self) -> Self {
        Self {
            config: Arc::clone(&self.config),
            auth: Arc::clone(&self.auth),
            http_client: Arc::clone(&self.http_client),
            simulation: Arc::clone(&self.simulation),
        }
    }
}
```

---

## 2. Interface Contracts

### 2.1 Client Interface

```rust
/// OneDrive file operations client.
///
/// Thread-safe and cloneable. Uses shared Azure AD authentication.
pub struct OneDriveClient { /* ... */ }

impl OneDriveClient {
    /// Create a new client with configuration and shared auth.
    pub async fn new(config: OneDriveConfig, auth: AzureAdClient) -> OneDriveResult<Self>;

    // File Operations
    /// Upload a small file (≤4MB) in a single request.
    pub async fn upload_small(&self, params: UploadParams) -> OneDriveResult<DriveItem>;

    /// Upload a large file using resumable upload session.
    pub async fn upload_large<R: AsyncRead + Unpin + Send>(
        &self,
        params: LargeUploadParams<R>,
    ) -> OneDriveResult<DriveItem>;

    /// Download a file as a byte stream.
    pub async fn download(&self, drive: Option<DriveRef>, item: ItemRef) -> OneDriveResult<ByteStream>;

    /// Delete a file or folder.
    pub async fn delete(&self, drive: Option<DriveRef>, item: ItemRef) -> OneDriveResult<()>;

    /// Copy a file (async operation).
    pub async fn copy(&self, params: CopyParams) -> OneDriveResult<AsyncOperation>;

    /// Move or rename a file.
    pub async fn move_item(&self, params: MoveParams) -> OneDriveResult<DriveItem>;

    // Folder Operations
    pub async fn create_folder(&self, drive: Option<DriveRef>, parent: ItemRef, name: &str) -> OneDriveResult<DriveItem>;
    pub async fn list_children(&self, drive: Option<DriveRef>, folder: ItemRef, options: ListOptions) -> OneDriveResult<Page<DriveItem>>;
    pub async fn list_recursive(&self, drive: Option<DriveRef>, folder: ItemRef) -> OneDriveResult<impl Stream<Item = OneDriveResult<DriveItem>>>;

    // Version Operations
    pub async fn list_versions(&self, drive: Option<DriveRef>, item: ItemRef) -> OneDriveResult<Vec<DriveItemVersion>>;
    pub async fn download_version(&self, drive: Option<DriveRef>, item: ItemRef, version_id: &str) -> OneDriveResult<ByteStream>;
    pub async fn restore_version(&self, drive: Option<DriveRef>, item: ItemRef, version_id: &str) -> OneDriveResult<DriveItem>;

    // Metadata
    pub async fn get_item(&self, drive: Option<DriveRef>, item: ItemRef) -> OneDriveResult<DriveItem>;
    pub async fn update_item(&self, drive: Option<DriveRef>, item: ItemRef, updates: ItemUpdates) -> OneDriveResult<DriveItem>;
}
```

### 2.2 Configuration Interface

```rust
pub struct OneDriveConfig {
    pub default_drive: Option<DriveRef>,
    pub chunk_size: usize,
    pub max_retries: u32,
    pub timeout: Duration,
    pub simulation_mode: SimulationMode,
    pub path_routing: HashMap<String, PathRef>,
}

pub struct OneDriveConfigBuilder { /* ... */ }

impl OneDriveConfigBuilder {
    pub fn new() -> Self;
    pub fn with_default_drive(self, drive: DriveRef) -> Self;
    pub fn with_chunk_size(self, size: usize) -> Self;
    pub fn with_max_retries(self, retries: u32) -> Self;
    pub fn with_timeout(self, timeout: Duration) -> Self;
    pub fn with_simulation(self, mode: SimulationMode) -> Self;
    pub fn with_path_alias(self, name: impl Into<String>, path: PathRef) -> Self;
    pub fn build(self) -> Result<OneDriveConfig, ConfigError>;
}
```

### 2.3 Type Contracts

```rust
/// Reference to a drive.
#[derive(Debug, Clone)]
pub enum DriveRef {
    Me,
    Id(String),
    User(String),
    Site(String),
}

/// Reference to an item (file or folder).
#[derive(Debug, Clone)]
pub enum ItemRef {
    Id(String),
    Path(String),
}

/// OneDrive item metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveItem {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    #[serde(rename = "createdDateTime")]
    pub created_date_time: DateTime<Utc>,
    #[serde(rename = "lastModifiedDateTime")]
    pub last_modified_date_time: DateTime<Utc>,
    #[serde(rename = "webUrl")]
    pub web_url: String,
    #[serde(rename = "parentReference", skip_serializing_if = "Option::is_none")]
    pub parent_reference: Option<ParentReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<FileMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<FolderMetadata>,
    #[serde(rename = "eTag")]
    pub e_tag: String,
    #[serde(rename = "cTag")]
    pub c_tag: String,
}
```

---

## 3. Testing Requirements

### 3.1 Test Categories

| Category | Coverage Target | Method |
|----------|-----------------|--------|
| Unit Tests | >80% | cargo test |
| Integration (Sim) | All operations | Replay mode |
| Integration (Real) | Critical paths | Graph API (CI) |
| Streaming | Large files | Memory profiling |
| Upload Session | Resume/cancel | Simulated failures |

### 3.2 Unit Test Examples

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_drive_ref_url() {
        let client = create_test_client();

        assert_eq!(
            client.drive_url(&DriveRef::Me),
            "https://graph.microsoft.com/v1.0/me/drive"
        );

        assert_eq!(
            client.drive_url(&DriveRef::Id("abc123".into())),
            "https://graph.microsoft.com/v1.0/drives/abc123"
        );
    }

    #[test]
    fn test_item_ref_url() {
        let client = create_test_client();
        let drive = DriveRef::Me;

        assert_eq!(
            client.item_url(&drive, &ItemRef::Id("item123".into())),
            "https://graph.microsoft.com/v1.0/me/drive/items/item123"
        );

        assert_eq!(
            client.item_url(&drive, &ItemRef::Path("folder/file.txt".into())),
            "https://graph.microsoft.com/v1.0/me/drive/root:/folder/file.txt"
        );
    }

    #[test]
    fn test_chunk_size_validation() {
        // Too small
        let result = OneDriveConfigBuilder::new()
            .with_chunk_size(100_000)
            .build();
        assert!(result.is_err());

        // Valid (10MB)
        let result = OneDriveConfigBuilder::new()
            .with_chunk_size(10 * 1024 * 1024)
            .build();
        assert!(result.is_ok());
    }

    #[test]
    fn test_file_too_large_for_simple() {
        let content = vec![0u8; 5 * 1024 * 1024]; // 5MB
        let params = UploadParams {
            content,
            ..Default::default()
        };

        // Should return FileTooLarge error
        let result = validate_simple_upload(&params);
        assert!(matches!(result, Err(OneDriveError::FileTooLarge { .. })));
    }
}
```

### 3.3 Integration Test Examples

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_upload_download_simulation() {
        let config = OneDriveConfigBuilder::new()
            .with_default_drive(DriveRef::Me)
            .with_simulation(SimulationMode::Replay {
                path: PathBuf::from("tests/fixtures/recordings/upload_download.json"),
            })
            .build()
            .unwrap();

        let auth = create_mock_auth();
        let client = OneDriveClient::new(config, auth).await.unwrap();

        // Upload
        let item = client.upload_small(UploadParams {
            path: ItemRef::Path("test.txt".into()),
            content: b"Hello, World!".to_vec(),
            ..Default::default()
        }).await.unwrap();

        assert_eq!(item.name, "test.txt");

        // Download
        let mut stream = client.download(None, ItemRef::Id(item.id)).await.unwrap();
        let mut content = Vec::new();
        while let Some(chunk) = stream.next().await {
            content.extend_from_slice(&chunk.unwrap());
        }

        assert_eq!(content, b"Hello, World!");
    }

    #[tokio::test]
    async fn test_large_upload_resume() {
        let config = OneDriveConfigBuilder::new()
            .with_simulation(SimulationMode::Replay {
                path: PathBuf::from("tests/fixtures/recordings/large_upload_resume.json"),
            })
            .build()
            .unwrap();

        let client = OneDriveClient::new(config, create_mock_auth()).await.unwrap();

        // Simulate upload with interruption and resume
        let data = vec![0u8; 50 * 1024 * 1024]; // 50MB
        let cursor = std::io::Cursor::new(data);

        let result = client.upload_large(LargeUploadParams {
            path: ItemRef::Path("large_file.bin".into()),
            stream: cursor,
            size: 50 * 1024 * 1024,
            ..Default::default()
        }).await;

        assert!(result.is_ok());
    }
}
```

### 3.4 Test Fixtures

```
tests/fixtures/recordings/
├── file/
│   ├── upload_small.json
│   ├── upload_large.json
│   ├── download.json
│   └── delete.json
├── folder/
│   ├── create.json
│   ├── list.json
│   └── recursive.json
├── version/
│   ├── list.json
│   └── restore.json
├── content/
│   ├── sha256_abc123...
│   └── sha256_def456...
└── errors/
    ├── throttled.json
    ├── not_found.json
    └── conflict.json
```

---

## 4. Security Considerations

### 4.1 Token Handling

```rust
// Tokens managed by shared Azure AD client
impl OneDriveClient {
    async fn get_auth_header(&self) -> OneDriveResult<String> {
        let token = self.auth
            .get_token(&["https://graph.microsoft.com/.default"])
            .await
            .map_err(|e| OneDriveError::AuthError { source: e })?;

        Ok(format!("Bearer {}", token.access_token.expose_secret()))
    }
}

// Never log tokens
impl std::fmt::Debug for OneDriveClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OneDriveClient")
            .field("config", &self.config)
            .field("auth", &"[AzureAdClient]")
            .finish()
    }
}
```

### 4.2 Content Integrity

```rust
// Verify content hash after download
impl OneDriveClient {
    pub async fn download_verified(
        &self,
        drive: Option<DriveRef>,
        item: ItemRef,
    ) -> OneDriveResult<(ByteStream, Option<String>)> {
        // Get item metadata first
        let metadata = self.get_item(drive.clone(), item.clone()).await?;
        let expected_hash = metadata.file
            .and_then(|f| f.hashes)
            .and_then(|h| h.sha256_hash);

        let stream = self.download(drive, item).await?;

        Ok((stream, expected_hash))
    }
}

// Hash content during upload for simulation
fn hash_content(content: &[u8]) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("sha256:{:x}", hasher.finalize())
}
```

### 4.3 Path Validation

```rust
impl ItemRef {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            ItemRef::Path(path) => {
                // Check path length
                if path.len() > 400 {
                    return Err(ValidationError::PathTooLong { len: path.len() });
                }

                // Check for invalid characters
                let invalid_chars = ['<', '>', ':', '"', '|', '?', '*'];
                if path.chars().any(|c| invalid_chars.contains(&c)) {
                    return Err(ValidationError::InvalidPathCharacters);
                }

                // Check filename length
                if let Some(name) = path.split('/').last() {
                    if name.len() > 255 {
                        return Err(ValidationError::FilenameTooLong { len: name.len() });
                    }
                }

                Ok(())
            }
            ItemRef::Id(_) => Ok(()),
        }
    }
}
```

### 4.4 TLS Requirements

```rust
impl OneDriveClient {
    async fn new(config: OneDriveConfig, auth: AzureAdClient) -> OneDriveResult<Self> {
        let http_client = reqwest::Client::builder()
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .https_only(true)
            .timeout(config.timeout)
            .build()?;
        // ...
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
let http_client = reqwest::Client::builder()
    .pool_max_idle_per_host(10)
    .pool_idle_timeout(Duration::from_secs(90))
    .tcp_keepalive(Duration::from_secs(60))
    .build()?;
```

### 5.2 Streaming Optimization

```rust
// Use chunked transfer for downloads
impl ByteStream {
    pub fn from_response(response: Response) -> Self {
        Box::pin(response.bytes_stream().map_err(|e| {
            OneDriveError::NetworkError { source: Box::new(e) }
        }))
    }
}

// Buffer uploads efficiently
const UPLOAD_BUFFER_SIZE: usize = 10 * 1024 * 1024; // 10MB

async fn read_chunk<R: AsyncRead + Unpin>(
    reader: &mut R,
    buffer: &mut [u8],
) -> std::io::Result<usize> {
    let mut total = 0;
    while total < buffer.len() {
        match reader.read(&mut buffer[total..]).await? {
            0 => break,
            n => total += n,
        }
    }
    Ok(total)
}
```

### 5.3 Parallel Operations

```rust
// Upload multiple files in parallel
use futures::stream::{self, StreamExt};

pub async fn upload_batch(
    client: &OneDriveClient,
    files: Vec<UploadParams>,
    concurrency: usize,
) -> Vec<OneDriveResult<DriveItem>> {
    stream::iter(files)
        .map(|params| async { client.upload_small(params).await })
        .buffer_unordered(concurrency)
        .collect()
        .await
}
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
name: OneDrive Integration CI

on:
  push:
    paths:
      - 'integrations/onedrive/**'
  pull_request:
    paths:
      - 'integrations/onedrive/**'

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/onedrive

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings
        working-directory: integrations/onedrive

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Run tests
        run: cargo test --all-features
        working-directory: integrations/onedrive

      - name: Coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --output-dir coverage
        working-directory: integrations/onedrive

      - uses: codecov/codecov-action@v3
        with:
          files: integrations/onedrive/coverage/cobertura.xml

  integration-test:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Integration tests
        run: cargo test --features integration-test
        working-directory: integrations/onedrive
        env:
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          ONEDRIVE_TEST_DRIVE_ID: ${{ secrets.ONEDRIVE_TEST_DRIVE_ID }}

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Security audit
        run: |
          cargo install cargo-audit
          cargo audit
        working-directory: integrations/onedrive
```

### 6.2 Quality Gates

| Gate | Threshold |
|------|-----------|
| Line coverage | >80% |
| Clippy warnings | 0 |
| Format check | Pass |
| Security audit | 0 critical |
| Doc coverage | >90% public |

---

## 7. Documentation Requirements

### 7.1 Module Documentation

```rust
//! # OneDrive Integration
//!
//! Thin adapter for Microsoft OneDrive file operations via Graph API.
//!
//! ## Features
//!
//! - Small file upload (≤4MB single request)
//! - Large file upload (resumable sessions)
//! - Streaming downloads (memory efficient)
//! - Folder operations with recursive listing
//! - Version history access
//! - Simulation mode for testing
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use onedrive::{OneDriveClient, OneDriveConfigBuilder, DriveRef, ItemRef, UploadParams};
//! use azure_ad::AzureAdClient;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let auth = AzureAdClient::new(/* ... */).await?;
//!     let config = OneDriveConfigBuilder::new()
//!         .with_default_drive(DriveRef::Me)
//!         .build()?;
//!
//!     let client = OneDriveClient::new(config, auth).await?;
//!
//!     // Upload a file
//!     let item = client.upload_small(UploadParams {
//!         path: ItemRef::Path("documents/report.pdf".into()),
//!         content: std::fs::read("report.pdf")?,
//!         ..Default::default()
//!     }).await?;
//!
//!     println!("Uploaded: {}", item.web_url);
//!     Ok(())
//! }
//! ```
```

### 7.2 API Documentation Example

```rust
/// Upload a large file using resumable upload session.
///
/// For files larger than 4MB, this method creates an upload session
/// and uploads the file in chunks. The upload can be resumed if
/// interrupted.
///
/// # Arguments
///
/// * `params` - Upload parameters including path, stream, and options
///
/// # Chunk Size
///
/// Chunks must be multiples of 320 KB. Default is 10 MB.
/// Configure via `OneDriveConfigBuilder::with_chunk_size()`.
///
/// # Examples
///
/// ```rust,no_run
/// use tokio::fs::File;
/// use tokio::io::BufReader;
///
/// let file = File::open("large_video.mp4").await?;
/// let size = file.metadata().await?.len();
/// let reader = BufReader::new(file);
///
/// let item = client.upload_large(LargeUploadParams {
///     path: ItemRef::Path("videos/large_video.mp4".into()),
///     stream: reader,
///     size,
///     options: UploadOptions {
///         conflict_behavior: ConflictBehavior::Replace,
///         ..Default::default()
///     },
///     ..Default::default()
/// }).await?;
/// ```
pub async fn upload_large<R: AsyncRead + Unpin + Send>(
    &self,
    params: LargeUploadParams<R>,
) -> OneDriveResult<DriveItem>;
```

---

## 8. Review Checklist

### 8.1 Pre-Implementation

| Item | Status |
|------|--------|
| Specification reviewed | Required |
| Pseudocode reviewed | Required |
| Architecture reviewed | Required |
| Azure AD integration available | Required |
| Test strategy defined | Required |

### 8.2 Implementation Review

| Item | Verification |
|------|--------------|
| All public APIs documented | Doc coverage |
| Error handling complete | All Results handled |
| Streaming implemented | Memory profiling |
| Upload sessions work | Integration tests |
| Token refresh works | Auth tests |
| Simulation mode works | Unit tests |

### 8.3 Pre-Merge

| Item | Required |
|------|----------|
| CI pipeline green | Yes |
| Code reviewed | Yes |
| Documentation updated | Yes |
| CHANGELOG updated | Yes |
| Security review passed | Yes |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-ONEDRIVE-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*SPARC Phase 4 Complete - Proceed to Completion phase with "Next phase."*
