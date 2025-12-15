export type {
  EmbeddingEncodingFormat,
  EmbeddingRequest,
  EmbeddingResponse,
  Embedding,
  EmbeddingUsage,
} from './types.js';
export { toTokenUsage, decodeBase64Embedding, normalizeEmbeddings } from './types.js';
export type { EmbeddingService, EmbeddingServiceDependencies } from './service.js';
export { EmbeddingServiceImpl, cosineSimilarity, euclideanDistance } from './service.js';
