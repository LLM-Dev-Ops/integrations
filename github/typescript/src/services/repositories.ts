/**
 * GitHub Repositories Service
 *
 * Provides comprehensive repository management functionality including:
 * - Repository CRUD operations
 * - Branch management
 * - File content operations
 * - Release management
 *
 * @module services/repositories
 */

/**
 * Parameters for listing repositories
 */
export interface ListReposParams {
  /** Filter by visibility: public, private, or all */
  visibility?: 'public' | 'private' | 'all';
  /** Comma-separated list of values: owner, collaborator, organization_member */
  affiliation?: string;
  /** Filter by type: all, owner, public, private, member */
  type?: 'all' | 'owner' | 'public' | 'private' | 'member';
  /** Sort by: created, updated, pushed, full_name */
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
  /** Sort direction: asc or desc */
  direction?: 'asc' | 'desc';
  /** Results per page (max 100) */
  per_page?: number;
  /** Page number */
  page?: number;
}

/**
 * Request to create a new repository
 */
export interface CreateRepoRequest {
  /** Repository name */
  name: string;
  /** Repository description */
  description?: string;
  /** Homepage URL */
  homepage?: string;
  /** Make repository private */
  private?: boolean;
  /** Visibility: public, private, or internal */
  visibility?: 'public' | 'private' | 'internal';
  /** Enable issues */
  has_issues?: boolean;
  /** Enable projects */
  has_projects?: boolean;
  /** Enable wiki */
  has_wiki?: boolean;
  /** Enable downloads */
  has_downloads?: boolean;
  /** Make this a template repository */
  is_template?: boolean;
  /** Team ID with access (orgs only) */
  team_id?: number;
  /** Initialize with README */
  auto_init?: boolean;
  /** .gitignore template name */
  gitignore_template?: string;
  /** License template name */
  license_template?: string;
  /** Allow squash merge */
  allow_squash_merge?: boolean;
  /** Allow merge commits */
  allow_merge_commit?: boolean;
  /** Allow rebase merge */
  allow_rebase_merge?: boolean;
  /** Allow auto-merge */
  allow_auto_merge?: boolean;
  /** Delete branch on merge */
  delete_branch_on_merge?: boolean;
}

/**
 * Request to update a repository
 */
export interface UpdateRepoRequest {
  /** Repository name */
  name?: string;
  /** Repository description */
  description?: string;
  /** Homepage URL */
  homepage?: string;
  /** Make repository private */
  private?: boolean;
  /** Visibility: public, private, or internal */
  visibility?: 'public' | 'private' | 'internal';
  /** Enable issues */
  has_issues?: boolean;
  /** Enable projects */
  has_projects?: boolean;
  /** Enable wiki */
  has_wiki?: boolean;
  /** Default branch */
  default_branch?: string;
  /** Allow squash merge */
  allow_squash_merge?: boolean;
  /** Allow merge commits */
  allow_merge_commit?: boolean;
  /** Allow rebase merge */
  allow_rebase_merge?: boolean;
  /** Allow auto-merge */
  allow_auto_merge?: boolean;
  /** Delete branch on merge */
  delete_branch_on_merge?: boolean;
  /** Archive repository */
  archived?: boolean;
}

/**
 * Request to create or update a file
 */
export interface CreateOrUpdateFileRequest {
  /** Commit message */
  message: string;
  /** File content (base64 encoded for binary files) */
  content: string;
  /** SHA of file being replaced (required for updates) */
  sha?: string;
  /** Branch name (defaults to default branch) */
  branch?: string;
  /** Committer details */
  committer?: {
    name: string;
    email: string;
  };
  /** Author details */
  author?: {
    name: string;
    email: string;
  };
}

/**
 * Request to create a release
 */
export interface CreateReleaseRequest {
  /** Tag name */
  tag_name: string;
  /** Target commitish (branch or commit SHA) */
  target_commitish?: string;
  /** Release name */
  name?: string;
  /** Release description */
  body?: string;
  /** Mark as draft */
  draft?: boolean;
  /** Mark as prerelease */
  prerelease?: boolean;
  /** Generate release notes automatically */
  generate_release_notes?: boolean;
}

