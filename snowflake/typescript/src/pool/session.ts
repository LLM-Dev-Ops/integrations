/**
 * Snowflake Session Wrapper
 *
 * Wraps a Snowflake connection with state management and lifecycle tracking.
 * @module @llmdevops/snowflake-integration/pool/session
 */

import { v4 as uuidv4 } from 'uuid';
import type { SessionInfo, SessionState, QueryResult, ColumnMetadata, Value, Row } from '../types/index.js';
import { ConnectionError, QueryError, SessionExpiredError, fromSdkError } from '../errors/index.js';
import { createRow } from '../types/index.js';

// Snowflake SDK types (defined here to avoid direct dependency on snowflake-sdk types)
interface Connection {
  execute(options: {
    sqlText: string;
    binds?: unknown;
    complete: (err: any, stmt: any, rows?: any) => void;
    timeout?: number;
    fetchResult?: boolean;
  }): any;
  destroy(callback: (err?: any) => void): void;
}

/**
 * Options for executing a query.
 */
export interface ExecuteOptions {
  /** Query timeout in milliseconds */
  timeoutMs?: number;
  /** Bind parameters */
  binds?: Value[];
  /** Fetch result set */
  fetchResult?: boolean;
  /** Max rows to fetch (0 = unlimited) */
  maxRows?: number;
}

/**
 * Session wraps a Snowflake connection with state and lifecycle management.
 */
export class Session {
  private readonly connection: Connection;
  private readonly sessionId: string;
  private state: SessionState;
  private readonly createdAt: Date;
  private lastActivityAt: Date;
  private queryCount: number;
  private database?: string;
  private schema?: string;
  private warehouse?: string;
  private role?: string;

  constructor(connection: Connection) {
    this.connection = connection;
    this.sessionId = uuidv4();
    this.state = 'idle';
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.queryCount = 0;
  }

  /**
   * Gets the session ID.
   */
  getId(): string {
    return this.sessionId;
  }

  /**
   * Gets the current state.
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Gets session information.
   */
  getInfo(): SessionInfo {
    return {
      sessionId: this.sessionId,
      state: this.state,
      database: this.database,
      schema: this.schema,
      warehouse: this.warehouse,
      role: this.role,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      queryCount: this.queryCount,
    };
  }

  /**
   * Gets the creation time.
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Gets the last activity time.
   */
  getLastActivityAt(): Date {
    return this.lastActivityAt;
  }

  /**
   * Gets the query count.
   */
  getQueryCount(): number {
    return this.queryCount;
  }

  /**
   * Gets the age of this session in milliseconds.
   */
  getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  /**
   * Gets the idle time in milliseconds.
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivityAt.getTime();
  }

  /**
   * Checks if the session is in an error state.
   */
  isError(): boolean {
    return this.state === 'error';
  }

  /**
   * Checks if the session is closed or closing.
   */
  isClosed(): boolean {
    return this.state === 'closed' || this.state === 'closing';
  }

  /**
   * Checks if the session is available for use.
   */
  isAvailable(): boolean {
    return this.state === 'idle';
  }

  /**
   * Marks the session as active.
   */
  markActive(): void {
    if (this.state === 'closed' || this.state === 'closing') {
      throw new SessionExpiredError(this.sessionId);
    }
    this.state = 'active';
    this.lastActivityAt = new Date();
  }

  /**
   * Marks the session as idle.
   */
  markIdle(): void {
    if (this.state === 'active') {
      this.state = 'idle';
    }
    this.lastActivityAt = new Date();
  }

  /**
   * Marks the session as error.
   */
  markError(): void {
    this.state = 'error';
    this.lastActivityAt = new Date();
  }

  /**
   * Validates the session health.
   * @param validationQuery - Optional validation query (default: 'SELECT 1')
   * @returns Promise that resolves to true if healthy, false otherwise
   */
  async validate(validationQuery: string = 'SELECT 1'): Promise<boolean> {
    if (this.isClosed()) {
      return false;
    }

    try {
      this.markActive();
      await this.executeInternal(validationQuery, {}, 5000);
      this.markIdle();
      return true;
    } catch (error) {
      this.markError();
      return false;
    }
  }

