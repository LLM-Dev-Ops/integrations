# GitHub GraphQL Client Implementation

## Overview

This document describes the implementation of the GitHub GraphQL client for the GitHub integration module, following the SPARC specifications.

## Implementation Summary

The GraphQL client has been implemented with the following components:

### Core Implementation

**File**: `/workspaces/integrations/github/rust/src/services/graphql.rs`

**Key Features**:
1. GraphQL query execution
2. GraphQL mutation execution
3. Point-based rate limit tracking (separate from REST)
4. Query cost estimation (heuristic-based)
5. Cursor-based pagination support
6. Comprehensive error handling

### Main Types

#### `GraphQLService<'a>`
The main service struct that provides access to GraphQL operations.

**Methods**:
- `query<T>()` - Execute a GraphQL query
- `mutation<T>()` - Execute a GraphQL mutation
- `query_with_operation<T>()` - Execute with specific operation name
- `execute_raw()` - Execute raw queries returning JSON
- `estimate_query_cost()` - Heuristic-based cost estimation

#### `GraphQLRequest`
Internal request payload structure:
```rust
struct GraphQLRequest {
    query: String,
    variables: Option<serde_json::Value>,
    operation_name: Option<String>,
}
```

#### `GraphQLResponse<T>`
Typed response wrapper:
```rust
struct GraphQLResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQLError>>,
    rate_limit: Option<GraphQLRateLimit>,
}
```

**Methods**:
- `has_errors()` - Check if response contains errors
- `data()` - Get data or return error
- `into_data()` - Consume and return data
- `map<U, F>()` - Transform data type
- `query_cost()` - Get query cost in points
- `remaining_points()` - Get remaining rate limit points

#### `GraphQLError`
Detailed error information:
```rust
struct GraphQLError {
    message: String,
    error_type: Option<String>,
    path: Option<Vec<String>>,
    locations: Option<Vec<GraphQLLocation>>,
    extensions: Option<HashMap<String, serde_json::Value>>,
}
```

#### `GraphQLRateLimit`
GraphQL-specific rate limit info:
```rust
struct GraphQLRateLimit {
    limit: u32,           // Max points per hour (5000)
    remaining: u32,       // Points remaining
    reset_at: String,     // Reset timestamp (ISO 8601)
    cost: Option<u32>,    // Cost of current query
    node_count: Option<u32>, // Number of nodes
}
```

#### `GraphQLPagination`
Helper for building cursor-based pagination:
```rust
struct GraphQLPagination {
    first: Option<u32>,
    after: Option<String>,
    last: Option<u32>,
    before: Option<String>,
}
```

**Methods**:
- `forward(first)` - Forward pagination
- `forward_after(first, cursor)` - Forward from cursor
- `backward(last)` - Backward pagination
- `backward_before(last, cursor)` - Backward to cursor
- `to_variables()` - Convert to JSON variables

#### `PageInfo`
Standard GraphQL pagination info:
```rust
struct PageInfo {
    has_next_page: bool,
    has_previous_page: bool,
    start_cursor: Option<String>,
    end_cursor: Option<String>,
}
```

## Error Handling

The implementation handles GraphQL-specific errors:

1. **Rate Limit Exceeded** (`RATE_LIMITED`)
   - Maps to `GitHubErrorKind::GraphQlRateLimitExceeded`
   - Returns retry-after information

2. **Node Limit Exceeded** (`MAX_NODE_LIMIT_EXCEEDED`)
   - Maps to `GitHubErrorKind::NodeLimitExceeded`
   - Indicates too many nodes requested

3. **Forbidden** (`FORBIDDEN`)
   - Maps to `GitHubErrorKind::Forbidden`
   - Authentication/permission issue

4. **Not Found** (`NOT_FOUND`)
   - Maps to `GitHubErrorKind::NotFound`
   - Resource doesn't exist

5. **Generic Query Errors**
   - Maps to `GitHubErrorKind::QueryError`
   - Includes message, path, and locations

## Integration with Main Client

The GraphQL service is integrated into the main `GitHubClient`:

```rust
// In client/mod.rs
impl GitHubClient {
    /// Gets the GraphQL service.
    pub fn graphql(&self) -> GraphQLService {
        GraphQLService::new(self)
    }
}
```

## Rate Limiting

GraphQL uses a separate rate limit pool from REST:

- **Limit**: 5000 points per hour
- **Resource**: Tracked separately as "graphql"
- **Cost Calculation**: Based on query complexity
  - Simple field queries: ~1 point
  - Connections: +1 point per first/last argument
  - Edges: Fractional cost per edge
  - Maximum: 500,000 nodes per query

