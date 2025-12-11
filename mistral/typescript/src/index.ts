/**
 * Mistral AI Client Library
 *
 * A production-ready TypeScript client for the Mistral AI API with comprehensive
 * support for chat completions, embeddings, models, files, fine-tuning,
 * agents, batch processing, and more.
 *
 * @packageDocumentation
 */

// Core exports
export { MistralClient, MistralClientBuilder } from './client';
export { MistralConfig, MistralConfigBuilder } from './config';
export { MistralError, MistralErrorCode, isMistralError } from './errors';

// Type exports
export type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatChoice,
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  MessageContent,
  ContentPart,
  ChatCompletionChunk,
  StreamChoice,
  ContentDelta,
} from './types/chat';

export type {
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingData,
  EmbeddingInput,
  EncodingFormat,
} from './types/embeddings';

export type {
  Model,
  ModelListResponse,
  ModelCapabilities,
  DeleteModelResponse,
  ArchiveModelResponse,
  UpdateModelRequest,
} from './types/models';

export type {
  Tool,
  ToolCall,
  ToolChoice,
  FunctionDefinition,
  FunctionCall,
} from './types/tools';

export type {
  FileObject,
  FileListResponse,
  FilePurpose,
  FileDeleteResponse,
} from './types/files';

export type {
  FineTuningJob,
  FineTuningJobStatus,
  FineTuningHyperparameters,
  CreateFineTuningJobRequest,
  FineTuningJobListResponse,
} from './types/fine-tuning';

export type {
  AgentCompletionRequest,
  AgentCompletionResponse,
  AgentCompletionChunk,
} from './types/agents';

export type {
  BatchJob,
  BatchStatus,
  CreateBatchRequest,
  BatchListResponse,
} from './types/batch';

export type { Usage, FinishReason, Role } from './types/common';

// Service exports
export type { ChatService } from './services/chat';
export type { EmbeddingsService } from './services/embeddings';
export type { ModelsService } from './services/models';
export type { FilesService } from './services/files';
export type { FineTuningService } from './services/fine-tuning';
export type { AgentsService } from './services/agents';
export type { BatchService } from './services/batch';

// Resilience exports
export type { RetryConfig, RetryExecutor } from './resilience/retry';
export type { CircuitBreakerConfig, CircuitBreaker, CircuitBreakerState } from './resilience/circuit-breaker';
export type { RateLimiterConfig, RateLimiter } from './resilience/rate-limiter';

// Observability exports
export type { MetricsCollector, ServiceMetrics } from './observability/metrics';
export type { Logger, LogLevel, LogConfig } from './observability/logging';
