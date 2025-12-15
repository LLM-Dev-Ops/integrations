/**
 * xAI Grok Integration
 *
 * Thin adapter for xAI Grok API providing chat completions,
 * embeddings, and image generation.
 *
 * @packageDocumentation
 * @module @integrations/xai-grok
 *
 * @example
 * ```typescript
 * import { GrokClient } from '@integrations/xai-grok';
 *
 * // Create from environment
 * const client = GrokClient.fromEnv();
 *
 * // Chat completion
 * const response = await client.chat.complete({
 *   model: 'grok-3-beta',
 *   messages: [{ role: 'user', content: 'Explain quantum entanglement' }]
 * });
 *
 * console.log(response.choices[0].message.content);
 *
 * // Access reasoning content (Grok-3 only)
 * if (response.choices[0].message.reasoning_content) {
 *   console.log('Reasoning:', response.choices[0].message.reasoning_content);
 * }
 * ```
 */

// Client
export {
  GrokClient,
  GrokClientBuilder,
  clientBuilder,
  createClient,
  createClientFromEnv,
} from './client.js';

// Configuration
export type { GrokConfig, RetryConfig, LiveSearchConfig } from './config.js';
export {
  GrokConfigBuilder,
  configBuilder,
  configFromEnv,
  DEFAULT_CONFIG,
} from './config.js';

// Errors
export type { GrokErrorCode, GrokErrorDetails } from './error.js';
export {
  GrokError,
  parseErrorResponse,
  configurationError,
  validationError,
  networkError,
  timeoutError,
  streamError,
  mapHttpStatusToErrorCode,
  isRetryableStatus,
} from './error.js';

// Models
export type {
  GrokModel,
  GrokCapabilities,
  ModelInfo,
  TokenUsage,
  ReasoningContent,
} from './models/types.js';
export {
  MODEL_CAPABILITIES,
  MODEL_INFO,
  getCapabilities,
  getModelInfo,
  supportsVision,
  supportsReasoning,
  supportsStreaming,
  supportsTools,
} from './models/capabilities.js';
export type { ModelResolution } from './models/registry.js';
export {
  ModelRegistry,
  getModelRegistry,
  resolveModel,
} from './models/registry.js';

// Authentication
export type { CredentialProvider, AuthHeader } from './auth/provider.js';
export { ApiKeyCredentialProvider } from './auth/api-key.js';

// Types
export type {
  Role,
  TextContent,
  ImageUrlContent,
  ContentPart,
  MessageContent,
  ToolCall,
  ChatMessage,
  AssistantMessage,
  ChatChoice,
  ChatDelta,
  StreamChoice,
} from './types/message.js';
export type {
  JsonSchema,
  FunctionDefinition,
  Tool,
  ToolChoice,
  ResponseFormat,
} from './types/tool.js';
export type {
  Usage,
  PromptTokensDetails,
  CompletionTokensDetails,
  ExtendedUsage,
} from './types/usage.js';

// Chat Service
export type { GrokChatRequest } from './services/chat/request.js';
export { buildChatRequestBody, DEFAULT_CHAT_REQUEST } from './services/chat/request.js';
export type { GrokChatResponse } from './services/chat/response.js';
export { extractContent, extractReasoning, hasToolCalls } from './services/chat/response.js';
export type { StreamAccumulation, ChatStreamEvent } from './services/chat/stream.js';
export { StreamAccumulator } from './services/chat/stream.js';
export { ChatService } from './services/chat/service.js';

// Embedding Service
export type {
  GrokEmbeddingRequest,
  EmbeddingInput,
  EncodingFormat,
} from './services/embedding/request.js';
export { buildEmbeddingRequestBody } from './services/embedding/request.js';
export type {
  GrokEmbeddingResponse,
  Embedding,
  EmbeddingUsage,
} from './services/embedding/response.js';
export { extractEmbeddings, extractSingleEmbedding } from './services/embedding/response.js';
export { EmbeddingService, DEFAULT_EMBEDDING_MODEL } from './services/embedding/service.js';

// Image Service
export type {
  GrokImageRequest,
  GrokImageResponse,
  GeneratedImage,
  ImageSize,
  ImageResponseFormat,
} from './services/image/types.js';
export { ImageService, DEFAULT_IMAGE_MODEL } from './services/image/service.js';

// Reasoning
export { ReasoningExtractor, getReasoningExtractor } from './reasoning/extractor.js';
export { ReasoningAccumulator } from './reasoning/accumulator.js';

// Infrastructure (for advanced usage)
export type { RequestOptions, BuiltRequest } from './infra/request-builder.js';
export { buildRequest, buildUserAgent } from './infra/request-builder.js';
export type { ChatCompletionResponse } from './infra/response-parser.js';
export { parseJsonResponse, extractUsage } from './infra/response-parser.js';
export type { ChatStreamChunk } from './infra/sse-parser.js';
export { SseParser, streamChunks } from './infra/sse-parser.js';
