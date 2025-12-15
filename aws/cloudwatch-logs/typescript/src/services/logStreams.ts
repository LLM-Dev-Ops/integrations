/**
 * Log Streams Service
 *
 * Service for managing AWS CloudWatch Logs log streams.
 * Provides operations for creating, deleting, describing, and listing log streams.
 *
 * @module services/logStreams
 */

import type {
  CreateLogStreamRequest,
  DeleteLogStreamRequest,
  DescribeLogStreamsRequest,
} from '../types/requests.js';
import type {
  DescribeLogStreamsResponse,
  LogStream,
} from '../types/index.js';
import { CloudWatchLogsError, mapHttpError } from '../error/index.js';
import type { CloudWatchLogsConfig } from '../config/index.js';
import type { AwsCredentials } from '../credentials/types.js';

/**
 * Log Streams Service interface.
 *
 * Provides operations for managing log streams within log groups.
 */
export interface LogStreamsService {
  /**
   * Create a new log stream.
   *
   * @param logGroupName - Name of the parent log group
   * @param logStreamName - Name of the log stream to create
   * @throws {CloudWatchLogsError} If creation fails (e.g., stream already exists)
   *
   * @example
   * ```typescript
   * await service.create('/aws/lambda/my-function', '2024/01/15/[$LATEST]abc123');
   * ```
   */
  create(logGroupName: string, logStreamName: string): Promise<void>;

  /**
   * Delete a log stream.
   *
   * Permanently deletes a log stream and all its log events.
   *
   * @param logGroupName - Name of the parent log group
   * @param logStreamName - Name of the log stream to delete
   * @throws {CloudWatchLogsError} If deletion fails (e.g., stream not found)
   *
   * @example
   * ```typescript
   * await service.delete('/aws/lambda/my-function', '2024/01/15/[$LATEST]abc123');
   * ```
   */
  delete(logGroupName: string, logStreamName: string): Promise<void>;

  /**
   * Describe log streams.
   *
   * Lists log streams within a log group matching the given criteria.
   * Supports filtering, ordering, and pagination.
   *
   * @param request - Describe request parameters with filters and pagination
   * @returns Response containing matching log streams and pagination token
   *
   * @example
   * ```typescript
   * const response = await service.describe({
   *   logGroupName: '/aws/lambda/my-function',
   *   logStreamNamePrefix: '2024/01/',
   *   orderBy: 'LastEventTime',
   *   descending: true,
   *   limit: 50
   * });
   * ```
   */
  describe(request: DescribeLogStreamsRequest): Promise<DescribeLogStreamsResponse>;

  /**
   * List all log streams with automatic pagination.
   *
   * Returns an async iterable that automatically handles pagination,
   * allowing you to iterate through all matching log streams.
   *
   * @param logGroupName - Name of the parent log group
   * @param prefix - Optional prefix to filter log stream names
   * @returns Async iterable of log streams
   *
   * @example
   * ```typescript
   * for await (const stream of service.listAll('/aws/lambda/my-function', '2024/01/')) {
   *   console.log(stream.logStreamName);
   * }
   * ```
   */
  listAll(logGroupName: string, prefix?: string): AsyncIterable<LogStream>;

  /**
   * Ensure a log stream exists, creating it if necessary.
   *
   * This is a convenience method that attempts to create the log stream
   * and ignores ResourceAlreadyExists errors.
   *
   * @param logGroupName - Name of the parent log group
   * @param logStreamName - Name of the log stream
   * @throws {CloudWatchLogsError} If operation fails (except for already exists)
   *
   * @example
   * ```typescript
   * // Safe to call multiple times - won't fail if stream already exists
   * await service.ensureExists('/aws/lambda/my-function', '2024/01/15/[$LATEST]abc123');
   * ```
   */
  ensureExists(logGroupName: string, logStreamName: string): Promise<void>;
}

/**
 * Default implementation of LogStreamsService.
 *
 * Makes direct API calls to AWS CloudWatch Logs for log stream operations.
 */
export class DefaultLogStreamsService implements LogStreamsService {
  private readonly config: CloudWatchLogsConfig;
  private readonly getCredentials: () => Promise<AwsCredentials>;

  /**
   * Create a new log streams service.
   *
   * @param config - CloudWatch Logs configuration
   * @param getCredentials - Function to retrieve current credentials
   */
  constructor(
    config: CloudWatchLogsConfig,
    getCredentials: () => Promise<AwsCredentials>
  ) {
    this.config = config;
    this.getCredentials = getCredentials;
  }

  async create(logGroupName: string, logStreamName: string): Promise<void> {
    await this.makeRequest('CreateLogStream', {
      logGroupName,
      logStreamName,
    } as CreateLogStreamRequest);
  }

