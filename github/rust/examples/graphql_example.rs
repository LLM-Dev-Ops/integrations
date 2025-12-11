//! Example demonstrating the GitHub GraphQL client.
//!
//! This example shows how to use the GraphQL service to query GitHub's API v4.
//!
//! Run with:
//! ```
//! GITHUB_TOKEN=ghp_xxxxxxxxxxxx cargo run --example graphql_example
//! ```

use integrations_github::services::{GraphQLPagination, PageInfo};
use integrations_github::{AuthMethod, GitHubClient, GitHubConfig};
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Viewer information response.
#[derive(Debug, Deserialize)]
struct ViewerResponse {
    viewer: Viewer,
}

/// GitHub user viewer.
#[derive(Debug, Deserialize)]
struct Viewer {
    login: String,
    name: Option<String>,
    email: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

/// Repository query response.
#[derive(Debug, Deserialize)]
struct RepositoryResponse {
    repository: Repository,
}

/// Repository information.
#[derive(Debug, Deserialize)]
struct Repository {
    name: String,
    description: Option<String>,
    #[serde(rename = "stargazerCount")]
    stargazer_count: i32,
    #[serde(rename = "forkCount")]
    fork_count: i32,
    #[serde(rename = "primaryLanguage")]
    primary_language: Option<Language>,
}

/// Programming language.
#[derive(Debug, Deserialize)]
struct Language {
    name: String,
    color: Option<String>,
}

/// Paginated repositories response.
#[derive(Debug, Deserialize)]
struct RepositoriesResponse {
    viewer: ViewerWithRepos,
}

/// Viewer with repositories.
#[derive(Debug, Deserialize)]
struct ViewerWithRepos {
    repositories: RepositoryConnection,
}

/// Repository connection.
#[derive(Debug, Deserialize)]
struct RepositoryConnection {
    #[serde(rename = "totalCount")]
    total_count: i32,
    edges: Vec<RepositoryEdge>,
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
}

/// Repository edge.
#[derive(Debug, Deserialize)]
struct RepositoryEdge {
    node: RepositoryNode,
    cursor: String,
}

/// Repository node.
#[derive(Debug, Deserialize)]
struct RepositoryNode {
    name: String,
    description: Option<String>,
    #[serde(rename = "stargazerCount")]
    stargazer_count: i32,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init();

    // Get token from environment
    let token = std::env::var("GITHUB_TOKEN")
        .expect("GITHUB_TOKEN environment variable must be set");

    // Create client
    let config = GitHubConfig::builder()
        .auth(AuthMethod::pat(token))
        .build()?;

    let client = GitHubClient::new(config)?;
    let graphql = client.graphql();

    println!("=== GitHub GraphQL Examples ===\n");

    // Example 1: Simple query - Get viewer information
    println!("1. Fetching viewer information...");
    let viewer_query = r#"
        query {
            viewer {
                login
                name
                email
                createdAt
            }
        }
    "#;

    let response = graphql.query::<ViewerResponse>(viewer_query, None).await?;

    if let Some(data) = response.data {
        println!("   Logged in as: {}", data.viewer.login);
        if let Some(name) = data.viewer.name {
            println!("   Name: {}", name);
        }
        println!("   Email: {}", data.viewer.email);
        println!("   Account created: {}", data.viewer.created_at);
    }

    // Print rate limit info
    if let Some(rate_limit) = &response.rate_limit {
        println!(
            "   Query cost: {} points (remaining: {}/{})",
            rate_limit.cost.unwrap_or(0),
            rate_limit.remaining,
            rate_limit.limit
        );
    }

    println!();

    // Example 2: Query with variables
    println!("2. Fetching repository information...");
    let repo_query = r#"
        query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                name
                description
                stargazerCount
                forkCount
                primaryLanguage {
                    name
                    color
                }
            }
        }
    "#;

    let variables = json!({
        "owner": "rust-lang",
        "name": "rust"
    });

    let response = graphql
        .query::<RepositoryResponse>(repo_query, Some(variables))
        .await?;

    if let Some(data) = response.data {
        let repo = data.repository;
        println!("   Repository: {}", repo.name);
        if let Some(desc) = repo.description {
            println!("   Description: {}", desc);
        }
        println!("   Stars: {}", repo.stargazer_count);
        println!("   Forks: {}", repo.fork_count);
        if let Some(lang) = repo.primary_language {
            println!("   Primary language: {}", lang.name);
        }
    }

    if let Some(cost) = response.query_cost() {
        println!("   Query cost: {} points", cost);
    }

    println!();

    // Example 3: Pagination
    println!("3. Fetching repositories with pagination...");
    let pagination_query = r#"
        query($first: Int!, $after: String) {
            viewer {
                repositories(first: $first, after: $after, orderBy: {field: STARGAZERS, direction: DESC}) {
                    totalCount
                    edges {
                        node {
                            name
                            description
                            stargazerCount
                        }
                        cursor
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
        .query::<RepositoriesResponse>(pagination_query, Some(variables))
        .await?;

    if let Some(data) = response.data {
        let repos = data.viewer.repositories;
        println!("   Total repositories: {}", repos.total_count);
        println!("   Showing first 5:");

        for (i, edge) in repos.edges.iter().enumerate() {
            println!(
                "   {}. {} ({} stars)",
                i + 1,
                edge.node.name,
                edge.node.stargazer_count
            );
            if let Some(desc) = &edge.node.description {
                println!("      {}", desc);
            }
        }

        if repos.page_info.has_next_page {
            println!("   Has more pages available");
            if let Some(end_cursor) = repos.page_info.end_cursor {
                println!("   Next page cursor: {}", end_cursor);
            }
        }
    }

    if let Some(remaining) = response.remaining_points() {
        println!("   Remaining points: {}", remaining);
    }

    println!();

    // Example 4: Error handling
    println!("4. Demonstrating error handling...");
    let invalid_query = r#"
        query {
            repository(owner: "nonexistent-user-12345", name: "nonexistent-repo") {
                name
            }
        }
    "#;

    match graphql
        .query::<RepositoryResponse>(invalid_query, None)
        .await
    {
        Ok(response) => {
            if response.has_errors() {
                println!("   GraphQL returned errors:");
                if let Some(errors) = &response.errors {
                    for error in errors {
                        println!("   - {}", error.message);
                        if let Some(error_type) = &error.error_type {
                            println!("     Type: {}", error_type);
                        }
                    }
                }
            }
        }
        Err(e) => {
            println!("   Error: {}", e);
        }
    }

    println!();

    // Example 5: Cost estimation
    println!("5. Query cost estimation...");
    let complex_query = r#"
        query {
            viewer {
                repositories(first: 100) {
                    edges {
                        node {
                            name
                            issues(first: 50) {
                                edges {
                                    node {
                                        title
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    "#;

    let estimated_cost = graphql.estimate_query_cost(complex_query);
    println!(
        "   Estimated cost for complex query: {} points",
        estimated_cost
    );
    println!("   (Note: This is a heuristic estimate, actual costs may vary)");

    println!();
    println!("=== Examples Complete ===");

    Ok(())
}
