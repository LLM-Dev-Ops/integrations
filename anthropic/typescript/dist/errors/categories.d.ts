import { AnthropicError } from './error.js';
/**
 * Error thrown when the client is misconfigured (e.g., missing API key, invalid base URL)
 */
export declare class ConfigurationError extends AnthropicError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Error thrown when authentication fails (e.g., invalid API key)
 */
export declare class AuthenticationError extends AnthropicError {
    constructor(message: string, status?: number, details?: Record<string, unknown>);
}
/**
 * Error thrown when request validation fails (e.g., invalid parameters, malformed request)
 */
export declare class ValidationError extends AnthropicError {
    constructor(message: string, status?: number, details?: Record<string, unknown>);
}
/**
 * Error thrown when rate limits are exceeded
 */
export declare class RateLimitError extends AnthropicError {
    constructor(message: string, retryAfter?: number, details?: Record<string, unknown>);
}
/**
 * Error thrown when network-level failures occur (e.g., connection timeout, DNS resolution failure)
 */
export declare class NetworkError extends AnthropicError {
    constructor(message: string, cause?: Error, details?: Record<string, unknown>);
}
/**
 * Error thrown when the API server returns a 5xx error
 */
export declare class ServerError extends AnthropicError {
    constructor(message: string, status: number, details?: Record<string, unknown>);
}
/**
 * Error thrown when a requested resource is not found (404)
 */
export declare class NotFoundError extends AnthropicError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Error thrown when streaming fails or is interrupted
 */
export declare class StreamError extends AnthropicError {
    constructor(message: string, cause?: Error, details?: Record<string, unknown>);
}
/**
 * Error thrown when request is overloaded (529)
 */
export declare class OverloadedError extends AnthropicError {
    constructor(message: string, retryAfter?: number, details?: Record<string, unknown>);
}
/**
 * Error thrown when the request exceeds token or content length limits
 */
export declare class ContentTooLargeError extends AnthropicError {
    constructor(message: string, details?: Record<string, unknown>);
}
//# sourceMappingURL=categories.d.ts.map