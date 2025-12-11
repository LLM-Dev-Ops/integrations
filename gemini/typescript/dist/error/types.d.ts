/**
 * Base error class for all Gemini API errors.
 */
export declare class GeminiError extends Error {
    /** The type/category of error */
    readonly type: string;
    /** HTTP status code if applicable */
    readonly status?: number;
    /** Seconds to wait before retrying */
    readonly retryAfter?: number;
    /** Whether this error can be retried */
    readonly isRetryable: boolean;
    /** Additional error details */
    readonly details?: Record<string, unknown>;
    constructor(options: {
        type: string;
        message: string;
        status?: number;
        retryAfter?: number;
        isRetryable?: boolean;
        details?: Record<string, unknown>;
    });
    /** Returns JSON representation of the error */
    toJSON(): Record<string, unknown>;
}
/**
 * Result type for operations that may fail
 */
export type GeminiResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: GeminiError;
};
//# sourceMappingURL=types.d.ts.map