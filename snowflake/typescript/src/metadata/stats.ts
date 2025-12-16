/**
 * Table Statistics Service
 *
 * Service for retrieving Snowflake table statistics and metrics.
 * @module @llmdevops/snowflake-integration/metadata/stats
 */

import { ObjectNotFoundError } from '../errors/index.js';

/**
 * Connection interface for executing queries.
 */
export interface QueryExecutor {
  execute<T = unknown>(sql: string): Promise<T[]>;
}

/**
 * Table statistics information.
 */
export interface TableStatistics {
  /** Approximate row count */
  rowCount: number;
  /** Size in bytes */
  bytes: number;
  /** Number of active micro-partitions */
  microPartitions?: number;
  /** Clustering depth */
  clusteringDepth?: number;
  /** Clustering keys */
  clusteringKeys?: string[];
  /** Whether auto-clustering is enabled */
  autoClusteringOn?: boolean;
  /** Last altered timestamp */
  lastAlteredAt?: Date;
  /** Percentage of table in Fail-safe */
  failsafeBytes?: number;
  /** Percentage of table in Time Travel */
  timeTravelBytes?: number;
  /** Whether table is a clone */
  isClone?: boolean;
}

/**
 * Clustering statistics for a table.
 */
export interface ClusteringInfo {
  /** Clustering keys */
  clusteringKeys: string[];
  /** Average clustering depth */
  averageDepth: number;
  /** Average overlap percentage */
  averageOverlap: number;
  /** Whether the table is well-clustered */
  isWellClustered: boolean;
  /** Recommendation for reclustering */
  reclusteringRecommendation?: string;
}

/**
 * Storage information for a table.
 */
export interface StorageInfo {
  /** Active bytes (compressed) */
  activeBytes: number;
  /** Time travel bytes */
  timeTravelBytes: number;
  /** Fail-safe bytes */
  failsafeBytes: number;
  /** Retained for clone bytes */
  cloneBytes: number;
  /** Total bytes */
  totalBytes: number;
}

/**
 * Table statistics service for retrieving table metrics.
 */
export class TableStatsService {
  constructor(private readonly executor: QueryExecutor) {}

  /**
   * Gets comprehensive statistics for a table.
   *
   * @param database - Database name
   * @param schema - Schema name
   * @param table - Table name
   * @returns Table statistics
   * @throws {ObjectNotFoundError} If the table does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const stats = await statsService.getTableStats('MYDB', 'PUBLIC', 'USERS');
   * console.log(`Rows: ${stats.rowCount}`);
   * console.log(`Size: ${stats.bytes} bytes`);
   * ```
   */
  async getTableStats(
    database: string,
    schema: string,
    table: string
  ): Promise<TableStatistics> {
    const sql = `
      SELECT
        t.ROW_COUNT,
        t.BYTES,
        t.CLUSTERING_KEY,
        t.AUTO_CLUSTERING_ON,
        t.LAST_ALTERED,
        t.IS_CLONE
      FROM ${this.quoteIdentifier(database)}.INFORMATION_SCHEMA.TABLES t
      WHERE t.TABLE_SCHEMA = '${schema.toUpperCase()}'
        AND t.TABLE_NAME = '${table.toUpperCase()}'
    `;

    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    if (rows.length === 0) {
      throw new ObjectNotFoundError('Table', `${database}.${schema}.${table}`);
    }

    const row = rows[0]!;

    return {
      rowCount: this.getNumber(row, 'ROW_COUNT'),
      bytes: this.getNumber(row, 'BYTES'),
      clusteringKeys: this.parseClusterKeys(this.getOptionalString(row, 'CLUSTERING_KEY')),
      autoClusteringOn: this.getOptionalString(row, 'AUTO_CLUSTERING_ON') === 'ON',
      lastAlteredAt: this.getOptionalDate(row, 'LAST_ALTERED'),
      isClone: this.getOptionalString(row, 'IS_CLONE') === 'Y',
    };
  }

