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
export { createClient, createClientFromEnv, } from './client/client.js';
// Configuration exports
export { AnthropicConfigBuilder, validateConfig, DEFAULT_BASE_URL, DEFAULT_API_VERSION, DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES, } from './config/config.js';
// Error exports
export { AnthropicError } from './errors/error.js';
export { ConfigurationError, AuthenticationError, ValidationError, RateLimitError, NetworkError, ServerError, NotFoundError, StreamError, OverloadedError, ContentTooLargeError, } from './errors/categories.js';
// Auth exports
export { BearerAuthManager, createAuthManager, } from './auth/auth-manager.js';
// Transport exports
export { FetchHttpTransport, createHttpTransport, readSSEStream, } from './transport/http-transport.js';
// Service exports - Admin
export { OrganizationsServiceImpl, WorkspacesServiceImpl, ApiKeysServiceImpl, InvitesServiceImpl, UsersServiceImpl, } from './services/index.js';
export { RetryExecutor, createDefaultRetryConfig, CircuitBreaker, CircuitOpenError, createDefaultCircuitBreakerConfig, RateLimiter, createDefaultRateLimiterConfig, DefaultResilienceOrchestrator, PassthroughResilienceOrchestrator, createDefaultResilienceConfig, } from './resilience/index.js';
// Observability exports
export { createSpan, withParent, withAttribute, finishSpan, finishSpanWithError, getSpanDuration, DefaultTracer, NoopTracer, InMemoryMetricsCollector, NoopMetricsCollector, MetricNames, createDefaultLoggingConfig, ConsoleLogger, NoopLogger, logRequest, logResponse, logError, startTelemetryContext, emitRequestComplete, emitError as emitTelemetryError, extractUsageMetadata, } from './observability/index.js';
export { 
// Extended thinking
createThinkingConfig, withThinking, extractThinkingBlocks, getThinkingText, hasThinkingBlocks, estimateThinkingTokens, 
// PDF support
createPdfContent, createPdfContentFromBuffer, createPdfContentFromArrayBuffer, createPdfContentFromBytes, validatePdfBytes, validatePdfBase64, estimatePdfSize, isPdfWithinSizeLimit, 
// Prompt caching
createCacheControl, createCacheableSystemPrompt, createCacheableSystemPrompts, hasCacheUsage, getCacheEfficiency, calculateTokensSaved, calculateCostSavings, getCacheStats, isCachingEffective, 
// Token counting
TokenCountingServiceImpl, createTokenCountingService, 
// Computer use
COMPUTER_USE_BETA_HEADER, createComputerTool, createTextEditorTool, createBashTool, createComputerUseTools, ComputerToolResultBuilder, createComputerToolResult, createTextToolResult, createScreenshotToolResult, validateComputerTool, } from './services/beta/index.js';
// Version
export const VERSION = '0.1.0';
//# sourceMappingURL=index.js.map