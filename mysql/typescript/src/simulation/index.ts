/**
 * Simulation mode implementation for MySQL client.
 *
 * Provides mock client, recording, and replay functionality for MySQL queries and responses,
 * enabling deterministic testing and development workflows without a live database.
 *
 * @module simulation
 */

import { promises as fs } from 'fs';
import {
  MysqlError,
  SimulationMismatchError,
  RecordingNotFoundError,
} from '../errors/index.js';
import type { ResultSet, ExecuteResult, Value } from '../types/index.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Recorded operation type.
 */
export type OperationType = 'query' | 'execute' | 'begin' | 'commit' | 'rollback';

/**
 * Serialized error format for recording and replay.
 */
export interface SerializedError {
  /** Error code */
  code: string | number;
  /** Error message */
  message: string;
  /** MySQL error code (numeric) */
  mysqlErrorCode?: number;
  /** SQLSTATE code */
  sqlState?: string;
  /** Whether error is retryable */
  retryable?: boolean;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Recorded database operation.
 */
export interface RecordedOperation {
  /** Operation type */
  type: OperationType;
  /** SQL query text */
  sql: string;
  /** Query parameters */
  params: Value[];
  /** Query result (if successful) */
  result?: ResultSet | ExecuteResult;
  /** Serialized error (if failed) */
  error?: SerializedError;
  /** When the operation was executed */
  timestamp: Date;
  /** Operation execution duration in milliseconds */
  durationMs: number;
}

/**
 * Mock transaction state.
 */
export interface MockTransaction {
  /** Transaction ID */
  id: string;
  /** When transaction started */
  startedAt: Date;
  /** Savepoints in this transaction */
  savepoints: string[];
  /** Whether transaction is active */
  active: boolean;
}

/**
 * Mock replica configuration.
 */
export interface MockReplica {
  /** Replica identifier */
  id: string;
  /** Simulated replication lag in milliseconds */
  lagMs: number;
}

/**
 * Mock metrics for simulation.
 */
export interface MockMetrics {
  /** Total number of queries executed */
  totalQueries: number;
  /** Total number of executes */
  totalExecutes: number;
  /** Total number of transactions */
  totalTransactions: number;
  /** Number of errors encountered */
  totalErrors: number;
  /** Average query duration in ms */
  averageDurationMs: number;
  /** Total simulated latency in ms */
  totalLatencyMs: number;
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

/**
 * Check if a query matches a pattern.
 *
 * Supports exact match, normalized match, and regex patterns.
 *
 * @param query - Query to match
 * @param pattern - Pattern to match against (string or regex)
 * @returns True if query matches pattern
 */
export function matchesPattern(query: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(query);
  }

  // Try exact match first
  if (query === pattern) {
    return true;
  }

  // Try normalized match
  return normalizeQuery(query) === normalizeQuery(pattern);
}

// ============================================================================
// MockMysqlClient
// ============================================================================

/**
 * Mock MySQL client for testing and simulation.
 *
 * Provides configurable query responses, error injection, transaction simulation,
 * and operation recording without requiring a live database connection.
 */
export class MockMysqlClient {
  private queryResponses: Map<string, ResultSet> = new Map();
  private executeResponses: Map<string, ExecuteResult> = new Map();
  private errorInjections: Map<string, MysqlError> = new Map();
  private operationLog: RecordedOperation[] = [];
  private transactionState: MockTransaction | null = null;
  private replicas: MockReplica[] = [];
  private latencyMin = 0;
  private latencyMax = 0;
  private transactionSupportEnabled = false;

  /**
   * Configure a mock query response.
   *
   * @param sqlPattern - SQL pattern (exact, normalized, or regex)
   * @param result - Result set to return
   * @returns This client for method chaining
   */
  withQueryResponse(sqlPattern: string | RegExp, result: ResultSet): this {
    const key = this.patternToKey(sqlPattern);
    this.queryResponses.set(key, result);
    return this;
  }

  /**
   * Configure a mock execute response.
   *
   * @param sqlPattern - SQL pattern (exact, normalized, or regex)
   * @param result - Execute result to return
   * @returns This client for method chaining
   */
  withExecuteResponse(sqlPattern: string | RegExp, result: ExecuteResult): this {
    const key = this.patternToKey(sqlPattern);
    this.executeResponses.set(key, result);
    return this;
  }

