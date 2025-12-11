//! GraphQL client for GitHub's GraphQL API v4.

use crate::client::GitHubClient;
use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult, RateLimitInfo};
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// GraphQL client for GitHub's GraphQL API.
pub struct GraphQLService<'a> {
    client: &'a GitHubClient,
}

impl<'a> GraphQLService<'a> {
    /// Creates a new GraphQL service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Executes a GraphQL query with variables.
    pub async fn query<T: serde::de::DeserializeOwned>(
        &self,
        query: &str,
        variables: Option<serde_json::Value>,
    ) -> GitHubResult<GraphQLResponse<T>> {
        self.execute(query, variables, None).await
    }

    /// Executes a GraphQL mutation with variables.
    pub async fn mutation<T: serde::de::DeserializeOwned>(
        &self,
        mutation: &str,
        variables: Option<serde_json::Value>,
    ) -> GitHubResult<GraphQLResponse<T>> {
        self.execute(mutation, variables, None).await
    }

    /// Executes a GraphQL query with variables and operation name.
    pub async fn query_with_operation<T: serde::de::DeserializeOwned>(
        &self,
        query: &str,
        variables: Option<serde_json::Value>,
        operation_name: &str,
    ) -> GitHubResult<GraphQLResponse<T>> {
        self.execute(query, variables, Some(operation_name)).await
    }

    /// Executes a raw GraphQL request and returns the response.
    pub async fn execute_raw(
        &self,
        query: &str,
        variables: Option<serde_json::Value>,
        operation_name: Option<&str>,
    ) -> GitHubResult<GraphQLResponse<serde_json::Value>> {
        self.execute(query, variables, operation_name).await
    }

    /// Internal method to execute GraphQL requests.
    async fn execute<T: serde::de::DeserializeOwned>(
        &self,
        query: &str,
        variables: Option<serde_json::Value>,
        operation_name: Option<&str>,
    ) -> GitHubResult<GraphQLResponse<T>> {
        let request = GraphQLRequest {
            query: query.to_string(),
            variables,
            operation_name: operation_name.map(String::from),
        };

        // GitHub's GraphQL endpoint
        let response = self.client.post::<GraphQLRawResponse, _>("/graphql", &request).await?;

        // Parse the response
        let graphql_response = self.parse_graphql_response::<T>(response)?;

        Ok(graphql_response)
    }

    /// Parses a raw GraphQL response into a typed response.
    fn parse_graphql_response<T: serde::de::DeserializeOwned>(
        &self,
        raw: GraphQLRawResponse,
    ) -> GitHubResult<GraphQLResponse<T>> {
        // Parse errors first
        let errors = raw.errors.map(|errs| {
            errs.into_iter()
                .map(GraphQLError::from)
                .collect::<Vec<_>>()
        });

        // If there are errors, check if we should fail fast
        if let Some(ref err_list) = errors {
            // Check for critical errors that should fail the request
            for err in err_list {
                match err.error_type.as_deref() {
                    Some("RATE_LIMITED") => {
                        return Err(GitHubError::new(
                            GitHubErrorKind::GraphQlRateLimitExceeded,
                            format!("GraphQL rate limit exceeded: {}", err.message),
                        ));
                    }
                    Some("MAX_NODE_LIMIT_EXCEEDED") => {
                        return Err(GitHubError::new(
                            GitHubErrorKind::NodeLimitExceeded,
                            format!("GraphQL node limit exceeded: {}", err.message),
                        ));
                    }
                    Some("FORBIDDEN") => {
                        return Err(GitHubError::new(
                            GitHubErrorKind::Forbidden,
                            format!("GraphQL forbidden: {}", err.message),
                        ));
                    }
                    Some("NOT_FOUND") => {
                        return Err(GitHubError::new(
                            GitHubErrorKind::NotFound,
                            format!("GraphQL not found: {}", err.message),
                        ));
                    }
                    _ => {}
                }
            }
        }

        // Parse data
        let data = if let Some(raw_data) = raw.data {
            Some(serde_json::from_value(raw_data).map_err(|e| {
                GitHubError::new(
                    GitHubErrorKind::DeserializationError,
                    format!("Failed to deserialize GraphQL data: {}", e),
                )
            })?)
        } else {
            None
        };

        // Extract rate limit information from extensions
        let rate_limit = raw.extensions.and_then(|ext| ext.rate_limit);

        Ok(GraphQLResponse {
            data,
            errors,
            rate_limit,
        })
    }

    /// Estimates the query cost for a given GraphQL query.
    ///
    /// This is a simple heuristic-based estimation. For accurate costs,
    /// use the actual cost returned in the response extensions.
    pub fn estimate_query_cost(&self, query: &str) -> u32 {
        // Simple heuristic: count field selections and multiply by average cost
        // This is a rough estimate; actual costs are returned by GitHub
        let field_count = query.matches(|c: char| c == '{' || c == '}').count() / 2;
        let connection_count = query.matches("edges").count() + query.matches("nodes").count();

        // Base cost + fields + extra for connections
        1 + (field_count as u32) + (connection_count as u32 * 10)
    }
}

