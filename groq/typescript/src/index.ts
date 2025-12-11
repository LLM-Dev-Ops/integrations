/**
 * Groq AI Client Library
 *
 * A production-ready TypeScript client for the Groq API with ultra-low latency
 * LPU (Language Processing Unit) inference. Provides comprehensive support
 * for chat completions, audio transcription/translation, and model management.
 *
 * @example
 * ```typescript
 * import { GroqClient, ChatRequest } from '@llm-integrations/groq';
 *
 * const client = new GroqClientBuilder()
 *   .apiKey('gsk_your_api_key')
 *   .build();
 *
 * const response = await client.chat.create({
 *   model: 'llama-3.3-70b-versatile',
 *   messages: [{ role: 'user', content: 'Hello, Groq!' }]
 * });
 *
 * console.log(response.choices[0].message.content);
 * ```
 */

// Client
export { GroqClient, GroqClientBuilder } from './client';
export type { GroqClientOptions } from './client';

// Config
export { GroqConfig, GroqConfigBuilder } from './config';
export type { GroqConfigOptions } from './config';

// Errors
export { GroqError, GroqErrorCode, isGroqError, isRetryableError } from './errors';
export type { GroqErrorDetails, ApiErrorResponse } from './errors';

// Types - Chat
export type {
  ChatRequest,
  ChatResponse,
  ChatChunk,
  Message,
  Role,
  Content,
  ContentPart,
  ImageUrl,
  ImageDetail,
  Choice,
  ChunkChoice,
  Delta,
  AssistantMessage,
  Usage,
  FinishReason,
  ResponseFormat,
  ResponseFormatType,
  StreamOptions,
} from './types/chat';

// Types - Audio
export type {
  TranscriptionRequest,
  TranscriptionResponse,
  TranslationRequest,
  TranslationResponse,
  AudioFormat,
  Granularity,
  Segment,
  Word,
} from './types/audio';

// Types - Tools
export type {
  Tool,
  ToolCall,
  ToolChoice,
  FunctionDefinition,
  FunctionCall,
  ToolCallDelta,
} from './types/tools';

// Types - Models
export type { Model, ModelList } from './types/models';
export { KnownModels } from './types/models';

// Types - Common
export type { GroqMetadata, GroqUsage } from './types/common';

// Services
export type { ChatService } from './services/chat';
export { ChatStream } from './services/chat';
export type { AudioService } from './services/audio';
export type { ModelsService } from './services/models';

// Transport
export type { HttpTransport, HttpRequest, HttpResponse } from './transport';

// Auth
export type { AuthProvider } from './auth';
export { BearerAuthProvider, createBearerAuth } from './auth';

// Resilience
export type { RetryConfig, CircuitBreakerConfig, RateLimitInfo, ResilienceConfig } from './resilience';
export {
  ResilienceOrchestrator,
  RetryPolicy,
  CircuitBreaker,
  CircuitState,
  RateLimitManager,
} from './resilience';

// Observability
export type { LogConfig, Logger, MetricsCollector, RequestMetrics } from './observability';
export { LogLevel, ConsoleLogger, DefaultMetricsCollector } from './observability';

// Mocks
export { MockTransport, createMockTransport, jsonResponse, errorResponse } from './mocks';
export {
  mockChatResponse,
  mockChatChunks,
  mockTranscriptionResponse,
  mockTranslationResponse,
  mockModel,
  mockModelList,
} from './mocks';
export type { MockResponse, RecordedRequest } from './mocks';

// Type helpers
export {
  systemMessage,
  userMessage,
  assistantMessage,
  toolMessage,
} from './types/chat';
export { createTool, parseToolArguments } from './types/tools';
export { audioFromPath, audioFromBuffer, audioFromStream } from './types/audio';
export { isKnownModel, supportsVision, isWhisperModel, getContextWindow } from './types/models';
