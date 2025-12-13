# Refinement: PostgreSQL Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/postgresql`

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
struct PgClient;                          // PascalCase for types
fn execute_query();                       // snake_case for functions
const MAX_POOL_SIZE: u32 = 100;          // SCREAMING_SNAKE for constants
type Result<T> = std::result::Result<T, PgError>;

// Error handling with thiserror
#[derive(Debug, thiserror::Error)]
pub enum PgError {
    #[error("Connection failed to {host}:{port}: {source}")]
    ConnectionFailed {
        host: String,
        port: u16,
        #[source]
        source: tokio_postgres::Error,
    },

    #[error("Query timeout after {timeout:?}")]
    QueryTimeout { timeout: Duration },

    #[error("Serialization failure, transaction should be retried")]
    SerializationFailure,
}

// Builder pattern for configuration
impl PgConfigBuilder {
    pub fn new(connection_string: impl Into<String>) -> Self {
        Self {
            connection_string: connection_string.into(),
            ..Default::default()
        }
    }

    pub fn pool_size(mut self, min: u32, max: u32) -> Self {
        self.min_connections = Some(min);
        self.max_connections = Some(max);
        self
    }

    pub fn query_timeout(mut self, timeout: Duration) -> Self {
        self.query_timeout = Some(timeout);
        self
    }

    pub fn build(self) -> Result<PgConfig> {
        Ok(PgConfig {
            connection_string: self.connection_string,
            min_connections: self.min_connections.unwrap_or(5),
            max_connections: self.max_connections.unwrap_or(20),
            query_timeout: self.query_timeout.unwrap_or(Duration::from_secs(30)),
            ..Default::default()
        })
    }
}
```

### 1.2 Documentation Standards

```rust
/// Executes a parameterized query and returns all matching rows.
///
/// # Arguments
///
/// * `sql` - SQL query with $1, $2, ... placeholders
/// * `params` - Parameter values in order
///
/// # Returns
///
/// Vector of rows, each containing typed column values.
///
/// # Errors
///
/// * `PgError::QueryTimeout` - Query exceeded configured timeout
/// * `PgError::ExecutionError` - Database returned an error
/// * `PgError::ConversionError` - Failed to convert result types
///
/// # Example
///
/// ```rust
/// let users = client.query(
///     "SELECT id, name FROM users WHERE status = $1 AND age > $2",
///     &[Value::Text("active".into()), Value::Int32(18)],
/// ).await?;
///
/// for row in users {
///     let id: Uuid = row.get("id")?;
///     let name: String = row.get("name")?;
///     println!("{}: {}", id, name);
/// }
/// ```
pub async fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>
```

### 1.3 Module Organization

```rust
// lib.rs - clean public API
pub mod client;
pub mod config;
pub mod error;
pub mod types;
pub mod operations;
pub mod pool;

pub use client::PgClient;
pub use config::{PgConfig, PgConfigBuilder, PoolConfig};
pub use error::PgError;
pub use types::*;

/// Prelude for common imports
pub mod prelude {
    pub use crate::{
        PgClient, PgConfig, PgConfigBuilder,
        Value, Row, Column,
        Transaction, IsolationLevel,
        PgError,
    };
}
```

---

## 2. Interface Contracts

### 2.1 Client Trait

```rust
#[async_trait]
pub trait DatabaseOperations: Send + Sync {
    // Query operations
    async fn execute(&self, sql: &str, params: &[Value]) -> Result<u64>;
    async fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>;
    async fn query_one(&self, sql: &str, params: &[Value]) -> Result<Row>;
    async fn query_opt(&self, sql: &str, params: &[Value]) -> Result<Option<Row>>;

