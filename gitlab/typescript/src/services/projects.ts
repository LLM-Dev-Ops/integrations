/**
 * GitLab Projects Service
 *
 * Provides operations for managing projects, project members, variables, and statistics.
 * This service handles:
 * - Project retrieval and listing
 * - Project member management
 * - Project variables (CI/CD variables)
 * - Project languages and statistics
 *
 * @module services/projects
 */

import type { ProjectRef, Project, Visibility } from '../types.js';
import type { GitLabClient, Page } from '../client.js';

// ============================================================================
// Access Level Constants
// ============================================================================

/**
 * GitLab access levels for project members
 *
 * Defines the different permission levels that can be assigned to project members.
 *
 * @see https://docs.gitlab.com/ee/api/members.html#valid-access-levels
 */
export const GitLabAccessLevel = {
  /** No access */
  NO_ACCESS: 0,
  /** Minimal access (available in GitLab Premium) */
  MINIMAL_ACCESS: 5,
  /** Guest access - can view project, create issues, comments */
  GUEST: 10,
  /** Reporter access - can pull, download artifacts, view code */
  REPORTER: 20,
  /** Developer access - can push, create merge requests */
  DEVELOPER: 30,
  /** Maintainer access - can manage project settings, members */
  MAINTAINER: 40,
  /** Owner access - full access, can delete project */
  OWNER: 50,
} as const;

export type GitLabAccessLevelValue =
  (typeof GitLabAccessLevel)[keyof typeof GitLabAccessLevel];

// ============================================================================
// Additional Types for Project Operations
// ============================================================================

/**
 * Project member information
 */
export interface ProjectMember {
  /**
   * User ID
   */
  readonly id: number;

  /**
   * Username
   */
  readonly username: string;

  /**
   * Full name
   */
  readonly name: string;

  /**
   * User state (active, blocked, etc.)
   */
  readonly state: string;

  /**
   * Avatar URL
   */
  readonly avatar_url: string;

  /**
   * Web URL to user profile
   */
  readonly web_url: string;

  /**
   * Access level (see GitLabAccessLevel)
   */
  readonly access_level: number;
}

/**
 * Project CI/CD variable
 */
export interface ProjectVariable {
  /**
   * Variable key/name
   */
  readonly key: string;

  /**
   * Variable value
   */
  readonly value: string;

  /**
   * Variable type
   */
  readonly variable_type: 'env_var' | 'file';

  /**
   * Whether the variable is protected (only available in protected branches/tags)
   */
  readonly protected: boolean;

  /**
   * Whether the variable value is masked in logs
   */
  readonly masked: boolean;

  /**
   * Environment scope where the variable is available
   */
  readonly environment_scope: string;
}

/**
 * Project statistics
 */
export interface ProjectStatistics {
  /**
   * Number of commits in the repository
   */
  readonly commit_count: number;

  /**
   * Total storage size in bytes
   */
  readonly storage_size: number;

  /**
   * Repository size in bytes
   */
  readonly repository_size: number;

  /**
   * Wiki size in bytes
   */
  readonly wiki_size: number;

  /**
   * LFS objects size in bytes
   */
  readonly lfs_objects_size: number;

  /**
   * Job artifacts size in bytes
   */
  readonly job_artifacts_size: number;

  /**
   * Pipeline artifacts size in bytes
   */
  readonly pipeline_artifacts_size: number;

  /**
   * Packages size in bytes
   */
  readonly packages_size: number;

  /**
   * Snippets size in bytes
   */
  readonly snippets_size: number;

  /**
   * Uploads size in bytes
   */
  readonly uploads_size: number;
}

/**
 * Options for listing projects
 */
export interface ListProjectsOptions {
  /**
   * Limit to projects where the current user is a member
   */
  readonly membership?: boolean;

  /**
   * Limit to projects owned by the current user
   */
  readonly owned?: boolean;

  /**
   * Search for projects by name or path
   */
  readonly search?: string;

  /**
   * Filter by visibility level
   */
  readonly visibility?: Visibility;

  /**
   * Limit to projects with issues feature enabled
   */
  readonly with_issues_enabled?: boolean;

  /**
   * Limit to projects with merge requests feature enabled
   */
  readonly with_merge_requests_enabled?: boolean;

  /**
   * Filter by archived status
   */
  readonly archived?: boolean;

  /**
   * Order results by field
   */
  readonly order_by?:
    | 'id'
    | 'name'
    | 'path'
    | 'created_at'
    | 'updated_at'
    | 'last_activity_at';

