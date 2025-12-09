//! Beta Features Module
//!
//! This module contains experimental and beta features for the Anthropic API,
//! including extended thinking, PDF support, prompt caching, token counting,
//! and computer use capabilities.
//!
//! These features are gated behind the "beta" feature flag.

mod types;
mod extended_thinking;
mod pdf_support;
mod prompt_caching;
mod token_counting;
mod computer_use;

#[cfg(test)]
mod tests;

// Re-export all beta types and functionality
pub use types::*;
pub use extended_thinking::*;
pub use pdf_support::*;
pub use prompt_caching::*;
pub use token_counting::*;
pub use computer_use::*;
