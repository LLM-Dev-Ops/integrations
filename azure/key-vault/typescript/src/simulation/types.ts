/**
 * Azure Key Vault Simulation Types
 *
 * Types for simulating Key Vault operations for testing.
 * Part of SPARC simulation layer for testing without live Azure services.
 */

/**
 * Access result type
 */
export type AccessResult = 'success' | 'not_found' | 'access_denied' | 'error';

/**
 * Access log entry - records an operation on a Key Vault object
 */
export interface AccessLogEntry {
  /** Timestamp when the operation occurred */
  timestamp: Date;
  /** Operation name (getSecret, setSecret, createKey, etc.) */
  operation: string;
  /** Name of the object (secret, key, or certificate name) */
  objectName: string;
  /** Object type */
  objectType: 'secret' | 'key' | 'certificate';
  /** Version of the object (if applicable) */
  version?: string;
  /** Result of the access attempt */
  result: AccessResult;
  /** Error message (if result is error) */
  error?: string;
  /** Duration of the operation in milliseconds */
  durationMs?: number;
}

/**
 * Replay entry - compares original and replayed access
 */
export interface ReplayEntry {
  /** Original access log entry */
  original: AccessLogEntry;
  /** Result when replayed */
  replayedResult: AccessResult;
  /** Whether the replayed result matches the original */
  matches: boolean;
  /** Error encountered during replay (if any) */
  replayError?: string;
}

/**
 * Replay result - summary of replay operation
 */
export interface ReplayResult {
  /** Array of replay entries */
  entries: ReplayEntry[];
  /** Count of successful matches */
  successCount: number;
  /** Count of failed matches */
  failureCount: number;
  /** Overall match percentage */
  matchPercentage: number;
}

/**
 * Access log file format
 */
export interface AccessLogFile {
  /** File format version */
  version: string;
  /** When the log was created */
  created: string;
  /** Vault URL that was accessed */
  vaultUrl: string;
  /** Array of access log entries */
  entries: AccessLogEntry[];
}
