/**
 * Base error class for all Anthropic API errors.
 * Provides structured error information including error type, HTTP status,
 * retry capabilities, and optional retry-after information.
 */
export class AnthropicError extends Error {
    /**
     * The type of error (e.g., 'invalid_request_error', 'authentication_error')
     */
    type;
    /**
     * HTTP status code associated with the error, if applicable
     */
    status;
    /**
     * Number of seconds to wait before retrying, if provided by the API
     */
    retryAfter;
    /**
     * Indicates whether this error type can be retried
     */
    isRetryable;
    /**
     * Additional error details from the API response
     */
    details;
    constructor(options) {
        super(options.message);
        this.name = 'AnthropicError';
        this.type = options.type;
        this.status = options.status;
        this.retryAfter = options.retryAfter;
        this.isRetryable = options.isRetryable ?? false;
        this.details = options.details;
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    /**
     * Returns a JSON representation of the error
     */
    toJSON() {
        return {
            name: this.name,
            type: this.type,
            message: this.message,
            status: this.status,
            retryAfter: this.retryAfter,
            isRetryable: this.isRetryable,
            details: this.details,
        };
    }
}
//# sourceMappingURL=error.js.map