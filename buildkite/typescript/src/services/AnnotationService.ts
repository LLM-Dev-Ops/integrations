/**
 * Buildkite Annotation Service
 * @module services/AnnotationService
 */

import type { BuildkiteClient } from '../client.js';
import type { Annotation, CreateAnnotationRequest } from '../types/annotation.js';

export class AnnotationService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List annotations for a build */
  async list(pipelineSlug: string, buildNumber: number): Promise<Annotation[]> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Annotation[]>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/annotations`
    );
    return response.data;
  }

  /** Create an annotation */
  async create(pipelineSlug: string, buildNumber: number, request: CreateAnnotationRequest): Promise<Annotation> {
    const orgSlug = this.client.getOrganizationSlug();
    const body: Record<string, unknown> = {
      context: request.context,
      style: request.style,
      body: request.body,
    };
    if (request.append !== undefined) {
      body.append = request.append;
    }

    const response = await this.client.post<Annotation>(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/annotations`,
      body
    );
    return response.data;
  }

  /** Delete an annotation by context */
  async delete(pipelineSlug: string, buildNumber: number, context: string): Promise<void> {
    const orgSlug = this.client.getOrganizationSlug();
    await this.client.delete(
      `/organizations/${orgSlug}/pipelines/${pipelineSlug}/builds/${buildNumber}/annotations/${context}`
    );
  }
}
