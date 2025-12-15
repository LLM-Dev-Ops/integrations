//! AWS credentials management for Bedrock.
//!
//! This module provides credential providers following the standard AWS credential chain.
//! It reuses patterns from the shared aws/s3 credentials implementation.

use crate::error::{BedrockError, CredentialsError};
use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, trace};

/// AWS credentials.
#[derive(Debug, Clone)]
pub struct AwsCredentials {
    access_key_id: String,
    secret_access_key: String,
    session_token: Option<String>,
    expiration: Option<DateTime<Utc>>,
}

impl AwsCredentials {
    /// Create new long-term credentials.
    pub fn new(access_key_id: impl Into<String>, secret_access_key: impl Into<String>) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: secret_access_key.into(),
            session_token: None,
            expiration: None,
        }
    }

    /// Create credentials with session token.
    pub fn with_session_token(
        access_key_id: impl Into<String>,
        secret_access_key: impl Into<String>,
        session_token: impl Into<String>,
    ) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: secret_access_key.into(),
            session_token: Some(session_token.into()),
            expiration: None,
        }
    }

    /// Create temporary credentials with expiration.
    pub fn temporary(
        access_key_id: impl Into<String>,
        secret_access_key: impl Into<String>,
        session_token: impl Into<String>,
        expiration: DateTime<Utc>,
    ) -> Self {
        Self {
            access_key_id: access_key_id.into(),
            secret_access_key: secret_access_key.into(),
            session_token: Some(session_token.into()),
            expiration: Some(expiration),
        }
    }

    /// Get the access key ID.
    pub fn access_key_id(&self) -> &str {
        &self.access_key_id
    }

    /// Get the secret access key.
    pub fn secret_access_key(&self) -> &str {
        &self.secret_access_key
    }

    /// Get the session token if present.
    pub fn session_token(&self) -> Option<&str> {
        self.session_token.as_deref()
    }

    /// Get the expiration time if present.
    pub fn expiration(&self) -> Option<DateTime<Utc>> {
        self.expiration
    }

    /// Check if credentials are expired.
    pub fn is_expired(&self) -> bool {
        self.expiration
            .map(|exp| exp <= Utc::now())
            .unwrap_or(false)
    }

    /// Check if credentials will expire within the given duration.
    pub fn will_expire_within(&self, duration: Duration) -> bool {
        self.expiration
            .map(|exp| exp <= Utc::now() + duration)
            .unwrap_or(false)
    }
}

/// Trait for credential providers.
#[async_trait]
pub trait CredentialsProvider: Send + Sync {
    /// Get credentials.
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError>;

    /// Refresh credentials (force reload).
    async fn refresh_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        self.get_credentials().await
    }

    /// Provider name for debugging.
    fn name(&self) -> &'static str;
}

/// Static credentials provider.
pub struct StaticCredentialsProvider {
    credentials: AwsCredentials,
}

impl StaticCredentialsProvider {
    /// Create a new static credentials provider.
    pub fn new(credentials: AwsCredentials) -> Self {
        Self { credentials }
    }
}

#[async_trait]
impl CredentialsProvider for StaticCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        if self.credentials.is_expired() {
            return Err(BedrockError::Credentials(CredentialsError::Expired {
                expiration: self
                    .credentials
                    .expiration()
                    .map(|e| e.to_rfc3339())
                    .unwrap_or_default(),
            }));
        }
        Ok(self.credentials.clone())
    }

    fn name(&self) -> &'static str {
        "static"
    }
}

/// Environment credentials provider.
pub struct EnvCredentialsProvider;

impl EnvCredentialsProvider {
    /// Create a new environment credentials provider.
    pub fn new() -> Self {
        Self
    }
}

impl Default for EnvCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for EnvCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        let access_key = std::env::var("AWS_ACCESS_KEY_ID")
            .map_err(|_| BedrockError::Credentials(CredentialsError::NotFound))?;

        let secret_key = std::env::var("AWS_SECRET_ACCESS_KEY")
            .map_err(|_| BedrockError::Credentials(CredentialsError::NotFound))?;

        let session_token = std::env::var("AWS_SESSION_TOKEN").ok();

        if let Some(token) = session_token {
            Ok(AwsCredentials::with_session_token(
                access_key,
                secret_key,
                token,
            ))
        } else {
            Ok(AwsCredentials::new(access_key, secret_key))
        }
    }

    fn name(&self) -> &'static str {
        "environment"
    }
}