    // Transaction operations
    async fn begin(&self) -> Result<Transaction>;
    async fn begin_with_options(&self, options: TransactionOptions) -> Result<Transaction>;
    async fn transaction<F, T>(&self, f: F) -> Result<T>
    where
        F: for<'a> FnOnce(&'a mut Transaction) -> BoxFuture<'a, Result<T>> + Send,
        T: Send;

    // Streaming
    fn query_stream(&self, sql: &str, params: &[Value]) -> impl Stream<Item = Result<Row>>;

    // Health
    async fn health_check(&self) -> Result<HealthStatus>;
}
```

### 2.2 Transaction Trait

```rust
#[async_trait]
pub trait TransactionOperations: Send {
    async fn execute(&mut self, sql: &str, params: &[Value]) -> Result<u64>;
    async fn query(&mut self, sql: &str, params: &[Value]) -> Result<Vec<Row>>;
    async fn query_one(&mut self, sql: &str, params: &[Value]) -> Result<Row>;
    async fn query_opt(&mut self, sql: &str, params: &[Value]) -> Result<Option<Row>>;

    async fn savepoint(&mut self, name: &str) -> Result<Savepoint>;
    async fn rollback_to(&mut self, savepoint: &Savepoint) -> Result<()>;
    async fn release(&mut self, savepoint: &Savepoint) -> Result<()>;

    async fn commit(self) -> Result<()>;
    async fn rollback(self) -> Result<()>;
}
```

### 2.3 Value Conversion Traits

```rust
/// Convert Rust type to PostgreSQL value
pub trait ToSql: Send + Sync {
    fn to_sql(&self) -> Result<Value>;
}

/// Convert PostgreSQL value to Rust type
pub trait FromSql: Sized {
    fn from_sql(value: &Value) -> Result<Self>;
}

// Implementations for common types
impl ToSql for String {
    fn to_sql(&self) -> Result<Value> {
        Ok(Value::Text(self.clone()))
    }
}

impl ToSql for i32 {
    fn to_sql(&self) -> Result<Value> {
        Ok(Value::Int32(*self))
    }
}

impl ToSql for Uuid {
    fn to_sql(&self) -> Result<Value> {
        Ok(Value::Uuid(*self))
    }
}

impl<T: ToSql> ToSql for Option<T> {
    fn to_sql(&self) -> Result<Value> {
        match self {
            Some(v) => v.to_sql(),
            None => Ok(Value::Null),
        }
    }
}

impl FromSql for String {
    fn from_sql(value: &Value) -> Result<Self> {
        match value {
            Value::Text(s) => Ok(s.clone()),
            Value::Null => Err(PgError::NullValue { column: "".into() }),
            _ => Err(PgError::ConversionError {
                from: value.type_name(),
                to: "String",
            }),
        }
    }
}
```

### 2.4 Row Access

```rust
impl Row {
    /// Get column by name with type conversion
    pub fn get<T: FromSql>(&self, column: &str) -> Result<T> {
        let idx = self.column_index(column)?;
        T::from_sql(&self.values[idx])
    }

    /// Get column by index with type conversion
    pub fn get_idx<T: FromSql>(&self, index: usize) -> Result<T> {
        let value = self.values.get(index)
            .ok_or(PgError::ColumnIndexOutOfBounds { index, count: self.values.len() })?;
        T::from_sql(value)
    }

