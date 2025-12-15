/**
 * Azure OpenAI Integration Module
 *
 * A thin adapter layer for Azure OpenAI services following the SPARC specification.
 * Provides access to chat completions, embeddings, and other OpenAI capabilities
 * through Azure's deployment-based model.
 *
 * @example
 * ```typescript
 * import { createClient, createClientFromEnv } from '@integrations/azure-openai';
 *
 * // Create client from environment variables
 * const client = createClientFromEnv();
 *
 * // Or create with explicit configuration
 * const client = createClient({
 *   resourceName: 'my-resource',
 *   apiKey: 'my-api-key',
 *   deployments: [{
 *     deploymentId: 'gpt-4-deployment',
 *     resourceName: 'my-resource',
 *     region: 'eastus',
 *     apiVersion: '2024-06-01',
 *     modelFamily: 'gpt-4',
 *     capabilities: ['chat', 'function-calling', 'streaming'],
 *   }],
 * });
 *
 * // Chat completion
 * const response = await client.chat.create({
 *   deploymentId: 'gpt-4-deployment',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Streaming
 * for await (const chunk of client.chat.stream({
 *   deploymentId: 'gpt-4-deployment',
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 * })) {
 *   process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
 * }
 *
 * // Embeddings
 * const embeddings = await client.embeddings.create({
 *   deploymentId: 'ada-embedding',
 *   input: 'Text to embed',
 * });
 * ```
 *
 * @module @integrations/azure-openai
 */

// Client exports
export type { AzureOpenAIClient } from './client/index.js';
export {
  AzureOpenAIClientImpl,
  createClient,
  createClientFromEnv,
  AzureOpenAIClientBuilder,
  builder,
} from './client/index.js';
export type { AzureOpenAIConfig, NormalizedAzureConfig } from './client/index.js';

// Type exports
export type {
  ApiVersion,
  AzureRegion,
  ModelFamily,
  ModelCapability,
  TokenUsage,
  RequestOptions,
  AuthMethod,
  AzureDeployment,
  ContentFilterSeverity,
  ContentFilterCategory,
  ContentFilterResults,
  PromptFilterResult,
  AzureErrorResponse,
} from './types/index.js';

// Deployment exports
export type { DeploymentRegistry, DeploymentResolveOptions, DeploymentResolution } from './deployment/index.js';
export { DeploymentRegistryImpl, createRegistryFromEnv } from './deployment/index.js';

// Auth exports
export type { AuthProvider, AuthHeader, AzureAdCredentials } from './auth/index.js';
export { ApiKeyAuthProvider, AzureAdAuthProvider, createAuthProvider } from './auth/index.js';

// Chat service exports
export type {
  ChatRole,
  ChatMessage,
  ChatToolCall,
  ChatFunctionCall,
  ChatTool,
  ChatFunctionDefinition,
  ResponseFormat,
  ChatCompletionRequest,
  AzureDataSource,
  ChatCompletionResponse,
  ChatChoice,
  ChatUsage,
  ChatCompletionChunk,
  ChatChunkChoice,
  ChatDelta,
  ChatToolCallDelta,
  ChatCompletionService,
} from './services/chat/index.js';
export {
  ChatCompletionServiceImpl,
  ChatStreamAccumulator,
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
} from './services/chat/index.js';

// Embedding service exports
export type {
  EmbeddingEncodingFormat,
  EmbeddingRequest,
  EmbeddingResponse,
  Embedding,
  EmbeddingUsage,
  EmbeddingService,
} from './services/embedding/index.js';
export {
  EmbeddingServiceImpl,
  decodeBase64Embedding,
  normalizeEmbeddings,
  cosineSimilarity,
  euclideanDistance,
} from './services/embedding/index.js';

// Infrastructure exports
export { AzureUrlBuilder, buildChatCompletionsUrl, buildEmbeddingsUrl } from './infra/index.js';
export type { AzureOperation, SSEEvent } from './infra/index.js';
export { parseSSEStream, createSSEIterable, StreamAccumulator } from './infra/index.js';

// Content filter exports
export type { ContentFilterStatus } from './content-filter/index.js';
export {
  extractContentFilterResults,
  extractPromptFilterResults,
  analyzeContentFilterResults,
  isContentBlocked,
} from './content-filter/index.js';

// Error exports
export {
  AzureOpenAIError,
  AuthenticationError,
  AuthorizationError,
  DeploymentNotFoundError,
  RateLimitError,
  ContentFilterError,
  ContextLengthExceededError,
  ValidationError,
  ServiceError,
  NetworkError,
  TimeoutError,
} from './errors/index.js';
export type { AzureOpenAIErrorOptions } from './errors/index.js';

// Adapter exports
export type { UnifiedModelRequest, UnifiedModelResponse, ModelAdapter } from './adapter/index.js';
export { AzureOpenAIAdapter, createAdapter } from './adapter/index.js';