  /**
   * Inject an error for a specific SQL pattern.
   *
   * @param sqlPattern - SQL pattern (exact, normalized, or regex)
   * @param error - Error to throw
   * @returns This client for method chaining
   */
  withError(sqlPattern: string | RegExp, error: MysqlError): this {
    const key = this.patternToKey(sqlPattern);
    this.errorInjections.set(key, error);
    return this;
  }

  /**
   * Enable transaction simulation support.
   *
   * @returns This client for method chaining
   */
  withTransactionSupport(): this {
    this.transactionSupportEnabled = true;
    return this;
  }

  /**
   * Add a mock replica with simulated lag.
   *
   * @param id - Replica identifier
   * @param lagMs - Simulated replication lag in milliseconds
   * @returns This client for method chaining
   */
  withReplica(id: string, lagMs: number): this {
    this.replicas.push({ id, lagMs });
    return this;
  }

  /**
   * Configure simulated network latency.
   *
   * @param minMs - Minimum latency in milliseconds
   * @param maxMs - Maximum latency in milliseconds
   * @returns This client for method chaining
   */
  withLatency(minMs: number, maxMs: number): this {
    this.latencyMin = minMs;
    this.latencyMax = maxMs;
    return this;
  }

  /**
   * Execute a query and return results.
   *
   * @param sql - SQL query
   * @param params - Query parameters
   * @returns Query result set
   */
  async query(sql: string, params: Value[] = []): Promise<ResultSet> {
    const startTime = Date.now();

    // Simulate latency
    await this.simulateLatency();

    try {
      // Check for injected errors
      const error = this.findError(sql);
      if (error) {
        this.recordOperation('query', sql, params, undefined, error, startTime);
        throw error;
      }

      // Find matching response
      const result = this.findQueryResponse(sql);
      if (!result) {
        const error = new SimulationMismatchError(
          `No mock query response configured for: ${sql}`,
          sql
        );
        this.recordOperation('query', sql, params, undefined, error, startTime);
        throw error;
      }

      this.recordOperation('query', sql, params, result, undefined, startTime);
      return result;
    } catch (error) {
      if (error instanceof MysqlError) {
        throw error;
      }
      const mysqlError = new MysqlError({
        code: 'EXECUTION_ERROR',
        message: String(error),
        cause: error as Error,
      });
      this.recordOperation('query', sql, params, undefined, mysqlError, startTime);
      throw mysqlError;
    }
  }

  /**
   * Execute a non-SELECT statement.
   *
   * @param sql - SQL statement
   * @param params - Statement parameters
   * @returns Execute result
   */
  async execute(sql: string, params: Value[] = []): Promise<ExecuteResult> {
    const startTime = Date.now();

    // Simulate latency
    await this.simulateLatency();

    try {
      // Handle transaction commands if transaction support is enabled
      if (this.transactionSupportEnabled) {
        const normalizedSql = normalizeQuery(sql);

        if (normalizedSql === 'begin' || normalizedSql.startsWith('start transaction')) {
          return this.handleBegin(sql, params, startTime);
        }
        if (normalizedSql === 'commit') {
          return this.handleCommit(sql, params, startTime);
        }
        if (normalizedSql === 'rollback') {
          return this.handleRollback(sql, params, startTime);
        }
        if (normalizedSql.startsWith('savepoint ')) {
          return this.handleSavepoint(sql, params, startTime);
        }
      }

      // Check for injected errors
      const error = this.findError(sql);
      if (error) {
        this.recordOperation('execute', sql, params, undefined, error, startTime);
        throw error;
      }

      // Find matching response
      const result = this.findExecuteResponse(sql);
      if (!result) {
        const error = new SimulationMismatchError(
          `No mock execute response configured for: ${sql}`,
          sql
        );
        this.recordOperation('execute', sql, params, undefined, error, startTime);
        throw error;
      }

      this.recordOperation('execute', sql, params, result, undefined, startTime);
      return result;
    } catch (error) {
      if (error instanceof MysqlError) {
        throw error;
      }
      const mysqlError = new MysqlError({
        code: 'EXECUTION_ERROR',
        message: String(error),
        cause: error as Error,
      });
      this.recordOperation('execute', sql, params, undefined, mysqlError, startTime);
      throw mysqlError;
    }
  }

  /**
   * Get the complete operation history.
   *
   * @returns Array of all recorded operations
   */
  getOperationHistory(): RecordedOperation[] {
    return [...this.operationLog];
  }