    /// Try to get optional column value
    pub fn try_get<T: FromSql>(&self, column: &str) -> Result<Option<T>> {
        let idx = self.column_index(column)?;
        match &self.values[idx] {
            Value::Null => Ok(None),
            v => T::from_sql(v).map(Some),
        }
    }
}
```

---

## 3. Validation Rules

### 3.1 Connection String Validation

```rust
pub fn parse_connection_string(conn_str: &str) -> Result<ConnectionConfig> {
    // Parse URL format
    let url = Url::parse(conn_str)
        .map_err(|_| PgError::InvalidConnectionString { input: conn_str.into() })?;

    // Validate scheme
    if url.scheme() != "postgresql" && url.scheme() != "postgres" {
        return Err(PgError::InvalidConnectionString {
            input: format!("Invalid scheme: {}", url.scheme()),
        });
    }

    // Extract and validate host
    let host = url.host_str()
        .ok_or(PgError::InvalidConnectionString { input: "Missing host".into() })?
        .to_string();

    // Validate port
    let port = url.port().unwrap_or(5432);
    if port == 0 {
        return Err(PgError::InvalidConnectionString { input: "Invalid port".into() });
    }

    // Extract database name
    let database = url.path().trim_start_matches('/').to_string();
    if database.is_empty() {
        return Err(PgError::InvalidConnectionString { input: "Missing database".into() });
    }

    // Validate identifier
    validate_identifier(&database)?;

    Ok(ConnectionConfig {
        host,
        port,
        database,
        username: url.username().to_string(),
        ssl_mode: parse_ssl_mode(url.query_pairs())?,
        ..Default::default()
    })
}
```

### 3.2 SQL Identifier Validation

```rust
/// Validates SQL identifiers to prevent injection
pub fn validate_identifier(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 63 {
        return Err(PgError::InvalidIdentifier {
            name: name.into(),
            reason: "Must be 1-63 characters".into(),
        });
    }

    // Must start with letter or underscore
    let first = name.chars().next().unwrap();
    if !first.is_ascii_alphabetic() && first != '_' {
        return Err(PgError::InvalidIdentifier {
            name: name.into(),
            reason: "Must start with letter or underscore".into(),
        });
    }

    // Only alphanumeric and underscore allowed
    for ch in name.chars() {
        if !ch.is_ascii_alphanumeric() && ch != '_' {
            return Err(PgError::InvalidIdentifier {
                name: name.into(),
                reason: format!("Invalid character: {}", ch),
            });
        }
    }

    // Check against reserved words
    if is_reserved_word(name) {
        return Err(PgError::InvalidIdentifier {
            name: name.into(),
            reason: "Reserved SQL keyword".into(),
        });
    }

    Ok(())
}

/// Quote identifier for safe SQL inclusion
pub fn quote_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}
```

### 3.3 Parameter Validation

```rust
fn validate_params(sql: &str, params: &[Value]) -> Result<()> {
    // Count placeholders in SQL
    let placeholder_count = count_placeholders(sql);

    if placeholder_count != params.len() {
        return Err(PgError::ParamCountMismatch {
            expected: placeholder_count,
            got: params.len(),
        });
    }

    Ok(())
}

fn count_placeholders(sql: &str) -> usize {
    let re = Regex::new(r"\$(\d+)").unwrap();
    re.captures_iter(sql)
        .filter_map(|c| c.get(1)?.as_str().parse::<usize>().ok())
        .max()
        .unwrap_or(0)
}
```

---

## 4. Security Hardening

### 4.1 Credential Protection

```rust
use secrecy::{ExposeSecret, SecretString};

pub struct DatabaseCredentials {
    pub username: String,
    pub password: SecretString,
}

impl PgClient {
    async fn connect(&self, config: &ConnectionConfig) -> Result<Client> {
        let creds = self.credentials.get_credentials().await?;

        let (client, connection) = tokio_postgres::Config::new()
            .host(&config.host)
            .port(config.port)
            .dbname(&config.database)
            .user(&creds.username)
            .password(creds.password.expose_secret())
            .ssl_mode(config.ssl_mode.into())
            .connect(tls_connector)
            .await?;

        // Spawn connection task
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!(error = %e, "Connection error");
            }
        });

        Ok(client)
    }
}

// Never log credentials
impl std::fmt::Debug for DatabaseCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DatabaseCredentials")
            .field("username", &self.username)
            .field("password", &"[REDACTED]")
            .finish()
    }
}
```

### 4.2 Query Logging Safety

```rust
/// Sanitize query for logging (redact potential secrets)
fn sanitize_query_for_logging(sql: &str, params: &[Value]) -> String {
    // Replace actual parameter values with placeholders
    let sanitized_params: Vec<String> = params.iter()
        .enumerate()
        .map(|(i, v)| match v {
            Value::Text(s) if s.len() > 100 => format!("${}='[{}chars]'", i + 1, s.len()),
            Value::Bytea(b) => format!("${}='[{}bytes]'", i + 1, b.len()),
            Value::Null => format!("${}=NULL", i + 1),
            _ => format!("${}=?", i + 1),
        })
        .collect();

    format!("{} -- params: [{}]", sql, sanitized_params.join(", "))
}

