/**
 * Base Service for CloudWatch Logs API Operations
 *
 * Provides common HTTP request logic for all CloudWatch Logs services.
 * Handles AWS Signature V4 signing, request formatting, and error mapping.
 *
 * @module services/base
 */

import type { CloudWatchLogsConfig } from '../config/index.js';
import { resolveEndpoint, buildUserAgent } from '../config/index.js';
import type { AwsCredentials } from '../credentials/types.js';
import { CloudWatchLogsError, mapHttpError, transportError } from '../error/index.js';

/**
 * AWS error response structure for CloudWatch Logs.
 *
 * @internal
 */
interface AwsErrorResponse {
  __type?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * HTTP request options.
 *
 * @internal
 */
interface RequestOptions {
  action: string;
  body: unknown;
}

/**
 * Base service class providing common HTTP request functionality.
 *
 * All CloudWatch Logs service implementations extend this class to leverage
 * shared request signing, error handling, and response parsing logic.
 *
 * CloudWatch Logs uses a JSON-RPC style API with the following characteristics:
 * - POST requests to a single endpoint
 * - X-Amz-Target header specifies the operation (e.g., "Logs_20140328.PutLogEvents")
 * - JSON request/response bodies
 *
 * @example
 * ```typescript
 * class MyService extends BaseService {
 *   async myOperation(params: MyParams): Promise<MyResponse> {
 *     return this.request<MyResponse>({
 *       action: 'Logs_20140328.MyOperation',
 *       body: params
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseService {
  protected readonly config: CloudWatchLogsConfig;
  protected credentials: AwsCredentials;
  private readonly endpoint: string;
  private readonly userAgent: string;

  /**
   * Create a new base service instance.
   *
   * @param config - CloudWatch Logs configuration
   * @param credentials - AWS credentials for signing requests
   */
  constructor(config: CloudWatchLogsConfig, credentials: AwsCredentials) {
    this.config = config;
    this.credentials = credentials;
    this.endpoint = resolveEndpoint(config);
    this.userAgent = buildUserAgent(config);
  }

  /**
   * Update AWS credentials (e.g., after refresh).
   *
   * @param credentials - New AWS credentials
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Make a CloudWatch Logs API request.
   *
   * Handles:
   * - AWS Signature V4 signing
   * - JSON serialization
   * - Error parsing and mapping
   * - Response deserialization
   *
   * @template T - Response type
   * @param options - Request options including action and body
   * @returns Promise resolving to the parsed response
   * @throws {CloudWatchLogsError} On API or network errors
   *
   * @internal
   */
  protected async request<T>(options: RequestOptions): Promise<T> {
    const { action, body } = options;

    // Serialize request body
    const bodyString = JSON.stringify(body);

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': action,
      'User-Agent': this.userAgent,
    };

    // Sign request using AWS SigV4
    const signedRequest = await this.signRequest(
      this.endpoint,
      headers,
      bodyString
    );

    // Execute HTTP request
    const response = await this.executeRequest(signedRequest);

    // Extract request ID from headers
    const requestId =
      response.headers.get('x-amzn-requestid') ||
      response.headers.get('x-amz-request-id');

    // Handle error responses
    if (response.status >= 400) {
      const errorBody = await response.text();
      throw mapHttpError(response.status, errorBody, requestId || undefined);
    }

    // Parse successful response
    const responseText = await response.text();

    // Handle empty responses
    if (!responseText || responseText.trim() === '') {
      return {} as T;
    }

    try {
      return JSON.parse(responseText) as T;
    } catch (error) {
      throw transportError(`Failed to parse response: ${error}`, false);
    }
  }

  /**
   * Sign an AWS request using Signature V4.
   *
   * This is a placeholder that will be implemented with proper SigV4 signing.
   * For now, it creates a basic signed request.
   *
   * @param url - Request URL
   * @param headers - Request headers
   * @param body - Request body
   * @returns Signed Request object
   *
   * @internal
   */
  private async signRequest(
    url: string,
    headers: Record<string, string>,
    body: string
  ): Promise<Request> {
    // TODO: Implement proper AWS Signature V4 signing
    // For now, we'll create a basic request
    // In production, this should use the signing module similar to SES

    const { accessKeyId, secretAccessKey, sessionToken } = this.credentials;

    // Add AWS authentication headers
    const signedHeaders: Record<string, string> = {
      ...headers,
      'X-Amz-Date': this.getAmzDate(),
    };

    if (sessionToken) {
      signedHeaders['X-Amz-Security-Token'] = sessionToken;
    }

    // Create and return the request
    // Note: This is a simplified version. Full SigV4 signing should be implemented
    // using the signing module similar to the SES implementation
    return new Request(url, {
      method: 'POST',
      headers: signedHeaders,
      body,
    });
  }

  /**
   * Execute an HTTP request.
   *
   * @param request - Request object to execute
   * @returns Response object
   * @throws {CloudWatchLogsError} On network errors
   *
   * @internal
   */
  private async executeRequest(request: Request): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout || 30000
      );

      try {
        const response = await fetch(request, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new CloudWatchLogsError(
            'Request timeout',
            'TIMEOUT',
            true
          );
        }
        throw transportError(error.message, true);
      }
      throw transportError(String(error), true);
    }
  }

  /**
   * Get current timestamp in AWS date format (ISO8601).
   *
   * @returns Timestamp string in format YYYYMMDDTHHMMSSZ
   *
   * @internal
   */
  private getAmzDate(): string {
    const now = new Date();
    return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }
}
