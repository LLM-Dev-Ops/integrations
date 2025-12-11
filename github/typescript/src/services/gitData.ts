/**
 * GitHub Git Data Service
 *
 * Low-level operations for Git objects: blobs, trees, commits, references, and tags
 */

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Git blob
 */
export interface Blob {
  content: string;
  encoding: 'utf-8' | 'base64';
  url: string;
  sha: string;
  size: number;
  node_id: string;
}

/**
 * Request to create a blob
 */
export interface CreateBlobRequest {
  content: string;
  encoding?: 'utf-8' | 'base64';
}

/**
 * Response from creating a blob
 */
export interface CreateBlobResponse {
  url: string;
  sha: string;
}

/**
 * Git tree entry
 */
export interface TreeEntry {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

/**
 * Git tree
 */
export interface Tree {
  sha: string;
  url: string;
  tree: TreeEntry[];
  truncated: boolean;
}

/**
 * Tree entry for creation
 */
export interface CreateTreeEntry {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha?: string;
  content?: string;
}

/**
 * Request to create a tree
 */
export interface CreateTreeRequest {
  tree: CreateTreeEntry[];
  base_tree?: string;
}

/**
 * Git commit
 */
export interface Commit {
  sha: string;
  node_id: string;
  url: string;
  author: GitUser;
  committer: GitUser;
  message: string;
  tree: {
    sha: string;
    url: string;
  };
  parents: Array<{
    sha: string;
    url: string;
    html_url: string;
  }>;
  verification?: {
    verified: boolean;
    reason: string;
    signature: string | null;
    payload: string | null;
  };
}

/**
 * Git user information
 */
export interface GitUser {
  name: string;
  email: string;
  date: string;
}

/**
 * Request to create a commit
 */
export interface CreateCommitRequest {
  message: string;
  tree: string;
  parents?: string[];
  author?: {
    name: string;
    email: string;
    date?: string;
  };
  committer?: {
    name: string;
    email: string;
    date?: string;
  };
  signature?: string;
}

/**
 * Git reference
 */
export interface GitRef {
  ref: string;
  node_id: string;
  url: string;
  object: {
    type: 'commit' | 'tag' | 'tree' | 'blob';
    sha: string;
    url: string;
  };
}

/**
 * Request to create a reference
 */
export interface CreateRefRequest {
  ref: string;
  sha: string;
}

/**
 * Request to update a reference
 */
export interface UpdateRefRequest {
  sha: string;
  force?: boolean;
}

/**
 * Git tag
 */
export interface GitTag {
  node_id: string;
  tag: string;
  sha: string;
  url: string;
  message: string;
  tagger: GitUser;
  object: {
    type: 'commit' | 'tag' | 'tree' | 'blob';
    sha: string;
    url: string;
  };
  verification?: {
    verified: boolean;
    reason: string;
    signature: string | null;
    payload: string | null;
  };
}

/**
 * Request to create a tag
 */
export interface CreateTagRequest {
  tag: string;
  message: string;
  object: string;
  type: 'commit' | 'tag' | 'tree' | 'blob';
  tagger?: {
    name: string;
    email: string;
    date?: string;
  };
}

/**
 * GitHub Git Data Service
 */
export class GitDataService {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  /**
   * Get a blob by SHA
   */
  async getBlob(sha: string, options?: RequestOptions): Promise<Blob> {
    this.validateSha(sha);
    return this.request<Blob>('GET', `/repos/${this.owner}/${this.repo}/git/blobs/${sha}`, undefined, options);
  }

  /**
   * Create a blob
   */
  async createBlob(request: CreateBlobRequest, options?: RequestOptions): Promise<CreateBlobResponse> {
    if (!request || !request.content) {
      throw new Error('Blob content is required');
    }

    const body = {
      content: request.content,
      encoding: request.encoding || 'utf-8',
    };

    return this.request<CreateBlobResponse>('POST', `/repos/${this.owner}/${this.repo}/git/blobs`, body, options);
  }

  /**
   * Get a tree by SHA
   */
  async getTree(sha: string, recursive?: boolean, options?: RequestOptions): Promise<Tree> {
    this.validateSha(sha);

    const path = recursive
      ? `/repos/${this.owner}/${this.repo}/git/trees/${sha}?recursive=1`
      : `/repos/${this.owner}/${this.repo}/git/trees/${sha}`;

    return this.request<Tree>('GET', path, undefined, options);
  }

  /**
   * Create a tree
   */
  async createTree(request: CreateTreeRequest, options?: RequestOptions): Promise<Tree> {
    this.validateCreateTreeRequest(request);
    return this.request<Tree>('POST', `/repos/${this.owner}/${this.repo}/git/trees`, request, options);
  }

  /**
   * Get a commit by SHA
   */
  async getCommit(sha: string, options?: RequestOptions): Promise<Commit> {
    this.validateSha(sha);
    return this.request<Commit>('GET', `/repos/${this.owner}/${this.repo}/git/commits/${sha}`, undefined, options);
  }

  /**
   * Create a commit
   */
  async createCommit(request: CreateCommitRequest, options?: RequestOptions): Promise<Commit> {
    this.validateCreateCommitRequest(request);
    return this.request<Commit>('POST', `/repos/${this.owner}/${this.repo}/git/commits`, request, options);
  }

