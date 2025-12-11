/**
 * Embeddings service.
 */

import type { HttpTransport } from '../transport';
import type { EmbeddingRequest, EmbeddingResponse } from '../types/embeddings';

/**
 * Embeddings service interface.
 */
export interface EmbeddingsService {
  /** Creates embeddings for the given input. */
  create(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

/**
 * Default implementation of the embeddings service.
 */
export class DefaultEmbeddingsService implements EmbeddingsService {
  constructor(private readonly transport: HttpTransport) {}

  async create(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const body = await this.transport.post('/v1/embeddings', request);
    return JSON.parse(body) as EmbeddingResponse;
  }
}

/**
 * Creates an embeddings service.
 */
export function createEmbeddingsService(transport: HttpTransport): EmbeddingsService {
  return new DefaultEmbeddingsService(transport);
}
