//! AWS profile file credentials provider.

use super::{AwsCredentials, CredentialProvider};
use crate::credentials::error::CredentialError;
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

/// AWS config file environment variable.
pub const AWS_CONFIG_FILE: &str = "AWS_CONFIG_FILE";

/// Credentials provider that reads from AWS profile files.
///
/// This provider reads credentials from:
/// - `~/.aws/credentials` (or path in `AWS_SHARED_CREDENTIALS_FILE`)
/// - `~/.aws/config` (or path in `AWS_CONFIG_FILE`)
///
/// The profile is determined by:
/// - Constructor parameter
/// - `AWS_PROFILE` environment variable
/// - Falls back to "default"
///
/// # Supported Fields
///
/// - `aws_access_key_id` - Access key ID (required)
/// - `aws_secret_access_key` - Secret access key (required)
/// - `aws_session_token` - Session token (optional, for temporary credentials)
/// - `source_profile` - Name of profile to use as source for role assumption chains
///
/// # Example
///
/// ```no_run
/// use aws_ses_rust::credentials::ProfileCredentialProvider;
///
/// # async {
/// // Use default profile
/// let provider = ProfileCredentialProvider::new();
/// let credentials = provider.credentials().await?;
///
/// // Use specific profile
/// let provider = ProfileCredentialProvider::with_profile("production");
/// let credentials = provider.credentials().await?;
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// # };
/// ```
#[derive(Debug, Clone)]
pub struct ProfileCredentialProvider {
    /// Profile name to use.
    profile_name: String,
    /// Custom credentials file path.
    credentials_path: Option<PathBuf>,
    /// Custom config file path.
    config_path: Option<PathBuf>,
}

impl ProfileCredentialProvider {
    /// Create a new provider using the default profile or `AWS_PROFILE`.
    pub fn new() -> Self {
        let profile = env::var(AWS_PROFILE).unwrap_or_else(|_| DEFAULT_PROFILE.to_string());
        Self {
            profile_name: profile,
            credentials_path: None,
            config_path: None,
        }
    }

    /// Create a provider for a specific profile.
    ///
    /// # Arguments
    ///
    /// * `profile_name` - Name of the profile to use
    pub fn with_profile(profile_name: impl Into<String>) -> Self {
        Self {
            profile_name: profile_name.into(),
            credentials_path: None,
            config_path: None,
        }
    }

    /// Set a custom credentials file path.
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the credentials file
    pub fn with_credentials_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.credentials_path = Some(path.into());
        self
    }

    /// Set a custom config file path.
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the config file
    pub fn with_config_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.config_path = Some(path.into());
        self
    }

    fn credentials_file_path(&self) -> PathBuf {
        if let Some(path) = &self.credentials_path {
            return path.clone();
        }

        if let Ok(path) = env::var(AWS_SHARED_CREDENTIALS_FILE) {
            return PathBuf::from(path);
        }

        // Default to ~/.aws/credentials
        dirs::home_dir()
            .map(|home| home.join(".aws").join("credentials"))
            .unwrap_or_else(|| PathBuf::from("~/.aws/credentials"))
    }

    fn config_file_path(&self) -> PathBuf {
        if let Some(path) = &self.config_path {
            return path.clone();
        }

        if let Ok(path) = env::var(AWS_CONFIG_FILE) {
            return PathBuf::from(path);
        }

        // Default to ~/.aws/config
        dirs::home_dir()
            .map(|home| home.join(".aws").join("config"))
            .unwrap_or_else(|| PathBuf::from("~/.aws/config"))
    }

    fn parse_profile_file(content: &str) -> HashMap<String, HashMap<String, String>> {
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

    fn load_profile(&self) -> Result<HashMap<String, String>, CredentialError> {
        let mut profile_data = HashMap::new();

        // Try to load from credentials file first
        let credentials_path = self.credentials_file_path();
        if let Ok(content) = fs::read_to_string(&credentials_path) {
            let profiles = Self::parse_profile_file(&content);
            if let Some(data) = profiles.get(&self.profile_name) {
                profile_data.extend(data.clone());
            }
        }

        // Try to load from config file (can override or supplement credentials file)
        let config_path = self.config_file_path();
        if let Ok(content) = fs::read_to_string(&config_path) {
            let profiles = Self::parse_profile_file(&content);
            if let Some(data) = profiles.get(&self.profile_name) {
                profile_data.extend(data.clone());
            }
        }

        if profile_data.is_empty() {
            return Err(CredentialError::ProfileError {
                message: format!(
                    "Profile '{}' not found in {} or {}",
                    self.profile_name,
                    credentials_path.display(),
                    config_path.display()
                ),
            });
        }

        Ok(profile_data)
    }
}

impl Default for ProfileCredentialProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CredentialProvider for ProfileCredentialProvider {
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        let profile = self.load_profile()?;

