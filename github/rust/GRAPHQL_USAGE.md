# GitHub GraphQL Client Usage Guide

This document provides usage examples for the GitHub GraphQL client implementation.

## Overview

The GraphQL client provides access to GitHub's GraphQL API v4, which offers:
- More efficient data fetching (request exactly what you need)
- Nested resource queries in a single request
- Cost-based rate limiting (5000 points/hour)
- Cursor-based pagination

## Basic Usage

### Simple Query

```rust
use integrations_github::{GitHubClient, GitHubConfig, AuthMethod};
use serde::{Deserialize, Serialize};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GitHubConfig::builder()
        .auth(AuthMethod::pat("ghp_xxxxxxxxxxxx"))
        .build()?;

    let client = GitHubClient::new(config)?;
    let graphql = client.graphql();

    // Define your response type
    #[derive(Debug, Deserialize)]
    struct ViewerResponse {
        viewer: Viewer,
    }

    #[derive(Debug, Deserialize)]
    struct Viewer {
        login: String,
        name: Option<String>,
        email: String,
    }

    // Execute query
    let query = r#"
        query {
            viewer {
                login
                name
                email
            }
        }
    "#;

    let response = graphql.query::<ViewerResponse>(query, None).await?;

    if let Some(data) = response.data {
        println!("Logged in as: {}", data.viewer.login);
    }

    Ok(())
}
```

### Query with Variables

```rust
use serde_json::json;

#[derive(Debug, Deserialize)]
struct RepositoryResponse {
    repository: Repository,
}

#[derive(Debug, Deserialize)]
struct Repository {
    name: String,
    description: Option<String>,
    #[serde(rename = "stargazerCount")]
    stargazer_count: i32,
}

let query = r#"
    query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
            name
            description
            stargazerCount
        }
    }
"#;

let variables = json!({
    "owner": "octocat",
    "name": "Hello-World"
});

let response = graphql.query::<RepositoryResponse>(query, Some(variables)).await?;
```

### Mutations

```rust
#[derive(Debug, Deserialize)]
struct AddStarResponse {
    #[serde(rename = "addStar")]
    add_star: AddStarPayload,
}

#[derive(Debug, Deserialize)]
struct AddStarPayload {
    starrable: Starrable,
}

#[derive(Debug, Deserialize)]
struct Starrable {
    #[serde(rename = "stargazerCount")]
    stargazer_count: i32,
}

let mutation = r#"
    mutation($repositoryId: ID!) {
        addStar(input: {starrableId: $repositoryId}) {
            starrable {
                stargazerCount
            }
        }
    }
"#;

let variables = json!({
    "repositoryId": "MDEwOlJlcG9zaXRvcnkxMjk2MjY5"
});

let response = graphql.mutation::<AddStarResponse>(mutation, Some(variables)).await?;
```

## Pagination

GitHub's GraphQL API uses cursor-based pagination. The client provides helpers for this:

```rust
use integrations_github::services::{GraphQLPagination, PageInfo};

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
    node: Repository,
    cursor: String,
}

// First page
let pagination = GraphQLPagination::forward(10);
let query = r#"
    query($first: Int!, $after: String) {
        viewer {
            repositories(first: $first, after: $after) {
                edges {
                    node {
                        name
                        description
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }
"#;

let mut variables = pagination.to_variables();
let response = graphql.query::<RepositoriesResponse>(query, Some(variables)).await?;

// Subsequent pages
if let Some(data) = response.data {
    if data.viewer.repositories.page_info.has_next_page {
        if let Some(end_cursor) = data.viewer.repositories.page_info.end_cursor {
            let next_pagination = GraphQLPagination::forward_after(10, end_cursor);
            let variables = next_pagination.to_variables();
            let next_response = graphql.query::<RepositoriesResponse>(query, Some(variables)).await?;
        }
    }
}
```

## Rate Limiting

The GraphQL client provides access to rate limit information:

```rust
let response = graphql.query::<ViewerResponse>(query, None).await?;

// Check rate limit info
if let Some(rate_limit) = &response.rate_limit {
    println!("Query cost: {} points", rate_limit.cost.unwrap_or(0));
    println!("Remaining: {}/{}", rate_limit.remaining, rate_limit.limit);
    println!("Resets at: {}", rate_limit.reset_at);
}

// Or use convenience methods
if let Some(cost) = response.query_cost() {
    println!("This query cost {} points", cost);
}

if let Some(remaining) = response.remaining_points() {
    println!("{} points remaining", remaining);
}

// Estimate cost before executing (heuristic-based)
let estimated_cost = graphql.estimate_query_cost(query);
println!("Estimated cost: {} points", estimated_cost);
```

## Error Handling

The GraphQL client handles both HTTP errors and GraphQL-specific errors:

