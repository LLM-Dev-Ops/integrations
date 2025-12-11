/**
 * GitHub Organizations Service
 * Provides access to GitHub organizations, members, and teams
 */

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ResilienceOrchestrator {
  request<T>(options: RequestConfig): Promise<T>;
}

export interface RequestConfig {
  method: string;
  path: string;
  timeout?: number;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

// Organization types
export interface Organization {
  login: string;
  id: number;
  node_id: string;
  url: string;
  repos_url: string;
  events_url: string;
  hooks_url: string;
  issues_url: string;
  members_url: string;
  public_members_url: string;
  avatar_url: string;
  description?: string;
  name?: string;
  company?: string;
  blog?: string;
  location?: string;
  email?: string;
  twitter_username?: string;
  is_verified?: boolean;
  has_organization_projects?: boolean;
  has_repository_projects?: boolean;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  type?: string;
}

export interface UpdateOrganizationRequest {
  billing_email?: string;
  company?: string;
  email?: string;
  twitter_username?: string;
  location?: string;
  name?: string;
  description?: string;
  has_organization_projects?: boolean;
  has_repository_projects?: boolean;
  default_repository_permission?: 'read' | 'write' | 'admin' | 'none';
  members_can_create_repositories?: boolean;
  members_can_create_internal_repositories?: boolean;
  members_can_create_private_repositories?: boolean;
  members_can_create_public_repositories?: boolean;
  members_allowed_repository_creation_type?: 'all' | 'private' | 'none';
  members_can_create_pages?: boolean;
  members_can_fork_private_repositories?: boolean;
  blog?: string;
}

export interface ListOrganizationsParams {
  since?: number;
  per_page?: number;
}

// Member types
export interface Member {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

export interface Membership {
  url: string;
  state: 'active' | 'pending';
  role: 'admin' | 'member';
  organization_url: string;
  organization: Organization;
  user: Member;
}

export interface UpdateMembershipRequest {
  role?: 'admin' | 'member';
}

export interface ListMembersParams {
  filter?: 'all' | '2fa_disabled';
  role?: 'all' | 'admin' | 'member';
  per_page?: number;
  page?: number;
}

// Team types
export interface Team {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  name: string;
  slug: string;
  description?: string;
  privacy?: 'secret' | 'closed';
  permission: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
  members_url: string;
  repositories_url: string;
  parent?: Team;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  maintainers?: string[];
  repo_names?: string[];
  privacy?: 'secret' | 'closed';
  permission?: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
  parent_team_id?: number;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  privacy?: 'secret' | 'closed';
  permission?: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
  parent_team_id?: number;
}

export interface ListTeamsParams {
  per_page?: number;
  page?: number;
}

export interface TeamMembership {
  url: string;
  role: 'member' | 'maintainer';
  state: 'active' | 'pending';
}

export interface AddTeamMemberRequest {
  role?: 'member' | 'maintainer';
}

/**
 * Organizations Service
 */
export class OrganizationsService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  // Organization methods
  async list(params?: ListOrganizationsParams, options?: RequestOptions): Promise<Organization[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.since) query.since = params.since.toString();
      if (params.per_page) query.per_page = params.per_page.toString();
    }

    return this.orchestrator.request<Organization[]>({
      method: 'GET',
      path: '/organizations',
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async listForUser(username: string, params?: ListOrganizationsParams, options?: RequestOptions): Promise<Organization[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
    }

    return this.orchestrator.request<Organization[]>({
      method: 'GET',
      path: `/users/${encodeURIComponent(username)}/orgs`,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async listForAuthenticatedUser(params?: ListOrganizationsParams, options?: RequestOptions): Promise<Organization[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
    }

    return this.orchestrator.request<Organization[]>({
      method: 'GET',
      path: '/user/orgs',
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async get(org: string, options?: RequestOptions): Promise<Organization> {
    return this.orchestrator.request<Organization>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}`,
      ...options,
    });
  }

  async update(org: string, request: UpdateOrganizationRequest, options?: RequestOptions): Promise<Organization> {
    return this.orchestrator.request<Organization>({
      method: 'PATCH',
      path: `/orgs/${encodeURIComponent(org)}`,
      body: request,
      ...options,
    });
  }

  // Member methods
  async listMembers(org: string, params?: ListMembersParams, options?: RequestOptions): Promise<Member[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.filter) query.filter = params.filter;
      if (params.role) query.role = params.role;
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<Member[]>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}/members`,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async getMembership(org: string, username: string, options?: RequestOptions): Promise<Membership> {
    return this.orchestrator.request<Membership>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(username)}`,
      ...options,
    });
  }

  async updateMembership(
    org: string,
    username: string,
    request: UpdateMembershipRequest,
    options?: RequestOptions
  ): Promise<Membership> {
    return this.orchestrator.request<Membership>({
      method: 'PUT',
      path: `/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(username)}`,
      body: request,
      ...options,
    });
  }

  async removeMember(org: string, username: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`,
      ...options,
    });
  }

  // Team methods
  async listTeams(org: string, params?: ListTeamsParams, options?: RequestOptions): Promise<Team[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<Team[]>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}/teams`,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async getTeam(org: string, teamSlug: string, options?: RequestOptions): Promise<Team> {
    return this.orchestrator.request<Team>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}`,
      ...options,
    });
  }

  async createTeam(org: string, request: CreateTeamRequest, options?: RequestOptions): Promise<Team> {
    return this.orchestrator.request<Team>({
      method: 'POST',
      path: `/orgs/${encodeURIComponent(org)}/teams`,
      body: request,
      ...options,
    });
  }

  async updateTeam(org: string, teamSlug: string, request: UpdateTeamRequest, options?: RequestOptions): Promise<Team> {
    return this.orchestrator.request<Team>({
      method: 'PATCH',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}`,
      body: request,
      ...options,
    });
  }

  async deleteTeam(org: string, teamSlug: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}`,
      ...options,
    });
  }

  // Team member methods
  async listTeamMembers(org: string, teamSlug: string, params?: ListTeamsParams, options?: RequestOptions): Promise<Member[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<Member[]>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/members`,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async getTeamMembership(
    org: string,
    teamSlug: string,
    username: string,
    options?: RequestOptions
  ): Promise<TeamMembership> {
    return this.orchestrator.request<TeamMembership>({
      method: 'GET',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
      ...options,
    });
  }

  async addTeamMember(
    org: string,
    teamSlug: string,
    username: string,
    request?: AddTeamMemberRequest,
    options?: RequestOptions
  ): Promise<TeamMembership> {
    return this.orchestrator.request<TeamMembership>({
      method: 'PUT',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
      body: request || {},
      ...options,
    });
  }

  async removeTeamMember(org: string, teamSlug: string, username: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
      ...options,
    });
  }
}
