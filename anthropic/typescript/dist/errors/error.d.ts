/**
 * Base error class for all Anthropic API errors.
 * Provides structured error information including error type, HTTP status,
 * retry capabilities, and optional retry-after information.
 */
export declare class AnthropicError extends Error {
    /**
     * The type of error (e.g., 'invalid_request_error', 'authentication_error')
     */
    readonly type: string;
    /**
     * HTTP status code associated with the error, if applicable
     */
    readonly status?: number;
    /**
     * Number of seconds to wait before retrying, if provided by the API
     */
    readonly retryAfter?: number;
    /**
     * Indicates whether this error type can be retried
     */
    readonly isRetryable: boolean;
    /**
     * Additional error details from the API response
     */
    readonly details?: Record<string, unknown>;
    constructor(options: {
        type: string;
        message: string;
        status?: number;
        retryAfter?: number;
        isRetryable?: boolean;
        details?: Record<string, unknown>;
    });
    /**
     * Returns a JSON representation of the error
     */
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=error.d.ts.map