  /**
   * Gets approximate row count for a table.
   *
   * This method uses table metadata for a fast approximate count.
   * For an exact count, use a COUNT(*) query.
   *
   * @param table - Fully qualified table name (database.schema.table)
   * @returns Approximate row count
   * @throws {ObjectNotFoundError} If the table does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const count = await statsService.getRowCount('MYDB.PUBLIC.USERS');
   * console.log(`Approximate rows: ${count}`);
   * ```
   */
  async getRowCount(table: string): Promise<number> {
    const parts = this.parseTableName(table);
    const sql = `
      SELECT ROW_COUNT
      FROM ${this.quoteIdentifier(parts.database)}.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${parts.schema.toUpperCase()}'
        AND TABLE_NAME = '${parts.table.toUpperCase()}'
    `;

    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    if (rows.length === 0) {
      throw new ObjectNotFoundError('Table', table);
    }

    return this.getNumber(rows[0]!, 'ROW_COUNT');
  }

  /**
   * Gets storage size information for a table.
   *
   * @param table - Fully qualified table name (database.schema.table)
   * @returns Storage information
   * @throws {ObjectNotFoundError} If the table does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const storage = await statsService.getStorageSize('MYDB.PUBLIC.USERS');
   * console.log(`Active: ${storage.activeBytes} bytes`);
   * console.log(`Time Travel: ${storage.timeTravelBytes} bytes`);
   * console.log(`Total: ${storage.totalBytes} bytes`);
   * ```
   */
  async getStorageSize(table: string): Promise<StorageInfo> {
    const parts = this.parseTableName(table);
    const sql = `
      SELECT
        ACTIVE_BYTES,
        TIME_TRAVEL_BYTES,
        FAILSAFE_BYTES,
        RETAINED_FOR_CLONE_BYTES
      FROM ${this.quoteIdentifier(parts.database)}.INFORMATION_SCHEMA.TABLE_STORAGE_METRICS
      WHERE TABLE_SCHEMA = '${parts.schema.toUpperCase()}'
        AND TABLE_NAME = '${parts.table.toUpperCase()}'
      ORDER BY CATALOG_CREATED DESC
      LIMIT 1
    `;

    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    if (rows.length === 0) {
      throw new ObjectNotFoundError('Table', table);
    }

    const row = rows[0]!;
    const activeBytes = this.getNumber(row, 'ACTIVE_BYTES');
    const timeTravelBytes = this.getNumber(row, 'TIME_TRAVEL_BYTES');
    const failsafeBytes = this.getNumber(row, 'FAILSAFE_BYTES');
    const cloneBytes = this.getNumber(row, 'RETAINED_FOR_CLONE_BYTES');

    return {
      activeBytes,
      timeTravelBytes,
      failsafeBytes,
      cloneBytes,
      totalBytes: activeBytes + timeTravelBytes + failsafeBytes + cloneBytes,
    };
  }

