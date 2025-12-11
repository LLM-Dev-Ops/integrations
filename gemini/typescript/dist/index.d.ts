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
export { createClient, createClientFromEnv, type GeminiClient, } from './client/index.js';
export { type GeminiConfig, type ResolvedGeminiConfig, type RetryConfig, type CircuitBreakerConfig, type RateLimitConfig, type AuthMethod, type LogLevel, resolveConfig, createConfigFromEnv, validateConfig, DEFAULT_BASE_URL, DEFAULT_API_VERSION, DEFAULT_TIMEOUT, DEFAULT_CONNECT_TIMEOUT, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_CONFIG, DEFAULT_CIRCUIT_BREAKER_CONFIG, DEFAULT_RATE_LIMIT_CONFIG, } from './config/index.js';
export { GeminiError, type GeminiResult, MissingApiKeyError, InvalidBaseUrlError, InvalidConfigurationError, InvalidApiKeyError, ExpiredApiKeyError, AuthQuotaExceededError, type ValidationDetail, ValidationError, InvalidModelError, InvalidParameterError, PayloadTooLargeError, UnsupportedMediaTypeError, TooManyRequestsError, TokenLimitExceededError, QuotaExceededError, ConnectionError, TimeoutError, DnsResolutionError, TlsError, InternalServerError, ServiceUnavailableError, ModelOverloadedError, DeserializationError, UnexpectedFormatError, StreamInterruptedError, MalformedChunkError, SafetyBlockedError, RecitationBlockedError, ProhibitedContentError, UnsupportedContentError, FileNotFoundError, FileProcessingError, CachedContentNotFoundError, ModelNotFoundError, mapHttpStatusToError, mapApiErrorToGeminiError, extractRetryAfter, } from './error/index.js';
export type { Part, TextPart, InlineDataPart, FileDataPart, FunctionCallPart, FunctionResponsePart, ExecutableCodePart, CodeExecutionResultPart, Blob, FileData, FunctionCall, FunctionResponse, ExecutableCode, CodeExecutionResult, Content, Role, SafetySetting, SafetyRating, HarmCategory, HarmBlockThreshold, HarmProbability, GenerationConfig, FinishReason, BlockReason, PromptFeedback, UsageMetadata, Candidate, CitationMetadata, CitationSource, GroundingMetadata, Tool, ToolConfig, FunctionDeclaration, FunctionCallingConfig, FunctionCallingMode, CodeExecution, GoogleSearchRetrieval, GenerateContentRequest, GenerateContentResponse, EmbedContentRequest, EmbedContentResponse, BatchEmbedContentsResponse, Embedding, TaskType, CountTokensRequest, CountTokensResponse, Model, ListModelsParams, ListModelsResponse, GeminiFile, FileState, UploadFileRequest, ListFilesParams, ListFilesResponse, CachedContent, CachedContentUsageMetadata, CreateCachedContentRequest, UpdateCachedContentRequest, ListCachedContentsParams, ListCachedContentsResponse, } from './types/index.js';
export { isTextPart, isInlineDataPart, isFileDataPart, isFunctionCallPart, isFunctionResponsePart, isExecutableCodePart, isCodeExecutionResultPart, } from './types/index.js';
export type { ContentService, ContentStream, EmbeddingsService, ModelsService, FilesService, CachedContentService, } from './services/index.js';
export { ChunkedJsonParser, StreamAccumulator, type AccumulatorOptions, } from './streaming/index.js';
export { RetryExecutor, CircuitBreaker, CircuitBreakerOpenError, RateLimiter, ResilienceOrchestrator, type ResilienceConfig, CircuitState, } from './resilience/index.js';
export { validateGenerateContentRequest, validateEmbedContentRequest, validateBatchSize, validateModelName, type ValidationResult, type ValidationDetail as ValidatorDetail, } from './validation/index.js';
export { checkSafetyBlocks, hasSafetyConcerns, getSafetyRatingSummary, } from './services/safety.js';
export { loadFixture, loadJsonFixture, loadStreamingFixture } from './__fixtures__/index.js';
export { MockHttpClient, createMockFetch, type MockResponse, type MockStreamChunk } from './__mocks__/index.js';
export declare const VERSION = "0.1.0";
//# sourceMappingURL=index.d.ts.map