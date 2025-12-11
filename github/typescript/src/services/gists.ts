/**
 * GitHub Gists Service
 * Provides access to GitHub gists, comments, forks, and stars
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

// User type (simplified)
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
}

// Gist types
export interface GistFile {
  filename: string;
  type: string;
  language?: string;
  raw_url: string;
  size: number;
  truncated: boolean;
  content?: string;
}

export interface Gist {
  id: string;
  url: string;
  forks_url: string;
  commits_url: string;
  node_id: string;
  git_pull_url: string;
  git_push_url: string;
  html_url: string;
  files: Record<string, GistFile>;
  public: boolean;
  created_at: string;
  updated_at: string;
  description?: string;
  comments: number;
  user?: User;
  owner?: User;
  truncated: boolean;
  comments_url?: string;
}

export interface GistFileInput {
  content: string;
  filename?: string;
}

export interface CreateGistRequest {
  description?: string;
  files: Record<string, GistFileInput>;
  public?: boolean;
}

export interface UpdateGistRequest {
  description?: string;
  files?: Record<string, GistFileInput | null>;
}

export interface ListGistsParams {
  since?: string;
  per_page?: number;
  page?: number;
}

export interface GistRevision {
  url: string;
  version: string;
  user: User;
  change_status: {
    total: number;
    additions: number;
    deletions: number;
  };
  committed_at: string;
}

// Fork types
export interface GistFork {
  id: string;
  url: string;
  user: User;
  created_at: string;
  updated_at: string;
}

// Comment types
export interface GistComment {
  id: number;
  node_id: string;
  url: string;
  body: string;
  user: User;
  created_at: string;
  updated_at: string;
  author_association: string;
}

export interface CreateGistCommentRequest {
  body: string;
}

export interface UpdateGistCommentRequest {
  body: string;
}

/**
 * Gists Service
 */
export class GistsService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  // Gist methods
  async list(params?: ListGistsParams, options?: RequestOptions): Promise<Gist[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.since) query.since = params.since;
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<Gist[]>({
      method: 'GET',
      path: '/gists',
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async listPublic(params?: ListGistsParams, options?: RequestOptions): Promise<Gist[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.since) query.since = params.since;
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<Gist[]>({
      method: 'GET',
      path: '/gists/public',
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async listStarred(params?: ListGistsParams, options?: RequestOptions): Promise<Gist[]> {
    const query: Record<string, string> = {};
    if (params) {
      if (params.since) query.since = params.since;
      if (params.per_page) query.per_page = params.per_page.toString();
      if (params.page) query.page = params.page.toString();
    }

    return this.orchestrator.request<Gist[]>({
      method: 'GET',
      path: '/gists/starred',
      query: Object.keys(query).length > 0 ? query : undefined,
      ...options,
    });
  }

  async get(gistId: string, options?: RequestOptions): Promise<Gist> {
    return this.orchestrator.request<Gist>({
      method: 'GET',
      path: `/gists/${encodeURIComponent(gistId)}`,
      ...options,
    });
  }

  async getRevision(gistId: string, sha: string, options?: RequestOptions): Promise<Gist> {
    return this.orchestrator.request<Gist>({
      method: 'GET',
      path: `/gists/${encodeURIComponent(gistId)}/${encodeURIComponent(sha)}`,
      ...options,
    });
  }

  async create(request: CreateGistRequest, options?: RequestOptions): Promise<Gist> {
    return this.orchestrator.request<Gist>({
      method: 'POST',
      path: '/gists',
      body: request,
      ...options,
    });
  }

  async update(gistId: string, request: UpdateGistRequest, options?: RequestOptions): Promise<Gist> {
    return this.orchestrator.request<Gist>({
      method: 'PATCH',
      path: `/gists/${encodeURIComponent(gistId)}`,
      body: request,
      ...options,
    });
  }

  async delete(gistId: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/gists/${encodeURIComponent(gistId)}`,
      ...options,
    });
  }

  // Star methods
  async star(gistId: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'PUT',
      path: `/gists/${encodeURIComponent(gistId)}/star`,
      ...options,
    });
  }

  async unstar(gistId: string, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/gists/${encodeURIComponent(gistId)}/star`,
      ...options,
    });
  }

  async isStarred(gistId: string, options?: RequestOptions): Promise<boolean> {
    try {
      await this.orchestrator.request<void>({
        method: 'GET',
        path: `/gists/${encodeURIComponent(gistId)}/star`,
        ...options,
      });
      return true;
    } catch (error) {
      // 404 means not starred
      return false;
    }
  }

  // Fork methods
  async listForks(gistId: string, options?: RequestOptions): Promise<GistFork[]> {
    return this.orchestrator.request<GistFork[]>({
      method: 'GET',
      path: `/gists/${encodeURIComponent(gistId)}/forks`,
      ...options,
    });
  }

  async fork(gistId: string, options?: RequestOptions): Promise<Gist> {
    return this.orchestrator.request<Gist>({
      method: 'POST',
      path: `/gists/${encodeURIComponent(gistId)}/forks`,
      ...options,
    });
  }

  // Comment methods
  async listComments(gistId: string, options?: RequestOptions): Promise<GistComment[]> {
    return this.orchestrator.request<GistComment[]>({
      method: 'GET',
      path: `/gists/${encodeURIComponent(gistId)}/comments`,
      ...options,
    });
  }

  async getComment(gistId: string, commentId: number, options?: RequestOptions): Promise<GistComment> {
    return this.orchestrator.request<GistComment>({
      method: 'GET',
      path: `/gists/${encodeURIComponent(gistId)}/comments/${commentId}`,
      ...options,
    });
  }

  async createComment(
    gistId: string,
    request: CreateGistCommentRequest,
    options?: RequestOptions
  ): Promise<GistComment> {
    return this.orchestrator.request<GistComment>({
      method: 'POST',
      path: `/gists/${encodeURIComponent(gistId)}/comments`,
      body: request,
      ...options,
    });
  }

  async updateComment(
    gistId: string,
    commentId: number,
    request: UpdateGistCommentRequest,
    options?: RequestOptions
  ): Promise<GistComment> {
    return this.orchestrator.request<GistComment>({
      method: 'PATCH',
      path: `/gists/${encodeURIComponent(gistId)}/comments/${commentId}`,
      body: request,
      ...options,
    });
  }

  async deleteComment(gistId: string, commentId: number, options?: RequestOptions): Promise<void> {
    await this.orchestrator.request<void>({
      method: 'DELETE',
      path: `/gists/${encodeURIComponent(gistId)}/comments/${commentId}`,
      ...options,
    });
  }
}
