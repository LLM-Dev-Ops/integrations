import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type { BatchCreateRequest, BatchObject, BatchListParams, BatchListResponse } from './types.js';
import { BatchesValidator } from './validation.js';

export interface BatchesService {
  create(request: BatchCreateRequest, options?: RequestOptions): Promise<BatchObject>;
  retrieve(batchId: string, options?: RequestOptions): Promise<BatchObject>;
  cancel(batchId: string, options?: RequestOptions): Promise<BatchObject>;
  list(params?: BatchListParams, options?: RequestOptions): Promise<BatchListResponse>;
}

export class BatchesServiceImpl implements BatchesService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async create(request: BatchCreateRequest, options?: RequestOptions): Promise<BatchObject> {
    BatchesValidator.validateCreate(request);

    return this.orchestrator.request({
      method: 'POST',
      path: '/v1/batches',
      body: request,
      ...options,
    });
  }

  async retrieve(batchId: string, options?: RequestOptions): Promise<BatchObject> {
    BatchesValidator.validateBatchId(batchId);

    return this.orchestrator.request({
      method: 'GET',
      path: `/v1/batches/${encodeURIComponent(batchId)}`,
      ...options,
    });
  }

  async cancel(batchId: string, options?: RequestOptions): Promise<BatchObject> {
    BatchesValidator.validateBatchId(batchId);

    return this.orchestrator.request({
      method: 'POST',
      path: `/v1/batches/${encodeURIComponent(batchId)}/cancel`,
      ...options,
    });
  }

  async list(params?: BatchListParams, options?: RequestOptions): Promise<BatchListResponse> {
    const query: Record<string, string | number> = {};
    if (params?.limit) query.limit = params.limit;
    if (params?.after) query.after = params.after;

    return this.orchestrator.request({
      method: 'GET',
      path: '/v1/batches',
      query,
      ...options,
    });
  }
}
