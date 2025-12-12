//! Response types for OAuth service.

use serde::Deserialize;

/// Response from oauth.v2.access
#[derive(Debug, Clone, Deserialize)]
pub struct V2AccessResponse {
    /// Success indicator
    pub ok: bool,
    /// Access token
    pub access_token: String,
    /// Token type
    pub token_type: String,
    /// Scope granted
    pub scope: String,
    /// Bot user ID
    #[serde(default)]
    pub bot_user_id: Option<String>,
    /// App ID
    pub app_id: String,
    /// Team information
    #[serde(default)]
    pub team: Option<OAuthTeam>,
    /// Enterprise information
    #[serde(default)]
    pub enterprise: Option<OAuthEnterprise>,
    /// Authed user information
    #[serde(default)]
    pub authed_user: Option<AuthedUser>,
    /// Refresh token (if rotation enabled)
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Expires in seconds (if rotation enabled)
    #[serde(default)]
    pub expires_in: Option<i64>,
    /// Incoming webhook (if requested)
    #[serde(default)]
    pub incoming_webhook: Option<IncomingWebhook>,
}

/// OAuth team information
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthTeam {
    /// Team ID
    pub id: String,
    /// Team name
    pub name: String,
}

/// OAuth enterprise information
#[derive(Debug, Clone, Deserialize)]
pub struct OAuthEnterprise {
    /// Enterprise ID
    pub id: String,
    /// Enterprise name
    #[serde(default)]
    pub name: Option<String>,
}

/// Authed user information
#[derive(Debug, Clone, Deserialize)]
pub struct AuthedUser {
    /// User ID
    pub id: String,
    /// User scope
    #[serde(default)]
    pub scope: Option<String>,
    /// User access token
    #[serde(default)]
    pub access_token: Option<String>,
    /// User token type
    #[serde(default)]
    pub token_type: Option<String>,
}

/// Incoming webhook configuration
#[derive(Debug, Clone, Deserialize)]
pub struct IncomingWebhook {
    /// Channel ID
    pub channel: String,
    /// Channel name
    #[serde(default)]
    pub channel_id: Option<String>,
    /// Configuration URL
    pub configuration_url: String,
    /// Webhook URL
    pub url: String,
}

/// Response from oauth.v2.exchange
#[derive(Debug, Clone, Deserialize)]
pub struct V2ExchangeResponse {
    /// Success indicator
    pub ok: bool,
    /// Access token
    pub access_token: String,
    /// Token type
    pub token_type: String,
    /// Scope
    pub scope: String,
    /// Team information
    #[serde(default)]
    pub team: Option<OAuthTeam>,
    /// Enterprise information
    #[serde(default)]
    pub enterprise: Option<OAuthEnterprise>,
    /// Refresh token
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Expires in seconds
    #[serde(default)]
    pub expires_in: Option<i64>,
}

/// Response from openid.connect.token
#[derive(Debug, Clone, Deserialize)]
pub struct OpenIdConnectTokenResponse {
    /// Success indicator
    pub ok: bool,
    /// Access token
    pub access_token: String,
    /// Token type
    pub token_type: String,
    /// ID token (JWT)
    pub id_token: String,
    /// Refresh token
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Expires in seconds
    #[serde(default)]
    pub expires_in: Option<i64>,
}

/// Response from openid.connect.userInfo
#[derive(Debug, Clone, Deserialize)]
pub struct OpenIdConnectUserInfoResponse {
    /// Success indicator
    pub ok: bool,
    /// Subject identifier (user ID)
    pub sub: String,
    /// User's Slack URL
    #[serde(rename = "https://slack.com/user_id")]
    pub slack_user_id: String,
    /// Team ID
    #[serde(rename = "https://slack.com/team_id")]
    pub slack_team_id: String,
    /// User's email
    #[serde(default)]
    pub email: Option<String>,
    /// Email verified
    #[serde(default)]
    pub email_verified: Option<bool>,
    /// Given name
    #[serde(default)]
    pub given_name: Option<String>,
    /// Family name
    #[serde(default)]
    pub family_name: Option<String>,
    /// Full name
    #[serde(default)]
    pub name: Option<String>,
    /// Profile picture URL
    #[serde(default)]
    pub picture: Option<String>,
    /// Locale
    #[serde(default)]
    pub locale: Option<String>,
    /// Date updated
    #[serde(default)]
    pub date_email_verified: Option<i64>,
}

impl OpenIdConnectUserInfoResponse {
    /// Get the user's Slack user ID
    pub fn user_id(&self) -> &str {
        &self.slack_user_id
    }

    /// Get the team ID
    pub fn team_id(&self) -> &str {
        &self.slack_team_id
    }
}
