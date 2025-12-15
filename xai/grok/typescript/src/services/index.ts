/**
 * Services Module
 *
 * @module services
 */

// Chat service
export type { GrokChatRequest } from './chat/request.js';
export { buildChatRequestBody, DEFAULT_CHAT_REQUEST } from './chat/request.js';
export type { GrokChatResponse } from './chat/response.js';
export { extractContent, extractReasoning, hasToolCalls } from './chat/response.js';
export type { StreamAccumulation, ChatStreamEvent } from './chat/stream.js';
export { StreamAccumulator } from './chat/stream.js';
export { ChatService } from './chat/service.js';

// Embedding service
export type { GrokEmbeddingRequest, EmbeddingInput, EncodingFormat } from './embedding/request.js';
export { buildEmbeddingRequestBody } from './embedding/request.js';
export type { GrokEmbeddingResponse, Embedding, EmbeddingUsage } from './embedding/response.js';
export { extractEmbeddings, extractSingleEmbedding } from './embedding/response.js';
export { EmbeddingService, DEFAULT_EMBEDDING_MODEL } from './embedding/service.js';

// Image service
export type {
  GrokImageRequest,
  GrokImageResponse,
  GeneratedImage,
  ImageSize,
  ImageResponseFormat,
} from './image/types.js';
export { ImageService, DEFAULT_IMAGE_MODEL } from './image/service.js';
