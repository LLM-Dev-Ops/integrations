//! User operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::User;
use serde::{Deserialize, Serialize};

/// Service for user operations.
pub struct UsersService<'a> {
    client: &'a GitHubClient,
}

impl<'a> UsersService<'a> {
    /// Creates a new users service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Gets the authenticated user.
    pub async fn get_authenticated(&self) -> GitHubResult<AuthenticatedUser> {
        self.client.get("/user").await
    }

    /// Gets a user by username.
    pub async fn get(&self, username: &str) -> GitHubResult<User> {
        self.client.get(&format!("/users/{}", username)).await
    }

    /// Updates the authenticated user.
    pub async fn update(&self, request: &UpdateUserRequest) -> GitHubResult<AuthenticatedUser> {
        self.client.patch("/user", request).await
    }

    /// Lists followers of the authenticated user.
    pub async fn list_followers(&self) -> GitHubResult<Vec<User>> {
        self.client.get("/user/followers").await
    }

    /// Lists users the authenticated user follows.
    pub async fn list_following(&self) -> GitHubResult<Vec<User>> {
        self.client.get("/user/following").await
    }

    /// Checks if the authenticated user follows a user.
    pub async fn is_following(&self, username: &str) -> GitHubResult<bool> {
        let response = self
            .client
            .raw_request(
                reqwest::Method::GET,
                &format!("/user/following/{}", username),
                Option::<()>::None,
            )
            .await;

        match response {
            Ok(_) => Ok(true),
            Err(e) if e.status_code() == Some(404) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Follows a user.
    pub async fn follow(&self, username: &str) -> GitHubResult<()> {
        self.client
            .put_no_response(&format!("/user/following/{}", username), &())
            .await
    }

    /// Unfollows a user.
    pub async fn unfollow(&self, username: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!("/user/following/{}", username))
            .await
    }

    // Emails

    /// Lists email addresses for the authenticated user.
    pub async fn list_emails(&self) -> GitHubResult<Vec<Email>> {
        self.client.get("/user/emails").await
    }

    /// Adds email addresses.
    pub async fn add_emails(&self, emails: &[String]) -> GitHubResult<Vec<Email>> {
        let request = EmailsRequest {
            emails: emails.to_vec(),
        };
        self.client.post("/user/emails", &request).await
    }

    /// Deletes email addresses.
    pub async fn delete_emails(&self, emails: &[String]) -> GitHubResult<()> {
        let request = EmailsRequest {
            emails: emails.to_vec(),
        };
        self.client
            .raw_request(reqwest::Method::DELETE, "/user/emails", Some(&request))
            .await?;
        Ok(())
    }

    // SSH Keys

    /// Lists SSH keys for the authenticated user.
    pub async fn list_ssh_keys(&self) -> GitHubResult<Vec<SshKey>> {
        self.client.get("/user/keys").await
    }

    /// Gets an SSH key.
    pub async fn get_ssh_key(&self, key_id: u64) -> GitHubResult<SshKey> {
        self.client.get(&format!("/user/keys/{}", key_id)).await
    }

    /// Creates an SSH key.
    pub async fn create_ssh_key(&self, request: &CreateSshKeyRequest) -> GitHubResult<SshKey> {
        self.client.post("/user/keys", request).await
    }

    /// Deletes an SSH key.
    pub async fn delete_ssh_key(&self, key_id: u64) -> GitHubResult<()> {
        self.client.delete(&format!("/user/keys/{}", key_id)).await
    }

    // GPG Keys

    /// Lists GPG keys for the authenticated user.
    pub async fn list_gpg_keys(&self) -> GitHubResult<Vec<GpgKey>> {
        self.client.get("/user/gpg_keys").await
    }

    /// Gets a GPG key.
    pub async fn get_gpg_key(&self, key_id: u64) -> GitHubResult<GpgKey> {
        self.client
            .get(&format!("/user/gpg_keys/{}", key_id))
            .await
    }

    /// Creates a GPG key.
    pub async fn create_gpg_key(&self, armored_public_key: &str) -> GitHubResult<GpgKey> {
        let request = CreateGpgKeyRequest {
            armored_public_key: armored_public_key.to_string(),
        };
        self.client.post("/user/gpg_keys", &request).await
    }

    /// Deletes a GPG key.
    pub async fn delete_gpg_key(&self, key_id: u64) -> GitHubResult<()> {
        self.client
            .delete(&format!("/user/gpg_keys/{}", key_id))
            .await
    }
}

/// Authenticated user with additional fields.
#[derive(Debug, Clone, Deserialize)]
pub struct AuthenticatedUser {
    /// User ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// Username.
    pub login: String,
    /// Avatar URL.
    pub avatar_url: String,
    /// Name.
    pub name: Option<String>,
    /// Company.
    pub company: Option<String>,
    /// Blog URL.
    pub blog: Option<String>,
    /// Location.
    pub location: Option<String>,
    /// Email.
    pub email: Option<String>,
    /// Bio.
    pub bio: Option<String>,
    /// Twitter username.
    pub twitter_username: Option<String>,
    /// Public repos count.
    pub public_repos: u32,
    /// Public gists count.
    pub public_gists: u32,
    /// Followers count.
    pub followers: u32,
    /// Following count.
    pub following: u32,
    /// HTML URL.
    pub html_url: String,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
    /// Private gists count.
    pub private_gists: Option<u32>,
    /// Total private repos.
    pub total_private_repos: Option<u32>,
    /// Owned private repos.
    pub owned_private_repos: Option<u32>,
    /// Disk usage.
    pub disk_usage: Option<u64>,
    /// Collaborators.
    pub collaborators: Option<u32>,
    /// Two-factor authentication enabled.
    pub two_factor_authentication: Option<bool>,
}

/// Request to update a user.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateUserRequest {
    /// Name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// Blog.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blog: Option<String>,
    /// Twitter username.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twitter_username: Option<String>,
    /// Company.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company: Option<String>,
    /// Location.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// Hireable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hireable: Option<bool>,
    /// Bio.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
}

