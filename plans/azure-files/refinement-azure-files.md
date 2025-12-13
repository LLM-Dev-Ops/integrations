# Azure Files Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/azure-files`

---

## 1. Core Client Interface (Rust)

### 1.1 AzureFilesClient

```rust
pub struct AzureFilesClient {
    config: AzureFilesConfig,
    auth: Arc<dyn AzureAuthProvider>,
    transport: Arc<HttpTransport>,
    circuit_breaker: Arc<CircuitBreaker>,
}

impl AzureFilesClient {
    pub fn new(config: AzureFilesConfig) -> Result<Self, AzureFilesError>;
    pub fn builder() -> AzureFilesClientBuilder;
    pub fn files(&self) -> FileService;
    pub fn directories(&self) -> DirectoryService;
    pub fn leases(&self) -> LeaseService;
    pub fn shares(&self) -> ShareService;
    pub fn streaming(&self) -> StreamingService;
    pub fn mock() -> MockAzureFilesClient;
}

pub struct AzureFilesClientBuilder {
    account_name: Option<String>,
    credentials: Option<AzureCredentials>,
    default_share: Option<String>,
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
    timeout: Duration,
}

impl AzureFilesClientBuilder {
    pub fn new() -> Self;
    pub fn account_name(self, name: impl Into<String>) -> Self;
    pub fn credentials(self, creds: AzureCredentials) -> Self;
    pub fn shared_key(self, key: impl Into<String>) -> Self;
    pub fn sas_token(self, token: impl Into<String>) -> Self;
    pub fn connection_string(self, conn: impl Into<String>) -> Self;
    pub fn default_share(self, share: impl Into<String>) -> Self;
    pub fn timeout(self, timeout: Duration) -> Self;
    pub fn retry_config(self, config: RetryConfig) -> Self;
    pub fn build(self) -> Result<AzureFilesClient, AzureFilesError>;
}
```

### 1.2 Configuration Types

```rust
#[derive(Clone, Debug)]
pub struct AzureFilesConfig {
    pub account_name: String,
    pub credentials: AzureCredentials,
    pub default_share: Option<String>,
    pub retry_config: RetryConfig,
    pub circuit_breaker_config: CircuitBreakerConfig,
    pub timeout: Duration,
    pub range_size: usize,
}

#[derive(Clone)]
pub enum AzureCredentials {
    SharedKey(SecretString),
    SasToken(String),
    ConnectionString(SecretString),
}

impl Default for AzureFilesConfig {
    fn default() -> Self {
        Self {
            account_name: String::new(),
            credentials: AzureCredentials::SharedKey(SecretString::new("")),
            default_share: None,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            timeout: Duration::from_secs(30),
            range_size: 4 * 1024 * 1024, // 4 MB
        }
    }
}
```

---

## 2. Service Interfaces

### 2.1 FileService

```rust
#[async_trait]
pub trait FileServiceTrait: Send + Sync {
    async fn create(&self, req: CreateFileRequest) -> Result<FileInfo, AzureFilesError>;
    async fn read(&self, req: ReadFileRequest) -> Result<FileContent, AzureFilesError>;
    async fn write(&self, req: WriteFileRequest) -> Result<(), AzureFilesError>;
    async fn delete(&self, req: DeleteFileRequest) -> Result<(), AzureFilesError>;
    async fn get_properties(&self, req: GetPropertiesRequest) -> Result<FileProperties, AzureFilesError>;
    async fn set_metadata(&self, req: SetMetadataRequest) -> Result<(), AzureFilesError>;
    async fn copy(&self, req: CopyFileRequest) -> Result<CopyStatus, AzureFilesError>;
}

pub struct FileService {
    client: Arc<AzureFilesClientInner>,
}

impl FileService {
    pub fn in_share(&self, share: impl Into<String>) -> ShareBoundFileService;
}

pub struct ShareBoundFileService {
    service: FileService,
    share: String,
}

impl ShareBoundFileService {
    pub async fn create(&self, path: impl Into<String>, size: u64) -> Result<FileInfo, AzureFilesError>;
    pub async fn read(&self, path: impl Into<String>) -> Result<FileContent, AzureFilesError>;
    pub async fn write(&self, path: impl Into<String>, data: Bytes) -> Result<(), AzureFilesError>;
    pub async fn delete(&self, path: impl Into<String>) -> Result<(), AzureFilesError>;
}
```