/// Profile credentials provider (reads from ~/.aws/credentials).
pub struct ProfileCredentialsProvider {
    profile: String,
}

impl ProfileCredentialsProvider {
    /// Create a new profile credentials provider with the default profile.
    pub fn new() -> Self {
        Self {
            profile: std::env::var("AWS_PROFILE").unwrap_or_else(|_| "default".to_string()),
        }
    }

    /// Create with a specific profile name.
    pub fn with_profile(profile: impl Into<String>) -> Self {
        Self {
            profile: profile.into(),
        }
    }

    fn credentials_path() -> Option<std::path::PathBuf> {
        if let Ok(path) = std::env::var("AWS_SHARED_CREDENTIALS_FILE") {
            return Some(std::path::PathBuf::from(path));
        }
        dirs::home_dir().map(|h| h.join(".aws").join("credentials"))
    }
}

impl Default for ProfileCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for ProfileCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        let path = Self::credentials_path()
            .ok_or_else(|| BedrockError::Credentials(CredentialsError::NotFound))?;

        if !path.exists() {
            return Err(BedrockError::Credentials(CredentialsError::NotFound));
        }

        let content = std::fs::read_to_string(&path).map_err(|e| {
            BedrockError::Credentials(CredentialsError::Invalid {
                message: format!("Failed to read credentials file: {}", e),
            })
        })?;

        self.parse_credentials(&content)
    }

    fn name(&self) -> &'static str {
        "profile"
    }
}

impl ProfileCredentialsProvider {
    fn parse_credentials(&self, content: &str) -> Result<AwsCredentials, BedrockError> {
        let mut in_profile = false;
        let mut access_key: Option<String> = None;
        let mut secret_key: Option<String> = None;
        let mut session_token: Option<String> = None;

        let profile_header = format!("[{}]", self.profile);

        for line in content.lines() {
            let line = line.trim();

            if line.starts_with('[') {
                in_profile = line == profile_header;
                continue;
            }

            if in_profile {
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();

                    match key {
                        "aws_access_key_id" => access_key = Some(value.to_string()),
                        "aws_secret_access_key" => secret_key = Some(value.to_string()),
                        "aws_session_token" => session_token = Some(value.to_string()),
                        _ => {}
                    }
                }
            }
        }

        match (access_key, secret_key) {
            (Some(ak), Some(sk)) => {
                if let Some(token) = session_token {
                    Ok(AwsCredentials::with_session_token(ak, sk, token))
                } else {
                    Ok(AwsCredentials::new(ak, sk))
                }
            }
            _ => Err(BedrockError::Credentials(CredentialsError::NotFound)),
        }
    }
}

/// Chained credentials provider that tries multiple sources.
pub struct ChainCredentialsProvider {
    providers: Vec<Arc<dyn CredentialsProvider>>,
    cached: RwLock<Option<CachedCredentials>>,
    refresh_buffer_seconds: i64,
}

struct CachedCredentials {
    credentials: AwsCredentials,
    provider_name: &'static str,
}

impl ChainCredentialsProvider {
    /// Create a new chain with default providers.
    pub fn new() -> Self {
        Self {
            providers: vec![
                Arc::new(EnvCredentialsProvider::new()),
                Arc::new(ProfileCredentialsProvider::new()),
            ],
            cached: RwLock::new(None),
            refresh_buffer_seconds: 300, // 5 minutes
        }
    }

    /// Create a chain with custom providers.
    pub fn with_providers(providers: Vec<Arc<dyn CredentialsProvider>>) -> Self {
        Self {
            providers,
            cached: RwLock::new(None),
            refresh_buffer_seconds: 300,
        }
    }

