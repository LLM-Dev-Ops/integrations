# Admin Services Implementation

This document describes the complete implementation of the Anthropic Admin API services for the Rust integration.

## Overview

The Admin Services provide programmatic access to manage organizations, workspaces, users, API keys, and invitations through the Anthropic Admin API. All services are feature-gated behind the `admin` feature flag.

## Architecture

### Module Structure

```
src/services/admin/
├── mod.rs              - Module exports and documentation (48 lines)
├── types.rs            - Shared type definitions (314 lines)
├── organizations.rs    - Organizations service (258 lines)
├── workspaces.rs       - Workspaces service (654 lines)
├── api_keys.rs         - API keys service (477 lines)
├── invites.rs          - Invites service (441 lines)
├── users.rs            - Users service (390 lines)
└── tests.rs            - Comprehensive integration tests (752 lines)
```

**Total: 3,334 lines of production-ready code**

## Services Implemented

### 1. Organizations Service (`organizations.rs`)

Manages organization-level operations.

**Methods:**
- `get()` - Get the current organization
- `update(UpdateOrganizationRequest)` - Update organization settings

**Endpoints:**
- `GET /v1/organizations/me`
- `POST /v1/organizations/me`

### 2. Workspaces Service (`workspaces.rs`)

Manages workspaces and workspace members.

**Workspace Methods:**
- `list(ListParams)` - List all workspaces
- `get(workspace_id)` - Get a specific workspace
- `create(CreateWorkspaceRequest)` - Create a new workspace
- `update(workspace_id, UpdateWorkspaceRequest)` - Update workspace
- `archive(workspace_id)` - Archive a workspace

**Member Methods:**
- `list_members(workspace_id, ListParams)` - List workspace members
- `add_member(workspace_id, AddWorkspaceMemberRequest)` - Add a member
- `get_member(workspace_id, user_id)` - Get a specific member
- `update_member(workspace_id, user_id, UpdateWorkspaceMemberRequest)` - Update member role
- `remove_member(workspace_id, user_id)` - Remove a member

**Endpoints:**
- `GET /v1/organizations/workspaces`
- `POST /v1/organizations/workspaces`
- `GET /v1/organizations/workspaces/{workspace_id}`
- `POST /v1/organizations/workspaces/{workspace_id}`
- `POST /v1/organizations/workspaces/{workspace_id}/archive`
- `GET /v1/organizations/workspaces/{workspace_id}/members`
- `POST /v1/organizations/workspaces/{workspace_id}/members`
- `GET /v1/organizations/workspaces/{workspace_id}/members/{user_id}`
- `POST /v1/organizations/workspaces/{workspace_id}/members/{user_id}`
- `DELETE /v1/organizations/workspaces/{workspace_id}/members/{user_id}`

### 3. API Keys Service (`api_keys.rs`)

Manages API keys for programmatic access.

**Methods:**
- `list(ListParams)` - List all API keys
- `get(api_key_id)` - Get a specific API key
- `create(CreateApiKeyRequest)` - Create a new API key (returns secret)
- `update(api_key_id, UpdateApiKeyRequest)` - Update API key

**Endpoints:**
- `GET /v1/organizations/api_keys`
- `POST /v1/organizations/api_keys`
- `GET /v1/organizations/api_keys/{api_key_id}`
- `POST /v1/organizations/api_keys/{api_key_id}`

**Security Note:** The API key secret is only returned once during creation via `ApiKeyWithSecret`.

### 4. Invites Service (`invites.rs`)

Manages user invitations to workspaces.

**Methods:**
- `list(ListParams)` - List all invites
- `get(invite_id)` - Get a specific invite
- `create(CreateInviteRequest)` - Create a new invite
- `delete(invite_id)` - Delete an invite

**Endpoints:**
- `GET /v1/organizations/invites`
- `POST /v1/organizations/invites`
- `GET /v1/organizations/invites/{invite_id}`
- `DELETE /v1/organizations/invites/{invite_id}`

### 5. Users Service (`users.rs`)

Manages users within the organization.

**Methods:**
- `list(ListParams)` - List all users
- `get(user_id)` - Get a specific user
- `get_me()` - Get the current authenticated user

