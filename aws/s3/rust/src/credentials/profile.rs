//! AWS profile credentials provider.

use super::{AwsCredentials, CredentialsProvider};
use crate::error::{CredentialsError, S3Error};
use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;
use std::{env, fs};

/// Default profile name.
pub const DEFAULT_PROFILE: &str = "default";

/// AWS profile name environment variable.
pub const AWS_PROFILE: &str = "AWS_PROFILE";

/// AWS credentials file environment variable.
pub const AWS_SHARED_CREDENTIALS_FILE: &str = "AWS_SHARED_CREDENTIALS_FILE";

/// Credentials provider that reads from AWS profile files.
///
/// This provider looks for credentials in:
/// - `~/.aws/credentials` (or `AWS_SHARED_CREDENTIALS_FILE`)
///
/// The profile is determined by:
/// - Constructor parameter
/// - `AWS_PROFILE` environment variable
/// - Falls back to "default"
#[derive(Debug, Clone)]
pub struct ProfileCredentialsProvider {
    /// Profile name to use.
    profile_name: String,
    /// Custom credentials file path.
    credentials_file: Option<PathBuf>,
}

impl ProfileCredentialsProvider {
    /// Create a new provider using the default profile or `AWS_PROFILE`.
    pub fn new() -> Self {
        let profile = env::var(AWS_PROFILE).unwrap_or_else(|_| DEFAULT_PROFILE.to_string());
        Self {
            profile_name: profile,
            credentials_file: None,
        }
    }

    /// Create a provider for a specific profile.
    pub fn with_profile(profile_name: impl Into<String>) -> Self {
        Self {
            profile_name: profile_name.into(),
            credentials_file: None,
        }
    }

    /// Create a provider with a custom credentials file path.
    pub fn with_credentials_file(mut self, path: impl Into<PathBuf>) -> Self {
        self.credentials_file = Some(path.into());
        self
    }

    fn credentials_file_path(&self) -> PathBuf {
        if let Some(path) = &self.credentials_file {
            return path.clone();
        }

        if let Ok(path) = env::var(AWS_SHARED_CREDENTIALS_FILE) {
            return PathBuf::from(path);
        }

        // Default to ~/.aws/credentials
        dirs::home_dir()
            .map(|home| home.join(".aws").join("credentials"))
            .unwrap_or_else(|| PathBuf::from("/root/.aws/credentials"))
    }

    fn parse_credentials_file(
        content: &str,
    ) -> HashMap<String, HashMap<String, String>> {
        let mut profiles: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut current_profile: Option<String> = None;

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
                continue;
            }

            // Check for profile header
            if line.starts_with('[') && line.ends_with(']') {
                let profile_name = line[1..line.len() - 1].trim();
                // Remove "profile " prefix if present (from config file format)
                let profile_name = profile_name
                    .strip_prefix("profile ")
                    .unwrap_or(profile_name);
                current_profile = Some(profile_name.to_string());
                profiles.entry(profile_name.to_string()).or_default();
                continue;
            }

            // Parse key=value pairs
            if let Some(profile) = &current_profile {
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim().to_string();
                    let value = value.trim().to_string();
                    profiles
                        .entry(profile.clone())
                        .or_default()
                        .insert(key, value);
                }
            }
        }

        profiles
    }
}

