/**
 * GitHub Search Service
 *
 * Search repositories, code, commits, issues, users, and topics
 */

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Common search parameters
 */
export interface SearchParams {
  query: string;
  sort?: string;
  order?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

/**
 * Search result wrapper
 */
export interface SearchResult<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

/**
 * Repository search parameters
 */
export interface RepositorySearchParams extends SearchParams {
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
}

/**
 * Repository search result item
 */
export interface Repository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  forks_count: number;
  open_issues_count: number;
  master_branch?: string;
  default_branch: string;
  score: number;
  topics?: string[];
  visibility?: string;
}

/**
 * Code search parameters
 */
export interface CodeSearchParams extends SearchParams {
  sort?: 'indexed';
}

/**
 * Code search result item
 */
export interface CodeResult {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: Repository;
  score: number;
  file_size?: number;
  language?: string | null;
  last_modified_at?: string;
  text_matches?: TextMatch[];
}

/**
 * Text match in search results
 */
export interface TextMatch {
  object_url?: string;
  object_type?: string | null;
  property?: string;
  fragment?: string;
  matches?: Array<{
    text?: string;
    indices?: number[];
  }>;
}

/**
 * Commit search parameters
 */
export interface CommitSearchParams extends SearchParams {
  sort?: 'author-date' | 'committer-date';
}

/**
 * Commit search result item
 */
export interface CommitResult {
  url: string;
  sha: string;
  node_id: string;
  html_url: string;
  comments_url: string;
  commit: {
    url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      url: string;
      sha: string;
    };
    comment_count: number;
  };
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  } | null;
  committer: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  } | null;
  parents: Array<{
    url: string;
    html_url: string;
    sha: string;
  }>;
  repository: Repository;
  score: number;
}

/**
 * Issue search parameters
 */
export interface IssueSearchParams extends SearchParams {
  sort?: 'comments' | 'reactions' | 'reactions-+1' | 'reactions--1' | 'reactions-smile' | 'reactions-thinking_face' | 'reactions-heart' | 'reactions-tada' | 'interactions' | 'created' | 'updated';
}

/**
 * Issue search result item
 */
export interface IssueResult {
  id: number;
  node_id: string;
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  number: number;
  state: 'open' | 'closed';
  state_reason?: string | null;
  title: string;
  body?: string | null;
  user: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  } | null;
  labels: Array<{
    id: number;
    node_id: string;
    url: string;
    name: string;
    color: string;
    default: boolean;
    description?: string | null;
  }>;
  assignee: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  } | null;
  assignees?: Array<{
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    type: string;
  }> | null;
  milestone: {
    url: string;
    html_url: string;
    labels_url: string;
    id: number;
    node_id: string;
    number: number;
    state: 'open' | 'closed';
    title: string;
    description: string | null;
    creator: {
      login: string;
      id: number;
      node_id: string;
      avatar_url: string;
      type: string;
    } | null;
    open_issues: number;
    closed_issues: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    due_on: string | null;
  } | null;
  locked: boolean;
  active_lock_reason?: string | null;
  comments: number;
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    merged_at?: string | null;
  };
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  repository?: Repository;
  score: number;
  author_association: string;
  draft?: boolean;
}

/**
 * User search parameters
 */
export interface UserSearchParams extends SearchParams {
  sort?: 'followers' | 'repositories' | 'joined';
}

/**
 * User search result item
 */
export interface UserResult {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string | null;
  url: string;
  html_url: string;
  followers_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  received_events_url: string;
  type: string;
  score: number;
  following_url: string;
  gists_url: string;
  starred_url: string;
  events_url: string;
  site_admin: boolean;
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  email?: string | null;
  hireable?: boolean | null;
  bio?: string | null;
  twitter_username?: string | null;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
  suspended_at?: string | null;
}

/**
 * Topic search parameters
 */
export interface TopicSearchParams extends SearchParams {
  // Topics only support basic search parameters
}

/**
 * Topic search result item
 */
