/**
 * HTTP transport layer for Cloudflare R2 Storage Integration
 *
 * Provides HTTP request/response handling with support for:
 * - Buffered and streaming responses
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Proper error handling and categorization
 */

// Type exports
export type {
  HttpRequest,
  HttpResponse,
  StreamingHttpResponse,
  HttpTransport,
} from './types.js';

// Helper function exports
export {
  getHeader,
  isSuccessResponse,
  getETag,
  getContentLength,
  getContentType,
  getRequestId,
  getRetryAfter,
} from './types.js';

// Fetch transport exports
export type { FetchTransportOptions } from './fetch-transport.js';
export {
  FetchTransport,
  createFetchTransport,
  createFetchTransportWithOptions,
} from './fetch-transport.js';

// Resilient transport exports
export {
  ResilientTransport,
  createResilientTransport,
  createDefaultResilientTransport,
  createResilientTransportWithOrchestrator,
} from './resilient-transport.js';