  /**
   * Get mock metrics.
   *
   * @returns Mock metrics summary
   */
  getMetrics(): MockMetrics {
    const queries = this.operationLog.filter((op) => op.type === 'query');
    const executes = this.operationLog.filter((op) => op.type === 'execute');
    const transactions = this.operationLog.filter(
      (op) => op.type === 'begin' || op.type === 'commit' || op.type === 'rollback'
    );
    const errors = this.operationLog.filter((op) => op.error !== undefined);

    const totalDuration = this.operationLog.reduce((sum, op) => sum + op.durationMs, 0);
    const averageDuration =
      this.operationLog.length > 0 ? totalDuration / this.operationLog.length : 0;

    return {
      totalQueries: queries.length,
      totalExecutes: executes.length,
      totalTransactions: transactions.length / 2, // begin/commit pairs
      totalErrors: errors.length,
      averageDurationMs: averageDuration,
      totalLatencyMs: totalDuration,
    };
  }

  /**
   * Reset all mock state and operation history.
   */
  reset(): void {
    this.queryResponses.clear();
    this.executeResponses.clear();
    this.errorInjections.clear();
    this.operationLog = [];
    this.transactionState = null;
    this.replicas = [];
    this.latencyMin = 0;
    this.latencyMax = 0;
    this.transactionSupportEnabled = false;
  }

  /**
   * Get the current transaction state.
   *
   * @returns Current transaction or null if no active transaction
   */
  getCurrentTransaction(): MockTransaction | null {
    return this.transactionState;
  }

  /**
   * Get configured replicas.
   *
   * @returns Array of mock replicas
   */
  getReplicas(): MockReplica[] {
    return [...this.replicas];
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private patternToKey(pattern: string | RegExp): string {
    if (pattern instanceof RegExp) {
      return `regex:${pattern.source}`;
    }
    return normalizeQuery(pattern);
  }

  private findQueryResponse(sql: string): ResultSet | undefined {
    // Try exact normalized match first
    const normalized = normalizeQuery(sql);
    if (this.queryResponses.has(normalized)) {
      return this.queryResponses.get(normalized);
    }

    // Try regex patterns
    for (const [key, response] of this.queryResponses.entries()) {
      if (key.startsWith('regex:')) {
        const pattern = new RegExp(key.substring(6));
        if (pattern.test(sql)) {
          return response;
        }
      }
    }

    return undefined;
  }

  private findExecuteResponse(sql: string): ExecuteResult | undefined {
    // Try exact normalized match first
    const normalized = normalizeQuery(sql);
    if (this.executeResponses.has(normalized)) {
      return this.executeResponses.get(normalized);
    }

    // Try regex patterns
    for (const [key, response] of this.executeResponses.entries()) {
      if (key.startsWith('regex:')) {
        const pattern = new RegExp(key.substring(6));
        if (pattern.test(sql)) {
          return response;
        }
      }
    }

    return undefined;
  }

  private findError(sql: string): MysqlError | undefined {
    // Try exact normalized match first
    const normalized = normalizeQuery(sql);
    if (this.errorInjections.has(normalized)) {
      return this.errorInjections.get(normalized);
    }

    // Try regex patterns
    for (const [key, error] of this.errorInjections.entries()) {
      if (key.startsWith('regex:')) {
        const pattern = new RegExp(key.substring(6));
        if (pattern.test(sql)) {
          return error;
        }
      }
    }

    return undefined;
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMin === 0 && this.latencyMax === 0) {
      return;
    }

    const latency =
      this.latencyMin + Math.random() * (this.latencyMax - this.latencyMin);
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  private recordOperation(
    type: OperationType,
    sql: string,
    params: Value[],
    result: ResultSet | ExecuteResult | undefined,
    error: MysqlError | undefined,
    startTime: number
  ): void {
    const durationMs = Date.now() - startTime;
    this.operationLog.push({
      type,
      sql,
      params,
      result,
      error: error ? this.serializeError(error) : undefined,
      timestamp: new Date(),
      durationMs,
    });
  }

  private serializeError(error: MysqlError): SerializedError {
    return {
      code: error.code,
      message: error.message,
      mysqlErrorCode: error.mysqlErrorCode,
      sqlState: error.sqlState,
      retryable: error.retryable,
      details: error.details,
    };
  }

  private handleBegin(sql: string, params: Value[], startTime: number): ExecuteResult {
    if (this.transactionState && this.transactionState.active) {
      const error = new MysqlError({
        code: 'EXECUTION_ERROR',
        message: 'Transaction already active',
      });
      this.recordOperation('begin', sql, params, undefined, error, startTime);
      throw error;
    }

    this.transactionState = {
      id: `txn_${Date.now()}`,
      startedAt: new Date(),
      savepoints: [],
      active: true,
    };

    const result: ExecuteResult = {
      affectedRows: 0,
      warnings: 0,
    };

    this.recordOperation('begin', sql, params, result, undefined, startTime);
    return result;
  }

  private handleCommit(sql: string, params: Value[], startTime: number): ExecuteResult {
    if (!this.transactionState || !this.transactionState.active) {
      const error = new MysqlError({
        code: 'EXECUTION_ERROR',
        message: 'No active transaction to commit',
      });
      this.recordOperation('commit', sql, params, undefined, error, startTime);
      throw error;
    }

    this.transactionState.active = false;

    const result: ExecuteResult = {
      affectedRows: 0,
      warnings: 0,
    };

    this.recordOperation('commit', sql, params, result, undefined, startTime);
    return result;
  }

  private handleRollback(sql: string, params: Value[], startTime: number): ExecuteResult {
    if (!this.transactionState || !this.transactionState.active) {
      const error = new MysqlError({
        code: 'EXECUTION_ERROR',
        message: 'No active transaction to rollback',
      });
      this.recordOperation('rollback', sql, params, undefined, error, startTime);
      throw error;
    }

    this.transactionState.active = false;

    const result: ExecuteResult = {
      affectedRows: 0,
      warnings: 0,
    };

    this.recordOperation('rollback', sql, params, result, undefined, startTime);
    return result;
  }

  private handleSavepoint(
    sql: string,
    params: Value[],
    startTime: number
  ): ExecuteResult {
    if (!this.transactionState || !this.transactionState.active) {
      const error = new MysqlError({
        code: 'EXECUTION_ERROR',
        message: 'No active transaction for savepoint',
      });
      this.recordOperation('execute', sql, params, undefined, error, startTime);
      throw error;
    }

    // Extract savepoint name from SQL
    const match = sql.match(/savepoint\s+(\w+)/i);
    if (match) {
      this.transactionState.savepoints.push(match[1]);
    }

    const result: ExecuteResult = {
      affectedRows: 0,
      warnings: 0,
    };

    this.recordOperation('execute', sql, params, result, undefined, startTime);
    return result;
  }
}

// ============================================================================
// QueryRecorder
// ============================================================================

/**
 * Records database operations for later replay.
 */
export class QueryRecorder {
  private recordings: RecordedOperation[] = [];