/// Check if query might expose sensitive data
fn is_sensitive_query(sql: &str) -> bool {
    let sql_lower = sql.to_lowercase();
    let sensitive_patterns = [
        "password", "secret", "token", "api_key", "credential",
        "credit_card", "ssn", "social_security",
    ];

    sensitive_patterns.iter().any(|p| sql_lower.contains(p))
}
```

### 4.3 TLS Configuration

```rust
fn build_tls_connector(config: &SslConfig) -> Result<TlsConnector> {
    let mut builder = native_tls::TlsConnector::builder();

    // Enforce TLS 1.2 minimum
    builder.min_protocol_version(Some(native_tls::Protocol::Tlsv12));

    match config.mode {
        SslMode::Disable => {
            return Err(PgError::TlsRequired);
        }
        SslMode::Require => {
            // Accept any certificate (not recommended for production)
            builder.danger_accept_invalid_certs(true);
        }
        SslMode::VerifyCa => {
            if let Some(ca_path) = &config.ca_cert {
                let ca = std::fs::read(ca_path)?;
                let cert = native_tls::Certificate::from_pem(&ca)?;
                builder.add_root_certificate(cert);
            }
        }
        SslMode::VerifyFull => {
            if let Some(ca_path) = &config.ca_cert {
                let ca = std::fs::read(ca_path)?;
                let cert = native_tls::Certificate::from_pem(&ca)?;
                builder.add_root_certificate(cert);
            }
            // Hostname verification enabled by default
        }
    }

    Ok(builder.build()?.into())
}
```

### 4.4 SQL Injection Prevention

```rust
impl PgClient {
    /// NEVER use this for user input - only for trusted SQL
    #[doc(hidden)]
    pub async fn execute_raw(&self, sql: &str) -> Result<u64> {
        // Log warning if called
        tracing::warn!(sql = %sql, "execute_raw called - ensure SQL is trusted");
        self.execute_internal(sql, &[]).await
    }

