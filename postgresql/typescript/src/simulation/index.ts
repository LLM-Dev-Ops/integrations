/**
 * Simulation mode implementation for PostgreSQL client.
 *
 * Provides recording and replay functionality for PostgreSQL queries and responses,
 * enabling deterministic testing and development workflows without a live database.
 *
 * @module simulation
 */

import { promises as fs } from 'fs';
import { PgError, PgErrorCode, ExecutionError, parsePostgresError } from '../errors/index.js';
import type { QueryResult } from '../types/index.js';
import type { Logger } from '../observability/index.js';

// ============================================================================
// Enums and Types
// ============================================================================

/**
 * Simulation mode controls recording and replay behavior.
 */
export enum SimulationMode {
  /** Normal operation - no recording or replay */
  Off = 'off',
  /** Record queries and responses for later replay */
  Record = 'record',
  /** Replay recorded responses instead of executing queries */
  Replay = 'replay',
}

/**
 * Serialized error format for recording and replay.
 */
export interface SerializedError {
  /** PostgreSQL error code (SQLSTATE) */
  code: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Recorded query interaction with PostgreSQL.
 */
export interface Recording {
  /** SQL query text */
  query: string;
  /** Query parameters */
  params: unknown[];
  /** When the query was executed */
  timestamp: Date;
  /** Query execution duration in milliseconds */
  duration: number;
  /** Query result (if successful) */
  result?: QueryResult;
  /** Serialized error (if failed) */
  error?: SerializedError;
}

// ============================================================================
// Recording Store Interface
// ============================================================================

/**
 * Interface for storing and retrieving query recordings.
 */
export interface RecordingStore {
  /**
   * Save a recording to the store.
   *
   * @param recording - Recording to save
   */
  save(recording: Recording): Promise<void>;

  /**
   * Find a recording matching the query and parameters.
   *
   * @param query - SQL query text
   * @param params - Query parameters
   * @returns Matching recording or null if not found
   */
  find(query: string, params: unknown[]): Promise<Recording | null>;

  /**
   * Get all recordings in the store.
   *
   * @returns All recordings
   */
  findAll(): Promise<Recording[]>;

  /**
   * Clear all recordings from the store.
   */
  clear(): Promise<void>;
}

// ============================================================================
// In-Memory Recording Store
// ============================================================================

/**
 * In-memory implementation of RecordingStore.
 *
 * Stores recordings in memory for fast access and testing.
 * Recordings are matched by normalized query text and deep-equal parameters.
 */
export class InMemoryRecordingStore implements RecordingStore {
  private readonly recordings: Recording[] = [];

  /**
   * Save a recording to memory.
   *
   * @param recording - Recording to save
   */
  async save(recording: Recording): Promise<void> {
    this.recordings.push(recording);
  }

  /**
   * Find a recording matching the query and parameters.
   *
   * Uses normalized query matching and deep equality for parameters.
   *
   * @param query - SQL query text
   * @param params - Query parameters
   * @returns Matching recording or null if not found
   */
  async find(query: string, params: unknown[]): Promise<Recording | null> {
    const normalizedQuery = normalizeQuery(query);

    for (const recording of this.recordings) {
      const normalizedRecordingQuery = normalizeQuery(recording.query);

      if (
        normalizedRecordingQuery === normalizedQuery &&
        this.deepEqual(recording.params, params)
      ) {
        return recording;
      }
    }

    return null;
  }

  /**
   * Get all recordings.
   *
   * @returns All recordings
   */
  async findAll(): Promise<Recording[]> {
    return [...this.recordings];
  }

  /**
   * Clear all recordings.
   */
  async clear(): Promise<void> {
    this.recordings.length = 0;
  }

  /**
   * Get the number of recordings.
   *
   * @returns Number of recordings
   */
  size(): number {
    return this.recordings.length;
  }

  /**
   * Deep equality check for comparing parameters.
   *
   * @param a - First value
   * @param b - Second value
   * @returns True if values are deeply equal
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object).sort();
      const bKeys = Object.keys(b as object).sort();

      if (aKeys.length !== bKeys.length) return false;
      if (!this.deepEqual(aKeys, bKeys)) return false;

      for (const key of aKeys) {
        if (!this.deepEqual((a as any)[key], (b as any)[key])) {
          return false;
        }
      }

      return true;
    }

    return false;
  }
}

// ============================================================================
// File Recording Store
// ============================================================================

/**
 * File-based implementation of RecordingStore.
 *
 * Persists recordings to a JSON file on disk.
 * Suitable for sharing recordings across test runs and CI environments.
 */
export class FileRecordingStore implements RecordingStore {
  /**
   * Create a file-based recording store.
   *
   * @param filePath - Path to the recordings JSON file
   */
  constructor(private readonly filePath: string) {}

