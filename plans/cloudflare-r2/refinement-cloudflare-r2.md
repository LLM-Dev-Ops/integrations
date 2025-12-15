# Cloudflare R2 Storage Integration - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/cloudflare_r2`

---

## 1. Overview

This refinement document details production hardening patterns, performance optimizations, edge case handling, and advanced implementation strategies for the Cloudflare R2 Storage Integration.

---

## 2. Performance Optimizations

### 2.1 Optimized S3 Signature V4 Signing

```rust
// OPTIMIZATION: Pre-compute signing key for same-day requests
// Key derivation is expensive; reuse within 24-hour window

use std::sync::RwLock;
use chrono::{DateTime, Utc, NaiveDate};

pub struct CachedR2Signer {
    access_key_id: String,
    secret_access_key: SecretString,
    cached_key: RwLock<Option<CachedSigningKey>>,
}

struct CachedSigningKey {
    key: [u8; 32],
    date: NaiveDate,
}

impl CachedR2Signer {
    pub fn sign_request(
        &self,
        request: &mut HttpRequest,
        payload_hash: &str,
        timestamp: DateTime<Utc>,
    ) -> Result<(), SigningError> {
        let date = timestamp.date_naive();

        // Fast path: check if cached key is valid for today
        let signing_key = {
            let cache = self.cached_key.read().unwrap();
            if let Some(ref cached) = *cache {
                if cached.date == date {
                    cached.key
                } else {
                    drop(cache);
                    self.refresh_signing_key(date)
                }
            } else {
                drop(cache);
                self.refresh_signing_key(date)
            }
        };

        // Use pre-computed key for actual signing
        self.sign_with_key(request, payload_hash, timestamp, &signing_key)
    }

    fn refresh_signing_key(&self, date: NaiveDate) -> [u8; 32] {
        let mut cache = self.cached_key.write().unwrap();

        // Double-check after acquiring write lock
        if let Some(ref cached) = *cache {
            if cached.date == date {
                return cached.key;
            }
        }

        let date_stamp = date.format("%Y%m%d").to_string();
        let key = derive_signing_key(
            &self.secret_access_key,
            &date_stamp,
            "auto",  // R2 region
            "s3",
        );

        *cache = Some(CachedSigningKey { key, date });
        key
    }
}

// BENCHMARK TARGET: < 5μs for cached signing, < 50μs for key refresh
```

### 2.2 Zero-Copy Streaming Upload

```rust
// OPTIMIZATION: Stream uploads without buffering entire body
// Critical for large objects (up to 5TB)

use bytes::Bytes;
use futures::Stream;
use pin_project::pin_project;

#[pin_project]
pub struct StreamingUpload<S> {
    #[pin]
    inner: S,
    bytes_sent: u64,
    hasher: Option<Sha256>,
    metrics: Arc<dyn MetricsEmitter>,
}

impl<S> Stream for StreamingUpload<S>
where
    S: Stream<Item = Result<Bytes, std::io::Error>>,
{
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();

        match this.inner.poll_next(cx) {
            Poll::Ready(Some(Ok(chunk))) => {
                *this.bytes_sent += chunk.len() as u64;

                // Update hash incrementally if computing
                if let Some(hasher) = this.hasher.as_mut() {
                    hasher.update(&chunk);
                }

                Poll::Ready(Some(Ok(chunk)))
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                // Stream complete - emit metrics
                this.metrics.observe("r2_bytes_uploaded", *this.bytes_sent as f64, &[]);
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

// For unknown content length, use chunked transfer encoding
impl<S> StreamingUpload<S> {
    pub fn with_hash_computation(self) -> Self {
        Self {
            hasher: Some(Sha256::new()),
            ..self
        }
    }

    pub fn finalize_hash(&mut self) -> Option<String> {
        self.hasher.take().map(|h| hex::encode(h.finalize()))
    }
}
```

### 2.3 Optimized XML Parsing

```rust
// OPTIMIZATION: Streaming XML parser for large ListObjects responses
// Avoids loading entire response into memory

use quick_xml::Reader;
use quick_xml::events::Event;

pub struct StreamingListParser<R: BufRead> {
    reader: Reader<R>,
    buf: Vec<u8>,
    state: ParseState,
}

enum ParseState {
    Initial,
    InContents,
    InKey,
    InSize,
    InETag,
    InLastModified,
    Done,
}

impl<R: BufRead> StreamingListParser<R> {
    pub fn new(reader: R) -> Self {
        let mut xml_reader = Reader::from_reader(reader);
        xml_reader.trim_text(true);

        Self {
            reader: xml_reader,
            buf: Vec::with_capacity(1024),
            state: ParseState::Initial,
        }
    }

    pub fn next_object(&mut self) -> Result<Option<R2Object>, ParseError> {
        let mut current_object: Option<PartialObject> = None;

        loop {
            self.buf.clear();

            match self.reader.read_event_into(&mut self.buf)? {
                Event::Start(e) => {
                    match e.name().as_ref() {
                        b"Contents" => {
                            current_object = Some(PartialObject::default());
                            self.state = ParseState::InContents;
                        }
                        b"Key" if self.state == ParseState::InContents => {
                            self.state = ParseState::InKey;
                        }
                        b"Size" if self.state == ParseState::InContents => {
                            self.state = ParseState::InSize;
                        }
                        b"ETag" if self.state == ParseState::InContents => {
                            self.state = ParseState::InETag;
                        }
                        b"LastModified" if self.state == ParseState::InContents => {
                            self.state = ParseState::InLastModified;
                        }
                        _ => {}
                    }
                }
                Event::Text(e) => {
                    if let Some(ref mut obj) = current_object {
                        let text = e.unescape()?.into_owned();
                        match self.state {
                            ParseState::InKey => obj.key = Some(text),
                            ParseState::InSize => obj.size = Some(text.parse()?),
                            ParseState::InETag => obj.e_tag = Some(text.trim_matches('"').to_string()),
                            ParseState::InLastModified => obj.last_modified = Some(parse_iso8601(&text)?),
                            _ => {}
                        }
                    }
                }
                Event::End(e) => {
                    match e.name().as_ref() {
                        b"Contents" => {
                            if let Some(obj) = current_object.take() {
                                return Ok(Some(obj.try_into()?));
                            }
                            self.state = ParseState::Initial;
                        }
                        b"Key" | b"Size" | b"ETag" | b"LastModified" => {
                            self.state = ParseState::InContents;
                        }
                        b"ListBucketResult" => {
                            self.state = ParseState::Done;
                            return Ok(None);
                        }
                        _ => {}
                    }
                }
                Event::Eof => return Ok(None),
                _ => {}
            }
        }
    }
}

// BENCHMARK TARGET: < 1ms per 100 objects parsed
```

### 2.4 Connection Pool Optimization

```rust
// OPTIMIZATION: Tune connection pool for R2's single endpoint

use reqwest::ClientBuilder;

pub fn create_optimized_transport(config: &R2Config) -> reqwest::Client {
    ClientBuilder::new()
        // R2 uses single endpoint, optimize for that
        .pool_max_idle_per_host(config.pool_size.unwrap_or(20))
        .pool_idle_timeout(Duration::from_secs(90))

        // Enable HTTP/2 for connection multiplexing
        .http2_prior_knowledge()

        // TCP optimizations
        .tcp_nodelay(true)
        .tcp_keepalive(Duration::from_secs(60))

        // TLS optimizations
        .min_tls_version(tls::Version::TLS_1_2)
        .https_only(true)

        // Timeouts
        .connect_timeout(Duration::from_secs(30))
        .timeout(config.timeout)

        // Compression for text responses (XML)
        .gzip(true)

        .build()
        .expect("Failed to create HTTP client")
}
```