    /// Safe parameterized query - ALWAYS use this for user input
    pub async fn execute(&self, sql: &str, params: &[Value]) -> Result<u64> {
        // Validate no raw string concatenation
        if sql.contains("''") && params.is_empty() {
            tracing::warn!("Query contains escaped quotes with no params - potential injection");
        }

        validate_params(sql, params)?;
        self.execute_internal(sql, params).await
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pool Tuning

```rust
impl PgClient {
    pub fn new(config: PgConfig, credentials: Arc<dyn CredentialProvider>) -> Result<Self> {
        let pool_config = deadpool_postgres::Config {
            host: Some(config.host.clone()),
            port: Some(config.port),
            dbname: Some(config.database.clone()),
            user: Some(config.username.clone()),
            manager: Some(ManagerConfig {
                recycling_method: RecyclingMethod::Fast,
            }),
            pool: Some(PoolConfig {
                max_size: config.max_connections as usize,
                timeouts: Timeouts {
                    wait: Some(config.acquire_timeout),
                    create: Some(config.connect_timeout),
                    recycle: Some(Duration::from_secs(30)),
                },
                ..Default::default()
            }),
            ..Default::default()
        };

        let pool = pool_config.create_pool(Some(Runtime::Tokio1), tls)?;

        Ok(Self { pool, config, credentials, ..Default::default() })
    }
}
```

### 5.2 Prepared Statement Caching

```rust
impl PgClient {
    pub async fn query_cached(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>> {
        let conn = self.acquire(QueryIntent::Read).await?;

        // Use prepare_cached for automatic statement caching
        let stmt = conn.prepare_cached(sql).await?;

        let pg_params = convert_params(params)?;
        let rows = conn.query(&stmt, &pg_params).await?;

        rows.iter().map(convert_row).collect()
    }
}

// Statement cache configuration
impl PoolManagerConfig {
    pub fn with_statement_cache(mut self, size: usize) -> Self {
        self.statement_cache_capacity = size;
        self
    }
}
```

### 5.3 Batch Query Optimization

```rust
impl PgClient {
    /// Execute multiple queries in a single round-trip using pipelining
    pub async fn execute_batch(&self, queries: &[(String, Vec<Value>)]) -> Result<Vec<u64>> {
        let conn = self.acquire(QueryIntent::Write).await?;
        let mut results = Vec::with_capacity(queries.len());

        // Use pipeline for reduced round-trips
        let mut pipeline = conn.pipeline();

        for (sql, params) in queries {
            let pg_params = convert_params(params)?;
            pipeline.query(sql, &pg_params);
        }

        let responses = pipeline.execute().await?;

        for response in responses {
            results.push(response.rows_affected());
        }

        Ok(results)
    }

    /// Optimized batch insert using unnest
    pub async fn batch_insert_unnest<T: ToRow>(
        &self,
        table: &str,
        columns: &[&str],
        rows: &[T],
    ) -> Result<u64> {
        if rows.is_empty() {
            return Ok(0);
        }

        validate_identifier(table)?;
        for col in columns {
            validate_identifier(col)?;
        }

        // Build UNNEST-based insert for better performance
        let col_list = columns.join(", ");
        let unnest_args: Vec<String> = (1..=columns.len())
            .map(|i| format!("${}", i))
            .collect();

        let sql = format!(
            "INSERT INTO {} ({}) SELECT * FROM UNNEST({})",
            quote_identifier(table),
            col_list,
            unnest_args.join(", ")
        );

        // Convert rows to column arrays
        let arrays = transpose_to_arrays(rows, columns.len())?;
        self.execute(&sql, &arrays).await
    }
}
```

### 5.4 Streaming for Large Results

```rust
impl PgClient {
    /// Stream rows to avoid loading entire result set in memory
    pub fn query_stream<'a>(
        &'a self,
        sql: &'a str,
        params: &'a [Value],
    ) -> impl Stream<Item = Result<Row>> + 'a {
        async_stream::try_stream! {
            let conn = self.acquire(QueryIntent::Read).await?;
            let pg_params = convert_params(params)?;

            let row_stream = conn.query_raw(sql, pg_params).await?;
            pin_mut!(row_stream);

            while let Some(pg_row) = row_stream.next().await {
                let row = convert_row(&pg_row?)?;
                yield row;
            }
        }
    }

    /// Use server-side cursor for very large result sets
    pub async fn query_cursor(
        &self,
        sql: &str,
        params: &[Value],
        fetch_size: u32,
    ) -> Result<Cursor> {
        let conn = self.acquire(QueryIntent::Read).await?;

        // Must be in a transaction for cursors
        conn.execute("BEGIN", &[]).await?;

        let cursor_name = format!("cursor_{}", Uuid::new_v4().simple());
        let declare_sql = format!("DECLARE {} CURSOR FOR {}", cursor_name, sql);

        let pg_params = convert_params(params)?;
        conn.execute(&declare_sql, &pg_params).await?;

        Ok(Cursor {
            conn,
            name: cursor_name,
            fetch_size,
            exhausted: false,
        })
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
    fn test_value_conversion_roundtrip() {
        let values = vec![
            Value::Int32(42),
            Value::Text("hello".into()),
            Value::Bool(true),
            Value::Uuid(Uuid::new_v4()),
            Value::Null,
        ];

        for value in values {
            let (oid, bytes) = value.to_sql_bytes().unwrap();
            let restored = Value::from_sql(oid, &bytes).unwrap();
            assert_eq!(value, restored);
        }
    }

    #[test]
    fn test_validate_identifier() {
        assert!(validate_identifier("users").is_ok());
        assert!(validate_identifier("user_accounts").is_ok());
        assert!(validate_identifier("_private").is_ok());

        assert!(validate_identifier("").is_err());
        assert!(validate_identifier("123start").is_err());
        assert!(validate_identifier("has-dash").is_err());
        assert!(validate_identifier("has space").is_err());
        assert!(validate_identifier("SELECT").is_err()); // Reserved
    }

    #[test]
    fn test_param_count_validation() {
        assert!(validate_params("SELECT * FROM users WHERE id = $1", &[Value::Int32(1)]).is_ok());
        assert!(validate_params("SELECT $1, $2", &[Value::Int32(1)]).is_err());
        assert!(validate_params("SELECT 1", &[Value::Int32(1)]).is_err());
    }

    #[test]
    fn test_connection_string_parsing() {
        let config = parse_connection_string(
            "postgresql://user:pass@localhost:5432/mydb?sslmode=require"
        ).unwrap();

        assert_eq!(config.host, "localhost");
        assert_eq!(config.port, 5432);
        assert_eq!(config.database, "mydb");
        assert_eq!(config.ssl_mode, SslMode::Require);
    }
}
```

### 6.2 Integration Tests with Simulation

```rust
#[tokio::test]
async fn test_query_simulation() {
    let config = PgConfig::builder("postgresql://localhost/test")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/query_users.json"),
        })
        .build()
        .unwrap();

    let client = PgClient::new(config, mock_credentials()).unwrap();

    let rows = client.query(
        "SELECT id, name FROM users WHERE active = $1",
        &[Value::Bool(true)],
    ).await.unwrap();

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].get::<String>("name").unwrap(), "Alice");
}

#[tokio::test]
async fn test_transaction_simulation() {
    let config = PgConfig::builder("postgresql://localhost/test")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/transaction.json"),
        })
        .build()
        .unwrap();

    let client = PgClient::new(config, mock_credentials()).unwrap();

    let result = client.transaction(|txn| {
        Box::pin(async move {
            txn.execute("UPDATE accounts SET balance = balance - $1 WHERE id = $2",
                &[Value::Int64(100), Value::Int32(1)]).await?;
            txn.execute("UPDATE accounts SET balance = balance + $1 WHERE id = $2",
                &[Value::Int64(100), Value::Int32(2)]).await?;
            Ok(())
        })
    }).await;

    assert!(result.is_ok());
}
```

### 6.3 Pool and Routing Tests

```rust
#[tokio::test]
async fn test_read_write_routing() {
    let config = PgConfig::builder("postgresql://primary/test")
        .add_replica("postgresql://replica1/test")
        .add_replica("postgresql://replica2/test")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/routing.json"),
        })
        .build()
        .unwrap();

    let client = PgClient::new(config, mock_credentials()).unwrap();

    // Reads should go to replicas
    let _ = client.query("SELECT * FROM users", &[]).await.unwrap();

    // Writes should go to primary
    let _ = client.execute("INSERT INTO users (name) VALUES ($1)",
        &[Value::Text("test".into())]).await.unwrap();

    // Verify routing via metrics
    let stats = client.get_routing_stats();
    assert!(stats.replica_reads > 0);
    assert!(stats.primary_writes > 0);
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: PostgreSQL Integration CI

on:
  push:
    paths:
      - 'integrations/postgresql/**'
  pull_request:
    paths:
      - 'integrations/postgresql/**'

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
          workspaces: integrations/postgresql

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/postgresql

      - name: Clippy
        run: cargo clippy --all-targets --all-features
        working-directory: integrations/postgresql

      - name: Build
        run: cargo build --all-features
        working-directory: integrations/postgresql

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/postgresql

  integration-tests:
    runs-on: ubuntu-latest
    needs: check
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Integration tests
        run: cargo test --test '*'
        working-directory: integrations/postgresql
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/testdb

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Security audit
        uses: rustsec/audit-check@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

### 7.2 Cargo.toml

```toml
[package]
name = "postgresql-integration"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
tokio-postgres = { version = "0.7", features = ["with-uuid-1", "with-chrono-0_4", "with-serde_json-1"] }
deadpool-postgres = "0.12"
native-tls = "0.2"
postgres-native-tls = "0.5"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
tracing = "0.1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.6", features = ["v4", "serde"] }
secrecy = { version = "0.8", features = ["serde"] }
async-trait = "0.1"
async-stream = "0.3"
futures = "0.3"
sha2 = "0.10"
hex = "0.4"
regex = "1.10"
url = "2.5"

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
pub struct PgMetrics {
    queries_total: CounterVec,
    query_duration: HistogramVec,
    rows_returned: Counter,
    rows_affected: Counter,
    transactions_total: CounterVec,
    transaction_duration: Histogram,
    pool_connections: GaugeVec,
    pool_acquire_duration: Histogram,
    routing_decisions: CounterVec,
    errors: CounterVec,
}

impl PgMetrics {
    pub fn new(registry: &Registry) -> Self {
        Self {
            queries_total: CounterVec::new(
                Opts::new("pg_queries_total", "Total queries executed"),
                &["operation", "database"]
            ).unwrap(),

            query_duration: HistogramVec::new(
                HistogramOpts::new("pg_query_duration_seconds", "Query duration")
                    .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]),
                &["operation"]
            ).unwrap(),

