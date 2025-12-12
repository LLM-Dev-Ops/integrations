//! Response types for team service.

use crate::types::{IconUrls, TeamId};
use serde::Deserialize;
use std::collections::HashMap;

/// Response from team.info
#[derive(Debug, Clone, Deserialize)]
pub struct TeamInfoResponse {
    /// Success indicator
    pub ok: bool,
    /// Team information
    pub team: TeamInfo,
}

/// Team/workspace information
#[derive(Debug, Clone, Deserialize)]
pub struct TeamInfo {
    /// Team ID
    pub id: TeamId,
    /// Team name
    pub name: String,
    /// Team domain
    pub domain: String,
    /// Email domain
    #[serde(default)]
    pub email_domain: Option<String>,
    /// Team icon
    #[serde(default)]
    pub icon: Option<IconUrls>,
    /// Enterprise ID
    #[serde(default)]
    pub enterprise_id: Option<String>,
    /// Enterprise name
    #[serde(default)]
    pub enterprise_name: Option<String>,
    /// Enterprise domain
    #[serde(default)]
    pub enterprise_domain: Option<String>,
    /// Avatar base URL
    #[serde(default)]
    pub avatar_base_url: Option<String>,
    /// Whether this is an enterprise team
    #[serde(default)]
    pub is_enterprise: Option<i32>,
}

impl TeamInfo {
    /// Check if this workspace is part of an enterprise
    pub fn is_enterprise_workspace(&self) -> bool {
        self.enterprise_id.is_some()
    }
}

/// Response from team.accessLogs
#[derive(Debug, Clone, Deserialize)]
pub struct AccessLogsResponse {
    /// Success indicator
    pub ok: bool,
    /// Access log entries
    #[serde(default)]
    pub logins: Vec<AccessLogEntry>,
    /// Paging information
    #[serde(default)]
    pub paging: Option<PagingInfo>,
}

/// Access log entry
#[derive(Debug, Clone, Deserialize)]
pub struct AccessLogEntry {
    /// User ID
    pub user_id: String,
    /// Username
    #[serde(default)]
    pub username: Option<String>,
    /// Date accessed (Unix timestamp)
    pub date_first: i64,
    /// Last access date (Unix timestamp)
    pub date_last: i64,
    /// Access count
    pub count: i32,
    /// IP address
    pub ip: String,
    /// User agent
    pub user_agent: String,
    /// Internet service provider
    #[serde(default)]
    pub isp: Option<String>,
    /// Country
    #[serde(default)]
    pub country: Option<String>,
    /// Region
    #[serde(default)]
    pub region: Option<String>,
}

/// Paging information
#[derive(Debug, Clone, Deserialize)]
pub struct PagingInfo {
    /// Total count
    pub count: i32,
    /// Total pages
    pub total: i32,
    /// Current page
    pub page: i32,
    /// Items per page
    pub pages: i32,
}

impl PagingInfo {
    /// Check if there are more pages
    pub fn has_more(&self) -> bool {
        self.page < self.pages
    }
}

/// Response from team.billableInfo
#[derive(Debug, Clone, Deserialize)]
pub struct BillableInfoResponse {
    /// Success indicator
    pub ok: bool,
    /// Billable info per user
    #[serde(default)]
    pub billable_info: HashMap<String, BillableInfo>,
}

/// Billable information for a user
#[derive(Debug, Clone, Deserialize)]
pub struct BillableInfo {
    /// Whether billable
    pub billing_active: bool,
}

/// Response from team.integrationLogs
#[derive(Debug, Clone, Deserialize)]
pub struct IntegrationLogsResponse {
    /// Success indicator
    pub ok: bool,
    /// Integration log entries
    #[serde(default)]
    pub logs: Vec<IntegrationLogEntry>,
    /// Paging information
    #[serde(default)]
    pub paging: Option<PagingInfo>,
}

/// Integration log entry
#[derive(Debug, Clone, Deserialize)]
pub struct IntegrationLogEntry {
    /// Service ID
    #[serde(default)]
    pub service_id: Option<String>,
    /// Service type
    #[serde(default)]
    pub service_type: Option<String>,
    /// User ID
    pub user_id: String,
    /// User name
    #[serde(default)]
    pub user_name: Option<String>,
    /// Channel ID
    #[serde(default)]
    pub channel: Option<String>,
    /// Date
    pub date: String,
    /// Change type
    pub change_type: String,
    /// Scope
    #[serde(default)]
    pub scope: Option<String>,
    /// App ID
    #[serde(default)]
    pub app_id: Option<String>,
    /// App type
    #[serde(default)]
    pub app_type: Option<String>,
    /// Reason
    #[serde(default)]
    pub reason: Option<String>,
}