### 2.2 DirectoryService

```rust
#[async_trait]
pub trait DirectoryServiceTrait: Send + Sync {
    async fn create(&self, req: CreateDirectoryRequest) -> Result<DirectoryInfo, AzureFilesError>;
    async fn delete(&self, req: DeleteDirectoryRequest) -> Result<(), AzureFilesError>;
    async fn list(&self, req: ListDirectoryRequest) -> Result<DirectoryListing, AzureFilesError>;
    fn list_all(&self, req: ListDirectoryRequest) -> BoxStream<'static, Result<DirectoryEntry, AzureFilesError>>;
    async fn delete_recursive(&self, share: &str, path: &str) -> Result<(), AzureFilesError>;
}

pub struct DirectoryService {
    client: Arc<AzureFilesClientInner>,
}
```

### 2.3 LeaseService

```rust
#[async_trait]
pub trait LeaseServiceTrait: Send + Sync {
    async fn acquire(&self, req: AcquireLeaseRequest) -> Result<Lease, AzureFilesError>;
    async fn renew(&self, lease: &Lease) -> Result<(), AzureFilesError>;
    async fn release(&self, lease: Lease) -> Result<(), AzureFilesError>;
    async fn break_lease(&self, req: BreakLeaseRequest) -> Result<Duration, AzureFilesError>;
    async fn with_lock<F, T>(&self, req: AcquireLeaseRequest, f: F) -> Result<T, AzureFilesError>
    where
        F: FnOnce(LeaseGuard) -> BoxFuture<'static, Result<T, AzureFilesError>> + Send;
}

pub struct LeaseService {
    client: Arc<AzureFilesClientInner>,
}

pub struct Lease {
    pub id: String,
    pub share: String,
    pub path: String,
    pub duration: Option<Duration>,
    pub acquired_at: DateTime<Utc>,
}

pub struct LeaseGuard {
    lease_id: String,
}

impl LeaseGuard {
    pub fn id(&self) -> &str;
}

pub struct AutoRenewingLease {
    lease: Lease,
    cancel_tx: broadcast::Sender<()>,
    renewal_handle: JoinHandle<()>,
}

impl AutoRenewingLease {
    pub fn new(lease: Lease, service: LeaseService, interval: Duration) -> Self;
    pub fn lease_id(&self) -> &str;
    pub async fn release(self) -> Result<(), AzureFilesError>;
}
```

### 2.4 StreamingService

```rust
#[async_trait]
pub trait StreamingServiceTrait: Send + Sync {
    async fn upload_stream<S>(&self, req: UploadStreamRequest, stream: S) -> Result<FileInfo, AzureFilesError>
    where
        S: Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static;

    async fn download_stream(&self, req: DownloadStreamRequest) -> Result<BoxStream<'static, Result<Bytes, AzureFilesError>>, AzureFilesError>;

    async fn download_range(&self, req: DownloadRangeRequest) -> Result<Bytes, AzureFilesError>;
}

pub struct StreamingService {
    client: Arc<AzureFilesClientInner>,
}
```

---

## 3. Request/Response Types

### 3.1 File Operations

```rust
#[derive(Clone, Debug)]
pub struct CreateFileRequest {
    pub share: String,
    pub path: String,
    pub size: u64,
    pub content_type: Option<String>,
    pub metadata: HashMap<String, String>,
    pub lease_id: Option<String>,
}

impl CreateFileRequest {
    pub fn new(share: impl Into<String>, path: impl Into<String>, size: u64) -> Self;
    pub fn content_type(self, ct: impl Into<String>) -> Self;
    pub fn metadata(self, key: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn with_lease(self, lease_id: impl Into<String>) -> Self;
}

#[derive(Clone, Debug)]
pub struct ReadFileRequest {
    pub share: String,
    pub path: String,
    pub range: Option<ByteRange>,
    pub lease_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64,
}

#[derive(Clone, Debug)]
pub struct WriteFileRequest {
    pub share: String,
    pub path: String,
    pub data: Bytes,
    pub offset: Option<u64>,
    pub lease_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DeleteFileRequest {
    pub share: String,
    pub path: String,
    pub lease_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CopyFileRequest {
    pub source_share: String,
    pub source_path: String,
    pub dest_share: String,
    pub dest_path: String,
    pub metadata: Option<HashMap<String, String>>,
}
```

