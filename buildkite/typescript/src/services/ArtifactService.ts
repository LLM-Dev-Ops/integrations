/**
 * Buildkite Artifact Service
 * @module services/ArtifactService
 */

import type { BuildkiteClient } from '../client.js';
import type { Artifact, ArtifactContent } from '../types/artifact.js';
import type { Page, PaginationParams } from '../pagination.js';

export interface ListArtifactsOptions extends PaginationParams {}

export class ArtifactService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List artifacts for a build */
  async list(pipelineSlug: string, buildNumber: number, options?: ListArtifactsOptions): Promise<Page<Artifact>> {
    const orgSlug = this.client.getOrganizationSlug();
    return this.client.getPaginated<Artifact>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/artifacts`,
      options
    );
  }

  /** Get artifact metadata */
  async get(pipelineSlug: string, buildNumber: number, artifactId: string): Promise<Artifact> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Artifact>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/artifacts/${artifactId}`
    );
    return response.data;
  }

  /** Download artifact content */
  async download(pipelineSlug: string, buildNumber: number, artifactId: string): Promise<ArtifactContent> {
    const artifact = await this.get(pipelineSlug, buildNumber, artifactId);

    if (artifact.state !== 'finished') {
      throw new Error(`Artifact not ready: ${artifact.state}`);
    }

    // Fetch from the download URL
    const response = await fetch(artifact.download_url);
    if (!response.ok) {
      throw new Error(`Failed to download artifact: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      artifact,
      content: new Uint8Array(arrayBuffer),
    };
  }

  /** List artifacts for a specific job */
  async listByJob(pipelineSlug: string, buildNumber: number, jobId: string): Promise<Artifact[]> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Artifact[]>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/jobs/${jobId}/artifacts`
    );
    return response.data;
  }
}
