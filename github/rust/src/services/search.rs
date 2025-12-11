//! GitHub Search API operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::{Issue, Repository, User};
use serde::{Deserialize, Serialize};

/// Service for search operations.
pub struct SearchService<'a> {
    client: &'a GitHubClient,
}

impl<'a> SearchService<'a> {
    /// Creates a new search service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Searches repositories.
    pub async fn repositories(&self, query: &str) -> GitHubResult<SearchRepositoriesResult> {
        self.repositories_with_params(query, &SearchParams::default())
            .await
    }

    /// Searches repositories with parameters.
    pub async fn repositories_with_params(
        &self,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchRepositoriesResult> {
        let full_params = SearchRepositoriesParams {
            q: query.to_string(),
            sort: params.sort.clone(),
            order: params.order.clone(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/repositories", &full_params)
            .await
    }

    /// Searches code.
    pub async fn code(&self, query: &str) -> GitHubResult<SearchCodeResult> {
        self.code_with_params(query, &SearchParams::default()).await
    }

    /// Searches code with parameters.
    pub async fn code_with_params(
        &self,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchCodeResult> {
        let full_params = SearchCodeParams {
            q: query.to_string(),
            sort: params.sort.clone(),
            order: params.order.clone(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/code", &full_params)
            .await
    }

    /// Searches issues and pull requests.
    pub async fn issues(&self, query: &str) -> GitHubResult<SearchIssuesResult> {
        self.issues_with_params(query, &SearchParams::default())
            .await
    }

    /// Searches issues and pull requests with parameters.
    pub async fn issues_with_params(
        &self,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchIssuesResult> {
        let full_params = SearchIssuesParams {
            q: query.to_string(),
            sort: params.sort.clone(),
            order: params.order.clone(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/issues", &full_params)
            .await
    }

    /// Searches users.
    pub async fn users(&self, query: &str) -> GitHubResult<SearchUsersResult> {
        self.users_with_params(query, &SearchParams::default())
            .await
    }

    /// Searches users with parameters.
    pub async fn users_with_params(
        &self,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchUsersResult> {
        let full_params = SearchUsersParams {
            q: query.to_string(),
            sort: params.sort.clone(),
            order: params.order.clone(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/users", &full_params)
            .await
    }

    /// Searches commits.
    pub async fn commits(&self, query: &str) -> GitHubResult<SearchCommitsResult> {
        self.commits_with_params(query, &SearchParams::default())
            .await
    }

    /// Searches commits with parameters.
    pub async fn commits_with_params(
        &self,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchCommitsResult> {
        let full_params = SearchCommitsParams {
            q: query.to_string(),
            sort: params.sort.clone(),
            order: params.order.clone(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/commits", &full_params)
            .await
    }

    /// Searches topics.
    pub async fn topics(&self, query: &str) -> GitHubResult<SearchTopicsResult> {
        self.topics_with_params(query, &SearchParams::default())
            .await
    }

    /// Searches topics with parameters.
    pub async fn topics_with_params(
        &self,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchTopicsResult> {
        let full_params = SearchTopicsParams {
            q: query.to_string(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/topics", &full_params)
            .await
    }

    /// Searches labels.
    pub async fn labels(
        &self,
        repository_id: u64,
        query: &str,
    ) -> GitHubResult<SearchLabelsResult> {
        self.labels_with_params(repository_id, query, &SearchParams::default())
            .await
    }

    /// Searches labels with parameters.
    pub async fn labels_with_params(
        &self,
        repository_id: u64,
        query: &str,
        params: &SearchParams,
    ) -> GitHubResult<SearchLabelsResult> {
        let full_params = SearchLabelsParams {
            repository_id,
            q: query.to_string(),
            sort: params.sort.clone(),
            order: params.order.clone(),
            page: params.page,
            per_page: params.per_page,
        };
        self.client
            .get_with_params("/search/labels", &full_params)
            .await
    }
}

/// Common search parameters.
#[derive(Debug, Clone, Default)]
pub struct SearchParams {
    /// Sort field.
    pub sort: Option<String>,
    /// Sort order.
    pub order: Option<SearchOrder>,
    /// Page number.
    pub page: Option<u32>,
    /// Items per page.
    pub per_page: Option<u32>,
}

/// Search sort order.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize)]
struct SearchRepositoriesParams {
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<SearchOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchCodeParams {
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<SearchOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchIssuesParams {
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<SearchOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchUsersParams {
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<SearchOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchCommitsParams {
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<SearchOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchTopicsParams {
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchLabelsParams {
    repository_id: u64,
    q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<SearchOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u32>,
}

/// Search result for repositories.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchRepositoriesResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching repositories.
    pub items: Vec<Repository>,
}

/// Search result for code.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchCodeResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching code.
    pub items: Vec<CodeSearchItem>,
}

/// A code search result item.
#[derive(Debug, Clone, Deserialize)]
pub struct CodeSearchItem {
    /// Name.
    pub name: String,
    /// Path.
    pub path: String,
    /// SHA.
    pub sha: String,
    /// URL.
    pub url: String,
    /// Git URL.
    pub git_url: String,
    /// HTML URL.
    pub html_url: String,
    /// Repository.
    pub repository: Repository,
    /// Score.
    pub score: f64,
    /// File size.
    pub file_size: Option<u64>,
    /// Language.
    pub language: Option<String>,
    /// Last modified at.
    pub last_modified_at: Option<String>,
    /// Line numbers (if text match).
    pub line_numbers: Option<Vec<u32>>,
    /// Text matches.
    pub text_matches: Option<Vec<TextMatch>>,
}

/// A text match in search results.
#[derive(Debug, Clone, Deserialize)]
pub struct TextMatch {
    /// Object URL.
    pub object_url: String,
    /// Object type.
    pub object_type: Option<String>,
    /// Property.
    pub property: String,
    /// Fragment.
    pub fragment: String,
    /// Matches.
    pub matches: Vec<Match>,
}

/// A match within a text fragment.
#[derive(Debug, Clone, Deserialize)]
pub struct Match {
    /// Text.
    pub text: String,
    /// Indices.
    pub indices: Vec<u32>,
}

/// Search result for issues.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchIssuesResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching issues.
    pub items: Vec<Issue>,
}

/// Search result for users.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchUsersResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching users.
    pub items: Vec<User>,
}

/// Search result for commits.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchCommitsResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching commits.
    pub items: Vec<CommitSearchItem>,
}

/// A commit search result item.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitSearchItem {
    /// URL.
    pub url: String,
    /// SHA.
    pub sha: String,
    /// HTML URL.
    pub html_url: String,
    /// Comments URL.
    pub comments_url: String,
    /// Commit details.
    pub commit: CommitDetails,
    /// Author.
    pub author: Option<User>,
    /// Committer.
    pub committer: Option<User>,
    /// Parents.
    pub parents: Vec<CommitParent>,
    /// Repository.
    pub repository: Repository,
    /// Score.
    pub score: f64,
    /// Node ID.
    pub node_id: String,
    /// Text matches.
    pub text_matches: Option<Vec<TextMatch>>,
}

/// Commit details.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitDetails {
    /// URL.
    pub url: String,
    /// Author.
    pub author: CommitAuthor,
    /// Committer.
    pub committer: CommitAuthor,
    /// Message.
    pub message: String,
    /// Tree.
    pub tree: CommitTree,
    /// Comment count.
    pub comment_count: u32,
}

/// Commit author/committer information.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitAuthor {
    /// Name.
    pub name: String,
    /// Email.
    pub email: String,
    /// Date.
    pub date: String,
}

/// Commit tree reference.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitTree {
    /// URL.
    pub url: String,
    /// SHA.
    pub sha: String,
}

/// Commit parent reference.
#[derive(Debug, Clone, Deserialize)]
pub struct CommitParent {
    /// URL.
    pub url: String,
    /// HTML URL.
    pub html_url: String,
    /// SHA.
    pub sha: String,
}

/// Search result for topics.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchTopicsResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching topics.
    pub items: Vec<TopicSearchItem>,
}

/// A topic search result item.
#[derive(Debug, Clone, Deserialize)]
pub struct TopicSearchItem {
    /// Name.
    pub name: String,
    /// Display name.
    pub display_name: Option<String>,
    /// Short description.
    pub short_description: Option<String>,
    /// Description.
    pub description: Option<String>,
    /// Created by.
    pub created_by: Option<String>,
    /// Released.
    pub released: Option<String>,
    /// Created at.
    pub created_at: String,
    /// Updated at.
    pub updated_at: String,
    /// Featured.
    pub featured: bool,
    /// Curated.
    pub curated: bool,
    /// Score.
    pub score: f64,
}

/// Search result for labels.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchLabelsResult {
    /// Total count.
    pub total_count: u32,
    /// Whether results were truncated.
    pub incomplete_results: bool,
    /// Matching labels.
    pub items: Vec<LabelSearchItem>,
}

/// A label search result item.
#[derive(Debug, Clone, Deserialize)]
pub struct LabelSearchItem {
    /// Label ID.
    pub id: u64,
    /// Node ID.
    pub node_id: String,
    /// URL.
    pub url: String,
    /// Name.
    pub name: String,
    /// Color.
    pub color: String,
    /// Whether default.
    pub default: bool,
    /// Description.
    pub description: Option<String>,
    /// Score.
    pub score: f64,
    /// Text matches.
    pub text_matches: Option<Vec<TextMatch>>,
}