### 3.2 Response Types

```rust
#[derive(Clone, Debug)]
pub struct FileInfo {
    pub share: String,
    pub path: String,
    pub size: u64,
    pub etag: String,
    pub last_modified: DateTime<Utc>,
    pub content_type: Option<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Clone)]
pub struct FileContent {
    pub data: Bytes,
    pub properties: FileProperties,
    pub etag: String,
}

#[derive(Clone, Debug)]
pub struct FileProperties {
    pub size: u64,
    pub content_type: Option<String>,
    pub content_encoding: Option<String>,
    pub content_md5: Option<String>,
    pub last_modified: DateTime<Utc>,
    pub etag: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Clone, Debug)]
pub struct DirectoryInfo {
    pub share: String,
    pub path: String,
    pub etag: String,
    pub last_modified: DateTime<Utc>,
    pub metadata: HashMap<String, String>,
}

#[derive(Clone, Debug)]
pub struct DirectoryListing {
    pub entries: Vec<DirectoryEntry>,
    pub next_marker: Option<String>,
}

#[derive(Clone, Debug)]
pub enum DirectoryEntry {
    File(FileInfo),
    Directory(DirectoryInfo),
}

impl DirectoryEntry {
    pub fn is_file(&self) -> bool;
    pub fn is_directory(&self) -> bool;
    pub fn name(&self) -> &str;
    pub fn path(&self) -> &str;
}
```

### 3.3 Lease Types

```rust
#[derive(Clone, Debug)]
pub struct AcquireLeaseRequest {
    pub share: String,
    pub path: String,
    pub duration: Option<Duration>,
    pub proposed_lease_id: Option<String>,
}

impl AcquireLeaseRequest {
    pub fn new(share: impl Into<String>, path: impl Into<String>) -> Self;
    pub fn duration(self, duration: Duration) -> Self;
    pub fn infinite(self) -> Self;
    pub fn proposed_id(self, id: impl Into<String>) -> Self;
}

#[derive(Clone, Debug)]
pub struct BreakLeaseRequest {
    pub share: String,
    pub path: String,
    pub break_period: Option<Duration>,
}

#[derive(Clone, Debug)]
pub enum CopyStatus {
    Success,
    Pending { copy_id: String },
    Aborted,
    Failed { reason: String },
}
```

### 3.4 Streaming Types

```rust
#[derive(Clone, Debug)]
pub struct UploadStreamRequest {
    pub share: String,
    pub path: String,
    pub total_size: u64,
    pub content_type: Option<String>,
    pub metadata: HashMap<String, String>,
    pub lease_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DownloadStreamRequest {
    pub share: String,
    pub path: String,
    pub lease_id: Option<String>,
    pub buffer_size: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct DownloadRangeRequest {
    pub share: String,
    pub path: String,
    pub start: u64,
    pub end: u64,
    pub lease_id: Option<String>,
}
```

---

## 4. Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum AzureFilesError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("File error: {0}")]
    File(#[from] FileError),

    #[error("Directory error: {0}")]
    Directory(#[from] DirectoryError),

    #[error("Lease error: {0}")]
    Lease(#[from] LeaseError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),
}

impl AzureFilesError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AzureFilesError::Server(ServerError::ServerBusy { .. })
                | AzureFilesError::Server(ServerError::ServiceUnavailable { .. })
                | AzureFilesError::Network(NetworkError::Timeout { .. })
                | AzureFilesError::Network(NetworkError::ConnectionFailed { .. })
                | AzureFilesError::Lease(LeaseError::LeaseLost { .. })
        )
    }

    pub fn is_conflict(&self) -> bool {
        matches!(
            self,
            AzureFilesError::File(FileError::FileLocked { .. })
                | AzureFilesError::Lease(LeaseError::LeaseAlreadyPresent { .. })
        )
    }

    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            AzureFilesError::Server(ServerError::ServerBusy { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("File not found: {share}/{path}")]
    FileNotFound { share: String, path: String },

    #[error("File already exists: {share}/{path}")]
    FileAlreadyExists { share: String, path: String },

    #[error("File locked: {share}/{path}")]
    FileLocked { share: String, path: String },

    #[error("Invalid range: {start}-{end} for file size {size}")]
    InvalidRange { start: u64, end: u64, size: u64 },

    #[error("Precondition failed: expected {expected}, got {actual}")]
    PreconditionFailed { expected: String, actual: String },
}

