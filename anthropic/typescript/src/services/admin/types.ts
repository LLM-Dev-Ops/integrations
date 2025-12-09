export interface Organization {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
  archived_at?: string;
}

export type WorkspaceMemberRole =
  | 'workspace_admin'
  | 'workspace_developer'
  | 'workspace_user'
  | 'workspace_billing';

export interface WorkspaceMember {
  user_id: string;
  workspace_id: string;
  role: WorkspaceMemberRole;
  added_at: string;
}

export type ApiKeyStatus = 'active' | 'disabled' | 'archived';

export interface ApiKey {
  id: string;
  name: string;
  workspace_id: string;
  created_at: string;
  status: ApiKeyStatus;
  partial_key_hint: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  api_key_secret: string;
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'deleted';

export interface Invite {
  id: string;
  email: string;
  workspace_id: string;
  role: WorkspaceMemberRole;
  status: InviteStatus;
  created_at: string;
  expires_at: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

// Request types
export interface UpdateOrganizationRequest {
  name: string;
}

export interface CreateWorkspaceRequest {
  name: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
}

export interface AddWorkspaceMemberRequest {
  user_id: string;
  role: WorkspaceMemberRole;
}

export interface UpdateWorkspaceMemberRequest {
  role: WorkspaceMemberRole;
}

export interface CreateApiKeyRequest {
  name: string;
  workspace_id: string;
}

export interface UpdateApiKeyRequest {
  name?: string;
  status?: ApiKeyStatus;
}

export interface CreateInviteRequest {
  email: string;
  workspace_id: string;
  role: WorkspaceMemberRole;
}

// List params and responses
export interface ListParams {
  before_id?: string;
  after_id?: string;
  limit?: number;
}

export interface ListResponse<T> {
  data: T[];
  has_more: boolean;
  first_id?: string;
  last_id?: string;
}
