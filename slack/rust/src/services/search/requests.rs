//! Request types for search service.

use serde::Serialize;

/// Request to search messages
#[derive(Debug, Clone, Serialize)]
pub struct SearchMessagesRequest {
    /// Search query
    pub query: String,
    /// Number of results per page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Whether to highlight matches
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<bool>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Sort order (score or timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    /// Sort direction (asc or desc)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_dir: Option<String>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl SearchMessagesRequest {
    /// Create a new search messages request
    pub fn new(query: impl Into<String>) -> Self {
        Self {
            query: query.into(),
            count: None,
            highlight: None,
            page: None,
            sort: None,
            sort_dir: None,
            team_id: None,
        }
    }

    /// Set the number of results per page
    pub fn count(mut self, count: i32) -> Self {
        self.count = Some(count);
        self
    }

    /// Enable or disable highlighting
    pub fn highlight(mut self, highlight: bool) -> Self {
        self.highlight = Some(highlight);
        self
    }

    /// Set the page number
    pub fn page(mut self, page: i32) -> Self {
        self.page = Some(page);
        self
    }

    /// Sort by score
    pub fn sort_by_score(mut self) -> Self {
        self.sort = Some("score".to_string());
        self
    }

    /// Sort by timestamp
    pub fn sort_by_timestamp(mut self) -> Self {
        self.sort = Some("timestamp".to_string());
        self
    }

    /// Sort ascending
    pub fn sort_asc(mut self) -> Self {
        self.sort_dir = Some("asc".to_string());
        self
    }

    /// Sort descending
    pub fn sort_desc(mut self) -> Self {
        self.sort_dir = Some("desc".to_string());
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to search files
#[derive(Debug, Clone, Serialize)]
pub struct SearchFilesRequest {
    /// Search query
    pub query: String,
    /// Number of results per page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Whether to highlight matches
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<bool>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Sort order (score or timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    /// Sort direction (asc or desc)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_dir: Option<String>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl SearchFilesRequest {
    /// Create a new search files request
    pub fn new(query: impl Into<String>) -> Self {
        Self {
            query: query.into(),
            count: None,
            highlight: None,
            page: None,
            sort: None,
            sort_dir: None,
            team_id: None,
        }
    }

    /// Set the number of results per page
    pub fn count(mut self, count: i32) -> Self {
        self.count = Some(count);
        self
    }

    /// Enable or disable highlighting
    pub fn highlight(mut self, highlight: bool) -> Self {
        self.highlight = Some(highlight);
        self
    }

    /// Set the page number
    pub fn page(mut self, page: i32) -> Self {
        self.page = Some(page);
        self
    }

    /// Sort by score
    pub fn sort_by_score(mut self) -> Self {
        self.sort = Some("score".to_string());
        self
    }

    /// Sort by timestamp
    pub fn sort_by_timestamp(mut self) -> Self {
        self.sort = Some("timestamp".to_string());
        self
    }

    /// Sort ascending
    pub fn sort_asc(mut self) -> Self {
        self.sort_dir = Some("asc".to_string());
        self
    }

    /// Sort descending
    pub fn sort_desc(mut self) -> Self {
        self.sort_dir = Some("desc".to_string());
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}

/// Request to search all (messages and files)
#[derive(Debug, Clone, Serialize)]
pub struct SearchAllRequest {
    /// Search query
    pub query: String,
    /// Number of results per page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Whether to highlight matches
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<bool>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Sort order (score or timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    /// Sort direction (asc or desc)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_dir: Option<String>,
    /// Team ID (for enterprise)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl SearchAllRequest {
    /// Create a new search all request
    pub fn new(query: impl Into<String>) -> Self {
        Self {
            query: query.into(),
            count: None,
            highlight: None,
            page: None,
            sort: None,
            sort_dir: None,
            team_id: None,
        }
    }

    /// Set the number of results per page
    pub fn count(mut self, count: i32) -> Self {
        self.count = Some(count);
        self
    }

    /// Enable or disable highlighting
    pub fn highlight(mut self, highlight: bool) -> Self {
        self.highlight = Some(highlight);
        self
    }

    /// Set the page number
    pub fn page(mut self, page: i32) -> Self {
        self.page = Some(page);
        self
    }

    /// Sort by score
    pub fn sort_by_score(mut self) -> Self {
        self.sort = Some("score".to_string());
        self
    }

    /// Sort by timestamp
    pub fn sort_by_timestamp(mut self) -> Self {
        self.sort = Some("timestamp".to_string());
        self
    }

    /// Sort ascending
    pub fn sort_asc(mut self) -> Self {
        self.sort_dir = Some("asc".to_string());
        self
    }

    /// Sort descending
    pub fn sort_desc(mut self) -> Self {
        self.sort_dir = Some("desc".to_string());
        self
    }

    /// Set team ID
    pub fn team_id(mut self, team_id: impl Into<String>) -> Self {
        self.team_id = Some(team_id.into());
        self
    }
}