### 2.5 Multipart Upload Optimization

```rust
// OPTIMIZATION: Parallel part uploads with memory-bounded buffering

use tokio::sync::Semaphore;

pub struct OptimizedMultipartUploader {
    client: Arc<R2Client>,
    semaphore: Arc<Semaphore>,
    part_size: u64,
    max_concurrent: usize,
}

impl OptimizedMultipartUploader {
    pub async fn upload_stream<S>(
        &self,
        bucket: &str,
        key: &str,
        stream: S,
        options: UploadOptions,
    ) -> Result<UploadOutput, R2Error>
    where
        S: Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static,
    {
        // Initiate multipart
        let upload = self.client.multipart().create(CreateMultipartRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            content_type: options.content_type,
            metadata: options.metadata,
        }).await?;

        let upload_id = upload.upload_id.clone();

        // Channel for completed parts
        let (parts_tx, mut parts_rx) = tokio::sync::mpsc::channel::<CompletedPart>(self.max_concurrent * 2);

        // Spawn part upload tasks
        let upload_handle = {
            let client = Arc::clone(&self.client);
            let semaphore = Arc::clone(&self.semaphore);
            let bucket = bucket.to_string();
            let key = key.to_string();
            let upload_id = upload_id.clone();
            let part_size = self.part_size;

            tokio::spawn(async move {
                let mut part_number = 0i32;
                let mut buffer = BytesMut::with_capacity(part_size as usize);

                tokio::pin!(stream);

                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|e| R2Error::Transfer(TransferError::StreamInterrupted(e.to_string())))?;
                    buffer.extend_from_slice(&chunk);

                    // Upload when buffer reaches part size
                    while buffer.len() >= part_size as usize {
                        part_number += 1;
                        let part_data = buffer.split_to(part_size as usize).freeze();

                        // Acquire semaphore permit (limits concurrency)
                        let permit = semaphore.clone().acquire_owned().await
                            .map_err(|_| R2Error::Internal("Semaphore closed".into()))?;

                        let client = Arc::clone(&client);
                        let bucket = bucket.clone();
                        let key = key.clone();
                        let upload_id = upload_id.clone();
                        let parts_tx = parts_tx.clone();

                        tokio::spawn(async move {
                            let _permit = permit; // Hold permit until upload completes

                            let result = client.multipart().upload_part(UploadPartRequest {
                                bucket,
                                key,
                                upload_id,
                                part_number,
                                body: part_data,
                            }).await;

                            match result {
                                Ok(output) => {
                                    let _ = parts_tx.send(CompletedPart {
                                        part_number,
                                        e_tag: output.e_tag,
                                    }).await;
                                }
                                Err(e) => {
                                    // Error handling - abort will be triggered
                                    tracing::error!(part_number, error = %e, "Part upload failed");
                                }
                            }
                        });
                    }
                }

                // Upload final part if buffer has remaining data
                if !buffer.is_empty() {
                    part_number += 1;
                    let part_data = buffer.freeze();

                    let result = client.multipart().upload_part(UploadPartRequest {
                        bucket: bucket.clone(),
                        key: key.clone(),
                        upload_id: upload_id.clone(),
                        part_number,
                        body: part_data,
                    }).await?;

                    parts_tx.send(CompletedPart {
                        part_number,
                        e_tag: result.e_tag,
                    }).await.ok();
                }

                Ok::<i32, R2Error>(part_number)
            })
        };

        // Collect completed parts
        let mut completed_parts = Vec::new();
        let expected_parts = upload_handle.await
            .map_err(|e| R2Error::Internal(e.to_string()))??;

        drop(parts_tx); // Close sender so receiver knows when done

        while let Some(part) = parts_rx.recv().await {
            completed_parts.push(part);
        }

        // Validate all parts completed
        if completed_parts.len() != expected_parts as usize {
            // Abort and return error
            self.client.multipart().abort(AbortMultipartRequest {
                bucket: bucket.to_string(),
                key: key.to_string(),
                upload_id: upload_id.clone(),
            }).await.ok();

            return Err(R2Error::Multipart(MultipartError::IncompleteParts {
                expected: expected_parts,
                actual: completed_parts.len() as i32,
            }));
        }

        // Sort parts by number (required for completion)
        completed_parts.sort_by_key(|p| p.part_number);

        // Complete multipart upload
        let result = self.client.multipart().complete(CompleteMultipartRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            upload_id,
            parts: completed_parts,
        }).await?;

        Ok(UploadOutput {
            e_tag: Some(result.e_tag),
            version_id: None,
        })
    }
}
```

### 2.6 Presigned URL Caching

```rust
// OPTIMIZATION: Cache presigned URLs for repeated access patterns

use lru::LruCache;
use std::num::NonZeroUsize;

pub struct CachedPresigner {
    signer: Arc<R2Signer>,
    endpoint: Url,
    cache: Mutex<LruCache<PresignCacheKey, CachedPresignedUrl>>,
    cache_margin: Duration,  // Generate new URL when this close to expiry
}

#[derive(Hash, Eq, PartialEq)]
struct PresignCacheKey {
    method: HttpMethod,
    bucket: String,
    key: String,
    expires_in_secs: u64,
}

struct CachedPresignedUrl {
    url: String,
    expires_at: DateTime<Utc>,
}

impl CachedPresigner {
    pub fn new(signer: Arc<R2Signer>, endpoint: Url, cache_size: usize) -> Self {
        Self {
            signer,
            endpoint,
            cache: Mutex::new(LruCache::new(NonZeroUsize::new(cache_size).unwrap())),
            cache_margin: Duration::from_secs(300), // 5 minute margin
        }
    }

    pub fn presign_get(
        &self,
        bucket: &str,
        key: &str,
        expires_in: Duration,
    ) -> Result<PresignedUrl, SigningError> {
        let cache_key = PresignCacheKey {
            method: HttpMethod::GET,
            bucket: bucket.to_string(),
            key: key.to_string(),
            expires_in_secs: expires_in.as_secs(),
        };

        // Check cache
        {
            let mut cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(&cache_key) {
                let now = Utc::now();
                if cached.expires_at - self.cache_margin > now {
                    return Ok(PresignedUrl {
                        url: cached.url.clone(),
                        expires_at: cached.expires_at,
                        method: HttpMethod::GET,
                    });
                }
            }
        }

        // Generate new presigned URL
        let presigned = self.signer.presign_url(
            HttpMethod::GET,
            bucket,
            key,
            expires_in,
            &self.endpoint,
        )?;

        // Cache it
        {
            let mut cache = self.cache.lock().unwrap();
            cache.put(cache_key, CachedPresignedUrl {
                url: presigned.url.clone(),
                expires_at: presigned.expires_at,
            });
        }

        Ok(presigned)
    }
}
```

---

## 3. Error Handling Refinements

### 3.1 Intelligent Retry with Backoff

