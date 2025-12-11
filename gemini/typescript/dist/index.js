/**
 * @integrations/gemini
 *
 * Production-ready TypeScript client for the Google Gemini (Generative AI) API
 *
 * @example
 * ```typescript
 * import { createClient, createClientFromEnv } from '@integrations/gemini';
 *
 * // Create client with explicit configuration
 * const client = createClient({
 *   apiKey: 'your-api-key',
 *   timeout: 30000,
 * });
 *
 * // Or create from environment variables
 * const client = createClientFromEnv();
 *
 * // Generate content
 * const response = await client.content.generate('gemini-2.0-flash', {
 *   contents: [{ parts: [{ text: 'Hello, Gemini!' }] }],
 * });
 * ```
 */
// Client exports
export { createClient, createClientFromEnv, } from './client/index.js';
// Configuration exports
export { resolveConfig, createConfigFromEnv, validateConfig, DEFAULT_BASE_URL, DEFAULT_API_VERSION, DEFAULT_TIMEOUT, DEFAULT_CONNECT_TIMEOUT, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_CONFIG, DEFAULT_CIRCUIT_BREAKER_CONFIG, DEFAULT_RATE_LIMIT_CONFIG, } from './config/index.js';
// Error exports
export { GeminiError, 
// Configuration Errors
MissingApiKeyError, InvalidBaseUrlError, InvalidConfigurationError, 
// Authentication Errors
InvalidApiKeyError, ExpiredApiKeyError, AuthQuotaExceededError, ValidationError, InvalidModelError, InvalidParameterError, PayloadTooLargeError, UnsupportedMediaTypeError, 
// Rate Limit Errors
TooManyRequestsError, TokenLimitExceededError, QuotaExceededError, 
// Network Errors
ConnectionError, TimeoutError, DnsResolutionError, TlsError, 
// Server Errors
InternalServerError, ServiceUnavailableError, ModelOverloadedError, 
// Response Errors
DeserializationError, UnexpectedFormatError, StreamInterruptedError, MalformedChunkError, 
// Content Errors
SafetyBlockedError, RecitationBlockedError, ProhibitedContentError, UnsupportedContentError, 
// Resource Errors
FileNotFoundError, FileProcessingError, CachedContentNotFoundError, ModelNotFoundError, 
// Error mapping utilities
mapHttpStatusToError, mapApiErrorToGeminiError, extractRetryAfter, } from './error/index.js';
// Type guard exports
export { isTextPart, isInlineDataPart, isFileDataPart, isFunctionCallPart, isFunctionResponsePart, isExecutableCodePart, isCodeExecutionResultPart, } from './types/index.js';
// Streaming exports
export { ChunkedJsonParser, StreamAccumulator, } from './streaming/index.js';
// Resilience exports
export { RetryExecutor, CircuitBreaker, CircuitBreakerOpenError, RateLimiter, ResilienceOrchestrator, CircuitState, } from './resilience/index.js';
// Validation exports
export { validateGenerateContentRequest, validateEmbedContentRequest, validateBatchSize, validateModelName, } from './validation/index.js';
// Safety checking exports
export { checkSafetyBlocks, hasSafetyConcerns, getSafetyRatingSummary, } from './services/safety.js';
// Testing utilities (fixtures and mocks)
export { loadFixture, loadJsonFixture, loadStreamingFixture } from './__fixtures__/index.js';
export { MockHttpClient, createMockFetch } from './__mocks__/index.js';
// Version
export const VERSION = '0.1.0';
//# sourceMappingURL=index.js.map