    /// Set the refresh buffer (seconds before expiration to refresh).
    pub fn with_refresh_buffer(mut self, seconds: i64) -> Self {
        self.refresh_buffer_seconds = seconds;
        self
    }

    /// Add a provider to the chain.
    pub fn add_provider(mut self, provider: Arc<dyn CredentialsProvider>) -> Self {
        self.providers.push(provider);
        self
    }

    fn should_refresh(&self, creds: &AwsCredentials) -> bool {
        if creds.is_expired() {
            return true;
        }
        creds.will_expire_within(Duration::seconds(self.refresh_buffer_seconds))
    }

    async fn try_providers(&self) -> Result<(AwsCredentials, &'static str), BedrockError> {
        let mut last_error: Option<BedrockError> = None;

        for provider in &self.providers {
            let name = provider.name();
            trace!("Trying credentials provider: {}", name);

            match provider.get_credentials().await {
                Ok(creds) => {
                    debug!("Credentials loaded from provider: {}", name);
                    return Ok((creds, name));
                }
                Err(e) => {
                    trace!("Provider {} failed: {:?}", name, e);
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| BedrockError::Credentials(CredentialsError::NotFound)))
    }
}

impl Default for ChainCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for ChainCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        // Check cache first
        {
            let cache = self.cached.read();
            if let Some(cached) = cache.as_ref() {
                if !self.should_refresh(&cached.credentials) {
                    trace!(
                        "Using cached credentials from provider: {}",
                        cached.provider_name
                    );
                    return Ok(cached.credentials.clone());
                }
            }
        }

        // Need to refresh
        let (creds, name) = self.try_providers().await?;

        // Update cache
        {
            let mut cache = self.cached.write();
            *cache = Some(CachedCredentials {
                credentials: creds.clone(),
                provider_name: name,
            });
        }

        Ok(creds)
    }

    async fn refresh_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        // Clear cache and get fresh credentials
        {
            let mut cache = self.cached.write();
            *cache = None;
        }
        self.get_credentials().await
    }

    fn name(&self) -> &'static str {
        "chain"
    }
}

impl std::fmt::Debug for ChainCredentialsProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChainCredentialsProvider")
            .field(
                "providers",
                &self.providers.iter().map(|p| p.name()).collect::<Vec<_>>(),
            )
            .field("refresh_buffer_seconds", &self.refresh_buffer_seconds)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credentials_new() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        assert_eq!(creds.access_key_id(), "AKID");
        assert_eq!(creds.secret_access_key(), "SECRET");
        assert!(creds.session_token().is_none());
        assert!(!creds.is_expired());
    }

    #[test]
    fn test_credentials_with_token() {
        let creds = AwsCredentials::with_session_token("AKID", "SECRET", "TOKEN");
        assert_eq!(creds.session_token(), Some("TOKEN"));
    }

    #[test]
    fn test_credentials_expired() {
        let past = Utc::now() - Duration::hours(1);
        let creds = AwsCredentials::temporary("AKID", "SECRET", "TOKEN", past);
        assert!(creds.is_expired());
    }

    #[test]
    fn test_credentials_will_expire_within() {
        let soon = Utc::now() + Duration::minutes(2);
        let creds = AwsCredentials::temporary("AKID", "SECRET", "TOKEN", soon);
        assert!(creds.will_expire_within(Duration::minutes(5)));
        assert!(!creds.will_expire_within(Duration::seconds(30)));
    }

    #[tokio::test]
    async fn test_static_provider() {
        let creds = AwsCredentials::new("AKID", "SECRET");
        let provider = StaticCredentialsProvider::new(creds);

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().access_key_id(), "AKID");
    }

    #[test]
    fn test_profile_parse() {
        let provider = ProfileCredentialsProvider::new();
        let content = r#"
[default]
aws_access_key_id = AKID123
aws_secret_access_key = SECRET456

[other]
aws_access_key_id = OTHER
aws_secret_access_key = KEY
"#;

        let result = provider.parse_credentials(content);
        assert!(result.is_ok());
        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKID123");
        assert_eq!(creds.secret_access_key(), "SECRET456");
    }
}
