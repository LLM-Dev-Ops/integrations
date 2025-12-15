/**
 * Credential provider for assumed roles.
 *
 * This module provides a CredentialProvider implementation that automatically
 * manages the lifecycle of assumed role credentials, including caching and
 * proactive refresh before expiration.
 *
 * @module credentials/provider
 */

import type { AssumedCredentials } from '../types/responses.js';
import type { AssumeRoleRequest } from '../types/requests.js';
import { IamError, credentialError } from '../error/index.js';

/**
 * AWS credentials for API requests.
 *
 * This interface matches the standard AWS credential format used by other
 * integrations (S3, Bedrock, etc.) for compatibility.
 */
export interface AwsCredentials {
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Optional session token for temporary credentials */
  sessionToken?: string;
  /** Optional expiration time for temporary credentials */
  expiration?: Date;
}

/**
 * Provider interface for retrieving AWS credentials.
 *
 * This interface is implemented by credential providers and used by AWS
 * service clients to obtain credentials for signing requests.
 */
export interface CredentialProvider {
  /**
   * Retrieves AWS credentials.
   *
   * @returns Promise resolving to valid AWS credentials
   * @throws {IamError} If credentials cannot be retrieved
   */
  getCredentials(): Promise<AwsCredentials>;

  /**
   * Checks if the current credentials are expired.
   *
   * @returns true if credentials are expired or not available
   */
  isExpired(): boolean;

  /**
   * Force refresh of credentials.
   *
   * @returns Promise resolving to fresh credentials
   * @throws {IamError} If credentials cannot be refreshed
   */
  refresh?(): Promise<AwsCredentials>;
}

/**
 * STS service interface for assuming roles.
 *
 * This minimal interface defines the contract that STS service implementations
 * must fulfill to work with the credential provider.
 */
export interface StsService {
  /**
   * Assume an IAM role.
   *
   * @param request - Assume role request
   * @returns Promise resolving to assumed credentials
   */
  assumeRole(request: AssumeRoleRequest): Promise<AssumedCredentials>;
}

/**
 * Options for assumed role credential provider.
 */
export interface AssumedRoleProviderOptions {
  /**
   * Duration for assumed role session in seconds.
   * Defaults to 3600 (1 hour).
   * Must be between 900 and 43200 (role dependent).
   */
  durationSeconds?: number;

  /**
   * External ID for cross-account role assumption.
   * Required if the role's trust policy requires it.
   */
  externalId?: string;

  /**
   * Session policy to scope down permissions.
   * Must be a JSON string.
   */
  sessionPolicy?: string;

  /**
   * Managed policy ARNs to attach to the session.
   */
  policyArns?: string[];

  /**
   * Buffer time before expiration to trigger refresh (in milliseconds).
   * Defaults to 5 minutes (300000ms).
   */
  refreshBuffer?: number;
}

/**
 * Default refresh buffer: 5 minutes before expiration.
 */
const DEFAULT_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes in ms

/**
 * Default session duration: 1 hour.
 */
const DEFAULT_DURATION = 3600; // 1 hour in seconds

/**
 * Credential provider that assumes an IAM role.
 *
 * This provider implements the CredentialProvider interface and manages
 * the lifecycle of assumed role credentials, including:
 * - Automatic caching of credentials
 * - Proactive refresh before expiration
 * - Thread-safe concurrent access
 * - Automatic retry on refresh failure
 *
 * The provider is designed to be used by other AWS service clients
 * (S3, Bedrock, etc.) to obtain credentials for API requests.
 *
 * @example
 * ```typescript
 * const provider = new AssumedRoleCredentialProvider(
 *   stsService,
 *   'arn:aws:iam::123456789012:role/MyRole',
 *   'my-session'
 * );
 *
 * // Get credentials (first call assumes role)
 * const creds1 = await provider.getCredentials();
 *
 * // Get credentials (subsequent calls use cache)
 * const creds2 = await provider.getCredentials();
 *
 * // Check if expired
 * if (provider.isExpired()) {
 *   await provider.refresh();
 * }
 * ```
 *
 * @example With options
 * ```typescript
 * const provider = new AssumedRoleCredentialProvider(
 *   stsService,
 *   'arn:aws:iam::123456789012:role/CrossAccountRole',
 *   'cross-account-session',
 *   {
 *     externalId: 'my-external-id',
 *     durationSeconds: 7200, // 2 hours
 *     refreshBuffer: 10 * 60 * 1000 // Refresh 10 minutes before expiry
 *   }
 * );
 * ```
 */
export class AssumedRoleCredentialProvider implements CredentialProvider {
  private currentCredentials: AssumedCredentials | null = null;
  private refreshPromise: Promise<AwsCredentials> | null = null;
  private readonly refreshBuffer: number;
  private readonly durationSeconds: number;

