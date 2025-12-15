# Prometheus Metrics Endpoint Integration - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/prometheus_metrics`

---

## 1. Overview

This refinement document details production hardening patterns, performance optimizations, edge case handling, and advanced implementation strategies for the Prometheus Metrics Endpoint Integration.

---

## 2. Performance Optimizations

### 2.1 Zero-Allocation Counter Increment

```rust
// OPTIMIZATION: Lock-free counter updates
// Critical for high-throughput metric recording

use std::sync::atomic::{AtomicU64, Ordering};

pub struct AtomicCounter {
    value: AtomicU64,
}

impl AtomicCounter {
    #[inline(always)]
    pub fn inc(&self) {
        self.value.fetch_add(1, Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn add(&self, delta: u64) {
        self.value.fetch_add(delta, Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn get(&self) -> u64 {
        self.value.load(Ordering::Relaxed)
    }
}

// BENCHMARK TARGET: < 10ns per increment operation
```

### 2.2 Pre-Allocated Label Storage

```rust
// OPTIMIZATION: Avoid heap allocation for common label cardinalities
// Uses small-vec pattern for typical 1-4 label scenarios

use smallvec::SmallVec;

pub struct LabelSet {
    // Stack-allocated for up to 4 label pairs (common case)
    labels: SmallVec<[(Arc<str>, Arc<str>); 4]>,
    // Pre-computed hash for fast lookups
    hash: u64,
}

impl LabelSet {
    pub fn new(labels: &[(&str, &str)]) -> Self {
        let mut set = SmallVec::with_capacity(labels.len());
        let mut hasher = FxHasher::default();

        for (key, value) in labels {
            set.push((Arc::from(*key), Arc::from(*value)));
            key.hash(&mut hasher);
            value.hash(&mut hasher);
        }

        Self {
            labels: set,
            hash: hasher.finish(),
        }
    }

    #[inline]
    pub fn hash(&self) -> u64 {
        self.hash
    }
}
```

### 2.3 Cached Serialization Output

```rust
// OPTIMIZATION: Cache serialized metrics between scrapes
// Reduces CPU under high scrape frequency (< scrape_interval)

use parking_lot::RwLock;
use std::time::{Duration, Instant};

pub struct CachedSerializer {
    cache: RwLock<Option<CachedOutput>>,
    ttl: Duration,
    registry: Arc<MetricsRegistry>,
}

struct CachedOutput {
    text: String,
    compressed: Option<Vec<u8>>,
    created_at: Instant,
}

impl CachedSerializer {
    pub fn serialize(&self, accept_gzip: bool) -> Vec<u8> {
        // Fast path: check cache validity
        {
            let cache = self.cache.read();
            if let Some(ref cached) = *cache {
                if cached.created_at.elapsed() < self.ttl {
                    return if accept_gzip && cached.compressed.is_some() {
                        cached.compressed.clone().unwrap()
                    } else {
                        cached.text.as_bytes().to_vec()
                    };
                }
            }
        }

        // Slow path: regenerate cache
        self.regenerate_cache(accept_gzip)
    }

    fn regenerate_cache(&self, accept_gzip: bool) -> Vec<u8> {
        let mut cache = self.cache.write();

        // Double-check after acquiring write lock
        if let Some(ref cached) = *cache {
            if cached.created_at.elapsed() < self.ttl {
                return if accept_gzip && cached.compressed.is_some() {
                    cached.compressed.clone().unwrap()
                } else {
                    cached.text.as_bytes().to_vec()
                };
            }
        }

        let text = self.registry.serialize_to_text();
        let compressed = self.compress(&text);

        let result = if accept_gzip && compressed.is_some() {
            compressed.clone().unwrap()
        } else {
            text.as_bytes().to_vec()
        };

        *cache = Some(CachedOutput {
            text,
            compressed,
            created_at: Instant::now(),
        });

        result
    }

    fn compress(&self, text: &str) -> Option<Vec<u8>> {
        // Only compress if > 1KB (compression overhead not worth it below)
        if text.len() < 1024 {
            return None;
        }

        use flate2::write::GzEncoder;
        use flate2::Compression;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::new(6));
        encoder.write_all(text.as_bytes()).ok()?;
        encoder.finish().ok()
    }
}
```

### 2.4 Streaming Serializer

