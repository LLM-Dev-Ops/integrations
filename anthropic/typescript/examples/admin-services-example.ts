/**
 * Example: Using Admin Services
 *
 * This example demonstrates how to use the Admin Services to manage
 * organizations, workspaces, API keys, invites, and users.
 */

import {
  OrganizationsServiceImpl,
  WorkspacesServiceImpl,
  ApiKeysServiceImpl,
  InvitesServiceImpl,
  UsersServiceImpl,
  createHttpTransport,
  createAuthManager,
  DefaultResilienceOrchestrator,
  createDefaultResilienceConfig,
} from '../src/index.js';

async function adminServicesExample() {
  // Setup dependencies
  const apiKey = process.env.ANTHROPIC_API_KEY || 'sk-ant-api03-...';
  const apiVersion = '2023-06-01';

  const transport = createHttpTransport({
    baseUrl: 'https://api.anthropic.com',
    timeout: 30000,
  });

  const authManager = createAuthManager({
    apiKey,
    apiVersion,
  });

  const resilience = new DefaultResilienceOrchestrator(
    createDefaultResilienceConfig()
  );

  // Initialize services
  const organizationsService = new OrganizationsServiceImpl(
    transport,
    authManager,
    resilience
  );

  const workspacesService = new WorkspacesServiceImpl(
    transport,
    authManager,
    resilience
  );

  const apiKeysService = new ApiKeysServiceImpl(
    transport,
    authManager,
    resilience
  );

  const invitesService = new InvitesServiceImpl(
    transport,
    authManager,
    resilience
  );

  const usersService = new UsersServiceImpl(
    transport,
    authManager,
    resilience
  );

  // Example 1: Get current organization
  console.log('=== Organization ===');
  const org = await organizationsService.get();
  console.log(`Organization: ${org.name}`);
  console.log(`ID: ${org.id}`);
  console.log(`Created: ${org.created_at}\n`);

  // Example 2: List and manage workspaces
  console.log('=== Workspaces ===');
  const workspaces = await workspacesService.list({ limit: 5 });
  console.log(`Found ${workspaces.data.length} workspaces`);
  console.log(`Has more: ${workspaces.has_more}\n`);

  for (const workspace of workspaces.data) {
    console.log(`- ${workspace.name} (${workspace.id})`);
    if (workspace.archived_at) {
      console.log(`  Archived: ${workspace.archived_at}`);
    }
  }

  // Example 3: Create a new workspace
  console.log('\n=== Create Workspace ===');
  const newWorkspace = await workspacesService.create({
    name: 'Example Development Workspace',
  });
  console.log(`Created workspace: ${newWorkspace.name}`);
  console.log(`ID: ${newWorkspace.id}\n`);

  // Example 4: List workspace members
  console.log('=== Workspace Members ===');
  const members = await workspacesService.listMembers(newWorkspace.id);
  console.log(`Members in ${newWorkspace.name}:`);
  for (const member of members.data) {
    console.log(`- User ${member.user_id}: ${member.role}`);
    console.log(`  Added: ${member.added_at}`);
  }

  // Example 5: Create API key for workspace
  console.log('\n=== API Keys ===');
  const newApiKey = await apiKeysService.create({
    name: 'Example Development Key',
    workspace_id: newWorkspace.id,
  });
  console.log(`Created API key: ${newApiKey.name}`);
  console.log(`Hint: ${newApiKey.partial_key_hint}`);
  console.log(`Secret: ${newApiKey.api_key_secret}`);
  console.log('IMPORTANT: Save this secret - it will not be shown again!\n');

  // Example 6: List API keys
  const apiKeys = await apiKeysService.list({ limit: 10 });
  console.log(`Total API keys: ${apiKeys.data.length}`);
  for (const key of apiKeys.data) {
    console.log(`- ${key.name} (${key.status})`);
    console.log(`  Hint: ${key.partial_key_hint}`);
    console.log(`  Created: ${key.created_at}`);
  }

  // Example 7: Update API key status
  console.log('\n=== Update API Key ===');
  const updatedKey = await apiKeysService.update(newApiKey.id, {
    status: 'disabled',
  });
  console.log(`Updated key status: ${updatedKey.status}\n`);

  // Example 8: Send invites
  console.log('=== Invites ===');
  const invite = await invitesService.create({
    email: 'developer@example.com',
    workspace_id: newWorkspace.id,
    role: 'workspace_developer',
  });
  console.log(`Sent invite to: ${invite.email}`);
  console.log(`Role: ${invite.role}`);
  console.log(`Status: ${invite.status}`);
  console.log(`Expires: ${invite.expires_at}\n`);

  // Example 9: List pending invites
  const invites = await invitesService.list();
  const pendingInvites = invites.data.filter(i => i.status === 'pending');
  console.log(`Pending invites: ${pendingInvites.length}`);
  for (const inv of pendingInvites) {
    console.log(`- ${inv.email} (${inv.role})`);
  }

  // Example 10: Get current user
  console.log('\n=== Current User ===');
  const me = await usersService.getMe();
  console.log(`Email: ${me.email}`);
  if (me.name) {
    console.log(`Name: ${me.name}`);
  }
  console.log(`ID: ${me.id}`);
  console.log(`Created: ${me.created_at}\n`);

  // Example 11: List all users
  console.log('=== All Users ===');
  const users = await usersService.list({ limit: 10 });
  console.log(`Total users: ${users.data.length}`);
  for (const user of users.data) {
    console.log(`- ${user.email}${user.name ? ` (${user.name})` : ''}`);
  }

  // Example 12: Pagination
  console.log('\n=== Pagination Example ===');
  let page = 1;
  let hasMore = true;
  let afterId: string | undefined;

  while (hasMore && page <= 3) {
    const pageResults = await apiKeysService.list({
      limit: 5,
      after_id: afterId,
    });

    console.log(`Page ${page}: ${pageResults.data.length} items`);
    hasMore = pageResults.has_more;
    afterId = pageResults.last_id;
    page++;
  }

  // Example 13: Update workspace member role
  console.log('\n=== Update Member Role ===');
  if (members.data.length > 0) {
    const firstMember = members.data[0];
    const updatedMember = await workspacesService.updateMember(
      newWorkspace.id,
      firstMember.user_id,
      { role: 'workspace_admin' }
    );
    console.log(`Updated ${firstMember.user_id} to ${updatedMember.role}\n`);
  }

  // Example 14: Archive workspace (cleanup)
  console.log('=== Archive Workspace ===');
  const archivedWorkspace = await workspacesService.archive(newWorkspace.id);
  console.log(`Archived workspace: ${archivedWorkspace.name}`);
  console.log(`Archived at: ${archivedWorkspace.archived_at}\n`);

  // Example 15: Error handling
  console.log('=== Error Handling ===');
  try {
    await workspacesService.get('invalid-workspace-id');
  } catch (error) {
    console.log(`Caught error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n=== Example Complete ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  adminServicesExample()
    .then(() => {
      console.log('Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export { adminServicesExample };