```rust
// REFINEMENT: Context-aware retry logic for R2

use rand::Rng;

pub struct R2RetryPolicy {
    max_attempts: u32,
    base_delay: Duration,
    max_delay: Duration,
    jitter_factor: f64,
}

impl R2RetryPolicy {
    pub fn should_retry(&self, error: &R2Error, attempt: u32) -> RetryDecision {
        if attempt >= self.max_attempts {
            return RetryDecision::NoMoreRetries;
        }

        match error {
            // Server errors - always retry
            R2Error::Server(ServerError::InternalError { .. }) |
            R2Error::Server(ServerError::ServiceUnavailable { .. }) => {
                RetryDecision::RetryAfter(self.calculate_delay(attempt))
            }

            // SlowDown - respect Retry-After header
            R2Error::Server(ServerError::SlowDown { retry_after, .. }) => {
                let delay = retry_after
                    .unwrap_or_else(|| self.calculate_delay(attempt));
                RetryDecision::RetryAfter(delay)
            }

            // Network errors - retry with shorter initial delay
            R2Error::Network(NetworkError::Timeout) |
            R2Error::Network(NetworkError::ConnectionFailed { .. }) => {
                let delay = self.calculate_delay(attempt) / 2;
                RetryDecision::RetryAfter(delay)
            }

            // Stream interruption - retry for idempotent operations only
            R2Error::Transfer(TransferError::StreamInterrupted { .. }) => {
                RetryDecision::RetryAfter(self.calculate_delay(attempt))
            }

            // Auth errors - no retry (credentials won't magically become valid)
            R2Error::Auth(_) => RetryDecision::DoNotRetry,

            // Client errors - no retry
            R2Error::Config(_) |
            R2Error::Bucket(_) |
            R2Error::Object(ObjectError::ObjectNotFound { .. }) |
            R2Error::Object(ObjectError::PreconditionFailed { .. }) => {
                RetryDecision::DoNotRetry
            }

            // Multipart errors - context dependent
            R2Error::Multipart(MultipartError::UploadNotFound { .. }) => {
                RetryDecision::DoNotRetry  // Upload was aborted/expired
            }
            R2Error::Multipart(_) => {
                RetryDecision::RetryAfter(self.calculate_delay(attempt))
            }

            _ => RetryDecision::DoNotRetry,
        }
    }

    fn calculate_delay(&self, attempt: u32) -> Duration {
        // Exponential backoff: base * 2^attempt
        let exponential = self.base_delay.as_millis() as u64 * (1 << attempt.min(10));
        let capped = exponential.min(self.max_delay.as_millis() as u64);

        // Add jitter to prevent thundering herd
        let jitter = rand::thread_rng().gen_range(0.0..self.jitter_factor);
        let with_jitter = (capped as f64 * (1.0 + jitter)) as u64;

        Duration::from_millis(with_jitter)
    }
}

pub enum RetryDecision {
    RetryAfter(Duration),
    DoNotRetry,
    NoMoreRetries,
}
```

### 3.2 Graceful Multipart Cleanup

```rust
// REFINEMENT: Ensure orphaned multipart uploads are cleaned up

pub struct MultipartCleanupGuard {
    client: Arc<R2Client>,
    bucket: String,
    key: String,
    upload_id: String,
    completed: bool,
}

impl MultipartCleanupGuard {
    pub fn new(
        client: Arc<R2Client>,
        bucket: String,
        key: String,
        upload_id: String,
    ) -> Self {
        Self {
            client,
            bucket,
            key,
            upload_id,
            completed: false,
        }
    }

    pub fn mark_completed(&mut self) {
        self.completed = true;
    }
}

impl Drop for MultipartCleanupGuard {
    fn drop(&mut self) {
        if !self.completed {
            // Spawn cleanup task - don't block on drop
            let client = Arc::clone(&self.client);
            let bucket = self.bucket.clone();
            let key = self.key.clone();
            let upload_id = self.upload_id.clone();

            tokio::spawn(async move {
                tracing::warn!(
                    bucket = %bucket,
                    key = %key,
                    upload_id = %upload_id,
                    "Aborting incomplete multipart upload"
                );

                if let Err(e) = client.multipart().abort(AbortMultipartRequest {
                    bucket,
                    key,
                    upload_id,
                }).await {
                    tracing::error!(error = %e, "Failed to abort multipart upload");
                }
            });
        }
    }
}

// Usage in upload function
pub async fn upload_with_cleanup(
    client: Arc<R2Client>,
    bucket: &str,
    key: &str,
    data: impl Stream<Item = Result<Bytes, std::io::Error>>,
) -> Result<UploadOutput, R2Error> {
    let create_result = client.multipart().create(/* ... */).await?;

    let mut guard = MultipartCleanupGuard::new(
        Arc::clone(&client),
        bucket.to_string(),
        key.to_string(),
        create_result.upload_id.clone(),
    );

    // If anything fails here, guard will abort on drop
    let result = upload_parts(&client, &create_result.upload_id, data).await?;
    let output = complete_upload(&client, &create_result.upload_id, result).await?;

    // Success - don't abort
    guard.mark_completed();

    Ok(output)
}
```

### 3.3 Partial Failure Recovery for Batch Delete

```rust
// REFINEMENT: Handle partial failures in DeleteObjects

pub struct BatchDeleteResult {
    pub successful: Vec<DeletedObject>,
    pub failed: Vec<DeleteError>,
}

impl BatchDeleteResult {
    pub fn is_complete_success(&self) -> bool {
        self.failed.is_empty()
    }

    pub fn is_complete_failure(&self) -> bool {
        self.successful.is_empty()
    }

    pub fn success_count(&self) -> usize {
        self.successful.len()
    }

    pub fn failure_count(&self) -> usize {
        self.failed.len()
    }
}

pub async fn delete_objects_with_retry(
    client: &R2Client,
    bucket: &str,
    keys: Vec<String>,
    max_retries: u32,
) -> Result<BatchDeleteResult, R2Error> {
    let mut remaining_keys: Vec<String> = keys;
    let mut all_successful = Vec::new();
    let mut all_failed = Vec::new();
    let mut attempt = 0;

    while !remaining_keys.is_empty() && attempt < max_retries {
        let result = client.objects().delete_objects(DeleteObjectsRequest {
            bucket: bucket.to_string(),
            objects: remaining_keys.iter().map(|k| ObjectIdentifier {
                key: k.clone(),
                version_id: None,
            }).collect(),
            quiet: false,
        }).await?;

        all_successful.extend(result.deleted);

        // Separate retryable from non-retryable failures
        let (retryable, permanent): (Vec<_>, Vec<_>) = result.errors
            .into_iter()
            .partition(|e| is_retryable_delete_error(e));

        all_failed.extend(permanent);

        // Only retry keys that had retryable errors
        remaining_keys = retryable.into_iter()
            .map(|e| e.key)
            .collect();

        if !remaining_keys.is_empty() {
            attempt += 1;
            tokio::time::sleep(Duration::from_millis(100 * (1 << attempt))).await;
        }
    }

    // Add any remaining as failures
    all_failed.extend(remaining_keys.into_iter().map(|key| DeleteError {
        key,
        code: "MaxRetriesExceeded".to_string(),
        message: "Exceeded maximum retry attempts".to_string(),
    }));

    Ok(BatchDeleteResult {
        successful: all_successful,
        failed: all_failed,
    })
}

fn is_retryable_delete_error(error: &DeleteError) -> bool {
    matches!(error.code.as_str(),
        "InternalError" | "ServiceUnavailable" | "SlowDown"
    )
}
```