```rust
// OPTIMIZATION: Stream output directly to response buffer
// Avoids intermediate String allocation for large metric sets

pub struct StreamingSerializer<W: Write> {
    writer: W,
    bytes_written: usize,
}

impl<W: Write> StreamingSerializer<W> {
    pub fn write_metric_family(&mut self, family: &MetricFamily) -> io::Result<()> {
        // Write HELP line
        write!(self.writer, "# HELP {} {}\n", family.name, family.help)?;

        // Write TYPE line
        write!(self.writer, "# TYPE {} {}\n", family.name, family.metric_type)?;

        // Stream each metric
        for metric in &family.metrics {
            self.write_metric(&family.name, metric)?;
        }

        Ok(())
    }

    fn write_metric(&mut self, name: &str, metric: &Metric) -> io::Result<()> {
        write!(self.writer, "{}", name)?;

        // Write labels if present
        if !metric.labels.is_empty() {
            self.writer.write_all(b"{")?;
            for (i, (key, value)) in metric.labels.iter().enumerate() {
                if i > 0 {
                    self.writer.write_all(b",")?;
                }
                write!(self.writer, "{}=\"{}\"", key, escape_label_value(value))?;
            }
            self.writer.write_all(b"}")?;
        }

        // Write value
        write!(self.writer, " {}\n", metric.value)?;

        Ok(())
    }
}

#[inline]
fn escape_label_value(s: &str) -> Cow<str> {
    if s.bytes().any(|b| b == b'"' || b == b'\\' || b == b'\n') {
        let mut escaped = String::with_capacity(s.len() + 8);
        for c in s.chars() {
            match c {
                '"' => escaped.push_str("\\\""),
                '\\' => escaped.push_str("\\\\"),
                '\n' => escaped.push_str("\\n"),
                _ => escaped.push(c),
            }
        }
        Cow::Owned(escaped)
    } else {
        Cow::Borrowed(s)
    }
}
```

### 2.5 Histogram Bucket Optimization

```rust
// OPTIMIZATION: Pre-compute bucket boundaries and indices
// O(log n) bucket lookup instead of O(n)

pub struct OptimizedHistogram {
    buckets: Vec<AtomicU64>,
    boundaries: Vec<f64>,  // Sorted, for binary search
    sum: AtomicU64,        // Stored as f64 bits
    count: AtomicU64,
}

impl OptimizedHistogram {
    pub fn observe(&self, value: f64) {
        // Binary search for bucket index
        let idx = self.boundaries.partition_point(|&b| b < value);

        // Increment the appropriate bucket
        if idx < self.buckets.len() {
            self.buckets[idx].fetch_add(1, Ordering::Relaxed);
        }

        // Update sum (atomic f64 add via CAS loop)
        self.atomic_add_f64(&self.sum, value);
        self.count.fetch_add(1, Ordering::Relaxed);
    }

    fn atomic_add_f64(&self, atomic: &AtomicU64, delta: f64) {
        let mut current = atomic.load(Ordering::Relaxed);
        loop {
            let current_f64 = f64::from_bits(current);
            let new_f64 = current_f64 + delta;
            let new_bits = new_f64.to_bits();

            match atomic.compare_exchange_weak(
                current,
                new_bits,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(actual) => current = actual,
            }
        }
    }
}
```

---

## 3. Error Handling Refinements

### 3.1 Graceful Cardinality Overflow

```rust
// REFINEMENT: Handle cardinality limit exceeded gracefully
// Log warning, emit overflow metric, but don't fail the operation

pub struct CardinalityGuard {
    max_series: usize,
    current: AtomicUsize,
    overflow_count: AtomicU64,
    overflow_logged_at: AtomicU64,  // Unix timestamp
}

impl CardinalityGuard {
    pub fn try_register(&self, labels: &LabelSet) -> CardinalityResult {
        let current = self.current.load(Ordering::Relaxed);

        if current >= self.max_series {
            self.overflow_count.fetch_add(1, Ordering::Relaxed);

            // Rate-limit warning logs (max once per minute)
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let last_logged = self.overflow_logged_at.load(Ordering::Relaxed);

            if now - last_logged >= 60 {
                if self.overflow_logged_at.compare_exchange(
                    last_logged, now,
                    Ordering::Relaxed, Ordering::Relaxed
                ).is_ok() {
                    tracing::warn!(
                        max_series = self.max_series,
                        overflow_count = self.overflow_count.load(Ordering::Relaxed),
                        "cardinality limit reached, dropping new label combinations"
                    );
                }
            }

            return CardinalityResult::Overflow;
        }

        // Optimistic increment
        self.current.fetch_add(1, Ordering::Relaxed);
        CardinalityResult::Registered
    }

    pub fn overflow_metric(&self) -> u64 {
        self.overflow_count.load(Ordering::Relaxed)
    }
}

pub enum CardinalityResult {
    Registered,
    Overflow,
    AlreadyExists,
}
```

