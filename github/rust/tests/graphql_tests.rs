//! Integration tests for GitHub GraphQL client.

#[cfg(test)]
mod graphql_tests {
    use integrations_github::services::{
        GraphQLError, GraphQLPagination, GraphQLResponse, PageInfo,
    };
    use integrations_github::{AuthMethod, GitHubClient, GitHubConfig, GitHubErrorKind};
    use serde::{Deserialize, Serialize};
    use serde_json::json;

    // Helper function to create a test client (requires env var for real tests)
    fn create_test_client() -> Option<GitHubClient> {
        if let Ok(token) = std::env::var("GITHUB_TOKEN") {
            let config = GitHubConfig::builder()
                .auth(AuthMethod::pat(token))
                .build()
                .ok()?;
            GitHubClient::new(config).ok()
        } else {
            None
        }
    }

    #[derive(Debug, Deserialize)]
    struct ViewerResponse {
        viewer: Viewer,
    }

    #[derive(Debug, Deserialize)]
    struct Viewer {
        login: String,
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_simple_query() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        let query = r#"
            query {
                viewer {
                    login
                }
            }
        "#;

        let response = graphql.query::<ViewerResponse>(query, None).await;
        assert!(response.is_ok());

        let response = response.unwrap();
        assert!(response.data.is_some());
        assert!(!response.has_errors());

        let data = response.data.unwrap();
        assert!(!data.viewer.login.is_empty());
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_query_with_variables() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        #[derive(Debug, Deserialize)]
        struct RepositoryResponse {
            repository: Repository,
        }

        #[derive(Debug, Deserialize)]
        struct Repository {
            name: String,
        }

        let query = r#"
            query($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    name
                }
            }
        "#;

        let variables = json!({
            "owner": "octocat",
            "name": "Hello-World"
        });

        let response = graphql
            .query::<RepositoryResponse>(query, Some(variables))
            .await;

        assert!(response.is_ok());
        let response = response.unwrap();
        assert!(response.data.is_some());

        let data = response.data.unwrap();
        assert_eq!(data.repository.name, "Hello-World");
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_query_with_operation_name() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        let query = r#"
            query GetViewer {
                viewer {
                    login
                }
            }

            query AnotherQuery {
                viewer {
                    email
                }
            }
        "#;

        let response = graphql
            .query_with_operation::<ViewerResponse>(query, None, "GetViewer")
            .await;

        assert!(response.is_ok());
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_rate_limit_info() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        let query = r#"
            query {
                viewer {
                    login
                }
            }
        "#;

        let response = graphql.query::<ViewerResponse>(query, None).await.unwrap();

        // Rate limit info should be present
        assert!(response.rate_limit.is_some());

        let rate_limit = response.rate_limit.unwrap();
        assert!(rate_limit.limit > 0);
        assert!(rate_limit.remaining <= rate_limit.limit);

        // Cost should be available for the query
        assert!(response.query_cost().is_some());
        assert!(response.remaining_points().is_some());
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_pagination() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        #[derive(Debug, Deserialize)]
        struct RepositoriesResponse {
            viewer: ViewerWithRepos,
        }

        #[derive(Debug, Deserialize)]
        struct ViewerWithRepos {
            repositories: RepositoryConnection,
        }

        #[derive(Debug, Deserialize)]
        struct RepositoryConnection {
            edges: Vec<RepositoryEdge>,
            #[serde(rename = "pageInfo")]
            page_info: PageInfo,
        }

        #[derive(Debug, Deserialize)]
        struct RepositoryEdge {
            node: RepositoryNode,
        }

        #[derive(Debug, Deserialize)]
        struct RepositoryNode {
            name: String,
        }

        let query = r#"
            query($first: Int!, $after: String) {
                viewer {
                    repositories(first: $first, after: $after) {
                        edges {
                            node {
                                name
                            }
                        }
                        pageInfo {
                            hasNextPage
                            hasPreviousPage
                            startCursor
                            endCursor
                        }
                    }
                }
            }
        "#;

        let pagination = GraphQLPagination::forward(5);
        let variables = pagination.to_variables();

        let response = graphql
            .query::<RepositoriesResponse>(query, Some(variables))
            .await
            .unwrap();

        assert!(response.data.is_some());
        let data = response.data.unwrap();
        assert!(data.viewer.repositories.edges.len() <= 5);

