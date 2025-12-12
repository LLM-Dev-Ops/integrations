//! Authorization Types
//!
//! Types for OAuth2 authorization flows.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Parameters for authorization URL generation.
#[derive(Clone, Debug, Default)]
pub struct AuthorizationParams {
    /// Redirect URI.
    pub redirect_uri: String,
    /// Requested scopes (overrides default).
    pub scopes: Option<Vec<String>>,
    /// Custom state value (auto-generated if not provided).
    pub state: Option<String>,
    /// Login hint for pre-filling user identity.
    pub login_hint: Option<String>,
    /// Prompt behavior.
    pub prompt: Option<Prompt>,
    /// Additional parameters.
    pub extra_params: HashMap<String, String>,
}

/// Parameters for PKCE authorization URL generation.
#[derive(Clone, Debug, Default)]
pub struct PkceAuthorizationParams {
    /// Redirect URI.
    pub redirect_uri: String,
    /// Requested scopes.
    pub scopes: Option<Vec<String>>,
    /// PKCE challenge method.
    pub challenge_method: Option<PkceMethod>,
    /// Login hint.
    pub login_hint: Option<String>,
    /// Prompt behavior.
    pub prompt: Option<Prompt>,
    /// Additional parameters.
    pub extra_params: HashMap<String, String>,
}

/// Result of authorization URL generation.
#[derive(Clone, Debug)]
pub struct AuthorizationUrl {
    /// The authorization URL to redirect user to.
    pub url: String,
    /// State parameter for CSRF validation.
    pub state: String,
}

/// Result of PKCE authorization URL generation.
#[derive(Clone, Debug)]
pub struct PkceAuthorizationUrl {
    /// The authorization URL to redirect user to.
    pub url: String,
    /// State parameter for CSRF validation.
    pub state: String,
    /// PKCE code verifier (must be stored and used in token exchange).
    pub code_verifier: String,
}

/// Code exchange request.
#[derive(Clone, Debug)]
pub struct CodeExchangeRequest {
    /// Authorization code.
    pub code: String,
    /// Redirect URI (must match authorization request).
    pub redirect_uri: String,
    /// State parameter.
    pub state: Option<String>,
}

/// PKCE code exchange request.
#[derive(Clone, Debug)]
pub struct PkceCodeExchangeRequest {
    /// Authorization code.
    pub code: String,
    /// Redirect URI.
    pub redirect_uri: String,
    /// State parameter.
    pub state: Option<String>,
    /// PKCE code verifier.
    pub code_verifier: String,
}

/// Client credentials request parameters.
#[derive(Clone, Debug, Default)]
pub struct ClientCredentialsParams {
    /// Scopes to request.
    pub scopes: Option<Vec<String>>,
}

/// Prompt behavior for authorization.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Prompt {
    /// Do not display any authentication or consent UI.
    None,
    /// Force re-authentication.
    Login,
    /// Force consent screen.
    Consent,
    /// Force account selection.
    SelectAccount,
}

impl Prompt {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Login => "login",
            Self::Consent => "consent",
            Self::SelectAccount => "select_account",
        }
    }
}

/// PKCE challenge method.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum PkceMethod {
    /// SHA-256 hash (recommended).
    #[default]
    S256,
    /// Plain text (not recommended).
    Plain,
}

impl PkceMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::S256 => "S256",
            Self::Plain => "plain",
        }
    }
}

/// PKCE parameters.
#[derive(Clone)]
pub struct PkceParams {
    /// Code verifier (keep secret).
    pub code_verifier: String,
    /// Code challenge (sent in authorization URL).
    pub code_challenge: String,
    /// Challenge method used.
    pub code_challenge_method: PkceMethod,
}

impl std::fmt::Debug for PkceParams {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PkceParams")
            .field("code_verifier", &"[REDACTED]")
            .field("code_challenge", &self.code_challenge)
            .field("code_challenge_method", &self.code_challenge_method)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_as_str() {
        assert_eq!(Prompt::None.as_str(), "none");
        assert_eq!(Prompt::Login.as_str(), "login");
        assert_eq!(Prompt::Consent.as_str(), "consent");
        assert_eq!(Prompt::SelectAccount.as_str(), "select_account");
    }

    #[test]
    fn test_pkce_method_as_str() {
        assert_eq!(PkceMethod::S256.as_str(), "S256");
        assert_eq!(PkceMethod::Plain.as_str(), "plain");
    }

    #[test]
    fn test_authorization_params_default() {
        let params = AuthorizationParams::default();
        assert!(params.redirect_uri.is_empty());
        assert!(params.scopes.is_none());
        assert!(params.state.is_none());
    }
}
