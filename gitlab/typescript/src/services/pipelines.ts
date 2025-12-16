/**
 * GitLab Pipelines Service
 *
 * Provides comprehensive pipeline management operations for the GitLab integration.
 * Handles pipeline CRUD operations, job retrieval, variables, test reports, and status polling.
 */

import { GitLabClient, Page } from '../client.js';
import {
  ProjectRef,
  PipelineRef,
  Pipeline,
  PipelineQuery,
  PipelineVariable,
  Job,
  JobStatus,
  isTerminalPipelineStatus,
} from '../types.js';
import { TimeoutError, InvalidProjectRefError } from '../errors.js';

// ============================================================================
// Test Report Types
// ============================================================================

/**
 * Individual test case result
 */
export interface TestCase {
  /**
   * Test execution status
   */
  readonly status: 'success' | 'failed' | 'skipped' | 'error';

  /**
   * Test case name
   */
  readonly name: string;

  /**
   * Test class name
   */
  readonly classname: string;

  /**
   * Execution time in seconds
   */
  readonly execution_time: number;

  /**
   * System output (stdout/stderr)
   */
  readonly system_output?: string;

  /**
   * Stack trace for failed tests
   */
  readonly stack_trace?: string;
}

/**
 * Test suite containing multiple test cases
 */
export interface TestSuite {
  /**
   * Test suite name
   */
  readonly name: string;

  /**
   * Total execution time in seconds
   */
  readonly total_time: number;

  /**
   * Total number of test cases
   */
  readonly total_count: number;

  /**
   * Number of successful test cases
   */
  readonly success_count: number;

  /**
   * Number of failed test cases
   */
  readonly failed_count: number;

  /**
   * Number of skipped test cases
   */
  readonly skipped_count: number;

  /**
   * Number of test cases with errors
   */
  readonly error_count: number;

  /**
   * Individual test cases in this suite
   */
  readonly test_cases: readonly TestCase[];
}

/**
 * Complete test report for a pipeline
 */
export interface TestReport {
  /**
   * Total execution time in seconds
   */
  readonly total_time: number;

  /**
   * Total number of test cases across all suites
   */
  readonly total_count: number;

  /**
   * Number of successful test cases
   */
  readonly success_count: number;

  /**
   * Number of failed test cases
   */
  readonly failed_count: number;

  /**
   * Number of skipped test cases
   */
  readonly skipped_count: number;

  /**
   * Number of test cases with errors
   */
  readonly error_count: number;

  /**
   * Test suites in this report
   */
  readonly test_suites: readonly TestSuite[];
}

// ============================================================================
// Options Types
// ============================================================================

/**
 * Options for retrieving pipeline jobs or bridges
 */
export interface GetJobsOptions {
  /**
   * Filter jobs by status
   */
  readonly scope?: readonly JobStatus[];

  /**
   * Page number for pagination
   */
  readonly page?: number;

  /**
   * Number of items per page
   */
  readonly perPage?: number;
}

/**
 * Options for waiting for pipeline completion
 */
export interface WaitForCompletionOptions {
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  readonly pollIntervalMs?: number;

