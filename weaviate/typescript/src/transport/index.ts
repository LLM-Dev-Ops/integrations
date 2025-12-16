/**
 * Transport Module - Main Exports
 *
 * Provides HTTP transport functionality for the Weaviate integration,
 * including request/response handling, connection pooling, and interceptors.
 *
 * @module @llmdevops/weaviate-integration/transport
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  TransportOptions,
  RequestInit,
  HttpTransport,
} from './types';

export { ResponseType, buildUrl, encodeQueryParams } from './types';

// ============================================================================
// HTTP Transport Exports
// ============================================================================

export { BaseHttpTransport } from './http';
export {
  FetchHttpTransport,
  createFetchTransport,
  isFetchAvailable,
  isAbortControllerAvailable,
  verifyFetchSupport,
} from './fetch';

// ============================================================================
// Connection Pool Exports
// ============================================================================

export type {
  ConnectionPoolConfig,
  Connection,
  PoolStats,
} from './pool';

export { ConnectionPool, createConnectionPool } from './pool';

// ============================================================================
// Interceptor Exports
// ============================================================================

export type { RequestInterceptor, ResponseInterceptor } from './interceptors';

export {
  LoggingRequestInterceptor,
  LoggingResponseInterceptor,
  UserAgentInterceptor,
  AuthRefreshInterceptor,
  TimeoutInterceptor,
  CustomHeadersInterceptor,
  RetryAfterInterceptor,
  ResponseTimeInterceptor,
  CacheControlInterceptor,
  InterceptorChain,
  createLoggingRequestInterceptor,
  createLoggingResponseInterceptor,
  createUserAgentInterceptor,
  createAuthRefreshInterceptor,
} from './interceptors';

// ============================================================================
// Convenience Factory Functions
// ============================================================================

import type { AuthProvider } from '../auth/types';
import { FetchHttpTransport } from './fetch';
import type { TransportOptions } from './types';

/**
 * Create a default HTTP transport instance.
 *
 * This creates a FetchHttpTransport with sensible defaults:
 * - 30 second timeout
 * - Connection pooling enabled
 * - Auth header injection
 *
 * @param baseUrl - Base URL for API requests
 * @param authProvider - Authentication provider
 * @param options - Optional transport configuration
 * @returns Configured HTTP transport instance
 *
 * @example
 * ```typescript
 * import { createTransport } from '@llmdevops/weaviate-integration/transport';
 * import { createApiKeyAuth } from '@llmdevops/weaviate-integration/auth';
 *
 * const auth = createApiKeyAuth('your-api-key');
 * const transport = createTransport('http://localhost:8080', auth);
 *
 * const response = await transport.get('/v1/meta');
 * ```
 */
export function createTransport(
  baseUrl: string,
  authProvider: AuthProvider,
  options?: Partial<TransportOptions>
): FetchHttpTransport {
  const transportOptions: TransportOptions = {
    baseUrl,
    authProvider,
    timeout: options?.timeout ?? 30000,
    maxRetries: options?.maxRetries ?? 3,
    keepAliveTimeout: options?.keepAliveTimeout ?? 60000,
    maxSockets: options?.maxSockets ?? 10,
    defaultHeaders: options?.defaultHeaders,
    enableLogging: options?.enableLogging ?? false,
  };

  return new FetchHttpTransport(transportOptions);
}

/**
 * Create a transport instance with logging enabled.
 *
 * @param baseUrl - Base URL for API requests
 * @param authProvider - Authentication provider
 * @param options - Optional transport configuration
 * @returns Configured HTTP transport instance with logging
 */
export function createLoggingTransport(
  baseUrl: string,
  authProvider: AuthProvider,
  options?: Partial<TransportOptions>
): FetchHttpTransport {
  return createTransport(baseUrl, authProvider, {
    ...options,
    enableLogging: true,
  });
}

/**
 * Create a transport instance optimized for high throughput.
 *
 * @param baseUrl - Base URL for API requests
 * @param authProvider - Authentication provider
 * @param options - Optional transport configuration
 * @returns Configured HTTP transport instance
 */
export function createHighThroughputTransport(
  baseUrl: string,
  authProvider: AuthProvider,
  options?: Partial<TransportOptions>
): FetchHttpTransport {
  return createTransport(baseUrl, authProvider, {
    ...options,
    maxSockets: options?.maxSockets ?? 50,
    keepAliveTimeout: options?.keepAliveTimeout ?? 120000,
    timeout: options?.timeout ?? 60000,
  });
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  createTransport,
  createLoggingTransport,
  createHighThroughputTransport,
};