/// GraphQL request payload.
#[derive(Debug, Clone, Serialize)]
struct GraphQLRequest {
    /// The GraphQL query or mutation string.
    pub query: String,
    /// Optional variables for the query.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    /// Optional operation name when query contains multiple operations.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "operationName")]
    pub operation_name: Option<String>,
}

/// Raw GraphQL response from GitHub.
#[derive(Debug, Clone, Deserialize)]
struct GraphQLRawResponse {
    /// Response data (if successful).
    pub data: Option<serde_json::Value>,
    /// GraphQL errors (if any).
    pub errors: Option<Vec<GraphQLRawError>>,
    /// Extensions containing metadata like rate limit info.
    pub extensions: Option<GraphQLExtensions>,
}

/// Raw GraphQL error item from GitHub.
#[derive(Debug, Clone, Deserialize)]
struct GraphQLRawError {
    /// Error message.
    pub message: String,
    /// Error type (e.g., "RATE_LIMITED", "NOT_FOUND").
    #[serde(rename = "type")]
    pub error_type: Option<String>,
    /// Path to the field that caused the error.
    pub path: Option<Vec<serde_json::Value>>,
    /// Source locations in the query.
    pub locations: Option<Vec<GraphQLLocation>>,
    /// Additional error extensions.
    pub extensions: Option<HashMap<String, serde_json::Value>>,
}

/// GraphQL response extensions containing metadata.
#[derive(Debug, Clone, Deserialize)]
struct GraphQLExtensions {
    /// Rate limit information for GraphQL API.
    #[serde(rename = "rateLimit")]
    pub rate_limit: Option<GraphQLRateLimit>,
}

/// GraphQL-specific rate limit information.
#[derive(Debug, Clone, Deserialize)]
pub struct GraphQLRateLimit {
    /// Maximum points allowed per hour.
    pub limit: u32,
    /// Points remaining in current window.
    pub remaining: u32,
    /// Time when the rate limit resets (ISO 8601).
    #[serde(rename = "resetAt")]
    pub reset_at: String,
    /// Cost of the current query in points.
    pub cost: Option<u32>,
    /// Node count for the query.
    #[serde(rename = "nodeCount")]
    pub node_count: Option<u32>,
}

/// Typed GraphQL response.
#[derive(Debug, Clone)]
pub struct GraphQLResponse<T> {
    /// Response data (if successful).
    pub data: Option<T>,
    /// GraphQL errors (if any).
    pub errors: Option<Vec<GraphQLError>>,
    /// Rate limit information.
    pub rate_limit: Option<GraphQLRateLimit>,
}

impl<T> GraphQLResponse<T> {
    /// Returns true if the response contains errors.
    pub fn has_errors(&self) -> bool {
        self.errors.as_ref().map(|e| !e.is_empty()).unwrap_or(false)
    }

    /// Returns the data or an error if not present.
    pub fn data(&self) -> GitHubResult<&T> {
        self.data.as_ref().ok_or_else(|| {
            GitHubError::new(
                GitHubErrorKind::QueryError,
                "GraphQL response contains no data",
            )
        })
    }

    /// Consumes the response and returns the data or an error.
    pub fn into_data(self) -> GitHubResult<T> {
        self.data.ok_or_else(|| {
            GitHubError::new(
                GitHubErrorKind::QueryError,
                "GraphQL response contains no data",
            )
        })
    }

    /// Maps the data to a different type using a transformation function.
    pub fn map<U, F>(self, f: F) -> GraphQLResponse<U>
    where
        F: FnOnce(T) -> U,
    {
        GraphQLResponse {
            data: self.data.map(f),
            errors: self.errors,
            rate_limit: self.rate_limit,
        }
    }

    /// Returns the rate limit cost if available.
    pub fn query_cost(&self) -> Option<u32> {
        self.rate_limit.as_ref().and_then(|rl| rl.cost)
    }

    /// Returns the remaining rate limit points.
    pub fn remaining_points(&self) -> Option<u32> {
        self.rate_limit.as_ref().map(|rl| rl.remaining)
    }
}

/// GraphQL error with detailed information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLError {
    /// Error message.
    pub message: String,
    /// Error type (e.g., "RATE_LIMITED", "NOT_FOUND").
    #[serde(rename = "type")]
    pub error_type: Option<String>,
    /// Path to the field that caused the error.
    pub path: Option<Vec<String>>,
    /// Source locations in the query.
    pub locations: Option<Vec<GraphQLLocation>>,
    /// Additional error extensions.
    pub extensions: Option<HashMap<String, serde_json::Value>>,
}

