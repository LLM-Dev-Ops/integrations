/**
 * GitHub Users Service
 * Provides access to GitHub users, emails, SSH keys, GPG keys, and followers
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

// User types
export interface User {
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
  name?: string;
  company?: string;
  blog?: string;
  location?: string;
  email?: string;
  hireable?: boolean;
  bio?: string;
  twitter_username?: string;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  blog?: string;
  twitter_username?: string;
  company?: string;
  location?: string;
  hireable?: boolean;
  bio?: string;
}

export interface ListUsersParams {
  since?: number;
  per_page?: number;
}

// Email types
export interface Email {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string;
}

export interface SetPrimaryEmailRequest {
  email: string;
}

// SSH Key types
export interface SshKey {
  id: number;
  key: string;
  url: string;
  title: string;
  verified: boolean;
  created_at: string;
  read_only: boolean;
}

export interface CreateSshKeyRequest {
  title: string;
  key: string;
}

// GPG Key types
export interface GpgKey {
  id: number;
  primary_key_id?: number;
  key_id: string;
  public_key: string;
  emails: GpgKeyEmail[];
  subkeys: GpgKeySubkey[];
  can_sign: boolean;
  can_encrypt_comms: boolean;
  can_encrypt_storage: boolean;
  can_certify: boolean;
  created_at: string;
  expires_at?: string;
  raw_key: string;
}

export interface GpgKeyEmail {
  email: string;
  verified: boolean;
}

export interface GpgKeySubkey {
  id: number;
  primary_key_id: number;
  key_id: string;
  public_key: string;
  emails: GpgKeyEmail[];
  subkeys: never[];
  can_sign: boolean;
  can_encrypt_comms: boolean;
  can_encrypt_storage: boolean;
  can_certify: boolean;
  created_at: string;
  expires_at?: string;
  raw_key?: string;
}

export interface CreateGpgKeyRequest {
  armored_public_key: string;
}

// Follower types
export interface ListFollowersParams {
  per_page?: number;
  page?: number;
}

/**
 * Users Service
 */
export class UsersService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  // User methods
  async getAuthenticated(options?: RequestOptions): Promise<User> {
    return this.orchestrator.request<User>({
      method: 'GET',
      path: '/user',
      ...options,
    });
  }

  async getByUsername(username: string, options?: RequestOptions): Promise<User> {
    return this.orchestrator.request<User>({
      method: 'GET',
      path: `/users/${encodeURIComponent(username)}`,
      ...options,
    });
  }

  async updateAuthenticated(request: UpdateUserRequest, options?: RequestOptions): Promise<User> {
    return this.orchestrator.request<User>({
      method: 'PATCH',
      path: '/user',
      body: request,
      ...options,
    });
  }

  async listUsers(params?: ListUsersParams, options?: RequestOptions): Promise<User[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.since) query.since = params.since.toString();
      if (params.per_page) query.per_page = params.per_page.toString();
    }

    return this.orchestrator.request<User[]>({
      method: 'GET',
      path: '/users',
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  // Email methods
  async listEmails(options?: RequestOptions): Promise<Email[]> {
    return this.orchestrator.request<Email[]>({
      method: 'GET',
      path: '/user/emails',
      ...options,
    });
  }

  async addEmails(emails: string[], options?: RequestOptions): Promise<Email[]> {
    return this.orchestrator.request<Email[]>({
      method: 'POST',
      path: '/user/emails',
      body: { emails },
      ...options,
    });
  }

  async deleteEmails(emails: string[], options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: '/user/emails',
      body: { emails },
      ...options,
    });
  }

  async setPrimaryEmail(email: string, options?: RequestOptions): Promise<Email[]> {
    return this.orchestrator.request<Email[]>({
      method: 'PATCH',
      path: '/user/email/visibility',
      body: { email },
      ...options,
    });
  }

  // SSH Key methods
  async listSshKeys(options?: RequestOptions): Promise<SshKey[]> {
    return this.orchestrator.request<SshKey[]>({
      method: 'GET',
      path: '/user/keys',
      ...options,
    });
  }

  async getSshKey(keyId: number, options?: RequestOptions): Promise<SshKey> {
    return this.orchestrator.request<SshKey>({
      method: 'GET',
      path: `/user/keys/${keyId}`,
      ...options,
    });
  }

  async createSshKey(request: CreateSshKeyRequest, options?: RequestOptions): Promise<SshKey> {
    return this.orchestrator.request<SshKey>({
      method: 'POST',
      path: '/user/keys',
      body: request,
      ...options,
    });
  }

  async deleteSshKey(keyId: number, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/user/keys/${keyId}`,
      ...options,
    });
  }

  // GPG Key methods
  async listGpgKeys(options?: RequestOptions): Promise<GpgKey[]> {
    return this.orchestrator.request<GpgKey[]>({
      method: 'GET',
      path: '/user/gpg_keys',
      ...options,
    });
  }

  async getGpgKey(gpgKeyId: number, options?: RequestOptions): Promise<GpgKey> {
    return this.orchestrator.request<GpgKey>({
      method: 'GET',
      path: `/user/gpg_keys/${gpgKeyId}`,
      ...options,
    });
  }

  async createGpgKey(request: CreateGpgKeyRequest, options?: RequestOptions): Promise<GpgKey> {
    return this.orchestrator.request<GpgKey>({
      method: 'POST',
      path: '/user/gpg_keys',
      body: request,
      ...options,
    });
  }

  async deleteGpgKey(gpgKeyId: number, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/user/gpg_keys/${gpgKeyId}`,
      ...options,
    });
  }

  // Follower methods
  async listFollowers(username?: string, params?: ListFollowersParams, options?: RequestOptions): Promise<User[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    const path = username
      ? `/users/${encodeURIComponent(username)}/followers`
      : '/user/followers';

    return this.orchestrator.request<User[]>({
      method: 'GET',
      path,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async listFollowing(username?: string, params?: ListFollowersParams, options?: RequestOptions): Promise<User[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    const path = username
      ? `/users/${encodeURIComponent(username)}/following`
      : '/user/following';

    return this.orchestrator.request<User[]>({
      method: 'GET',
      path,
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async isFollowing(username: string, options?: RequestOptions): Promise<boolean> {
    try {
      await this.orchestrator.request<void>({
        method: 'GET',
        path: `/user/following/${encodeURIComponent(username)}`,
        ...options,
      });
      return true;
    } catch (error) {
      // 404 means not following
      return false;
    }
  }

  async follow(username: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'PUT',
      path: `/user/following/${encodeURIComponent(username)}`,
      ...options,
    });
  }

  async unfollow(username: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/user/following/${encodeURIComponent(username)}`,
      ...options,
    });
  }
}
