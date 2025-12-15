/**
 * HTTP module for AWS CloudWatch Logs API communication.
 *
 * This module provides a comprehensive HTTP client implementation for communicating
 * with the AWS CloudWatch Logs JSON-RPC API. It includes:
 *
 * - **Transport Layer**: Pluggable transport implementations (Fetch API by default)
 * - **HTTP Client**: High-level client with request signing, retry logic, and rate limiting
 * - **Request/Response**: Type-safe request building and response parsing
 * - **Error Handling**: Comprehensive error parsing and retry logic
 *
 * ## Architecture
 *
 * ```text
 * ┌──────────────────────────────┐
 * │ CloudWatchLogsHttpClient     │  - High-level client
 * │                              │  - Request signing (SigV4)
 * │                              │  - Retry logic
 * │                              │  - Rate limiting
 * └──────────────┬───────────────┘
 *                │
 *                ▼
 * ┌──────────────────────────────┐
 * │ CloudWatchLogsRequest        │  - JSON-RPC request building
 * │                              │  - X-Amz-Target header
 * │                              │  - Content-Type header
 * └──────────────┬───────────────┘
 *                │
 *                ▼
 * ┌──────────────────────────────┐
 * │ Transport (FetchTransport)   │  - HTTP transport abstraction
 * │                              │  - Fetch API
 * │                              │  - Timeout handling
 * └──────────────┬───────────────┘
 *                │
 *                ▼
 * ┌──────────────────────────────┐
 * │ CloudWatch Logs API          │  - AWS Service
 * └──────────────────────────────┘
 * ```
 *
 * ## CloudWatch Logs JSON-RPC API
 *
 * CloudWatch Logs uses a JSON-RPC style API:
 * - All requests are POST to "/"
 * - Content-Type: "application/x-amz-json-1.1"
 * - X-Amz-Target: "Logs_20140328.{Operation}"
 * - Request and response bodies are JSON
 *
 * @module http
 *
 * @example Basic usage
 * ```typescript
 * import { CloudWatchLogsHttpClient } from './http';
 *
 * const client = new CloudWatchLogsHttpClient(
 *   'https://logs.us-east-1.amazonaws.com',
 *   'us-east-1',
 *   credentials
 * );
 *
 * // Make a PutLogEvents request
 * const response = await client.request('PutLogEvents', {
 *   logGroupName: 'my-log-group',
 *   logStreamName: 'my-log-stream',
 *   logEvents: [
 *     { timestamp: Date.now(), message: 'Log message' }
 *   ]
 * });
 *
 * console.log('Next sequence token:', response.nextSequenceToken);
 * ```
 *
 * @example Using request builder
 * ```typescript
 * import { CloudWatchLogsRequest } from './http';
 *
 * const request = new CloudWatchLogsRequest('CreateLogGroup')
 *   .withJsonBody({
 *     logGroupName: 'my-log-group'
 *   });
 *
 * const httpRequest = request.toHttpRequest('https://logs.us-east-1.amazonaws.com');
 * // httpRequest.headers['X-Amz-Target'] === 'Logs_20140328.CreateLogGroup'
 * ```
 *
 * @example Custom retry configuration
 * ```typescript
 * import { createCloudWatchLogsHttpClient } from './http';
 *
 * const client = createCloudWatchLogsHttpClient(
 *   'https://logs.us-east-1.amazonaws.com',
 *   'us-east-1',
 *   credentials,
 *   {
 *     timeout: 60000,      // 60 second timeout
 *     maxRetries: 5,       // Retry up to 5 times
 *     retryDelayMs: 2000   // Start with 2 second delay
 *   }
 * );
 * ```
 */

// Re-export types
export type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpClientConfig,
  AwsErrorResponse,
  RetryConfig,
} from './types';

// Re-export transport layer
export { Transport, FetchTransport, createDefaultTransport } from './transport';

// Re-export request building
export { CloudWatchLogsRequest } from './request';

// Re-export response parsing
export {
  parseResponse,
  extractNextToken,
  isSuccessResponse,
  isErrorResponse,
  parseAwsError,
  extractResponseMetadata,
} from './response';
export type { AwsErrorInfo, ResponseMetadata } from './response';

// Re-export client
export { CloudWatchLogsHttpClient, createCloudWatchLogsHttpClient } from './client';