  /**
   * Sort direction
   */
  readonly sort?: 'asc' | 'desc';

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
 * Options for listing project members
 */
export interface ListProjectMembersOptions {
  /**
   * Search for members by name or username
   */
  readonly query?: string;

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
// Projects Service
// ============================================================================

/**
 * Service for project operations in GitLab
 *
 * Provides methods for managing projects, members, variables, and statistics.
 *
 * @example
 * ```typescript
 * const service = createProjectsService(client);
 *
 * // Get a project
 * const project = await service.get({ type: 'Path', value: 'group/project' });
 *
 * // List projects
 * const projects = await service.list({ membership: true, perPage: 20 });
 *
 * // Get project members
 * const members = await service.getMembers(
 *   { type: 'Id', value: 123 }
 * );
 * ```
 */
export class ProjectsService {
  /**
   * Creates a new ProjectsService instance
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

  // ==========================================================================
  // Project Operations
  // ==========================================================================

  /**
   * Gets a specific project
   *
   * @param project - Project reference
   * @returns Project information with full details
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * // Get by ID
   * const project = await service.get({ type: 'Id', value: 123 });
   *
   * // Get by path
   * const project = await service.get({ type: 'Path', value: 'group/project' });
   *
   * console.log(project.name);
   * console.log(project.web_url);
   * ```
   */
  async get(project: ProjectRef): Promise<Project> {
    const projectId = this.encodeProjectRef(project);

    const response = await this.client.get<Project>(`/projects/${projectId}`);

    return response.data;
  }

  /**
   * Lists accessible projects
   *
   * Returns a paginated list of projects that the authenticated user has access to.
   * Can be filtered by membership, ownership, visibility, and other criteria.
   *
   * @param options - Optional filtering and pagination options
   * @returns Paginated list of projects
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * // Get all accessible projects
   * const allProjects = await service.list();
   *
   * // Get projects where user is a member
   * const memberProjects = await service.list({ membership: true });
   *
   * // Search for projects
   * const searchResults = await service.list({
   *   search: 'api',
   *   visibility: Visibility.Public,
   *   order_by: 'name',
   *   sort: 'asc'
   * });
   *
   * // Navigate pages
   * if (searchResults.hasNext && searchResults.nextPage) {
   *   const nextPage = await searchResults.nextPage();
   * }
   * ```
   */
  async list(options?: ListProjectsOptions): Promise<Page<Project>> {
    const params: Record<string, string | number | boolean> = {};

    if (options?.membership !== undefined) params.membership = options.membership;
    if (options?.owned !== undefined) params.owned = options.owned;
    if (options?.search) params.search = options.search;
    if (options?.visibility) params.visibility = options.visibility;
    if (options?.with_issues_enabled !== undefined)
      params.with_issues_enabled = options.with_issues_enabled;
    if (options?.with_merge_requests_enabled !== undefined)
      params.with_merge_requests_enabled = options.with_merge_requests_enabled;
    if (options?.archived !== undefined) params.archived = options.archived;
    if (options?.order_by) params.order_by = options.order_by;
    if (options?.sort) params.sort = options.sort;
    if (options?.page) params.page = options.page;
    if (options?.perPage) params.perPage = options.perPage;

    return this.client.getPaginated<Project>('/projects', { page: options?.page, perPage: options?.perPage }, { query: params });
  }

  // ==========================================================================
  // Project Member Operations
  // ==========================================================================

  /**
   * Gets project members
   *
   * Returns a paginated list of members for a specific project, including their
   * access levels and user information.
   *
   * @param project - Project reference
   * @param options - Optional search and pagination options
   * @returns Paginated list of project members
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * // Get all members
   * const members = await service.getMembers({ type: 'Id', value: 123 });
   *
   * for (const member of members.items) {
   *   console.log(`${member.name} (${member.username})`);
   *   console.log(`Access level: ${member.access_level}`);
   * }
   *
   * // Search for specific members
   * const filtered = await service.getMembers(
   *   { type: 'Path', value: 'group/project' },
   *   { query: 'john' }
   * );
   * ```
   */
  async getMembers(
    project: ProjectRef,
    options?: ListProjectMembersOptions
  ): Promise<Page<ProjectMember>> {
    const projectId = this.encodeProjectRef(project);

    const params: Record<string, string | number | boolean> = {};
    if (options?.query) params.query = options.query;
    if (options?.page) params.page = options.page;
    if (options?.perPage) params.perPage = options.perPage;

    return this.client.getPaginated<ProjectMember>(
      `/projects/${projectId}/members`,
      { page: options?.page, perPage: options?.perPage },
      { query: params }
    );
  }

  /**
   * Gets a specific project member
   *
   * @param project - Project reference
   * @param userId - User ID of the member
   * @returns Project member information
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const member = await service.getMember(
   *   { type: 'Id', value: 123 },
   *   456
   * );
   * console.log(`${member.name} has access level ${member.access_level}`);
   * ```
   */
  async getMember(project: ProjectRef, userId: number): Promise<ProjectMember> {
    const projectId = this.encodeProjectRef(project);

    const response = await this.client.get<ProjectMember>(
      `/projects/${projectId}/members/${userId}`
    );

    return response.data;
  }

  // ==========================================================================
  // Project Variable Operations
  // ==========================================================================