### 3.2 Metric Name Validation with Recovery

```rust
// REFINEMENT: Sanitize invalid metric names instead of rejecting

pub struct MetricNameSanitizer {
    // Cache sanitized names to avoid repeated regex operations
    cache: DashMap<String, Arc<str>>,
}

impl MetricNameSanitizer {
    pub fn sanitize(&self, name: &str) -> Result<Arc<str>, SanitizeError> {
        // Check cache first
        if let Some(cached) = self.cache.get(name) {
            return Ok(Arc::clone(&cached));
        }

        // Validate/sanitize
        let sanitized = self.do_sanitize(name)?;
        let arc: Arc<str> = Arc::from(sanitized.as_str());

        self.cache.insert(name.to_string(), Arc::clone(&arc));
        Ok(arc)
    }

    fn do_sanitize(&self, name: &str) -> Result<String, SanitizeError> {
        if name.is_empty() {
            return Err(SanitizeError::EmptyName);
        }

        let mut sanitized = String::with_capacity(name.len());
        let mut chars = name.chars().peekable();

        // First character must be [a-zA-Z_:]
        match chars.next() {
            Some(c) if c.is_ascii_alphabetic() || c == '_' || c == ':' => {
                sanitized.push(c);
            }
            Some(c) if c.is_ascii_digit() => {
                // Prefix with underscore if starts with digit
                sanitized.push('_');
                sanitized.push(c);
            }
            Some(_) => {
                sanitized.push('_');
            }
            None => return Err(SanitizeError::EmptyName),
        }

        // Subsequent characters must be [a-zA-Z0-9_:]
        for c in chars {
            if c.is_ascii_alphanumeric() || c == '_' || c == ':' {
                sanitized.push(c);
            } else {
                sanitized.push('_');
            }
        }

        // Log if we modified the name
        if sanitized != name {
            tracing::debug!(
                original = name,
                sanitized = sanitized,
                "metric name sanitized"
            );
        }

        Ok(sanitized)
    }
}
```

### 3.3 Scrape Timeout Handling

```rust
// REFINEMENT: Handle scrape timeout gracefully

use tokio::time::timeout;

pub struct TimeoutAwareHandler {
    registry: Arc<MetricsRegistry>,
    serializer: CachedSerializer,
    max_scrape_duration: Duration,
}

impl TimeoutAwareHandler {
    pub async fn handle_scrape(&self, req: Request) -> Response {
        let accept_gzip = req.headers()
            .get("Accept-Encoding")
            .map(|v| v.to_str().unwrap_or("").contains("gzip"))
            .unwrap_or(false);

        // Attempt collection with timeout
        match timeout(self.max_scrape_duration, self.collect_metrics(accept_gzip)).await {
            Ok(result) => match result {
                Ok(body) => self.success_response(body, accept_gzip),
                Err(e) => self.error_response(e),
            },
            Err(_) => {
                tracing::warn!(
                    timeout_ms = self.max_scrape_duration.as_millis(),
                    "scrape request timed out"
                );

                // Return partial/cached response with warning header
                let body = self.serializer.get_cached_or_empty();
                Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "text/plain; version=0.0.4")
                    .header("X-Prometheus-Scrape-Timeout", "true")
                    .body(body)
                    .unwrap()
            }
        }
    }

    async fn collect_metrics(&self, accept_gzip: bool) -> Result<Vec<u8>, CollectError> {
        let output = self.serializer.serialize(accept_gzip);
        Ok(output)
    }

    fn success_response(&self, body: Vec<u8>, is_gzip: bool) -> Response {
        let mut builder = Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

        if is_gzip {
            builder = builder.header("Content-Encoding", "gzip");
        }

        builder.body(body).unwrap()
    }

    fn error_response(&self, error: CollectError) -> Response {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(format!("collection error: {}", error).into_bytes())
            .unwrap()
    }
}
```

### 3.4 Duplicate Metric Registration