The rate limit information is extracted from the response extensions and made available to users.

## Query Cost Estimation

The implementation provides a heuristic-based cost estimator:

```rust
pub fn estimate_query_cost(&self, query: &str) -> u32 {
    let field_count = query.matches(|c: char| c == '{' || c == '}').count() / 2;
    let connection_count = query.matches("edges").count() + query.matches("nodes").count();

    1 + (field_count as u32) + (connection_count as u32 * 10)
}
```

**Note**: This is a rough estimate. Actual costs are returned by GitHub in the response.

## Pagination Support

The implementation provides helpers for GitHub's cursor-based pagination:

```rust
// Forward pagination
let pagination = GraphQLPagination::forward(10);
let variables = pagination.to_variables();

// Next page
if page_info.has_next_page {
    let next = GraphQLPagination::forward_after(10, page_info.end_cursor.unwrap());
}
```

## Files Created

1. **Core Implementation**
   - `/workspaces/integrations/github/rust/src/services/graphql.rs`
   - Complete GraphQL client implementation
   - 600+ lines with comprehensive documentation

2. **Service Module Updates**
   - `/workspaces/integrations/github/rust/src/services/mod.rs`
   - Added GraphQL module and re-exports

3. **Client Updates**
   - `/workspaces/integrations/github/rust/src/client/mod.rs`
   - Added `graphql()` service accessor

4. **Documentation**
   - `/workspaces/integrations/github/rust/GRAPHQL_USAGE.md`
   - Comprehensive usage guide with examples
   - Covers all major use cases

5. **Examples**
   - `/workspaces/integrations/github/rust/examples/graphql_example.rs`
   - Working example demonstrating all features
   - Includes pagination, error handling, rate limits

6. **Tests**
   - `/workspaces/integrations/github/rust/tests/graphql_tests.rs`
   - Comprehensive integration tests
   - Unit tests for helpers and utilities

## SPARC Compliance

The implementation follows all SPARC specifications:

### Specification Requirements
✅ GraphQL query execution
✅ GraphQL mutation execution
✅ Point-based rate limit tracking
✅ Query cost estimation
✅ Cursor-based pagination
✅ Proper error handling

### Pseudocode Alignment
The implementation follows the pseudocode from `pseudocode-github-4.md`:
- GraphQL request/response structures
- Error mapping (RATE_LIMITED, MAX_NODE_LIMIT_EXCEEDED, etc.)
- Rate limit extraction from extensions
- Query execution flow

### Architecture Decisions
- Service pattern consistent with other GitHub services
- Typed responses with generic data parameter
- Separation of concerns (pagination helpers, error types)
- Integration with existing client infrastructure

## Usage Example

```rust
use integrations_github::{GitHubClient, GitHubConfig, AuthMethod};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct ViewerResponse {
    viewer: Viewer,
}

#[derive(Deserialize)]
struct Viewer {
    login: String,
    email: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = GitHubConfig::builder()
        .auth(AuthMethod::pat("ghp_xxxxxxxxxxxx"))
        .build()?;

    let client = GitHubClient::new(config)?;
    let graphql = client.graphql();

    let query = r#"
        query {
            viewer {
                login
                email
            }
        }
    "#;

    let response = graphql.query::<ViewerResponse>(query, None).await?;

    if let Some(data) = response.data {
        println!("User: {}", data.viewer.login);
    }

    if let Some(cost) = response.query_cost() {
        println!("Query cost: {} points", cost);
    }

    Ok(())
}
```

## Testing

Run tests with:

```bash
# Unit tests (no credentials needed)
cargo test graphql

# Integration tests (requires GITHUB_TOKEN)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx cargo test --test graphql_tests -- --ignored
```

Run example:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxx cargo run --example graphql_example
```

## Dependencies

All required dependencies are already in `Cargo.toml`:
- `serde` / `serde_json` - Serialization
- `reqwest` - HTTP client
- `tokio` - Async runtime
- No additional dependencies needed

## Future Enhancements

Potential future improvements:
1. GraphQL schema introspection
2. Type-safe query builder using traits
3. Automatic query optimization
4. Query fragment caching
5. Subscription support (webhooks alternative)
6. Persistent query support

## References

- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [SPARC Specification](../plans/github/SPARC-GitHub.md)
- [Pseudocode - Part 4](../plans/github/pseudocode-github-4.md)
- [Architecture Documents](../plans/github/architecture-github-*.md)
