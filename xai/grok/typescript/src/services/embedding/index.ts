/**
 * Embedding Service Module
 *
 * @module services/embedding
 */

export type { GrokEmbeddingRequest, EmbeddingInput, EncodingFormat } from './request.js';
export { buildEmbeddingRequestBody } from './request.js';

export type { GrokEmbeddingResponse, Embedding, EmbeddingUsage } from './response.js';
export { extractEmbeddings, extractSingleEmbedding } from './response.js';

export { EmbeddingService, DEFAULT_EMBEDDING_MODEL } from './service.js';