```rust
// REFINEMENT: Handle duplicate metric registration attempts

impl MetricsRegistry {
    pub fn register_counter(
        &self,
        name: &str,
        help: &str,
    ) -> Result<Counter, RegistrationError> {
        let sanitized_name = self.sanitizer.sanitize(name)?;

        // Check if already exists
        {
            let families = self.families.read();
            if let Some(existing) = families.get(sanitized_name.as_ref()) {
                // Same type? Return existing
                if existing.metric_type == MetricType::Counter {
                    tracing::debug!(
                        name = sanitized_name.as_ref(),
                        "returning existing counter"
                    );
                    return Ok(Counter::from_family(existing));
                }

                // Different type? Error
                return Err(RegistrationError::TypeMismatch {
                    name: sanitized_name.to_string(),
                    existing: existing.metric_type,
                    requested: MetricType::Counter,
                });
            }
        }

        // Create new family
        let mut families = self.families.write();

        // Double-check after acquiring write lock
        if let Some(existing) = families.get(sanitized_name.as_ref()) {
            if existing.metric_type == MetricType::Counter {
                return Ok(Counter::from_family(existing));
            }
        }

        let family = MetricFamily::new(
            sanitized_name.clone(),
            help.to_string(),
            MetricType::Counter,
        );

        let counter = Counter::from_family(&family);
        families.insert(sanitized_name.to_string(), family);

        Ok(counter)
    }
}
```

---

## 4. Security Refinements

### 4.1 Label Value Sanitization

```rust
// REFINEMENT: Prevent label injection attacks

pub struct LabelValueSanitizer {
    max_length: usize,
    allow_unicode: bool,
}

impl LabelValueSanitizer {
    pub fn sanitize(&self, value: &str) -> String {
        let mut sanitized = String::with_capacity(value.len().min(self.max_length));

        for c in value.chars().take(self.max_length) {
            match c {
                // Always escape these
                '"' | '\\' | '\n' => {
                    sanitized.push('\\');
                    sanitized.push(match c {
                        '"' => '"',
                        '\\' => '\\',
                        '\n' => 'n',
                        _ => unreachable!(),
                    });
                }
                // Control characters - skip
                c if c.is_control() => continue,
                // ASCII printable - allow
                c if c.is_ascii() && !c.is_control() => sanitized.push(c),
                // Unicode - configurable
                c if self.allow_unicode && !c.is_control() => sanitized.push(c),
                // Replace non-allowed unicode with placeholder
                _ => sanitized.push('?'),
            }
        }

        if value.len() > self.max_length {
            sanitized.push_str("...");
        }

        sanitized
    }
}

impl Default for LabelValueSanitizer {
    fn default() -> Self {
        Self {
            max_length: 128,
            allow_unicode: true,
        }
    }
}
```

### 4.2 Rate Limiting for Scrape Endpoint

```rust
// REFINEMENT: Prevent scrape endpoint abuse

use governor::{Quota, RateLimiter};
use std::num::NonZeroU32;

pub struct ScrapeRateLimiter {
    limiter: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
    burst_size: u32,
}

impl ScrapeRateLimiter {
    pub fn new(requests_per_second: u32, burst_size: u32) -> Self {
        let quota = Quota::per_second(NonZeroU32::new(requests_per_second).unwrap())
            .allow_burst(NonZeroU32::new(burst_size).unwrap());

        Self {
            limiter: RateLimiter::direct(quota),
            burst_size,
        }
    }

    pub fn check(&self) -> RateLimitResult {
        match self.limiter.check() {
            Ok(_) => RateLimitResult::Allowed,
            Err(not_until) => {
                let wait_time = not_until.wait_time_from(DefaultClock::default().now());
                RateLimitResult::Limited {
                    retry_after: wait_time,
                }
            }
        }
    }
}

pub enum RateLimitResult {
    Allowed,
    Limited { retry_after: Duration },
}

// Integration with handler
impl MetricsHandler {
    pub async fn handle(&self, req: Request) -> Response {
        // Check rate limit
        match self.rate_limiter.check() {
            RateLimitResult::Allowed => {}
            RateLimitResult::Limited { retry_after } => {
                return Response::builder()
                    .status(StatusCode::TOO_MANY_REQUESTS)
                    .header("Retry-After", retry_after.as_secs().to_string())
                    .body("Rate limit exceeded".into())
                    .unwrap();
            }
        }

        // Proceed with scrape
        self.collect_and_respond(req).await
    }
}
```

### 4.3 Authentication Middleware

