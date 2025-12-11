/**
 * Error category classes for granular error handling.
 */
import { GeminiError } from './error.js';
// ============================================================================
// Configuration Errors
// ============================================================================
/** Error for missing API key */
export class MissingApiKeyError extends GeminiError {
    constructor() {
        super({
            type: 'configuration_error',
            message: 'Missing API key. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.',
            isRetryable: false,
        });
        this.name = 'MissingApiKeyError';
    }
}
/** Error for invalid base URL */
export class InvalidBaseUrlError extends GeminiError {
    url;
    constructor(url) {
        super({
            type: 'configuration_error',
            message: `Invalid base URL: ${url}`,
            isRetryable: false,
        });
        this.name = 'InvalidBaseUrlError';
        this.url = url;
    }
}
/** Error for invalid configuration */
export class InvalidConfigurationError extends GeminiError {
    constructor(message) {
        super({
            type: 'configuration_error',
            message: `Invalid configuration: ${message}`,
            isRetryable: false,
        });
        this.name = 'InvalidConfigurationError';
    }
}
// ============================================================================
// Authentication Errors
// ============================================================================
/** Error for invalid API key */
export class InvalidApiKeyError extends GeminiError {
    constructor() {
        super({
            type: 'authentication_error',
            message: 'Invalid API key',
            status: 401,
            isRetryable: false,
        });
        this.name = 'InvalidApiKeyError';
    }
}
/** Error for expired API key */
export class ExpiredApiKeyError extends GeminiError {
    constructor() {
        super({
            type: 'authentication_error',
            message: 'API key has expired',
            status: 401,
            isRetryable: false,
        });
        this.name = 'ExpiredApiKeyError';
    }
}
/** Error for quota exceeded (auth) */
export class AuthQuotaExceededError extends GeminiError {
    constructor() {
        super({
            type: 'authentication_error',
            message: 'Quota exceeded for API key',
            status: 403,
            isRetryable: false,
        });
        this.name = 'AuthQuotaExceededError';
    }
}
/** Error for validation failures */
export class ValidationError extends GeminiError {
    validationDetails;
    constructor(message, details = []) {
        super({
            type: 'validation_error',
            message: `Validation error: ${message}`,
            status: 400,
            isRetryable: false,
            details: { validationDetails: details },
        });
        this.name = 'ValidationError';
        this.validationDetails = details;
    }
}
/** Error for invalid model */
export class InvalidModelError extends GeminiError {
    model;
    constructor(model) {
        super({
            type: 'invalid_model',
            message: `Invalid model: ${model}`,
            status: 400,
            isRetryable: false,
        });
        this.name = 'InvalidModelError';
        this.model = model;
    }
}
/** Error for invalid parameter */
export class InvalidParameterError extends GeminiError {
    parameter;
    constructor(parameter, message) {
        super({
            type: 'invalid_parameter',
            message: `Invalid parameter '${parameter}': ${message}`,
            status: 400,
            isRetryable: false,
        });
        this.name = 'InvalidParameterError';
        this.parameter = parameter;
    }
}
/** Error for payload too large */
export class PayloadTooLargeError extends GeminiError {
    size;
    maxSize;
    constructor(size, maxSize) {
        super({
            type: 'payload_too_large',
            message: `Payload too large: ${size} bytes (max: ${maxSize})`,
            status: 413,
            isRetryable: false,
        });
        this.name = 'PayloadTooLargeError';
        this.size = size;
        this.maxSize = maxSize;
    }
}
/** Error for unsupported media type */
export class UnsupportedMediaTypeError extends GeminiError {
    mimeType;
    constructor(mimeType) {
        super({
            type: 'unsupported_media_type',
            message: `Unsupported media type: ${mimeType}`,
            status: 415,
            isRetryable: false,
        });
        this.name = 'UnsupportedMediaTypeError';
        this.mimeType = mimeType;
    }
}
// ============================================================================
// Rate Limit Errors
// ============================================================================
/** Error for too many requests */
export class TooManyRequestsError extends GeminiError {
    constructor(retryAfter) {
        super({
            type: 'rate_limit_error',
            message: 'Too many requests',
            status: 429,
            retryAfter,
            isRetryable: true,
        });
        this.name = 'TooManyRequestsError';
    }
}
/** Error for token limit exceeded */
export class TokenLimitExceededError extends GeminiError {
    constructor() {
        super({
            type: 'rate_limit_error',
            message: 'Token limit exceeded',
            status: 429,
            isRetryable: true,
        });
        this.name = 'TokenLimitExceededError';
    }
}
/** Error for quota exceeded (rate limit) */
export class QuotaExceededError extends GeminiError {
    constructor(retryAfter) {
        super({
            type: 'rate_limit_error',
            message: 'Quota exceeded',
            status: 429,
            retryAfter,
            isRetryable: true,
        });
        this.name = 'QuotaExceededError';
    }
}
// ============================================================================
// Network Errors
// ============================================================================
/** Error for connection failures */
export class ConnectionError extends GeminiError {
    constructor(message) {
        super({
            type: 'network_error',
            message: `Connection failed: ${message}`,
            isRetryable: true,
        });
        this.name = 'ConnectionError';
    }
}
/** Error for timeouts */
export class TimeoutError extends GeminiError {
    duration;
    constructor(duration) {
        super({
            type: 'network_error',
            message: `Request timed out after ${duration}ms`,
            isRetryable: true,
        });
        this.name = 'TimeoutError';
        this.duration = duration;
    }
}
/** Error for DNS resolution failures */
export class DnsResolutionError extends GeminiError {
    host;
    constructor(host) {
        super({
            type: 'network_error',
            message: `DNS resolution failed for: ${host}`,
            isRetryable: true,
        });
        this.name = 'DnsResolutionError';
        this.host = host;
    }
}
/** Error for TLS failures */
export class TlsError extends GeminiError {
    constructor(message) {
        super({
            type: 'network_error',
            message: `TLS error: ${message}`,
            isRetryable: false,
        });
        this.name = 'TlsError';
    }
}
// ============================================================================
// Server Errors
// ============================================================================
/** Error for internal server errors */
export class InternalServerError extends GeminiError {
    constructor(message) {
        super({
            type: 'server_error',
            message: `Internal server error: ${message}`,
            status: 500,
            isRetryable: true,
        });
        this.name = 'InternalServerError';
    }
}
/** Error for service unavailable */
export class ServiceUnavailableError extends GeminiError {
    constructor(retryAfter) {
        super({
            type: 'server_error',
            message: 'Service unavailable',
            status: 503,
            retryAfter,
            isRetryable: true,
        });
        this.name = 'ServiceUnavailableError';
    }
}
/** Error for model overloaded */
export class ModelOverloadedError extends GeminiError {
    model;
    constructor(model) {
        super({
            type: 'server_error',
            message: `Model overloaded: ${model}`,
            status: 503,
            isRetryable: true,
        });
        this.name = 'ModelOverloadedError';
        this.model = model;
    }
}
// ============================================================================
// Response Errors
// ============================================================================
/** Error for deserialization failures */
export class DeserializationError extends GeminiError {
    constructor(message) {
        super({
            type: 'response_error',
            message: `Failed to deserialize response: ${message}`,
            isRetryable: false,
        });
        this.name = 'DeserializationError';
    }
}
/** Error for unexpected response format */
export class UnexpectedFormatError extends GeminiError {
    constructor(message) {
        super({
            type: 'response_error',
            message: `Unexpected response format: ${message}`,
            isRetryable: false,
        });
        this.name = 'UnexpectedFormatError';
    }
}
/** Error for stream interruptions */
export class StreamInterruptedError extends GeminiError {
    constructor(message) {
        super({
            type: 'response_error',
            message: `Stream interrupted: ${message}`,
            isRetryable: true,
        });
        this.name = 'StreamInterruptedError';
    }
}
/** Error for malformed chunks */
export class MalformedChunkError extends GeminiError {
    constructor(message) {
        super({
            type: 'response_error',
            message: `Malformed chunk: ${message}`,
            isRetryable: false,
        });
        this.name = 'MalformedChunkError';
    }
}
// ============================================================================
// Content Errors
// ============================================================================
/** Error for safety-blocked content */
export class SafetyBlockedError extends GeminiError {
    category;
    probability;
    constructor(category, probability) {
        super({
            type: 'content_error',
            message: `Content blocked due to safety: ${category || 'unknown category'}`,
            isRetryable: false,
            details: { category, probability },
        });
        this.name = 'SafetyBlockedError';
        this.category = category;
        this.probability = probability;
    }
}
/** Error for recitation-blocked content */
export class RecitationBlockedError extends GeminiError {
    constructor() {
        super({
            type: 'content_error',
            message: 'Content blocked due to recitation',
            isRetryable: false,
        });
        this.name = 'RecitationBlockedError';
    }
}
/** Error for prohibited content */
export class ProhibitedContentError extends GeminiError {
    constructor() {
        super({
            type: 'content_error',
            message: 'Prohibited content detected',
            isRetryable: false,
        });
        this.name = 'ProhibitedContentError';
    }
}
/** Error for unsupported content */
export class UnsupportedContentError extends GeminiError {
    mimeType;
    constructor(mimeType) {
        super({
            type: 'content_error',
            message: `Unsupported content type: ${mimeType}`,
            isRetryable: false,
        });
        this.name = 'UnsupportedContentError';
        this.mimeType = mimeType;
    }
}
// ============================================================================
// Resource Errors
// ============================================================================
/** Error for file not found */
export class FileNotFoundError extends GeminiError {
    fileName;
    constructor(fileName) {
        super({
            type: 'resource_error',
            message: `File not found: ${fileName}`,
            status: 404,
            isRetryable: false,
        });
        this.name = 'FileNotFoundError';
        this.fileName = fileName;
    }
}
/** Error for file processing failures */
export class FileProcessingError extends GeminiError {
    fileName;
    constructor(fileName, message) {
        super({
            type: 'resource_error',
            message: `File processing failed for ${fileName}: ${message}`,
            isRetryable: false,
        });
        this.name = 'FileProcessingError';
        this.fileName = fileName;
    }
}
/** Error for cached content not found */
export class CachedContentNotFoundError extends GeminiError {
    contentName;
    constructor(name) {
        super({
            type: 'resource_error',
            message: `Cached content not found: ${name}`,
            status: 404,
            isRetryable: false,
        });
        this.name = 'CachedContentNotFoundError';
        this.contentName = name;
    }
}
/** Error for model not found */
export class ModelNotFoundError extends GeminiError {
    model;
    constructor(model) {
        super({
            type: 'resource_error',
            message: `Model not found: ${model}`,
            status: 404,
            isRetryable: false,
        });
        this.name = 'ModelNotFoundError';
        this.model = model;
    }
}
//# sourceMappingURL=categories.js.map