### 3.4 Request Timeout Handling

```rust
// REFINEMENT: Different timeouts for different operation types

pub struct R2TimeoutConfig {
    pub connect_timeout: Duration,
    pub small_object_timeout: Duration,   // < 1MB
    pub large_object_timeout: Duration,   // > 1MB
    pub list_timeout: Duration,
    pub multipart_part_timeout: Duration,
}

impl Default for R2TimeoutConfig {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(30),
            small_object_timeout: Duration::from_secs(60),
            large_object_timeout: Duration::from_secs(300),
            list_timeout: Duration::from_secs(120),
            multipart_part_timeout: Duration::from_secs(120),
        }
    }
}

impl R2Client {
    fn timeout_for_operation(&self, op: &Operation) -> Duration {
        match op {
            Operation::PutObject { size } if *size < 1_000_000 => {
                self.timeout_config.small_object_timeout
            }
            Operation::PutObject { .. } => {
                self.timeout_config.large_object_timeout
            }
            Operation::GetObject { expected_size } if expected_size.map(|s| s < 1_000_000).unwrap_or(true) => {
                self.timeout_config.small_object_timeout
            }
            Operation::GetObject { .. } => {
                self.timeout_config.large_object_timeout
            }
            Operation::ListObjects => {
                self.timeout_config.list_timeout
            }
            Operation::UploadPart => {
                self.timeout_config.multipart_part_timeout
            }
            _ => self.timeout_config.small_object_timeout,
        }
    }
}
```

---

## 4. Security Refinements

### 4.1 Credential Protection

```rust
// REFINEMENT: Secure credential handling

use secrecy::{ExposeSecret, SecretString, Zeroize};

pub struct R2Credentials {
    access_key_id: String,
    secret_access_key: SecretString,
}

impl R2Credentials {
    pub fn new(access_key_id: String, secret: String) -> Self {
        Self {
            access_key_id,
            secret_access_key: SecretString::new(secret),
        }
    }

    pub fn access_key_id(&self) -> &str {
        &self.access_key_id
    }

    // Only expose secret when absolutely necessary for signing
    pub fn with_secret<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&str) -> R,
    {
        f(self.secret_access_key.expose_secret())
    }
}

// Implement Debug without exposing secrets
impl std::fmt::Debug for R2Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("R2Credentials")
            .field("access_key_id", &self.access_key_id)
            .field("secret_access_key", &"[REDACTED]")
            .finish()
    }
}

// Ensure secrets are zeroized on drop
impl Drop for R2Credentials {
    fn drop(&mut self) {
        self.access_key_id.zeroize();
        // SecretString handles its own zeroization
    }
}

// Prevent accidental logging
impl std::fmt::Display for R2Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "R2Credentials({}:***)", &self.access_key_id)
    }
}
```

### 4.2 Request Validation

```rust
// REFINEMENT: Validate all inputs before sending to R2

pub struct InputValidator;

impl InputValidator {
    /// Validate bucket name according to S3/R2 rules
    pub fn validate_bucket(name: &str) -> Result<(), ValidationError> {
        // Length: 3-63 characters
        if name.len() < 3 || name.len() > 63 {
            return Err(ValidationError::BucketNameLength {
                name: name.to_string(),
                len: name.len(),
            });
        }

        // Must start with letter or number
        if !name.chars().next().map(|c| c.is_ascii_alphanumeric()).unwrap_or(false) {
            return Err(ValidationError::BucketNameStart(name.to_string()));
        }

        // Only lowercase letters, numbers, and hyphens
        if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            return Err(ValidationError::BucketNameCharacters(name.to_string()));
        }

        // No consecutive hyphens
        if name.contains("--") {
            return Err(ValidationError::BucketNameConsecutiveHyphens(name.to_string()));
        }

        // Cannot end with hyphen
        if name.ends_with('-') {
            return Err(ValidationError::BucketNameEndsWithHyphen(name.to_string()));
        }

        // Cannot look like IP address
        if name.parse::<std::net::Ipv4Addr>().is_ok() {
            return Err(ValidationError::BucketNameLooksLikeIp(name.to_string()));
        }

        Ok(())
    }

    /// Validate object key
    pub fn validate_key(key: &str) -> Result<(), ValidationError> {
        // Length: 1-1024 bytes
        if key.is_empty() {
            return Err(ValidationError::KeyEmpty);
        }

        if key.len() > 1024 {
            return Err(ValidationError::KeyTooLong {
                key: key[..100].to_string(), // Truncate for error
                len: key.len(),
            });
        }

        // Check for problematic characters (null bytes, etc.)
        if key.bytes().any(|b| b == 0) {
            return Err(ValidationError::KeyContainsNull);
        }

        // Warn about (but allow) problematic patterns
        if key.starts_with('/') {
            tracing::warn!(key, "Object key starts with '/' - may cause issues");
        }

        if key.contains("//") {
            tracing::warn!(key, "Object key contains '//' - may cause issues");
        }

        Ok(())
    }

    /// Validate metadata keys and values
    pub fn validate_metadata(metadata: &HashMap<String, String>) -> Result<(), ValidationError> {
        const MAX_METADATA_SIZE: usize = 2048;

        let mut total_size = 0;

        for (key, value) in metadata {
            // Key must be ASCII
            if !key.chars().all(|c| c.is_ascii() && !c.is_control()) {
                return Err(ValidationError::MetadataKeyNotAscii(key.clone()));
            }

            // Value must be printable or UTF-8 encoded
            if value.bytes().any(|b| b < 32 && b != b'\t') {
                return Err(ValidationError::MetadataValueInvalid(key.clone()));
            }

            total_size += key.len() + value.len();
        }

        if total_size > MAX_METADATA_SIZE {
            return Err(ValidationError::MetadataTooLarge {
                size: total_size,
                max: MAX_METADATA_SIZE,
            });
        }

        Ok(())
    }
}
```

### 4.3 Presigned URL Security

```rust
// REFINEMENT: Secure presigned URL generation

pub struct SecurePresigner {
    signer: Arc<R2Signer>,
    endpoint: Url,
    max_expiration: Duration,
    min_expiration: Duration,
}

impl SecurePresigner {
    pub fn presign(
        &self,
        method: HttpMethod,
        bucket: &str,
        key: &str,
        expires_in: Duration,
        options: PresignOptions,
    ) -> Result<PresignedUrl, PresignError> {
        // Validate expiration bounds
        if expires_in > self.max_expiration {
            return Err(PresignError::ExpirationTooLong {
                requested: expires_in,
                max: self.max_expiration,
            });
        }

        if expires_in < self.min_expiration {
            return Err(PresignError::ExpirationTooShort {
                requested: expires_in,
                min: self.min_expiration,
            });
        }

        // Validate bucket and key
        InputValidator::validate_bucket(bucket)?;
        InputValidator::validate_key(key)?;

        // Validate method (only GET and PUT for R2)
        if !matches!(method, HttpMethod::GET | HttpMethod::PUT) {
            return Err(PresignError::UnsupportedMethod(method));
        }

        // Optional: restrict content type for PUT
        if method == HttpMethod::PUT {
            if let Some(ref content_type) = options.content_type {
                self.validate_content_type(content_type)?;
            }
        }

        // Generate presigned URL
        let mut presigned = self.signer.presign_url(
            method,
            bucket,
            key,
            expires_in,
            &self.endpoint,
        )?;

        // Add optional conditions
        if let Some(content_type) = options.content_type {
            presigned.url = format!("{}&Content-Type={}", presigned.url, urlencoding::encode(&content_type));
        }

        // Log for audit
        tracing::info!(
            method = ?method,
            bucket = bucket,
            key = key,
            expires_at = %presigned.expires_at,
            "Generated presigned URL"
        );

        Ok(presigned)
    }

    fn validate_content_type(&self, content_type: &str) -> Result<(), PresignError> {
        // Basic MIME type validation
        if !content_type.contains('/') {
            return Err(PresignError::InvalidContentType(content_type.to_string()));
        }

        // Block potentially dangerous content types for uploads
        let blocked = ["text/html", "application/javascript", "text/javascript"];
        if blocked.iter().any(|b| content_type.starts_with(b)) {
            return Err(PresignError::BlockedContentType(content_type.to_string()));
        }

        Ok(())
    }
}
```