```rust
// REFINEMENT: Optional authentication for metrics endpoint

pub struct MetricsAuthMiddleware {
    auth_module: Arc<dyn AuthModule>,
    required_scope: String,
    allow_health_unauthenticated: bool,
}

impl MetricsAuthMiddleware {
    pub async fn authenticate(&self, req: &Request) -> AuthResult {
        let path = req.uri().path();

        // Allow unauthenticated health checks if configured
        if self.allow_health_unauthenticated && (path == "/health" || path == "/ready") {
            return AuthResult::Allowed;
        }

        // Extract bearer token
        let token = req.headers()
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "));

        let Some(token) = token else {
            return AuthResult::Denied {
                reason: "Missing Authorization header".to_string(),
            };
        };

        // Validate token and check scope
        match self.auth_module.validate_token(token).await {
            Ok(claims) => {
                if claims.scopes.contains(&self.required_scope) {
                    AuthResult::Allowed
                } else {
                    AuthResult::Denied {
                        reason: format!("Missing required scope: {}", self.required_scope),
                    }
                }
            }
            Err(e) => AuthResult::Denied {
                reason: format!("Invalid token: {}", e),
            },
        }
    }
}
```

### 4.4 Metric Value Bounds Checking

```rust
// REFINEMENT: Prevent invalid metric values

impl Counter {
    pub fn add(&self, delta: f64) -> Result<(), ValueError> {
        // Counters must only increase
        if delta < 0.0 {
            return Err(ValueError::NegativeCounterDelta(delta));
        }

        // Check for special values
        if delta.is_nan() {
            return Err(ValueError::NaN);
        }

        if delta.is_infinite() {
            return Err(ValueError::Infinite);
        }

        self.value.fetch_add(delta.to_bits(), Ordering::Relaxed);
        Ok(())
    }
}

impl Gauge {
    pub fn set(&self, value: f64) -> Result<(), ValueError> {
        // Check for special values
        if value.is_nan() {
            return Err(ValueError::NaN);
        }

        // Infinity is technically allowed for gauges, but log warning
        if value.is_infinite() {
            tracing::warn!(
                name = self.name.as_ref(),
                "gauge set to infinite value"
            );
        }

        self.value.store(value.to_bits(), Ordering::Relaxed);
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub enum ValueError {
    NegativeCounterDelta(f64),
    NaN,
    Infinite,
}
```

---

## 5. Edge Case Handling

### 5.1 Empty Registry Serialization

```rust
// EDGE CASE: Handle empty registry gracefully

impl MetricsRegistry {
    pub fn serialize(&self) -> String {
        let families = self.families.read();

        if families.is_empty() {
            // Return valid empty response (not an error)
            return String::new();
        }

        let mut output = String::with_capacity(4096);

        for family in families.values() {
            self.serialize_family(&mut output, family);
        }

        output
    }
}
```

### 5.2 Concurrent Metric Creation

```rust
// EDGE CASE: Handle race conditions in metric creation

impl MetricsRegistry {
    pub fn get_or_create_counter(&self, name: &str, help: &str) -> Counter {
        // Fast path: read lock
        {
            let families = self.families.read();
            if let Some(family) = families.get(name) {
                return Counter::from_family(family);
            }
        }

        // Slow path: write lock with double-check
        let mut families = self.families.write();

        // Another thread may have created it
        if let Some(family) = families.get(name) {
            return Counter::from_family(family);
        }

        // Create new
        let family = MetricFamily::new_counter(name, help);
        let counter = Counter::from_family(&family);
        families.insert(name.to_string(), family);

        counter
    }
}
```

### 5.3 Very Large Metric Values

```rust
// EDGE CASE: Handle metric values near f64 limits

impl PrometheusSerializer {
    fn format_value(&self, value: f64) -> String {
        if value.is_nan() {
            return "NaN".to_string();
        }

        if value.is_infinite() {
            return if value.is_sign_positive() {
                "+Inf".to_string()
            } else {
                "-Inf".to_string()
            };
        }

        // Use scientific notation for very large/small values
        if value.abs() >= 1e15 || (value != 0.0 && value.abs() < 1e-6) {
            format!("{:e}", value)
        } else {
            // Standard formatting, avoid trailing zeros
            let formatted = format!("{}", value);
            formatted
        }
    }
}
```

### 5.4 Unicode in Label Values

```rust
// EDGE CASE: Properly handle unicode in label values

impl LabelSet {
    pub fn with_label(&self, key: &str, value: &str) -> Result<LabelSet, LabelError> {
        // Validate key (ASCII only per Prometheus spec)
        if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(LabelError::InvalidKeyCharacter(key.to_string()));
        }

        // Value can contain UTF-8, but needs proper escaping
        let escaped_value = self.escape_value(value);

        Ok(self.add_label(key, &escaped_value))
    }

    fn escape_value(&self, value: &str) -> String {
        let mut escaped = String::with_capacity(value.len());

        for c in value.chars() {
            match c {
                '\\' => escaped.push_str("\\\\"),
                '"' => escaped.push_str("\\\""),
                '\n' => escaped.push_str("\\n"),
                _ => escaped.push(c),
            }
        }

        escaped
    }
}
```