  /**
   * List references
   */
  async listRefs(namespace?: string, options?: RequestOptions): Promise<GitRef[]> {
    const path = namespace
      ? `/repos/${this.owner}/${this.repo}/git/refs/${namespace}`
      : `/repos/${this.owner}/${this.repo}/git/refs`;

    return this.request<GitRef[]>('GET', path, undefined, options);
  }

  /**
   * Get a reference
   */
  async getRef(ref: string, options?: RequestOptions): Promise<GitRef> {
    if (!ref) {
      throw new Error('Reference is required');
    }

    // Remove 'refs/' prefix if present
    const cleanRef = ref.startsWith('refs/') ? ref.substring(5) : ref;

    return this.request<GitRef>('GET', `/repos/${this.owner}/${this.repo}/git/refs/${cleanRef}`, undefined, options);
  }

  /**
   * Create a reference
   */
  async createRef(request: CreateRefRequest, options?: RequestOptions): Promise<GitRef> {
    this.validateCreateRefRequest(request);
    return this.request<GitRef>('POST', `/repos/${this.owner}/${this.repo}/git/refs`, request, options);
  }

  /**
   * Update a reference
   */
  async updateRef(ref: string, request: UpdateRefRequest, options?: RequestOptions): Promise<GitRef> {
    if (!ref) {
      throw new Error('Reference is required');
    }

    this.validateSha(request.sha);

    // Remove 'refs/' prefix if present
    const cleanRef = ref.startsWith('refs/') ? ref.substring(5) : ref;

    return this.request<GitRef>(
      'PATCH',
      `/repos/${this.owner}/${this.repo}/git/refs/${cleanRef}`,
      request,
      options
    );
  }

  /**
   * Delete a reference
   */
  async deleteRef(ref: string, options?: RequestOptions): Promise<void> {
    if (!ref) {
      throw new Error('Reference is required');
    }

    // Remove 'refs/' prefix if present
    const cleanRef = ref.startsWith('refs/') ? ref.substring(5) : ref;

    await this.request<void>('DELETE', `/repos/${this.owner}/${this.repo}/git/refs/${cleanRef}`, undefined, options);
  }

  /**
   * Get a tag by SHA
   */
  async getTag(sha: string, options?: RequestOptions): Promise<GitTag> {
    this.validateSha(sha);
    return this.request<GitTag>('GET', `/repos/${this.owner}/${this.repo}/git/tags/${sha}`, undefined, options);
  }

  /**
   * Create a tag object
   */
  async createTag(request: CreateTagRequest, options?: RequestOptions): Promise<GitTag> {
    this.validateCreateTagRequest(request);
    return this.request<GitTag>('POST', `/repos/${this.owner}/${this.repo}/git/tags`, request, options);
  }

  /**
   * Validate SHA format
   */
  private validateSha(sha: string): void {
    if (!sha || typeof sha !== 'string') {
      throw new Error('SHA is required');
    }

    if (!/^[a-f0-9]{40}$/i.test(sha)) {
      throw new Error('Invalid SHA format (must be 40 hex characters)');
    }
  }

  /**
   * Validate create tree request
   */
  private validateCreateTreeRequest(request: CreateTreeRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }

    if (!request.tree || !Array.isArray(request.tree)) {
      throw new Error('Tree entries must be an array');
    }

    if (request.tree.length === 0) {
      throw new Error('Tree entries cannot be empty');
    }

    for (const entry of request.tree) {
      if (!entry.path) {
        throw new Error('Tree entry path is required');
      }

      if (!entry.mode) {
        throw new Error('Tree entry mode is required');
      }

      if (!entry.type) {
        throw new Error('Tree entry type is required');
      }

      if (!entry.sha && !entry.content) {
        throw new Error('Tree entry must have either sha or content');
      }
    }
  }

  /**
   * Validate create commit request
   */
  private validateCreateCommitRequest(request: CreateCommitRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }

    if (!request.message) {
      throw new Error('Commit message is required');
    }

    if (!request.tree) {
      throw new Error('Tree SHA is required');
    }

    this.validateSha(request.tree);

    if (request.parents) {
      if (!Array.isArray(request.parents)) {
        throw new Error('Parents must be an array');
      }

      for (const parent of request.parents) {
        this.validateSha(parent);
      }
    }
  }

  /**
   * Validate create reference request
   */
  private validateCreateRefRequest(request: CreateRefRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }

    if (!request.ref) {
      throw new Error('Reference name is required');
    }

    if (!request.ref.startsWith('refs/')) {
      throw new Error('Reference must start with "refs/"');
    }

    this.validateSha(request.sha);
  }

  /**
   * Validate create tag request
   */
  private validateCreateTagRequest(request: CreateTagRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }

    if (!request.tag) {
      throw new Error('Tag name is required');
    }

    if (!request.message) {
      throw new Error('Tag message is required');
    }

    if (!request.object) {
      throw new Error('Object SHA is required');
    }

    this.validateSha(request.object);

    if (!request.type) {
      throw new Error('Object type is required');
    }

    if (!['commit', 'tag', 'tree', 'blob'].includes(request.type)) {
      throw new Error('Object type must be commit, tag, tree, or blob');
    }
  }

  /**
   * Make an HTTP request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
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
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.message || `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      // DELETE requests may return 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