  /**
   * Save a recording to the file.
   *
   * Appends the recording to the existing recordings in the file.
   *
   * @param recording - Recording to save
   */
  async save(recording: Recording): Promise<void> {
    let recordings: Recording[] = [];

    try {
      recordings = await this.loadRecordings();
    } catch (error) {
      // File doesn't exist yet, start with empty array
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }

    recordings.push(recording);
    await this.saveRecordings(recordings);
  }

  /**
   * Find a recording matching the query and parameters.
   *
   * @param query - SQL query text
   * @param params - Query parameters
   * @returns Matching recording or null if not found
   */
  async find(query: string, params: unknown[]): Promise<Recording | null> {
    let recordings: Recording[];

    try {
      recordings = await this.loadRecordings();
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        throw new PgError({
          code: PgErrorCode.RecordingNotFound,
          message: `Recording file not found: ${this.filePath}`,
          cause: error as Error,
        });
      }
      throw error;
    }

    const normalizedQuery = normalizeQuery(query);

    for (const recording of recordings) {
      const normalizedRecordingQuery = normalizeQuery(recording.query);

      if (
        normalizedRecordingQuery === normalizedQuery &&
        this.deepEqual(recording.params, params)
      ) {
        return recording;
      }
    }

    return null;
  }

  /**
   * Get all recordings from the file.
   *
   * @returns All recordings
   */
  async findAll(): Promise<Recording[]> {
    try {
      return await this.loadRecordings();
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Clear all recordings by deleting the file.
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Load recordings from the file.
   *
   * @returns Array of recordings
   */
  private async loadRecordings(): Promise<Recording[]> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
      throw new Error(`Invalid recording file format: expected array, got ${typeof data}`);
    }

    // Deserialize timestamps
    return data.map((recording: any) => ({
      ...recording,
      timestamp: new Date(recording.timestamp),
    }));
  }

  /**
   * Save recordings to the file.
   *
   * @param recordings - Recordings to save
   */
  private async saveRecordings(recordings: Recording[]): Promise<void> {
    const content = JSON.stringify(recordings, null, 2);
    await fs.writeFile(this.filePath, content, 'utf-8');
  }

  /**
   * Check if an error is a file-not-found error.
   *
   * @param error - Error to check
   * @returns True if the error is ENOENT
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as any).code === 'ENOENT'
    );
  }

  /**
   * Deep equality check for comparing parameters.
   *
   * @param a - First value
   * @param b - Second value
   * @returns True if values are deeply equal
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object).sort();
      const bKeys = Object.keys(b as object).sort();

      if (aKeys.length !== bKeys.length) return false;
      if (!this.deepEqual(aKeys, bKeys)) return false;

      for (const key of aKeys) {
        if (!this.deepEqual((a as any)[key], (b as any)[key])) {
          return false;
        }
      }

      return true;
    }

    return false;
  }
}

// ============================================================================
// Simulation Interceptor
// ============================================================================

/**
 * Intercepts query execution for recording and replay.
 *
 * The SimulationInterceptor wraps query execution and provides:
 * - Record mode: Execute queries and record results
 * - Replay mode: Return recorded results without executing
 * - Off mode: Pass-through with no recording or replay
 */
export class SimulationInterceptor {
  /**
   * Create a simulation interceptor.
   *
   * @param mode - Simulation mode
   * @param store - Recording store
   * @param logger - Optional logger for diagnostics
   */
  constructor(
    private mode: SimulationMode,
    private readonly store: RecordingStore,
    private readonly logger?: Logger
  ) {}

  /**
   * Get the current simulation mode.
   *
   * @returns Current simulation mode
   */
  getMode(): SimulationMode {
    return this.mode;
  }

  /**
   * Set the simulation mode.
   *
   * @param mode - New simulation mode
   */
  setMode(mode: SimulationMode): void {
    this.mode = mode;
    this.logger?.info('Simulation mode changed', { mode });
  }

  /**
   * Intercept a query execution.
   *
   * Depending on the mode:
   * - Off: Execute the query normally
   * - Record: Execute the query and record the result
   * - Replay: Find a matching recording and return its result
   *
   * @param query - SQL query text
   * @param params - Query parameters
   * @param execute - Function that executes the query
   * @returns Query result
   */
  async intercept<T>(
    query: string,
    params: unknown[],
    execute: () => Promise<T>
  ): Promise<T> {
    switch (this.mode) {
      case SimulationMode.Off:
        return this.executePassthrough(execute);

      case SimulationMode.Record:
        return this.executeAndRecord(query, params, execute);

      case SimulationMode.Replay:
        return this.executeReplay(query, params);

      default:
        throw new PgError({
          code: PgErrorCode.SimulatedError,
          message: `Unknown simulation mode: ${this.mode}`,
        });
    }
  }

  /**
   * Execute the query without recording.
   *
   * @param execute - Function that executes the query
   * @returns Query result
   */
  private async executePassthrough<T>(execute: () => Promise<T>): Promise<T> {
    return execute();
  }