### 5.5 Histogram with All Observations in One Bucket

```rust
// EDGE CASE: Histogram where all values fall in same bucket

impl Histogram {
    pub fn serialize(&self) -> Vec<(String, f64)> {
        let mut output = Vec::new();
        let mut cumulative: u64 = 0;

        // Even if all zeros, we must output all buckets
        for (i, boundary) in self.boundaries.iter().enumerate() {
            cumulative += self.buckets[i].load(Ordering::Relaxed);

            // Always output bucket, even if count is 0
            output.push((
                format!("{}{{le=\"{}\"}}", self.name, boundary),
                cumulative as f64,
            ));
        }

        // +Inf bucket (always required)
        cumulative += self.buckets.last().map(|b| b.load(Ordering::Relaxed)).unwrap_or(0);
        output.push((
            format!("{}{{le=\"+Inf\"}}", self.name),
            cumulative as f64,
        ));

        // Sum and count
        output.push((format!("{}_sum", self.name), self.sum()));
        output.push((format!("{}_count", self.name), cumulative as f64));

        output
    }
}
```

---

## 6. Testing Refinements

### 6.1 Property-Based Testing for Serialization

```rust
// REFINEMENT: Property-based tests for serializer correctness

use proptest::prelude::*;

proptest! {
    #[test]
    fn test_serialized_output_parseable(
        name in "[a-z][a-z0-9_]*",
        value in prop::num::f64::NORMAL,
    ) {
        let registry = MetricsRegistry::new();
        let counter = registry.counter(&name, "test counter");
        counter.add(value.abs());

        let output = registry.serialize();

        // Property: Output should be parseable by Prometheus
        prop_assert!(output.contains(&format!("# TYPE {} counter", name)));
        prop_assert!(output.contains(&name));

        // Property: Output should be valid UTF-8
        prop_assert!(output.is_ascii() || output.chars().all(|c| !c.is_control() || c == '\n'));
    }

    #[test]
    fn test_label_escaping_roundtrip(
        value in ".*",
    ) {
        let sanitizer = LabelValueSanitizer::default();
        let sanitized = sanitizer.sanitize(&value);

        // Property: Sanitized value should not contain unescaped special chars
        let mut in_escape = false;
        for c in sanitized.chars() {
            if in_escape {
                in_escape = false;
                continue;
            }
            if c == '\\' {
                in_escape = true;
                continue;
            }
            prop_assert!(c != '"' && c != '\n');
        }
    }
}
```

### 6.2 Concurrency Stress Tests

```rust
// REFINEMENT: Stress test concurrent metric operations

#[tokio::test]
async fn test_concurrent_counter_increments() {
    let registry = Arc::new(MetricsRegistry::new());
    let counter = registry.counter("test_counter", "test");

    let tasks: Vec<_> = (0..100)
        .map(|_| {
            let counter = counter.clone();
            tokio::spawn(async move {
                for _ in 0..1000 {
                    counter.inc();
                }
            })
        })
        .collect();

    futures::future::join_all(tasks).await;

    assert_eq!(counter.get(), 100_000);
}

#[tokio::test]
async fn test_concurrent_metric_registration() {
    let registry = Arc::new(MetricsRegistry::new());

    let tasks: Vec<_> = (0..10)
        .map(|i| {
            let registry = Arc::clone(&registry);
            tokio::spawn(async move {
                for j in 0..100 {
                    // All threads try to create same metrics
                    let _ = registry.counter(
                        &format!("counter_{}", j % 10),
                        "concurrent test"
                    );
                }
            })
        })
        .collect();

    futures::future::join_all(tasks).await;

    // Should have exactly 10 unique counters
    assert_eq!(registry.metric_count(), 10);
}
```

### 6.3 Snapshot Testing for Serialization Format