```rust
match graphql.query::<ViewerResponse>(query, None).await {
    Ok(response) => {
        // Check for partial errors
        if response.has_errors() {
            if let Some(errors) = &response.errors {
                for error in errors {
                    eprintln!("GraphQL error: {}", error.message);
                    if let Some(path) = &error.path {
                        eprintln!("  at path: {:?}", path);
                    }
                }
            }
        }

        // Still try to use data if available
        if let Ok(data) = response.data() {
            println!("Got data: {:?}", data);
        }
    }
    Err(e) => {
        use integrations_github::GitHubErrorKind;

        match e.kind() {
            GitHubErrorKind::GraphQlRateLimitExceeded => {
                eprintln!("GraphQL rate limit exceeded");
                if let Some(retry_after) = e.retry_after() {
                    eprintln!("Retry after {} seconds", retry_after);
                }
            }
            GitHubErrorKind::NodeLimitExceeded => {
                eprintln!("Too many nodes requested in query");
            }
            GitHubErrorKind::Forbidden => {
                eprintln!("Access forbidden - check token scopes");
            }
            _ => {
                eprintln!("Error: {}", e);
            }
        }
    }
}
```

## Complex Queries

### Nested Resources

```rust
#[derive(Debug, Deserialize)]
struct ComplexResponse {
    repository: RepositoryWithIssues,
}

#[derive(Debug, Deserialize)]
struct RepositoryWithIssues {
    name: String,
    issues: IssueConnection,
}

#[derive(Debug, Deserialize)]
struct IssueConnection {
    #[serde(rename = "totalCount")]
    total_count: i32,
    edges: Vec<IssueEdge>,
}

#[derive(Debug, Deserialize)]
struct IssueEdge {
    node: Issue,
}

#[derive(Debug, Deserialize)]
struct Issue {
    title: String,
    author: Option<User>,
    labels: LabelConnection,
}

#[derive(Debug, Deserialize)]
struct LabelConnection {
    nodes: Vec<Label>,
}

#[derive(Debug, Deserialize)]
struct Label {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct User {
    login: String,
}

let query = r#"
    query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
            name
            issues(first: 10, states: OPEN) {
                totalCount
                edges {
                    node {
                        title
                        author {
                            login
                        }
                        labels(first: 5) {
                            nodes {
                                name
                                color
                            }
                        }
                    }
                }
            }
        }
    }
"#;

let variables = json!({
    "owner": "octocat",
    "name": "Hello-World"
});

let response = graphql.query::<ComplexResponse>(query, Some(variables)).await?;
```

### Fragments

```rust
let query = r#"
    fragment RepoInfo on Repository {
        name
        description
        stargazerCount
        forkCount
        createdAt
    }

    query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
            ...RepoInfo
            owner {
                login
            }
        }
    }
"#;
```

### Multiple Operations

```rust
let query = r#"
    query GetUser($login: String!) {
        user(login: $login) {
            name
            email
        }
    }

    query GetRepo($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
            name
            description
        }
    }
"#;

// Specify which operation to execute
let response = graphql.query_with_operation::<UserResponse>(
    query,
    Some(json!({"login": "octocat"})),
    "GetUser"
).await?;
```

## Raw Queries

For dynamic queries or prototyping:

```rust
let query = r#"
    query {
        viewer {
            login
            repositories(first: 5) {
                nodes {
                    name
                }
            }
        }
    }
"#;

let response = graphql.execute_raw(query, None, None).await?;

if let Some(data) = response.data {
    println!("Raw data: {}", serde_json::to_string_pretty(&data)?);
}
```

## Best Practices

1. **Request Only What You Need**: GraphQL allows precise field selection
2. **Use Fragments**: Reduce duplication in complex queries
3. **Monitor Query Costs**: Stay within the 5000 points/hour limit
4. **Handle Partial Errors**: GraphQL can return both data and errors
5. **Use Pagination**: Limit the number of nodes per request
6. **Cache Results**: Reduce API calls by caching data locally
7. **Optimize Nested Queries**: Each level of nesting can increase cost

## Rate Limit Guidelines

- Simple field queries: ~1 point
- Connection with nodes: +1 point per first/last argument
- Each edge: fraction of a point
- Maximum 500,000 nodes per query

Example costs:
- Fetching user profile: 1 point
- Fetching 10 repositories: ~11 points
- Fetching 100 issues with labels: ~150-200 points

## Common Patterns

### Check Authentication Status

```rust
let query = r#"
    query {
        viewer {
            login
        }
    }
"#;

let response = graphql.query::<ViewerResponse>(query, None).await?;
```

### Search Repositories

```rust
let query = r#"
    query($query: String!, $first: Int!) {
        search(query: $query, type: REPOSITORY, first: $first) {
            repositoryCount
            edges {
                node {
                    ... on Repository {
                        name
                        description
                        stargazerCount
                    }
                }
            }
        }
    }
"#;

let variables = json!({
    "query": "language:rust stars:>1000",
    "first": 10
});
```

### Get Pull Request Status

```rust
let query = r#"
    query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
                title
                state
                mergeable
                reviews(first: 10) {
                    nodes {
                        state
                        author {
                            login
                        }
                    }
                }
                commits(last: 1) {
                    nodes {
                        commit {
                            statusCheckRollup {
                                state
                            }
                        }
                    }
                }
            }
        }
    }
"#;
```

## Resources

- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [GraphQL Explorer](https://docs.github.com/en/graphql/overview/explorer)
- [GitHub GraphQL Schema](https://docs.github.com/en/graphql/reference)
- [Rate Limits](https://docs.github.com/en/graphql/overview/resource-limitations)
