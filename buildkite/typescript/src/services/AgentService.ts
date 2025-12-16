/**
 * Buildkite Agent Service (Read-Only)
 * @module services/AgentService
 */

import type { BuildkiteClient } from '../client.js';
import type { Agent, ListAgentsOptions } from '../types/agent.js';
import type { Page } from '../pagination.js';

export class AgentService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List connected agents */
  async list(options?: ListAgentsOptions): Promise<Page<Agent>> {
    const orgSlug = this.client.getOrganizationSlug();
    const query: Record<string, string | undefined> = {};
    if (options?.name) query.name = options.name;
    if (options?.hostname) query.hostname = options.hostname;
    if (options?.version) query.version = options.version;

    return this.client.getPaginated<Agent>(
      `/organizations/${orgSlug}/agents`,
      { perPage: options?.per_page, page: options?.page },
      { query }
    );
  }

  /** Get agent by ID */
  async get(agentId: string): Promise<Agent> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Agent>(`/organizations/${orgSlug}/agents/${agentId}`);
    return response.data;
  }
}
