//! # GitHub Integration Library
//!
//! A production-ready GitHub API client with:
//! - Full REST API coverage (Repositories, Issues, PRs, Actions, etc.)
//! - GraphQL API support with cost-based rate limiting
//! - Multiple authentication methods (PAT, GitHub App, OAuth, Actions)
//! - Automatic pagination handling
//! - Webhook signature verification
//! - Resilience patterns (retry, circuit breaker, rate limiting)
//! - Comprehensive observability
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use integrations_github::{GitHubClient, GitHubConfig, AuthMethod};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client with personal access token
//!     let config = GitHubConfig::builder()
//!         .auth(AuthMethod::pat("ghp_xxxxxxxxxxxx"))
//!         .build()?;
//!
//!     let client = GitHubClient::new(config)?;
//!
//!     // List repositories
//!     let repos = client.repositories().list_for_user("octocat").await?;
//!     for repo in repos {
//!         println!("{}", repo.full_name);
//!     }
//!
//!     Ok(())
//! }
//! ```

#![warn(missing_docs)]
#![warn(clippy::all)]

// Core modules
pub mod config;
pub mod errors;
pub mod types;

// Authentication
pub mod auth;

// HTTP client and transport
pub mod client;

// Pagination handling
pub mod pagination;

// API Services
pub mod services;

// Webhooks
pub mod webhooks;

// Resilience patterns
pub mod resilience;

// Observability
pub mod observability;

// Mocks for testing
pub mod mocks;

// Re-exports for convenience
pub use client::{GitHubClient, GitHubClientBuilder};
pub use config::{GitHubConfig, GitHubConfigBuilder};
pub use errors::{GitHubError, GitHubErrorKind, GitHubResult};
pub use auth::{AuthMethod, AuthManager};
pub use pagination::{Page, PageIterator, PaginationLinks};
pub use types::*;