        // Handle source_profile for role assumption chains
        if let Some(source_profile) = profile.get("source_profile") {
            // For now, recursively load the source profile
            let source_provider = ProfileCredentialProvider::with_profile(source_profile);
            return source_provider.credentials().await;
        }

        let access_key_id = profile.get("aws_access_key_id").ok_or_else(|| {
            CredentialError::ProfileError {
                message: format!(
                    "aws_access_key_id not found in profile '{}'",
                    self.profile_name
                ),
            }
        })?;

        let secret_access_key = profile.get("aws_secret_access_key").ok_or_else(|| {
            CredentialError::ProfileError {
                message: format!(
                    "aws_secret_access_key not found in profile '{}'",
                    self.profile_name
                ),
            }
        })?;

        let session_token = profile.get("aws_session_token");

        let credentials = AwsCredentials::new(access_key_id, secret_access_key);

        let credentials = if let Some(token) = session_token {
            credentials.with_session_token(token)
        } else {
            credentials
        };

        Ok(credentials)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_temp_file(content: &str) -> NamedTempFile {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    #[test]
    fn test_parse_profile_file() {
        let content = r#"
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[production]
aws_access_key_id = AKIAPROD
aws_secret_access_key = secretprod
aws_session_token = tokenprod
"#;

        let profiles = ProfileCredentialProvider::parse_profile_file(content);

        assert_eq!(profiles.len(), 2);

        let default = profiles.get("default").unwrap();
        assert_eq!(
            default.get("aws_access_key_id").unwrap(),
            "AKIAIOSFODNN7EXAMPLE"
        );
        assert_eq!(
            default.get("aws_secret_access_key").unwrap(),
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        );

        let prod = profiles.get("production").unwrap();
        assert_eq!(prod.get("aws_access_key_id").unwrap(), "AKIAPROD");
        assert_eq!(prod.get("aws_session_token").unwrap(), "tokenprod");
    }

    #[test]
    fn test_parse_profile_file_with_profile_prefix() {
        let content = r#"
[profile development]
aws_access_key_id = AKIADEV
aws_secret_access_key = secretdev
"#;

        let profiles = ProfileCredentialProvider::parse_profile_file(content);
        assert!(profiles.contains_key("development"));

        let dev = profiles.get("development").unwrap();
        assert_eq!(dev.get("aws_access_key_id").unwrap(), "AKIADEV");
    }

    #[test]
    fn test_parse_profile_file_with_comments() {
        let content = r#"
# This is a comment
[default]
; This is also a comment
aws_access_key_id = AKID
aws_secret_access_key = SECRET
"#;

        let profiles = ProfileCredentialProvider::parse_profile_file(content);
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

        let file = create_temp_file(content);
        let provider = ProfileCredentialProvider::new().with_credentials_path(file.path());

        let result = provider.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKIATEST");
        assert_eq!(creds.secret_access_key(), "secrettest");
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

        let file = create_temp_file(content);
        let provider =
            ProfileCredentialProvider::with_profile("production").with_credentials_path(file.path());

        let result = provider.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKIAPROD");
    }

    #[tokio::test]
    async fn test_profile_provider_with_session_token() {
        let content = r#"
[default]
aws_access_key_id = AKIATEST
aws_secret_access_key = secrettest
aws_session_token = tokentest
"#;

        let file = create_temp_file(content);
        let provider = ProfileCredentialProvider::new().with_credentials_path(file.path());

        let result = provider.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        assert_eq!(creds.session_token(), Some("tokentest"));
    }

    #[tokio::test]
    async fn test_profile_provider_missing_profile() {
        let content = r#"
[default]
aws_access_key_id = AKIADEFAULT
aws_secret_access_key = secretdefault
"#;

        let file = create_temp_file(content);
        let provider =
            ProfileCredentialProvider::with_profile("nonexistent").with_credentials_path(file.path());

        let result = provider.credentials().await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            CredentialError::ProfileError { .. }
        ));
    }

    #[tokio::test]
    async fn test_profile_provider_missing_access_key() {
        let content = r#"
[default]
aws_secret_access_key = secrettest
"#;

        let file = create_temp_file(content);
        let provider = ProfileCredentialProvider::new().with_credentials_path(file.path());

        let result = provider.credentials().await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            CredentialError::ProfileError { .. }
        ));
    }

    #[tokio::test]
    async fn test_profile_provider_source_profile() {
        let content = r#"
[base]
aws_access_key_id = AKIABASE
aws_secret_access_key = secretbase

[derived]
source_profile = base
"#;

        let file = create_temp_file(content);
        let provider =
            ProfileCredentialProvider::with_profile("derived").with_credentials_path(file.path());

        let result = provider.credentials().await;
        assert!(result.is_ok());

        let creds = result.unwrap();
        assert_eq!(creds.access_key_id(), "AKIABASE");
    }
}