### 4.4 Request Sanitization for Logging

```rust
// REFINEMENT: Safe logging that doesn't expose sensitive data

pub struct SafeRequestLog {
    method: String,
    bucket: String,
    key: String,
    content_length: Option<u64>,
    headers: Vec<(String, String)>,  // Sanitized headers
}

impl SafeRequestLog {
    pub fn from_request(req: &HttpRequest) -> Self {
        let headers: Vec<(String, String)> = req.headers
            .iter()
            .filter_map(|(name, value)| {
                let name_lower = name.as_str().to_lowercase();

                // Skip sensitive headers
                if name_lower == "authorization" {
                    return Some((name.to_string(), "[REDACTED]".to_string()));
                }
                if name_lower == "x-amz-security-token" {
                    return Some((name.to_string(), "[REDACTED]".to_string()));
                }

                // Truncate very long header values
                let value_str = value.to_str().unwrap_or("[BINARY]");
                let truncated = if value_str.len() > 200 {
                    format!("{}...[truncated]", &value_str[..200])
                } else {
                    value_str.to_string()
                };

                Some((name.to_string(), truncated))
            })
            .collect();

        // Extract bucket and key from URL
        let (bucket, key) = Self::extract_bucket_key(&req.url);

        Self {
            method: req.method.to_string(),
            bucket,
            key,
            content_length: req.body.as_ref().map(|b| b.len() as u64),
            headers,
        }
    }

    fn extract_bucket_key(url: &Url) -> (String, String) {
        let path = url.path();
        let parts: Vec<&str> = path.trim_start_matches('/').splitn(2, '/').collect();

        let bucket = parts.first().map(|s| s.to_string()).unwrap_or_default();
        let key = parts.get(1).map(|s| s.to_string()).unwrap_or_default();

        (bucket, key)
    }
}

impl std::fmt::Debug for SafeRequestLog {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("R2Request")
            .field("method", &self.method)
            .field("bucket", &self.bucket)
            .field("key", &self.key)
            .field("content_length", &self.content_length)
            .field("headers_count", &self.headers.len())
            .finish()
    }
}
```

---

## 5. Edge Case Handling

### 5.1 Empty Object Handling

```rust
// EDGE CASE: Handle zero-byte objects correctly

impl R2ObjectsService {
    pub async fn put_empty_object(&self, req: PutObjectRequest) -> Result<PutObjectOutput, R2Error> {
        // R2/S3 supports empty objects, but we need to handle them specially
        let mut http_request = self.build_put_request(&req)?;

        // Empty body but explicit Content-Length: 0
        http_request.headers.insert("Content-Length", "0".parse().unwrap());

        // Empty SHA256 hash
        let empty_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        http_request.headers.insert("x-amz-content-sha256", empty_hash.parse().unwrap());

        self.execute(http_request).await
    }
}

// Test for empty object
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_put_empty_object() {
        let client = create_test_client();

        let result = client.objects().put(PutObjectRequest {
            bucket: "test".to_string(),
            key: "empty.txt".to_string(),
            body: Bytes::new(),  // Empty
            content_type: Some("text/plain".to_string()),
            ..Default::default()
        }).await;

        assert!(result.is_ok());
        assert!(result.unwrap().e_tag.is_some());
    }
}
```

### 5.2 Unicode Key Handling

```rust
// EDGE CASE: Properly encode Unicode characters in object keys

impl UrlBuilder {
    pub fn encode_key(key: &str) -> String {
        // S3/R2 requires specific URL encoding for object keys
        // - Safe characters: A-Z a-z 0-9 - _ . ~
        // - Everything else must be percent-encoded

        let mut encoded = String::with_capacity(key.len() * 3);

        for byte in key.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' |
                b'-' | b'_' | b'.' | b'~' => {
                    encoded.push(byte as char);
                }
                b'/' => {
                    // Preserve slashes for path structure
                    encoded.push('/');
                }
                _ => {
                    // Percent-encode everything else
                    encoded.push('%');
                    encoded.push_str(&format!("{:02X}", byte));
                }
            }
        }

        encoded
    }
}

// Test Unicode handling
#[cfg(test)]
mod tests {
    #[test]
    fn test_unicode_key_encoding() {
        // Japanese characters
        assert_eq!(
            UrlBuilder::encode_key("path/日本語.txt"),
            "path/%E6%97%A5%E6%9C%AC%E8%AA%9E.txt"
        );

        // Emoji
        assert_eq!(
            UrlBuilder::encode_key("files/doc-📄.pdf"),
            "files/doc-%F0%9F%93%84.pdf"
        );

        // Spaces and special characters
        assert_eq!(
            UrlBuilder::encode_key("my files/document (1).txt"),
            "my%20files/document%20%281%29.txt"
        );
    }
}
```

### 5.3 Very Large List Responses

```rust
// EDGE CASE: Handle buckets with millions of objects

pub struct PaginatedListIterator {
    client: Arc<R2Client>,
    bucket: String,
    prefix: Option<String>,
    page_size: u32,
    continuation_token: Option<String>,
    exhausted: bool,
    buffer: VecDeque<R2Object>,
    total_fetched: u64,
    max_objects: Option<u64>,
}

impl PaginatedListIterator {
    pub async fn next(&mut self) -> Result<Option<R2Object>, R2Error> {
        // Return from buffer if available
        if let Some(obj) = self.buffer.pop_front() {
            return Ok(Some(obj));
        }

        // Check if we've hit our limit
        if let Some(max) = self.max_objects {
            if self.total_fetched >= max {
                return Ok(None);
            }
        }

        // Check if listing is exhausted
        if self.exhausted {
            return Ok(None);
        }

        // Fetch next page
        let response = self.client.objects().list(ListObjectsRequest {
            bucket: self.bucket.clone(),
            prefix: self.prefix.clone(),
            max_keys: Some(self.page_size),
            continuation_token: self.continuation_token.clone(),
            ..Default::default()
        }).await?;

        // Update pagination state
        self.continuation_token = response.next_continuation_token;
        self.exhausted = !response.is_truncated;
        self.total_fetched += response.contents.len() as u64;

        // Buffer results
        self.buffer.extend(response.contents);

        // Return first item from new buffer
        Ok(self.buffer.pop_front())
    }

    /// Collect all objects up to limit with memory-bounded batching
    pub async fn collect_bounded(mut self, limit: usize) -> Result<Vec<R2Object>, R2Error> {
        let mut results = Vec::with_capacity(limit.min(10000));

        while results.len() < limit {
            match self.next().await? {
                Some(obj) => results.push(obj),
                None => break,
            }
        }

        Ok(results)
    }
}
```