/**
 * Request to update a release
 */
export interface UpdateReleaseRequest {
  /** Tag name */
  tag_name?: string;
  /** Target commitish */
  target_commitish?: string;
  /** Release name */
  name?: string;
  /** Release description */
  body?: string;
  /** Mark as draft */
  draft?: boolean;
  /** Mark as prerelease */
  prerelease?: boolean;
}

/**
 * Repository representation
 */
export interface Repository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: any; // User type
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  language: string | null;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  size: number;
  default_branch: string;
  open_issues_count: number;
  topics: string[];
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_downloads: boolean;
  archived: boolean;
  disabled: boolean;
  visibility: string;
  license: any | null;
}

/**
 * Branch representation
 */
export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

/**
 * Content item (file or directory)
 */
export interface ContentItem {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  name: string;
  path: string;
  content?: string; // Base64 encoded for files
  sha: string;
  url: string;
  git_url: string | null;
  html_url: string | null;
  download_url: string | null;
}

/**
 * Release representation
 */
export interface Release {
  id: number;
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  url: string;
  html_url: string;
  assets_url: string;
  upload_url: string;
  tarball_url: string | null;
  zipball_url: string | null;
  assets: any[];
}

/**
 * Paginated response wrapper
 */
export interface Paginated<T> {
  items: T[];
  total_count?: number;
  next_page?: string;
  prev_page?: string;
  first_page?: string;
  last_page?: string;
}

/**
 * Repositories Service
 *
 * Handles all repository-related operations including CRUD, branches,
 * contents, and releases.
 */
export class RepositoriesService {
  /**
   * Creates a new RepositoriesService instance
   *
   * @param client - Reference to the GitHub client for making API calls
   */
  constructor(private client: any) {}

  /**
   * List repositories for the authenticated user
   *
   * @param params - Optional parameters for filtering and pagination
   * @returns Paginated list of repositories
   *
   * @example
   * ```typescript
   * const repos = await client.repositories.listForUser({
   *   visibility: 'public',
   *   sort: 'updated',
   *   per_page: 50
   * });
   * ```
   */
  async listForUser(params?: ListReposParams): Promise<Paginated<Repository>> {
    return this.client.request<Paginated<Repository>>('GET', '/user/repos', {
      params
    });
  }

  /**
   * List repositories for an organization
   *
   * @param org - Organization name
   * @param params - Optional parameters for filtering and pagination
   * @returns Paginated list of repositories
   *
   * @example
   * ```typescript
   * const repos = await client.repositories.listForOrg('myorg', {
   *   type: 'public',
   *   per_page: 100
   * });
   * ```
   */
  async listForOrg(org: string, params?: ListReposParams): Promise<Paginated<Repository>> {
    return this.client.request<Paginated<Repository>>('GET', `/orgs/${org}/repos`, {
      params
    });
  }

  /**
   * List repositories for the authenticated user (legacy method)
   *
   * @param params - Optional parameters for filtering and pagination
   * @returns Paginated list of repositories
   */
  async listForAuthenticatedUser(params?: ListReposParams): Promise<Paginated<Repository>> {
    return this.listForUser(params);
  }

  /**
   * Get a repository by owner and name
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @returns Repository details
   *
   * @example
   * ```typescript
   * const repo = await client.repositories.get('octocat', 'hello-world');
   * console.log(repo.description);
   * ```
   */
  async get(owner: string, repo: string): Promise<Repository> {
    return this.client.request<Repository>('GET', `/repos/${owner}/${repo}`);
  }

  /**
   * Create a repository for the authenticated user
   *
   * @param request - Repository creation parameters
   * @returns Created repository
   *
   * @example
   * ```typescript
   * const repo = await client.repositories.create({
   *   name: 'my-new-repo',
   *   description: 'My awesome project',
   *   private: false,
   *   auto_init: true
   * });
   * ```
   */
  async create(request: CreateRepoRequest): Promise<Repository> {
    return this.client.request<Repository>('POST', '/user/repos', {
      body: request
    });
  }

