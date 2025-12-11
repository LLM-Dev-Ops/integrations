/**
 * Batch processing service.
 */

import type { HttpTransport } from '../transport';
import type {
  BatchJob,
  BatchListResponse,
  CreateBatchRequest,
  ListBatchJobsParams,
} from '../types/batch';

/**
 * Batch service interface.
 */
export interface BatchService {
  /** Lists batch jobs. */
  list(params?: ListBatchJobsParams): Promise<BatchListResponse>;

  /** Retrieves a specific batch job. */
  retrieve(batchId: string): Promise<BatchJob>;

  /** Creates a new batch job. */
  create(request: CreateBatchRequest): Promise<BatchJob>;

  /** Cancels a batch job. */
  cancel(batchId: string): Promise<BatchJob>;
}

/**
 * Default implementation of the batch service.
 */
export class DefaultBatchService implements BatchService {
  constructor(private readonly transport: HttpTransport) {}

  async list(params?: ListBatchJobsParams): Promise<BatchListResponse> {
    const query = this.buildQueryString(params);
    const body = await this.transport.get(`/v1/batch/jobs${query}`);
    return JSON.parse(body) as BatchListResponse;
  }

  async retrieve(batchId: string): Promise<BatchJob> {
    const body = await this.transport.get(`/v1/batch/jobs/${batchId}`);
    return JSON.parse(body) as BatchJob;
  }

  async create(request: CreateBatchRequest): Promise<BatchJob> {
    const body = await this.transport.post('/v1/batch/jobs', request);
    return JSON.parse(body) as BatchJob;
  }

  async cancel(batchId: string): Promise<BatchJob> {
    const body = await this.transport.post(`/v1/batch/jobs/${batchId}/cancel`, {});
    return JSON.parse(body) as BatchJob;
  }

  private buildQueryString(params?: ListBatchJobsParams): string {
    if (!params) return '';

    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '';

    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  }
}

/**
 * Creates a batch service.
 */
export function createBatchService(transport: HttpTransport): BatchService {
  return new DefaultBatchService(transport);
}