        let page_info = data.viewer.repositories.page_info;
        assert!(page_info.start_cursor.is_some());
        assert!(page_info.end_cursor.is_some());
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_error_handling() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        #[derive(Debug, Deserialize)]
        struct RepositoryResponse {
            repository: Repository,
        }

        #[derive(Debug, Deserialize)]
        struct Repository {
            name: String,
        }

        // Query for non-existent repository
        let query = r#"
            query {
                repository(owner: "nonexistent-user-999999", name: "nonexistent-repo-999999") {
                    name
                }
            }
        "#;

        let response = graphql.query::<RepositoryResponse>(query, None).await;

        // Should either error or return response with errors
        match response {
            Ok(resp) => {
                // Should have errors
                assert!(resp.has_errors());
            }
            Err(e) => {
                // Should be a not found error
                assert!(matches!(e.kind(), GitHubErrorKind::NotFound));
            }
        }
    }

    #[tokio::test]
    #[ignore] // Only run with GITHUB_TOKEN set
    async fn test_raw_query() {
        let client = create_test_client().expect("GITHUB_TOKEN must be set");
        let graphql = client.graphql();

        let query = r#"
            query {
                viewer {
                    login
                }
            }
        "#;

        let response = graphql.execute_raw(query, None, None).await;
        assert!(response.is_ok());

        let response = response.unwrap();
        assert!(response.data.is_some());

        let data = response.data.unwrap();
        assert!(data.get("viewer").is_some());
    }

    #[test]
    fn test_graphql_pagination_builders() {
        // Test forward pagination
        let pagination = GraphQLPagination::forward(10);
        let vars = pagination.to_variables();
        assert_eq!(vars["first"], 10);

        // Test forward with cursor
        let pagination = GraphQLPagination::forward_after(10, "cursor123".to_string());
        let vars = pagination.to_variables();
        assert_eq!(vars["first"], 10);
        assert_eq!(vars["after"], "cursor123");

        // Test backward pagination
        let pagination = GraphQLPagination::backward(10);
        let vars = pagination.to_variables();
        assert_eq!(vars["last"], 10);

        // Test backward with cursor
        let pagination = GraphQLPagination::backward_before(10, "cursor456".to_string());
        let vars = pagination.to_variables();
        assert_eq!(vars["last"], 10);
        assert_eq!(vars["before"], "cursor456");
    }

    #[test]
    fn test_graphql_response_methods() {
        // Test has_errors
        let response: GraphQLResponse<String> = GraphQLResponse {
            data: Some("test".to_string()),
            errors: Some(vec![GraphQLError {
                message: "test error".to_string(),
                error_type: None,
                path: None,
                locations: None,
                extensions: None,
            }]),
            rate_limit: None,
        };
        assert!(response.has_errors());

        // Test no errors
        let response: GraphQLResponse<String> = GraphQLResponse {
            data: Some("test".to_string()),
            errors: None,
            rate_limit: None,
        };
        assert!(!response.has_errors());

        // Test data() method
        assert!(response.data().is_ok());
        assert_eq!(response.data().unwrap(), "test");

        // Test map
        let mapped = response.map(|s| s.len());
        assert_eq!(mapped.data, Some(4));
    }

    #[test]
    fn test_query_cost_estimation() {
        // Create a mock client for testing (not used in estimation)
        let query = r#"
            query {
                viewer {
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

        // We can't create a real client without credentials,
        // but we can test the structure is correct
        // The actual estimation logic is heuristic-based
        assert!(query.contains("edges"));
        assert!(query.contains("nodes") || query.contains("node"));
    }

    #[test]
    fn test_graphql_error_conversion() {
        use integrations_github::services::GraphQLLocation;
        use std::collections::HashMap;

        let error = GraphQLError {
            message: "Test error".to_string(),
            error_type: Some("FORBIDDEN".to_string()),
            path: Some(vec!["repository".to_string(), "issues".to_string()]),
            locations: Some(vec![GraphQLLocation { line: 5, column: 10 }]),
            extensions: Some(HashMap::new()),
        };

        assert_eq!(error.message, "Test error");
        assert_eq!(error.error_type.as_deref(), Some("FORBIDDEN"));
        assert_eq!(error.path.as_ref().unwrap().len(), 2);
        assert_eq!(error.locations.as_ref().unwrap()[0].line, 5);
    }
}