impl From<GraphQLRawError> for GraphQLError {
    fn from(raw: GraphQLRawError) -> Self {
        Self {
            message: raw.message,
            error_type: raw.error_type,
            path: raw.path.map(|p| {
                p.into_iter()
                    .filter_map(|v| match v {
                        serde_json::Value::String(s) => Some(s),
                        serde_json::Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .collect()
            }),
            locations: raw.locations,
            extensions: raw.extensions,
        }
    }
}

/// Location in GraphQL query source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLLocation {
    /// Line number (1-indexed).
    pub line: u32,
    /// Column number (1-indexed).
    pub column: u32,
}

/// Helper for building paginated GraphQL queries.
pub struct GraphQLPagination {
    /// Number of items per page.
    pub first: Option<u32>,
    /// Cursor for fetching items after this point.
    pub after: Option<String>,
    /// Number of items per page (backwards).
    pub last: Option<u32>,
    /// Cursor for fetching items before this point.
    pub before: Option<String>,
}

impl GraphQLPagination {
    /// Creates a forward pagination with the given page size.
    pub fn forward(first: u32) -> Self {
        Self {
            first: Some(first),
            after: None,
            last: None,
            before: None,
        }
    }

    /// Creates a forward pagination starting after the given cursor.
    pub fn forward_after(first: u32, after: String) -> Self {
        Self {
            first: Some(first),
            after: Some(after),
            last: None,
            before: None,
        }
    }

    /// Creates a backward pagination with the given page size.
    pub fn backward(last: u32) -> Self {
        Self {
            first: None,
            after: None,
            last: Some(last),
            before: None,
        }
    }

    /// Creates a backward pagination ending before the given cursor.
    pub fn backward_before(last: u32, before: String) -> Self {
        Self {
            first: None,
            after: None,
            last: Some(last),
            before: Some(before),
        }
    }

    /// Converts pagination to JSON value for GraphQL variables.
    pub fn to_variables(&self) -> serde_json::Value {
        let mut map = serde_json::Map::new();

        if let Some(first) = self.first {
            map.insert("first".to_string(), serde_json::json!(first));
        }
        if let Some(ref after) = self.after {
            map.insert("after".to_string(), serde_json::json!(after));
        }
        if let Some(last) = self.last {
            map.insert("last".to_string(), serde_json::json!(last));
        }
        if let Some(ref before) = self.before {
            map.insert("before".to_string(), serde_json::json!(before));
        }

        serde_json::Value::Object(map)
    }
}

/// Common PageInfo type for GraphQL pagination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    /// Whether there are more items when paginating forward.
    #[serde(rename = "hasNextPage")]
    pub has_next_page: bool,
    /// Whether there are more items when paginating backward.
    #[serde(rename = "hasPreviousPage")]
    pub has_previous_page: bool,
    /// Cursor for the first item in this page.
    #[serde(rename = "startCursor")]
    pub start_cursor: Option<String>,
    /// Cursor for the last item in this page.
    #[serde(rename = "endCursor")]
    pub end_cursor: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_graphql_pagination_forward() {
        let pagination = GraphQLPagination::forward(10);
        let vars = pagination.to_variables();

        assert_eq!(vars["first"], 10);
        assert!(vars.get("after").is_none());
    }

    #[test]
    fn test_graphql_pagination_forward_after() {
        let pagination = GraphQLPagination::forward_after(10, "cursor123".to_string());
        let vars = pagination.to_variables();

        assert_eq!(vars["first"], 10);
        assert_eq!(vars["after"], "cursor123");
    }

    #[test]
    fn test_graphql_pagination_backward() {
        let pagination = GraphQLPagination::backward(10);
        let vars = pagination.to_variables();

        assert_eq!(vars["last"], 10);
        assert!(vars.get("before").is_none());
    }

    #[test]
    fn test_estimate_query_cost() {
        let query = r#"
            query {
                viewer {
                    login
                    repositories(first: 10) {
                        edges {
                            node {
                                name
                            }
                        }
                    }
                }
            }
        "#;

        // This is just to ensure the method runs without panicking
        // The actual cost estimation is heuristic-based
        let service = GraphQLService {
            client: unsafe { &*(std::ptr::null() as *const GitHubClient) }, // Dummy for test
        };
        let cost = service.estimate_query_cost(query);
        assert!(cost > 0);
    }

    #[test]
    fn test_graphql_response_has_errors() {
        let response: GraphQLResponse<serde_json::Value> = GraphQLResponse {
            data: Some(serde_json::json!({})),
            errors: Some(vec![GraphQLError {
                message: "Test error".to_string(),
                error_type: None,
                path: None,
                locations: None,
                extensions: None,
            }]),
            rate_limit: None,
        };

        assert!(response.has_errors());
    }

    #[test]
    fn test_graphql_response_map() {
        let response = GraphQLResponse {
            data: Some(42),
            errors: None,
            rate_limit: None,
        };

        let mapped = response.map(|n| n * 2);
        assert_eq!(mapped.data, Some(84));
    }
}
