/**
 * CloudWatch Logs HTTP Client
 *
 * Provides a high-level HTTP client for AWS CloudWatch Logs JSON-RPC API.
 * Handles request signing, retries with exponential backoff, rate limiting,
 * and error mapping.
 *
 * @module http/client
 */

import type { HttpRequest, HttpResponse, HttpClientConfig, RetryConfig } from './types';
import { Transport, FetchTransport } from './transport';
import { signRequest, type AwsCredentials, type SignedRequest } from '../signing';
import { parseAwsError, isSuccessResponse, parseResponse } from './response';

/**
 * CloudWatch Logs HTTP Client for making authenticated API requests.
 *
 * This client handles:
 * - AWS Signature V4 request signing with service="logs"
 * - JSON-RPC style requests (POST to "/" with X-Amz-Target header)
 * - Retry logic with exponential backoff
 * - Rate limit handling
 * - Error parsing and mapping
 *
 * @example
 * ```typescript
 * const client = new CloudWatchLogsHttpClient(
 *   'https://logs.us-east-1.amazonaws.com',
 *   'us-east-1',
 *   credentials,
 *   transport
 * );
 *
 * // Make a request
 * const response = await client.request<PutLogEventsResponse>(
 *   'PutLogEvents',
 *   {
 *     logGroupName: 'my-log-group',
 *     logStreamName: 'my-log-stream',
 *     logEvents: [{ timestamp: Date.now(), message: 'Hello' }]
 *   }
 * );
 * ```
 */
export class CloudWatchLogsHttpClient {
  private readonly endpoint: string;
  private readonly region: string;
  private credentials: AwsCredentials;
  private readonly transport: Transport;
  private readonly retryConfig: RetryConfig;

  /**
   * Create a new CloudWatch Logs HTTP client.
   *
   * @param endpoint - CloudWatch Logs endpoint URL (e.g., 'https://logs.us-east-1.amazonaws.com')
   * @param region - AWS region (e.g., 'us-east-1')
   * @param credentials - AWS credentials for signing
   * @param transport - HTTP transport implementation
   * @param config - Optional client configuration
   */
  constructor(
    endpoint: string,
    region: string,
    credentials: AwsCredentials,
    transport?: Transport,
    config?: HttpClientConfig
  ) {
    this.endpoint = endpoint;
    this.region = region;
    this.credentials = credentials;
    this.transport = transport ?? new FetchTransport(config);
    this.retryConfig = {
      maxRetries: config?.maxRetries ?? 3,
      initialDelayMs: config?.retryDelayMs ?? 1000,
      maxDelayMs: 30000, // 30 seconds max
      backoffMultiplier: 2,
    };
  }

  /**
   * Update credentials (e.g., after refresh).
   *
   * @param credentials - New AWS credentials
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Make a CloudWatch Logs API request.
   *
   * This method:
   * 1. Builds the JSON-RPC request with X-Amz-Target header
   * 2. Signs the request using AWS SigV4 with service="logs"
   * 3. Sends the request with retry logic
   * 4. Parses and returns the response
   *
   * @template T - Response type
   * @param operation - CloudWatch Logs operation name (e.g., 'PutLogEvents')
   * @param body - Request body object
   * @returns Promise resolving to the parsed response
   * @throws Error on API or network errors
   *
   * @example
   * ```typescript
   * const response = await client.request<PutLogEventsResponse>(
   *   'PutLogEvents',
   *   {
   *     logGroupName: 'my-log-group',
   *     logStreamName: 'my-log-stream',
   *     logEvents: [
   *       { timestamp: Date.now(), message: 'Log message' }
   *     ]
   *   }
   * );
   * console.log('Next sequence token:', response.nextSequenceToken);
   * ```
   */
  async request<T>(operation: string, body?: unknown): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Build the HTTP request
        const httpRequest = this.buildRequest(operation, body);

        // Sign the request
        const signedRequest = await this.signRequest(httpRequest);

        // Send the request
        const response = await this.sendRequest(signedRequest);

        // Handle successful response
        if (isSuccessResponse(response)) {
          return this.parseSuccessResponse<T>(response);
        }

        // Parse error response
        const errorInfo = parseAwsError(response);

        // If not retryable, throw immediately
        if (!errorInfo.retryable || attempt >= this.retryConfig.maxRetries) {
          throw this.createError(errorInfo);
        }

        // Calculate retry delay with exponential backoff
        const delay = this.calculateRetryDelay(attempt, errorInfo);
        lastError = this.createError(errorInfo);

