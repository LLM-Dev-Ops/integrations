/**
 * Buildkite Cluster Service
 * @module services/ClusterService
 */

import type { BuildkiteClient } from '../client.js';
import type { Cluster, Queue } from '../types/cluster.js';

export class ClusterService {
  constructor(private readonly client: BuildkiteClient) {}

  /** List clusters in organization */
  async list(): Promise<Cluster[]> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Cluster[]>(`/organizations/${orgSlug}/clusters`);
    return response.data;
  }

  /** Get cluster by ID */
  async get(clusterId: string): Promise<Cluster> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Cluster>(`/organizations/${orgSlug}/clusters/${clusterId}`);
    return response.data;
  }

  /** List queues in a cluster */
  async listQueues(clusterId: string): Promise<Queue[]> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Queue[]>(`/organizations/${orgSlug}/clusters/${clusterId}/queues`);
    return response.data;
  }

  /** Get queue by ID */
  async getQueue(clusterId: string, queueId: string): Promise<Queue> {
    const orgSlug = this.client.getOrganizationSlug();
    const response = await this.client.get<Queue>(`/organizations/${orgSlug}/clusters/${clusterId}/queues/${queueId}`);
    return response.data;
  }
}
