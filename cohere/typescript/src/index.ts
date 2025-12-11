/**
 * Cohere API Client
 *
 * Production-ready TypeScript client for the Cohere API with:
 * - Full type safety
 * - Resilience patterns (retry, circuit breaker, rate limiting)
 * - Observability (tracing, metrics, logging)
 * - Streaming support via Server-Sent Events
 *
 * @packageDocumentation
 */

// Core exports
export { CohereClient, createClient, createClientFromEnv } from './client';
export type { CohereClientOptions } from './client';

// Configuration
export { CohereConfig, CohereConfigBuilder } from './config';
export type { CohereConfigOptions } from './config';

// Errors
export {
  CohereError,
  ConfigurationError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  ServerError,
  NotFoundError,
  StreamError,
  ApiError,
  InternalError,
  isRetryableError,
  getRetryAfter,
} from './errors';
export type { ErrorCategory, ValidationDetail } from './errors';

// Types
export type {
  Usage,
  BilledUnits,
  ApiMeta,
  ApiVersion,
  FinishReason,
  EmbeddingType,
  InputType,
  TruncateOption,
  ListParams,
  ListResponse,
} from './types';

// Services - Chat
export type {
  ChatService,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  MessageRole,
  Tool,
  ToolCall,
  ToolResult,
  Document,
  Citation,
  ChatStreamEvent,
} from './services/chat';

// Services - Generate
export type {
  GenerateService,
  GenerateRequest,
  GenerateResponse,
  Generation,
  ReturnLikelihoods,
  TokenLikelihood,
  GenerateStreamEvent,
} from './services/generate';

// Services - Embed
export type {
  EmbedService,
  EmbedRequest,
  EmbedResponse,
  EmbeddingsByType,
  EmbedJob,
  EmbedJobRequest,
  EmbedJobStatus,
} from './services/embed';

// Services - Rerank
export type {
  RerankService,
  RerankRequest,
  RerankResponse,
  RerankResult,
  RerankDocument,
} from './services/rerank';

// Services - Classify
export type {
  ClassifyService,
  ClassifyRequest,
  ClassifyResponse,
  ClassificationResult,
  ClassifyExample,
  LabelConfidence,
} from './services/classify';

// Services - Summarize
export type {
  SummarizeService,
  SummarizeRequest,
  SummarizeResponse,
  SummarizeFormat,
  SummarizeLength,
  SummarizeExtractiveness,
} from './services/summarize';

// Services - Tokenize
export type {
  TokenizeService,
  TokenizeRequest,
  TokenizeResponse,
  DetokenizeRequest,
  DetokenizeResponse,
} from './services/tokenize';

// Services - Models
export type {
  ModelsService,
  ModelInfo,
  ModelListResponse,
  ModelCapability,
} from './services/models';

// Services - Datasets
export type {
  DatasetsService,
  Dataset,
  CreateDatasetRequest,
  DatasetType,
  DatasetStatus,
} from './services/datasets';

// Services - Connectors
export type {
  ConnectorsService,
  Connector,
  CreateConnectorRequest,
  UpdateConnectorRequest,
} from './services/connectors';

// Services - Fine-tuning
export type {
  FinetuneService,
  FinetuneModel,
  CreateFinetuneRequest,
  FineTuneStatus,
  FineTuneHyperparameters,
  FineTuneSettings,
  ListFinetuneResponse,
} from './services/finetune';

// Resilience
export {
  RetryConfig,
  RetryExecutor,
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitState,
  RateLimiter,
  RateLimiterConfig,
  ResilienceOrchestrator,
} from './resilience';
export type { RetryContext, RetryDecision, RetryHook } from './resilience';

// Observability
export {
  Tracer,
  NoopTracer,
  ConsoleTracer,
  MetricsCollector,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  Logger,
  ConsoleLogger,
  LogLevel,
} from './observability';
export type { RequestSpan, SpanStatus, MetricValue } from './observability';

// Transport
export type { HttpTransport, TransportResponse } from './transport';

// Constants
export const DEFAULT_BASE_URL = 'https://api.cohere.ai';
export const DEFAULT_API_VERSION = 'v1';
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_RETRIES = 3;