impl Default for ProfileCredentialsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialsProvider for ProfileCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
        let path = self.credentials_file_path();

        let content = fs::read_to_string(&path).map_err(|e| {
            S3Error::Credentials(CredentialsError::ProfileError {
                message: format!(
                    "Failed to read credentials file at {:?}: {}",
                    path, e
                ),
            })
        })?;

        let profiles = Self::parse_credentials_file(&content);

        let profile = profiles.get(&self.profile_name).ok_or_else(|| {
            S3Error::Credentials(CredentialsError::ProfileError {
                message: format!("Profile '{}' not found in credentials file", self.profile_name),
            })
        })?;

        let access_key_id = profile.get("aws_access_key_id").ok_or_else(|| {
            S3Error::Credentials(CredentialsError::ProfileError {
                message: format!(
                    "aws_access_key_id not found in profile '{}'",
                    self.profile_name
                ),
            })
        })?;

        let secret_access_key = profile.get("aws_secret_access_key").ok_or_else(|| {
            S3Error::Credentials(CredentialsError::ProfileError {
                message: format!(
                    "aws_secret_access_key not found in profile '{}'",
                    self.profile_name
                ),
            })
        })?;

        let session_token = profile.get("aws_session_token");

        let credentials = if let Some(token) = session_token {
            AwsCredentials::with_session_token(access_key_id, secret_access_key, token)
        } else {
            AwsCredentials::new(access_key_id, secret_access_key)
        };

        Ok(credentials)
    }

    fn name(&self) -> &'static str {
        "profile"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    fn create_temp_credentials_file(content: &str) -> NamedTempFile {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    #[test]
    fn test_parse_credentials_file() {
        let content = r#"
[default]
aws_access_key_id = AKIADEFAULT
aws_secret_access_key = secretdefault

[production]
aws_access_key_id = AKIAPROD
aws_secret_access_key = secretprod
aws_session_token = tokenprod
"#;

        let profiles = ProfileCredentialsProvider::parse_credentials_file(content);

        assert_eq!(profiles.len(), 2);

        let default = profiles.get("default").unwrap();
        assert_eq!(default.get("aws_access_key_id").unwrap(), "AKIADEFAULT");
        assert_eq!(default.get("aws_secret_access_key").unwrap(), "secretdefault");

        let prod = profiles.get("production").unwrap();
        assert_eq!(prod.get("aws_access_key_id").unwrap(), "AKIAPROD");
        assert_eq!(prod.get("aws_session_token").unwrap(), "tokenprod");
    }

    #[test]
    fn test_parse_credentials_with_comments() {
        let content = r#"
# This is a comment
[default]
; This is also a comment
aws_access_key_id = AKID
aws_secret_access_key = SECRET
"#;

        let profiles = ProfileCredentialsProvider::parse_credentials_file(content);
        let default = profiles.get("default").unwrap();
        assert_eq!(default.get("aws_access_key_id").unwrap(), "AKID");
    }

    #[tokio::test]
    async fn test_profile_provider_success() {
        let content = r#"
[default]
aws_access_key_id = AKIATEST
aws_secret_access_key = secrettest
"#;

        let file = create_temp_credentials_file(content);
        let provider = ProfileCredentialsProvider::new()
            .with_credentials_file(file.path());

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKIATEST");
    }

    #[tokio::test]
    async fn test_profile_provider_specific_profile() {
        let content = r#"
[default]
aws_access_key_id = AKIADEFAULT
aws_secret_access_key = secretdefault

[production]
aws_access_key_id = AKIAPROD
aws_secret_access_key = secretprod
"#;

        let file = create_temp_credentials_file(content);
        let provider = ProfileCredentialsProvider::with_profile("production")
            .with_credentials_file(file.path());

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKIAPROD");
    }

    #[tokio::test]
    async fn test_profile_provider_missing_profile() {
        let content = r#"
[default]
aws_access_key_id = AKIADEFAULT
aws_secret_access_key = secretdefault
"#;

        let file = create_temp_credentials_file(content);
        let provider = ProfileCredentialsProvider::with_profile("nonexistent")
            .with_credentials_file(file.path());

        let result = provider.get_credentials().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_profile_provider_missing_key() {
        let content = r#"
[default]
aws_access_key_id = AKIATEST
"#;

        let file = create_temp_credentials_file(content);
        let provider = ProfileCredentialsProvider::new()
            .with_credentials_file(file.path());

        let result = provider.get_credentials().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_profile_provider_with_session_token() {
        let content = r#"
[default]
aws_access_key_id = AKIATEST
aws_secret_access_key = secrettest
aws_session_token = tokentest
"#;

        let file = create_temp_credentials_file(content);
        let provider = ProfileCredentialsProvider::new()
            .with_credentials_file(file.path());

        let result = provider.get_credentials().await;
        assert!(result.is_ok());
        let creds = result.unwrap();
        assert_eq!(creds.session_token(), Some("tokentest"));
    }
}