### 5.4 Concurrent Access to Same Object

```rust
// EDGE CASE: Handle conditional operations for concurrent access

pub struct ConditionalRequest {
    pub if_match: Option<String>,          // ETag must match
    pub if_none_match: Option<String>,     // ETag must not match
    pub if_modified_since: Option<DateTime<Utc>>,
    pub if_unmodified_since: Option<DateTime<Utc>>,
}

impl R2ObjectsService {
    /// Optimistic locking pattern for concurrent updates
    pub async fn update_with_lock(
        &self,
        bucket: &str,
        key: &str,
        update_fn: impl FnOnce(&[u8]) -> Vec<u8>,
        max_retries: u32,
    ) -> Result<PutObjectOutput, R2Error> {
        for attempt in 0..max_retries {
            // Get current object and its ETag
            let current = self.get(GetObjectRequest {
                bucket: bucket.to_string(),
                key: key.to_string(),
                ..Default::default()
            }).await?;

            let current_etag = current.e_tag.clone();

            // Apply update function
            let new_content = update_fn(&current.body);

            // Try to put with ETag condition
            let result = self.put_conditional(PutObjectRequest {
                bucket: bucket.to_string(),
                key: key.to_string(),
                body: Bytes::from(new_content),
                ..Default::default()
            }, ConditionalRequest {
                if_match: current_etag,
                ..Default::default()
            }).await;

            match result {
                Ok(output) => return Ok(output),
                Err(R2Error::Object(ObjectError::PreconditionFailed { .. })) => {
                    // Object was modified by another request, retry
                    tracing::debug!(
                        attempt,
                        bucket,
                        key,
                        "Conditional put failed, retrying"
                    );

                    if attempt < max_retries - 1 {
                        // Small delay before retry
                        tokio::time::sleep(Duration::from_millis(50 * (attempt as u64 + 1))).await;
                    }
                }
                Err(e) => return Err(e),
            }
        }

        Err(R2Error::Conflict(ConflictError::MaxRetriesExceeded {
            bucket: bucket.to_string(),
            key: key.to_string(),
            attempts: max_retries,
        }))
    }
}
```

### 5.5 Network Interruption During Stream

```rust
// EDGE CASE: Handle network drops during streaming operations

pub struct ResilientStream<S> {
    inner: S,
    client: Arc<R2Client>,
    request: GetObjectRequest,
    bytes_received: u64,
    max_retries: u32,
    retry_count: u32,
}

impl<S> ResilientStream<S>
where
    S: Stream<Item = Result<Bytes, std::io::Error>> + Unpin,
{
    pub async fn next_with_recovery(&mut self) -> Option<Result<Bytes, R2Error>> {
        loop {
            match self.inner.next().await {
                Some(Ok(chunk)) => {
                    self.bytes_received += chunk.len() as u64;
                    self.retry_count = 0;  // Reset on success
                    return Some(Ok(chunk));
                }
                Some(Err(e)) if self.retry_count < self.max_retries => {
                    // Try to resume from where we left off
                    tracing::warn!(
                        bytes_received = self.bytes_received,
                        retry = self.retry_count,
                        error = %e,
                        "Stream interrupted, attempting resume"
                    );

                    self.retry_count += 1;

                    // Request remaining bytes using Range header
                    let mut resume_request = self.request.clone();
                    resume_request.range = Some(format!("bytes={}-", self.bytes_received));

                    match self.client.objects().get_stream(resume_request).await {
                        Ok(response) => {
                            // Replace inner stream with resumed stream
                            // (requires some type gymnastics in real impl)
                            tracing::info!(
                                bytes_received = self.bytes_received,
                                "Successfully resumed stream"
                            );
                            // Continue with new stream...
                        }
                        Err(e) => {
                            tracing::error!(error = %e, "Failed to resume stream");
                            return Some(Err(e));
                        }
                    }
                }
                Some(Err(e)) => {
                    return Some(Err(R2Error::Transfer(TransferError::StreamInterrupted(e.to_string()))));
                }
                None => return None,
            }
        }
    }
}
```

---

## 6. Testing Refinements

### 6.1 Property-Based Testing for Signing

```rust
// REFINEMENT: Ensure signing produces valid signatures for all inputs

use proptest::prelude::*;

proptest! {
    #[test]
    fn test_signing_deterministic(
        bucket in "[a-z][a-z0-9-]{2,62}",
        key in "[a-zA-Z0-9._/-]{1,500}",
        body in prop::collection::vec(any::<u8>(), 0..10000),
    ) {
        let signer = R2Signer::new(
            "test_key_id".to_string(),
            SecretString::new("test_secret".to_string()),
            "auto",
            "s3",
        );

        let timestamp = Utc.with_ymd_and_hms(2025, 1, 15, 12, 0, 0).unwrap();

        let mut request1 = build_put_request(&bucket, &key, &body);
        let mut request2 = build_put_request(&bucket, &key, &body);

        signer.sign_request(&mut request1, &sha256_hex(&body), timestamp).unwrap();
        signer.sign_request(&mut request2, &sha256_hex(&body), timestamp).unwrap();

        // Property: Same inputs produce same signature
        let auth1 = request1.headers.get("authorization").unwrap();
        let auth2 = request2.headers.get("authorization").unwrap();
        prop_assert_eq!(auth1, auth2);
    }

    #[test]
    fn test_presigned_url_valid_format(
        bucket in "[a-z][a-z0-9-]{2,62}",
        key in "[a-zA-Z0-9._/-]{1,100}",
        expires_secs in 60u64..604800,
    ) {
        let signer = R2Signer::new(
            "test_key_id".to_string(),
            SecretString::new("test_secret".to_string()),
            "auto",
            "s3",
        );

        let endpoint: Url = "https://test.r2.cloudflarestorage.com".parse().unwrap();
        let expires = Duration::from_secs(expires_secs);

        let result = signer.presign_url(HttpMethod::GET, &bucket, &key, expires, &endpoint);

        prop_assert!(result.is_ok());

        let presigned = result.unwrap();
        let url: Url = presigned.url.parse().unwrap();

        // Property: URL contains required query parameters
        prop_assert!(url.query().unwrap().contains("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
        prop_assert!(url.query().unwrap().contains("X-Amz-Signature="));
        prop_assert!(url.query().unwrap().contains("X-Amz-Expires="));
    }
}
```

### 6.2 Stress Testing Multipart Uploads

