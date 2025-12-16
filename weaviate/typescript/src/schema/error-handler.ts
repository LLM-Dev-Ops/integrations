/**
 * Schema Error Handler
 *
 * Error handling utilities for schema operations, including cache invalidation
 * on schema-related errors and retry logic with schema refresh.
 *
 * @module @weaviate/schema/error-handler
 */

import type { SchemaCache } from './cache.js';
import { WeaviateError } from '../errors/base.js';
import {
  ClassNotFoundError,
  InvalidObjectError,
  InvalidFilterError,
} from '../errors/types.js';

/**
 * Handle schema-related errors
 *
 * Processes errors from schema operations and re-throws them with additional
 * context. Optionally invalidates cache for the affected class.
 *
 * @param error - The error to handle
 * @param className - Optional class name for context
 * @returns Never (always throws)
 * @throws {WeaviateError} Re-throws the error with additional context
 *
 * @example
 * ```typescript
 * try {
 *   const response = await transport.get(`/v1/schema/${className}`);
 *   return parseClassDefinition(response.body);
 * } catch (error) {
 *   handleSchemaError(error as WeaviateError, className);
 * }
 * ```
 */
export function handleSchemaError(
  error: WeaviateError,
  className?: string
): never {
  // Add class name context if available and not already present
  if (className && error.details && !error.details.className) {
    error.details.className = className;
  }

  // Re-throw with context
  throw error;
}

/**
 * Check if an error is schema-related
 *
 * Examines the error message to determine if it's related to schema issues
 * (class, property, or schema structure problems).
 *
 * @param error - Error to check
 * @returns True if the error is schema-related
 *
 * @example
 * ```typescript
 * try {
 *   await createObject(client, className, properties);
 * } catch (error) {
 *   if (isSchemaError(error as WeaviateError)) {
 *     console.log('Schema issue detected - may need to refresh cache');
 *     schemaCache.invalidate(className);
 *   }
 * }
 * ```
 */
export function isSchemaError(error: WeaviateError): boolean {
  const message = error.message.toLowerCase();

  // Check for schema-related keywords
  const schemaKeywords = [
    'property',
    'class',
    'schema',
    'data type',
    'datatype',
    'vectorizer',
    'index',
    'not found',
  ];

  return schemaKeywords.some((keyword) => message.includes(keyword));
}

/**
 * Execute operation with schema refresh on error
 *
 * Wraps an operation and automatically invalidates the schema cache if a
 * schema-related error occurs, then retries the operation once.
 *
 * This is useful for operations that depend on cached schema information
 * and may fail if the schema has been modified externally.
 *
 * @param cache - Schema cache instance
 * @param className - Class name to refresh if needed
 * @param operation - Async operation to execute
 * @returns Promise resolving to operation result
 * @throws {WeaviateError} If operation fails after retry
 *
 * @example
 * ```typescript
 * // Validate object against schema with automatic retry on schema changes
 * const result = await withSchemaRefresh(
 *   schemaCache,
 *   'Article',
 *   async () => {
 *     const classDef = await schemaCache.getClass('Article');
 *     return validateObject(object, classDef);
 *   }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Create object with automatic schema refresh on validation errors
 * const object = await withSchemaRefresh(
 *   schemaCache,
 *   'Article',
 *   async () => {
 *     // Get schema for validation
 *     const schema = await schemaCache.getClass('Article');
 *
 *     // Validate properties
 *     validateProperties(properties, schema);
 *
 *     // Create object
 *     return await transport.post('/v1/objects', {
 *       class: 'Article',
 *       properties,
 *     });
 *   }
 * );
 * ```
 */
export async function withSchemaRefresh<T>(
  cache: SchemaCache,
  className: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    // Try operation first
    return await operation();
  } catch (error) {
    // Check if error is schema-related
    if (error instanceof WeaviateError && isSchemaError(error)) {
      // Invalidate cache for this class
      cache.invalidate(className);

      // Retry operation once with fresh schema
      try {
        return await operation();
      } catch (retryError) {
        // Re-throw the retry error
        throw retryError;
      }
    }

    // Not a schema error, or retry failed - re-throw
    throw error;
  }
}

/**
 * Invalidate cache on specific error types
 *
 * Checks if an error indicates stale schema information and invalidates
 * the cache accordingly.
 *
 * @param cache - Schema cache instance
 * @param error - Error that occurred
 * @param className - Optional class name to invalidate
 *
 * @example
 * ```typescript
 * try {
 *   await createObject(client, className, properties);
 * } catch (error) {
 *   invalidateCacheOnError(schemaCache, error as WeaviateError, className);
 *   throw error;
 * }
 * ```
 */