**Endpoints:**
- `GET /v1/organizations/users`
- `GET /v1/organizations/users/{user_id}`
- `GET /v1/organizations/users/me`

## Type Definitions (`types.rs`)

### Core Types

1. **Organization** - Organization resource
2. **Workspace** - Workspace resource with optional `archived_at`
3. **WorkspaceMember** - Workspace member with role
4. **ApiKey** - API key resource (without secret)
5. **ApiKeyWithSecret** - API key with secret (creation only)
6. **Invite** - User invitation resource
7. **User** - User resource

### Enumerations

1. **WorkspaceMemberRole**
   - `WorkspaceAdmin`
   - `WorkspaceDeveloper`
   - `WorkspaceUser`
   - `WorkspaceBilling`

2. **ApiKeyStatus**
   - `Active`
   - `Disabled`
   - `Archived`

3. **InviteStatus**
   - `Pending`
   - `Accepted`
   - `Expired`
   - `Deleted`

### Request Types

- `UpdateOrganizationRequest`
- `CreateWorkspaceRequest`
- `UpdateWorkspaceRequest`
- `AddWorkspaceMemberRequest`
- `UpdateWorkspaceMemberRequest`
- `CreateApiKeyRequest`
- `UpdateApiKeyRequest`
- `CreateInviteRequest`

### Pagination

- `ListParams` - Pagination parameters (before_id, after_id, limit)
- `ListResponse<T>` - Paginated response with has_more flag

## Design Patterns

### 1. Trait-Based Architecture

All services implement async traits:
```rust
#[async_trait]
pub trait OrganizationsService: Send + Sync {
    async fn get(&self) -> AnthropicResult<Organization>;
    async fn update(&self, request: UpdateOrganizationRequest) -> AnthropicResult<Organization>;
}
```

### 2. Dependency Injection

Services accept injected dependencies:
```rust
pub struct OrganizationsServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    base_url: Url,
}
```

### 3. Resilience Integration

All API calls are wrapped in the resilience orchestrator:
```rust
self.resilience.execute("organizations.get", || async {
    // API call
}).await
```

This provides:
- Automatic retry with exponential backoff
- Circuit breaker protection
- Rate limiting
- Request tracking

### 4. Error Handling

Comprehensive error handling with typed errors:
- `AnthropicError::Authentication` - Invalid API key
- `AnthropicError::NotFound` - Resource not found
- `AnthropicError::RateLimit` - Rate limit exceeded
- `AnthropicError::Validation` - Validation failures
- `AnthropicError::Server` - Server errors

### 5. Type Safety

- Strong typing for all requests and responses
- Serde serialization/deserialization
- Builder patterns for complex types
- Optional fields properly handled

## Testing

### Test Coverage

Comprehensive London-School TDD tests in `tests.rs` (752 lines):

1. **Organizations Tests**
   - Get organization
   - Update organization
   - Error handling

2. **Workspaces Tests**
   - CRUD operations (Create, Read, Update, Archive)
   - Member management (Add, Update, Remove)
   - List with pagination

3. **API Keys Tests**
   - Complete lifecycle (Create, Get, Update)
   - Secret handling
   - Status transitions

4. **Invites Tests**
   - Create, Get, Delete flow
   - Status management
   - Pagination

5. **Users Tests**
   - List users
   - Get user by ID
   - Get current user

6. **Error Handling Tests**
   - Authentication errors
   - Not found errors
   - Network errors

### Mock Infrastructure

Updated `src/mocks/mod.rs` with:
- `MockHttpTransport` - HTTP transport mock
- `MockAuthManager` - Authentication mock
- `MockResilienceOrchestrator` - Resilience mock

Using mockall for precise expectations:
```rust
transport
    .expect_send()
    .times(1)
    .withf(|method, url, _, _| {
        method == &Method::GET && url.path() == "/v1/organizations/me"
    })
    .returning(|_, _, _, _| Ok(response));
```

## Integration

### Feature Flag

Add to `Cargo.toml`:
```toml
[features]
admin = []
full = ["admin", "batches", "beta"]
```

### Module Registration

