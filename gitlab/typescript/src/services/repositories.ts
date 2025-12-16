/**
 * GitLab Repositories Service
 *
 * Provides operations for managing repository content, branches, commits, and trees.
 * This service handles:
 * - File operations (get, create, update, delete)
 * - Branch management (list, get, create, delete)
 * - Commit operations (get, list, compare)
 * - Tree/directory browsing
 *
 * @module services/repositories
 */

import type {
  ProjectRef,
  CommitRef,
  FileContent,
  CreateFileRequest,
  UpdateFileRequest,
  Branch,
  Commit,
  CommitQuery,
  CompareResult,
} from '../types.js';
import type { GitLabClient, Page } from '../client.js';

// ============================================================================
// Additional Types for Repository Operations
// ============================================================================

/**
 * Tree item (file or directory) in a repository
 */
export interface TreeItem {
  /**
   * Object ID
   */
  readonly id: string;

  /**
   * File or directory name
   */
  readonly name: string;

  /**
   * Item type
   */
  readonly type: 'tree' | 'blob';

  /**
   * Full path from repository root
   */
  readonly path: string;

  /**
   * File mode (Unix permissions)
   */
  readonly mode: string;
}

/**
 * Options for listing branches
 */
export interface ListBranchesOptions {
  /**
   * Search for branches by name
   */
  readonly search?: string;

  /**
   * Page number (1-indexed)
   */
  readonly page?: number;

  /**
   * Number of items per page
   */
  readonly perPage?: number;
}

/**
 * Options for getting repository tree
 */
export interface GetTreeOptions {
  /**
   * Path inside repository to get tree for
   */
  readonly path?: string;

  /**
   * Ref (branch/tag/commit) to get tree from
   */
  readonly ref?: string;

  /**
   * Get tree recursively
   */
  readonly recursive?: boolean;

  /**
   * Page number (1-indexed)
   */
  readonly page?: number;

  /**
   * Number of items per page
   */
  readonly perPage?: number;
}

// ============================================================================
// Repositories Service
// ============================================================================

/**
 * Service for repository operations in GitLab
 *
 * Provides methods for managing repository files, branches, commits, and trees.
 *
 * @example
 * ```typescript
 * const service = createRepositoriesService(client);
 *
 * // Get a file
 * const file = await service.getFile(
 *   { type: 'Path', value: 'group/project' },
 *   'README.md',
 *   { type: 'Branch', value: 'main' }
 * );
 *
 * // List branches
 * const branches = await service.listBranches(
 *   { type: 'Id', value: 123 },
 *   { search: 'feature' }
 * );
 * ```
 */