  /**
   * Gets all CI/CD variables for a project
   *
   * Returns all variables defined at the project level. Note that variable values
   * are only visible to users with maintainer or higher access.
   *
   * @param project - Project reference
   * @returns Array of project variables
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const variables = await service.getVariables({ type: 'Id', value: 123 });
   *
   * for (const variable of variables) {
   *   console.log(`${variable.key}: ${variable.masked ? '[MASKED]' : variable.value}`);
   *   console.log(`  Type: ${variable.variable_type}`);
   *   console.log(`  Protected: ${variable.protected}`);
   *   console.log(`  Scope: ${variable.environment_scope}`);
   * }
   * ```
   */
  async getVariables(project: ProjectRef): Promise<ProjectVariable[]> {
    const projectId = this.encodeProjectRef(project);

    const response = await this.client.get<ProjectVariable[]>(
      `/projects/${projectId}/variables`
    );

    return response.data;
  }

  /**
   * Gets a specific CI/CD variable for a project
   *
   * @param project - Project reference
   * @param key - Variable key/name
   * @returns Project variable
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const variable = await service.getVariable(
   *   { type: 'Path', value: 'group/project' },
   *   'API_KEY'
   * );
   * console.log(`${variable.key}: ${variable.masked ? '[MASKED]' : variable.value}`);
   * ```
   */
  async getVariable(project: ProjectRef, key: string): Promise<ProjectVariable> {
    const projectId = this.encodeProjectRef(project);
    const variableKey = encodeURIComponent(key);

    const response = await this.client.get<ProjectVariable>(
      `/projects/${projectId}/variables/${variableKey}`
    );

    return response.data;
  }

  // ==========================================================================
  // Project Metadata Operations
  // ==========================================================================

  /**
   * Gets programming languages used in a project
   *
   * Returns a breakdown of programming languages used in the project repository,
   * with percentages indicating the proportion of each language.
   *
   * @param project - Project reference
   * @returns Object mapping language names to percentages
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const languages = await service.getLanguages({ type: 'Id', value: 123 });
   *
   * // Example result: { "TypeScript": 65.3, "JavaScript": 25.2, "CSS": 9.5 }
   * for (const [language, percentage] of Object.entries(languages)) {
   *   console.log(`${language}: ${percentage.toFixed(1)}%`);
   * }
   * ```
   */
  async getLanguages(project: ProjectRef): Promise<Record<string, number>> {
    const projectId = this.encodeProjectRef(project);

    const response = await this.client.get<Record<string, number>>(
      `/projects/${projectId}/languages`
    );

    return response.data;
  }

  /**
   * Gets detailed statistics for a project
   *
   * Returns storage and repository statistics for the project, including
   * commit count, repository size, and sizes of various project components.
   *
   * @param project - Project reference
   * @returns Project statistics
   * @throws GitLabError if the request fails
   *
   * @example
   * ```typescript
   * const stats = await service.getStatistics({ type: 'Path', value: 'group/project' });
   *
   * console.log(`Commits: ${stats.commit_count}`);
   * console.log(`Repository size: ${(stats.repository_size / 1024 / 1024).toFixed(2)} MB`);
   * console.log(`Storage size: ${(stats.storage_size / 1024 / 1024).toFixed(2)} MB`);
   * console.log(`LFS objects: ${(stats.lfs_objects_size / 1024 / 1024).toFixed(2)} MB`);
   * ```
   */
  async getStatistics(project: ProjectRef): Promise<ProjectStatistics> {
    const projectId = this.encodeProjectRef(project);

    // Request project with statistics=true to get the statistics field
    const response = await this.client.get<Project & { statistics?: ProjectStatistics }>(
      `/projects/${projectId}`,
      {
        query: { statistics: true },
      }
    );

    if (!response.data.statistics) {
      throw new Error('Project statistics not available');
    }

    return response.data.statistics;
  }
}

// ============================================================================
// Helper Function
// ============================================================================

/**
 * Helper function to encode a project reference for use in URLs
 *
 * This is exported as a standalone utility function for use in other services
 * or custom implementations.
 *
 * @param project - Project reference (ID, path, or URL)
 * @returns URL-encoded project identifier
 *
 * @example
 * ```typescript
 * import { encodeProjectRef } from './services/projects.js';
 *
 * // Use in custom API calls
 * const projectId = encodeProjectRef({ type: 'Path', value: 'group/project' });
 * const url = `/projects/${projectId}/custom-endpoint`;
 * ```
 */
export function encodeProjectRef(project: ProjectRef): string {
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

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new ProjectsService instance
 *
 * @param client - GitLab client instance
 * @returns ProjectsService instance
 *
 * @example
 * ```typescript
 * import { GitLabClient } from '../client.js';
 * import { createProjectsService } from './projects.js';
 *
 * const client = new GitLabClient(config, tokenProvider);
 * const projects = createProjectsService(client);
 *
 * // Use the service
 * const project = await projects.get({ type: 'Path', value: 'group/project' });
 * console.log(project.name);
 * ```
 */
export function createProjectsService(client: GitLabClient): ProjectsService {
  return new ProjectsService(client);
}
