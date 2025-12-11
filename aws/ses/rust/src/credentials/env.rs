//! Environment variable credentials provider.

use super::{AwsCredentials, CredentialProvider};
use crate::credentials::error::CredentialError;
use async_trait::async_trait;
use std::env;

/// Environment variable names for AWS credentials.
pub const AWS_ACCESS_KEY_ID: &str = "AWS_ACCESS_KEY_ID";
pub const AWS_SECRET_ACCESS_KEY: &str = "AWS_SECRET_ACCESS_KEY";
pub const AWS_SESSION_TOKEN: &str = "AWS_SESSION_TOKEN";
pub const AWS_PROFILE: &str = "AWS_PROFILE";

/// Credentials provider that reads from environment variables.
///
/// This provider looks for the following environment variables:
/// - `AWS_ACCESS_KEY_ID`: The access key ID (required)
/// - `AWS_SECRET_ACCESS_KEY`: The secret access key (required)
/// - `AWS_SESSION_TOKEN`: Optional session token for temporary credentials
/// - `AWS_PROFILE`: Optional profile name (used by other providers)
///
/// # Example
///
/// ```no_run
/// use aws_ses_rust::credentials::EnvironmentCredentialProvider;
///
/// # async {
/// let provider = EnvironmentCredentialProvider::new();
/// let credentials = provider.credentials().await?;
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// # };
/// ```
#[derive(Debug, Clone, Default)]
pub struct EnvironmentCredentialProvider;

impl EnvironmentCredentialProvider {
    /// Create a new environment credentials provider.
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CredentialProvider for EnvironmentCredentialProvider {
    async fn credentials(&self) -> Result<AwsCredentials, CredentialError> {
        let access_key_id = env::var(AWS_ACCESS_KEY_ID).map_err(|_| CredentialError::Missing {
            message: format!("{} environment variable not set", AWS_ACCESS_KEY_ID),
        })?;

        if access_key_id.is_empty() {
            return Err(CredentialError::Invalid {
                message: format!("{} is empty", AWS_ACCESS_KEY_ID),
            });
        }

        let secret_access_key =
            env::var(AWS_SECRET_ACCESS_KEY).map_err(|_| CredentialError::Missing {
                message: format!("{} environment variable not set", AWS_SECRET_ACCESS_KEY),
            })?;

        if secret_access_key.is_empty() {
            return Err(CredentialError::Invalid {
                message: format!("{} is empty", AWS_SECRET_ACCESS_KEY),
            });
        }

        // Session token is optional
        let session_token = env::var(AWS_SESSION_TOKEN).ok().filter(|s| !s.is_empty());

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
                None => {}
            }
        }

        result
    }

    #[tokio::test]
    async fn test_env_provider_success() {
        with_env_vars(
            &[
                (AWS_ACCESS_KEY_ID, "AKIAIOSFODNN7EXAMPLE"),
                (AWS_SECRET_ACCESS_KEY, "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
            ],
            || async {
                let provider = EnvironmentCredentialProvider::new();
                let result = provider.credentials().await;
                assert!(result.is_ok());

                let creds = result.unwrap();
                assert_eq!(creds.access_key_id(), "AKIAIOSFODNN7EXAMPLE");
                assert_eq!(
                    creds.secret_access_key(),
                    "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                );
                assert!(creds.session_token().is_none());
            },
        )
        .await;
    }

    #[tokio::test]
    async fn test_env_provider_with_session_token() {
        with_env_vars(
            &[
                (AWS_ACCESS_KEY_ID, "AKID"),
                (AWS_SECRET_ACCESS_KEY, "SECRET"),
                (AWS_SESSION_TOKEN, "TOKEN"),
            ],
            || async {
                let provider = EnvironmentCredentialProvider::new();
                let result = provider.credentials().await;
                assert!(result.is_ok());

                let creds = result.unwrap();
                assert_eq!(creds.session_token(), Some("TOKEN"));
            },
        )
        .await;
    }

    #[tokio::test]
    async fn test_env_provider_missing_access_key() {
        clear_env_vars(&[AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY], || async {
            let provider = EnvironmentCredentialProvider::new();
            let result = provider.credentials().await;
            assert!(result.is_err());
            assert!(matches!(result.unwrap_err(), CredentialError::Missing { .. }));
        })
        .await;
    }

    #[tokio::test]
    async fn test_env_provider_missing_secret_key() {
        with_env_vars(&[(AWS_ACCESS_KEY_ID, "AKID")], || async {
            clear_env_vars(&[AWS_SECRET_ACCESS_KEY], || async {
                let provider = EnvironmentCredentialProvider::new();
                let result = provider.credentials().await;
                assert!(result.is_err());
                assert!(matches!(result.unwrap_err(), CredentialError::Missing { .. }));
            })
            .await
        })
        .await;
    }

    #[tokio::test]
    async fn test_env_provider_empty_access_key() {
        with_env_vars(
            &[(AWS_ACCESS_KEY_ID, ""), (AWS_SECRET_ACCESS_KEY, "SECRET")],
            || async {
                let provider = EnvironmentCredentialProvider::new();
                let result = provider.credentials().await;
                assert!(result.is_err());
                assert!(matches!(result.unwrap_err(), CredentialError::Invalid { .. }));
            },
        )
        .await;
    }

    #[tokio::test]
    async fn test_env_provider_empty_secret_key() {
        with_env_vars(
            &[(AWS_ACCESS_KEY_ID, "AKID"), (AWS_SECRET_ACCESS_KEY, "")],
            || async {
                let provider = EnvironmentCredentialProvider::new();
                let result = provider.credentials().await;
                assert!(result.is_err());
                assert!(matches!(result.unwrap_err(), CredentialError::Invalid { .. }));
            },
        )
        .await;
    }
}
