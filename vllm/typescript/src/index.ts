/**
 * vLLM Self-Hosted Inference Runtime Integration
 *
 * This module provides a thin adapter layer for integrating self-hosted vLLM
 * inference runtimes into the LLM Dev Ops platform.
 *
 * Features:
 * - OpenAI-compatible API access to vLLM servers
 * - High-throughput batching for enterprise workloads
 * - Streaming response handling with back-pressure support
 * - Model hot-swapping without service interruption
 * - Simulation/replay of inference workloads for testing
 *
 * @example
 * ```typescript
 * import { createVllmClientFromUrl } from '@llm-devops/vllm-integration';
 *
 * const client = createVllmClientFromUrl('http://localhost:8000');
 *
 * const response = await client.chatCompletion({
 *   model: 'meta-llama/Llama-2-7b-chat-hf',
 *   messages: [
 *     { role: 'user', content: 'Hello!' }
 *   ],
 *   max_tokens: 100
 * });
 *
 * console.log(response.choices[0].message.content);
 * ```
 *
 * @example Streaming
 * ```typescript
 * const stream = client.chatCompletionStream({
 *   model: 'meta-llama/Llama-2-7b-chat-hf',
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 *   max_tokens: 500
 * });
 *
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
 * }
 * ```
 *
 * @packageDocumentation
 */

// Client exports
export {
  type VllmClient,
  VllmClientImpl,
  createVllmClient,
  createVllmClientFromUrl,
  validateConfig,
  createDefaultConfig,
  mergeConfig,
} from './client/index.js';

// Type exports
export type {
  // Configuration types
  VllmConfig,
  ServerConfig,
  PoolConfig,
  RetryConfig,
  CircuitBreakerConfig,
  RateLimitConfig,
  BatchConfig,

  // Request/Response types
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatRole,
  ChatChoice,
  ChatChunk,
  ChatChunkChoice,
  CompletionRequest,
  CompletionResponse,
  CompletionChoice,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingData,
  TokenizeRequest,
  TokenizeResponse,
  DetokenizeRequest,
  DetokenizeResponse,

  // Token usage
  TokenUsage,

  // Model types
  ModelInfo,
  ModelList,

  // Health types
  HealthStatus,
  HealthCheckResult,
  VllmMetrics,

  // Simulation types
  InferenceRecord,
  ReplayConfig,
  ReplayResult,
  ReplayReport,
  LoadGenConfig,
  LoadGenReport,
} from './types/index.js';

// Default configs
export {
  defaultPoolConfig,
  defaultRetryConfig,
  defaultCircuitBreakerConfig,
  defaultBatchConfig,
  defaultVllmConfig,
} from './types/index.js';

// Error exports
export {
  VllmError,
  ConfigurationError,
  InvalidServerUrlError,
  InvalidTimeoutError,
  InvalidBatchConfigError,
  ConnectionError,
  ServerUnreachableError,
  DnsResolutionFailedError,
  TlsError,
  ConnectionPoolExhaustedError,
  RequestError,
  InvalidModelError,
  InvalidParametersError,
  PromptTooLongError,
  SerializationFailedError,
  ServerError,
  InternalServerError,
  ModelNotLoadedError,
  OutOfMemoryError,
  KvCacheExhaustedError,
  ServerOverloadedError,
  ResponseError,
  DeserializationFailedError,
  UnexpectedFormatError,
  StreamInterruptedError,
  MalformedSseError,
  TimeoutError,
  ConnectionTimeoutError,
  ReadTimeoutError,
  GenerationTimeoutError,
  RateLimitError,
  QueueFullError,
  ConcurrencyExceededError,
  CircuitOpenError,
  createErrorFromHttpStatus,
  isRetryableError,
} from './types/errors.js';

// Transport exports
export {
  type HttpTransport,
  type RequestOptions,
  FetchHttpTransport,
  createHttpTransport,
} from './transport/index.js';

// Streaming exports
export {
  type SSEEvent,
  parseSSELine,
  parseSSEStream,
  parseSSEResponse,
  parseChatChunks,
  BackpressureBuffer,
  createBackpressureStream,
  aggregateChunks,
} from './streaming/index.js';

// Resilience exports
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  type CircuitState,
  type CircuitBreakerHook,
  type CircuitBreakerStats,
  RateLimiter,
  RateLimiterRegistry,
  RetryHandler,
  withRetry,
  calculateBackoffDelay,
  type RetryContext,
  type RetryResult,
} from './resilience/index.js';

// Routing exports
export {
  ModelRegistry,
  ModelDiscoveryService,
  RoundRobinLoadBalancer,
  WeightedRandomLoadBalancer,
  type ServerModelInfo,
  type LoadBalancerStrategy,
} from './routing/index.js';

// Batching exports
export {
  BatchProcessor,
  ConcurrentExecutor,
  PriorityBatchProcessor,
  type BatchExecutor,
  type PriorityRequest,
} from './batching/index.js';

// Simulation exports
export {
  WorkloadRecorder,
  InMemoryRecordingStorage,
  type RecordingStorage,
  WorkloadReplayer,
  type ReplayClient,
  MockVllmClient,
  type MockConfig,
  LoadGenerator,
  type LoadGenClient,
} from './simulation/index.js';

// Observability exports
export {
  type MetricsCollector,
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  MetricNames,
  createMetricsCollector,
  type Span,
  type SpanEvent,
  type SpanStatus,
  type Tracer,
  type SpanContext,
  InMemoryTracer,
  NoopTracer,
  SpanNames,
  createTracer,
  type LogLevel,
  type LogEntry,
  type Logger,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  createLogger,
} from './observability/index.js';
