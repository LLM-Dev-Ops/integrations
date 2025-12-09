# Admin Services

Production-ready TypeScript implementation of Anthropic's Admin API services.

## Overview

The Admin Services provide comprehensive functionality for managing organizations, workspaces, API keys, invites, and users through Anthropic's Admin API.

## Services

### OrganizationsService

Manage organization details and settings.

```typescript
import { OrganizationsServiceImpl } from '@integrations/anthropic';

const service = new OrganizationsServiceImpl(transport, authManager, resilience);

// Get organization details
const org = await service.get();

// Update organization
const updated = await service.update({ name: 'New Organization Name' });
```

**Methods:**
- `get()`: Get current organization details
- `update(request)`: Update organization settings

### WorkspacesService

Manage workspaces and workspace members.

```typescript
import { WorkspacesServiceImpl } from '@integrations/anthropic';

const service = new WorkspacesServiceImpl(transport, authManager, resilience);

// List workspaces
const workspaces = await service.list({ limit: 10 });

// Create workspace
const workspace = await service.create({ name: 'My Workspace' });

// Add member
const member = await service.addMember('ws_123', {
  user_id: 'user_456',
  role: 'workspace_developer'
});

// Archive workspace
await service.archive('ws_123');
```

**Methods:**
- `list(params?)`: List all workspaces with pagination
- `get(workspaceId)`: Get workspace by ID
- `create(request)`: Create new workspace
- `update(workspaceId, request)`: Update workspace
- `archive(workspaceId)`: Archive workspace
- `listMembers(workspaceId, params?)`: List workspace members
- `addMember(workspaceId, request)`: Add member to workspace
- `getMember(workspaceId, userId)`: Get workspace member
- `updateMember(workspaceId, userId, request)`: Update member role
- `removeMember(workspaceId, userId)`: Remove member from workspace

### ApiKeysService

Manage API keys for authentication.

```typescript
import { ApiKeysServiceImpl } from '@integrations/anthropic';

const service = new ApiKeysServiceImpl(transport, authManager, resilience);

// List API keys
const keys = await service.list();

// Create new API key
const keyWithSecret = await service.create({
  name: 'Production Key',
  workspace_id: 'ws_123'
});
// Note: api_key_secret is only returned on creation

// Update API key
const updated = await service.update('key_123', {
  status: 'disabled'
});
```

**Methods:**
- `list(params?)`: List all API keys with pagination
- `get(apiKeyId)`: Get API key by ID
- `create(request)`: Create new API key (returns key with secret)
- `update(apiKeyId, request)`: Update API key name or status

**API Key Statuses:**
- `active`: Key is active and can be used
- `disabled`: Key is temporarily disabled
- `archived`: Key is permanently archived

### InvitesService

Manage workspace invitations.

```typescript
import { InvitesServiceImpl } from '@integrations/anthropic';

const service = new InvitesServiceImpl(transport, authManager, resilience);

// List invites
const invites = await service.list();

// Create invite
const invite = await service.create({
  email: 'developer@example.com',
  workspace_id: 'ws_123',
  role: 'workspace_developer'
});

// Delete invite
await service.delete('inv_456');
```

**Methods:**
- `list(params?)`: List all invites with pagination
- `get(inviteId)`: Get invite by ID
- `create(request)`: Create new invite
- `delete(inviteId)`: Delete invite

**Invite Statuses:**
- `pending`: Invite has been sent but not accepted
- `accepted`: Invite has been accepted
- `expired`: Invite has expired
- `deleted`: Invite has been deleted

### UsersService

Manage users in the organization.

```typescript
import { UsersServiceImpl } from '@integrations/anthropic';

const service = new UsersServiceImpl(transport, authManager, resilience);

// List users
const users = await service.list({ limit: 20 });

// Get user by ID
const user = await service.get('user_123');

// Get current user
const me = await service.getMe();
```

**Methods:**
- `list(params?)`: List all users with pagination
- `get(userId)`: Get user by ID
- `getMe()`: Get current authenticated user

## Common Types

### Workspace Member Roles

```typescript
type WorkspaceMemberRole =
  | 'workspace_admin'      // Full administrative access
  | 'workspace_developer'  // Development access
  | 'workspace_user'       // Standard user access
  | 'workspace_billing';   // Billing access
```

### Pagination

All list methods support pagination parameters:

```typescript
interface ListParams {
  before_id?: string;  // Get items before this ID
  after_id?: string;   // Get items after this ID
  limit?: number;      // Maximum items to return
}

interface ListResponse<T> {
  data: T[];           // Array of items
  has_more: boolean;   // Whether more items exist
  first_id?: string;   // ID of first item
  last_id?: string;    // ID of last item
}
```

## Architecture

All services follow the SPARC specification:

1. **Separation of Concerns**: Each service handles a specific domain
2. **Dependency Injection**: Services accept transport, auth, and resilience dependencies
3. **Type Safety**: Comprehensive TypeScript types for all requests and responses
4. **Error Handling**: Integrated with resilience orchestrator for retries and circuit breaking
5. **Testing**: Comprehensive test coverage using mocks

## Error Handling

All service methods use the resilience orchestrator, which provides:
- Automatic retries with exponential backoff
- Circuit breaker pattern for failing endpoints
- Rate limiting support

Errors are propagated as standard Anthropic errors:
- `AuthenticationError`: Invalid or missing API key
- `ValidationError`: Invalid request parameters
- `NotFoundError`: Resource not found
- `RateLimitError`: Rate limit exceeded
- `ServerError`: Server-side errors

## Example: Complete Workspace Setup

```typescript
import {
  OrganizationsServiceImpl,
  WorkspacesServiceImpl,
  ApiKeysServiceImpl,
  InvitesServiceImpl,
} from '@integrations/anthropic';

// Get organization
const org = await organizationsService.get();
console.log(`Organization: ${org.name}`);

// Create workspace
const workspace = await workspacesService.create({
  name: 'Development Team'
});

// Create API key for workspace
const apiKey = await apiKeysService.create({
  name: 'Dev Environment Key',
  workspace_id: workspace.id
});
console.log(`API Key created: ${apiKey.api_key_secret}`);
// Save this secret securely - it's only shown once!

// Invite team member
const invite = await invitesService.create({
  email: 'developer@example.com',
  workspace_id: workspace.id,
  role: 'workspace_developer'
});
console.log(`Invite sent to ${invite.email}`);
```

## Testing

All services include comprehensive test coverage. Run tests with:

```bash
npm test src/services/admin/__tests__/
```

Tests use mock implementations of:
- `HttpTransport`: Mock HTTP requests/responses
- `AuthManager`: Mock authentication headers
- `ResilienceOrchestrator`: Mock retry/circuit breaker logic

## API Reference

For detailed API documentation, refer to:
- [Anthropic Admin API Documentation](https://docs.anthropic.com/api/admin)

## Implementation Notes

1. **Query Parameters**: All pagination parameters are properly URL-encoded
2. **Headers**: Authentication headers are managed by the AuthManager
3. **Resilience**: All API calls go through the ResilienceOrchestrator
4. **Type Safety**: Full TypeScript type coverage with strict null checks
5. **Immutability**: All request/response objects are treated as immutable

## Version

Version: 0.1.0
Specification: SPARC
API Version: 2023-06-01
