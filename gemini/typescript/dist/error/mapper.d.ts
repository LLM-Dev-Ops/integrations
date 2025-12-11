/**
 * Error mapping utilities for converting HTTP status codes and API errors
 * to appropriate GeminiError instances.
 */
import { GeminiError } from './types.js';
/**
 * Maps HTTP status code to appropriate GeminiError
 */
export declare function mapHttpStatusToError(status: number, message: string, retryAfter?: number): GeminiError;
/**
 * Maps API error response to GeminiError
 */
export declare function mapApiErrorToGeminiError(error: {
    status?: number;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
}): GeminiError;
/**
 * Extracts retry-after value from response headers
 */
export declare function extractRetryAfter(headers: Record<string, string>): number | undefined;
//# sourceMappingURL=mapper.d.ts.map