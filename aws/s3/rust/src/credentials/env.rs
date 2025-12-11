//! Environment variable credentials provider.

use super::{AwsCredentials, CredentialsProvider};
use crate::error::{CredentialsError, S3Error};
use async_trait::async_trait;
use std::env;

/// Environment variable names for AWS credentials.
pub const AWS_ACCESS_KEY_ID: &str = "AWS_ACCESS_KEY_ID";
pub const AWS_SECRET_ACCESS_KEY: &str = "AWS_SECRET_ACCESS_KEY";
pub const AWS_SESSION_TOKEN: &str = "AWS_SESSION_TOKEN";

/// Credentials provider that reads from environment variables.
///
/// This provider looks for the following environment variables:
/// - `AWS_ACCESS_KEY_ID`: The access key ID
/// - `AWS_SECRET_ACCESS_KEY`: The secret access key
/// - `AWS_SESSION_TOKEN`: Optional session token for temporary credentials
#[derive(Debug, Clone, Default)]
pub struct EnvCredentialsProvider {
    /// Custom access key ID variable name.
    access_key_var: Option<String>,
    /// Custom secret key variable name.
    secret_key_var: Option<String>,
    /// Custom session token variable name.
    session_token_var: Option<String>,
}

impl EnvCredentialsProvider {
    /// Create a new environment credentials provider with default variable names.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a provider with custom variable names.
    pub fn with_vars(
        access_key_var: impl Into<String>,
        secret_key_var: impl Into<String>,
        session_token_var: Option<String>,
    ) -> Self {
        Self {
            access_key_var: Some(access_key_var.into()),
            secret_key_var: Some(secret_key_var.into()),
            session_token_var,
        }
    }

    fn access_key_var(&self) -> &str {
        self.access_key_var
            .as_deref()
            .unwrap_or(AWS_ACCESS_KEY_ID)
    }

    fn secret_key_var(&self) -> &str {
        self.secret_key_var
            .as_deref()
            .unwrap_or(AWS_SECRET_ACCESS_KEY)
    }

    fn session_token_var(&self) -> &str {
        self.session_token_var
            .as_deref()
            .unwrap_or(AWS_SESSION_TOKEN)
    }
}

#[async_trait]
impl CredentialsProvider for EnvCredentialsProvider {
    async fn get_credentials(&self) -> Result<AwsCredentials, S3Error> {
        let access_key_id = env::var(self.access_key_var()).map_err(|_| {
            S3Error::Credentials(CredentialsError::NotFound)
        })?;

        if access_key_id.is_empty() {
            return Err(S3Error::Credentials(CredentialsError::Invalid {
                message: format!("{} is empty", self.access_key_var()),
            }));
        }

        let secret_access_key = env::var(self.secret_key_var()).map_err(|_| {
            S3Error::Credentials(CredentialsError::NotFound)
        })?;

        if secret_access_key.is_empty() {
            return Err(S3Error::Credentials(CredentialsError::Invalid {
                message: format!("{} is empty", self.secret_key_var()),
            }));
        }

        // Session token is optional
        let session_token = env::var(self.session_token_var()).ok().filter(|s| !s.is_empty());

        let credentials = if let Some(token) = session_token {
            AwsCredentials::with_session_token(access_key_id, secret_access_key, token)
        } else {
            AwsCredentials::new(access_key_id, secret_access_key)
        };

        Ok(credentials)
    }

    fn name(&self) -> &'static str {
        "environment"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn with_env_vars<F, R>(vars: &[(&str, &str)], f: F) -> R
    where
        F: FnOnce() -> R,
    {
        // Save original values
        let originals: Vec<_> = vars.iter().map(|(k, _)| (*k, env::var(*k).ok())).collect();

        // Set new values
        for (key, value) in vars {
            env::set_var(key, value);
        }

        let result = f();

        // Restore original values
        for (key, original) in originals {
            match original {
                Some(v) => env::set_var(key, v),
                None => env::remove_var(key),
            }
        }

        result
    }

    fn clear_env_vars<F, R>(vars: &[&str], f: F) -> R
    where
        F: FnOnce() -> R,
    {
        // Save original values
        let originals: Vec<_> = vars.iter().map(|k| (*k, env::var(*k).ok())).collect();

        // Clear variables
        for key in vars {
            env::remove_var(key);
        }

        let result = f();

        // Restore original values
        for (key, original) in originals {
            match original {
                Some(v) => env::set_var(key, v),
                None => env::remove_var(key),
            }
        }

        result
    }

    #[tokio::test]
    async fn test_env_provider_success() {
        with_env_vars(
            &[
                (AWS_ACCESS_KEY_ID, "AKID"),
                (AWS_SECRET_ACCESS_KEY, "SECRET"),
            ],
            || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let provider = EnvCredentialsProvider::new();
                    let result = provider.get_credentials().await;
                    assert!(result.is_ok());
                    let creds = result.unwrap();
                    assert_eq!(creds.access_key_id(), "AKID");
                })
            },
        );
    }

    #[tokio::test]
    async fn test_env_provider_with_session_token() {
        with_env_vars(
            &[
                (AWS_ACCESS_KEY_ID, "AKID"),
                (AWS_SECRET_ACCESS_KEY, "SECRET"),
                (AWS_SESSION_TOKEN, "TOKEN"),
            ],
            || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let provider = EnvCredentialsProvider::new();
                    let result = provider.get_credentials().await;
                    assert!(result.is_ok());
                    let creds = result.unwrap();
                    assert_eq!(creds.session_token(), Some("TOKEN"));
                })
            },
        );
    }

    #[tokio::test]
    async fn test_env_provider_missing_access_key() {
        clear_env_vars(&[AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY], || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let provider = EnvCredentialsProvider::new();
                let result = provider.get_credentials().await;
                assert!(result.is_err());
            })
        });
    }

    #[tokio::test]
    async fn test_env_provider_empty_access_key() {
        with_env_vars(
            &[
                (AWS_ACCESS_KEY_ID, ""),
                (AWS_SECRET_ACCESS_KEY, "SECRET"),
            ],
            || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let provider = EnvCredentialsProvider::new();
                    let result = provider.get_credentials().await;
                    assert!(result.is_err());
                })
            },
        );
    }

    #[tokio::test]
    async fn test_env_provider_custom_vars() {
        with_env_vars(
            &[
                ("MY_ACCESS_KEY", "CUSTOM_AKID"),
                ("MY_SECRET_KEY", "CUSTOM_SECRET"),
            ],
            || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let provider = EnvCredentialsProvider::with_vars(
                        "MY_ACCESS_KEY",
                        "MY_SECRET_KEY",
                        None,
                    );
                    let result = provider.get_credentials().await;
                    assert!(result.is_ok());
                    let creds = result.unwrap();
                    assert_eq!(creds.access_key_id(), "CUSTOM_AKID");
                })
            },
        );
    }
}