  /**
   * Gets clustering statistics for a table.
   *
   * @param table - Fully qualified table name (database.schema.table)
   * @returns Clustering information
   * @throws {ObjectNotFoundError} If the table does not exist or is not clustered
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const clustering = await statsService.getClusteringInfo('MYDB.PUBLIC.ORDERS');
   * console.log(`Clustering keys: ${clustering.clusteringKeys.join(', ')}`);
   * console.log(`Average depth: ${clustering.averageDepth}`);
   * console.log(`Well clustered: ${clustering.isWellClustered}`);
   * ```
   */
  async getClusteringInfo(table: string): Promise<ClusteringInfo> {
    const parts = this.parseTableName(table);

    // First, check if table has clustering keys
    const tableInfoSql = `
      SELECT CLUSTERING_KEY
      FROM ${this.quoteIdentifier(parts.database)}.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${parts.schema.toUpperCase()}'
        AND TABLE_NAME = '${parts.table.toUpperCase()}'
    `;

    const tableRows = await this.executor.execute<Record<string, unknown>>(tableInfoSql);

    if (tableRows.length === 0) {
      throw new ObjectNotFoundError('Table', table);
    }

    const clusteringKey = this.getOptionalString(tableRows[0]!, 'CLUSTERING_KEY');
    if (!clusteringKey) {
      throw new ObjectNotFoundError('Clustering key', `for table ${table}`);
    }

    const clusteringKeys = this.parseClusterKeys(clusteringKey) || [];

    // Get clustering statistics using SYSTEM$CLUSTERING_INFORMATION
    const clusteringSql = `
      SELECT SYSTEM$CLUSTERING_INFORMATION('${table}') AS CLUSTERING_INFO
    `;

    const clusteringRows = await this.executor.execute<Record<string, unknown>>(
      clusteringSql
    );

    if (clusteringRows.length === 0) {
      return {
        clusteringKeys,
        averageDepth: 0,
        averageOverlap: 0,
        isWellClustered: false,
      };
    }

    // Parse the clustering information JSON
    const clusteringInfo = this.parseClusteringInfo(
      this.getString(clusteringRows[0]!, 'CLUSTERING_INFO')
    );

    return {
      clusteringKeys,
      averageDepth: clusteringInfo.averageDepth,
      averageOverlap: clusteringInfo.averageOverlap,
      isWellClustered: clusteringInfo.averageDepth <= 4 && clusteringInfo.averageOverlap <= 10,
      reclusteringRecommendation:
        clusteringInfo.averageDepth > 4 || clusteringInfo.averageOverlap > 10
          ? 'Consider reclustering this table to improve query performance'
          : undefined,
    };
  }

  /**
   * Parses the SYSTEM$CLUSTERING_INFORMATION JSON response.
   */
  private parseClusteringInfo(jsonStr: string): {
    averageDepth: number;
    averageOverlap: number;
  } {
    try {
      const info = JSON.parse(jsonStr);
      return {
        averageDepth: info.average_depth || 0,
        averageOverlap: info.average_overlap_percent || 0,
      };
    } catch {
      return {
        averageDepth: 0,
        averageOverlap: 0,
      };
    }
  }

  /**
   * Parses a fully qualified table name into parts.
   */
  private parseTableName(table: string): {
    database: string;
    schema: string;
    table: string;
  } {
    const parts = table.split('.');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid table name: ${table}. Expected format: database.schema.table`
      );
    }

    return {
      database: this.unquoteIdentifier(parts[0]!),
      schema: this.unquoteIdentifier(parts[1]!),
      table: this.unquoteIdentifier(parts[2]!),
    };
  }

  /**
   * Parses clustering keys from string.
   */
  private parseClusterKeys(clusterBy: string | undefined): string[] | undefined {
    if (!clusterBy || clusterBy.trim() === '') {
      return undefined;
    }

    // Remove LINEAR() wrapper if present
    let cleaned = clusterBy.replace(/LINEAR\((.*)\)/, '$1');
    // Split by comma and trim
    return cleaned.split(',').map((key) => key.trim());
  }

  /**
   * Quotes an identifier for use in SQL.
   */
  private quoteIdentifier(identifier: string): string {
    // If already quoted, return as-is
    if (identifier.startsWith('"') && identifier.endsWith('"')) {
      return identifier;
    }

    // Check if identifier needs quoting
    const needsQuoting =
      /[^a-zA-Z0-9_]/.test(identifier) || /^[0-9]/.test(identifier);

    return needsQuoting ? `"${identifier.replace(/"/g, '""')}"` : identifier;
  }

  /**
   * Removes quotes from an identifier.
   */
  private unquoteIdentifier(identifier: string): string {
    if (identifier.startsWith('"') && identifier.endsWith('"')) {
      return identifier.slice(1, -1).replace(/""/g, '"');
    }
    return identifier;
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
   * Gets a number value from a row.
   */
  private getNumber(row: Record<string, unknown>, key: string): number {
    const value = row[key];
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    const num = Number(value);
    return isNaN(num) ? 0 : num;
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
}
