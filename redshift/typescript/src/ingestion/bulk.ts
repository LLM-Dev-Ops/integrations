/**
 * Redshift Bulk Insert Operations
 *
 * Efficient bulk insert operations using multi-row INSERT statements
 * and PostgreSQL extended protocol.
 * @module @llmdevops/redshift-integration/ingestion/bulk
 */

import { ConfigurationError, RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// Connection Pool Interface
// ============================================================================

/**
 * Minimal connection pool interface for bulk operations.
 */
export interface ConnectionPool {
  /**
   * Executes a query on the connection pool.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @returns Query result
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

/**
 * Query result interface.
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[];
  /** Number of rows affected */
  rowCount?: number;
  /** Command type (SELECT, INSERT, etc.) */
  command?: string;
}

// ============================================================================
// Bulk Insert Options
// ============================================================================

/**
 * Options for bulk insert operations.
 */
export interface BulkInsertOptions {
  /** Number of rows per batch (default: 1000) */
  batchSize?: number;
  /** Error handling strategy */
  onError?: 'CONTINUE' | 'ABORT';
  /** List of columns to insert (if not all columns from records) */
  columns?: string[];
  /** Whether to use prepared statements for efficiency */
  usePreparedStatements?: boolean;
}

/**
 * Result of a bulk insert operation.
 */
export interface BulkInsertResult {
  /** Total number of rows successfully inserted */
  rowsInserted: number;
  /** Number of rows that failed to insert */
  failedRows: number;
  /** Error details for failed rows */
  errors?: BulkInsertError[];
  /** Number of batches processed */
  batchesProcessed: number;
}

/**
 * Error information for failed bulk insert rows.
 */
export interface BulkInsertError {
  /** Batch number where error occurred */
  batchNumber: number;
  /** Row index within batch */
  rowIndex?: number;
  /** Error message */
  error: string;
  /** Row data that caused the error */
  rowData?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default batch size for bulk inserts.
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Maximum parameters in a single query (PostgreSQL/Redshift limit).
 * Redshift supports up to 32767 parameters per statement.
 */
const MAX_PARAMETERS = 32767;

// ============================================================================
// Bulk Insert Class
// ============================================================================

/**
 * Bulk insert executor for efficient data loading.
 *
 * Uses multi-row INSERT statements with parameterized queries for
 * optimal performance and security.
 *
 * @example
 * ```typescript
 * const bulkInsert = new BulkInsert(pool);
 *
 * const records = [
 *   { id: 1, name: 'Alice', age: 30 },
 *   { id: 2, name: 'Bob', age: 25 },
 *   // ... more records
 * ];
 *
 * const result = await bulkInsert.insert('users', records, {
 *   batchSize: 500,
 *   onError: 'CONTINUE'
 * });
 *
 * console.log(`Inserted ${result.rowsInserted} rows`);
 * ```
 */
export class BulkInsert {
  private readonly pool: ConnectionPool;

  /**
   * Creates a new bulk insert executor.
   *
   * @param pool - Connection pool for executing queries
   */
  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  /**
   * Inserts multiple records into a table.
   *
   * @param table - Target table name
   * @param rows - Array of records to insert
   * @param options - Bulk insert options
   * @returns Bulk insert result
   * @throws {ConfigurationError} If table or rows are invalid
   * @throws {RedshiftError} If insert operation fails
   *
   * @example
   * ```typescript
   * const result = await bulkInsert.insert('products', [
   *   { product_id: 1, name: 'Widget', price: 19.99 },
   *   { product_id: 2, name: 'Gadget', price: 29.99 }
   * ]);
   * ```
   */
  async insert(
    table: string,
    rows: Record<string, unknown>[],
    options: BulkInsertOptions = {}
  ): Promise<BulkInsertResult> {
    // Validate inputs
    this.validateInputs(table, rows);

    // Handle empty rows
    if (rows.length === 0) {
      return {
        rowsInserted: 0,
        failedRows: 0,
        batchesProcessed: 0,
      };
    }

    // Extract column names
    const columns = options.columns || this.extractColumns(rows);

    // Determine batch size
    const batchSize = this.calculateOptimalBatchSize(
      options.batchSize || DEFAULT_BATCH_SIZE,
      columns.length
    );

    // Batch and insert
    return await this.insertBatches(table, rows, columns, batchSize, options.onError || 'ABORT');
  }

  /**
   * Validates insert inputs.
   */
  private validateInputs(table: string, rows: Record<string, unknown>[]): void {
    if (!table || table.trim().length === 0) {
      throw new ConfigurationError('Table name cannot be empty');
    }

    if (!Array.isArray(rows)) {
      throw new ConfigurationError('Rows must be an array');
    }

    if (rows.length > 0) {
      // Validate first row has columns
      const firstRow = rows[0]!;
      if (typeof firstRow !== 'object' || firstRow === null) {
        throw new ConfigurationError('Each row must be an object');
      }

      const columns = Object.keys(firstRow);
      if (columns.length === 0) {
        throw new ConfigurationError('Rows must have at least one column');
      }

      // Validate all rows have same columns
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]!;
        const rowColumns = Object.keys(row);
        if (rowColumns.length !== columns.length) {
          throw new ConfigurationError(`Row ${i} has different column count than first row`);
        }

        for (const col of columns) {
          if (!(col in row)) {
            throw new ConfigurationError(`Row ${i} missing column: ${col}`);
          }
        }
      }
    }
  }

  /**
   * Extracts column names from rows.
   */
  private extractColumns(rows: Record<string, unknown>[]): string[] {
    if (rows.length === 0) {
      return [];
    }
    return Object.keys(rows[0]!);
  }

  /**
   * Calculates optimal batch size based on column count and parameter limit.
   */
  private calculateOptimalBatchSize(requestedBatchSize: number, columnCount: number): number {
    // Calculate max rows per batch based on parameter limit
    const maxRowsPerBatch = Math.floor(MAX_PARAMETERS / columnCount);

    // Use the minimum of requested batch size and calculated max
    return Math.min(requestedBatchSize, maxRowsPerBatch);
  }

  /**
   * Inserts rows in batches.
   */
  private async insertBatches(
    table: string,
    rows: Record<string, unknown>[],
    columns: string[],
    batchSize: number,
    onError: 'CONTINUE' | 'ABORT'
  ): Promise<BulkInsertResult> {
    let totalInserted = 0;
    let totalFailed = 0;
    let batchesProcessed = 0;
    const errors: BulkInsertError[] = [];

    // Process batches
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      batchesProcessed++;

      try {
        const rowsAffected = await this.insertBatch(table, batch, columns);
        totalInserted += rowsAffected;
      } catch (error) {
        totalFailed += batch.length;

        errors.push({
          batchNumber: batchesProcessed,
          error: error instanceof Error ? error.message : String(error),
        });

        if (onError === 'ABORT') {
          throw new RedshiftError(
            `Bulk insert failed at batch ${batchesProcessed}: ${error instanceof Error ? error.message : String(error)}`,
            RedshiftErrorCode.QUERY_FAILED,
            {
              cause: error instanceof Error ? error : undefined,
              retryable: false,
              context: {
                table,
                batchNumber: batchesProcessed,
                batchSize: batch.length,
              },
            }
          );
        }
        // CONTINUE - log error but keep going
      }
    }

    return {
      rowsInserted: totalInserted,
      failedRows: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
      batchesProcessed,
    };
  }

  /**
   * Inserts a single batch of rows.
   */
  private async insertBatch(
    table: string,
    batch: Record<string, unknown>[],
    columns: string[]
  ): Promise<number> {
    // Build INSERT statement with parameterized values
    const sql = this.buildInsertSql(table, columns, batch.length);

    // Flatten row values into parameter array
    const params: unknown[] = [];
    for (const row of batch) {
      for (const col of columns) {
        params.push(row[col]);
      }
    }

    // Execute insert
    const result = await this.pool.query(sql, params);
    return result.rowCount || 0;
  }

  /**
   * Builds parameterized INSERT SQL statement.
   *
   * @param table - Table name
   * @param columns - Column names
   * @param rowCount - Number of rows in batch
   * @returns SQL INSERT statement
   *
   * @example
   * ```
   * // buildInsertSql('users', ['id', 'name'], 2)
   * // Returns:
   * // INSERT INTO users (id, name) VALUES ($1, $2), ($3, $4)
   * ```
   */
  private buildInsertSql(table: string, columns: string[], rowCount: number): string {
    const columnList = columns.map((col) => this.quoteIdentifier(col)).join(', ');

    const valuePlaceholders: string[] = [];
    let paramIndex = 1;

    for (let i = 0; i < rowCount; i++) {
      const rowPlaceholders: string[] = [];
      for (let j = 0; j < columns.length; j++) {
        rowPlaceholders.push(`$${paramIndex++}`);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    return `INSERT INTO ${this.quoteIdentifier(table)} (${columnList}) VALUES ${valuePlaceholders.join(', ')}`;
  }

  /**
   * Quotes an identifier for SQL (prevents SQL injection).
   *
   * @param identifier - Identifier to quote
   * @returns Quoted identifier
   */
  private quoteIdentifier(identifier: string): string {
    // Double quotes for identifiers, escape existing double quotes
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Batches records into chunks.
 *
 * @param records - Records to batch
 * @param batchSize - Size of each batch
 * @returns Array of batches
 *
 * @example
 * ```typescript
 * const records = [1, 2, 3, 4, 5];
 * const batches = batchRecords(records, 2);
 * // Returns: [[1, 2], [3, 4], [5]]
 * ```
 */
export function batchRecords<T>(records: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Validates records for bulk insert.
 *
 * @param records - Records to validate
 * @throws {ConfigurationError} If records are invalid
 *
 * @example
 * ```typescript
 * validateBulkRecords([
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' }
 * ]); // OK
 *
 * validateBulkRecords([
 *   { id: 1, name: 'Alice' },
 *   { id: 2 } // Missing 'name' - throws error
 * ]);
 * ```
 */
export function validateBulkRecords(records: Record<string, unknown>[]): void {
  if (!records || records.length === 0) {
    throw new ConfigurationError('Records cannot be empty');
  }

  // Get column names from first record
  const firstRecord = records[0]!;
  const columns = Object.keys(firstRecord);

  if (columns.length === 0) {
    throw new ConfigurationError('Records must have at least one column');
  }

  // Validate all records have same columns
  for (let i = 1; i < records.length; i++) {
    const recordColumns = Object.keys(records[i]!);

    if (recordColumns.length !== columns.length) {
      throw new ConfigurationError(`Record at index ${i} has different column count`);
    }

    for (const col of columns) {
      if (!recordColumns.includes(col)) {
        throw new ConfigurationError(`Record at index ${i} missing column: ${col}`);
      }
    }
  }
}

/**
 * Estimates optimal batch size for records.
 *
 * @param sampleRecord - Sample record to estimate size
 * @param maxBatchSize - Maximum batch size limit
 * @returns Recommended batch size
 *
 * @example
 * ```typescript
 * const batchSize = estimateBatchSize({ id: 1, name: 'test', data: '...' }, 5000);
 * ```
 */
export function estimateBatchSize(
  sampleRecord: Record<string, unknown>,
  maxBatchSize: number = DEFAULT_BATCH_SIZE
): number {
  const columnCount = Object.keys(sampleRecord).length;

  // Calculate max rows per batch based on parameter limit
  const maxRowsPerBatch = Math.floor(MAX_PARAMETERS / columnCount);

  // Use the minimum of max batch size and calculated max
  return Math.min(maxBatchSize, maxRowsPerBatch);
}

/**
 * Converts records to CSV format.
 *
 * @param records - Records to convert
 * @param options - CSV conversion options
 * @returns CSV string
 *
 * @example
 * ```typescript
 * const csv = recordsToCsv([
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' }
 * ]);
 * // Returns:
 * // id,name
 * // 1,Alice
 * // 2,Bob
 * ```
 */
export function recordsToCsv(
  records: Record<string, unknown>[],
  options: {
    delimiter?: string;
    includeHeader?: boolean;
    quoteChar?: string;
  } = {}
): string {
  if (records.length === 0) {
    return '';
  }

  const delimiter = options.delimiter || ',';
  const includeHeader = options.includeHeader ?? true;
  const quoteChar = options.quoteChar || '"';
  const columns = Object.keys(records[0]!);
  const lines: string[] = [];

  // Add header
  if (includeHeader) {
    lines.push(columns.join(delimiter));
  }

  // Add data rows
  for (const record of records) {
    const values = columns.map((col) => {
      const value = record[col];
      if (value === null || value === undefined) {
        return '';
      }
      const str = String(value);
      // Quote if contains delimiter, newline, or quote char
      if (str.includes(delimiter) || str.includes('\n') || str.includes(quoteChar)) {
        return `${quoteChar}${str.replace(new RegExp(quoteChar, 'g'), quoteChar + quoteChar)}${quoteChar}`;
      }
      return str;
    });
    lines.push(values.join(delimiter));
  }

  return lines.join('\n');
}
