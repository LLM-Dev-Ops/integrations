/**
 * Query History Service
 *
 * Service for retrieving and analyzing Snowflake query history.
 * @module @llmdevops/snowflake-integration/metadata/history
 */

import { QueryHistoryEntry } from '../types/index.js';
import { ObjectNotFoundError } from '../errors/index.js';

/**
 * Connection interface for executing queries.
 */
export interface QueryExecutor {
  execute<T = unknown>(sql: string): Promise<T[]>;
}

/**
 * Options for filtering query history.
 */
export interface QueryHistoryOptions {
  /** Filter by warehouse name */
  warehouse?: string;
  /** Filter by user name */
  user?: string;
  /** Filter by execution status */
  status?: 'running' | 'success' | 'failed' | 'cancelled';
  /** Maximum number of results to return */
  limit?: number;
  /** Filter by query type (SELECT, INSERT, etc.) */
  queryType?: string;
  /** Filter by database name */
  database?: string;
  /** Filter by schema name */
  schema?: string;
}

/**
 * Query history service for retrieving historical query information.
 */
export class QueryHistoryService {
  constructor(private readonly executor: QueryExecutor) {}

  /**
   * Retrieves query history for a time range.
   *
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param options - Optional filters
   * @returns Array of query history entries
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const startTime = new Date('2024-01-01');
   * const endTime = new Date('2024-01-31');
   * const history = await historyService.getHistory(startTime, endTime, {
   *   warehouse: 'COMPUTE_WH',
   *   status: 'success',
   *   limit: 100
   * });
   * console.log(`Found ${history.length} queries`);
   * ```
   */
  async getHistory(
    startTime: Date,
    endTime: Date,
    options?: QueryHistoryOptions
  ): Promise<QueryHistoryEntry[]> {
    const whereClauses: string[] = [
      `START_TIME >= '${this.formatTimestamp(startTime)}'`,
      `START_TIME <= '${this.formatTimestamp(endTime)}'`,
    ];

    // Add optional filters
    if (options?.warehouse) {
      whereClauses.push(`WAREHOUSE_NAME = '${this.escapeString(options.warehouse)}'`);
    }

    if (options?.user) {
      whereClauses.push(`USER_NAME = '${this.escapeString(options.user)}'`);
    }

    if (options?.status) {
      whereClauses.push(`EXECUTION_STATUS = '${this.mapStatus(options.status)}'`);
    }

    if (options?.queryType) {
      whereClauses.push(`QUERY_TYPE = '${this.escapeString(options.queryType)}'`);
    }

    if (options?.database) {
      whereClauses.push(`DATABASE_NAME = '${this.escapeString(options.database)}'`);
    }

    if (options?.schema) {
      whereClauses.push(`SCHEMA_NAME = '${this.escapeString(options.schema)}'`);
    }

    const limit = options?.limit ?? 100;

    const sql = `
      SELECT
        QUERY_ID,
        QUERY_TEXT,
        QUERY_TYPE,
        DATABASE_NAME,
        SCHEMA_NAME,
        WAREHOUSE_NAME,
        USER_NAME,
        ROLE_NAME,
        EXECUTION_STATUS,
        ERROR_MESSAGE,
        START_TIME,
        END_TIME,
        TOTAL_ELAPSED_TIME,
        BYTES_SCANNED,
        ROWS_PRODUCED,
        CREDITS_USED_CLOUD_SERVICES
      FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY START_TIME DESC
      LIMIT ${limit}
    `;

    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    return rows.map((row) => this.parseQueryHistoryEntry(row));
  }

  /**
   * Gets details for a specific query by ID.
   *
   * @param queryId - Query ID
   * @returns Query history entry
   * @throws {ObjectNotFoundError} If the query ID is not found
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const details = await historyService.getQueryDetails('01a2b3c4-...');
   * console.log(`Query status: ${details.status}`);
   * console.log(`Execution time: ${details.executionTimeMs}ms`);
   * ```
   */
  async getQueryDetails(queryId: string): Promise<QueryHistoryEntry> {
    const sql = `
      SELECT
        QUERY_ID,
        QUERY_TEXT,
        QUERY_TYPE,
        DATABASE_NAME,
        SCHEMA_NAME,
        WAREHOUSE_NAME,
        USER_NAME,
        ROLE_NAME,
        EXECUTION_STATUS,
        ERROR_MESSAGE,
        START_TIME,
        END_TIME,
        TOTAL_ELAPSED_TIME,
        COMPILATION_TIME,
        QUEUED_PROVISIONING_TIME,
        QUEUED_REPAIR_TIME,
        QUEUED_OVERLOAD_TIME,
        BYTES_SCANNED,
        BYTES_WRITTEN,
        BYTES_SPILLED_TO_LOCAL_STORAGE,
        BYTES_SPILLED_TO_REMOTE_STORAGE,
        BYTES_SENT_OVER_THE_NETWORK,
        ROWS_PRODUCED,
        ROWS_INSERTED,
        ROWS_UPDATED,
        ROWS_DELETED,
        ROWS_UNLOADED,
        PARTITIONS_SCANNED,
        PARTITIONS_TOTAL,
        PERCENTAGE_SCANNED_FROM_CACHE,
        CREDITS_USED_CLOUD_SERVICES
      FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
      WHERE QUERY_ID = '${this.escapeString(queryId)}'
    `;

    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    if (rows.length === 0) {
      throw new ObjectNotFoundError('Query', queryId);
    }

    return this.parseQueryHistoryEntry(rows[0]!);
  }

