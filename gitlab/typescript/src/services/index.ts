/**
 * GitLab Services
 *
 * This module provides a comprehensive set of services for interacting with GitLab's API.
 * Each service encapsulates operations for a specific GitLab resource type.
 *
 * @module services
 *
 * @example
 * ```typescript
 * import { createGitLabServices } from './services';
 * import { GitLabClient } from './client';
 *
 * const client = new GitLabClient({ token: 'your-token' });
 * const services = createGitLabServices(client);
 *
 * // Use individual services
 * const repos = await services.repositories.listRepositories('group/project');
 * const mrs = await services.mergeRequests.listMergeRequests('group/project');
 * ```
 */

import { GitLabClient } from '../client.js';

// Re-export service classes and factory functions
export { RepositoriesService, createRepositoriesService, type TreeItem, type ListBranchesOptions, type GetTreeOptions } from './repositories.js';
export { MergeRequestsService, createMergeRequestsService, type Diff, type MergeRequestChanges, type MergeRequestApprovals } from './mergeRequests.js';
export { PipelinesService, createPipelinesService, type TestCase, type TestSuite, type TestReport, type GetJobsOptions, type WaitForCompletionOptions } from './pipelines.js';
export { JobsService, createJobsService, type ArtifactFile, type ListJobsOptions, type WaitForCompletionOptions as JobWaitOptions } from './jobs.js';
export { IssuesService, createIssuesService } from './issues.js';
export { ProjectsService, createProjectsService, GitLabAccessLevel, type ProjectMember, type ProjectVariable, type ProjectStatistics, type ListProjectsOptions, type ListProjectMembersOptions } from './projects.js';

// Import service types and factory functions for the interface and factory
import type { RepositoriesService } from './repositories.js';
import type { MergeRequestsService } from './mergeRequests.js';
import type { PipelinesService } from './pipelines.js';
import type { JobsService } from './jobs.js';
import type { IssuesService } from './issues.js';
import type { ProjectsService } from './projects.js';
import { createRepositoriesService } from './repositories.js';
import { createMergeRequestsService } from './mergeRequests.js';
import { createPipelinesService } from './pipelines.js';
import { createJobsService } from './jobs.js';
import { createIssuesService } from './issues.js';
import { createProjectsService } from './projects.js';

/**
 * GitLab Services Interface
 *
 * Groups all GitLab services together for convenient access.
 * This interface provides a unified namespace for all service operations.
 *
 * @interface GitLabServices
 *
 * @property {RepositoriesService} repositories - Service for repository operations
 * @property {MergeRequestsService} mergeRequests - Service for merge request operations
 * @property {PipelinesService} pipelines - Service for pipeline operations
 * @property {JobsService} jobs - Service for job operations
 * @property {IssuesService} issues - Service for issue operations
 * @property {ProjectsService} projects - Service for project operations
 */
export interface GitLabServices {
  repositories: RepositoriesService;
  mergeRequests: MergeRequestsService;
  pipelines: PipelinesService;
  jobs: JobsService;
  issues: IssuesService;
  projects: ProjectsService;
}

/**
 * Creates a complete set of GitLab services from a client instance.
 *
 * This factory function initializes all available GitLab services using the provided
 * client. It provides a convenient way to instantiate all services at once rather
 * than creating them individually.
 *
 * @param {GitLabClient} client - The GitLab client instance to use for API calls
 * @returns {GitLabServices} An object containing all initialized GitLab services
 *
 * @example
 * ```typescript
 * const client = new GitLabClient({ token: 'your-token' });
 * const services = createGitLabServices(client);
 *
 * // Access any service
 * const repositories = await services.repositories.listRepositories('group/project');
 * const issues = await services.issues.listIssues('group/project');
 * ```
 */
export function createGitLabServices(client: GitLabClient): GitLabServices {
  return {
    repositories: createRepositoriesService(client),
    mergeRequests: createMergeRequestsService(client),
    pipelines: createPipelinesService(client),
    jobs: createJobsService(client),
    issues: createIssuesService(client),
    projects: createProjectsService(client),
  };
}
