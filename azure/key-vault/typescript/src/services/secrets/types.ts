/**
 * Azure Key Vault Secrets Service - Types
 *
 * Azure API response shapes and service-specific types.
 */

import type {
  Secret,
  SecretProperties,
  DeletedSecret,
  BackupBlob,
  GetSecretOptions,
  SetSecretOptions,
  ListSecretsOptions,
  UpdateSecretPropertiesOptions,
} from '../../types/index.js';

// Re-export types from main types module
export type {
  Secret,
  SecretProperties,
  DeletedSecret,
  BackupBlob,
  GetSecretOptions,
  SetSecretOptions,
  ListSecretsOptions,
  UpdateSecretPropertiesOptions,
};

/**
 * Azure API Secret Bundle response
 *
 * This is the raw response from the Azure Key Vault REST API.
 */
export interface SecretBundle {
  /** Secret value (Base64-encoded in some cases) */
  value?: string;
  /** Secret identifier (URL) */
  id: string;
  /** Content type hint */
  contentType?: string;
  /** Secret attributes */
  attributes?: {
    /** Whether the secret is enabled */
    enabled?: boolean;
    /** Not before date (Unix timestamp in seconds) */
    nbf?: number;
    /** Expiration date (Unix timestamp in seconds) */
    exp?: number;
    /** Created date (Unix timestamp in seconds) */
    created?: number;
    /** Updated date (Unix timestamp in seconds) */
    updated?: number;
    /** Recovery level */
    recoveryLevel?: string;
    /** Recoverable days */
    recoverableDays?: number;
  };
  /** Custom tags */
  tags?: Record<string, string>;
  /** Whether the secret is managed by Key Vault */
  managed?: boolean;
}

/**
 * Azure API Secret Item response (for list operations)
 *
 * List operations return metadata only, not the secret value.
 */
export interface SecretItem {
  /** Secret identifier (URL) */
  id: string;
  /** Content type hint */
  contentType?: string;
  /** Secret attributes */
  attributes?: {
    /** Whether the secret is enabled */
    enabled?: boolean;
    /** Not before date (Unix timestamp in seconds) */
    nbf?: number;
    /** Expiration date (Unix timestamp in seconds) */
    exp?: number;
    /** Created date (Unix timestamp in seconds) */
    created?: number;
    /** Updated date (Unix timestamp in seconds) */
    updated?: number;
    /** Recovery level */
    recoveryLevel?: string;
    /** Recoverable days */
    recoverableDays?: number;
  };
  /** Custom tags */
  tags?: Record<string, string>;
  /** Whether the secret is managed by Key Vault */
  managed?: boolean;
}

/**
 * Azure API Deleted Secret Bundle response
 */
export interface DeletedSecretBundle extends SecretBundle {
  /** Recovery ID */
  recoveryId?: string;
  /** Scheduled purge date (Unix timestamp in seconds) */
  scheduledPurgeDate?: number;
  /** Deleted date (Unix timestamp in seconds) */
  deletedDate?: number;
}

/**
 * Azure API Secret List response
 */
export interface SecretListResult {
  /** Array of secret items */
  value?: SecretItem[];
  /** Next page link */
  nextLink?: string;
}

/**
 * Azure API Backup Secret response
 */
export interface BackupSecretResult {
  /** Base64-encoded backup blob */
  value: string;
}

/**
 * List deleted secrets options
 */
export interface ListDeletedSecretsOptions {
  /** Maximum number of results per page */
  maxPageSize?: number;
}

/**
 * Page of deleted secret properties
 */
export interface DeletedSecretsPage {
  /** Array of deleted secret properties */
  items: Array<SecretProperties & { deletedOn?: Date; scheduledPurgeDate?: Date }>;
  /** Continuation token for next page */
  continuationToken?: string;
}
