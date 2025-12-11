//! Git Data operations (blobs, trees, commits, references, tags).

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use serde::{Deserialize, Serialize};

/// Service for Git Data operations.
pub struct GitDataService<'a> {
    client: &'a GitHubClient,
}

impl<'a> GitDataService<'a> {
    /// Creates a new Git Data service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    // Blob operations

    /// Gets a blob.
    pub async fn get_blob(&self, owner: &str, repo: &str, sha: &str) -> GitHubResult<Blob> {
        self.client
            .get(&format!("/repos/{}/{}/git/blobs/{}", owner, repo, sha))
            .await
    }

    /// Creates a blob.
    pub async fn create_blob(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateBlobRequest,
    ) -> GitHubResult<BlobReference> {
        self.client
            .post(&format!("/repos/{}/{}/git/blobs", owner, repo), request)
            .await
    }

    // Tree operations

    /// Gets a tree.
    pub async fn get_tree(
        &self,
        owner: &str,
        repo: &str,
        sha: &str,
        recursive: bool,
    ) -> GitHubResult<Tree> {
        let path = if recursive {
            format!("/repos/{}/{}/git/trees/{}?recursive=1", owner, repo, sha)
        } else {
            format!("/repos/{}/{}/git/trees/{}", owner, repo, sha)
        };
        self.client.get(&path).await
    }

    /// Creates a tree.
    pub async fn create_tree(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateTreeRequest,
    ) -> GitHubResult<Tree> {
        self.client
            .post(&format!("/repos/{}/{}/git/trees", owner, repo), request)
            .await
    }

    // Commit operations

    /// Gets a commit.
    pub async fn get_commit(&self, owner: &str, repo: &str, sha: &str) -> GitHubResult<GitCommit> {
        self.client
            .get(&format!("/repos/{}/{}/git/commits/{}", owner, repo, sha))
            .await
    }

    /// Creates a commit.
    pub async fn create_commit(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateCommitRequest,
    ) -> GitHubResult<GitCommit> {
        self.client
            .post(&format!("/repos/{}/{}/git/commits", owner, repo), request)
            .await
    }

    // Reference operations

    /// Lists references.
    pub async fn list_refs(
        &self,
        owner: &str,
        repo: &str,
        namespace: Option<&str>,
    ) -> GitHubResult<Vec<GitReference>> {
        let path = if let Some(ns) = namespace {
            format!("/repos/{}/{}/git/refs/{}", owner, repo, ns)
        } else {
            format!("/repos/{}/{}/git/refs", owner, repo)
        };
        self.client.get(&path).await
    }

    /// Gets a reference.
    pub async fn get_ref(
        &self,
        owner: &str,
        repo: &str,
        ref_name: &str,
    ) -> GitHubResult<GitReference> {
        // Remove leading "refs/" if present
        let ref_path = ref_name.strip_prefix("refs/").unwrap_or(ref_name);
        self.client
            .get(&format!("/repos/{}/{}/git/refs/{}", owner, repo, ref_path))
            .await
    }

    /// Creates a reference.
    pub async fn create_ref(
        &self,
        owner: &str,
        repo: &str,
        ref_name: &str,
        sha: &str,
    ) -> GitHubResult<GitReference> {
        let request = CreateRefRequest {
            ref_name: if ref_name.starts_with("refs/") {
                ref_name.to_string()
            } else {
                format!("refs/{}", ref_name)
            },
            sha: sha.to_string(),
        };
        self.client
            .post(&format!("/repos/{}/{}/git/refs", owner, repo), &request)
            .await
    }

    /// Updates a reference.
    pub async fn update_ref(
        &self,
        owner: &str,
        repo: &str,
        ref_name: &str,
        sha: &str,
        force: bool,
    ) -> GitHubResult<GitReference> {
        // Remove leading "refs/" if present
        let ref_path = ref_name.strip_prefix("refs/").unwrap_or(ref_name);
        let request = UpdateRefRequest {
            sha: sha.to_string(),
            force,
        };
        self.client
            .patch(
                &format!("/repos/{}/{}/git/refs/{}", owner, repo, ref_path),
                &request,
            )
            .await
    }

