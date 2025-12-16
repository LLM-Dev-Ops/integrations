/**
 * Buildkite Job Service
 * @module services/JobService
 */

import type { BuildkiteClient } from '../client.js';
import type { Job, JobLog, UnblockRequest } from '../types/job.js';

export class JobService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List jobs in a build (jobs are embedded in build response) */
  async list(pipelineSlug: string, buildNumber: number): Promise<Job[]> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<{ jobs: Job[] }>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}`
    );
    return response.data.jobs || [];
  }

  /** Get a specific job */
  async get(pipelineSlug: string, buildNumber: number, jobId: string): Promise<Job> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Job>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/jobs/${jobId}`
    );
    return response.data;
  }

  /** Retry a failed job */
  async retry(pipelineSlug: string, buildNumber: number, jobId: string): Promise<Job> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.put<Job>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/jobs/${jobId}/retry`
    );
    return response.data;
  }

  /** Unblock a blocked job */
  async unblock(pipelineSlug: string, buildNumber: number, jobId: string, request?: UnblockRequest): Promise<Job> {
    const orgSlug = this.client.getOrganizationSlug();
    const body: Record<string, unknown> = {};
    if (request?.unblocker) body.unblocker = request.unblocker;
    if (request?.fields) body.fields = request.fields;

    const response = await this.client.put<Job>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/jobs/${jobId}/unblock`,
      Object.keys(body).length > 0 ? body : undefined
    );
    return response.data;
  }

  /** Get job log output */
  async getLog(pipelineSlug: string, buildNumber: number, jobId: string): Promise<JobLog> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<{ content: string }>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/jobs/${jobId}/log`,
      { headers: { 'Accept': 'application/json' } }
    );
    return {
      content: response.data.content || '',
      size: response.data.content?.length || 0,
    };
  }

  /** Get job environment variables */
  async getEnvironment(pipelineSlug: string, buildNumber: number, jobId: string): Promise<Record<string, string>> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<{ env: Record<string, string> }>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/jobs/${jobId}/env`
    );
    return response.data.env || {};
  }
}
