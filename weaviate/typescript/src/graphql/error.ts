/**
 * GraphQL error handling
 *
 * Functions to parse and handle GraphQL errors from Weaviate.
 */

import type { GraphQLError } from './types.js';
import {
  ClassNotFoundError,
  TenantNotFoundError,
  InvalidFilterError,
  InvalidObjectError,
  InvalidVectorError,
  GraphQLError as WeaviateGraphQLError,
} from '../errors/types.js';

/**
 * Handles GraphQL errors by mapping them to appropriate error types
 *
 * Analyzes error messages to determine the specific error type and throws
 * the corresponding typed error.
 *
 * @param errors - Array of GraphQL errors
 * @throws Specific WeaviateError based on error content
 *
 * @example
 * ```typescript
 * const response = await executeGraphQL(query);
 * if (response.errors) {
 *   handleGraphQLErrors(response.errors); // Throws typed error
 * }
 * ```
 */
export function handleGraphQLErrors(errors: GraphQLError[]): never {
  if (errors.length === 0) {
    throw new WeaviateGraphQLError(
      [{ message: 'Unknown GraphQL error' }],
      { errors }
    );
  }

  // Check the first error for specific patterns
  const firstError = errors[0];
  const message = firstError.message.toLowerCase();

  // Class not found
  if (
    message.includes('class') &&
    (message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('unknown class'))
  ) {
    const className = extractClassName(firstError.message);
    throw new ClassNotFoundError(className, {
      graphqlErrors: errors,
    });
  }

  // Tenant not found or not active
  if (
    message.includes('tenant') &&
    (message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('unknown tenant'))
  ) {
    const tenantName = extractTenantName(firstError.message);
    throw new TenantNotFoundError(tenantName, undefined, {
      graphqlErrors: errors,
    });
  }

  // Invalid filter
  if (
    message.includes('filter') ||
    message.includes('where') ||
    message.includes('invalid operator') ||
    message.includes('invalid path')
  ) {
    throw new InvalidFilterError(firstError.message, {
      graphqlErrors: errors,
    });
  }

  // Vector-related errors
  if (
    message.includes('vector') &&
    (message.includes('dimension') ||
      message.includes('invalid') ||
      message.includes('mismatch'))
  ) {
    throw new InvalidVectorError(firstError.message, {
      graphqlErrors: errors,
    });
  }

  // Property validation errors
  if (
    message.includes('property') &&
    (message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('invalid'))
  ) {
    throw new InvalidObjectError(firstError.message, {
      graphqlErrors: errors,
    });
  }

  // Generic GraphQL error
  throw new WeaviateGraphQLError(errors, { errors });
}

/**
 * Extracts class name from error message
 *
 * Attempts to parse the class name from common error message patterns.
 */
function extractClassName(message: string): string {
  // Pattern: "class 'ClassName' not found"
  let match = message.match(/class\s+['"]?(\w+)['"]?\s+(?:not found|does not exist)/i);
  if (match) {
    return match[1];
  }

  // Pattern: "unknown class: ClassName"
  match = message.match(/unknown class:\s*(\w+)/i);
  if (match) {
    return match[1];
  }

  // Pattern: "ClassName not found"
  match = message.match(/(\w+)\s+not found/i);
  if (match) {
    return match[1];
  }

  return 'unknown';
}

/**
 * Extracts tenant name from error message
 *
 * Attempts to parse the tenant name from common error message patterns.
 */
function extractTenantName(message: string): string {
  // Pattern: "tenant 'TenantName' not found"
  let match = message.match(/tenant\s+['"]?(\w+)['"]?\s+(?:not found|does not exist)/i);
  if (match) {
    return match[1];
  }

  // Pattern: "unknown tenant: TenantName"
  match = message.match(/unknown tenant:\s*(\w+)/i);
  if (match) {
    return match[1];
  }

  return 'unknown';
}

/**
 * Checks if an error message indicates a retryable error
 *
 * Some GraphQL errors may be transient and worth retrying.
 *
 * @param error - GraphQL error
 * @returns True if the error might be retryable
 */
export function isRetryableGraphQLError(error: GraphQLError): boolean {
  const message = error.message.toLowerCase();

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // Resource temporarily unavailable
  if (
    message.includes('temporarily unavailable') ||
    message.includes('try again')
  ) {
    return true;
  }

  // Concurrency conflicts
  if (message.includes('conflict') || message.includes('concurrent')) {
    return true;
  }

  return false;
}

/**
 * Extracts error details from GraphQL error extensions
 *
 * @param error - GraphQL error
 * @returns Error details object
 */
export function extractErrorDetails(error: GraphQLError): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: error.message,
  };

  if (error.path) {
    details.path = error.path;
  }

  if (error.locations) {
    details.locations = error.locations;
  }

  if (error.extensions) {
    details.extensions = error.extensions;
  }

  return details;
}

/**
 * Formats GraphQL errors for logging
 *
 * @param errors - Array of GraphQL errors
 * @returns Formatted error string
 */
export function formatGraphQLErrors(errors: GraphQLError[]): string {
  return errors
    .map((error, index) => {
      let formatted = `Error ${index + 1}: ${error.message}`;

      if (error.path) {
        formatted += ` (path: ${error.path.join('.')})`;
      }

      if (error.locations && error.locations.length > 0) {
        const loc = error.locations[0];
        formatted += ` (line ${loc.line}, column ${loc.column})`;
      }

      return formatted;
    })
    .join('\n');
}
