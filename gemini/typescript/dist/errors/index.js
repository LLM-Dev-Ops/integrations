/**
 * Error exports for the Gemini API client.
 */
export { GeminiError } from './error.js';
export { 
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
FileNotFoundError, FileProcessingError, CachedContentNotFoundError, ModelNotFoundError, } from './categories.js';
//# sourceMappingURL=index.js.map