  /**
   * Record a database operation.
   *
   * @param operation - Operation to record
   */
  record(operation: RecordedOperation): void {
    this.recordings.push(operation);
  }

  /**
   * Save recordings to a JSON file.
   *
   * @param filePath - Path to save recordings
   */
  async save(filePath: string): Promise<void> {
    const content = JSON.stringify(this.recordings, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Get all recordings.
   *
   * @returns Array of all recorded operations
   */
  getRecordings(): RecordedOperation[] {
    return [...this.recordings];
  }

  /**
   * Clear all recordings.
   */
  clear(): void {
    this.recordings = [];
  }

  /**
   * Get the number of recordings.
   *
   * @returns Number of recordings
   */
  size(): number {
    return this.recordings.length;
  }
}

// ============================================================================
// ReplayClient
// ============================================================================

/**
 * Replays recorded operations without connecting to a database.
 */
export class ReplayClient {
  private recordings: RecordedOperation[] = [];
  private currentIndex = 0;

  /**
   * Create a replay client.
   *
   * @param recordingFile - Path to the recording file (optional)
   */
  constructor(private readonly recordingFile?: string) {}

  /**
   * Load recordings from file.
   */
  async load(): Promise<void> {
    if (!this.recordingFile) {
      throw new RecordingNotFoundError('No recording file specified');
    }

    try {
      const content = await fs.readFile(this.recordingFile, 'utf-8');
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        throw new Error(
          `Invalid recording file format: expected array, got ${typeof data}`
        );
      }

      // Deserialize timestamps
      this.recordings = data.map((recording: any) => ({
        ...recording,
        timestamp: new Date(recording.timestamp),
      }));

      this.currentIndex = 0;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new RecordingNotFoundError(this.recordingFile);
      }
      throw error;
    }
  }