  /**
   * Parses a query history entry from a result row.
   */
  private parseQueryHistoryEntry(row: Record<string, unknown>): QueryHistoryEntry {
    return {
      queryId: this.getString(row, 'QUERY_ID'),
      queryText: this.getString(row, 'QUERY_TEXT'),
      queryType: this.getString(row, 'QUERY_TYPE'),
      database: this.getOptionalString(row, 'DATABASE_NAME'),
      schema: this.getOptionalString(row, 'SCHEMA_NAME'),
      warehouse: this.getOptionalString(row, 'WAREHOUSE_NAME'),
      user: this.getOptionalString(row, 'USER_NAME'),
      role: this.getOptionalString(row, 'ROLE_NAME'),
      status: this.parseStatus(this.getString(row, 'EXECUTION_STATUS')),
      errorMessage: this.getOptionalString(row, 'ERROR_MESSAGE'),
      startTime: this.getDate(row, 'START_TIME'),
      endTime: this.getOptionalDate(row, 'END_TIME'),
      executionTimeMs: this.getOptionalNumber(row, 'TOTAL_ELAPSED_TIME'),
      bytesScanned: this.getOptionalNumber(row, 'BYTES_SCANNED'),
      rowsProduced: this.getOptionalNumber(row, 'ROWS_PRODUCED'),
      creditsUsed: this.getOptionalNumber(row, 'CREDITS_USED_CLOUD_SERVICES'),
    };
  }

  /**
   * Maps status enum to Snowflake status string.
   */
  private mapStatus(status: 'running' | 'success' | 'failed' | 'cancelled'): string {
    switch (status) {
      case 'running':
        return 'RUNNING';
      case 'success':
        return 'SUCCESS';
      case 'failed':
        return 'FAILED';
      case 'cancelled':
        return 'CANCELLED';
    }
  }

  /**
   * Parses Snowflake status string to status enum.
   */
  private parseStatus(
    status: string
  ): 'running' | 'success' | 'failed' | 'cancelled' {
    const upper = status.toUpperCase();
    switch (upper) {
      case 'RUNNING':
        return 'running';
      case 'SUCCESS':
        return 'success';
      case 'FAILED':
      case 'FAIL':
        return 'failed';
      case 'CANCELLED':
      case 'CANCELED':
        return 'cancelled';
      default:
        // Default to failed for unknown statuses
        return 'failed';
    }
  }

  /**
   * Formats a timestamp for SQL.
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Escapes a string for use in SQL.
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Gets a string value from a row, throwing if null/undefined.
   */
  private getString(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  /**
   * Gets an optional string value from a row.
   */
  private getOptionalString(row: Record<string, unknown>, key: string): string | undefined {
    const value = row[key];
    if (value === null || value === undefined) {
      return undefined;
    }
    const str = String(value).trim();
    return str === '' ? undefined : str;
  }

  /**
   * Gets a date value from a row, throwing if null/undefined.
   */
  private getDate(row: Record<string, unknown>, key: string): Date {
    const value = row[key];
    if (value === null || value === undefined) {
      return new Date();
    }
    if (value instanceof Date) {
      return value;
    }
    return new Date(String(value));
  }

  /**
   * Gets an optional date value from a row.
   */
  private getOptionalDate(row: Record<string, unknown>, key: string): Date | undefined {
    const value = row[key];
    if (value === null || value === undefined) {
      return undefined;
    }
    if (value instanceof Date) {
      return value;
    }
    const date = new Date(String(value));
    return isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * Gets an optional number value from a row.
   */
  private getOptionalNumber(row: Record<string, unknown>, key: string): number | undefined {
    const value = row[key];
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'number') {
      return value;
    }
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }
}
