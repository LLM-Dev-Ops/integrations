/**
 * Buildkite Build Service
 * @module services/BuildService
 */

import type { BuildkiteClient } from '../client.js';
import type { Build, BuildState, CreateBuildRequest, ListBuildsOptions, WaitOptions } from '../types/build.js';
import type { Page } from '../pagination.js';

const TERMINAL_STATES: BuildState[] = ['passed', 'failed', 'canceled', 'skipped', 'not_run'] as BuildState[];

function isTerminalState(state: BuildState): boolean {
  return TERMINAL_STATES.includes(state);
}

export class BuildService {
  constructor(private readonly client: BuildkiteClient) {}

  /** Create a new build */
  async create(pipelineSlug: string, request: CreateBuildRequest): Promise<Build> {
    const orgSlug = this.client.getOrganizationSlug();
    const body: Record<string, unknown> = {
      commit: request.commit,
      branch: request.branch,
    };
    if (request.message) body.message = request.message;
    if (request.author) body.author = request.author;
    if (request.env) body.env = request.env;
    if (request.meta_data) body.meta_data = request.meta_data;
    if (request.ignore_pipeline_branch_filters !== undefined) body.ignore_pipeline_branch_filters = request.ignore_pipeline_branch_filters;
    if (request.clean_checkout !== undefined) body.clean_checkout = request.clean_checkout;

    const response = await this.client.post<Build>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds`,
      body
    );
    return response.data;
  }

  /** List builds with optional filters */
  async list(options?: ListBuildsOptions): Promise<Page<Build>> {
    const orgSlug = this.client.getOrganizationSlug();
    const path = options?.pipeline_slug
      ? `/organizations/${orgSlug}/pipelines/${options.pipeline_slug}/builds`
      : `/organizations/${orgSlug}/builds`;

    const query: Record<string, string | undefined> = {};
    if (options?.branch) query.branch = options.branch;
    if (options?.commit) query.commit = options.commit;
    if (options?.state) query.state = options.state;
    if (options?.creator) query.creator = options.creator;
    if (options?.created_from) query.created_from = options.created_from;
    if (options?.created_to) query.created_to = options.created_to;
    if (options?.finished_from) query.finished_from = options.finished_from;
    if (options?.meta_data_filters) {
      for (const [key, value] of Object.entries(options.meta_data_filters)) {
        query[`meta_data[${key}]`] = value;
      }
    }

    return this.client.getPaginated<Build>(
      path,
      { perPage: options?.per_page, page: options?.page },
      { query }
    );
  }

  /** Get build by number */
  async get(pipelineSlug: string, buildNumber: number): Promise<Build> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Build>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}`
    );
    return response.data;
  }

  /** Get build by UUID */
  async getById(buildId: string): Promise<Build> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Build>(`/organizations/${orgSlug}/builds/${buildId}`);
    return response.data;
  }

  /** Cancel a running build */
  async cancel(pipelineSlug: string, buildNumber: number): Promise<Build> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.put<Build>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/cancel`
    );
    return response.data;
  }

  /** Rebuild an existing build */
  async rebuild(pipelineSlug: string, buildNumber: number): Promise<Build> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.put<Build>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/rebuild`
    );
    return response.data;
  }

  /** Wait for build to reach a terminal state */
  async waitForCompletion(pipelineSlug: string, buildNumber: number, options?: WaitOptions): Promise<Build> {
    const timeout = options?.timeout_ms ?? 3600000; // 1 hour default
    const pollInterval = options?.poll_interval_ms ?? 10000; // 10 seconds default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const build = await this.get(pipelineSlug, buildNumber);

      if (isTerminalState(build.state)) {
        return build;
      }

      if (build.state === 'blocked' && !options?.auto_unblock) {
        return build;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Build ${pipelineSlug}#${buildNumber} did not complete within ${timeout}ms`);
  }
}
