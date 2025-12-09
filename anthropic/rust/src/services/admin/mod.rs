//! Admin API services for managing organizations, workspaces, users, API keys, and invites.
//!
//! This module provides access to the Anthropic Admin API, which allows you to manage:
//! - Organizations and their settings
//! - Workspaces and workspace members
//! - API keys for programmatic access
//! - User invitations
//! - User management
//!
//! All admin services are feature-gated behind the "admin" feature flag.
//!
//! # Example
//!
//! ```rust,ignore
//! use integrations_anthropic::services::admin::{
//!     OrganizationsService, WorkspacesService, ApiKeysService,
//! };
//!
//! // Get organization information
//! let org = organizations_service.get().await?;
//!
//! // List workspaces
//! let workspaces = workspaces_service.list(None).await?;
//!
//! // Create an API key
//! let api_key = api_keys_service.create(CreateApiKeyRequest {
//!     name: "My API Key".to_string(),
//!     workspace_id: workspace_id.to_string(),
//! }).await?;
//! ```

mod api_keys;
mod invites;
mod organizations;
mod types;
mod users;
mod workspaces;

#[cfg(test)]
mod tests;

// Re-export all types
pub use api_keys::{ApiKeysService, ApiKeysServiceImpl};
pub use invites::{InvitesService, InvitesServiceImpl};
pub use organizations::{OrganizationsService, OrganizationsServiceImpl};
pub use types::*;
pub use users::{UsersService, UsersServiceImpl};
pub use workspaces::{WorkspacesService, WorkspacesServiceImpl};