/// Email address.
#[derive(Debug, Clone, Deserialize)]
pub struct Email {
    /// Email address.
    pub email: String,
    /// Whether primary.
    pub primary: bool,
    /// Whether verified.
    pub verified: bool,
    /// Visibility.
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct EmailsRequest {
    emails: Vec<String>,
}

/// SSH key.
#[derive(Debug, Clone, Deserialize)]
pub struct SshKey {
    /// Key ID.
    pub id: u64,
    /// Key.
    pub key: String,
    /// Title.
    pub title: String,
    /// Created at.
    pub created_at: String,
}

/// Request to create an SSH key.
#[derive(Debug, Clone, Serialize)]
pub struct CreateSshKeyRequest {
    /// Key title.
    pub title: String,
    /// Public key.
    pub key: String,
}

/// GPG key.
#[derive(Debug, Clone, Deserialize)]
pub struct GpgKey {
    /// Key ID.
    pub id: u64,
    /// Key ID (GPG).
    pub key_id: String,
    /// Public key.
    pub public_key: String,
    /// Emails.
    pub emails: Vec<GpgKeyEmail>,
    /// Can sign.
    pub can_sign: bool,
    /// Can encrypt comms.
    pub can_encrypt_comms: bool,
    /// Can encrypt storage.
    pub can_encrypt_storage: bool,
    /// Can certify.
    pub can_certify: bool,
    /// Created at.
    pub created_at: String,
    /// Expires at.
    pub expires_at: Option<String>,
}

/// GPG key email.
#[derive(Debug, Clone, Deserialize)]
pub struct GpgKeyEmail {
    /// Email.
    pub email: String,
    /// Whether verified.
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize)]
struct CreateGpgKeyRequest {
    armored_public_key: String,
}
