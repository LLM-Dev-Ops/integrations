/**
 * BigQuery Job Service
 *
 * Service for managing BigQuery jobs (query, load, extract, copy).
 * Following the SPARC specification.
 */

import { BigQueryConfig } from "../../config/index.js";
import { BigQueryRestTransport, AuthProvider, isSuccess, getRequestId } from "../../transport/index.js";
import { parseBigQueryError, JobError } from "../../error/index.js";
import { Job, JobStatus } from "../../types/job.js";
import {
  GetJobOptions,
  ListJobsOptions,
  ListJobsResponse,
  WaitOptions,
  JobCompletionResult,
} from "./types.js";
import { pollUntilDone } from "./polling.js";

/**
 * BigQuery Job Service.
 *
 * Provides operations for:
 * - Getting job details
 * - Listing jobs
 * - Cancelling jobs
 * - Waiting for job completion
 * - Getting job status
 */
export class JobService {
  private readonly config: BigQueryConfig;
  private readonly transport: BigQueryRestTransport;
  private readonly authProvider: AuthProvider;

  /**
   * Create a new JobService.
   *
   * @param config - BigQuery configuration
   * @param authProvider - Authentication provider
   */
  constructor(config: BigQueryConfig, authProvider: AuthProvider) {
    this.config = config;
    this.authProvider = authProvider;
    this.transport = new BigQueryRestTransport(authProvider, config.timeout);
  }

  /**
   * Get details of a specific job.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @param options - Get job options
   * @returns Job details
   * @throws JobError if job not found
   *
   * @example
   * ```typescript
   * const job = await jobService.get('my-project', 'job_abc123');
   * console.log(job.status.state); // 'DONE'
   * ```
   */
  async get(projectId: string, jobId: string, options?: GetJobOptions): Promise<Job> {
    let path = `/projects/${projectId}/jobs/${jobId}`;

    // Add location query parameter if provided
    const queryParams: string[] = [];
    if (options?.location) {
      queryParams.push(`location=${encodeURIComponent(options.location)}`);
    }

    if (queryParams.length > 0) {
      path += `?${queryParams.join("&")}`;
    }

    const response = await this.transport.get(path);

    if (!isSuccess(response)) {
      const requestId = getRequestId(response);
      throw parseBigQueryError(response.status, response.body.toString(), requestId);
    }

    const job = JSON.parse(response.body.toString()) as Job;
    return job;
  }

  /**
   * List jobs in a project.
   *
   * @param projectId - GCP project ID
   * @param options - List jobs options
   * @returns List of jobs with optional pagination token
   *
   * @example
   * ```typescript
   * const result = await jobService.list('my-project', {
   *   stateFilter: ['RUNNING'],
   *   maxResults: 10
   * });
   * console.log(`Found ${result.jobs.length} running jobs`);
   * ```
   */
  async list(projectId: string, options?: ListJobsOptions): Promise<ListJobsResponse> {
    let path = `/projects/${projectId}/jobs`;

    // Build query parameters
    const queryParams: string[] = [];

    if (options?.allUsers) {
      queryParams.push("allUsers=true");
    }

    if (options?.maxResults !== undefined) {
      queryParams.push(`maxResults=${options.maxResults}`);
    }

    if (options?.pageToken) {
      queryParams.push(`pageToken=${encodeURIComponent(options.pageToken)}`);
    }

    if (options?.projection) {
      queryParams.push(`projection=${options.projection}`);
    }

    if (options?.stateFilter && options.stateFilter.length > 0) {
      queryParams.push(`stateFilter=${options.stateFilter.join(",")}`);
    }

    if (options?.parentJobId) {
      queryParams.push(`parentJobId=${encodeURIComponent(options.parentJobId)}`);
    }

    if (options?.minCreationTime) {
      queryParams.push(`minCreationTime=${encodeURIComponent(options.minCreationTime)}`);
    }

    if (options?.maxCreationTime) {
      queryParams.push(`maxCreationTime=${encodeURIComponent(options.maxCreationTime)}`);
    }

    if (queryParams.length > 0) {
      path += `?${queryParams.join("&")}`;
    }

    const response = await this.transport.get(path);

    if (!isSuccess(response)) {
      const requestId = getRequestId(response);
      throw parseBigQueryError(response.status, response.body.toString(), requestId);
    }

    const result = JSON.parse(response.body.toString()) as {
      kind: string;
      etag: string;
      jobs?: Job[];
      nextPageToken?: string;
    };

    return {
      jobs: result.jobs ?? [],
      nextPageToken: result.nextPageToken,
    };
  }