  /**
   * Create a repository in an organization
   *
   * @param org - Organization name
   * @param request - Repository creation parameters
   * @returns Created repository
   *
   * @example
   * ```typescript
   * const repo = await client.repositories.createForOrg('myorg', {
   *   name: 'org-repo',
   *   private: true
   * });
   * ```
   */
  async createForOrg(org: string, request: CreateRepoRequest): Promise<Repository> {
    return this.client.request<Repository>('POST', `/orgs/${org}/repos`, {
      body: request
    });
  }

  /**
   * Update a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param request - Update parameters
   * @returns Updated repository
   *
   * @example
   * ```typescript
   * const repo = await client.repositories.update('octocat', 'hello-world', {
   *   description: 'Updated description',
   *   has_wiki: false
   * });
   * ```
   */
  async update(owner: string, repo: string, request: UpdateRepoRequest): Promise<Repository> {
    return this.client.request<Repository>('PATCH', `/repos/${owner}/${repo}`, {
      body: request
    });
  }

  /**
   * Delete a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   *
   * @example
   * ```typescript
   * await client.repositories.delete('octocat', 'old-repo');
   * ```
   */
  async delete(owner: string, repo: string): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}`);
  }

  // Branch operations

  /**
   * List branches for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns List of branches
   *
   * @example
   * ```typescript
   * const branches = await client.repositories.listBranches('octocat', 'hello-world');
   * branches.items.forEach(branch => console.log(branch.name));
   * ```
   */
  async listBranches(owner: string, repo: string): Promise<Paginated<Branch>> {
    return this.client.request<Paginated<Branch>>('GET', `/repos/${owner}/${repo}/branches`);
  }

  /**
   * Get a specific branch
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branch - Branch name
   * @returns Branch details
   *
   * @example
   * ```typescript
   * const branch = await client.repositories.getBranch('octocat', 'hello-world', 'main');
   * console.log(branch.commit.sha);
   * ```
   */
  async getBranch(owner: string, repo: string, branch: string): Promise<Branch> {
    return this.client.request<Branch>('GET', `/repos/${owner}/${repo}/branches/${branch}`);
  }

  // Content operations

  /**
   * Get repository contents (file or directory)
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - Path to file or directory
   * @param ref - Branch, tag, or commit SHA (optional)
   * @returns Content item(s)
   *
   * @example
   * ```typescript
   * const readme = await client.repositories.getContents('octocat', 'hello-world', 'README.md');
   * const content = Buffer.from(readme.content, 'base64').toString('utf-8');
   * ```
   */
  async getContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<ContentItem | ContentItem[]> {
    return this.client.request<ContentItem | ContentItem[]>('GET', `/repos/${owner}/${repo}/contents/${path}`, {
      params: ref ? { ref } : undefined
    });
  }

  /**
   * Create or update a file in a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - Path where to create/update the file
   * @param request - File content and metadata
   * @returns Updated content information
   *
   * @example
   * ```typescript
   * const result = await client.repositories.createOrUpdateFile(
   *   'octocat',
   *   'hello-world',
   *   'docs/new-file.md',
   *   {
   *     message: 'Add new documentation',
   *     content: Buffer.from('# Hello World').toString('base64')
   *   }
   * );
   * ```
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    request: CreateOrUpdateFileRequest
  ): Promise<any> {
    return this.client.request<any>('PUT', `/repos/${owner}/${repo}/contents/${path}`, {
      body: request
    });
  }

  /**
   * Delete a file in a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - Path to the file to delete
   * @param message - Commit message
   * @param sha - SHA of the file being deleted
   * @param branch - Branch to delete from (optional)
   *
   * @example
   * ```typescript
   * await client.repositories.deleteFile(
   *   'octocat',
   *   'hello-world',
   *   'old-file.txt',
   *   'Remove obsolete file',
   *   'file-sha-here'
   * );
   * ```
   */
  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string
  ): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
      body: {
        message,
        sha,
        branch
      }
    });
  }

  /**
   * Get the README for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns README content
   *
   * @example
   * ```typescript
   * const readme = await client.repositories.getReadme('octocat', 'hello-world');
   * const content = Buffer.from(readme.content, 'base64').toString('utf-8');
   * ```
   */
  async getReadme(owner: string, repo: string): Promise<ContentItem> {
    return this.client.request<ContentItem>('GET', `/repos/${owner}/${repo}/readme`);
  }

  // Release operations

  /**
   * List releases for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Paginated list of releases
   *
   * @example
   * ```typescript
   * const releases = await client.repositories.listReleases('octocat', 'hello-world');
   * releases.items.forEach(release => console.log(release.tag_name));
   * ```
   */
  async listReleases(owner: string, repo: string): Promise<Paginated<Release>> {
    return this.client.request<Paginated<Release>>('GET', `/repos/${owner}/${repo}/releases`);
  }

  /**
   * Get a specific release by ID
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param releaseId - Release ID
   * @returns Release details
   *
   * @example
   * ```typescript
   * const release = await client.repositories.getRelease('octocat', 'hello-world', 12345);
   * ```
   */
  async getRelease(owner: string, repo: string, releaseId: number): Promise<Release> {
    return this.client.request<Release>('GET', `/repos/${owner}/${repo}/releases/${releaseId}`);
  }

  /**
   * Get the latest release
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Latest release
   *
   * @example
   * ```typescript
   * const latest = await client.repositories.getLatestRelease('octocat', 'hello-world');
   * console.log(`Latest version: ${latest.tag_name}`);
   * ```
   */
  async getLatestRelease(owner: string, repo: string): Promise<Release> {
    return this.client.request<Release>('GET', `/repos/${owner}/${repo}/releases/latest`);
  }

  /**
   * Get a release by tag name
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param tag - Tag name
   * @returns Release for the specified tag
   *
   * @example
   * ```typescript
   * const release = await client.repositories.getReleaseByTag('octocat', 'hello-world', 'v1.0.0');
   * ```
   */
  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release> {
    return this.client.request<Release>('GET', `/repos/${owner}/${repo}/releases/tags/${tag}`);
  }

  /**
   * Create a new release
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param request - Release creation parameters
   * @returns Created release
   *
   * @example
   * ```typescript
   * const release = await client.repositories.createRelease('octocat', 'hello-world', {
   *   tag_name: 'v1.0.0',
   *   name: 'Version 1.0.0',
   *   body: 'Initial release',
   *   draft: false,
   *   prerelease: false
   * });
   * ```
   */
  async createRelease(owner: string, repo: string, request: CreateReleaseRequest): Promise<Release> {
    return this.client.request<Release>('POST', `/repos/${owner}/${repo}/releases`, {
      body: request
    });
  }

  /**
   * Update a release
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param releaseId - Release ID
   * @param request - Update parameters
   * @returns Updated release
   *
   * @example
   * ```typescript
   * const release = await client.repositories.updateRelease('octocat', 'hello-world', 12345, {
   *   name: 'Updated Release Name',
   *   draft: false
   * });
   * ```
   */
  async updateRelease(
    owner: string,
    repo: string,
    releaseId: number,
    request: UpdateReleaseRequest
  ): Promise<Release> {
    return this.client.request<Release>('PATCH', `/repos/${owner}/${repo}/releases/${releaseId}`, {
      body: request
    });
  }

  /**
   * Delete a release
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param releaseId - Release ID
   *
   * @example
   * ```typescript
   * await client.repositories.deleteRelease('octocat', 'hello-world', 12345);
   * ```
   */
  async deleteRelease(owner: string, repo: string, releaseId: number): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/releases/${releaseId}`);
  }
}
