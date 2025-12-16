/**
 * Error handling module for Weaviate TypeScript integration
 *
 * This module provides a comprehensive error taxonomy for handling various
 * error conditions that can occur when interacting with Weaviate, including:
 *
 * - Configuration errors (invalid setup)
 * - Authentication and authorization errors (401, 403)
 * - Not found errors (404) for objects, classes, and tenants
 * - Validation errors (422) for objects, filters, and vectors
 * - Rate limiting (429)
 * - Network errors (timeouts, connection failures)
 * - Server errors (500, 503)
 * - Batch operation errors (partial failures)
 * - GraphQL query errors
 * - Tenant-specific errors
 *
 * @module errors
 */

// Base error class and utilities
export {
  WeaviateError,
  type ErrorCategory,
  isWeaviateError,
  isRetryableError,
  isErrorCategory,
  getRetryAfter,
} from './base.js';

// Specific error types
export {
  // Configuration
  ConfigurationError,

  // Authentication & Authorization
  AuthenticationError,
  UnauthorizedError,
  ForbiddenError,

  // Not Found (404)
  ObjectNotFoundError,
  ClassNotFoundError,
  TenantNotFoundError,

  // Validation (422)
  InvalidObjectError,
  InvalidFilterError,
  InvalidVectorError,

  // Rate Limiting
  RateLimitedError,

  // Server Errors
  ServiceUnavailableError,
  InternalError,

  // Network Errors
  TimeoutError,
  ConnectionError,
  NetworkError,

  // Batch Errors
  BatchPartialFailureError,
  type BatchErrorDetail,

  // GraphQL Errors
  GraphQLError,
  type GraphQLErrorDetail,

  // Tenant Errors
  TenantNotActiveError,

  // Type guards
  isConfigurationError,
  isAuthenticationError,
  isBatchPartialFailureError,
  isGraphQLError,
  isNotFoundError,
  isValidationError,
  isNetworkError,
} from './types.js';

// Error mapping utilities
export {
  type HttpErrorResponse,
  mapHttpError,
  mapGraphQLErrors,
  mapNetworkError,
  mapToWeaviateError,
  extractGraphQLErrors,
  handleGraphQLResponse,
  parseApiError,
} from './mapper.js';