  /**
   * Execute the query and record the result.
   *
   * @param query - SQL query text
   * @param params - Query parameters
   * @param execute - Function that executes the query
   * @returns Query result
   */
  private async executeAndRecord<T>(
    query: string,
    params: unknown[],
    execute: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let result: T;
    let error: Error | undefined;

    try {
      result = await execute();
      const duration = Date.now() - startTime;

      this.logger?.debug('Recording query execution', {
        query: this.truncateQuery(query),
        duration,
        success: true,
      });

      await this.store.save({
        query,
        params,
        timestamp: new Date(),
        duration,
        result: result as unknown as QueryResult,
      });

      return result;
    } catch (err) {
      error = err as Error;
      const duration = Date.now() - startTime;

      this.logger?.debug('Recording query error', {
        query: this.truncateQuery(query),
        duration,
        success: false,
        error: error.message,
      });

      await this.store.save({
        query,
        params,
        timestamp: new Date(),
        duration,
        error: this.serializeError(error),
      });

      throw error;
    }
  }

  /**
   * Replay a recorded query result.
   *
   * @param query - SQL query text
   * @param params - Query parameters
   * @returns Recorded query result
   */
  private async executeReplay<T>(query: string, params: unknown[]): Promise<T> {
    const recording = await this.store.find(query, params);

    if (!recording) {
      throw new SimulationMismatchError(
        `No recording found for query: ${this.truncateQuery(query)}`,
        query,
        params
      );
    }

    this.logger?.debug('Replaying recorded query', {
      query: this.truncateQuery(query),
      duration: recording.duration,
      hasError: !!recording.error,
    });

    // Simulate the original duration
    if (recording.duration > 0) {
      await this.sleep(recording.duration);
    }

    if (recording.error) {
      throw this.deserializeError(recording.error);
    }

    return recording.result as unknown as T;
  }

  /**
   * Serialize an error for storage.
   *
   * @param error - Error to serialize
   * @returns Serialized error
   */
  private serializeError(error: Error): SerializedError {
    if (error instanceof PgError) {
      return {
        code: error.code || 'UNKNOWN',
        message: error.message,
        details: error.details ?? {},
      };
    }

    return {
      code: 'UNKNOWN',
      message: error.message,
      details: {
        name: error.name,
        stack: error.stack,
      },
    };
  }

  /**
   * Deserialize an error from storage.
   *
   * @param serialized - Serialized error
   * @returns Reconstructed error
   */
  private deserializeError(serialized: SerializedError): Error {
    const details = serialized.details || {};

    if (serialized.code !== 'UNKNOWN') {
      // Reconstruct PgError
      return new PgError({
        code: serialized.code as PgErrorCode,
        message: serialized.message,
        details: details as Record<string, unknown>,
      });
    }

    // Reconstruct generic error
    const error = new Error(serialized.message);
    error.name = typeof details.name === 'string' ? details.name : 'Error';
    if (typeof details.stack === 'string') {
      error.stack = details.stack;
    }
    return error;
  }

  /**
   * Sleep for the specified duration.
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Truncate a query for logging.
   *
   * @param query - Query to truncate
   * @returns Truncated query
   */
  private truncateQuery(query: string): string {
    const maxLength = 100;
    if (query.length <= maxLength) {
      return query;
    }
    return query.substring(0, maxLength) + '...';
  }
}

// ============================================================================
// Query Normalization
// ============================================================================

/**
 * Normalize a SQL query for matching.
 *
 * Normalization includes:
 * - Converting to lowercase
 * - Collapsing whitespace
 * - Trimming leading/trailing whitespace
 *
 * @param query - SQL query text
 * @returns Normalized query
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Simulation Errors
// ============================================================================

/**
 * Error thrown when no recording matches in Replay mode.
 */
export class SimulationMismatchError extends PgError {
  /**
   * Create a simulation mismatch error.
   *
   * @param message - Error message
   * @param query - Query that didn't match
   * @param params - Parameters that didn't match
   */
  constructor(
    message: string,
    public readonly query: string,
    public readonly params: unknown[]
  ) {
    super({
      code: PgErrorCode.SimulationMismatch,
      message,
      details: { query },
    });
    this.name = 'SimulationMismatchError';
  }
}

/**
 * Error thrown when a recording file is not found.
 */
export class RecordingNotFoundError extends PgError {
  /**
   * Create a recording not found error.
   *
   * @param message - Error message
   * @param filePath - Path to the missing file
   */
  constructor(
    message: string,
    public readonly filePath: string
  ) {
    super({
      code: PgErrorCode.RecordingNotFound,
      message,
      details: { filePath },
    });
    this.name = 'RecordingNotFoundError';
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Re-export types from other modules
  type QueryResult,
  type Logger,
};
