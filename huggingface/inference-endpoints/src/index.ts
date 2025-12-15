/**
 * HuggingFace Inference Endpoints Integration
 * Public API exports as specified in SPARC documentation
 */

// Main client
export { HfInferenceClient, HfInferenceClientOptions, HealthStatus } from './client.js';

// Configuration
export {
  HfInferenceConfig,
  defaultHfInferenceConfig,
} from './types/index.js';

// Errors
export {
  HfError,
  HfErrorCode,
  createValidationError,
  createAuthenticationError,
  createPermissionDeniedError,
  createNotFoundError,
  createRateLimitedError,
  createModelLoadingError,
  createColdStartTimeoutError,
  createEndpointPausedError,
  createEndpointFailedError,
  createServiceUnavailableError,
  createGatewayTimeoutError,
  createServerError,
  createNetworkError,
  createStreamInterruptedError,
  createModelNotAvailableOnProviderError,
  createConfigurationError,
} from './types/errors.js';

// Services
export { ChatService } from './services/chat.js';
export { TextGenerationService } from './services/text-generation.js';
export { EmbeddingService } from './services/embedding.js';
export { EndpointManagementService } from './endpoints/service.js';

// Types
export {
  // Provider types
  InferenceProvider,
  InferenceTarget,
  ProviderUrl,
  PROVIDER_URLS,

  // Chat types
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatChoice,
  ChatMessageRole,
  ContentPart,
  Tool,
  ToolCall,
  TokenUsage,

  // Streaming types
  ChatStreamChunk,
  ChatStreamChoice,
  ChatStreamDelta,

  // Text generation types
  TextGenerationRequest,
  TextGenerationResponse,
  TokenInfo,

  // Embedding types
  EmbeddingRequest,
  EmbeddingResponse,

  // Endpoint types
  EndpointConfig,
  EndpointInfo,
  EndpointStatus,
  EndpointType,
  EndpointScaling,
  EndpointInstance,

  // Multimodal types
  ImageInput,
  AudioInput,
  ImageGenerationRequest,
  ImageClassificationRequest,
  ImageClassificationResult,
  ObjectDetectionRequest,
  ObjectDetectionResult,
  TranscriptionRequest,
  TranscriptionResponse,
  TranscriptionChunk,
  SynthesisRequest,
} from './types/index.js';

// Provider resolver
export { ProviderResolver, ResolvedEndpoint } from './providers/provider-resolver.js';

// Platform adapter
export {
  HfInferenceAdapter,
  HfInferenceAdapterOptions,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ProviderCapabilities,
  HealthCheckResult,
  ProviderStatus,
} from './adapter.js';

// Utilities
export {
  ColdStartHandler,
  ColdStartOptions,
  ModelLoadingInfo,
  isModelLoadingError,
  parseLoadingInfo,
  createWaitForModelHeaders,
  defaultColdStartHandler,
} from './utils/cold-start-handler.js';

export {
  withRetry,
  createRetryWrapper,
  RetryOptions,
  CircuitBreaker,
  CircuitBreakerOptions,
} from './utils/retry.js';

export {
  parseSSEStream,
  parseSSEResponse,
  filterDataEvents,
  parseJSONEvents,
  SSEEvent,
} from './utils/sse-parser.js';