  /**
   * Cancel a running job.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @param location - Optional job location
   * @returns Cancelled job details
   * @throws JobError if job not found or already completed
   *
   * @example
   * ```typescript
   * const job = await jobService.cancel('my-project', 'job_abc123');
   * console.log(job.status.state); // May be 'DONE' if cancelled successfully
   * ```
   */
  async cancel(projectId: string, jobId: string, location?: string): Promise<Job> {
    let path = `/projects/${projectId}/jobs/${jobId}/cancel`;

    // Add location query parameter if provided
    if (location) {
      path += `?location=${encodeURIComponent(location)}`;
    }

    const response = await this.transport.post(path);

    if (!isSuccess(response)) {
      const requestId = getRequestId(response);

      // Handle already-completed jobs gracefully
      if (response.status === 400) {
        const errorBody = response.body.toString();
        if (errorBody.includes("already complete") || errorBody.includes("already done")) {
          // Job already completed, fetch and return current state
          return this.get(projectId, jobId, { location });
        }
      }

      throw parseBigQueryError(response.status, response.body.toString(), requestId);
    }

    const result = JSON.parse(response.body.toString()) as { job: Job };
    return result.job;
  }

  /**
   * Wait for a job to complete with polling and exponential backoff.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @param options - Wait options (polling interval, timeout)
   * @returns Job completion result with timing information
   * @throws JobError if job fails or timeout is reached
   *
   * @example
   * ```typescript
   * const result = await jobService.wait('my-project', 'job_abc123', {
   *   pollingIntervalMs: 500,
   *   timeoutMs: 300000 // 5 minutes
   * });
   * console.log(`Job completed in ${result.durationMs}ms after ${result.pollCount} polls`);
   * ```
   */
  async wait(
    projectId: string,
    jobId: string,
    options?: WaitOptions
  ): Promise<JobCompletionResult> {
    const location = this.config.location;

    // Create check function for polling
    const checkFn = async (): Promise<Job> => {
      return this.get(projectId, jobId, { location });
    };

    // Poll until job completes
    return pollUntilDone(checkFn, options);
  }

  /**
   * Get the current status of a job.
   *
   * This is a convenience method that returns only the status field.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @returns Job status
   *
   * @example
   * ```typescript
   * const status = await jobService.getStatus('my-project', 'job_abc123');
   * if (status.state === 'DONE') {
   *   if (status.errorResult) {
   *     console.error('Job failed:', status.errorResult.message);
   *   } else {
   *     console.log('Job completed successfully');
   *   }
   * }
   * ```
   */
  async getStatus(projectId: string, jobId: string): Promise<JobStatus> {
    const job = await this.get(projectId, jobId);
    return job.status;
  }

  /**
   * Check if a job is complete.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @returns True if job is in DONE state
   *
   * @example
   * ```typescript
   * if (await jobService.isDone('my-project', 'job_abc123')) {
   *   console.log('Job is complete');
   * }
   * ```
   */
  async isDone(projectId: string, jobId: string): Promise<boolean> {
    const status = await this.getStatus(projectId, jobId);
    return status.state === "DONE";
  }

  /**
   * Check if a job has failed.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @returns True if job is done and has an error result
   *
   * @example
   * ```typescript
   * if (await jobService.hasFailed('my-project', 'job_abc123')) {
   *   const status = await jobService.getStatus('my-project', 'job_abc123');
   *   console.error('Job failed:', status.errorResult?.message);
   * }
   * ```
   */
  async hasFailed(projectId: string, jobId: string): Promise<boolean> {
    const status = await this.getStatus(projectId, jobId);
    return status.state === "DONE" && status.errorResult !== undefined;
  }

  /**
   * Wait for a job and cancel it if timeout is exceeded.
   *
   * @param projectId - GCP project ID
   * @param jobId - Job ID
   * @param options - Wait options
   * @returns Job completion result
   * @throws JobError if job fails or timeout is reached
   *
   * @example
   * ```typescript
   * try {
   *   const result = await jobService.waitOrCancel('my-project', 'job_abc123', {
   *     timeoutMs: 60000 // 1 minute
   *   });
   *   console.log('Job completed:', result.job.id);
   * } catch (error) {
   *   if (error instanceof JobError && error.code === 'Job.Timeout') {
   *     console.log('Job was cancelled due to timeout');
   *   }
   * }
   * ```
   */
  async waitOrCancel(
    projectId: string,
    jobId: string,
    options?: WaitOptions
  ): Promise<JobCompletionResult> {
    const location = this.config.location;
    const timeout = options?.timeoutMs ?? 600000; // 10 minutes default

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(async () => {
        try {
          await this.cancel(projectId, jobId, location);
          reject(
            new JobError(
              `Job cancelled due to timeout (${timeout}ms)`,
              "Timeout",
              { jobId, retryable: false }
            )
          );
        } catch (cancelError) {
          reject(
            new JobError(
              `Job timeout (${timeout}ms) and cancellation failed`,
              "Timeout",
              { jobId, retryable: false }
            )
          );
        }
      }, timeout);
    });

    const waitPromise = this.wait(projectId, jobId, options);

    return Promise.race([waitPromise, timeoutPromise]);
  }
}