  async delete(logGroupName: string, logStreamName: string): Promise<void> {
    await this.makeRequest('DeleteLogStream', {
      logGroupName,
      logStreamName,
    } as DeleteLogStreamRequest);
  }

  async describe(request: DescribeLogStreamsRequest): Promise<DescribeLogStreamsResponse> {
    return await this.makeRequest<DescribeLogStreamsResponse>(
      'DescribeLogStreams',
      request
    );
  }

  async *listAll(logGroupName: string, prefix?: string): AsyncIterable<LogStream> {
    let nextToken: string | undefined;

    do {
      const request: DescribeLogStreamsRequest = {
        logGroupName,
        ...(prefix && { logStreamNamePrefix: prefix }),
        ...(nextToken && { nextToken }),
      };

      const response = await this.describe(request);

      if (response.logStreams) {
        for (const logStream of response.logStreams) {
          yield logStream;
        }
      }

      nextToken = response.nextToken;
    } while (nextToken);
  }

  async ensureExists(logGroupName: string, logStreamName: string): Promise<void> {
    try {
      await this.create(logGroupName, logStreamName);
    } catch (error) {
      // Ignore ResourceAlreadyExists errors - stream already exists, which is what we want
      if (
        error instanceof CloudWatchLogsError &&
        error.code === 'RESOURCE_EXISTS'
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Make an API request to CloudWatch Logs.
   *
   * @template T - Response type
   * @param action - CloudWatch Logs API action name
   * @param body - Request body
   * @returns Parsed response
   * @throws {CloudWatchLogsError} On API or network errors
   * @private
   */
  private async makeRequest<T = void>(action: string, body?: unknown): Promise<T> {
    const endpoint = this.config.endpoint ?? `https://logs.${this.config.region}.amazonaws.com`;
    const url = `${endpoint}/`;

    // Get fresh credentials
    const credentials = await this.getCredentials();

    // Prepare request body
    const bodyString = body ? JSON.stringify(body) : '{}';

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `Logs_20140328.${action}`,
      'Content-Length': String(Buffer.byteLength(bodyString, 'utf8')),
    };

    // Sign the request using AWS Signature V4
    const signedHeaders = await this.signRequest(
      url,
      'POST',
      headers,
      bodyString,
      credentials
    );

    // Make the HTTP request
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout ?? 30000
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Extract request ID from headers
      const requestId =
        response.headers.get('x-amzn-requestid') ??
        response.headers.get('x-amz-request-id') ??
        undefined;

      // Read response body
      const responseBody = await response.text();

      // Handle error responses
      if (!response.ok) {
        throw mapHttpError(response.status, responseBody, requestId);
      }

      // Handle empty responses
      if (!responseBody || responseBody.trim() === '') {
        return {} as T;
      }

      // Parse JSON response
      try {
        return JSON.parse(responseBody) as T;
      } catch (error) {
        throw new CloudWatchLogsError(
          `Failed to parse response: ${error}`,
          'AWS_API',
          false,
          requestId
        );
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof CloudWatchLogsError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CloudWatchLogsError('Request timeout', 'TIMEOUT', true);
      }

      // Handle network errors
      throw new CloudWatchLogsError(
        `Network error: ${error}`,
        'TRANSPORT',
        true
      );
    }
  }

  /**
   * Sign an AWS request using Signature V4.
   *
   * This is a simplified implementation. In production, you would use
   * a complete AWS SigV4 signing implementation from the signing module.
   *
   * @param url - Request URL
   * @param method - HTTP method
   * @param headers - Request headers
   * @param body - Request body
   * @param credentials - AWS credentials
   * @returns Signed headers
   * @private
   */
  private async signRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    credentials: AwsCredentials
  ): Promise<Record<string, string>> {
    // Note: This is a placeholder. In a complete implementation,
    // you would import and use the AWS Signature V4 signing logic
    // from the signing module (e.g., from '../signing/index.js').
    //
    // For now, we'll add the necessary AWS auth headers manually.
    // This assumes a signing function will be implemented separately.

    const signedHeaders = { ...headers };

    // Add AWS authentication headers
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    signedHeaders['X-Amz-Date'] = date;

    if (credentials.sessionToken) {
      signedHeaders['X-Amz-Security-Token'] = credentials.sessionToken;
    }

    // TODO: Implement full AWS Signature V4 signing
    // This would typically involve:
    // 1. Creating canonical request
    // 2. Creating string to sign
    // 3. Calculating signature
    // 4. Adding Authorization header
    //
    // For now, return headers with placeholder authorization
    // This will need to be replaced with actual signing logic
    const credential = `${credentials.accessKeyId}/${date.slice(0, 8)}/${this.config.region}/logs/aws4_request`;
    signedHeaders['Authorization'] = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=placeholder`;

    return signedHeaders;
  }
}
