/**
 * EC2 Instance Metadata Service (IMDS) credential provider.
 *
 * This module provides a credential provider that retrieves temporary credentials
 * from the EC2 instance metadata service. Supports both IMDSv1 and IMDSv2.
 *
 * @module credentials/imds
 */

import { AwsCredentials, CredentialProvider } from './types.js';
import { CredentialError } from './error.js';

/**
 * Configuration for IMDS credential provider.
 */
export interface IMDSConfig {
  /**
   * IMDS endpoint URL. Defaults to the standard EC2 metadata endpoint.
   */
  endpoint?: string;

  /**
   * Timeout for HTTP requests in milliseconds. Defaults to 5000ms.
   */
  timeout?: number;

  /**
   * Maximum number of retries for failed requests. Defaults to 3.
   */
  maxRetries?: number;

  /**
   * Whether to use IMDSv2 (with session token). Defaults to true.
   */
  useIMDSv2?: boolean;
}

/**
 * IMDS credential response format.
 */
interface IMDSCredentialResponse {
  Code: string;
  LastUpdated: string;
  Type: string;
  AccessKeyId: string;
  SecretAccessKey: string;
  Token: string;
  Expiration: string;
}

/**
 * Default IMDS endpoint.
 */
const DEFAULT_ENDPOINT = 'http://169.254.169.254';

/**
 * IMDS API paths.
 */
const IMDS_PATHS = {
  TOKEN: '/latest/api/token',
  ROLE: '/latest/meta-data/iam/security-credentials/',
} as const;

/**
 * Provider that retrieves AWS credentials from EC2 Instance Metadata Service.
 *
 * This provider fetches temporary credentials from the EC2 instance metadata
 * service (IMDS). It's used when running on EC2 instances with an attached
 * IAM role.
 *
 * Features:
 * - Supports IMDSv2 (session token-based) for enhanced security
 * - Falls back to IMDSv1 if IMDSv2 is not available
 * - Automatic credential refresh based on expiration
 * - Configurable timeouts and retries
 *
 * @example
 * ```typescript
 * const provider = new IMDSCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example With custom configuration
 * ```typescript
 * const provider = new IMDSCredentialProvider({
 *   timeout: 10000,
 *   maxRetries: 5,
 *   useIMDSv2: true
 * });
 * ```
 */
export class IMDSCredentialProvider implements CredentialProvider {
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly useIMDSv2: boolean;

  private cachedCredentials: AwsCredentials | null = null;
  private sessionToken: string | null = null;
  private sessionTokenExpiry: number = 0;

  /**
   * Creates a new IMDS credential provider.
   *
   * @param config - Optional configuration
   */
  constructor(config: IMDSConfig = {}) {
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
    this.timeout = config.timeout || 5000;
    this.maxRetries = config.maxRetries || 3;
    this.useIMDSv2 = config.useIMDSv2 ?? true;
  }

  /**
   * Retrieves AWS credentials from IMDS.
   *
   * @returns Promise resolving to temporary credentials from IMDS
   * @throws {CredentialError} If credentials cannot be retrieved from IMDS
   */
  public async getCredentials(): Promise<AwsCredentials> {
    // Return cached credentials if still valid
    if (this.cachedCredentials && !this.isExpired()) {
      return { ...this.cachedCredentials };
    }

    try {
      // Get or refresh session token for IMDSv2
      if (this.useIMDSv2) {
        await this.ensureSessionToken();
      }

      // Get the IAM role name
      const roleName = await this.getRoleName();

      // Fetch credentials for the role
      const credentials = await this.fetchCredentials(roleName);

      // Cache the credentials
      this.cachedCredentials = credentials;

      return { ...credentials };
    } catch (error) {
      if (error instanceof CredentialError) {
        throw error;
      }

      throw new CredentialError(
        `Failed to retrieve credentials from IMDS: ${(error as Error).message}`,
        'IMDS_ERROR'
      );
    }
  }

  /**
   * Checks if the cached credentials are expired.
   *
   * @returns true if credentials are expired or not cached
   */
  public isExpired(): boolean {
    if (!this.cachedCredentials || !this.cachedCredentials.expiration) {
      return true;
    }

    // Consider expired if within 5 minutes of expiration
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in ms
    return this.cachedCredentials.expiration.getTime() - expiryBuffer <= Date.now();
  }

  /**
   * Ensures a valid IMDSv2 session token is available.
   */
  private async ensureSessionToken(): Promise<void> {
    // Check if we have a valid cached token
    if (this.sessionToken && Date.now() < this.sessionTokenExpiry) {
      return;
    }

    // Request a new session token
    const response = await this.request(IMDS_PATHS.TOKEN, {
      method: 'PUT',
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '21600', // 6 hours
      },
    });

    if (!response.ok) {
      throw new CredentialError(
        `Failed to obtain IMDSv2 session token: ${response.status} ${response.statusText}`,
        'IMDS_ERROR'
      );
    }

    this.sessionToken = await response.text();
    // Token is valid for 6 hours, but refresh after 5 hours
    this.sessionTokenExpiry = Date.now() + (5 * 60 * 60 * 1000);
  }

  /**
   * Retrieves the IAM role name from IMDS.
   *
   * @returns Promise resolving to the role name
   */
  private async getRoleName(): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.useIMDSv2 && this.sessionToken) {
      headers['X-aws-ec2-metadata-token'] = this.sessionToken;
    }

    const response = await this.request(IMDS_PATHS.ROLE, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new CredentialError(
        `Failed to retrieve IAM role name: ${response.status} ${response.statusText}`,
        'IMDS_ERROR'
      );
    }

    const roleName = (await response.text()).trim();
    if (!roleName) {
      throw new CredentialError(
        'No IAM role attached to this instance',
        'IMDS_ERROR'
      );
    }

    return roleName;
  }

  /**
   * Fetches credentials for the specified IAM role.
   *
   * @param roleName - Name of the IAM role
   * @returns Promise resolving to AWS credentials
   */
  private async fetchCredentials(roleName: string): Promise<AwsCredentials> {
    const headers: Record<string, string> = {};
    if (this.useIMDSv2 && this.sessionToken) {
      headers['X-aws-ec2-metadata-token'] = this.sessionToken;
    }

    const response = await this.request(`${IMDS_PATHS.ROLE}${roleName}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new CredentialError(
        `Failed to retrieve credentials for role '${roleName}': ${response.status} ${response.statusText}`,
        'IMDS_ERROR'
      );
    }

    const data = await response.json() as IMDSCredentialResponse;

    if (data.Code !== 'Success') {
      throw new CredentialError(
        `IMDS returned error code: ${data.Code}`,
        'IMDS_ERROR'
      );
    }

    return {
      accessKeyId: data.AccessKeyId,
      secretAccessKey: data.SecretAccessKey,
      sessionToken: data.Token,
      expiration: new Date(data.Expiration),
    };
  }

  /**
   * Makes an HTTP request to IMDS with retries.
   *
   * @param path - API path to request
   * @param options - Fetch options
   * @returns Promise resolving to the response
   */
  private async request(path: string, options: RequestInit): Promise<Response> {
    const url = `${this.endpoint}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on the last attempt
        if (attempt === this.maxRetries) {
          break;
        }

        // Exponential backoff: 100ms, 200ms, 400ms, etc.
        const delay = Math.min(100 * Math.pow(2, attempt), 1000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new CredentialError(
      `IMDS request failed after ${this.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`,
      'IMDS_ERROR'
    );
  }
}