    /// Deletes a reference.
    pub async fn delete_ref(&self, owner: &str, repo: &str, ref_name: &str) -> GitHubResult<()> {
        // Remove leading "refs/" if present
        let ref_path = ref_name.strip_prefix("refs/").unwrap_or(ref_name);
        self.client
            .delete(&format!("/repos/{}/{}/git/refs/{}", owner, repo, ref_path))
            .await
    }

    // Tag operations

    /// Gets a tag.
    pub async fn get_tag(&self, owner: &str, repo: &str, sha: &str) -> GitHubResult<GitTag> {
        self.client
            .get(&format!("/repos/{}/{}/git/tags/{}", owner, repo, sha))
            .await
    }

    /// Creates a tag.
    pub async fn create_tag(
        &self,
        owner: &str,
        repo: &str,
        request: &CreateTagRequest,
    ) -> GitHubResult<GitTag> {
        self.client
            .post(&format!("/repos/{}/{}/git/tags", owner, repo), request)
            .await
    }
}

// Blob types

/// A Git blob.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blob {
    /// The SHA of the blob.
    pub sha: String,
    /// The node ID.
    pub node_id: String,
    /// The size of the blob in bytes.
    pub size: u64,
    /// The URL of the blob.
    pub url: String,
    /// The content of the blob (base64 encoded or plain text).
    pub content: Option<String>,
    /// The encoding of the content.
    pub encoding: String,
}

/// A reference to a created blob.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlobReference {
    /// The SHA of the created blob.
    pub sha: String,
    /// The URL of the blob.
    pub url: String,
}

/// Request to create a blob.
#[derive(Debug, Clone, Serialize)]
pub struct CreateBlobRequest {
    /// The content of the blob.
    pub content: String,
    /// The encoding of the content (utf-8 or base64).
    pub encoding: BlobEncoding,
}

/// Blob encoding.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BlobEncoding {
    /// UTF-8 encoding.
    #[serde(rename = "utf-8")]
    Utf8,
    /// Base64 encoding.
    Base64,
}

// Tree types

/// A Git tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tree {
    /// The SHA of the tree.
    pub sha: String,
    /// The URL of the tree.
    pub url: String,
    /// The tree entries.
    pub tree: Vec<TreeEntry>,
    /// Whether the tree was truncated.
    pub truncated: bool,
}

/// A tree entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeEntry {
    /// The path of the entry.
    pub path: String,
    /// The file mode.
    pub mode: String,
    /// The type of entry (blob, tree, commit).
    #[serde(rename = "type")]
    pub entry_type: String,
    /// The SHA of the entry.
    pub sha: Option<String>,
    /// The size in bytes (for blobs).
    pub size: Option<u64>,
    /// The URL of the entry.
    pub url: Option<String>,
}

/// Request to create a tree.
#[derive(Debug, Clone, Serialize)]
pub struct CreateTreeRequest {
    /// The tree entries to create.
    pub tree: Vec<CreateTreeEntry>,
    /// The SHA of the base tree (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_tree: Option<String>,
}

/// An entry to create in a tree.
#[derive(Debug, Clone, Serialize)]
pub struct CreateTreeEntry {
    /// The file path.
    pub path: String,
    /// The file mode.
    pub mode: TreeMode,
    /// The type of entry.
    #[serde(rename = "type")]
    pub entry_type: TreeEntryType,
    /// The SHA of the blob/tree/commit (mutually exclusive with content).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    /// The content (mutually exclusive with sha).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

/// Tree entry mode.
#[derive(Debug, Clone, Serialize)]
pub enum TreeMode {
    /// Regular file (100644).
    #[serde(rename = "100644")]
    File,
    /// Executable file (100755).
    #[serde(rename = "100755")]
    Executable,
    /// Subdirectory (040000).
    #[serde(rename = "040000")]
    Subdirectory,
    /// Submodule (160000).
    #[serde(rename = "160000")]
    Submodule,
    /// Symbolic link (120000).
    #[serde(rename = "120000")]
    Symlink,
}

/// Tree entry type.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TreeEntryType {
    /// A blob (file).
    Blob,
    /// A tree (directory).
    Tree,
    /// A commit (submodule).
    Commit,
}