  /**
   * Load recordings from an array.
   *
   * @param recordings - Array of recorded operations
   */
  loadFromArray(recordings: RecordedOperation[]): void {
    this.recordings = [...recordings];
    this.currentIndex = 0;
  }

  /**
   * Execute a query using recorded responses.
   *
   * @param sql - SQL query
   * @param params - Query parameters
   * @returns Query result set
   */
  async query(sql: string, params: Value[] = []): Promise<ResultSet> {
    const recording = this.findMatchingRecording(sql, params, 'query');

    if (!recording) {
      throw new SimulationMismatchError(
        `No matching recording found for query: ${sql}`,
        sql
      );
    }

    // Simulate the original duration
    if (recording.durationMs > 0) {
      await this.sleep(recording.durationMs);
    }

    if (recording.error) {
      throw this.deserializeError(recording.error);
    }

    if (!recording.result) {
      throw new MysqlError({
        code: 'EXECUTION_ERROR',
        message: 'Recording has no result',
      });
    }

    return recording.result as ResultSet;
  }

  /**
   * Execute a statement using recorded responses.
   *
   * @param sql - SQL statement
   * @param params - Statement parameters
   * @returns Execute result
   */
  async execute(sql: string, params: Value[] = []): Promise<ExecuteResult> {
    const recording = this.findMatchingRecording(sql, params, 'execute');

    if (!recording) {
      throw new SimulationMismatchError(
        `No matching recording found for execute: ${sql}`,
        sql
      );
    }

    // Simulate the original duration
    if (recording.durationMs > 0) {
      await this.sleep(recording.durationMs);
    }

    if (recording.error) {
      throw this.deserializeError(recording.error);
    }

    if (!recording.result) {
      throw new MysqlError({
        code: 'EXECUTION_ERROR',
        message: 'Recording has no result',
      });
    }

    return recording.result as ExecuteResult;
  }

  /**
   * Reset replay to the beginning.
   */
  reset(): void {
    this.currentIndex = 0;
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
   * Get all recordings.
   *
   * @returns Array of all recordings
   */
  getRecordings(): RecordedOperation[] {
    return [...this.recordings];
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private findMatchingRecording(
    sql: string,
    params: Value[],
    type: OperationType
  ): RecordedOperation | null {
    const normalizedSql = normalizeQuery(sql);

    // Search from current index forward
    for (let i = this.currentIndex; i < this.recordings.length; i++) {
      const recording = this.recordings[i];

      if (
        recording.type === type &&
        normalizeQuery(recording.sql) === normalizedSql &&
        this.paramsMatch(recording.params, params)
      ) {
        this.currentIndex = i + 1;
        return recording;
      }
    }

    // Fallback: search entire array
    for (const recording of this.recordings) {
      if (
        recording.type === type &&
        normalizeQuery(recording.sql) === normalizedSql &&
        this.paramsMatch(recording.params, params)
      ) {
        return recording;
      }
    }

    return null;
  }

  private paramsMatch(recorded: Value[], provided: Value[]): boolean {
    if (recorded.length !== provided.length) {
      return false;
    }

    for (let i = 0; i < recorded.length; i++) {
      if (!this.valueEquals(recorded[i], provided[i])) {
        return false;
      }
    }

    return true;
  }

  private valueEquals(a: Value, b: Value): boolean {
    if (a.type !== b.type) {
      return false;
    }

    switch (a.type) {
      case 'Null':
        return true;
      case 'Bool':
      case 'Int':
      case 'UInt':
      case 'Float':
      case 'Double':
      case 'String':
      case 'Timestamp':
      case 'Decimal':
      case 'Time':
        return (a as any).value === (b as any).value;
      case 'Date':
      case 'DateTime':
        return (a as any).value.getTime() === (b as any).value.getTime();
      case 'Bytes':
        return this.bytesEqual((a as any).value, (b as any).value);
      case 'Json':
        return JSON.stringify((a as any).value) === JSON.stringify((b as any).value);
      default:
        return false;
    }
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  private deserializeError(serialized: SerializedError): MysqlError {
    return new MysqlError({
      code: serialized.code,
      message: serialized.message,
      mysqlErrorCode: serialized.mysqlErrorCode,
      sqlState: serialized.sqlState,
      retryable: serialized.retryable,
      details: serialized.details,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Exports
// ============================================================================

export type {
  ResultSet,
  ExecuteResult,
  Value,
} from '../types/index.js';