```rust
// REFINEMENT: Snapshot tests to catch format regressions

#[test]
fn test_counter_serialization_format() {
    let registry = MetricsRegistry::new();
    let counter = registry.counter("http_requests_total", "Total HTTP requests");
    counter.with_labels(&[("method", "GET"), ("status", "200")]).inc();
    counter.with_labels(&[("method", "POST"), ("status", "201")]).inc();

    let output = registry.serialize();

    insta::assert_snapshot!(output, @r###"
    # HELP http_requests_total Total HTTP requests
    # TYPE http_requests_total counter
    http_requests_total{method="GET",status="200"} 1
    http_requests_total{method="POST",status="201"} 1
    "###);
}

#[test]
fn test_histogram_serialization_format() {
    let registry = MetricsRegistry::new();
    let histogram = registry.histogram(
        "request_duration_seconds",
        "Request duration",
        vec![0.1, 0.5, 1.0, 5.0],
    );

    histogram.observe(0.05);
    histogram.observe(0.3);
    histogram.observe(2.0);

    let output = registry.serialize();

    insta::assert_snapshot!(output, @r###"
    # HELP request_duration_seconds Request duration
    # TYPE request_duration_seconds histogram
    request_duration_seconds_bucket{le="0.1"} 1
    request_duration_seconds_bucket{le="0.5"} 2
    request_duration_seconds_bucket{le="1"} 2
    request_duration_seconds_bucket{le="5"} 3
    request_duration_seconds_bucket{le="+Inf"} 3
    request_duration_seconds_sum 2.35
    request_duration_seconds_count 3
    "###);
}
```

### 6.4 Mock Clock for Time-Based Tests

```rust
// REFINEMENT: Deterministic testing of time-based features

use std::sync::atomic::{AtomicU64, Ordering};

pub struct MockClock {
    now: AtomicU64,
}

impl MockClock {
    pub fn new() -> Self {
        Self { now: AtomicU64::new(0) }
    }

    pub fn advance(&self, millis: u64) {
        self.now.fetch_add(millis, Ordering::SeqCst);
    }

    pub fn now_millis(&self) -> u64 {
        self.now.load(Ordering::SeqCst)
    }
}

// Test cache expiration with mock clock
#[test]
fn test_cache_expiration() {
    let clock = Arc::new(MockClock::new());
    let serializer = CachedSerializer::with_clock(clock.clone(), Duration::from_secs(1));

    // First call populates cache
    let output1 = serializer.serialize(false);

    // Modify underlying metrics
    serializer.registry().counter("test", "").inc();

    // Within TTL - should return cached
    clock.advance(500);
    let output2 = serializer.serialize(false);
    assert_eq!(output1, output2);

    // After TTL - should regenerate
    clock.advance(600);
    let output3 = serializer.serialize(false);
    assert_ne!(output1, output3);
}
```

---

## 7. TypeScript Refinements

### 7.1 Type-Safe Metric Builders

```typescript
// REFINEMENT: Type-safe metric construction

interface CounterOptions {
  name: string;
  help: string;
  labelNames?: readonly string[];
}

interface GaugeOptions extends CounterOptions {}

interface HistogramOptions extends CounterOptions {
  buckets?: number[];
}

type LabelValues<T extends readonly string[]> = {
  [K in T[number]]: string;
};

class TypedCounter<Labels extends readonly string[] = []> {
  constructor(
    private readonly registry: Registry,
    private readonly opts: CounterOptions & { labelNames: Labels }
  ) {}

  inc(labels: LabelValues<Labels>, value: number = 1): void {
    this.registry.getCounter(this.opts.name).inc(labels, value);
  }
}

// Usage with full type safety
const httpRequests = new TypedCounter(registry, {
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status', 'path'] as const,
});

// TypeScript enforces correct labels
httpRequests.inc({ method: 'GET', status: '200', path: '/api' });
// Error: httpRequests.inc({ method: 'GET' }); // Missing 'status' and 'path'
```

### 7.2 Async-Safe Metric Collection

```typescript
// REFINEMENT: Thread-safe metric collection in async contexts

import { AsyncLocalStorage } from 'async_hooks';

class AsyncMetricsContext {
  private storage = new AsyncLocalStorage<Map<string, number>>();

  runWithMetrics<T>(fn: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(new Map(), fn);
  }

  increment(name: string, delta: number = 1): void {
    const store = this.storage.getStore();
    if (store) {
      const current = store.get(name) ?? 0;
      store.set(name, current + delta);
    }
  }

  getAndReset(): Map<string, number> {
    const store = this.storage.getStore();
    if (!store) {
      return new Map();
    }
    const result = new Map(store);
    store.clear();
    return result;
  }
}

// Usage in async request handler
const metricsContext = new AsyncMetricsContext();

async function handleRequest(req: Request): Promise<Response> {
  return metricsContext.runWithMetrics(async () => {
    metricsContext.increment('requests_in_flight');

    try {
      const result = await processRequest(req);
      metricsContext.increment('requests_success');
      return result;
    } catch (e) {
      metricsContext.increment('requests_error');
      throw e;
    } finally {
      metricsContext.increment('requests_in_flight', -1);

      // Flush to global metrics
      const localMetrics = metricsContext.getAndReset();
      for (const [name, value] of localMetrics) {
        globalRegistry.getMetric(name).add(value);
      }
    }
  });
}
```