            pool_connections: GaugeVec::new(
                Opts::new("pg_pool_connections", "Pool connection counts"),
                &["pool", "state"]
            ).unwrap(),

            routing_decisions: CounterVec::new(
                Opts::new("pg_routing_decisions_total", "Routing decisions"),
                &["target"] // primary, replica
            ).unwrap(),

            errors: CounterVec::new(
                Opts::new("pg_errors_total", "Errors by type"),
                &["error_type"]
            ).unwrap(),
        }
    }
}
```

### 8.2 Tracing

```rust
impl PgClient {
    #[tracing::instrument(
        skip(self, params),
        fields(
            db.system = "postgresql",
            db.name = %self.config.database,
            db.operation = "query",
        )
    )]
    pub async fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>> {
        let start = Instant::now();

        let result = self.query_internal(sql, params).await;

        match &result {
            Ok(rows) => {
                tracing::debug!(
                    rows = rows.len(),
                    duration_ms = start.elapsed().as_millis(),
                    "Query completed"
                );
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    duration_ms = start.elapsed().as_millis(),
                    "Query failed"
                );
            }
        }

        result
    }
}
```

### 8.3 Health Check

```rust
impl PgClient {
    pub async fn health_check(&self) -> Result<HealthStatus> {
        let start = Instant::now();

        // Check primary
        let primary_ok = self.check_connection(&self.primary_pool).await;

        // Check replicas
        let mut replica_status = Vec::new();
        for (i, pool) in self.replica_pools.iter().enumerate() {
            let ok = self.check_connection(pool).await;
            let lag = if ok {
                self.check_replica_lag(pool).await.ok()
            } else {
                None
            };

            replica_status.push(ReplicaHealth {
                index: i,
                healthy: ok,
                lag_bytes: lag,
            });
        }

        Ok(HealthStatus {
            healthy: primary_ok,
            latency: start.elapsed(),
            primary: PrimaryHealth { healthy: primary_ok },
            replicas: replica_status,
            pool_stats: self.get_pool_stats(),
        })
    }

    async fn check_connection(&self, pool: &Pool) -> bool {
        match timeout(Duration::from_secs(5), pool.get()).await {
            Ok(Ok(conn)) => conn.execute("SELECT 1", &[]).await.is_ok(),
            _ => false,
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-PG-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
