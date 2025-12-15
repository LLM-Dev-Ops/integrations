/**
 * Azure Key Vault Common Types
 *
 * Shared type definitions and utilities used across Key Vault operations.
 */

/**
 * Recovery level for Key Vault objects
 *
 * Determines the recovery and protection level for deleted objects.
 */
export enum RecoveryLevel {
  /** Object can be purged immediately */
  Purgeable = 'Purgeable',
  /** Object can be recovered but not purged */
  Recoverable = 'Recoverable',
  /** Object is protected and recoverable (subscription-level protection) */
  RecoverableProtectedSubscription = 'Recoverable+ProtectedSubscription',
  /** Object is recoverable and can be purged after retention period */
  RecoverablePurgeable = 'Recoverable+Purgeable',
}

/**
 * Base properties shared across Key Vault objects
 */
export interface BaseProperties {
  /** Unique identifier */
  id: string;
  /** Object name */
  name: string;
  /** Vault URL */
  vaultUrl: string;
  /** Object version */
  version?: string;
  /** Whether the object is enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdOn?: Date;
  /** Last updated timestamp */
  updatedOn?: Date;
  /** Expiration timestamp */
  expiresOn?: Date;
  /** Not valid before timestamp */
  notBefore?: Date;
  /** Recovery level */
  recoveryLevel?: RecoveryLevel;
  /** Number of days object will be retained after deletion */
  recoverableDays?: number;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Timestamp handling utilities
 */
export class TimestampUtils {
  /**
   * Convert Unix timestamp (seconds) to Date
   */
  static fromUnixSeconds(timestamp?: number): Date | undefined {
    return timestamp ? new Date(timestamp * 1000) : undefined;
  }

  /**
   * Convert Date to Unix timestamp (seconds)
   */
  static toUnixSeconds(date?: Date): number | undefined {
    return date ? Math.floor(date.getTime() / 1000) : undefined;
  }

  /**
   * Parse ISO 8601 date string to Date
   */
  static parseIso(dateString?: string): Date | undefined {
    return dateString ? new Date(dateString) : undefined;
  }

  /**
   * Format Date to ISO 8601 string
   */
  static toIso(date?: Date): string | undefined {
    return date?.toISOString();
  }

  /**
   * Check if timestamp is expired
   */
  static isExpired(expiresOn?: Date): boolean {
    return expiresOn ? expiresOn.getTime() < Date.now() : false;
  }

  /**
   * Check if timestamp is not yet valid
   */
  static isNotYetValid(notBefore?: Date): boolean {
    return notBefore ? notBefore.getTime() > Date.now() : false;
  }
}

/**
 * Deleted object base properties
 */
export interface DeletedObjectProperties extends BaseProperties {
  /** Deletion timestamp */
  deletedOn?: Date;
  /** Scheduled purge timestamp */
  scheduledPurgeDate?: Date;
  /** Recovery ID for restoration */
  recoveryId?: string;
}
