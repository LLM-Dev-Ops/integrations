import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type { ModelObject, ModelListResponse, ModelDeleteResponse } from './types.js';

export interface ModelsService {
  list(options?: RequestOptions): Promise<ModelListResponse>;
  retrieve(modelId: string, options?: RequestOptions): Promise<ModelObject>;
  delete(modelId: string, options?: RequestOptions): Promise<ModelDeleteResponse>;
}

export class ModelsServiceImpl implements ModelsService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async list(options?: RequestOptions): Promise<ModelListResponse> {
    return this.orchestrator.request({
      method: 'GET',
      path: '/v1/models',
      ...options,
    });
  }

  async retrieve(modelId: string, options?: RequestOptions): Promise<ModelObject> {
    return this.orchestrator.request({
      method: 'GET',
      path: `/v1/models/${encodeURIComponent(modelId)}`,
      ...options,
    });
  }

  async delete(modelId: string, options?: RequestOptions): Promise<ModelDeleteResponse> {
    return this.orchestrator.request({
      method: 'DELETE',
      path: `/v1/models/${encodeURIComponent(modelId)}`,
      ...options,
    });
  }
}
