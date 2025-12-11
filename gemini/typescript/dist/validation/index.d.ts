/**
 * Comprehensive input validation for Gemini API requests.
 *
 * This module provides strict validation at service boundaries to ensure
 * all requests meet API requirements before being sent.
 */
import type { GenerateContentRequest, EmbedContentRequest } from '../types/index.js';
/** Detailed validation error information */
export interface ValidationDetail {
    field: string;
    description: string;
    value?: unknown;
}
/** Validation result container */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationDetail[];
}
/**
 * Validates a GenerateContentRequest.
 * Throws ValidationError if validation fails.
 *
 * @param request - The request to validate
 * @throws {ValidationError} If validation fails
 */
export declare function validateGenerateContentRequest(request: GenerateContentRequest): void;
/**
 * Validates an EmbedContentRequest.
 * Throws ValidationError if validation fails.
 *
 * @param request - The request to validate
 * @throws {ValidationError} If validation fails
 */
export declare function validateEmbedContentRequest(request: EmbedContentRequest): void;
/**
 * Validates batch size.
 * Throws ValidationError if batch size exceeds maximum.
 *
 * @param items - The items array to validate
 * @param maxSize - Maximum allowed size
 * @param fieldName - Field name for error reporting
 * @throws {ValidationError} If batch size exceeds maximum
 */
export declare function validateBatchSize(items: unknown[], maxSize: number, fieldName: string): void;
/**
 * Validates a model name.
 * Throws ValidationError if model name is invalid.
 *
 * @param model - The model name to validate
 * @throws {ValidationError} If model name is invalid
 */
export declare function validateModelName(model: string): void;
//# sourceMappingURL=index.d.ts.map