  /**
   * Timeout in milliseconds (default: 3600000 - 1 hour)
   */
  readonly timeoutMs?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Encodes a ProjectRef for use in URL paths
 *
 * @param project - Project reference
 * @returns URL-encoded project identifier
 * @throws InvalidProjectRefError if the project reference is invalid
 */
function encodeProjectRef(project: ProjectRef): string {
  switch (project.type) {
    case 'Id':
      return String(project.value);
    case 'Path':
      // URL encode the project path (e.g., "group/project" -> "group%2Fproject")
      return encodeURIComponent(project.value);
    case 'Url':
      // Extract project path from URL
      try {
        const url = new URL(project.value);
        const pathMatch = url.pathname.match(/\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
        if (!pathMatch) {
          throw new InvalidProjectRefError(
            'Unable to extract project path from URL',
            project.value
          );
        }
        return encodeURIComponent(pathMatch[1]);
      } catch (error) {
        throw new InvalidProjectRefError(
          'Invalid project URL format',
          project.value
        );
      }
    default:
      throw new InvalidProjectRefError('Unknown project reference type');
  }
}

/**
 * Encodes a PipelineRef for use in URL paths
 *
 * @param ref - Pipeline reference
 * @returns Tuple of [encoded project ID, pipeline ID]
 */
function encodePipelineRef(ref: PipelineRef): [string, number] {
  return [encodeProjectRef(ref.project), ref.id];
}

// ============================================================================
// Pipelines Service
// ============================================================================

/**
 * Service for managing GitLab CI/CD pipelines
 *
 * Provides operations for:
 * - Listing and filtering pipelines
 * - Creating and managing pipeline lifecycles
 * - Retrieving pipeline jobs and variables
 * - Accessing test reports
 * - Waiting for pipeline completion
 *
 * @example
 * ```typescript
 * const service = createPipelinesService(client);
 *
 * // List pipelines for a project
 * const pipelines = await service.list(
 *   { type: 'Path', value: 'group/project' },
 *   { status: PipelineStatus.Running }
 * );
 *
 * // Create a new pipeline
 * const pipeline = await service.create(
 *   { type: 'Path', value: 'group/project' },
 *   'main',
 *   [{ key: 'DEPLOY_ENV', value: 'staging' }]
 * );
 *
 * // Wait for completion
 * const completed = await service.waitForCompletion(
 *   { project: { type: 'Path', value: 'group/project' }, id: pipeline.id }
 * );
 * ```
 */
export class PipelinesService {
  /**
   * Creates a new PipelinesService instance
   *
   * @param client - GitLab client for making API requests
   */
  constructor(private readonly client: GitLabClient) {}

  /**
   * Lists pipelines for a project
   *
   * @param project - Project reference
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of pipelines
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * // List running pipelines on main branch
   * const pipelines = await service.list(
   *   { type: 'Path', value: 'group/project' },
   *   { ref: 'main', status: PipelineStatus.Running, per_page: 20 }
   * );
   * ```
   */
  async list(
    project: ProjectRef,
    query?: PipelineQuery
  ): Promise<Page<Pipeline>> {
    const projectId = encodeProjectRef(project);
    const path = `/projects/${projectId}/pipelines`;

    // Build query parameters
    const queryParams: Record<string, any> = {};
    if (query) {
      if (query.status) queryParams['status'] = query.status;
      if (query.ref) queryParams['ref'] = query.ref;
      if (query.sha) queryParams['sha'] = query.sha;
      if (query.username) queryParams['username'] = query.username;
      if (query.order_by) queryParams['order_by'] = query.order_by;
      if (query.sort) queryParams['sort'] = query.sort;
      if (query.page) queryParams['page'] = query.page;
      if (query.per_page) queryParams['per_page'] = query.per_page;
      if (query.updated_after) queryParams['updated_after'] = query.updated_after;
      if (query.updated_before) queryParams['updated_before'] = query.updated_before;
      if (query.source) queryParams['source'] = query.source;
    }

    return await this.client.getPaginated<Pipeline>(path, {
      page: query?.page,
      perPage: query?.per_page,
    }, {
      query: queryParams,
    });
  }

  /**
   * Gets a single pipeline by reference
   *
   * @param ref - Pipeline reference
   * @returns Pipeline details
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * const pipeline = await service.get({
   *   project: { type: 'Id', value: 123 },
   *   id: 456
   * });
   * ```
   */
  async get(ref: PipelineRef): Promise<Pipeline> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}`;

    const response = await this.client.get<Pipeline>(path);
    return response.data;
  }

  /**
   * Creates a new pipeline for a specific ref
   *
   * @param project - Project reference
   * @param ref - Git ref (branch, tag, or SHA) to run the pipeline on
   * @param variables - Optional pipeline variables
   * @returns Created pipeline
   * @throws BadRequestError if ref is invalid
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * // Create pipeline with variables
   * const pipeline = await service.create(
   *   { type: 'Path', value: 'group/project' },
   *   'main',
   *   [
   *     { key: 'DEPLOY_ENV', value: 'production' },
   *     { key: 'DEBUG', value: 'true', variable_type: 'env_var' }
   *   ]
   * );
   * ```
   */
  async create(
    project: ProjectRef,
    ref: string,
    variables?: PipelineVariable[]
  ): Promise<Pipeline> {
    const projectId = encodeProjectRef(project);
    const path = `/projects/${projectId}/pipeline`;

    const body: Record<string, any> = { ref };
    if (variables && variables.length > 0) {
      body.variables = variables.map((v) => ({
        key: v.key,
        value: v.value,
        variable_type: v.variable_type,
      }));
    }

    const response = await this.client.post<Pipeline>(path, body);
    return response.data;
  }

  /**
   * Cancels a running pipeline
   *
   * @param ref - Pipeline reference
   * @returns Updated pipeline with canceled status
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * const pipeline = await service.cancel({
   *   project: { type: 'Id', value: 123 },
   *   id: 456
   * });
   * console.log(pipeline.status); // 'canceled'
   * ```
   */
  async cancel(ref: PipelineRef): Promise<Pipeline> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}/cancel`;

    const response = await this.client.post<Pipeline>(path);
    return response.data;
  }

  /**
   * Retries a failed pipeline
   *
   * @param ref - Pipeline reference
   * @returns New pipeline created from retry
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * const newPipeline = await service.retry({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 456
   * });
   * ```
   */
  async retry(ref: PipelineRef): Promise<Pipeline> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}/retry`;

    const response = await this.client.post<Pipeline>(path);
    return response.data;
  }

  /**
   * Deletes a pipeline
   *
   * @param ref - Pipeline reference
   * @throws NotFoundError if pipeline doesn't exist
   * @throws ForbiddenError if user lacks delete permissions
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * await service.delete({
   *   project: { type: 'Id', value: 123 },
   *   id: 456
   * });
   * ```
   */
  async delete(ref: PipelineRef): Promise<void> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}`;

    await this.client.delete<void>(path);
  }

  /**
   * Gets jobs for a pipeline
   *
   * @param ref - Pipeline reference
   * @param options - Optional filtering and pagination options
   * @returns Paginated list of jobs
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * // Get all failed jobs
   * const jobs = await service.getJobs(
   *   { project: { type: 'Id', value: 123 }, id: 456 },
   *   { scope: [JobStatus.Failed], perPage: 50 }
   * );
   * ```
   */
  async getJobs(
    ref: PipelineRef,
    options?: GetJobsOptions
  ): Promise<Page<Job>> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}/jobs`;

    const queryParams: Record<string, any> = {};
    if (options?.scope && options.scope.length > 0) {
      // GitLab accepts scope[] as repeated query parameter
      queryParams['scope[]'] = options.scope;
    }

    return await this.client.getPaginated<Job>(path, {
      page: options?.page,
      perPage: options?.perPage,
    }, {
      query: queryParams,
    });
  }

  /**
   * Gets bridge jobs (downstream pipeline triggers) for a pipeline
   *
   * Bridge jobs trigger pipelines in other projects or in the same project.
   *
   * @param ref - Pipeline reference
   * @param options - Optional filtering and pagination options
   * @returns Paginated list of bridge jobs
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * const bridges = await service.getBridges({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 789
   * });
   * ```
   */
  async getBridges(
    ref: PipelineRef,
    options?: GetJobsOptions
  ): Promise<Page<Job>> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}/bridges`;

    const queryParams: Record<string, any> = {};
    if (options?.scope && options.scope.length > 0) {
      queryParams['scope[]'] = options.scope;
    }

    return await this.client.getPaginated<Job>(path, {
      page: options?.page,
      perPage: options?.perPage,
    }, {
      query: queryParams,
    });
  }

  /**
   * Gets variables used in a pipeline
   *
   * @param ref - Pipeline reference
   * @returns Array of pipeline variables
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * const variables = await service.getVariables({
   *   project: { type: 'Id', value: 123 },
   *   id: 456
   * });
   *
   * variables.forEach(v => {
   *   console.log(`${v.key}=${v.value}`);
   * });
   * ```
   */
  async getVariables(ref: PipelineRef): Promise<PipelineVariable[]> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}/variables`;

    const response = await this.client.get<PipelineVariable[]>(path);
    return response.data;
  }

  /**
   * Gets the test report for a pipeline
   *
   * The test report aggregates test results from all jobs in the pipeline
   * that produce JUnit XML test reports.
   *
   * @param ref - Pipeline reference
   * @returns Test report with aggregated results
   * @throws NotFoundError if pipeline doesn't exist or has no test reports
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * const report = await service.getTestReport({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 789
   * });
   *
   * console.log(`Total: ${report.total_count}, Failed: ${report.failed_count}`);
   * report.test_suites.forEach(suite => {
   *   console.log(`Suite: ${suite.name} - ${suite.success_count}/${suite.total_count} passed`);
   * });
   * ```
   */
  async getTestReport(ref: PipelineRef): Promise<TestReport> {
    const [projectId, pipelineId] = encodePipelineRef(ref);
    const path = `/projects/${projectId}/pipelines/${pipelineId}/test_report`;

    const response = await this.client.get<TestReport>(path);
    return response.data;
  }

  /**
   * Waits for a pipeline to reach a terminal state
   *
   * Polls the pipeline status at regular intervals until it completes
   * (success, failed, canceled, or skipped).
   *
   * @param ref - Pipeline reference
   * @param options - Polling configuration options
   * @returns Final pipeline state
   * @throws TimeoutError if timeout is exceeded
   * @throws NotFoundError if pipeline doesn't exist
   * @throws GitLabError on API failure
   *
   * @example
   * ```typescript
   * // Wait up to 30 minutes, polling every 10 seconds
   * const pipeline = await service.waitForCompletion(
   *   { project: { type: 'Id', value: 123 }, id: 456 },
   *   { pollIntervalMs: 10000, timeoutMs: 1800000 }
   * );
   *
   * if (pipeline.status === PipelineStatus.Success) {
   *   console.log('Pipeline succeeded!');
   * } else {
   *   console.log(`Pipeline finished with status: ${pipeline.status}`);
   * }
   * ```
   */
  async waitForCompletion(
    ref: PipelineRef,
    options?: WaitForCompletionOptions
  ): Promise<Pipeline> {
    const pollIntervalMs = options?.pollIntervalMs ?? 5000;
    const timeoutMs = options?.timeoutMs ?? 3600000; // 1 hour default

    const startTime = Date.now();

    while (true) {
      // Check for timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new TimeoutError(
          `Pipeline wait timeout after ${timeoutMs}ms`
        );
      }

      // Get current pipeline status
      const pipeline = await this.get(ref);

      // Check if pipeline has reached a terminal state
      if (this.isComplete(pipeline)) {
        return pipeline;
      }

      // Wait before next poll
      await this.sleep(pollIntervalMs);
    }
  }

  /**
   * Checks if a pipeline is in a terminal (completed) state
   *
   * @param pipeline - Pipeline to check
   * @returns True if pipeline status is terminal
   *
   * @example
   * ```typescript
   * const pipeline = await service.get(ref);
   * if (service.isComplete(pipeline)) {
   *   console.log('Pipeline has finished');
   * }
   * ```
   */
  isComplete(pipeline: Pipeline): boolean {
    return isTerminalPipelineStatus(pipeline.status);
  }

  /**
   * Sleeps for the specified duration
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after the delay
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new PipelinesService instance
 *
 * @param client - GitLab client for making API requests
 * @returns PipelinesService instance
 *
 * @example
 * ```typescript
 * import { GitLabClient } from './client.js';
 * import { createPipelinesService } from './services/pipelines.js';
 *
 * const client = new GitLabClient(config, tokenProvider);
 * const pipelinesService = createPipelinesService(client);
 *
 * const pipelines = await pipelinesService.list(
 *   { type: 'Path', value: 'group/project' }
 * );
 * ```
 */
export function createPipelinesService(client: GitLabClient): PipelinesService {
  return new PipelinesService(client);
}
