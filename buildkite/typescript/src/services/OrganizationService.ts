/**
 * Buildkite Organization Service
 * @module services/OrganizationService
 */

import type { BuildkiteClient } from '../client.js';
import type { Organization } from '../types/organization.js';

export class OrganizationService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List accessible organizations */
  async list(): Promise<Organization[]> {
    const response = await this.client.get<Organization[]>('/organizations');
    return response.data;
  }

  /** Get organization by slug */
  async get(slug?: string): Promise<Organization> {
    const orgSlug = slug ?? this.client.getOrganizationSlug();
    const response = await this.client.get<Organization>(`/organizations/${orgSlug}`);
    return response.data;
  }
}
