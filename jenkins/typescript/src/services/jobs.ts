/**
 * Jenkins Job Service
 * Provides operations for managing Jenkins jobs including triggering builds,
 * listing jobs, and managing job state.
 */

import type { JenkinsClient } from '../client/index.js';
import type { JobRef, QueueRef } from '../types/refs.js';
import type { Job, JobSummary } from '../types/resources.js';
import { jobRefToPath } from '../types/refs.js';
import { JenkinsError, JenkinsErrorKind } from '../types/errors.js';

/**
 * Options for triggering a build.
 */
export interface TriggerBuildOptions {
  /** Build parameters */
  parameters?: Record<string, string>;
}

/**
 * Job service for managing Jenkins jobs.
 */
export class JobService {
  constructor(private readonly client: JenkinsClient) {}

  /**
   * Gets detailed information about a job.
   *
   * @param jobRef - Job reference (name or path)
   * @returns Job details
   */
  async getJob(jobRef: JobRef): Promise<Job> {
    const path = jobRefToPath(jobRef);
    const response = await this.client.get<Job>(`/${path}/api/json`);
    return response.data;
  }

  /**
   * Checks if a job exists.
   *
   * @param jobRef - Job reference (name or path)
   * @returns True if job exists, false otherwise
   */
  async jobExists(jobRef: JobRef): Promise<boolean> {
    try {
      await this.getJob(jobRef);
      return true;
    } catch (error) {
      if (error instanceof JenkinsError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Lists all jobs at the root or in a folder.
   *
   * @param folder - Optional folder path as JobRef
   * @returns Array of job summaries
   */
  async listJobs(folder?: JobRef): Promise<JobSummary[]> {
    const path = folder ? jobRefToPath(folder) : '';
    const response = await this.client.get<{ jobs: JobSummary[] }>(
      `/${path}/api/json`,
      { query: { tree: 'jobs[name,url,color,buildable]' } }
    );
    return response.data.jobs || [];
  }

  /**
   * Lists jobs in a specific view.
   *
   * @param viewName - Name of the view
   * @returns Array of job summaries
   */
  async listViewJobs(viewName: string): Promise<JobSummary[]> {
    const response = await this.client.get<{ jobs: JobSummary[] }>(
      `/view/${encodeURIComponent(viewName)}/api/json`,
      { query: { tree: 'jobs[name,url,color,buildable]' } }
    );
    return response.data.jobs || [];
  }

  /**
   * Triggers a build for a job.
   *
   * @param jobRef - Job reference (name or path)
   * @param params - Optional build parameters
   * @returns Queue reference with extracted queue ID
   */
  async triggerBuild(
    jobRef: JobRef,
    params?: Record<string, string>
  ): Promise<QueueRef> {
    const path = jobRefToPath(jobRef);
    const hasParams = params && Object.keys(params).length > 0;
    const endpoint = hasParams ? `/${path}/buildWithParameters` : `/${path}/build`;

    let response;
    if (hasParams) {
      response = await this.client.postForm(endpoint, params);
    } else {
      response = await this.client.post(endpoint);
    }

    // Extract queue ID from Location header
    const location = response.headers.get('location');
    if (!location) {
      throw new JenkinsError(
        JenkinsErrorKind.NoQueueLocation,
        'No Location header in build trigger response'
      );
    }

    const queueId = this.extractQueueId(location);
    return { id: queueId };
  }

  /**
   * Enables a disabled job.
   *
   * @param jobRef - Job reference (name or path)
   */
  async enableJob(jobRef: JobRef): Promise<void> {
    const path = jobRefToPath(jobRef);
    await this.client.post(`/${path}/enable`);
  }

  /**
   * Disables a job.
   *
   * @param jobRef - Job reference (name or path)
   */
  async disableJob(jobRef: JobRef): Promise<void> {
    const path = jobRefToPath(jobRef);
    await this.client.post(`/${path}/disable`);
  }

  /**
   * Extracts queue ID from Location header.
   * Location format: http://jenkins/queue/item/{id}/
   */
  private extractQueueId(location: string): number {
    const match = location.match(/\/queue\/item\/(\d+)\/?/);
    if (!match) {
      throw new JenkinsError(
        JenkinsErrorKind.InvalidQueueLocation,
        `Could not extract queue ID from Location: ${location}`
      );
    }
    return parseInt(match[1], 10);
  }
}