### 7.3 Streaming HTTP Response

```typescript
// REFINEMENT: Stream large metric responses

import { Readable } from 'stream';

class StreamingMetricsHandler {
  constructor(private registry: Registry) {}

  createStream(): Readable {
    const families = this.registry.getMetricFamilies();
    let index = 0;

    return new Readable({
      read() {
        if (index >= families.length) {
          this.push(null);
          return;
        }

        const family = families[index++];
        const chunk = this.serializeFamily(family);
        this.push(chunk);
      },
    });
  }

  private serializeFamily(family: MetricFamily): string {
    let output = `# HELP ${family.name} ${family.help}\n`;
    output += `# TYPE ${family.name} ${family.type}\n`;

    for (const metric of family.metrics) {
      output += this.serializeMetric(family.name, metric);
    }

    return output;
  }

  private serializeMetric(name: string, metric: Metric): string {
    const labels = this.formatLabels(metric.labels);
    return `${name}${labels} ${metric.value}\n`;
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';

    const formatted = entries
      .map(([k, v]) => `${k}="${this.escapeValue(v)}"`)
      .join(',');

    return `{${formatted}}`;
  }

  private escapeValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }
}
```

---

## 8. Production Checklist

### 8.1 Pre-Production Validation

| Category | Check | Status |
|----------|-------|--------|
| **Performance** | Counter increment < 50ns | ⬜ |
| **Performance** | Serialization < 10ms for 10k metrics | ⬜ |
| **Performance** | Gzip compression working | ⬜ |
| **Performance** | Cache hit rate > 90% | ⬜ |
| **Security** | Label sanitization verified | ⬜ |
| **Security** | Rate limiting configured | ⬜ |
| **Security** | Authentication enabled (if required) | ⬜ |
| **Reliability** | Cardinality limits set | ⬜ |
| **Reliability** | Graceful degradation tested | ⬜ |
| **Reliability** | Scrape timeout handling verified | ⬜ |
| **Observability** | Self-metrics exposed | ⬜ |
| **Observability** | Error logging configured | ⬜ |

### 8.2 Configuration Checklist

```yaml
# production-config.yaml
prometheus_metrics:
  endpoint:
    path: "/metrics"
    port: 9090

  cache:
    enabled: true
    ttl_ms: 1000

  cardinality:
    max_series_per_metric: 1000
    max_total_series: 10000
    overflow_action: "drop_and_warn"

  compression:
    enabled: true
    min_size_bytes: 1024
    level: 6

  rate_limiting:
    enabled: true
    requests_per_second: 10
    burst_size: 20

  authentication:
    enabled: false  # Enable in production if needed
    required_scope: "metrics:read"

  timeouts:
    scrape_timeout_ms: 5000
    collection_timeout_ms: 4000

  collectors:
    llm:
      enabled: true
      include_model_metrics: true
    agent:
      enabled: true
      include_tool_metrics: true
    process:
      enabled: true
    runtime:
      enabled: true
```

### 8.3 Self-Monitoring Metrics

```rust
// Metrics about the metrics system itself
impl MetricsRegistry {
    fn register_self_metrics(&self) {
        // Scrape duration
        self.histogram(
            "llmdevops_metrics_scrape_duration_seconds",
            "Time spent collecting and serializing metrics",
            vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
        );

        // Scrape size
        self.histogram(
            "llmdevops_metrics_scrape_size_bytes",
            "Size of scrape response in bytes",
            vec![1024.0, 4096.0, 16384.0, 65536.0, 262144.0],
        );

        // Cardinality
        self.gauge(
            "llmdevops_metrics_series_count",
            "Current number of time series",
        );

        // Cache stats
        self.counter(
            "llmdevops_metrics_cache_hits_total",
            "Number of cache hits",
        );

        self.counter(
            "llmdevops_metrics_cache_misses_total",
            "Number of cache misses",
        );

        // Cardinality overflow
        self.counter(
            "llmdevops_metrics_cardinality_overflow_total",
            "Number of dropped series due to cardinality limits",
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
