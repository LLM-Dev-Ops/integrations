/**
 * @integrations/anthropic
 *
 * Production-ready TypeScript client for the Anthropic Claude API
 *
 * @example
 * ```typescript
 * import { createClient, createClientFromEnv } from '@integrations/anthropic';
 *
 * // Create client with explicit configuration
 * const client = createClient({
 *   apiKey: 'sk-ant-api03-...',
 *   timeout: 30000,
 * });
 *
 * // Or create from environment variables
 * const client = createClientFromEnv();
 * ```
 */

// Client exports
export {
  createClient,
  createClientFromEnv,
  type AnthropicClient,
  type MessagesAPI,
  type ModelsAPI,
  type BatchesAPI,
} from './client/client.js';

// Configuration exports
export {
  type AnthropicConfig,
  type BetaFeature,
  AnthropicConfigBuilder,
  validateConfig,
  DEFAULT_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
} from './config/config.js';

// Error exports
export { AnthropicError } from './errors/error.js';
export {
  ConfigurationError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  ServerError,
  NotFoundError,
  StreamError,
  OverloadedError,
  ContentTooLargeError,
} from './errors/categories.js';

// Type exports
export type {
  Usage,
  StopReason,
  Role,
  ContentBlockType,
  ContentBlock,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlockUnion,
  MessageContent,
  Message,
  Tool,
  Metadata,
  RequestOptions,
  ModelId,
  ModelInfo,
  StreamEventType,
  StreamEvent,
  TextDelta,
  ToolUseDelta,
  SystemPrompt,
  ImageSource,
} from './types/common.js';

// Auth exports
export {
  type AuthManager,
  BearerAuthManager,
  createAuthManager,
} from './auth/auth-manager.js';

// Transport exports
export {
  type HttpTransport,
  type RequestOptions as TransportRequestOptions,
  FetchHttpTransport,
  createHttpTransport,
  readSSEStream,
} from './transport/http-transport.js';

// Service exports - Messages
export type {
  MessagesService,
  CreateMessageRequest,
  MessageParam,
  CountTokensRequest,
  TokenCount,
  DocumentBlock,
  ThinkingBlock,
  MessageStream,
} from './services/index.js';

// Service exports - Models
export type {
  ModelsService,
  ModelListResponse,
} from './services/index.js';

// Service exports - Batches
export type {
  BatchesService,
  MessageBatch,
  BatchRequest,
  CreateBatchRequest,
  BatchListParams,
  BatchListResponse,
  BatchResultItem,
  BatchResultsResponse,
  BatchStatus,
  BatchRequestCounts,
} from './services/index.js';

// Service exports - Admin
export {
  // Types
  type Organization,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceMemberRole,
  type ApiKey,
  type ApiKeyStatus,
  type ApiKeyWithSecret,
  type Invite,
  type InviteStatus,
  type User,
  type UpdateOrganizationRequest,
  type CreateWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type AddWorkspaceMemberRequest,
  type UpdateWorkspaceMemberRequest,
  type CreateApiKeyRequest,
  type UpdateApiKeyRequest,
  type CreateInviteRequest,
  type ListParams,
  type ListResponse,
  // Services
  type OrganizationsService,
  OrganizationsServiceImpl,
  type WorkspacesService,
  WorkspacesServiceImpl,
  type ApiKeysService,
  ApiKeysServiceImpl,
  type InvitesService,
  InvitesServiceImpl,
  type UsersService,
  UsersServiceImpl,
} from './services/index.js';

// Resilience exports
export type {
  RetryConfig,
  CircuitBreakerConfig,
  RateLimiterConfig,
  ResilienceConfig,
  CircuitState,
  RetryHook,
  CircuitBreakerHook,
  RateLimitHook,
  ResilienceOrchestrator,
} from './resilience/index.js';
export {
  RetryExecutor,
  createDefaultRetryConfig,
  CircuitBreaker,
  CircuitOpenError,
  createDefaultCircuitBreakerConfig,
  RateLimiter,
  createDefaultRateLimiterConfig,
  DefaultResilienceOrchestrator,
  PassthroughResilienceOrchestrator,
  createDefaultResilienceConfig,
} from './resilience/index.js';

// Observability exports
export {
  type RequestSpan,
  type SpanStatus,
  type Tracer,
  createSpan,
  withParent,
  withAttribute,
  finishSpan,
  finishSpanWithError,
  getSpanDuration,
  DefaultTracer,
  NoopTracer,
  type MetricsCollector,
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  MetricNames,
  type LogLevel,
  type LogFormat,
  type LoggingConfig,
  type Logger,
  createDefaultLoggingConfig,
  ConsoleLogger,
  NoopLogger,
  logRequest,
  logResponse,
  logError,
  type TelemetryOptions,
  type TelemetryContext,
  startTelemetryContext,
  emitRequestComplete,
  emitError as emitTelemetryError,
  extractUsageMetadata,
} from './observability/index.js';

// Beta features exports
export type {
  ThinkingConfig,
  PdfSource,
  DocumentContent,
  CacheControl,
  SystemPromptWithCache,
  CacheUsage,
  TokenCountRequest,
  TokenCountResponse,
  ComputerToolType,
  ComputerTool,
  ComputerToolResult,
  ComputerToolResultContent,
  TokenCountingService,
} from './services/beta/index.js';

export {
  // Extended thinking
  createThinkingConfig,
  withThinking,
  extractThinkingBlocks,
  getThinkingText,
  hasThinkingBlocks,
  estimateThinkingTokens,
  // PDF support
  createPdfContent,
  createPdfContentFromBuffer,
  createPdfContentFromArrayBuffer,
  createPdfContentFromBytes,
  validatePdfBytes,
  validatePdfBase64,
  estimatePdfSize,
  isPdfWithinSizeLimit,
  // Prompt caching
  createCacheControl,
  createCacheableSystemPrompt,
  createCacheableSystemPrompts,
  hasCacheUsage,
  getCacheEfficiency,
  calculateTokensSaved,
  calculateCostSavings,
  getCacheStats,
  isCachingEffective,
  // Token counting
  TokenCountingServiceImpl,
  createTokenCountingService,
  // Computer use
  COMPUTER_USE_BETA_HEADER,
  createComputerTool,
  createTextEditorTool,
  createBashTool,
  createComputerUseTools,
  ComputerToolResultBuilder,
  createComputerToolResult,
  createTextToolResult,
  createScreenshotToolResult,
  validateComputerTool,
} from './services/beta/index.js';

// Version
export const VERSION = '0.1.0';
