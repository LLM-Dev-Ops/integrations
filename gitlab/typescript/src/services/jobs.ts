/**
 * GitLab Jobs Service
 *
 * Provides operations for managing GitLab CI/CD jobs including:
 * - Job lifecycle operations (get, list, retry, cancel, play, erase)
 * - Job log streaming and retrieval
 * - Job artifact operations
 * - Job status monitoring and waiting utilities
 *
 * @module services/jobs
 */

import type { GitLabClient, Page } from '../client.js';
import type {
  Job,
  JobRef,
  JobStatus,
  ProjectRef,
} from '../types.js';
import { isTerminalJobStatus } from '../types.js';

// ============================================================================
// Request and Response Types
// ============================================================================

/**
 * Options for listing jobs
 */
export interface ListJobsOptions {
  /**
   * Filter jobs by status
   */
  scope?: JobStatus[];

  /**
   * Page number for pagination (1-indexed)
   */
  page?: number;

  /**
   * Number of items per page (default: 20, max: 100)
   */
  perPage?: number;
}

/**
 * Options for streaming job logs
 */
export interface StreamLogOptions {
  /**
   * Polling interval in milliseconds (default: 2000)
   */
  pollIntervalMs?: number;
}

/**
 * Options for waiting for job completion
 */
export interface WaitForCompletionOptions {
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  pollIntervalMs?: number;

  /**
   * Timeout in milliseconds (default: 3600000 - 1 hour)
   */
  timeoutMs?: number;
}

/**
 * Artifact file metadata
 */
export interface ArtifactFile {
  /**
   * File name
   */
  filename: string;

  /**
   * File size in bytes
   */
  size: number;
}

/**
 * Job variable for manual jobs
 */
export interface JobVariable {
  /**
   * Variable key
   */
  key: string;

  /**
   * Variable value
   */
  value: string;
}


// ============================================================================
// Jobs Service
// ============================================================================

/**
 * Service for managing GitLab CI/CD jobs
 *
 * Provides comprehensive job operations including lifecycle management,
 * log streaming, artifact handling, and status monitoring.
 *
 * @example
 * ```typescript
 * const jobsService = createJobsService(client);
 *
 * // Get a job
 * const job = await jobsService.get({ project: { type: 'Path', value: 'group/project' }, id: 123 });
 *
 * // Stream job logs
 * for await (const chunk of jobsService.streamLog(jobRef)) {
 *   console.log(chunk);
 * }
 *
 * // Wait for job completion
 * const completedJob = await jobsService.waitForCompletion(jobRef);
 * ```
 */
export class JobsService {
  /**
   * Creates a new JobsService instance
   *
   * @param client - GitLab client instance
   */
  constructor(private readonly client: GitLabClient) {}

  // ============================================================================
  // Job Operations
  // ============================================================================

