/**
 * Base error class for all Gemini API errors.
 */
export class GeminiError extends Error {
    /** The type/category of error */
    type;
    /** HTTP status code if applicable */
    status;
    /** Seconds to wait before retrying */
    retryAfter;
    /** Whether this error can be retried */
    isRetryable;
    /** Additional error details */
    details;
    constructor(options) {
        super(options.message);
        this.name = 'GeminiError';
        this.type = options.type;
        this.status = options.status;
        this.retryAfter = options.retryAfter;
        this.isRetryable = options.isRetryable ?? false;
        this.details = options.details;
        // Maintains proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    /** Returns JSON representation of the error */
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
//# sourceMappingURL=types.js.map