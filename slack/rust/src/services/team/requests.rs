//! Request types for team service.

use serde::Serialize;

/// Request to get team info
#[derive(Debug, Clone, Serialize, Default)]
pub struct TeamInfoRequest {
    /// Team domain or ID (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team: Option<String>,
    /// Domain to retrieve
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
}

impl TeamInfoRequest {
    /// Create a new team info request
    pub fn new() -> Self {
        Self::default()
    }

    /// Set team ID or domain
    pub fn team(mut self, team: impl Into<String>) -> Self {
        self.team = Some(team.into());
        self
    }
}

/// Request to get access logs
#[derive(Debug, Clone, Serialize)]
pub struct AccessLogsRequest {
    /// End of time range (Unix timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<i64>,
    /// Number of items to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl Default for AccessLogsRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl AccessLogsRequest {
    /// Create a new access logs request
    pub fn new() -> Self {
        Self {
            before: None,
            count: None,
            page: None,
            team_id: None,
        }
    }

    /// Set the before timestamp
    pub fn before(mut self, timestamp: i64) -> Self {
        self.before = Some(timestamp);
        self
    }

    /// Set the count
    pub fn count(mut self, count: i32) -> Self {
        self.count = Some(count);
        self
    }

    /// Set the page
    pub fn page(mut self, page: i32) -> Self {
        self.page = Some(page);
        self
    }

    /// Set the team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to get billable info
#[derive(Debug, Clone, Serialize, Default)]
pub struct BillableInfoRequest {
    /// User ID to get billable info for
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl BillableInfoRequest {
    /// Create a new billable info request
    pub fn new() -> Self {
        Self::default()
    }

    /// Filter by user
    pub fn user(mut self, user: impl Into<String>) -> Self {
        self.user = Some(user.into());
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to get integration logs
#[derive(Debug, Clone, Serialize)]
pub struct IntegrationLogsRequest {
    /// Filter logs by app ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    /// Filter logs by change type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_type: Option<String>,
    /// Number of items to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Filter logs by service ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_id: Option<String>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    /// Filter logs by user
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

impl Default for IntegrationLogsRequest {
    fn default() -> Self {
        Self::new()
    }
}

impl IntegrationLogsRequest {
    /// Create a new integration logs request
    pub fn new() -> Self {
        Self {
            app_id: None,
            change_type: None,
            count: None,
            page: None,
            service_id: None,
            team_id: None,
            user: None,
        }
    }

    /// Filter by app ID
    pub fn app_id(mut self, app_id: impl Into<String>) -> Self {
        self.app_id = Some(app_id.into());
        self
    }

    /// Filter by change type
    pub fn change_type(mut self, change_type: impl Into<String>) -> Self {
        self.change_type = Some(change_type.into());
        self
    }

    /// Set count
    pub fn count(mut self, count: i32) -> Self {
        self.count = Some(count);
        self
    }

    /// Set page
    pub fn page(mut self, page: i32) -> Self {
        self.page = Some(page);
        self
    }

    /// Filter by service ID
    pub fn service_id(mut self, service_id: impl Into<String>) -> Self {
        self.service_id = Some(service_id.into());
        self
    }

    /// Filter by user
    pub fn user(mut self, user: impl Into<String>) -> Self {
        self.user = Some(user.into());
        self
    }
}
