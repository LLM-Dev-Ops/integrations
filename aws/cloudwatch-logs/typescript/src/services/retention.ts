/**
 * Retention Service
 *
 * Service for managing AWS CloudWatch Logs retention policies.
 * Provides operations for setting, removing, and retrieving retention policies.
 *
 * @module services/retention
 */

import type {
  PutRetentionPolicyRequest,
  DeleteRetentionPolicyRequest,
  DescribeLogGroupsRequest,
} from '../types/requests.js';
import type { RetentionDays } from '../types/retention.js';
import type { DescribeLogGroupsResponse } from '../types/responses.js';
import { CloudWatchLogsError, mapHttpError, validationError } from '../error/index.js';
import type { CloudWatchLogsConfig } from '../config/index.js';
import type { AwsCredentials } from '../credentials/types.js';

/**
 * Valid retention periods in days.
 * These are the only values accepted by AWS CloudWatch Logs.
 */
const VALID_RETENTION_DAYS: readonly RetentionDays[] = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731,
  1096, 1827, 2192, 2557, 2922, 3288, 3653,
] as const;

/**
 * Retention Service interface.
 *
 * Provides operations for managing log retention policies on log groups.
 */
export interface RetentionService {
  /**
   * Set retention policy on a log group.
   *
   * Configures how long CloudWatch Logs retains log events in the log group.
   * After the retention period, log events are automatically deleted.
   *
   * @param logGroupName - Name of the log group
   * @param retentionDays - Retention period in days (must be a valid value)
   * @throws {CloudWatchLogsError} If operation fails or retention value is invalid
   *
   * @example
   * ```typescript
   * // Retain logs for 30 days
   * await service.set('/aws/lambda/my-function', 30);
   * ```
   */
  set(logGroupName: string, retentionDays: RetentionDays): Promise<void>;

  /**
   * Remove retention policy from a log group.
   *
   * Sets retention to infinite - logs will be retained until explicitly deleted.
   * This is the default for new log groups.
   *
   * @param logGroupName - Name of the log group
   * @throws {CloudWatchLogsError} If operation fails
   *
   * @example
   * ```typescript
   * // Never automatically delete logs
   * await service.remove('/aws/lambda/my-function');
   * ```
   */
  remove(logGroupName: string): Promise<void>;

  /**
   * Get current retention policy for a log group.
   *
   * Returns the retention period in days, or null if retention is infinite.
   *
   * @param logGroupName - Name of the log group
   * @returns Retention period in days, or null if no retention policy is set
   * @throws {CloudWatchLogsError} If operation fails (e.g., log group not found)
   *
   * @example
   * ```typescript
   * const retention = await service.get('/aws/lambda/my-function');
   * if (retention === null) {
   *   console.log('Logs retained indefinitely');
   * } else {
   *   console.log(`Logs retained for ${retention} days`);
   * }
   * ```
   */
  get(logGroupName: string): Promise<RetentionDays | null>;
}

/**
 * Default implementation of RetentionService.
 *
 * Makes direct API calls to AWS CloudWatch Logs for retention policy operations.
 */
export class DefaultRetentionService implements RetentionService {
  private readonly config: CloudWatchLogsConfig;
  private readonly getCredentials: () => Promise<AwsCredentials>;

  /**
   * Create a new retention service.
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

  async set(logGroupName: string, retentionDays: RetentionDays): Promise<void> {
    // Validate retention days value
    if (!this.isValidRetentionDays(retentionDays)) {
      throw validationError(
        `Invalid retention days: ${retentionDays}. Must be one of: ${VALID_RETENTION_DAYS.join(', ')}`
      );
    }

    await this.makeRequest('PutRetentionPolicy', {
      logGroupName,
      retentionInDays: retentionDays,
    } as PutRetentionPolicyRequest);
  }

  async remove(logGroupName: string): Promise<void> {
    await this.makeRequest('DeleteRetentionPolicy', {
      logGroupName,
    } as DeleteRetentionPolicyRequest);
  }

  async get(logGroupName: string): Promise<RetentionDays | null> {
    // Describe the log group to get its retention policy
    const response = await this.makeRequest<DescribeLogGroupsResponse>(
      'DescribeLogGroups',
      {
        logGroupNamePrefix: logGroupName,
        limit: 1,
      } as DescribeLogGroupsRequest
    );

    // Find the exact match
    const logGroup = response.logGroups?.find(
      (group) => group.logGroupName === logGroupName
    );

    if (!logGroup) {
      throw new CloudWatchLogsError(
        `Log group not found: ${logGroupName}`,
        'RESOURCE_NOT_FOUND',
        false
      );
    }

    // Return retention days or null if not set (infinite retention)
    return (logGroup.retentionInDays as RetentionDays) ?? null;
  }

  /**
   * Validate that a retention days value is allowed by AWS.
   *
   * @param days - Retention days to validate
   * @returns True if valid, false otherwise
   * @private
   */
  private isValidRetentionDays(days: number): days is RetentionDays {
    return (VALID_RETENTION_DAYS as readonly number[]).includes(days);
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

/**
 * Validate that a retention days value is valid.
 *
 * @param days - Retention days to validate
 * @returns True if valid
 * @throws {CloudWatchLogsError} If invalid
 *
 * @example
 * ```typescript
 * validateRetentionDays(30); // OK
 * validateRetentionDays(31); // Throws error
 * ```
 */
export function validateRetentionDays(days: number): RetentionDays {
  if (!(VALID_RETENTION_DAYS as readonly number[]).includes(days)) {
    throw validationError(
      `Invalid retention days: ${days}. Must be one of: ${VALID_RETENTION_DAYS.join(', ')}`
    );
  }
  return days as RetentionDays;
}

/**
 * Get list of all valid retention day values.
 *
 * @returns Array of valid retention periods
 */
export function getValidRetentionDays(): readonly RetentionDays[] {
  return VALID_RETENTION_DAYS;
}
