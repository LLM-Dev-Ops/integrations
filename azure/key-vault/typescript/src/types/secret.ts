/**
 * Azure Key Vault Secret Types
 *
 * Type definitions for secret operations following SPARC specification.
 */

import type { BaseProperties, DeletedObjectProperties } from './common.js';

/**
 * SecretString - Wraps secret value to prevent accidental exposure
 *
 * This class prevents accidental logging of secret values by overriding toString().
 * Use expose() method to explicitly access the secret value.
 *
 * @example
 * ```typescript
 * const secret = new SecretString('my-secret-value');
 * console.log(secret.toString()); // "[SecretString]"
 * console.log(secret.expose());   // "my-secret-value"
 * ```
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Explicitly expose the secret value
   *
   * Use this method when you need to access the actual secret value.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Override toString to prevent accidental logging
   */
  toString(): string {
    return '[SecretString]';
  }

  /**
   * Override toJSON to prevent accidental serialization
   */
  toJSON(): string {
    return '[SecretString]';
  }

  /**
   * Override valueOf to prevent accidental exposure
   */
  valueOf(): string {
    return '[SecretString]';
  }

  /**
   * Get length of the secret value
   */
  get length(): number {
    return this.value.length;
  }

  /**
   * Check if secret is empty
   */
  isEmpty(): boolean {
    return this.value.length === 0;
  }
}

/**
 * Secret properties
 */
export interface SecretProperties extends BaseProperties {
  /** Content type of the secret (e.g., 'text/plain', 'application/json') */
  contentType?: string;
  /** Whether the secret is managed by Key Vault */
  managed?: boolean;
}

/**
 * Secret object
 */
export interface Secret {
  /** Secret identifier (URL) */
  id: string;
  /** Secret name */
  name: string;
  /** Secret value (wrapped in SecretString) */
  value: SecretString;
  /** Secret properties */
  properties: SecretProperties;
}

/**
 * Options for setting a secret
 */
export interface SetSecretOptions {
  /** Content type of the secret */
  contentType?: string;
  /** Enable or disable the secret */
  enabled?: boolean;
  /** Expiration date */
  expiresOn?: Date;
  /** Not valid before date */
  notBefore?: Date;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Deleted secret
 */
export interface DeletedSecret {
  /** Secret identifier */
  id: string;
  /** Secret name */
  name: string;
  /** Secret value (if available) */
  value?: SecretString;
  /** Secret properties including deletion metadata */
  properties: DeletedObjectProperties & Omit<SecretProperties, keyof BaseProperties>;
}

/**
 * Secret backup blob
 *
 * Opaque blob containing encrypted backup of the secret.
 */
export interface BackupBlob {
  /** Backup data as byte array */
  value: Uint8Array;
}

/**
 * List secrets options
 */
export interface ListSecretsOptions {
  /** Maximum number of results per page */
  maxPageSize?: number;
}

/**
 * Page of secret properties
 */
export interface SecretsPage {
  /** Array of secret properties */
  items: SecretProperties[];
  /** Continuation token for next page */
  continuationToken?: string;
}

/**
 * Get secret options
 */
export interface GetSecretOptions {
  /** Specific version to retrieve */
  version?: string;
}

/**
 * Update secret properties options
 */
export interface UpdateSecretPropertiesOptions {
  /** Content type */
  contentType?: string;
  /** Enable or disable */
  enabled?: boolean;
  /** Expiration date */
  expiresOn?: Date;
  /** Not valid before date */
  notBefore?: Date;
  /** Custom tags */
  tags?: Record<string, string>;
}
