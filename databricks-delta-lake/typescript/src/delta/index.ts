/**
 * Delta Lake Client for Databricks
 *
 * Provides comprehensive Delta Lake operations including:
 * - Table read/write with time travel
 * - MERGE INTO (upsert) operations
 * - Conditional updates and deletes
 * - Table maintenance (OPTIMIZE, VACUUM)
 * - Version history and restore
 * - Batch write optimization
 *
 * @module @llmdevops/databricks-delta-lake-integration/delta
 */

import {
  ReadOptions,
  WriteMode,
  WriteResult,
  MergeResult,
  HistoryEntry,
  OptimizeOptions,
  OptimizeResult,
  VacuumResult,
  StatementResult,
  ColumnInfo,
  Row,
} from '../types/index.js';
import {
  DeltaError,
  TableNotFound,
  SchemaEvolutionConflict,
  ConcurrentModification,
} from '../errors/index.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * SQL Client interface for executing statements
 */
export interface SqlClient {
  execute(sql: string): Promise<StatementResult>;
  executeStreaming?(sql: string): AsyncIterable<Row>;
}

/**
 * Write options for batch operations
 */
export interface WriteOptions {
  /** Write mode (first batch uses this, subsequent batches append) */
  mode: WriteMode;
  /** Batch size for chunking large datasets */
  batchSize?: number;
  /** Maximum concurrent write operations */
  concurrency?: number;
  /** Enable schema evolution */
  schemaEvolution?: boolean;
}

/**
 * Merge matched action
 */
export interface MatchedAction {
  /** Optional condition for this action */
  condition?: string;
  /** Action type */
  type: 'update' | 'delete';
  /** SET clause for updates */
  setClause?: string;
}

/**
 * Merge not-matched action
 */
export interface NotMatchedAction {
  /** Optional condition for this action */
  condition?: string;
  /** Action type */
  type: 'insert' | 'insert_all';
  /** Column names for insert */
  columns?: string;
  /** VALUES clause for insert */
  values?: string;
}

/**
 * Dry run result for write operations
 */
export interface DryRunResult {
  /** Whether the write would succeed */
  wouldWrite: boolean;
  /** Estimated size in bytes */
  estimatedSizeBytes: number;
  /** Estimated number of partitions */
  estimatedPartitions: number;
  /** Warnings about the operation */
  warnings: string[];
  /** Write mode that would be used */
  mode: WriteMode;
}

// ============================================================================
// Semaphore for Concurrency Control
// ============================================================================

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const resolve = this.queue.shift();
    if (resolve) {
      this.permits--;
      resolve();
    }
  }
}

// ============================================================================
// Delta Client
// ============================================================================

/**
 * Delta Lake client for table operations
 */
export class DeltaClient {
  private readonly sqlClient: SqlClient;
  private readonly catalog: string;
  private readonly schema: string;

  /**
   * Create a new Delta Lake client
   *
   * @param sqlClient - SQL client for executing statements
   * @param catalog - Default catalog name
   * @param schema - Default schema name
   */
  constructor(sqlClient: SqlClient, catalog: string, schema: string) {
    this.sqlClient = sqlClient;
    this.catalog = catalog;
    this.schema = schema;
  }

  /**
   * Get fully qualified table path
   *
   * @param table - Table name
   * @returns Fully qualified table path (catalog.schema.table)
   */
  tablePath(table: string): string {
    return `${this.catalog}.${this.schema}.${table}`;
  }