export interface TopicResult {
  name: string;
  display_name: string | null;
  short_description: string | null;
  description: string | null;
  created_by: string | null;
  released: string | null;
  created_at: string;
  updated_at: string;
  featured: boolean;
  curated: boolean;
  score: number;
}

/**
 * GitHub Search Service
 */
export class SearchService {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  /**
   * Search repositories
   */
  async repositories(
    params: RepositorySearchParams,
    options?: RequestOptions
  ): Promise<SearchResult<Repository>> {
    this.validateSearchParams(params);

    const queryParams = this.buildQueryParams(params);
    const path = `/search/repositories?${queryParams}`;

    return this.request<SearchResult<Repository>>('GET', path, options);
  }

  /**
   * Search code
   */
  async code(
    params: CodeSearchParams,
    options?: RequestOptions
  ): Promise<SearchResult<CodeResult>> {
    this.validateSearchParams(params);

    const queryParams = this.buildQueryParams(params);
    const path = `/search/code?${queryParams}`;

    return this.request<SearchResult<CodeResult>>('GET', path, options);
  }

  /**
   * Search commits
   */
  async commits(
    params: CommitSearchParams,
    options?: RequestOptions
  ): Promise<SearchResult<CommitResult>> {
    this.validateSearchParams(params);

    const queryParams = this.buildQueryParams(params);
    const path = `/search/commits?${queryParams}`;

    return this.request<SearchResult<CommitResult>>('GET', path, options);
  }

  /**
   * Search issues and pull requests
   */
  async issues(
    params: IssueSearchParams,
    options?: RequestOptions
  ): Promise<SearchResult<IssueResult>> {
    this.validateSearchParams(params);

    const queryParams = this.buildQueryParams(params);
    const path = `/search/issues?${queryParams}`;

    return this.request<SearchResult<IssueResult>>('GET', path, options);
  }

  /**
   * Search users
   */
  async users(
    params: UserSearchParams,
    options?: RequestOptions
  ): Promise<SearchResult<UserResult>> {
    this.validateSearchParams(params);

    const queryParams = this.buildQueryParams(params);
    const path = `/search/users?${queryParams}`;

    return this.request<SearchResult<UserResult>>('GET', path, options);
  }

  /**
   * Search topics
   */
  async topics(
    params: TopicSearchParams,
    options?: RequestOptions
  ): Promise<SearchResult<TopicResult>> {
    this.validateSearchParams(params);

    const queryParams = this.buildQueryParams(params);
    const path = `/search/topics?${queryParams}`;

    return this.request<SearchResult<TopicResult>>('GET', path, options);
  }

  /**
   * Validate search parameters
   */
  private validateSearchParams(params: SearchParams): void {
    if (!params) {
      throw new Error('Search parameters are required');
    }

    if (!params.query || typeof params.query !== 'string' || params.query.trim() === '') {
      throw new Error('Search query is required and must be a non-empty string');
    }

    if (params.perPage !== undefined) {
      if (typeof params.perPage !== 'number' || params.perPage < 1 || params.perPage > 100) {
        throw new Error('perPage must be between 1 and 100');
      }
    }

    if (params.page !== undefined) {
      if (typeof params.page !== 'number' || params.page < 1) {
        throw new Error('page must be a positive number');
      }
    }

    if (params.order !== undefined && !['asc', 'desc'].includes(params.order)) {
      throw new Error('order must be "asc" or "desc"');
    }
  }

  /**
   * Build query parameters string
   */
  private buildQueryParams(params: SearchParams): string {
    const queryParts: string[] = [];

    queryParts.push(`q=${encodeURIComponent(params.query)}`);

    if (params.sort) {
      queryParts.push(`sort=${encodeURIComponent(params.sort)}`);
    }

    if (params.order) {
      queryParts.push(`order=${params.order}`);
    }

    if (params.perPage !== undefined) {
      queryParts.push(`per_page=${params.perPage}`);
    }

    if (params.page !== undefined) {
      queryParts.push(`page=${params.page}`);
    }

    return queryParts.join('&');
  }

  /**
   * Make an HTTP request
   */
  private async request<T>(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;

    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...options?.headers,
        },
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.message || `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
