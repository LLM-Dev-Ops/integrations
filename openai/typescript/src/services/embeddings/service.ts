import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type { EmbeddingRequest, EmbeddingResponse } from './types.js';
import { EmbeddingsValidator } from './validation.js';

export interface EmbeddingsService {
  create(request: EmbeddingRequest, options?: RequestOptions): Promise<EmbeddingResponse>;
}

export class EmbeddingsServiceImpl implements EmbeddingsService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async create(
    request: EmbeddingRequest,
    options?: RequestOptions
  ): Promise<EmbeddingResponse> {
    EmbeddingsValidator.validate(request);

    return this.orchestrator.request({
      method: 'POST',
      path: '/v1/embeddings',
      body: request,
      ...options,
    });
  }
}
