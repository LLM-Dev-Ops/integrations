//! Google Drive Integration Module
//!
//! This module provides a production-ready, type-safe interface for interacting with
//! Google Drive's REST API v3. It supports OAuth 2.0 and Service Account authentication,
//! comprehensive file operations, and resilience patterns.
//!
//! # Features
//!
//! - **File Operations**: Create, read, update, delete, copy, move files and folders
//! - **Upload Management**: Simple, multipart, and resumable uploads for large files
//! - **Download Streaming**: Efficient streaming downloads for large files
//! - **Permissions**: Share files/folders, manage access levels
//! - **Comments**: Add, retrieve, update, delete comments
//! - **Revisions**: Access file revision history
//! - **Change Tracking**: Monitor changes via change tokens
//! - **Export**: Export Google Workspace files to various formats
//! - **Authentication**: OAuth 2.0 and Service Account support
//! - **Resilience**: Retry, circuit breaker, rate limiting
//!
//! # Example
//!
//! ```no_run
//! use integrations_google_drive::{GoogleDriveClient, GoogleDriveConfig};
//! use integrations_google_drive::auth::OAuth2Provider;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create OAuth2 provider
//! let auth = OAuth2Provider::new(
//!     "client_id".to_string(),
//!     "client_secret".into(),
//!     "refresh_token".into(),
//! );
//!
//! // Create client configuration
//! let config = GoogleDriveConfig::builder()
//!     .auth_provider(auth)
//!     .build()?;
//!
//! // Create client
//! let client = GoogleDriveClient::new(config)?;
//!
//! // List files
//! let files = client.files().list(None).await?;
//! for file in files.files {
//!     println!("{}: {}", file.name, file.id);
//! }
//! # Ok(())
//! # }
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]
#![allow(clippy::module_inception)]

// Core modules
pub mod auth;
pub mod client;
pub mod config;
pub mod errors;
pub mod pagination;
pub mod resilience;
pub mod services;
pub mod transport;
pub mod types;

// Internal modules (not part of public API)
#[cfg(test)]
mod mocks;

// Re-exports for convenience
pub use auth::{AccessToken, AuthProvider, OAuth2Provider, ServiceAccountProvider};
pub use client::GoogleDriveClient;
pub use config::{GoogleDriveConfig, GoogleDriveConfigBuilder};
pub use errors::{GoogleDriveError, GoogleDriveResult};
pub use types::{DriveFile, FileList, Permission, PermissionList};

/// Prelude module with commonly used types and traits.
///
/// This module re-exports the most commonly used types and traits from the library,
/// making it convenient to use with a single import:
///
/// ```no_run
/// use integrations_google_drive::prelude::*;
/// ```
pub mod prelude {
    // Client
    pub use crate::client::GoogleDriveClient;

    // Configuration
    pub use crate::config::{GoogleDriveConfig, GoogleDriveConfigBuilder};

    // Authentication
    pub use crate::auth::{
        AccessToken, AuthProvider, OAuth2Provider, ServiceAccountProvider,
    };

    // Services
    pub use crate::services::{
        AboutService, ChangesService, CommentsService, DrivesService, FilesService,
        PermissionsService, RepliesService, RevisionsService,
    };

    // Common types
    pub use crate::types::{
        Change, ChangeList, Comment, CommentList, DriveFile, FileList, Permission,
        PermissionList, Revision, RevisionList, SharedDrive, SharedDriveList,
        StorageQuota,
    };

    // Request types
    pub use crate::types::requests::{
        CopyFileRequest, CreateFileRequest, CreateFolderRequest, CreatePermissionRequest,
        ListFilesParams, UpdateFileRequest,
    };

    // Errors
    pub use crate::errors::{GoogleDriveError, GoogleDriveResult};

    // Pagination
    pub use crate::pagination::{PageIterator, Paginated};
}
