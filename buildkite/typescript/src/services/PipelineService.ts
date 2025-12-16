/**
 * Buildkite Pipeline Service
 * @module services/PipelineService
 */

import type { BuildkiteClient } from '../client.js';
import type { Pipeline } from '../types/pipeline.js';
import type { Build, ListBuildsOptions } from '../types/build.js';
import type { Page, PaginationParams } from '../pagination.js';

export interface ListPipelinesOptions extends PaginationParams {}

export class PipelineService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List pipelines in organization */
  async list(options?: ListPipelinesOptions): Promise<Page<Pipeline>> {
    const orgSlug = this.client.getOrganizationSlug();
    return this.client.getPaginated<Pipeline>(`/organizations/${orgSlug}/pipelines`, options);
  }

  /** Get pipeline by slug */
  async get(pipelineSlug: string): Promise<Pipeline> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Pipeline>(`/organizations/${orgSlug}/pipelines/${pipelineSlug}`);
    return response.data;
  }

  /** Get builds for a specific pipeline */
  async getBuilds(pipelineSlug: string, options?: Omit<ListBuildsOptions, 'pipeline_slug'>): Promise<Page<Build>> {
    const orgSlug = this.client.getOrganizationSlug();
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
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds`,
      { perPage: options?.per_page, page: options?.page },
      { query }
    );
  }
}