```rust
// REFINEMENT: Stress test concurrent multipart operations

#[tokio::test]
async fn test_concurrent_multipart_uploads() {
    let client = Arc::new(create_test_client());
    let semaphore = Arc::new(Semaphore::new(10));

    let tasks: Vec<_> = (0..50).map(|i| {
        let client = Arc::clone(&client);
        let semaphore = Arc::clone(&semaphore);

        tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            let key = format!("stress-test/file-{}.bin", i);
            let data = vec![i as u8; 10 * 1024 * 1024];  // 10MB each

            client.objects().put(PutObjectRequest {
                bucket: "test".to_string(),
                key,
                body: Bytes::from(data),
                ..Default::default()
            }).await
        })
    }).collect();

    let results = futures::future::join_all(tasks).await;

    let successes = results.iter()
        .filter(|r| r.as_ref().map(|r| r.is_ok()).unwrap_or(false))
        .count();

    assert!(successes >= 45, "At least 90% should succeed: {}/50", successes);
}

#[tokio::test]
async fn test_multipart_upload_abort_recovery() {
    let client = create_test_client();

    // Start multipart upload
    let create_result = client.multipart().create(CreateMultipartRequest {
        bucket: "test".to_string(),
        key: "abort-test.bin".to_string(),
        ..Default::default()
    }).await.unwrap();

    // Upload some parts
    for part_num in 1..=3 {
        client.multipart().upload_part(UploadPartRequest {
            bucket: "test".to_string(),
            key: "abort-test.bin".to_string(),
            upload_id: create_result.upload_id.clone(),
            part_number: part_num,
            body: Bytes::from(vec![0u8; 5 * 1024 * 1024]),
        }).await.unwrap();
    }

    // Abort
    let abort_result = client.multipart().abort(AbortMultipartRequest {
        bucket: "test".to_string(),
        key: "abort-test.bin".to_string(),
        upload_id: create_result.upload_id.clone(),
    }).await;

    assert!(abort_result.is_ok());

    // Verify parts are cleaned up - trying to complete should fail
    let complete_result = client.multipart().complete(CompleteMultipartRequest {
        bucket: "test".to_string(),
        key: "abort-test.bin".to_string(),
        upload_id: create_result.upload_id,
        parts: vec![],
    }).await;

    assert!(matches!(complete_result, Err(R2Error::Multipart(MultipartError::UploadNotFound { .. }))));
}
```

### 6.3 Simulation Recording Test

```rust
// REFINEMENT: Test simulation recording and replay

#[tokio::test]
async fn test_simulation_roundtrip() {
    // Phase 1: Record real interactions
    let recorder = Arc::new(SimulationRecorder::new());
    let client = R2ClientBuilder::new()
        .account_id("test-account")
        .credentials("key", SecretString::new("secret".to_string()))
        .with_recorder(Arc::clone(&recorder))
        .build()
        .unwrap();

    // Perform operations
    client.objects().put(PutObjectRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key".to_string(),
        body: Bytes::from("test data"),
        ..Default::default()
    }).await.unwrap();

    let get_result = client.objects().get(GetObjectRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key".to_string(),
        ..Default::default()
    }).await.unwrap();

    // Save recordings
    let recordings = recorder.export();

    // Phase 2: Replay recorded interactions
    let replayer = SimulationReplayer::from_recordings(recordings);
    let replay_client = R2ClientBuilder::new()
        .account_id("test-account")
        .credentials("key", SecretString::new("secret".to_string()))
        .with_replay_transport(replayer)
        .build()
        .unwrap();

    // Same operations should return same results
    let replay_result = replay_client.objects().get(GetObjectRequest {
        bucket: "test-bucket".to_string(),
        key: "test-key".to_string(),
        ..Default::default()
    }).await.unwrap();

    assert_eq!(get_result.body, replay_result.body);
    assert_eq!(get_result.e_tag, replay_result.e_tag);
}
```

### 6.4 Error Injection Testing

```rust
// REFINEMENT: Test error handling with injected failures

pub struct FaultInjectionTransport {
    inner: Arc<dyn HttpTransport>,
    fault_config: FaultConfig,
}

pub struct FaultConfig {
    pub fail_rate: f64,           // 0.0 to 1.0
    pub latency_ms: Option<u64>,  // Additional latency
    pub error_type: FaultError,
}

pub enum FaultError {
    Timeout,
    ConnectionReset,
    ServerError(u16),
    SlowDown,
}

impl HttpTransport for FaultInjectionTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Add artificial latency
        if let Some(latency) = self.fault_config.latency_ms {
            tokio::time::sleep(Duration::from_millis(latency)).await;
        }

        // Inject faults randomly
        if rand::random::<f64>() < self.fault_config.fail_rate {
            return match &self.fault_config.error_type {
                FaultError::Timeout => Err(TransportError::Timeout),
                FaultError::ConnectionReset => Err(TransportError::ConnectionReset),
                FaultError::ServerError(code) => {
                    Ok(HttpResponse {
                        status: *code,
                        body: Bytes::from("<Error><Code>InternalError</Code></Error>"),
                        headers: HeaderMap::new(),
                    })
                }
                FaultError::SlowDown => {
                    Ok(HttpResponse {
                        status: 503,
                        body: Bytes::from("<Error><Code>SlowDown</Code></Error>"),
                        headers: HeaderMap::new(),
                    })
                }
            };
        }

        self.inner.send(request).await
    }
}

#[tokio::test]
async fn test_retry_under_failures() {
    let fault_transport = FaultInjectionTransport {
        inner: Arc::new(MockTransport::new()),
        fault_config: FaultConfig {
            fail_rate: 0.5,  // 50% failure rate
            latency_ms: None,
            error_type: FaultError::ServerError(500),
        },
    };

    let client = R2ClientBuilder::new()
        .with_transport(Arc::new(fault_transport))
        .build()
        .unwrap();

    // Should eventually succeed despite failures
    let result = client.objects().put(PutObjectRequest {
        bucket: "test".to_string(),
        key: "test".to_string(),
        body: Bytes::from("data"),
        ..Default::default()
    }).await;

    // With 50% failure rate and 3 retries, should succeed ~87.5% of time
    // Run multiple times for statistical confidence
    assert!(result.is_ok());
}
```

---

## 7. TypeScript Refinements

### 7.1 Type-Safe Builder Pattern

```typescript
// REFINEMENT: Type-safe fluent builder for requests

interface PutObjectRequestBuilder<
  Bucket extends string | undefined = undefined,
  Key extends string | undefined = undefined,
  Body extends Uint8Array | ReadableStream | undefined = undefined
> {
  bucket<B extends string>(bucket: B): PutObjectRequestBuilder<B, Key, Body>;
  key<K extends string>(key: K): PutObjectRequestBuilder<Bucket, K, Body>;
  body<Bo extends Uint8Array | ReadableStream>(body: Bo): PutObjectRequestBuilder<Bucket, Key, Bo>;
  contentType(type: string): this;
  metadata(meta: Record<string, string>): this;

  // Only callable when all required fields are set
  build(): Bucket extends string
    ? Key extends string
      ? Body extends Uint8Array | ReadableStream
        ? PutObjectRequest
        : never
      : never
    : never;
}

class PutObjectRequestBuilderImpl implements PutObjectRequestBuilder<any, any, any> {
  private _bucket?: string;
  private _key?: string;
  private _body?: Uint8Array | ReadableStream;
  private _contentType?: string;
  private _metadata: Record<string, string> = {};

  bucket(bucket: string) {
    this._bucket = bucket;
    return this as any;
  }

  key(key: string) {
    this._key = key;
    return this as any;
  }

  body(body: Uint8Array | ReadableStream) {
    this._body = body;
    return this as any;
  }

  contentType(type: string) {
    this._contentType = type;
    return this;
  }

  metadata(meta: Record<string, string>) {
    this._metadata = { ...this._metadata, ...meta };
    return this;
  }

  build(): PutObjectRequest {
    if (!this._bucket || !this._key || !this._body) {
      throw new Error('Missing required fields');
    }

    return {
      bucket: this._bucket,
      key: this._key,
      body: this._body,
      contentType: this._contentType,
      metadata: this._metadata,
    };
  }
}

// Usage with full type safety
const request = new PutObjectRequestBuilderImpl()
  .bucket('my-bucket')
  .key('my-key')
  .body(new Uint8Array([1, 2, 3]))
  .contentType('application/octet-stream')
  .build(); // TypeScript knows this is valid
```

