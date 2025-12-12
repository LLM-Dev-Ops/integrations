//! RuvVector Postgres Database Connectivity Module
//! Provides shared database connection utilities for all integrations

use deadpool_postgres::{Config, Pool, Runtime};
use std::env;
use thiserror::Error;
use tokio_postgres::NoTls;

/// Database errors
#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Connection error: {0}")]
    Connection(String),
    #[error("Query error: {0}")]
    Query(String),
    #[error("Pool error: {0}")]
    Pool(String),
    #[error("Configuration error: {0}")]
    Config(String),
}

/// Database configuration
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub max_connections: usize,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self::from_env()
    }
}

impl DatabaseConfig {
    /// Create configuration from environment variables
    pub fn from_env() -> Self {
        if let Ok(database_url) = env::var("DATABASE_URL") {
            if let Ok(url) = url::Url::parse(&database_url) {
                return Self {
                    host: url.host_str().unwrap_or("localhost").to_string(),
                    port: url.port().unwrap_or(5432),
                    user: url.username().to_string(),
                    password: url.password().unwrap_or("").to_string(),
                    database: url.path().trim_start_matches('/').to_string(),
                    max_connections: 10,
                };
            }
        }

        Self {
            host: env::var("POSTGRES_HOST").unwrap_or_else(|_| "localhost".to_string()),
            port: env::var("POSTGRES_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(5432),
            user: env::var("POSTGRES_USER").unwrap_or_else(|_| "ruvector".to_string()),
            password: env::var("POSTGRES_PASSWORD").unwrap_or_else(|_| "ruvector_secret".to_string()),
            database: env::var("POSTGRES_DB").unwrap_or_else(|_| "ruvector".to_string()),
            max_connections: 10,
        }
    }
}

/// Connection test result
#[derive(Debug)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub version: Option<String>,
    pub database: Option<String>,
    pub user: Option<String>,
    pub extensions: Vec<String>,
}

/// RuvVector Database Pool Manager
pub struct RuvectorDatabase {
    pool: Pool,
    config: DatabaseConfig,
}

impl RuvectorDatabase {
    /// Create a new database connection pool
    pub async fn new(config: DatabaseConfig) -> Result<Self, DatabaseError> {
        let mut cfg = Config::new();
        cfg.host = Some(config.host.clone());
        cfg.port = Some(config.port);
        cfg.user = Some(config.user.clone());
        cfg.password = Some(config.password.clone());
        cfg.dbname = Some(config.database.clone());

        let pool = cfg
            .create_pool(Some(Runtime::Tokio1), NoTls)
            .map_err(|e| DatabaseError::Pool(e.to_string()))?;

        Ok(Self { pool, config })
    }

    /// Create with default configuration
    pub async fn with_defaults() -> Result<Self, DatabaseError> {
        Self::new(DatabaseConfig::default()).await
    }

    /// Get a client from the pool
    pub async fn get_client(&self) -> Result<deadpool_postgres::Client, DatabaseError> {
        self.pool
            .get()
            .await
            .map_err(|e| DatabaseError::Pool(e.to_string()))
    }

    /// Test database connectivity with a connect -> query -> write -> read cycle
    pub async fn test_connection(&self) -> ConnectionTestResult {
        let client = match self.get_client().await {
            Ok(c) => c,
            Err(e) => {
                return ConnectionTestResult {
                    success: false,
                    message: format!("Failed to connect: {}", e),
                    version: None,
                    database: None,
                    user: None,
                    extensions: vec![],
                }
            }
        };

        // Step 1: Query - get database info
        let version = match client.query_one("SELECT version()", &[]).await {
            Ok(row) => row.get::<_, String>(0),
            Err(e) => {
                return ConnectionTestResult {
                    success: false,
                    message: format!("Failed to query version: {}", e),
                    version: None,
                    database: None,
                    user: None,
                    extensions: vec![],
                }
            }
        };

        let (database, user) = match client
            .query_one("SELECT current_database(), current_user", &[])
            .await
        {
            Ok(row) => (row.get::<_, String>(0), row.get::<_, String>(1)),
            Err(e) => {
                return ConnectionTestResult {
                    success: false,
                    message: format!("Failed to query database info: {}", e),
                    version: Some(version),
                    database: None,
                    user: None,
                    extensions: vec![],
                }
            }
        };

        // Get installed extensions
        let extensions = match client
            .query(
                "SELECT extname FROM pg_extension WHERE extname IN ('ruvector', 'vector', 'pgvector')",
                &[],
            )
            .await
        {
            Ok(rows) => rows.iter().map(|r| r.get::<_, String>(0)).collect(),
            Err(_) => vec![],
        };

        // Step 2: Write - create temp table and insert
        if let Err(e) = client
            .execute(
                "CREATE TEMP TABLE IF NOT EXISTS _connectivity_test (
                    id SERIAL PRIMARY KEY,
                    integration TEXT NOT NULL,
                    tested_at TIMESTAMPTZ DEFAULT NOW()
                )",
                &[],
            )
            .await
        {
            return ConnectionTestResult {
                success: false,
                message: format!("Failed to create temp table: {}", e),
                version: Some(version),
                database: Some(database),
                user: Some(user),
                extensions,
            };
        }

        if let Err(e) = client
            .execute(
                "INSERT INTO _connectivity_test (integration) VALUES ($1)",
                &[&"rust-connectivity-test"],
            )
            .await
        {
            return ConnectionTestResult {
                success: false,
                message: format!("Failed to insert test row: {}", e),
                version: Some(version),
                database: Some(database),
                user: Some(user),
                extensions,
            };
        }

        // Step 3: Read - verify the write
        match client
            .query_one(
                "SELECT * FROM _connectivity_test ORDER BY id DESC LIMIT 1",
                &[],
            )
            .await
        {
            Ok(_) => ConnectionTestResult {
                success: true,
                message: "Connection test passed: connect -> query -> write -> read cycle complete"
                    .to_string(),
                version: Some(version),
                database: Some(database),
                user: Some(user),
                extensions,
            },
            Err(e) => ConnectionTestResult {
                success: false,
                message: format!("Failed to read test row: {}", e),
                version: Some(version),
                database: Some(database),
                user: Some(user),
                extensions,
            },
        }
    }

    /// Get pool statistics
    pub fn pool_stats(&self) -> (usize, usize) {
        (self.pool.status().size, self.pool.status().available)
    }

    /// Get configuration
    pub fn config(&self) -> &DatabaseConfig {
        &self.config
    }
}
