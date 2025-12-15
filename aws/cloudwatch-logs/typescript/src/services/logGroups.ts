/**
 * Log Groups Service
 *
 * Service for managing AWS CloudWatch Logs log groups.
 * Provides operations for creating, deleting, describing, and listing log groups.
 *
 * @module services/logGroups
 */

import type {
  CreateLogGroupRequest,
  DescribeLogGroupsRequest,
} from '../types/requests.js';
import type {
  DescribeLogGroupsResponse,
  LogGroup,
} from '../types/index.js';
import { CloudWatchLogsError, mapAwsError, mapHttpError } from '../error/index.js';
import type { CloudWatchLogsConfig } from '../config/index.js';
import type { AwsCredentials } from '../credentials/types.js';

/**
 * Log Groups Service interface.
 *
 * Provides operations for managing log groups in AWS CloudWatch Logs.
 */
export interface LogGroupsService {
  /**
   * Create a new log group.
   *
   * @param request - Create log group request parameters
   * @throws {CloudWatchLogsError} If creation fails (e.g., group already exists)
   *
   * @example
   * ```typescript
   * await service.create({
   *   logGroupName: '/aws/lambda/my-function',
   *   kmsKeyId: 'arn:aws:kms:...',
   *   tags: { Environment: 'production' }
   * });
   * ```
   */
  create(request: CreateLogGroupRequest): Promise<void>;

  /**
   * Delete a log group.
   *
   * Permanently deletes a log group and all its log streams and events.
   *
   * @param logGroupName - Name of the log group to delete
   * @throws {CloudWatchLogsError} If deletion fails (e.g., group not found)
   *
   * @example
   * ```typescript
   * await service.delete('/aws/lambda/my-function');
   * ```
   */
  delete(logGroupName: string): Promise<void>;

  /**
   * Describe log groups.
   *
   * Lists log groups matching the given criteria with pagination support.
   *
   * @param request - Describe request parameters with optional filters and pagination
   * @returns Response containing matching log groups and pagination token
   *
   * @example
   * ```typescript
   * const response = await service.describe({
   *   logGroupNamePrefix: '/aws/lambda/',
   *   limit: 50
   * });
   * ```
   */
  describe(request: DescribeLogGroupsRequest): Promise<DescribeLogGroupsResponse>;

  /**
   * List all log groups with automatic pagination.
   *
   * Returns an async iterable that automatically handles pagination,
   * allowing you to iterate through all matching log groups.
   *
   * @param prefix - Optional prefix to filter log group names
   * @returns Async iterable of log groups
   *
   * @example
   * ```typescript
   * for await (const logGroup of service.listAll('/aws/lambda/')) {
   *   console.log(logGroup.logGroupName);
   * }
   * ```
   */
  listAll(prefix?: string): AsyncIterable<LogGroup>;

  /**
   * Check if a log group exists.
   *
   * @param logGroupName - Name of the log group to check
   * @returns True if the log group exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await service.exists('/aws/lambda/my-function');
   * if (!exists) {
   *   await service.create({ logGroupName: '/aws/lambda/my-function' });
   * }
   * ```
   */
  exists(logGroupName: string): Promise<boolean>;
}

/**
 * Default implementation of LogGroupsService.
 *
 * Makes direct API calls to AWS CloudWatch Logs for log group operations.
 */
export class DefaultLogGroupsService implements LogGroupsService {
  private readonly config: CloudWatchLogsConfig;
  private readonly getCredentials: () => Promise<AwsCredentials>;

  /**
   * Create a new log groups service.
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

  async create(request: CreateLogGroupRequest): Promise<void> {
    await this.makeRequest('CreateLogGroup', request);
  }

  async delete(logGroupName: string): Promise<void> {
    await this.makeRequest('DeleteLogGroup', { logGroupName });
  }

  async describe(request: DescribeLogGroupsRequest): Promise<DescribeLogGroupsResponse> {
    return await this.makeRequest<DescribeLogGroupsResponse>(
      'DescribeLogGroups',
      request
    );
  }

  async *listAll(prefix?: string): AsyncIterable<LogGroup> {
    let nextToken: string | undefined;

    do {
      const request: DescribeLogGroupsRequest = {
        ...(prefix && { logGroupNamePrefix: prefix }),
        ...(nextToken && { nextToken }),
      };

      const response = await this.describe(request);

      if (response.logGroups) {
        for (const logGroup of response.logGroups) {
          yield logGroup;
        }
      }

      nextToken = response.nextToken;
    } while (nextToken);
  }

  async exists(logGroupName: string): Promise<boolean> {
    try {
      const response = await this.describe({
        logGroupNamePrefix: logGroupName,
        limit: 1,
      });

      return (
        response.logGroups?.some(
          (group) => group.logGroupName === logGroupName
        ) ?? false
      );
    } catch (error) {
      // If we get a resource not found error, the group doesn't exist
      if (
        error instanceof CloudWatchLogsError &&
        error.code === 'RESOURCE_NOT_FOUND'
      ) {
        return false;
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
