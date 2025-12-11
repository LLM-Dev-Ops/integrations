/**
 * Error category classes for granular error handling.
 */
import { GeminiError } from './error.js';
/** Error for missing API key */
export declare class MissingApiKeyError extends GeminiError {
    constructor();
}
/** Error for invalid base URL */
export declare class InvalidBaseUrlError extends GeminiError {
    readonly url: string;
    constructor(url: string);
}
/** Error for invalid configuration */
export declare class InvalidConfigurationError extends GeminiError {
    constructor(message: string);
}
/** Error for invalid API key */
export declare class InvalidApiKeyError extends GeminiError {
    constructor();
}
/** Error for expired API key */
export declare class ExpiredApiKeyError extends GeminiError {
    constructor();
}
/** Error for quota exceeded (auth) */
export declare class AuthQuotaExceededError extends GeminiError {
    constructor();
}
/** Validation detail */
export interface ValidationDetail {
    field: string;
    description: string;
}
/** Error for validation failures */
export declare class ValidationError extends GeminiError {
    readonly validationDetails: ValidationDetail[];
    constructor(message: string, details?: ValidationDetail[]);
}
/** Error for invalid model */
export declare class InvalidModelError extends GeminiError {
    readonly model: string;
    constructor(model: string);
}
/** Error for invalid parameter */
export declare class InvalidParameterError extends GeminiError {
    readonly parameter: string;
    constructor(parameter: string, message: string);
}
/** Error for payload too large */
export declare class PayloadTooLargeError extends GeminiError {
    readonly size: number;
    readonly maxSize: number;
    constructor(size: number, maxSize: number);
}
/** Error for unsupported media type */
export declare class UnsupportedMediaTypeError extends GeminiError {
    readonly mimeType: string;
    constructor(mimeType: string);
}
/** Error for too many requests */
export declare class TooManyRequestsError extends GeminiError {
    constructor(retryAfter?: number);
}
/** Error for token limit exceeded */
export declare class TokenLimitExceededError extends GeminiError {
    constructor();
}
/** Error for quota exceeded (rate limit) */
export declare class QuotaExceededError extends GeminiError {
    constructor(retryAfter?: number);
}
/** Error for connection failures */
export declare class ConnectionError extends GeminiError {
    constructor(message: string);
}
/** Error for timeouts */
export declare class TimeoutError extends GeminiError {
    readonly duration: number;
    constructor(duration: number);
}
/** Error for DNS resolution failures */
export declare class DnsResolutionError extends GeminiError {
    readonly host: string;
    constructor(host: string);
}
/** Error for TLS failures */
export declare class TlsError extends GeminiError {
    constructor(message: string);
}
/** Error for internal server errors */
export declare class InternalServerError extends GeminiError {
    constructor(message: string);
}
/** Error for service unavailable */
export declare class ServiceUnavailableError extends GeminiError {
    constructor(retryAfter?: number);
}
/** Error for model overloaded */
export declare class ModelOverloadedError extends GeminiError {
    readonly model: string;
    constructor(model: string);
}
/** Error for deserialization failures */
export declare class DeserializationError extends GeminiError {
    constructor(message: string);
}
/** Error for unexpected response format */
export declare class UnexpectedFormatError extends GeminiError {
    constructor(message: string);
}
/** Error for stream interruptions */
export declare class StreamInterruptedError extends GeminiError {
    constructor(message: string);
}
/** Error for malformed chunks */
export declare class MalformedChunkError extends GeminiError {
    constructor(message: string);
}
/** Error for safety-blocked content */
export declare class SafetyBlockedError extends GeminiError {
    readonly category?: string;
    readonly probability?: string;
    constructor(category?: string, probability?: string);
}
/** Error for recitation-blocked content */
export declare class RecitationBlockedError extends GeminiError {
    constructor();
}
/** Error for prohibited content */
export declare class ProhibitedContentError extends GeminiError {
    constructor();
}
/** Error for unsupported content */
export declare class UnsupportedContentError extends GeminiError {
    readonly mimeType: string;
    constructor(mimeType: string);
}
/** Error for file not found */
export declare class FileNotFoundError extends GeminiError {
    readonly fileName: string;
    constructor(fileName: string);
}
/** Error for file processing failures */
export declare class FileProcessingError extends GeminiError {
    readonly fileName: string;
    constructor(fileName: string, message: string);
}
/** Error for cached content not found */
export declare class CachedContentNotFoundError extends GeminiError {
    readonly contentName: string;
    constructor(name: string);
}
/** Error for model not found */
export declare class ModelNotFoundError extends GeminiError {
    readonly model: string;
    constructor(model: string);
}
//# sourceMappingURL=categories.d.ts.map