  /**
   * Executes a query on this session.
   * @param sql - SQL query to execute
   * @param options - Execution options
   * @returns Promise resolving to query result
   */
  async execute(sql: string, options: ExecuteOptions = {}): Promise<QueryResult> {
    if (this.isClosed()) {
      throw new SessionExpiredError(this.sessionId);
    }

    if (this.state === 'error') {
      throw new ConnectionError('Session is in error state');
    }

    try {
      this.markActive();

      const binds = options.binds?.map(v => {
        if (v.type === 'null') return null;
        return v.value;
      });

      const result = await this.executeInternal(
        sql,
        binds || {},
        options.timeoutMs,
        options.fetchResult ?? true,
        options.maxRows
      );

      this.queryCount++;
      this.markIdle();

      return result;
    } catch (error) {
      this.markError();
      throw fromSdkError(error);
    }
  }

  /**
   * Internal method to execute a query.
   */
  private executeInternal(
    sql: string,
    binds: Record<string, unknown> | unknown[],
    timeoutMs?: number,
    fetchResult: boolean = true,
    maxRows?: number
  ): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      const statement = this.connection.execute({
        sqlText: sql,
        binds: Array.isArray(binds) ? binds : binds,
        complete: (err: any, stmt: any, rows?: any) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            const queryId = stmt.getQueryId();
            const statementHash = stmt.getStatementHash?.();
            const sessionId = stmt.getSessionId?.();

            // Extract column metadata
            const columns: ColumnMetadata[] = (stmt.getColumns?.() || []).map((col: {
              getName(): string;
              getType(): string;
              isNullable(): boolean;
              getScale?(): number;
              getPrecision?(): number;
              getLength?(): number;
            }) => ({
              name: col.getName(),
              type: col.getType() as any,
              nullable: col.isNullable(),
              scale: col.getScale?.(),
              precision: col.getPrecision?.(),
              length: col.getLength?.(),
            }));

            // Convert rows to our Row type
            const resultRows: Row[] = (rows || []).map((rawRow: Record<string, unknown>) =>
              createRow(rawRow, columns)
            );

            const statistics = stmt.getStatistics?.() || {};

            const result: QueryResult = {
              queryId,
              statementHash,
              sessionId,
              resultSet: {
                columns,
                rows: maxRows ? resultRows.slice(0, maxRows) : resultRows,
                rowCount: resultRows.length,
                hasMore: false,
              },
              statistics: {
                executionTimeMs: statistics.executionTimeMs || 0,
                compilationTimeMs: statistics.compilationTimeMs,
                queuedTimeMs: statistics.queuedTimeMs,
                rowsProduced: statistics.rowsProduced || resultRows.length,
                rowsAffected: statistics.rowsAffected,
                bytesScanned: statistics.bytesScanned || 0,
                bytesWritten: statistics.bytesWritten,
                bytesSent: statistics.bytesSent,
                partitionsScanned: statistics.partitionsScanned,
                partitionsTotal: statistics.partitionsTotal,
                percentScannedFromCache: statistics.percentScannedFromCache,
              },
              warehouse: stmt.getWarehouse?.(),
            };

            resolve(result);
          } catch (parseError) {
            reject(new QueryError('Failed to parse query result', {
              cause: parseError instanceof Error ? parseError : undefined,
            }));
          }
        },
        timeout: timeoutMs,
        fetchResult,
      });

      // Store statement reference for potential cancellation
      (this as any)._currentStatement = statement;
    });
  }

  /**
   * Sets the current database context.
   */
  async setDatabase(database: string): Promise<void> {
    await this.execute(`USE DATABASE ${database}`);
    this.database = database;
  }

  /**
   * Sets the current schema context.
   */
  async setSchema(schema: string): Promise<void> {
    await this.execute(`USE SCHEMA ${schema}`);
    this.schema = schema;
  }

  /**
   * Sets the current warehouse context.
   */
  async setWarehouse(warehouse: string): Promise<void> {
    await this.execute(`USE WAREHOUSE ${warehouse}`);
    this.warehouse = warehouse;
  }

  /**
   * Sets the current role context.
   */
  async setRole(role: string): Promise<void> {
    await this.execute(`USE ROLE ${role}`);
    this.role = role;
  }

  /**
   * Closes the session and releases the connection.
   */
  async close(): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }

    this.state = 'closing';

    try {
      await new Promise<void>((resolve, reject) => {
        this.connection.destroy((err?: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.state = 'closed';
    } catch (error) {
      this.state = 'error';
      throw new ConnectionError('Failed to close session', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Gets the underlying Snowflake connection (for advanced use cases).
   */
  getConnection(): Connection {
    return this.connection;
  }
}