export function invalidateCacheOnError(
  cache: SchemaCache,
  error: WeaviateError,
  className?: string
): void {
  // Invalidate on class not found (class was deleted)
  if (error instanceof ClassNotFoundError) {
    if (className) {
      cache.invalidate(className);
    }
    return;
  }

  // Invalidate on property errors (schema changed)
  if (error instanceof InvalidObjectError) {
    if (className && isPropertyError(error)) {
      cache.invalidate(className);
    }
    return;
  }

  // Invalidate on filter errors related to properties
  if (error instanceof InvalidFilterError) {
    if (className && isPropertyError(error)) {
      cache.invalidate(className);
    }
    return;
  }

  // For other schema errors, invalidate if we have a class name
  if (className && isSchemaError(error)) {
    cache.invalidate(className);
  }
}

/**
 * Check if error is related to property validation
 *
 * @param error - Error to check
 * @returns True if error is property-related
 */
function isPropertyError(error: WeaviateError): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('property') ||
    message.includes('field') ||
    message.includes('data type') ||
    message.includes('datatype')
  );
}

/**
 * Extract class name from schema error message
 *
 * Attempts to parse the class name from error messages that mention classes.
 *
 * @param error - Error to parse
 * @returns Extracted class name, or null if not found
 *
 * @example
 * ```typescript
 * const error = new ClassNotFoundError('Article');
 * const className = extractClassNameFromError(error);
 * console.log(className); // 'Article'
 * ```
 */
export function extractClassNameFromError(error: WeaviateError): string | null {
  // Check error details first
  if (error.details?.className && typeof error.details.className === 'string') {
    return error.details.className;
  }

  // Try to extract from message
  const message = error.message;

  // Pattern: "class 'ClassName' ..."
  let match = message.match(/class\s+['"]?(\w+)['"]?/i);
  if (match) {
    return match[1];
  }

  // Pattern: "Class ClassName ..."
  match = message.match(/Class\s+(\w+)/);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Create a schema validation error with helpful context
 *
 * Constructs a detailed error message for schema validation failures.
 *
 * @param className - Class name
 * @param propertyName - Property name that failed validation
 * @param expectedType - Expected data type
 * @param actualType - Actual data type received
 * @returns InvalidObjectError with detailed message
 *
 * @example
 * ```typescript
 * if (typeof value !== 'string') {
 *   throw createSchemaValidationError(
 *     'Article',
 *     'title',
 *     'text',
 *     typeof value
 *   );
 * }
 * ```
 */
export function createSchemaValidationError(
  className: string,
  propertyName: string,
  expectedType: string,
  actualType: string
): InvalidObjectError {
  const message = `Property '${propertyName}' in class '${className}' ` +
    `expected type '${expectedType}' but received '${actualType}'`;

  return new InvalidObjectError(message, {
    className,
    propertyName,
    expectedType,
    actualType,
  });
}

/**
 * Batch invalidate cache for multiple classes
 *
 * Invalidates cache entries for multiple classes at once.
 *
 * @param cache - Schema cache instance
 * @param classNames - Array of class names to invalidate
 *
 * @example
 * ```typescript
 * // After bulk schema operations
 * batchInvalidateCache(schemaCache, ['Article', 'Author', 'Category']);
 * ```
 */
export function batchInvalidateCache(
  cache: SchemaCache,
  classNames: string[]
): void {
  for (const className of classNames) {
    cache.invalidate(className);
  }
}

/**
 * Conditionally invalidate cache based on error
 *
 * Intelligently decides whether to invalidate cache based on error type
 * and content, then invalidates if appropriate.
 *
 * @param cache - Schema cache instance
 * @param error - Error that occurred
 * @param className - Optional class name
 * @returns True if cache was invalidated
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (error) {
 *   const invalidated = conditionallyInvalidateCache(
 *     schemaCache,
 *     error as WeaviateError,
 *     'Article'
 *   );
 *
 *   if (invalidated) {
 *     console.log('Cache invalidated due to schema error');
 *   }
 *
 *   throw error;
 * }
 * ```
 */
export function conditionallyInvalidateCache(
  cache: SchemaCache,
  error: WeaviateError,
  className?: string
): boolean {
  // Only invalidate for schema-related errors
  if (!isSchemaError(error)) {
    return false;
  }

  // Try to extract class name from error if not provided
  const targetClassName = className ?? extractClassNameFromError(error);

  if (targetClassName) {
    cache.invalidate(targetClassName);
    return true;
  }

  // If we can't determine class name but it's a schema error,
  // invalidate all to be safe
  cache.invalidateAll();
  return true;
}