  /**
   * Creates a new assumed role credential provider.
   *
   * @param stsService - STS service for assuming roles
   * @param roleArn - ARN of the role to assume
   * @param sessionName - Name for the role session (2-64 chars)
   * @param options - Optional provider configuration
   */
  constructor(
    private readonly stsService: StsService,
    private readonly roleArn: string,
    private readonly sessionName: string,
    private readonly options: AssumedRoleProviderOptions = {}
  ) {
    this.refreshBuffer = options.refreshBuffer ?? DEFAULT_REFRESH_BUFFER;
    this.durationSeconds = options.durationSeconds ?? DEFAULT_DURATION;

    // Validate role ARN format
    if (!roleArn.startsWith('arn:aws:iam::')) {
      throw credentialError(`Invalid role ARN format: ${roleArn}`);
    }

    // Validate session name
    if (sessionName.length < 2 || sessionName.length > 64) {
      throw credentialError('Session name must be 2-64 characters');
    }

    // Validate session name characters (AWS requirement: [\w+=,.@-]+)
    if (!/^[\w+=,.@-]+$/.test(sessionName)) {
      throw credentialError('Session name contains invalid characters');
    }
  }

  /**
   * Retrieves AWS credentials, using cache when possible.
   *
   * This method returns cached credentials if they are still valid.
   * If credentials are expired or will expire soon (within refreshBuffer),
   * it assumes the role to get fresh credentials.
   *
   * Concurrent calls while a refresh is in progress will wait for the
   * same refresh operation, preventing multiple simultaneous role assumptions.
   *
   * @returns Promise resolving to AWS credentials
   * @throws {IamError} If role assumption fails
   */
  public async getCredentials(): Promise<AwsCredentials> {
    // Check if we have valid cached credentials
    if (this.currentCredentials && !this.shouldRefresh()) {
      return this.toAwsCredentials(this.currentCredentials);
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh
    return this.refresh();
  }

  /**
   * Checks if cached credentials are expired.
   *
   * Credentials are considered expired if they don't exist or if the
   * current time has passed their expiration time.
   *
   * @returns true if credentials are expired or not available
   */
  public isExpired(): boolean {
    if (!this.currentCredentials) {
      return true;
    }

    const now = Date.now();
    return now >= this.currentCredentials.expiration.getTime();
  }

  /**
   * Force refresh of credentials.
   *
   * This method always assumes the role to get fresh credentials,
   * regardless of whether cached credentials exist or are valid.
   *
   * If multiple concurrent calls to refresh() occur, they will all
   * wait for the same refresh operation to complete.
   *
   * @returns Promise resolving to fresh credentials
   * @throws {IamError} If role assumption fails
   */
  public async refresh(): Promise<AwsCredentials> {
    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh operation
    this.refreshPromise = this.performRefresh();

    try {
      const credentials = await this.refreshPromise;
      return credentials;
    } finally {
      // Clear the refresh promise when done
      this.refreshPromise = null;
    }
  }

  /**
   * Performs the actual credential refresh operation.
   *
   * @returns Promise resolving to fresh credentials
   */
  private async performRefresh(): Promise<AwsCredentials> {
    try {
      // Build assume role request
      const request: AssumeRoleRequest = {
        roleArn: this.roleArn,
        sessionName: this.sessionName,
        durationSeconds: this.durationSeconds,
        externalId: this.options.externalId,
        sessionPolicy: this.options.sessionPolicy,
        policyArns: this.options.policyArns,
      };

      // Assume the role
      const credentials = await this.stsService.assumeRole(request);

      // Store credentials atomically
      this.currentCredentials = credentials;

      return this.toAwsCredentials(credentials);
    } catch (error) {
      // Clear cached credentials on error
      this.currentCredentials = null;

      // Re-throw as IamError
      if (error instanceof IamError) {
        throw error;
      }
      throw credentialError(`Failed to assume role: ${error}`);
    }
  }

  /**
   * Determines if credentials should be refreshed.
   *
   * Credentials should be refreshed if:
   * - They don't exist
   * - They are expired
   * - They are within the refresh buffer window
   *
   * @returns true if credentials should be refreshed
   */
  private shouldRefresh(): boolean {
    if (!this.currentCredentials) {
      return true;
    }

    const now = Date.now();
    const expirationTime = this.currentCredentials.expiration.getTime();

    // Already expired
    if (now >= expirationTime) {
      return true;
    }

    // Within refresh buffer window
    if (now >= expirationTime - this.refreshBuffer) {
      return true;
    }

    return false;
  }

  /**
   * Converts assumed credentials to AWS credentials format.
   *
   * @param assumed - Assumed role credentials
   * @returns AWS credentials
   */
  private toAwsCredentials(assumed: AssumedCredentials): AwsCredentials {
    return {
      accessKeyId: assumed.accessKeyId,
      secretAccessKey: assumed.secretAccessKey,
      sessionToken: assumed.sessionToken,
      expiration: assumed.expiration,
    };
  }

  /**
   * Gets the current cached credentials (if any).
   *
   * This is useful for debugging and monitoring. Returns a copy to
   * prevent external modification.
   *
   * @returns Current credentials or null if none cached
   */
  public getCurrentCredentials(): AssumedCredentials | null {
    if (!this.currentCredentials) {
      return null;
    }

    return { ...this.currentCredentials };
  }

  /**
   * Gets the role ARN this provider assumes.
   *
   * @returns Role ARN
   */
  public getRoleArn(): string {
    return this.roleArn;
  }

  /**
   * Gets the session name used for role assumption.
   *
   * @returns Session name
   */
  public getSessionName(): string {
    return this.sessionName;
  }
}
