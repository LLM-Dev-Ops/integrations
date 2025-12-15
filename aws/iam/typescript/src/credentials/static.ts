/**
 * Static credential provider.
 *
 * This module provides a credential provider that returns static, pre-configured
 * credentials. Useful for testing or when credentials are known at initialization time.
 *
 * @module credentials/static
 */

import type { AwsCredentials, CredentialProvider } from "./types.js";
import { CredentialError } from "./error.js";

/**
 * Provider that returns static AWS credentials.
 *
 * This provider is initialized with a fixed set of credentials and returns
 * them on every call. It supports both long-term and temporary credentials
 * and will check expiration times if present.
 *
 * @example
 * ```typescript
 * const provider = new StaticCredentialProvider({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
 * });
 *
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example With temporary credentials
 * ```typescript
 * const provider = new StaticCredentialProvider({
 *   accessKeyId: 'ASIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   sessionToken: 'AQoDYXdzEJr...',
 *   expiration: new Date(Date.now() + 3600000) // 1 hour from now
 * });
 * ```
 */
export class StaticCredentialProvider implements CredentialProvider {
  /**
   * Creates a new static credential provider.
   *
   * @param credentials - The AWS credentials to return
   */
  constructor(private readonly credentials: AwsCredentials) {
    this.validateCredentials(credentials);
  }

  /**
   * Validates that credentials contain required fields.
   *
   * @param credentials - Credentials to validate
   * @throws {CredentialError} If credentials are invalid
   */
  private validateCredentials(credentials: AwsCredentials): void {
    if (!credentials.accessKeyId || credentials.accessKeyId.trim() === "") {
      throw new CredentialError("accessKeyId is required and cannot be empty", "INVALID");
    }

    if (!credentials.secretAccessKey || credentials.secretAccessKey.trim() === "") {
      throw new CredentialError("secretAccessKey is required and cannot be empty", "INVALID");
    }

    // If expiration is provided, ensure it's a valid date
    if (credentials.expiration && !(credentials.expiration instanceof Date)) {
      throw new CredentialError("expiration must be a Date object", "INVALID");
    }

    // If expiration is provided, warn if already expired
    if (credentials.expiration && credentials.expiration.getTime() <= Date.now()) {
      throw new CredentialError("Credentials are already expired", "EXPIRED");
    }
  }

  /**
   * Returns the static credentials.
   *
   * @returns Promise resolving to the configured credentials
   * @throws {CredentialError} If credentials have expired
   */
  public async getCredentials(): Promise<AwsCredentials> {
    if (this.isExpired()) {
      throw new CredentialError("Credentials have expired", "EXPIRED");
    }

    return { ...this.credentials };
  }

  /**
   * Checks if the credentials have expired.
   *
   * @returns true if credentials have an expiration time that has passed
   */
  public isExpired(): boolean {
    if (!this.credentials.expiration) {
      return false;
    }

    return this.credentials.expiration.getTime() <= Date.now();
  }
}