  /**
   * Read table data with optional time travel
   *
   * @param table - Table name
   * @param options - Read options (columns, filter, version, timestamp, limit)
   * @returns Array of rows as objects
   */
  async readTable<T = Record<string, unknown>>(
    table: string,
    options: ReadOptions = {}
  ): Promise<T[]> {
    const span = { name: 'databricks.delta.read', table: this.tablePath(table) };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      // Build SELECT query
      const columns = options.columns?.join(', ') || '*';
      let sql = `SELECT ${columns} FROM ${this.tablePath(table)}`;

      // Add time travel
      if (options.version !== undefined) {
        sql += ` VERSION AS OF ${options.version}`;
      } else if (options.timestamp) {
        sql += ` TIMESTAMP AS OF '${options.timestamp}'`;
      }

      // Add filter
      if (options.filter) {
        sql += ` WHERE ${options.filter}`;
      }

      // Add limit
      if (options.limit !== undefined) {
        sql += ` LIMIT ${options.limit}`;
      }

      const result = await this.sqlClient.execute(sql);

      // Convert rows to typed objects
      const rows = result.rows.map((row) =>
        this.deserializeRow<T>(row, result.schema)
      );

      // Metrics
      console.debug(
        `[METRIC] databricks_delta_rows_processed{table="${table}",operation="read"} ${rows.length}`
      );

      return rows;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TABLE_OR_VIEW_NOT_FOUND')) {
        throw new TableNotFound(this.tablePath(table));
      }
      throw error;
    }
  }

  /**
   * Write data to a Delta table
   *
   * @param table - Table name
   * @param data - Array of data to write
   * @param mode - Write mode (append, overwrite, error_if_exists)
   * @returns Write result with affected rows
   */
  async writeTable<T = Record<string, unknown>>(
    table: string,
    data: T[],
    mode: WriteMode = 'append'
  ): Promise<WriteResult> {
    const span = {
      name: 'databricks.delta.write',
      table: this.tablePath(table),
      operation: mode,
    };
    console.debug(`[TRACE] ${span.name}`, span);

    if (data.length === 0) {
      return { rowsAffected: 0 };
    }

    try {
      const sql = this.buildWriteSql(table, data, mode);
      await this.sqlClient.execute(sql);

      // Metrics
      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="write"} 1`
      );
      console.debug(
        `[METRIC] databricks_delta_rows_processed{table="${table}",operation="write"} ${data.length}`
      );

      return {
        rowsAffected: data.length,
        filesWritten: 1,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('CONCURRENT_MODIFICATION')) {
          throw new ConcurrentModification(this.tablePath(table));
        }
        if (error.message.includes('SCHEMA_EVOLUTION')) {
          throw new SchemaEvolutionConflict(this.tablePath(table));
        }
      }
      throw error;
    }
  }

  /**
   * Write data in batches with concurrency control
   *
   * @param table - Table name
   * @param data - Array of data to write
   * @param options - Write options including batch size and concurrency
   * @returns Write result with total affected rows
   */
  async writeBatch<T = Record<string, unknown>>(
    table: string,
    data: T[],
    options: WriteOptions
  ): Promise<WriteResult> {
    const batchSize = options.batchSize || 10000;
    const concurrency = options.concurrency || 4;

    if (data.length <= batchSize) {
      return this.writeTable(table, data, options.mode);
    }

    const span = {
      name: 'databricks.delta.write_batch',
      table: this.tablePath(table),
      batches: Math.ceil(data.length / batchSize),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    // Split data into chunks
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      chunks.push(data.slice(i, i + batchSize));
    }

    // Write chunks in parallel with concurrency control
    const semaphore = new Semaphore(concurrency);
    const results: WriteResult[] = [];

    const writePromises = chunks.map(async (chunk, index) => {
      await semaphore.acquire();
      try {
        // First chunk uses specified mode, rest append
        const mode = index === 0 ? options.mode : 'append';
        const result = await this.writeTable(table, chunk, mode);
        results.push(result);
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(writePromises);

    // Aggregate results
    const totalRows = results.reduce((sum, r) => sum + r.rowsAffected, 0);
    const totalFiles = results.reduce((sum, r) => sum + (r.filesWritten || 0), 0);

    return {
      rowsAffected: totalRows,
      filesWritten: totalFiles,
    };
  }

  /**
   * Perform a MERGE INTO operation (upsert)
   *
   * @param table - Target table name
   * @param sourceData - Source data for merge
   * @param mergeCondition - Merge condition (e.g., "target.id = source.id")
   * @param whenMatched - Optional matched action
   * @param whenNotMatched - Optional not-matched action
   * @returns Merge result with row counts
   */
  async mergeInto<T = Record<string, unknown>>(
    table: string,
    sourceData: T[],
    mergeCondition: string,
    whenMatched?: MatchedAction,
    whenNotMatched?: NotMatchedAction
  ): Promise<MergeResult> {
    const span = {
      name: 'databricks.delta.merge',
      table: this.tablePath(table),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    if (sourceData.length === 0) {
      return { rowsMatched: 0, rowsInserted: 0, rowsDeleted: 0 };
    }

    try {
      // Create temporary view from source data
      const tempView = `temp_merge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const createViewSql = this.buildTempViewSql(tempView, sourceData);
      await this.sqlClient.execute(createViewSql);

      try {
        // Build MERGE statement
        let sql = `MERGE INTO ${this.tablePath(table)} AS target USING ${tempView} AS source ON ${mergeCondition}`;

        // Add WHEN MATCHED clause
        if (whenMatched) {
          if (whenMatched.condition) {
            sql += ` WHEN MATCHED AND ${whenMatched.condition}`;
          } else {
            sql += ` WHEN MATCHED`;
          }

          if (whenMatched.type === 'update') {
            sql += ` THEN UPDATE SET ${whenMatched.setClause}`;
          } else if (whenMatched.type === 'delete') {
            sql += ` THEN DELETE`;
          }
        }

        // Add WHEN NOT MATCHED clause
        if (whenNotMatched) {
          if (whenNotMatched.condition) {
            sql += ` WHEN NOT MATCHED AND ${whenNotMatched.condition}`;
          } else {
            sql += ` WHEN NOT MATCHED`;
          }

          if (whenNotMatched.type === 'insert') {
            sql += ` THEN INSERT (${whenNotMatched.columns}) VALUES (${whenNotMatched.values})`;
          } else if (whenNotMatched.type === 'insert_all') {
            sql += ` THEN INSERT *`;
          }
        }

        const result = await this.sqlClient.execute(sql);

        // Parse metrics from result
        const mergeResult = this.parseMergeMetrics(result);

        // Metrics
        console.debug(
          `[METRIC] databricks_delta_operations_total{table="${table}",operation="merge"} 1`
        );

        return mergeResult;
      } finally {
        // Clean up temp view
        await this.sqlClient.execute(`DROP VIEW IF EXISTS ${tempView}`).catch(() => {
          // Ignore cleanup errors
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('CONCURRENT_MODIFICATION')) {
        throw new ConcurrentModification(this.tablePath(table));
      }
      throw error;
    }
  }

  /**
   * Delete rows from a table based on a condition
   *
   * @param table - Table name
   * @param condition - WHERE clause condition
   * @returns Number of rows deleted
   */
  async deleteFrom(table: string, condition: string): Promise<number> {
    const span = {
      name: 'databricks.delta.delete',
      table: this.tablePath(table),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      const sql = `DELETE FROM ${this.tablePath(table)} WHERE ${condition}`;
      const result = await this.sqlClient.execute(sql);

      const rowsDeleted = this.parseAffectedRows(result);

      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="delete"} 1`
      );
      console.debug(
        `[METRIC] databricks_delta_rows_processed{table="${table}",operation="delete"} ${rowsDeleted}`
      );

      return rowsDeleted;
    } catch (error) {
      if (error instanceof Error && error.message.includes('CONCURRENT_MODIFICATION')) {
        throw new ConcurrentModification(this.tablePath(table));
      }
      throw error;
    }
  }

  /**
   * Update rows in a table based on a condition
   *
   * @param table - Table name
   * @param setClause - SET clause (e.g., "column1 = value1, column2 = value2")
   * @param condition - WHERE clause condition
   * @returns Number of rows updated
   */
  async updateTable(table: string, setClause: string, condition: string): Promise<number> {
    const span = {
      name: 'databricks.delta.update',
      table: this.tablePath(table),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      const sql = `UPDATE ${this.tablePath(table)} SET ${setClause} WHERE ${condition}`;
      const result = await this.sqlClient.execute(sql);

      const rowsUpdated = this.parseAffectedRows(result);

      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="update"} 1`
      );
      console.debug(
        `[METRIC] databricks_delta_rows_processed{table="${table}",operation="update"} ${rowsUpdated}`
      );

      return rowsUpdated;
    } catch (error) {
      if (error instanceof Error && error.message.includes('CONCURRENT_MODIFICATION')) {
        throw new ConcurrentModification(this.tablePath(table));
      }
      throw error;
    }
  }

  /**
   * Optimize a Delta table (compaction)
   *
   * @param table - Table name
   * @param options - Optimize options (where clause, z-order columns)
   * @returns Optimize result with file statistics
   */
  async optimize(table: string, options: OptimizeOptions = {}): Promise<OptimizeResult> {
    const span = {
      name: 'databricks.delta.optimize',
      table: this.tablePath(table),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      let sql = `OPTIMIZE ${this.tablePath(table)}`;

      // Add WHERE clause for partition pruning
      if (options.whereClause) {
        sql += ` WHERE ${options.whereClause}`;
      }

      // Add ZORDER BY for co-location
      if (options.zorderColumns && options.zorderColumns.length > 0) {
        sql += ` ZORDER BY (${options.zorderColumns.join(', ')})`;
      }

      const result = await this.sqlClient.execute(sql);

      const optimizeResult = this.parseOptimizeMetrics(result);

      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="optimize"} 1`
      );
      console.debug(
        `[METRIC] databricks_delta_bytes_processed{table="${table}",operation="optimize"} ${optimizeResult.bytesRemoved}`
      );

      return optimizeResult;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Vacuum a Delta table (remove old files)
   *
   * @param table - Table name
   * @param retentionHours - Optional retention period in hours (default: 168 = 7 days)
   * @returns Vacuum result with deleted file statistics
   */
  async vacuum(table: string, retentionHours?: number): Promise<VacuumResult> {
    const span = {
      name: 'databricks.delta.vacuum',
      table: this.tablePath(table),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      let sql = `VACUUM ${this.tablePath(table)}`;

      if (retentionHours !== undefined) {
        sql += ` RETAIN ${retentionHours} HOURS`;
      }

      const result = await this.sqlClient.execute(sql);

      const vacuumResult = this.parseVacuumMetrics(result);

      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="vacuum"} 1`
      );
      console.debug(
        `[METRIC] databricks_delta_bytes_processed{table="${table}",operation="vacuum"} ${vacuumResult.bytesFreed}`
      );

      return vacuumResult;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get version history for a Delta table
   *
   * @param table - Table name
   * @param limit - Optional limit on number of versions to return
   * @returns Array of history entries
   */
  async describeHistory(table: string, limit?: number): Promise<HistoryEntry[]> {
    const span = {
      name: 'databricks.delta.history',
      table: this.tablePath(table),
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      let sql = `DESCRIBE HISTORY ${this.tablePath(table)}`;

      if (limit !== undefined) {
        sql += ` LIMIT ${limit}`;
      }

      const result = await this.sqlClient.execute(sql);

      const history = result.rows.map((row) => this.parseHistoryEntry(row, result.schema));

      return history;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TABLE_OR_VIEW_NOT_FOUND')) {
        throw new TableNotFound(this.tablePath(table));
      }
      throw error;
    }
  }

  /**
   * Restore a Delta table to a specific version
   *
   * @param table - Table name
   * @param version - Version number to restore to
   */
  async restoreVersion(table: string, version: number): Promise<void> {
    const span = {
      name: 'databricks.delta.restore',
      table: this.tablePath(table),
      version,
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      const sql = `RESTORE TABLE ${this.tablePath(table)} TO VERSION AS OF ${version}`;
      await this.sqlClient.execute(sql);

      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="restore"} 1`
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Restore a Delta table to a specific timestamp
   *
   * @param table - Table name
   * @param timestamp - Timestamp to restore to (ISO 8601 format)
   */
  async restoreTimestamp(table: string, timestamp: string): Promise<void> {
    const span = {
      name: 'databricks.delta.restore',
      table: this.tablePath(table),
      timestamp,
    };
    console.debug(`[TRACE] ${span.name}`, span);

    try {
      const sql = `RESTORE TABLE ${this.tablePath(table)} TO TIMESTAMP AS OF '${timestamp}'`;
      await this.sqlClient.execute(sql);

      console.debug(
        `[METRIC] databricks_delta_operations_total{table="${table}",operation="restore"} 1`
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Perform a dry run of a write operation
   *
   * @param table - Table name
   * @param data - Data that would be written
   * @param mode - Write mode
   * @returns Dry run result with estimates and warnings
   */
  async writeDryRun<T = Record<string, unknown>>(
    table: string,
    data: T[],
    mode: WriteMode = 'append'
  ): Promise<DryRunResult> {
    const warnings: string[] = [];

    // Estimate size (rough approximation)
    const jsonSize = JSON.stringify(data).length;
    const estimatedSizeBytes = Math.floor(jsonSize * 0.7); // Parquet is ~30% smaller

    // Check for large writes
    if (data.length > 1000000) {
      warnings.push('Large write detected (>1M rows). Consider using writeBatch() for better performance.');
    }

    // Estimate partitions (assume ~10MB per partition)
    const estimatedPartitions = Math.max(1, Math.floor(estimatedSizeBytes / (10 * 1024 * 1024)));

    if (estimatedPartitions > 100) {
      warnings.push(
        `High partition count (${estimatedPartitions}). This may impact performance. Consider repartitioning.`
      );
    }

    return {
      wouldWrite: true,
      estimatedSizeBytes,
      estimatedPartitions,
      warnings,
      mode,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Build SQL for writing data using VALUES clause
   */
  private buildWriteSql<T>(table: string, data: T[], mode: WriteMode): string {
    if (data.length === 0) {
      throw new Error('Cannot build write SQL with empty data');
    }

    // Get column names from first record
    const firstRecord = data[0] as Record<string, unknown>;
    const columns = Object.keys(firstRecord);

    // Build VALUES clause
    const values = data.map((record) => {
      const row = record as Record<string, unknown>;
      const valueList = columns.map((col) => this.formatValue(row[col])).join(', ');
      return `(${valueList})`;
    });

    const modeClause = mode === 'overwrite' ? 'INSERT OVERWRITE' : 'INSERT INTO';

    return `${modeClause} ${this.tablePath(table)} (${columns.join(', ')}) VALUES ${values.join(', ')}`;
  }

  /**
   * Build SQL for creating temporary view from data
   */
  private buildTempViewSql<T>(viewName: string, data: T[]): string {
    if (data.length === 0) {
      throw new Error('Cannot build temp view SQL with empty data');
    }

    const firstRecord = data[0] as Record<string, unknown>;
    const columns = Object.keys(firstRecord);

    const values = data.map((record) => {
      const row = record as Record<string, unknown>;
      const valueList = columns.map((col) => this.formatValue(row[col])).join(', ');
      return `(${valueList})`;
    });

    return `CREATE OR REPLACE TEMPORARY VIEW ${viewName} AS SELECT * FROM VALUES ${values.join(', ')} AS t(${columns.join(', ')})`;
  }

  /**
   * Format a value for SQL
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    // For objects/arrays, serialize to JSON string
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  /**
   * Deserialize a row to typed object
   */
  private deserializeRow<T>(row: Row, schema: ColumnInfo[]): T {
    const obj: Record<string, unknown> = {};
    schema.forEach((col, index) => {
      obj[col.name] = row[index];
    });
    return obj as T;
  }

  /**
   * Parse affected rows from statement result
   */
  private parseAffectedRows(result: StatementResult): number {
    // Try to extract from rows (some operations return a summary row)
    if (result.rows.length > 0) {
      const firstRow = result.rows[0];
      // Look for common result columns
      if (Array.isArray(firstRow)) {
        const numValue = firstRow.find((val) => typeof val === 'number');
        if (numValue !== undefined) {
          return numValue as number;
        }
      }
    }
    return 0;
  }

  /**
   * Parse merge metrics from result
   */
  private parseMergeMetrics(result: StatementResult): MergeResult {
    // Default metrics
    const metrics: MergeResult = {
      rowsMatched: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsDeleted: 0,
    };

    // Try to extract metrics from result rows
    if (result.rows.length > 0) {
      const row = result.rows[0];
      if (Array.isArray(row)) {
        // Assuming metrics are in order: matched, inserted, updated, deleted
        if (row.length >= 2) {
          metrics.rowsMatched = (row[0] as number) || 0;
          metrics.rowsInserted = (row[1] as number) || 0;
        }
        if (row.length >= 3) {
          metrics.rowsUpdated = (row[2] as number) || 0;
        }
        if (row.length >= 4) {
          metrics.rowsDeleted = (row[3] as number) || 0;
        }
      }
    }

    return metrics;
  }

  /**
   * Parse optimize metrics from result
   */
  private parseOptimizeMetrics(result: StatementResult): OptimizeResult {
    const metrics: OptimizeResult = {
      filesRemoved: 0,
      filesAdded: 0,
      bytesRemoved: 0,
      bytesAdded: 0,
    };

    if (result.rows.length > 0) {
      const row = result.rows[0];
      if (Array.isArray(row)) {
        // Extract metrics from result (positions may vary)
        metrics.filesRemoved = (row[0] as number) || 0;
        metrics.filesAdded = (row[1] as number) || 0;
        if (row.length >= 4) {
          metrics.bytesRemoved = (row[2] as number) || 0;
          metrics.bytesAdded = (row[3] as number) || 0;
        }
      }
    }

    return metrics;
  }

  /**
   * Parse vacuum metrics from result
   */
  private parseVacuumMetrics(result: StatementResult): VacuumResult {
    const metrics: VacuumResult = {
      filesDeleted: 0,
      bytesFreed: 0,
    };

    if (result.rows.length > 0) {
      const row = result.rows[0];
      if (Array.isArray(row)) {
        metrics.filesDeleted = (row[0] as number) || 0;
        if (row.length >= 2) {
          metrics.bytesFreed = (row[1] as number) || 0;
        }
      }
    }

    return metrics;
  }

  /**
   * Parse history entry from row
   */
  private parseHistoryEntry(row: Row, schema: ColumnInfo[]): HistoryEntry {
    const obj = this.deserializeRow<Record<string, unknown>>(row, schema);

    return {
      version: (obj.version as number) || 0,
      timestamp: (obj.timestamp as string) || '',
      userId: obj.userId as string | undefined,
      userName: obj.userName as string | undefined,
      operation: (obj.operation as string) || '',
      operationParameters: obj.operationParameters as Record<string, unknown> | undefined,
      operationMetrics: obj.operationMetrics as Record<string, number> | undefined,
      clusterId: obj.clusterId as string | undefined,
      readVersion: obj.readVersion as number | undefined,
      isolationLevel: obj.isolationLevel as string | undefined,
      isBlindAppend: obj.isBlindAppend as boolean | undefined,
    };
  }
}

// ============================================================================
// Merge Builder (Fluent API)
// ============================================================================

/**
 * Fluent builder for complex MERGE operations
 */
export class MergeBuilder<T = Record<string, unknown>> {
  private readonly client: DeltaClient;
  private readonly targetTable: string;
  private sourceTable?: string;
  private sourceData?: T[];
  private mergeCondition?: string;
  private matchedActions: MatchedAction[] = [];
  private notMatchedActions: NotMatchedAction[] = [];

  constructor(client: DeltaClient, targetTable: string) {
    this.client = client;
    this.targetTable = targetTable;
  }

  /**
   * Specify source table for merge
   */
  usingSource(sourceTable: string): this {
    this.sourceTable = sourceTable;
    this.sourceData = undefined;
    return this;
  }

  /**
   * Specify source data for merge
   */
  usingValues(data: T[]): this {
    this.sourceData = data;
    this.sourceTable = undefined;
    return this;
  }

  /**
   * Specify merge condition
   */
  on(condition: string): this {
    this.mergeCondition = condition;
    return this;
  }

  /**
   * Add WHEN MATCHED THEN UPDATE action
   */
  whenMatchedUpdate(setClause: string): this {
    this.matchedActions.push({
      type: 'update',
      setClause,
    });
    return this;
  }

  /**
   * Add conditional WHEN MATCHED THEN UPDATE action
   */
  whenMatchedUpdateIf(condition: string, setClause: string): this {
    this.matchedActions.push({
      type: 'update',
      condition,
      setClause,
    });
    return this;
  }

  /**
   * Add WHEN MATCHED THEN DELETE action
   */
  whenMatchedDelete(): this {
    this.matchedActions.push({
      type: 'delete',
    });
    return this;
  }

  /**
   * Add WHEN NOT MATCHED THEN INSERT action
   */
  whenNotMatchedInsert(columns: string, values: string): this {
    this.notMatchedActions.push({
      type: 'insert',
      columns,
      values,
    });
    return this;
  }

  /**
   * Add WHEN NOT MATCHED THEN INSERT * action
   */
  whenNotMatchedInsertAll(): this {
    this.notMatchedActions.push({
      type: 'insert_all',
    });
    return this;
  }

  /**
   * Build the MERGE SQL statement
   */
  buildSql(): string {
    if (!this.mergeCondition) {
      throw new Error('Merge condition (ON clause) is required');
    }

    if (!this.sourceTable && !this.sourceData) {
      throw new Error('Source table or source data is required');
    }

    const source = this.sourceTable || 'source_data';
    let sql = `MERGE INTO ${this.client.tablePath(this.targetTable)} AS target USING ${source} AS source ON ${this.mergeCondition}`;

    // Add WHEN MATCHED actions
    for (const action of this.matchedActions) {
      if (action.condition) {
        sql += ` WHEN MATCHED AND ${action.condition}`;
      } else {
        sql += ` WHEN MATCHED`;
      }

      if (action.type === 'update') {
        sql += ` THEN UPDATE SET ${action.setClause}`;
      } else if (action.type === 'delete') {
        sql += ` THEN DELETE`;
      }
    }

    // Add WHEN NOT MATCHED actions
    for (const action of this.notMatchedActions) {
      if (action.condition) {
        sql += ` WHEN NOT MATCHED AND ${action.condition}`;
      } else {
        sql += ` WHEN NOT MATCHED`;
      }

      if (action.type === 'insert') {
        sql += ` THEN INSERT (${action.columns}) VALUES (${action.values})`;
      } else if (action.type === 'insert_all') {
        sql += ` THEN INSERT *`;
      }
    }

    return sql;
  }

  /**
   * Execute the MERGE operation
   */
  async execute(): Promise<MergeResult> {
    if (!this.sourceData) {
      throw new Error('Source data is required for execution. Use usingValues()');
    }

    if (!this.mergeCondition) {
      throw new Error('Merge condition is required. Use on()');
    }

    // Use the first matched and not-matched actions
    const whenMatched = this.matchedActions[0];
    const whenNotMatched = this.notMatchedActions[0];

    return this.client.mergeInto(
      this.targetTable,
      this.sourceData,
      this.mergeCondition,
      whenMatched,
      whenNotMatched
    );
  }
}