export class RepositoriesService {
  /**
   * Creates a new RepositoriesService instance
   *
   * @param client - GitLab client instance
   */
  constructor(private readonly client: GitLabClient) {}

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Encodes a project reference for use in URLs
   *
   * @param project - Project reference (ID, path, or URL)
   * @returns URL-encoded project identifier
   *
   * @example
   * ```typescript
   * encodeProjectRef({ type: 'Id', value: 123 }) // "123"
   * encodeProjectRef({ type: 'Path', value: 'group/project' }) // "group%2Fproject"
   * ```
   */
  private encodeProjectRef(project: ProjectRef): string {
    switch (project.type) {
      case 'Id':
        return String(project.value);

      case 'Path':
        return encodeURIComponent(project.value);

      case 'Url': {
        // Extract path from URL and encode it
        try {
          const url = new URL(project.value);
          // Remove leading slash and encode
          const path = url.pathname.replace(/^\//, '');
          return encodeURIComponent(path);
        } catch {
          // If URL parsing fails, just encode the value
          return encodeURIComponent(project.value);
        }
      }

      default:
        // Type guard - this should never happen
        const _exhaustive: never = project;
        throw new Error(`Unknown project ref type: ${JSON.stringify(project)}`);
    }
  }

  /**
   * Converts a CommitRef to a string value
   *
   * @param ref - Commit reference
   * @returns String representation of the reference
   */
  private commitRefToString(ref: CommitRef): string {
    switch (ref.type) {
      case 'Sha':
      case 'Branch':
      case 'Tag':
        return ref.value;

      default:
        // Type guard - this should never happen
        const _exhaustive: never = ref;
        throw new Error(`Unknown commit ref type: ${JSON.stringify(ref)}`);
    }
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Gets a file from the repository
   *
   * @param project - Project reference
   * @param path - Path to the file in the repository
   * @param ref - Commit reference (branch, tag, or SHA)
   * @returns File content with metadata
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const file = await service.getFile(
   *   { type: 'Path', value: 'group/project' },
   *   'src/index.ts',
   *   { type: 'Branch', value: 'main' }
   * );
   * console.log(file.content); // File content (decoded if base64)
   * ```
   */
  async getFile(
    project: ProjectRef,
    path: string,
    ref: CommitRef
  ): Promise<FileContent> {
    const projectId = this.encodeProjectRef(project);
    const filePath = encodeURIComponent(path);
    const refValue = this.commitRefToString(ref);

    const response = await this.client.get<FileContent>(
      `/projects/${projectId}/repository/files/${filePath}`,
      {
        query: { ref: refValue },
      }
    );

    // Decode base64 content if needed
    if (response.data.encoding === 'base64') {
      const decoded = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return {
        ...response.data,
        content: decoded,
      };
    }

    return response.data;
  }

  /**
   * Gets raw file content from the repository
   *
   * @param project - Project reference
   * @param path - Path to the file in the repository
   * @param ref - Commit reference (branch, tag, or SHA)
   * @returns Raw file content as string
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const content = await service.getFileRaw(
   *   { type: 'Id', value: 123 },
   *   'README.md',
   *   { type: 'Branch', value: 'main' }
   * );
   * console.log(content); // Raw file content
   * ```
   */
  async getFileRaw(
    project: ProjectRef,
    path: string,
    ref: CommitRef
  ): Promise<string> {
    const projectId = this.encodeProjectRef(project);
    const filePath = encodeURIComponent(path);
    const refValue = this.commitRefToString(ref);

    const response = await this.client.get<string>(
      `/projects/${projectId}/repository/files/${filePath}/raw`,
      {
        query: { ref: refValue },
      }
    );

    return response.data;
  }

  /**
   * Creates a new file in the repository
   *
   * @param project - Project reference
   * @param path - Path where the file should be created
   * @param request - File creation request with branch, content, and commit message
   * @returns Created file metadata
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const file = await service.createFile(
   *   { type: 'Path', value: 'group/project' },
   *   'src/new-file.ts',
   *   {
   *     branch: 'main',
   *     commit_message: 'Add new file',
   *     content: 'export const foo = "bar";'
   *   }
   * );
   * ```
   */
  async createFile(
    project: ProjectRef,
    path: string,
    request: CreateFileRequest
  ): Promise<FileContent> {
    const projectId = this.encodeProjectRef(project);
    const filePath = encodeURIComponent(path);

    // Encode content as base64
    const content = Buffer.from(request.content).toString('base64');

    const body = {
      branch: request.branch,
      commit_message: request.commit_message,
      content,
      encoding: 'base64',
      author_email: request.author_email,
      author_name: request.author_name,
      start_branch: request.start_branch,
    };

    const response = await this.client.post<FileContent>(
      `/projects/${projectId}/repository/files/${filePath}`,
      body
    );

    return response.data;
  }

  /**
   * Updates an existing file in the repository
   *
   * @param project - Project reference
   * @param path - Path to the file to update
   * @param request - File update request with branch, content, and commit message
   * @returns Updated file metadata
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const file = await service.updateFile(
   *   { type: 'Path', value: 'group/project' },
   *   'README.md',
   *   {
   *     branch: 'main',
   *     commit_message: 'Update README',
   *     content: '# Updated README\n\nNew content here.',
   *     last_commit_id: 'abc123...'
   *   }
   * );
   * ```
   */
  async updateFile(
    project: ProjectRef,
    path: string,
    request: UpdateFileRequest
  ): Promise<FileContent> {
    const projectId = this.encodeProjectRef(project);
    const filePath = encodeURIComponent(path);

    // Encode content as base64
    const content = Buffer.from(request.content).toString('base64');

    const body = {
      branch: request.branch,
      commit_message: request.commit_message,
      content,
      encoding: 'base64',
      author_email: request.author_email,
      author_name: request.author_name,
      start_branch: request.start_branch,
      last_commit_id: request.last_commit_id,
    };

    const response = await this.client.put<FileContent>(
      `/projects/${projectId}/repository/files/${filePath}`,
      body
    );

    return response.data;
  }

  /**
   * Deletes a file from the repository
   *
   * @param project - Project reference
   * @param path - Path to the file to delete
   * @param branch - Branch name where the file should be deleted
   * @param commitMessage - Commit message for the deletion
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * await service.deleteFile(
   *   { type: 'Id', value: 123 },
   *   'old-file.txt',
   *   'main',
   *   'Remove obsolete file'
   * );
   * ```
   */
  async deleteFile(
    project: ProjectRef,
    path: string,
    branch: string,
    commitMessage: string
  ): Promise<void> {
    const projectId = this.encodeProjectRef(project);
    const filePath = encodeURIComponent(path);

    // GitLab API sends delete file parameters in the query string
    const query = {
      branch,
      commit_message: commitMessage,
    };

    await this.client.delete<void>(
      `/projects/${projectId}/repository/files/${filePath}`,
      { query }
    );
  }

  // ==========================================================================
  // Branch Operations
  // ==========================================================================

  /**
   * Lists branches in a repository
   *
   * @param project - Project reference
   * @param options - Optional filtering and pagination options
   * @returns Paginated list of branches
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const branches = await service.listBranches(
   *   { type: 'Path', value: 'group/project' },
   *   { search: 'feature', page: 1, perPage: 20 }
   * );
   * console.log(branches.items); // Array of branches
   * ```
   */
  async listBranches(
    project: ProjectRef,
    options?: ListBranchesOptions
  ): Promise<Page<Branch>> {
    const projectId = this.encodeProjectRef(project);

    const params: any = {};
    if (options?.search) params.search = options.search;
    if (options?.page) params.page = options.page;
    if (options?.perPage) params.perPage = options.perPage;

    return this.client.getPaginated<Branch>(
      `/projects/${projectId}/repository/branches`,
      params
    );
  }

  /**
   * Gets a specific branch
   *
   * @param project - Project reference
   * @param branch - Branch name
   * @returns Branch information
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const branch = await service.getBranch(
   *   { type: 'Id', value: 123 },
   *   'main'
   * );
   * console.log(branch.commit.id); // Latest commit SHA
   * ```
   */
  async getBranch(project: ProjectRef, branch: string): Promise<Branch> {
    const projectId = this.encodeProjectRef(project);
    const branchName = encodeURIComponent(branch);

    const response = await this.client.get<Branch>(
      `/projects/${projectId}/repository/branches/${branchName}`
    );

    return response.data;
  }

  /**
   * Creates a new branch
   *
   * @param project - Project reference
   * @param branch - Name for the new branch
   * @param ref - Reference (branch, tag, or commit SHA) to create the branch from
   * @returns Created branch information
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const branch = await service.createBranch(
   *   { type: 'Path', value: 'group/project' },
   *   'feature/new-feature',
   *   'main'
   * );
   * ```
   */
  async createBranch(
    project: ProjectRef,
    branch: string,
    ref: string
  ): Promise<Branch> {
    const projectId = this.encodeProjectRef(project);

    const body = {
      branch,
      ref,
    };

    const response = await this.client.post<Branch>(
      `/projects/${projectId}/repository/branches`,
      body
    );

    return response.data;
  }

  /**
   * Deletes a branch
   *
   * @param project - Project reference
   * @param branch - Branch name to delete
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * await service.deleteBranch(
   *   { type: 'Id', value: 123 },
   *   'feature/old-feature'
   * );
   * ```
   */
  async deleteBranch(project: ProjectRef, branch: string): Promise<void> {
    const projectId = this.encodeProjectRef(project);
    const branchName = encodeURIComponent(branch);

    await this.client.delete<void>(
      `/projects/${projectId}/repository/branches/${branchName}`
    );
  }

  // ==========================================================================
  // Commit Operations
  // ==========================================================================

  /**
   * Gets a specific commit
   *
   * @param project - Project reference
   * @param sha - Commit SHA
   * @returns Commit information
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const commit = await service.getCommit(
   *   { type: 'Path', value: 'group/project' },
   *   'abc123def456'
   * );
   * console.log(commit.message);
   * ```
   */
  async getCommit(project: ProjectRef, sha: string): Promise<Commit> {
    const projectId = this.encodeProjectRef(project);
    const commitSha = encodeURIComponent(sha);

    const response = await this.client.get<Commit>(
      `/projects/${projectId}/repository/commits/${commitSha}`
    );

    return response.data;
  }

  /**
   * Lists commits in a repository
   *
   * @param project - Project reference
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of commits
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const commits = await service.listCommits(
   *   { type: 'Id', value: 123 },
   *   {
   *     ref_name: 'main',
   *     since: '2024-01-01T00:00:00Z',
   *     path: 'src/',
   *     page: 1,
   *     per_page: 20
   *   }
   * );
   * ```
   */
  async listCommits(
    project: ProjectRef,
    query?: CommitQuery
  ): Promise<Page<Commit>> {
    const projectId = this.encodeProjectRef(project);

    const params: any = {};
    if (query?.ref_name) params.ref_name = query.ref_name;
    if (query?.since) params.since = query.since;
    if (query?.until) params.until = query.until;
    if (query?.path) params.path = query.path;
    if (query?.all) params.all = query.all;
    if (query?.with_stats) params.with_stats = query.with_stats;
    if (query?.first_parent) params.first_parent = query.first_parent;
    if (query?.order) params.order = query.order;
    if (query?.page) params.page = query.page;
    if (query?.per_page) params.perPage = query.per_page;

    return this.client.getPaginated<Commit>(
      `/projects/${projectId}/repository/commits`,
      params
    );
  }

  /**
   * Compares two refs (branches, tags, or commits)
   *
   * @param project - Project reference
   * @param from - Source ref (branch, tag, or commit SHA)
   * @param to - Target ref (branch, tag, or commit SHA)
   * @returns Comparison result with commits and diffs
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const comparison = await service.compare(
   *   { type: 'Path', value: 'group/project' },
   *   'main',
   *   'develop'
   * );
   * console.log(comparison.commits.length); // Number of commits difference
   * console.log(comparison.diffs); // File changes
   * ```
   */
  async compare(
    project: ProjectRef,
    from: string,
    to: string
  ): Promise<CompareResult> {
    const projectId = this.encodeProjectRef(project);

    const response = await this.client.get<CompareResult>(
      `/projects/${projectId}/repository/compare`,
      {
        query: { from, to },
      }
    );

    return response.data;
  }

  // ==========================================================================
  // Tree Operations
  // ==========================================================================

  /**
   * Gets repository tree (files and directories)
   *
   * @param project - Project reference
   * @param options - Optional path, ref, and pagination options
   * @returns Paginated list of tree items
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * // Get root directory
   * const tree = await service.getTree(
   *   { type: 'Id', value: 123 }
   * );
   *
   * // Get specific directory recursively
   * const srcTree = await service.getTree(
   *   { type: 'Path', value: 'group/project' },
   *   { path: 'src', recursive: true, ref: 'main' }
   * );
   * ```
   */
  async getTree(
    project: ProjectRef,
    options?: GetTreeOptions
  ): Promise<Page<TreeItem>> {
    const projectId = this.encodeProjectRef(project);

    const params: any = {};
    if (options?.path) params.path = options.path;
    if (options?.ref) params.ref = options.ref;
    if (options?.recursive !== undefined) params.recursive = options.recursive;
    if (options?.page) params.page = options.page;
    if (options?.perPage) params.perPage = options.perPage;

    return this.client.getPaginated<TreeItem>(
      `/projects/${projectId}/repository/tree`,
      params
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new RepositoriesService instance
 *
 * @param client - GitLab client instance
 * @returns RepositoriesService instance
 *
 * @example
 * ```typescript
 * import { GitLabClient } from '../client.js';
 * import { createRepositoriesService } from './repositories.js';
 *
 * const client = new GitLabClient(config, tokenProvider);
 * const repositories = createRepositoriesService(client);
 *
 * // Use the service
 * const file = await repositories.getFile(
 *   { type: 'Path', value: 'group/project' },
 *   'README.md',
 *   { type: 'Branch', value: 'main' }
 * );
 * ```
 */
export function createRepositoriesService(client: GitLabClient): RepositoriesService {
  return new RepositoriesService(client);
}