In `src/services/mod.rs`:
```rust
#[cfg(feature = "admin")]
pub mod admin;
```

### Re-exports

In `src/lib.rs`:
```rust
#[cfg(feature = "admin")]
pub use services::admin::{
    // All types and services
};
```

## Usage Examples

### Get Organization

```rust
use integrations_anthropic::services::admin::{OrganizationsService, OrganizationsServiceImpl};

let org = organizations_service.get().await?;
println!("Organization: {}", org.name);
```

### Create Workspace

```rust
use integrations_anthropic::services::admin::{
    WorkspacesService, CreateWorkspaceRequest
};

let workspace = workspaces_service.create(CreateWorkspaceRequest {
    name: "My Workspace".to_string(),
}).await?;
```

### Create API Key

```rust
use integrations_anthropic::services::admin::{
    ApiKeysService, CreateApiKeyRequest
};

let api_key = api_keys_service.create(CreateApiKeyRequest {
    name: "Production Key".to_string(),
    workspace_id: workspace.id,
}).await?;

// Secret is only available here!
println!("Secret: {}", api_key.api_key_secret);
```

### Invite User

```rust
use integrations_anthropic::services::admin::{
    InvitesService, CreateInviteRequest, WorkspaceMemberRole
};

let invite = invites_service.create(CreateInviteRequest {
    email: "user@example.com".to_string(),
    workspace_id: workspace.id,
    role: WorkspaceMemberRole::WorkspaceDeveloper,
}).await?;
```

### List with Pagination

```rust
use integrations_anthropic::services::admin::{ListParams};

let params = ListParams {
    after_id: None,
    before_id: None,
    limit: Some(20),
};

let response = workspaces_service.list(Some(params)).await?;
for workspace in response.data {
    println!("Workspace: {}", workspace.name);
}

if response.has_more {
    // Fetch next page using last_id
}
```

## Compliance with SPARC Specification

This implementation follows the SPARC specification:

1. **Specification** - All types match the API specification
2. **Pseudocode** - Clear trait definitions and documentation
3. **Architecture** - Modular, testable, maintainable design
4. **Refinement** - Production-ready with error handling
5. **Completion** - Comprehensive tests and documentation

## Key Features

- ✅ Complete API coverage for all Admin endpoints
- ✅ Type-safe request/response models
- ✅ Async/await with tokio
- ✅ Automatic retry and resilience
- ✅ Circuit breaker protection
- ✅ Rate limiting
- ✅ Comprehensive error handling
- ✅ London-School TDD with mocks
- ✅ 752 lines of integration tests
- ✅ Full pagination support
- ✅ Secure API key handling
- ✅ Feature-gated (optional dependency)
- ✅ Production-ready code quality

## Files Modified

1. `/workspaces/integrations/anthropic/rust/src/services/admin/mod.rs` (new)
2. `/workspaces/integrations/anthropic/rust/src/services/admin/types.rs` (new)
3. `/workspaces/integrations/anthropic/rust/src/services/admin/organizations.rs` (new)
4. `/workspaces/integrations/anthropic/rust/src/services/admin/workspaces.rs` (new)
5. `/workspaces/integrations/anthropic/rust/src/services/admin/api_keys.rs` (new)
6. `/workspaces/integrations/anthropic/rust/src/services/admin/invites.rs` (new)
7. `/workspaces/integrations/anthropic/rust/src/services/admin/users.rs` (new)
8. `/workspaces/integrations/anthropic/rust/src/services/admin/tests.rs` (new)
9. `/workspaces/integrations/anthropic/rust/src/services/mod.rs` (updated)
10. `/workspaces/integrations/anthropic/rust/src/lib.rs` (updated)
11. `/workspaces/integrations/anthropic/rust/src/mocks/mod.rs` (updated)

## Summary

The Admin Services implementation provides a complete, production-ready interface to the Anthropic Admin API with:
- 3,334 lines of well-structured code
- 5 fully-featured services
- 752 lines of comprehensive tests
- Full SPARC specification compliance
- Enterprise-grade error handling and resilience

All code is feature-gated behind the `admin` feature flag and follows Rust best practices with proper async/await, strong typing, and comprehensive testing.
