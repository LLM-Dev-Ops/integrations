# GitHub GraphQL Client - Quick Reference

## Import

```rust
use integrations_github::{GitHubClient, GitHubConfig, AuthMethod};
use integrations_github::services::{GraphQLPagination, PageInfo};
use serde::{Deserialize, Serialize};
use serde_json::json;
```

## Setup

```rust
let config = GitHubConfig::builder()
    .auth(AuthMethod::pat("ghp_xxxxxxxxxxxx"))
    .build()?;

let client = GitHubClient::new(config)?;
let graphql = client.graphql();
```

## Basic Query

```rust
#[derive(Deserialize)]
struct Response { /* fields */ }

let query = r#"query { viewer { login } }"#;
let response = graphql.query::<Response>(query, None).await?;
```

## Query with Variables

```rust
let query = r#"
    query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) { name }
    }
"#;

let variables = json!({ "owner": "rust-lang", "name": "rust" });
let response = graphql.query::<Response>(query, Some(variables)).await?;
```

## Mutation

```rust
let mutation = r#"
    mutation($id: ID!) {
        addStar(input: {starrableId: $id}) {
            starrable { stargazerCount }
        }
    }
"#;

let response = graphql.mutation::<Response>(mutation, Some(variables)).await?;
```

## Pagination

```rust
// First page
let pagination = GraphQLPagination::forward(10);
let variables = pagination.to_variables();

// Next page
if page_info.has_next_page {
    let next = GraphQLPagination::forward_after(10, end_cursor);
    let variables = next.to_variables();
}
```

## Error Handling

```rust
match graphql.query::<Response>(query, None).await {
    Ok(response) => {
        if response.has_errors() {
            // Handle GraphQL errors
        }
        if let Ok(data) = response.data() {
            // Use data
        }
    }
    Err(e) => {
        // Handle HTTP/network errors
    }
}
```

## Rate Limiting

```rust
let response = graphql.query::<Response>(query, None).await?;

// Check cost
if let Some(cost) = response.query_cost() {
    println!("Cost: {} points", cost);
}

// Check remaining
if let Some(remaining) = response.remaining_points() {
    println!("Remaining: {} points", remaining);
}

// Estimate before executing
let estimated = graphql.estimate_query_cost(query);
```

## Response Methods

```rust
response.has_errors()           // Check for errors
response.data()                 // Get data or error
response.into_data()            // Consume and get data
response.map(|d| transform(d))  // Transform data
response.query_cost()           // Query cost in points
response.remaining_points()     // Remaining points
```

## Pagination Helpers

```rust
GraphQLPagination::forward(n)                    // Forward n items
GraphQLPagination::forward_after(n, cursor)      // Forward from cursor
GraphQLPagination::backward(n)                   // Backward n items
GraphQLPagination::backward_before(n, cursor)    // Backward to cursor
```

## Common Query Patterns

### Get Current User

```rust
let query = r#"query { viewer { login name email } }"#;
```

### Get Repository

```rust
let query = r#"
    query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
            name
            description
            stargazerCount
        }
    }
"#;
```

### List Repositories with Pagination

```rust
let query = r#"
    query($first: Int!, $after: String) {
        viewer {
            repositories(first: $first, after: $after) {
                edges {
                    node { name }
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
                        stargazerCount
                    }
                }
            }
        }
    }
"#;
```

### Get Pull Request Details

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
                        author { login }
                    }
                }
            }
        }
    }
"#;
```

## Error Types

- `GitHubErrorKind::GraphQlRateLimitExceeded` - Rate limit hit
- `GitHubErrorKind::NodeLimitExceeded` - Too many nodes
- `GitHubErrorKind::Forbidden` - Permission denied
- `GitHubErrorKind::NotFound` - Resource not found
- `GitHubErrorKind::QueryError` - General query error

## Rate Limits

- **Limit**: 5000 points/hour
- **Simple query**: ~1 point
- **Connection (first: 10)**: ~11 points
- **Nested connections**: Multiply costs
- **Maximum nodes**: 500,000 per query

## Best Practices

1. Request only needed fields
2. Use fragments for reusable field sets
3. Monitor query costs
4. Implement pagination for lists
5. Handle partial errors
6. Cache results when appropriate
7. Optimize nested queries

## Testing

```bash
# Unit tests
cargo test graphql

# Integration tests (needs GITHUB_TOKEN)
GITHUB_TOKEN=ghp_xxx cargo test --test graphql_tests -- --ignored

# Run example
GITHUB_TOKEN=ghp_xxx cargo run --example graphql_example
```

## See Also

- [Full Usage Guide](./GRAPHQL_USAGE.md)
- [Implementation Details](./GRAPHQL_IMPLEMENTATION.md)
- [GitHub GraphQL Docs](https://docs.github.com/en/graphql)
