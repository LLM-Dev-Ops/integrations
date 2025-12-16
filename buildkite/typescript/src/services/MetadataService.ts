/**
 * Buildkite Metadata Service
 * @module services/MetadataService
 */

import type { BuildkiteClient } from '../client.js';

export class MetadataService {
  constructor(private readonly client: BuildkiteClient) {}

  /** Get metadata value by key */
  async get(pipelineSlug: string, buildNumber: number, key: string): Promise<string> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<{ value: string }>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/meta_data/${key}`
    );
    return response.data.value;
  }

  /** Set metadata key-value pair */
  async set(pipelineSlug: string, buildNumber: number, key: string, value: string): Promise<void> {
    const orgSlug = this.client.getOrganizationSlug();
    await this.client.post(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/meta_data/${key}`,
      { value }
    );
  }

  /** List all metadata keys */
  async listKeys(pipelineSlug: string, buildNumber: number): Promise<string[]> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<string[]>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/meta_data`
    );
    return response.data;
  }

  /** Get all metadata as a map */
  async getAll(pipelineSlug: string, buildNumber: number): Promise<Record<string, string>> {
    const keys = await this.listKeys(pipelineSlug, buildNumber);
    const metadata: Record<string, string> = {};

    await Promise.all(
      keys.map(async (key) => {
        metadata[key] = await this.get(pipelineSlug, buildNumber, key);
      })
    );

    return metadata;
  }
}