        // Wait before retrying
        await this.sleep(delay);

      } catch (error) {
        // If it's our error, save it and potentially retry
        if (error instanceof Error) {
          lastError = error;

          // Network errors are retryable
          if (this.isNetworkError(error) && attempt < this.retryConfig.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            await this.sleep(delay);
            continue;
          }
        }

        // Non-retryable error or max retries reached
        throw error;
      }
    }

    // Max retries reached
    throw lastError ?? new Error('Request failed after maximum retries');
  }

  /**
   * Build an HTTP request for a CloudWatch Logs operation.
   *
   * @param operation - Operation name
   * @param body - Request body
   * @returns HTTP request
   * @private
   */
  private buildRequest(operation: string, body?: unknown): HttpRequest {
    return {
      method: 'POST',
      path: '/',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `Logs_20140328.${operation}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
  }

  /**
   * Sign an HTTP request using AWS SigV4.
   *
   * @param request - HTTP request to sign
   * @returns Signed request
   * @private
   */
  private async signRequest(request: HttpRequest): Promise<SignedRequest> {
    // Build full URL
    const url = new URL(request.path, this.endpoint);

    // Create a Request object for signing
    const fetchRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Sign the request
    return signRequest(fetchRequest, {
      region: this.region,
      service: 'logs',
      credentials: this.credentials,
    });
  }

  /**
   * Send a signed request.
   *
   * @param signedRequest - Signed request to send
   * @returns HTTP response
   * @private
   */
  private async sendRequest(signedRequest: SignedRequest): Promise<HttpResponse> {
    const httpRequest: HttpRequest = {
      method: signedRequest.method as 'POST',
      path: '/',
      headers: signedRequest.headers,
      body: signedRequest.body,
    };

    return this.transport.send(httpRequest, this.endpoint);
  }

  /**
   * Parse a successful response.
   *
   * @template T - Response type
   * @param response - HTTP response
   * @returns Parsed response
   * @private
   */
  private parseSuccessResponse<T>(response: HttpResponse): T {
    // Handle empty responses
    if (!response.body || response.body.trim() === '') {
      return {} as T;
    }

    // Parse JSON response
    return parseResponse<T>(response.body);
  }

  /**
   * Create an error from AWS error info.
   *
   * @param errorInfo - Error information
   * @returns Error object
   * @private
   */
  private createError(errorInfo: {
    type: string;
    message: string;
    statusCode: number;
    requestId?: string;
  }): Error {
    const error = new Error(
      `CloudWatch Logs API error: ${errorInfo.type}: ${errorInfo.message}`
    );
    (error as any).type = errorInfo.type;
    (error as any).statusCode = errorInfo.statusCode;
    (error as any).requestId = errorInfo.requestId;
    return error;
  }

  /**
   * Calculate retry delay with exponential backoff.
   *
   * @param attempt - Current attempt number (0-indexed)
   * @param errorInfo - Optional error information (may contain Retry-After)
   * @returns Delay in milliseconds
   * @private
   */
  private calculateRetryDelay(
    attempt: number,
    errorInfo?: { retryAfter?: number }
  ): number {
    // If server specified retry-after, use that
    if (errorInfo?.retryAfter) {
      return errorInfo.retryAfter * 1000; // Convert seconds to ms
    }

    // Exponential backoff: initialDelay * (multiplier ^ attempt)
    const delay = this.retryConfig.initialDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attempt);

    // Add jitter (random 0-25% of delay)
    const jitter = Math.random() * 0.25 * delay;

    // Cap at max delay
    return Math.min(delay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * Sleep for a specified duration.
   *
   * @param ms - Duration in milliseconds
   * @returns Promise that resolves after the duration
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is a network error.
   *
   * @param error - Error to check
   * @returns true if it's a network error
   * @private
   */
  private isNetworkError(error: Error): boolean {
    return (
      error.message.includes('Network error') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT')
    );
  }
}

/**
 * Create a default CloudWatch Logs HTTP client.
 *
 * @param endpoint - CloudWatch Logs endpoint URL
 * @param region - AWS region
 * @param credentials - AWS credentials
 * @param config - Optional client configuration
 * @returns New CloudWatch Logs HTTP client instance
 *
 * @example
 * ```typescript
 * const client = createCloudWatchLogsHttpClient(
 *   'https://logs.us-east-1.amazonaws.com',
 *   'us-east-1',
 *   credentials,
 *   { timeout: 30000, maxRetries: 3 }
 * );
 * ```
 */
export function createCloudWatchLogsHttpClient(
  endpoint: string,
  region: string,
  credentials: AwsCredentials,
  config?: HttpClientConfig
): CloudWatchLogsHttpClient {
  const transport = new FetchTransport(config);
  return new CloudWatchLogsHttpClient(endpoint, region, credentials, transport, config);
}
