/**
 * Job Service Types
 *
 * Request/response types for the Job service.
 */

import { Job, JobState, JobStatus } from "../../types/job.js";

/**
 * Options for getting a job.
 */
export interface GetJobOptions {
  /**
   * The geographic location of the job.
   */
  location?: string;
}

/**
 * Options for listing jobs.
 */
export interface ListJobsOptions {
  /**
   * Whether to display jobs owned by all users.
   */
  allUsers?: boolean;

  /**
   * Maximum number of results per page.
   */
  maxResults?: number;

  /**
   * Page token for pagination.
   */
  pageToken?: string;

  /**
   * Level of information requested in response.
   */
  projection?: "full" | "minimal";

  /**
   * Filter by job state.
   */
  stateFilter?: JobState[];

  /**
   * Filter by parent job ID.
   */
  parentJobId?: string;

  /**
   * Minimum creation time (RFC3339 timestamp).
   */
  minCreationTime?: string;

  /**
   * Maximum creation time (RFC3339 timestamp).
   */
  maxCreationTime?: string;
}

/**
 * Response from listing jobs.
 */
export interface ListJobsResponse {
  /**
   * List of jobs.
   */
  jobs: Job[];

  /**
   * Token for next page of results.
   */
  nextPageToken?: string;

  /**
   * Total number of jobs (if available).
   */
  totalResults?: number;
}

/**
 * Options for waiting for job completion.
 */
export interface WaitOptions {
  /**
   * Polling interval in milliseconds (default: 1000).
   */
  pollingIntervalMs?: number;

  /**
   * Timeout in milliseconds (default: 600000 = 10 minutes).
   */
  timeoutMs?: number;
}

/**
 * Job completion result with timing information.
 */
export interface JobCompletionResult {
  /**
   * The completed job.
   */
  job: Job;

  /**
   * Time taken to complete (milliseconds).
   */
  durationMs: number;

  /**
   * Number of polling attempts.
   */
  pollCount: number;
}
