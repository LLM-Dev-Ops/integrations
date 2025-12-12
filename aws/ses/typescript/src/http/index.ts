/**
 * HTTP module for AWS SES API communication.
 *
 * This module provides a comprehensive HTTP client implementation for communicating
 * with the AWS SES v2 API. It includes:
 *
 * - **Transport Layer**: Pluggable transport implementations (Fetch API by default)
 * - **HTTP Client**: High-level client with request signing, retry logic, and rate limiting
 * - **Request/Response**: Type-safe request building and response parsing
 * - **Connection Pooling**: Efficient connection reuse with undici
 *
 * ## Architecture
 *
 * ```text
 * ┌─────────────────┐
 * │  SesHttpClient  │  - High-level client
 * │                 │  - Request signing
 * │                 │  - Retry logic
 * │                 │  - Rate limiting
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │   SesRequest    │  - Request building
 * │                 │  - Query params
 * │                 │  - Headers
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │   Transport     │  - HTTP transport abstraction
 * │                 │  - Fetch API
 * │                 │  - Connection pooling (undici)
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │   HTTP Layer    │  - Actual HTTP implementation
 * └─────────────────┘
 * ```
 *
 * @module http
 *
 * @example
 * ```typescript
 * import { SesHttpClient, SesRequest } from '@integrations/aws-ses/http';
 *
 * // Create a client
 * const client = new SesHttpClient(config, signer, rateLimiter);
 *
 * // Build a request
 * const request = SesRequest.post('/v2/email/outbound-emails', {
 *   FromEmailAddress: 'sender@example.com',
 *   Destination: {
 *     ToAddresses: ['recipient@example.com']
 *   },
 *   Content: {
 *     Simple: {
 *       Subject: { Data: 'Test Email' },
 *       Body: { Text: { Data: 'Hello, World!' } }
 *     }
 *   }
 * });
 *
 * // Send the request
 * const response = await client.request(request);
 * console.log('Message ID:', response.MessageId);
 * ```
 *
 * @example
 * ```typescript
 * // Using connection pooling for high-throughput scenarios
 * import { ConnectionPool } from '@integrations/aws-ses/http';
 *
 * const pool = new ConnectionPool('https://email.us-east-1.amazonaws.com', {
 *   maxIdlePerHost: 20,
 *   idleTimeout: 90000,
 *   maxLifetime: 300000
 * });
 *
 * try {
 *   const response = await pool.request({
 *     method: 'GET',
 *     path: '/v2/email/identities',
 *     headers: { /* signed headers *\/ }
 *   });
 *   console.log('Status:', response.status);
 * } finally {
 *   await pool.close();
 * }
 * ```
 */

// Re-export types
export type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpClientConfig,
  PoolOptions,
  PoolStats,
  AwsErrorResponse,
  PaginatedResponse,
} from './types.js';

// Re-export transport layer
export { Transport, FetchTransport, createDefaultTransport } from './transport.js';

// Re-export connection pooling
export { ConnectionPool, PoolStatistics } from './pool.js';
export type { RequestOptions } from './pool.js';

// Re-export request building
export { SesRequest } from './request.js';

// Re-export response parsing
export {
  parseResponse,
  extractNextToken,
  parsePaginatedResponse,
  isSuccessResponse,
  isErrorResponse,
  parseAwsError,
  extractResponseMetadata,
} from './response.js';
export type { AwsErrorInfo, ResponseMetadata } from './response.js';

// Re-export client
export { SesHttpClient, createSesHttpClient } from './client.js';
