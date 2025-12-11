/**
 * Error exports for the Gemini API client.
 */
export { GeminiError, type GeminiResult } from './types.js';
export { MissingApiKeyError, InvalidBaseUrlError, InvalidConfigurationError, InvalidApiKeyError, ExpiredApiKeyError, AuthQuotaExceededError, type ValidationDetail, ValidationError, InvalidModelError, InvalidParameterError, PayloadTooLargeError, UnsupportedMediaTypeError, TooManyRequestsError, TokenLimitExceededError, QuotaExceededError, ConnectionError, TimeoutError, DnsResolutionError, TlsError, InternalServerError, ServiceUnavailableError, ModelOverloadedError, DeserializationError, UnexpectedFormatError, StreamInterruptedError, MalformedChunkError, SafetyBlockedError, RecitationBlockedError, ProhibitedContentError, UnsupportedContentError, FileNotFoundError, FileProcessingError, CachedContentNotFoundError, ModelNotFoundError, } from './categories.js';
export { mapHttpStatusToError, mapApiErrorToGeminiError, extractRetryAfter, } from './mapper.js';
//# sourceMappingURL=index.d.ts.map