#[derive(Debug, thiserror::Error)]
pub enum LeaseError {
    #[error("Lease not present on {share}/{path}")]
    LeaseNotPresent { share: String, path: String },

    #[error("Lease already present on {share}/{path}")]
    LeaseAlreadyPresent { share: String, path: String },

    #[error("Lease ID mismatch")]
    LeaseIdMismatch,

    #[error("Lease lost during operation")]
    LeaseLost { share: String, path: String },
}
```

---

## 5. TypeScript Interfaces

```typescript
interface AzureFilesClient {
  readonly files: FileService;
  readonly directories: DirectoryService;
  readonly leases: LeaseService;
  readonly streaming: StreamingService;
}

interface FileService {
  create(req: CreateFileRequest): Promise<FileInfo>;
  read(req: ReadFileRequest): Promise<FileContent>;
  write(req: WriteFileRequest): Promise<void>;
  delete(req: DeleteFileRequest): Promise<void>;
  getProperties(req: GetPropertiesRequest): Promise<FileProperties>;
  inShare(share: string): ShareBoundFileService;
}

interface ShareBoundFileService {
  create(path: string, size: number): Promise<FileInfo>;
  read(path: string): Promise<FileContent>;
  write(path: string, data: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
}

interface LeaseService {
  acquire(req: AcquireLeaseRequest): Promise<Lease>;
  renew(lease: Lease): Promise<void>;
  release(lease: Lease): Promise<void>;
  breakLease(req: BreakLeaseRequest): Promise<number>;
  withLock<T>(req: AcquireLeaseRequest, fn: (guard: LeaseGuard) => Promise<T>): Promise<T>;
}

interface StreamingService {
  uploadStream(req: UploadStreamRequest, stream: ReadableStream<Uint8Array>): Promise<FileInfo>;
  downloadStream(req: DownloadStreamRequest): Promise<ReadableStream<Uint8Array>>;
  downloadRange(req: DownloadRangeRequest): Promise<Uint8Array>;
}

// Request types
interface CreateFileRequest {
  share: string;
  path: string;
  size: number;
  contentType?: string;
  metadata?: Record<string, string>;
  leaseId?: string;
}

interface ReadFileRequest {
  share: string;
  path: string;
  range?: { start: number; end: number };
  leaseId?: string;
}

interface AcquireLeaseRequest {
  share: string;
  path: string;
  durationSeconds?: number;
  proposedLeaseId?: string;
}

// Response types
interface FileInfo {
  share: string;
  path: string;
  size: number;
  etag: string;
  lastModified: Date;
  contentType?: string;
  metadata: Record<string, string>;
}

interface Lease {
  id: string;
  share: string;
  path: string;
  durationSeconds?: number;
  acquiredAt: Date;
}

interface DirectoryEntry {
  type: 'file' | 'directory';
  name: string;
  path: string;
  size?: number;
  lastModified: Date;
}

// Configuration
interface AzureFilesConfig {
  accountName: string;
  credentials: AzureCredentials;
  defaultShare?: string;
  timeoutMs?: number;
  retryConfig?: RetryConfig;
}

type AzureCredentials =
  | { type: 'shared_key'; key: string }
  | { type: 'sas_token'; token: string }
  | { type: 'connection_string'; connectionString: string };
```

---

## 6. Integration Patterns

### 6.1 Lease-Protected File Update

```rust
let client = AzureFilesClient::builder()
    .account_name("myaccount")
    .shared_key(env::var("AZURE_STORAGE_KEY")?)
    .build()?;

// Use with_lock for automatic lease management
client.leases().with_lock(
    AcquireLeaseRequest::new("myshare", "config.json")
        .duration(Duration::from_secs(30)),
    |guard| async move {
        // Read current content
        let content = client.files().read(
            ReadFileRequest {
                share: "myshare".into(),
                path: "config.json".into(),
                lease_id: Some(guard.id().to_string()),
                ..Default::default()
            }
        ).await?;

        // Modify and write back
        let mut config: Config = serde_json::from_slice(&content.data)?;
        config.updated_at = Utc::now();

        let new_data = serde_json::to_vec(&config)?;
        client.files().write(WriteFileRequest {
            share: "myshare".into(),
            path: "config.json".into(),
            data: Bytes::from(new_data),
            lease_id: Some(guard.id().to_string()),
            ..Default::default()
        }).await?;

        Ok(())
    }.boxed()
).await?;
```

### 6.2 Streaming Large File Upload

```rust
use tokio::fs::File;
use tokio_util::io::ReaderStream;

let file = File::open("large-dataset.bin").await?;
let file_size = file.metadata().await?.len();
let stream = ReaderStream::new(file);

let file_info = client.streaming().upload_stream(
    UploadStreamRequest {
        share: "datasets".into(),
        path: "training/large-dataset.bin".into(),
        total_size: file_size,
        content_type: Some("application/octet-stream".into()),
        ..Default::default()
    },
    stream.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
).await?;

println!("Uploaded {} bytes, etag: {}", file_info.size, file_info.etag);
```

### 6.3 Conditional Update with ETag

```rust
// Read file and get etag
let content = client.files().read(
    ReadFileRequest::new("myshare", "state.json")
).await?;

let current_etag = content.etag.clone();

// Modify content
let mut state: State = serde_json::from_slice(&content.data)?;
state.counter += 1;

// Write with condition
match client.files().write_if_match(
    WriteFileRequest::new("myshare", "state.json", Bytes::from(serde_json::to_vec(&state)?)),
    &current_etag,
).await {
    Ok(()) => println!("Update succeeded"),
    Err(AzureFilesError::File(FileError::PreconditionFailed { .. })) => {
        println!("Concurrent modification detected, retry needed");
    }
    Err(e) => return Err(e),
}
```

### 6.4 Directory Tree Processing

```rust
async fn process_directory(client: &AzureFilesClient, share: &str, path: &str) -> Result<usize, AzureFilesError> {
    let mut count = 0;

    let mut entries = client.directories().list_all(
        ListDirectoryRequest {
            share: share.into(),
            path: Some(path.into()),
            ..Default::default()
        }
    );

    while let Some(entry) = entries.next().await {
        let entry = entry?;
        match entry {
            DirectoryEntry::File(file) => {
                process_file(&file).await?;
                count += 1;
            }
            DirectoryEntry::Directory(dir) => {
                count += process_directory(client, share, &dir.path).await?;
            }
        }
    }

    Ok(count)
}
```

---

## 7. Mock/Simulation Usage

```rust
#[tokio::test]
async fn test_lease_protected_update() {
    let mock = AzureFilesClient::mock()
        .with_file("myshare", "config.json", b"{\"version\": 1}".to_vec())
        .expect_lease_acquire("myshare", "config.json")
        .expect_write("myshare", "config.json");

    mock.leases().with_lock(
        AcquireLeaseRequest::new("myshare", "config.json"),
        |guard| async move {
            let content = mock.files().read(
                ReadFileRequest::new("myshare", "config.json")
                    .with_lease(guard.id())
            ).await?;

            assert_eq!(content.data.as_ref(), b"{\"version\": 1}");

            mock.files().write(WriteFileRequest {
                share: "myshare".into(),
                path: "config.json".into(),
                data: Bytes::from(b"{\"version\": 2}".to_vec()),
                lease_id: Some(guard.id().to_string()),
                ..Default::default()
            }).await
        }.boxed()
    ).await.unwrap();

    mock.verify().unwrap();
}

#[tokio::test]
async fn test_concurrent_lease_conflict() {
    let mock = AzureFilesClient::mock()
        .with_file("myshare", "locked.txt", b"data".to_vec())
        .with_active_lease("myshare", "locked.txt", "existing-lease-id");

    let result = mock.leases().acquire(
        AcquireLeaseRequest::new("myshare", "locked.txt")
    ).await;

    assert!(matches!(
        result,
        Err(AzureFilesError::Lease(LeaseError::LeaseAlreadyPresent { .. }))
    ));
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement phase |

---

**Next Phase:** Completion - Acceptance criteria verification, test coverage requirements, security checklist, and release criteria.
