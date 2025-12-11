//! Mock implementations for testing GitHub API clients.

use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult, RateLimitInfo};
use crate::types::*;
use chrono::{DateTime, Duration, Utc};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Mock GitHub client for testing.
#[derive(Debug, Clone)]
pub struct MockGitHubClient {
    /// Response store.
    responses: Arc<RwLock<ResponseStore>>,
    /// Request history.
    requests: Arc<RwLock<Vec<MockRequest>>>,
    /// Default behavior.
    default_behavior: DefaultBehavior,
}

/// Stored responses for mock client.
#[derive(Debug, Default)]
struct ResponseStore {
    responses: HashMap<String, Vec<MockResponse>>,
}

/// A mock response.
#[derive(Debug, Clone)]
pub struct MockResponse {
    /// Status code.
    pub status: u16,
    /// Response body as JSON.
    pub body: String,
    /// Headers.
    pub headers: HashMap<String, String>,
    /// Delay before responding.
    pub delay: Option<std::time::Duration>,
}

impl MockResponse {
    /// Creates a successful response with the given body.
    pub fn ok<T: Serialize>(body: &T) -> Self {
        Self {
            status: 200,
            body: serde_json::to_string(body).unwrap_or_default(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a 201 Created response.
    pub fn created<T: Serialize>(body: &T) -> Self {
        Self {
            status: 201,
            body: serde_json::to_string(body).unwrap_or_default(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a 204 No Content response.
    pub fn no_content() -> Self {
        Self {
            status: 204,
            body: String::new(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a 404 Not Found response.
    pub fn not_found(message: &str) -> Self {
        Self {
            status: 404,
            body: serde_json::json!({
                "message": message,
                "documentation_url": "https://docs.github.com/rest"
            })
            .to_string(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a 401 Unauthorized response.
    pub fn unauthorized(message: &str) -> Self {
        Self {
            status: 401,
            body: serde_json::json!({
                "message": message,
                "documentation_url": "https://docs.github.com/rest"
            })
            .to_string(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a 403 Forbidden response.
    pub fn forbidden(message: &str) -> Self {
        Self {
            status: 403,
            body: serde_json::json!({
                "message": message,
                "documentation_url": "https://docs.github.com/rest"
            })
            .to_string(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a 422 Validation Failed response.
    pub fn validation_failed(message: &str, errors: Vec<(&str, &str, &str)>) -> Self {
        let errors: Vec<_> = errors
            .into_iter()
            .map(|(resource, field, code)| {
                serde_json::json!({
                    "resource": resource,
                    "field": field,
                    "code": code
                })
            })
            .collect();

        Self {
            status: 422,
            body: serde_json::json!({
                "message": message,
                "errors": errors,
                "documentation_url": "https://docs.github.com/rest"
            })
            .to_string(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Creates a rate limit exceeded response.
    pub fn rate_limited() -> Self {
        let reset_at = Utc::now() + Duration::minutes(1);
        let mut headers = HashMap::new();
        headers.insert("x-ratelimit-limit".to_string(), "5000".to_string());
        headers.insert("x-ratelimit-remaining".to_string(), "0".to_string());
        headers.insert(
            "x-ratelimit-reset".to_string(),
            reset_at.timestamp().to_string(),
        );
        headers.insert("retry-after".to_string(), "60".to_string());

        Self {
            status: 403,
            body: serde_json::json!({
                "message": "API rate limit exceeded",
                "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
            })
            .to_string(),
            headers,
            delay: None,
        }
    }

    /// Creates a 500 Internal Server Error response.
    pub fn server_error(message: &str) -> Self {
        Self {
            status: 500,
            body: serde_json::json!({
                "message": message
            })
            .to_string(),
            headers: HashMap::new(),
            delay: None,
        }
    }

    /// Adds a delay to the response.
    pub fn with_delay(mut self, delay: std::time::Duration) -> Self {
        self.delay = Some(delay);
        self
    }

    /// Adds a header to the response.
    pub fn with_header(mut self, key: &str, value: &str) -> Self {
        self.headers.insert(key.to_string(), value.to_string());
        self
    }

    /// Adds rate limit headers.
    pub fn with_rate_limit(mut self, limit: u32, remaining: u32, reset_timestamp: i64) -> Self {
        self.headers
            .insert("x-ratelimit-limit".to_string(), limit.to_string());
        self.headers
            .insert("x-ratelimit-remaining".to_string(), remaining.to_string());
        self.headers
            .insert("x-ratelimit-reset".to_string(), reset_timestamp.to_string());
        self
    }
}

/// A recorded mock request.
#[derive(Debug, Clone)]
pub struct MockRequest {
    /// HTTP method.
    pub method: String,
    /// Request path.
    pub path: String,
    /// Query parameters.
    pub query: Option<String>,
    /// Request body.
    pub body: Option<String>,
    /// Timestamp.
    pub timestamp: DateTime<Utc>,
}

/// Default behavior for unmatched requests.
#[derive(Debug, Clone, Copy)]
pub enum DefaultBehavior {
    /// Return 404 for unmatched requests.
    NotFound,
    /// Return an error for unmatched requests.
    Error,
    /// Panic on unmatched requests.
    Panic,
}

impl Default for DefaultBehavior {
    fn default() -> Self {
        DefaultBehavior::NotFound
    }
}

impl Default for MockGitHubClient {
    fn default() -> Self {
        Self::new()
    }
}

impl MockGitHubClient {
    /// Creates a new mock client.
    pub fn new() -> Self {
        Self {
            responses: Arc::new(RwLock::new(ResponseStore::default())),
            requests: Arc::new(RwLock::new(Vec::new())),
            default_behavior: DefaultBehavior::default(),
        }
    }

    /// Sets the default behavior for unmatched requests.
    pub fn with_default_behavior(mut self, behavior: DefaultBehavior) -> Self {
        self.default_behavior = behavior;
        self
    }

    /// Registers a response for a given method and path.
    pub fn register(&self, method: &str, path: &str, response: MockResponse) {
        let key = format!("{}:{}", method.to_uppercase(), path);
        let mut store = self.responses.write().unwrap();
        store.responses.entry(key).or_default().push(response);
    }

    /// Registers a GET response.
    pub fn on_get(&self, path: &str, response: MockResponse) {
        self.register("GET", path, response);
    }

    /// Registers a POST response.
    pub fn on_post(&self, path: &str, response: MockResponse) {
        self.register("POST", path, response);
    }

    /// Registers a PUT response.
    pub fn on_put(&self, path: &str, response: MockResponse) {
        self.register("PUT", path, response);
    }

    /// Registers a PATCH response.
    pub fn on_patch(&self, path: &str, response: MockResponse) {
        self.register("PATCH", path, response);
    }

    /// Registers a DELETE response.
    pub fn on_delete(&self, path: &str, response: MockResponse) {
        self.register("DELETE", path, response);
    }

    /// Makes a mock request.
    pub async fn request<T: DeserializeOwned>(
        &self,
        method: &str,
        path: &str,
        body: Option<&impl Serialize>,
    ) -> GitHubResult<T> {
        // Record request
        {
            let mut requests = self.requests.write().unwrap();
            requests.push(MockRequest {
                method: method.to_string(),
                path: path.to_string(),
                query: None,
                body: body.map(|b| serde_json::to_string(b).unwrap_or_default()),
                timestamp: Utc::now(),
            });
        }

        // Get response
        let key = format!("{}:{}", method.to_uppercase(), path);
        let response = {
            let mut store = self.responses.write().unwrap();
            store
                .responses
                .get_mut(&key)
                .and_then(|responses| {
                    if !responses.is_empty() {
                        Some(responses.remove(0))
                    } else {
                        None
                    }
                })
        };

        match response {
            Some(resp) => {
                // Apply delay if specified
                if let Some(delay) = resp.delay {
                    tokio::time::sleep(delay).await;
                }

                // Check status code
                if resp.status >= 200 && resp.status < 300 {
                    if resp.body.is_empty() {
                        // For 204 No Content, return default
                        serde_json::from_str("null").map_err(|e| {
                            GitHubError::new(
                                GitHubErrorKind::DeserializationError,
                                format!("Failed to deserialize response: {}", e),
                            )
                        })
                    } else {
                        serde_json::from_str(&resp.body).map_err(|e| {
                            GitHubError::new(
                                GitHubErrorKind::DeserializationError,
                                format!("Failed to deserialize response: {}", e),
                            )
                        })
                    }
                } else {
                    Err(GitHubError::from_response(
                        resp.status,
                        resp.body.clone(),
                        None,
                        None,
                    ))
                }
            }
            None => match self.default_behavior {
                DefaultBehavior::NotFound => Err(GitHubError::not_found(format!(
                    "No mock response for {} {}",
                    method, path
                ))),
                DefaultBehavior::Error => Err(GitHubError::new(
                    GitHubErrorKind::Unknown,
                    format!("No mock response for {} {}", method, path),
                )),
                DefaultBehavior::Panic => {
                    panic!("No mock response for {} {}", method, path);
                }
            },
        }
    }

    /// Makes a mock request without response body.
    pub async fn request_no_response(
        &self,
        method: &str,
        path: &str,
        body: Option<&impl Serialize>,
    ) -> GitHubResult<()> {
        // Record request
        {
            let mut requests = self.requests.write().unwrap();
            requests.push(MockRequest {
                method: method.to_string(),
                path: path.to_string(),
                query: None,
                body: body.map(|b| serde_json::to_string(b).unwrap_or_default()),
                timestamp: Utc::now(),
            });
        }

        // Get response
        let key = format!("{}:{}", method.to_uppercase(), path);
        let response = {
            let mut store = self.responses.write().unwrap();
            store
                .responses
                .get_mut(&key)
                .and_then(|responses| {
                    if !responses.is_empty() {
                        Some(responses.remove(0))
                    } else {
                        None
                    }
                })
        };

        match response {
            Some(resp) => {
                if let Some(delay) = resp.delay {
                    tokio::time::sleep(delay).await;
                }

                if resp.status >= 200 && resp.status < 300 {
                    Ok(())
                } else {
                    Err(GitHubError::from_response(
                        resp.status,
                        resp.body.clone(),
                        None,
                        None,
                    ))
                }
            }
            None => match self.default_behavior {
                DefaultBehavior::NotFound => Err(GitHubError::not_found(format!(
                    "No mock response for {} {}",
                    method, path
                ))),
                DefaultBehavior::Error => Err(GitHubError::new(
                    GitHubErrorKind::Unknown,
                    format!("No mock response for {} {}", method, path),
                )),
                DefaultBehavior::Panic => {
                    panic!("No mock response for {} {}", method, path);
                }
            },
        }
    }

    /// Gets all recorded requests.
    pub fn requests(&self) -> Vec<MockRequest> {
        self.requests.read().unwrap().clone()
    }

    /// Gets requests matching a method and path pattern.
    pub fn requests_matching(&self, method: &str, path_pattern: &str) -> Vec<MockRequest> {
        self.requests
            .read()
            .unwrap()
            .iter()
            .filter(|r| {
                r.method.eq_ignore_ascii_case(method)
                    && (r.path == path_pattern || r.path.starts_with(path_pattern))
            })
            .cloned()
            .collect()
    }

    /// Clears recorded requests.
    pub fn clear_requests(&self) {
        self.requests.write().unwrap().clear();
    }

    /// Clears all registered responses.
    pub fn clear_responses(&self) {
        self.responses.write().unwrap().responses.clear();
    }

    /// Resets the mock client (clears requests and responses).
    pub fn reset(&self) {
        self.clear_requests();
        self.clear_responses();
    }

    /// Verifies that a specific request was made.
    pub fn verify_request(&self, method: &str, path: &str) -> bool {
        self.requests.read().unwrap().iter().any(|r| {
            r.method.eq_ignore_ascii_case(method) && r.path == path
        })
    }

    /// Gets the count of requests made.
    pub fn request_count(&self) -> usize {
        self.requests.read().unwrap().len()
    }
}

/// Test fixtures for common GitHub types.
pub mod fixtures {
    use super::*;

    /// Creates a test user.
    pub fn user(login: &str) -> User {
        User {
            id: 1,
            node_id: format!("MDQ6VXNlcjE={}", login),
            login: login.to_string(),
            avatar_url: format!("https://avatars.githubusercontent.com/u/1?v=4"),
            html_url: format!("https://github.com/{}", login),
            user_type: "User".to_string(),
        }
    }

    /// Creates a test repository.
    pub fn repository(owner: &str, name: &str) -> Repository {
        Repository {
            id: 1,
            node_id: "MDEwOlJlcG9zaXRvcnkx".to_string(),
            name: name.to_string(),
            full_name: format!("{}/{}", owner, name),
            description: Some("A test repository".to_string()),
            private: false,
            fork: false,
            html_url: format!("https://github.com/{}/{}", owner, name),
            clone_url: format!("https://github.com/{}/{}.git", owner, name),
            ssh_url: format!("git@github.com:{}/{}.git", owner, name),
            default_branch: "main".to_string(),
            owner: user(owner),
            archived: false,
            disabled: false,
            visibility: Some("public".to_string()),
            pushed_at: Some("2024-01-01T00:00:00Z".to_string()),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            stargazers_count: 100,
            watchers_count: 100,
            forks_count: 10,
            open_issues_count: 5,
            language: Some("Rust".to_string()),
            topics: Some(vec!["rust".to_string(), "api".to_string()]),
            has_issues: true,
            has_projects: true,
            has_wiki: true,
            has_downloads: true,
            license: None,
        }
    }

    /// Creates a test issue.
    pub fn issue(owner: &str, repo: &str, number: u32) -> Issue {
        Issue {
            id: number as u64,
            node_id: format!("I_kwDO{}", number),
            number,
            title: format!("Test issue #{}", number),
            body: Some("This is a test issue".to_string()),
            state: IssueState::Open,
            state_reason: None,
            user: user("testuser"),
            labels: vec![],
            assignees: vec![],
            milestone: None,
            locked: false,
            comments: 0,
            pull_request: None,
            html_url: format!("https://github.com/{}/{}/issues/{}", owner, repo, number),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            closed_at: None,
        }
    }

    /// Creates a test pull request.
    pub fn pull_request(owner: &str, repo: &str, number: u32) -> PullRequest {
        PullRequest {
            id: number as u64,
            node_id: format!("PR_kwDO{}", number),
            number,
            title: format!("Test PR #{}", number),
            body: Some("This is a test pull request".to_string()),
            state: PullRequestState::Open,
            user: user("testuser"),
            head: PullRequestBranch {
                label: format!("testuser:feature-{}", number),
                git_ref: format!("feature-{}", number),
                sha: "abc123".to_string(),
                user: Some(user("testuser")),
                repo: Some(Box::new(repository(owner, repo))),
            },
            base: PullRequestBranch {
                label: format!("{}:main", owner),
                git_ref: "main".to_string(),
                sha: "def456".to_string(),
                user: Some(user(owner)),
                repo: Some(Box::new(repository(owner, repo))),
            },
            draft: false,
            merged: false,
            mergeable: Some(true),
            mergeable_state: Some("clean".to_string()),
            merged_by: None,
            merge_commit_sha: None,
            rebaseable: Some(true),
            comments: 0,
            review_comments: 0,
            commits: 1,
            additions: 10,
            deletions: 5,
            changed_files: 2,
            labels: vec![],
            milestone: None,
            assignees: vec![],
            requested_reviewers: vec![],
            html_url: format!("https://github.com/{}/{}/pull/{}", owner, repo, number),
            diff_url: format!(
                "https://github.com/{}/{}/pull/{}.diff",
                owner, repo, number
            ),
            patch_url: format!(
                "https://github.com/{}/{}/pull/{}.patch",
                owner, repo, number
            ),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            closed_at: None,
            merged_at: None,
        }
    }

    /// Creates a test label.
    pub fn label(name: &str, color: &str) -> Label {
        Label {
            id: 1,
            node_id: "LA_kwDO".to_string(),
            name: name.to_string(),
            color: color.to_string(),
            description: Some(format!("The {} label", name)),
            default: false,
        }
    }

    /// Creates a test branch.
    pub fn branch(name: &str) -> Branch {
        Branch {
            name: name.to_string(),
            commit: BranchCommit {
                sha: "abc123def456".to_string(),
                url: format!("https://api.github.com/repos/owner/repo/commits/abc123def456"),
            },
            protected: false,
            protection: None,
            protection_url: None,
        }
    }

    /// Creates a test workflow.
    pub fn workflow(name: &str, id: u64) -> Workflow {
        Workflow {
            id,
            node_id: format!("W_kwDO{}", id),
            name: name.to_string(),
            path: format!(".github/workflows/{}.yml", name.to_lowercase().replace(' ', "-")),
            state: WorkflowState::Active,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            url: format!("https://api.github.com/repos/owner/repo/actions/workflows/{}", id),
            html_url: format!("https://github.com/owner/repo/actions/workflows/{}.yml", name.to_lowercase().replace(' ', "-")),
            badge_url: format!("https://github.com/owner/repo/workflows/{}/badge.svg", name),
        }
    }

    /// Creates rate limit info.
    pub fn rate_limit_info(limit: u32, remaining: u32) -> RateLimitInfo {
        RateLimitInfo {
            limit,
            remaining,
            reset_at: Utc::now() + Duration::hours(1),
            retry_after: None,
            resource: Some("core".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_client_basic() {
        let mock = MockGitHubClient::new();

        let repo = fixtures::repository("octocat", "hello-world");
        mock.on_get("/repos/octocat/hello-world", MockResponse::ok(&repo));

        let result: Repository = mock
            .request("GET", "/repos/octocat/hello-world", Option::<&()>::None)
            .await
            .unwrap();

        assert_eq!(result.full_name, "octocat/hello-world");
        assert!(mock.verify_request("GET", "/repos/octocat/hello-world"));
    }

    #[tokio::test]
    async fn test_mock_client_error() {
        let mock = MockGitHubClient::new();
        mock.on_get("/repos/octocat/notfound", MockResponse::not_found("Not Found"));

        let result: GitHubResult<Repository> = mock
            .request("GET", "/repos/octocat/notfound", Option::<&()>::None)
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_fixtures() {
        let user = fixtures::user("octocat");
        assert_eq!(user.login, "octocat");

        let repo = fixtures::repository("octocat", "hello-world");
        assert_eq!(repo.full_name, "octocat/hello-world");

        let issue = fixtures::issue("octocat", "hello-world", 1);
        assert_eq!(issue.number, 1);
    }
}