// Commit types

/// A Git commit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    /// The SHA of the commit.
    pub sha: String,
    /// The node ID.
    pub node_id: String,
    /// The URL of the commit.
    pub url: String,
    /// The author of the commit.
    pub author: GitUser,
    /// The committer of the commit.
    pub committer: GitUser,
    /// The commit message.
    pub message: String,
    /// The tree information.
    pub tree: TreeReference,
    /// The parent commits.
    pub parents: Vec<ParentCommit>,
    /// Verification information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification: Option<Verification>,
}

/// Git user information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitUser {
    /// The name of the user.
    pub name: String,
    /// The email of the user.
    pub email: String,
    /// The date (ISO 8601 format).
    pub date: String,
}

/// Tree reference in a commit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeReference {
    /// The SHA of the tree.
    pub sha: String,
    /// The URL of the tree.
    pub url: String,
}

/// Parent commit reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParentCommit {
    /// The SHA of the parent commit.
    pub sha: String,
    /// The URL of the parent commit.
    pub url: String,
    /// The HTML URL of the parent commit.
    pub html_url: String,
}

/// Verification information for signed commits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verification {
    /// Whether the commit was verified.
    pub verified: bool,
    /// The reason for the verification status.
    pub reason: String,
    /// The signature.
    pub signature: Option<String>,
    /// The payload that was signed.
    pub payload: Option<String>,
}

/// Request to create a commit.
#[derive(Debug, Clone, Serialize)]
pub struct CreateCommitRequest {
    /// The commit message.
    pub message: String,
    /// The SHA of the tree.
    pub tree: String,
    /// The SHAs of the parent commits.
    pub parents: Vec<String>,
    /// The author information (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<CommitAuthor>,
    /// The committer information (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committer: Option<CommitAuthor>,
    /// The PGP signature (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

/// Commit author/committer information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitAuthor {
    /// The name of the author/committer.
    pub name: String,
    /// The email of the author/committer.
    pub email: String,
    /// The timestamp (ISO 8601 format, optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

// Reference types

/// A Git reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitReference {
    /// The reference name (e.g., "refs/heads/main").
    #[serde(rename = "ref")]
    pub ref_name: String,
    /// The node ID.
    pub node_id: String,
    /// The URL of the reference.
    pub url: String,
    /// The object the reference points to.
    pub object: GitObject,
}

/// A Git object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitObject {
    /// The SHA of the object.
    pub sha: String,
    /// The type of object (commit, tree, blob, tag).
    #[serde(rename = "type")]
    pub object_type: String,
    /// The URL of the object.
    pub url: String,
}

/// Request to create a reference.
#[derive(Debug, Clone, Serialize)]
pub struct CreateRefRequest {
    /// The reference name (must start with "refs/").
    #[serde(rename = "ref")]
    pub ref_name: String,
    /// The SHA to point the reference to.
    pub sha: String,
}

/// Request to update a reference.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateRefRequest {
    /// The new SHA for the reference.
    pub sha: String,
    /// Whether to force the update.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub force: bool,
}

// Tag types

/// A Git tag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitTag {
    /// The SHA of the tag.
    pub sha: String,
    /// The node ID.
    pub node_id: String,
    /// The URL of the tag.
    pub url: String,
    /// The tag name.
    pub tag: String,
    /// The tag message.
    pub message: String,
    /// The tagger information.
    pub tagger: GitUser,
    /// The object the tag points to.
    pub object: GitObject,
    /// Verification information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification: Option<Verification>,
}

/// Request to create a tag.
#[derive(Debug, Clone, Serialize)]
pub struct CreateTagRequest {
    /// The tag name.
    pub tag: String,
    /// The tag message.
    pub message: String,
    /// The SHA of the object to tag.
    pub object: String,
    /// The type of object (commit, tree, blob).
    #[serde(rename = "type")]
    pub object_type: TagObjectType,
    /// The tagger information (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tagger: Option<CommitAuthor>,
}

/// Tag object type.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TagObjectType {
    /// A commit.
    Commit,
    /// A tree.
    Tree,
    /// A blob.
    Blob,
}