### 7.2 Async Iterator for Large Lists

```typescript
// REFINEMENT: Memory-efficient async iteration for large lists

class R2ListIterator implements AsyncIterableIterator<R2Object> {
  private client: R2Client;
  private bucket: string;
  private prefix?: string;
  private continuationToken?: string;
  private buffer: R2Object[] = [];
  private done = false;

  constructor(client: R2Client, bucket: string, prefix?: string) {
    this.client = client;
    this.bucket = bucket;
    this.prefix = prefix;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<R2Object> {
    return this;
  }

  async next(): Promise<IteratorResult<R2Object>> {
    // Return from buffer if available
    if (this.buffer.length > 0) {
      return { value: this.buffer.shift()!, done: false };
    }

    // Check if we're done
    if (this.done) {
      return { value: undefined, done: true };
    }

    // Fetch next page
    const response = await this.client.objects.list({
      bucket: this.bucket,
      prefix: this.prefix,
      continuationToken: this.continuationToken,
      maxKeys: 1000,
    });

    this.buffer = response.contents;
    this.continuationToken = response.nextContinuationToken;
    this.done = !response.isTruncated;

    if (this.buffer.length === 0) {
      return { value: undefined, done: true };
    }

    return { value: this.buffer.shift()!, done: false };
  }
}

// Usage
async function processAllObjects(client: R2Client, bucket: string) {
  const iterator = new R2ListIterator(client, bucket);

  for await (const object of iterator) {
    console.log(`Processing: ${object.key}`);
    // Process each object with constant memory usage
  }
}
```

### 7.3 Error Handling with Result Type

```typescript
// REFINEMENT: Explicit error handling without exceptions

type Result<T, E = R2Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Usage in client
class SafeR2Client {
  private client: R2Client;

  constructor(client: R2Client) {
    this.client = client;
  }

  async putObject(req: PutObjectRequest): Promise<Result<PutObjectOutput, R2Error>> {
    try {
      const output = await this.client.objects.put(req);
      return ok(output);
    } catch (e) {
      if (e instanceof R2Error) {
        return err(e);
      }
      return err(new R2Error('Unknown', String(e)));
    }
  }

  async getObject(req: GetObjectRequest): Promise<Result<GetObjectOutput, R2Error>> {
    try {
      const output = await this.client.objects.get(req);
      return ok(output);
    } catch (e) {
      if (e instanceof R2Error) {
        return err(e);
      }
      return err(new R2Error('Unknown', String(e)));
    }
  }
}

// Usage
async function safeDownload(client: SafeR2Client, bucket: string, key: string) {
  const result = await client.getObject({ bucket, key });

  if (!result.ok) {
    if (result.error.code === 'ObjectNotFound') {
      console.log('Object does not exist');
      return null;
    }
    throw result.error; // Re-throw unexpected errors
  }

  return result.value.body;
}
```

---

## 8. Production Checklist

### 8.1 Pre-Production Validation

| Category | Check | Status |
|----------|-------|--------|
| **Performance** | Signing < 10μs (cached) | |
| **Performance** | XML parsing < 1ms/100 objects | |
| **Performance** | Streaming uses constant memory | |
| **Performance** | Connection pool properly sized | |
| **Security** | Credentials never logged | |
| **Security** | TLS 1.2+ enforced | |
| **Security** | Input validation on all requests | |
| **Security** | Presigned URL expiration limits | |
| **Reliability** | Retry policy configured | |
| **Reliability** | Circuit breaker thresholds set | |
| **Reliability** | Multipart cleanup on failure | |
| **Reliability** | Timeout values appropriate | |
| **Observability** | All operations traced | |
| **Observability** | Metrics emitted correctly | |
| **Observability** | Error logging sanitized | |
| **Testing** | Unit test coverage > 80% | |
| **Testing** | Integration tests pass | |
| **Testing** | Simulation tests pass | |

### 8.2 Configuration Template

```yaml
# production-config.yaml
cloudflare_r2:
  account_id: "${R2_ACCOUNT_ID}"

  credentials:
    source: "shared-auth"  # or "environment", "vault"

  timeouts:
    connect_seconds: 30
    small_object_seconds: 60
    large_object_seconds: 300
    list_seconds: 120

  multipart:
    threshold_bytes: 104857600  # 100MB
    part_size_bytes: 10485760   # 10MB
    concurrency: 4

  connection_pool:
    max_idle_per_host: 20
    idle_timeout_seconds: 90

  resilience:
    retry:
      max_attempts: 3
      base_delay_ms: 100
      max_delay_ms: 30000
      jitter_factor: 0.1
    circuit_breaker:
      failure_threshold: 5
      success_threshold: 3
      reset_timeout_seconds: 30

  simulation:
    enabled: false
    recording_path: "./recordings/r2"

  validation:
    max_key_length: 1024
    max_metadata_size: 2048

  presign:
    max_expiration_seconds: 604800  # 7 days
    min_expiration_seconds: 60
    cache_size: 1000
```

### 8.3 Monitoring Metrics

```rust
// Self-monitoring metrics for the R2 integration
impl R2Client {
    fn register_metrics(&self) {
        // Request metrics
        self.metrics.register_counter(
            "r2_requests_total",
            "Total R2 API requests",
            &["operation", "bucket", "status"],
        );

        self.metrics.register_histogram(
            "r2_request_duration_seconds",
            "R2 request latency",
            &["operation", "bucket"],
            vec![0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 30.0, 60.0],
        );

        // Transfer metrics
        self.metrics.register_counter(
            "r2_bytes_transferred_total",
            "Bytes transferred to/from R2",
            &["operation", "bucket", "direction"],
        );

        // Error metrics
        self.metrics.register_counter(
            "r2_errors_total",
            "R2 errors by type",
            &["operation", "error_type", "retryable"],
        );

        // Retry metrics
        self.metrics.register_counter(
            "r2_retries_total",
            "R2 retry attempts",
            &["operation", "attempt"],
        );

        // Circuit breaker metrics
        self.metrics.register_gauge(
            "r2_circuit_breaker_state",
            "Circuit breaker state (0=closed, 1=open, 2=half-open)",
            &[],
        );

        // Multipart metrics
        self.metrics.register_histogram(
            "r2_multipart_parts_per_upload",
            "Number of parts per multipart upload",
            &["bucket"],
            vec![1.0, 5.0, 10.0, 50.0, 100.0, 500.0, 1000.0],
        );

        // Connection pool metrics
        self.metrics.register_gauge(
            "r2_connection_pool_size",
            "Current connection pool size",
            &[],
        );

        // Signing cache metrics
        self.metrics.register_counter(
            "r2_signing_key_cache_hits_total",
            "Signing key cache hits",
            &[],
        );
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, file manifests, test coverage requirements, and deployment procedures.