  /**
   * Get a specific job
   *
   * @param ref - Job reference
   * @returns Job details
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const job = await jobsService.get({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   * console.log(`Job status: ${job.status}`);
   * ```
   */
  async get(ref: JobRef): Promise<Job> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}`;

    const response = await this.client.get<Job>(path);
    return response.data;
  }

  /**
   * List jobs for a project
   *
   * @param project - Project reference
   * @param options - List options (scope, pagination)
   * @returns Page of jobs
   * @throws {NotFoundError} If project does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * // List all jobs
   * const jobs = await jobsService.list({ type: 'Path', value: 'group/project' });
   *
   * // List failed jobs
   * const failedJobs = await jobsService.list(
   *   { type: 'Path', value: 'group/project' },
   *   { scope: [JobStatus.Failed] }
   * );
   *
   * // Paginated results
   * const page2 = await jobsService.list(
   *   { type: 'Path', value: 'group/project' },
   *   { page: 2, perPage: 50 }
   * );
   * ```
   */
  async list(
    project: ProjectRef,
    options?: ListJobsOptions
  ): Promise<Page<Job>> {
    const projectId = this.encodeProjectRef(project);
    const path = `/projects/${projectId}/jobs`;

    const query: Record<string, any> = {};

    // Add scope filter (job status)
    if (options?.scope && options.scope.length > 0) {
      query['scope[]'] = options.scope;
    }

    // Add pagination parameters
    if (options?.page) {
      query.page = options.page;
    }

    if (options?.perPage) {
      query.per_page = options.perPage;
    }

    return await this.client.getPaginated<Job>(path, {
      page: options?.page,
      perPage: options?.perPage,
    }, { query });
  }

  /**
   * Retry a failed or canceled job
   *
   * @param ref - Job reference
   * @returns Updated job details
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions or cannot retry
   *
   * @example
   * ```typescript
   * const retriedJob = await jobsService.retry({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   * console.log(`Job retried, new status: ${retriedJob.status}`);
   * ```
   */
  async retry(ref: JobRef): Promise<Job> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/retry`;

    const response = await this.client.post<Job>(path);
    return response.data;
  }

  /**
   * Cancel a running or pending job
   *
   * @param ref - Job reference
   * @returns Updated job details
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions or cannot cancel
   *
   * @example
   * ```typescript
   * const canceledJob = await jobsService.cancel({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   * console.log(`Job canceled: ${canceledJob.status}`);
   * ```
   */
  async cancel(ref: JobRef): Promise<Job> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/cancel`;

    const response = await this.client.post<Job>(path);
    return response.data;
  }

  /**
   * Play (trigger) a manual job
   *
   * Manual jobs require explicit triggering. This method can also pass
   * job-specific variables when triggering the job.
   *
   * @param ref - Job reference
   * @param variables - Optional job variables to pass
   * @returns Updated job details
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions or job is not manual
   *
   * @example
   * ```typescript
   * // Play a manual job
   * const playedJob = await jobsService.play({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   *
   * // Play with variables
   * const jobWithVars = await jobsService.play(
   *   { project: { type: 'Path', value: 'group/project' }, id: 456 },
   *   [
   *     { key: 'ENVIRONMENT', value: 'production' },
   *     { key: 'VERSION', value: '1.2.3' }
   *   ]
   * );
   * ```
   */
  async play(ref: JobRef, variables?: JobVariable[]): Promise<Job> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/play`;

    const body: Record<string, any> = {};

    if (variables && variables.length > 0) {
      body.job_variables_attributes = variables;
    }

    const response = await this.client.post<Job>(
      path,
      Object.keys(body).length > 0 ? body : undefined
    );
    return response.data;
  }

  /**
   * Erase a job (delete trace and artifacts)
   *
   * This permanently deletes the job's log trace and artifacts.
   * Use with caution as this operation cannot be undone.
   *
   * @param ref - Job reference
   * @returns Updated job details
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const erasedJob = await jobsService.erase({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   * console.log('Job trace and artifacts erased');
   * ```
   */
  async erase(ref: JobRef): Promise<Job> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/erase`;

    const response = await this.client.post<Job>(path);
    return response.data;
  }

  // ============================================================================
  // Job Logs (Trace)
  // ============================================================================

  /**
   * Get the complete job log (trace)
   *
   * Returns the full log output as a string. For large logs, consider using
   * streamLog() instead to process logs incrementally.
   *
   * Note: This method makes a direct fetch call with text response handling
   * since the client's executeRequest expects JSON responses.
   *
   * @param ref - Job reference
   * @returns Complete job log as text
   * @throws {NotFoundError} If job does not exist or has no log
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const log = await jobsService.getLog({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   * console.log(log);
   * ```
   */
  async getLog(ref: JobRef): Promise<string> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/trace`;

    // Use longer timeout for log retrieval
    const config = this.client.getConfig();
    const timeout = config.logTimeout;

    // Make direct fetch call since we need text response, not JSON
    const url = this.client.buildUrl(path);
    const response = await this.fetchWithAuth(url, { timeout });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const { parseGitLabError } = await import('../errors.js');
      throw parseGitLabError(response.status, body, response.headers);
    }

    return await response.text();
  }

  /**
   * Stream job logs in real-time
   *
   * Implements incremental log streaming using offset-based polling.
   * Yields new log content as it becomes available until the job reaches
   * a terminal state.
   *
   * Uses adaptive polling: increases interval when no new content is available
   * to reduce API load.
   *
   * @param ref - Job reference
   * @param options - Streaming options (poll interval)
   * @yields New log content chunks
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * // Stream logs to console
   * for await (const chunk of jobsService.streamLog(jobRef)) {
   *   process.stdout.write(chunk);
   * }
   *
   * // Custom poll interval
   * for await (const chunk of jobsService.streamLog(jobRef, { pollIntervalMs: 1000 })) {
   *   console.log(chunk);
   * }
   * ```
   */
  async *streamLog(
    ref: JobRef,
    options?: StreamLogOptions
  ): AsyncGenerator<string, void, unknown> {
    const projectId = this.encodeProjectRef(ref.project);
    const basePath = `/projects/${projectId}/jobs/${ref.id}/trace`;

    let offset = 0;
    let pollInterval = options?.pollIntervalMs ?? 2000;
    const basePollInterval = pollInterval;
    const maxPollInterval = pollInterval * 4; // Max 4x base interval
    let consecutiveEmptyPolls = 0;

    while (true) {
      try {
        // Fetch log with offset
        const url = this.client.buildUrl(basePath, { offset });
        const response = await this.fetchWithAuth(url);

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const { parseGitLabError } = await import('../errors.js');
          throw parseGitLabError(response.status, body, response.headers);
        }

        // Get new log content
        const content = await response.text();

        // Check X-Gitlab-Trace-Size header for total size
        const traceSizeHeader = response.headers.get('X-Gitlab-Trace-Size');
        if (traceSizeHeader) {
          const traceSize = parseInt(traceSizeHeader, 10);
          if (!isNaN(traceSize)) {
            offset = traceSize;
          }
        } else {
          // If header not present, increment offset by content length
          offset += content.length;
        }

        // Yield new content if available
        if (content.length > 0) {
          yield content;
          consecutiveEmptyPolls = 0;
          pollInterval = basePollInterval; // Reset to base interval
        } else {
          consecutiveEmptyPolls++;
          // Increase poll interval adaptively (but cap at max)
          pollInterval = Math.min(
            basePollInterval * (1 + consecutiveEmptyPolls * 0.5),
            maxPollInterval
          );
        }

        // Check if job is complete
        const job = await this.get(ref);
        if (isTerminalJobStatus(job.status)) {
          // Job is complete, stop streaming
          break;
        }

        // Wait before next poll
        await this.sleep(pollInterval);
      } catch (error) {
        // On error, stop streaming
        throw error;
      }
    }
  }

  // ============================================================================
  // Job Artifacts
  // ============================================================================

  /**
   * Download all job artifacts as a zip archive
   *
   * @param ref - Job reference
   * @returns Artifact zip file as ArrayBuffer
   * @throws {NotFoundError} If job does not exist or has no artifacts
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const artifacts = await jobsService.downloadArtifacts({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   *
   * // Save to file (Node.js)
   * import { writeFile } from 'fs/promises';
   * await writeFile('artifacts.zip', Buffer.from(artifacts));
   * ```
   */
  async downloadArtifacts(ref: JobRef): Promise<ArrayBuffer> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/artifacts`;
    const url = this.client.buildUrl(path);

    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const { parseGitLabError } = await import('../errors.js');
      throw parseGitLabError(response.status, body, response.headers);
    }

    return await response.arrayBuffer();
  }

  /**
   * Download a specific file from job artifacts
   *
   * @param ref - Job reference
   * @param artifactPath - Path to file within artifacts
   * @returns File content as ArrayBuffer
   * @throws {NotFoundError} If job/artifact does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const file = await jobsService.downloadArtifactFile(
   *   { project: { type: 'Path', value: 'group/project' }, id: 123 },
   *   'coverage/index.html'
   * );
   *
   * // Save to file (Node.js)
   * import { writeFile } from 'fs/promises';
   * await writeFile('coverage.html', Buffer.from(file));
   * ```
   */
  async downloadArtifactFile(
    ref: JobRef,
    artifactPath: string
  ): Promise<ArrayBuffer> {
    const projectId = this.encodeProjectRef(ref.project);
    const path = `/projects/${projectId}/jobs/${ref.id}/artifacts/${artifactPath}`;
    const url = this.client.buildUrl(path);

    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const { parseGitLabError } = await import('../errors.js');
      throw parseGitLabError(response.status, body, response.headers);
    }

    return await response.arrayBuffer();
  }

  /**
   * List artifact files for a job
   *
   * Note: GitLab API doesn't provide a dedicated endpoint for listing artifacts.
   * This method downloads the artifacts zip and parses the file list.
   *
   * @param ref - Job reference
   * @returns List of artifact files with metadata
   * @throws {NotFoundError} If job does not exist or has no artifacts
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const files = await jobsService.listArtifacts({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   *
   * files.forEach(file => {
   *   console.log(`${file.filename}: ${file.size} bytes`);
   * });
   * ```
   */
  async listArtifacts(ref: JobRef): Promise<ArtifactFile[]> {
    // Get job details to check artifacts
    const job = await this.get(ref);

    if (!job.artifacts || job.artifacts.length === 0) {
      return [];
    }

    // Map artifacts to ArtifactFile format
    return job.artifacts.map(artifact => ({
      filename: artifact.filename,
      size: artifact.size,
    }));
  }

  // ============================================================================
  // Waiting Utilities
  // ============================================================================

  /**
   * Wait for a job to complete
   *
   * Polls the job status until it reaches a terminal state (success, failed,
   * canceled, or skipped). Returns the final job state.
   *
   * @param ref - Job reference
   * @param options - Wait options (poll interval, timeout)
   * @returns Final job state
   * @throws {TimeoutError} If timeout is reached before completion
   * @throws {NotFoundError} If job does not exist
   * @throws {UnauthorizedError} If not authenticated
   * @throws {ForbiddenError} If insufficient permissions
   *
   * @example
   * ```typescript
   * // Wait with defaults (5s poll, 1 hour timeout)
   * const completedJob = await jobsService.waitForCompletion({
   *   project: { type: 'Path', value: 'group/project' },
   *   id: 123
   * });
   * console.log(`Job finished with status: ${completedJob.status}`);
   *
   * // Custom timeout and poll interval
   * const job = await jobsService.waitForCompletion(
   *   jobRef,
   *   { pollIntervalMs: 2000, timeoutMs: 600000 } // 2s poll, 10min timeout
   * );
   * ```
   */
  async waitForCompletion(
    ref: JobRef,
    options?: WaitForCompletionOptions
  ): Promise<Job> {
    const pollInterval = options?.pollIntervalMs ?? 5000;
    const timeout = options?.timeoutMs ?? 3600000; // 1 hour default
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        const { TimeoutError } = await import('../errors.js');
        throw new TimeoutError(
          `Job did not complete within ${timeout}ms timeout`
        );
      }

      // Get current job status
      const job = await this.get(ref);

      // Check if job is in terminal state
      if (this.isComplete(job)) {
        return job;
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }
  }

  // ============================================================================
  // Status Helpers
  // ============================================================================

  /**
   * Check if a job is complete (in terminal state)
   *
   * @param job - Job to check
   * @returns True if job is in a terminal state
   *
   * @example
   * ```typescript
   * const job = await jobsService.get(jobRef);
   * if (jobsService.isComplete(job)) {
   *   console.log('Job is complete');
   * }
   * ```
   */
  isComplete(job: Job): boolean {
    return isTerminalJobStatus(job.status);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Encode a project reference for use in API paths
   *
   * @param project - Project reference
   * @returns URL-encoded project identifier
   */
  private encodeProjectRef(project: ProjectRef): string {
    switch (project.type) {
      case 'Id':
        return String(project.value);
      case 'Path':
        return encodeURIComponent(project.value);
      case 'Url':
        // Extract path from URL
        const url = new URL(project.value);
        const pathMatch = url.pathname.match(/\/(.+?)(?:\.git)?$/);
        if (pathMatch) {
          return encodeURIComponent(pathMatch[1]);
        }
        throw new Error(`Invalid project URL: ${project.value}`);
      default:
        // Type guard for exhaustive check
        const _exhaustive: never = project;
        throw new Error(`Unknown project ref type: ${JSON.stringify(project)}`);
    }
  }

  /**
   * Make an authenticated fetch request
   *
   * Helper method for making raw HTTP requests with authentication.
   * Used for non-JSON responses like logs (text) and artifacts (binary).
   *
   * @param url - Full URL to fetch
   * @param options - Fetch options
   * @returns Fetch response
   */
  private async fetchWithAuth(
    url: string,
    options?: { timeout?: number }
  ): Promise<Response> {
    const config = this.client.getConfig();
    const timeout = options?.timeout || config.timeout;

    // Get authentication token
    const token = await this.client.getAuthToken();

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        const { TimeoutError } = await import('../errors.js');
        throw new TimeoutError(`Request timed out after ${timeout}ms`, error);
      }

      // Handle network errors
      if (error instanceof TypeError) {
        const { NetworkError } = await import('../errors.js');
        throw new NetworkError('Network request failed', error);
      }

      throw error;
    }
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms - Milliseconds to sleep
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new JobsService instance
 *
 * @param client - GitLab client instance
 * @returns JobsService instance
 *
 * @example
 * ```typescript
 * import { GitLabClient } from './client.js';
 * import { createJobsService } from './services/jobs.js';
 *
 * const client = new GitLabClient(config, tokenProvider);
 * const jobsService = createJobsService(client);
 *
 * // Use the service
 * const jobs = await jobsService.list({ type: 'Path', value: 'group/project' });
 * ```
 */
export function createJobsService(client: GitLabClient): JobsService {
  return new JobsService(client);
}
