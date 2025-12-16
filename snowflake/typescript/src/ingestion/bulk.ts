/**
 * Snowflake Bulk Insert Operations
 *
 * Efficient bulk insert operations with staging support.
 * @module @llmdevops/snowflake-integration/ingestion/bulk
 */

import type {
  BulkInsertOptions,
  FileFormat,
  QueryResult,
  Value,
} from '../types/index.js';
import { ConfigurationError, wrapError } from '../errors/index.js';
import { StageManager } from './stage.js';
import { CopyIntoExecutor, createCopyRequest } from './copy.js';
import { CSV_COMMA } from './format.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Query executor interface for bulk operations.
 */
export interface BulkQueryExecutor {
  execute(sql: string, params?: Value[]): Promise<QueryResult>;
}

/**
 * Options for creating a bulk inserter.
 */
export interface BulkInserterConfig {
  /** Query executor */
  executor: BulkQueryExecutor;
  /** Stage name for staging bulk inserts */
  stageName?: string;
  /** Temporary directory for local files */
  tempDir?: string;
}

/**
 * Default batch size for bulk inserts.
 */
const DEFAULT_BATCH_SIZE = 10000;

/**
 * Threshold for using staging (number of records).
 */
const STAGING_THRESHOLD = 1000;

/**
 * Maximum batch size for direct inserts.
 */
const MAX_DIRECT_INSERT_SIZE = 16384;

/**
 * Bulk inserter for efficient data loading.
 */
export class BulkInserter {
  private executor: BulkQueryExecutor;
  private stageManager: StageManager;
  private copyExecutor: CopyIntoExecutor;
  private stageName: string;
  private tempDir: string;

  /**
   * Creates a new bulk inserter.
   */
  constructor(config: BulkInserterConfig) {
    this.executor = config.executor;
    this.stageManager = new StageManager(config.executor);
    this.copyExecutor = new CopyIntoExecutor(config.executor);
    this.stageName = config.stageName || 'BULK_LOAD_STAGE';
    this.tempDir = config.tempDir || os.tmpdir();
  }

  /**
   * Inserts records into a table.
   *
   * @param table - Target table name
   * @param records - Records to insert
   * @param options - Bulk insert options
   * @returns Number of rows inserted
   * @throws {ConfigurationError} If table or records are invalid
   */
  async insert(
    table: string,
    records: Record<string, unknown>[],
    options?: BulkInsertOptions
  ): Promise<number> {
    if (!table || table.trim().length === 0) {
      throw new ConfigurationError('Table name cannot be empty');
    }

    if (!records || records.length === 0) {
      return 0;
    }

    const batchSize = options?.batchSize || DEFAULT_BATCH_SIZE;
    const useStaging = options?.useStaging ?? records.length >= STAGING_THRESHOLD;
    const onError = options?.onError || 'ABORT';

    try {
      if (useStaging) {
        return await this.insertViaStaging(table, records, options);
      } else {
        return await this.insertDirect(table, records, batchSize, onError);
      }
    } catch (error) {
      throw wrapError(error, `Bulk insert failed for table ${table}`);
    }
  }

  /**
   * Inserts records directly using INSERT statements.
   */
  private async insertDirect(
    table: string,
    records: Record<string, unknown>[],
    batchSize: number,
    onError: 'CONTINUE' | 'ABORT'
  ): Promise<number> {
    let totalInserted = 0;
    const effectiveBatchSize = Math.min(batchSize, MAX_DIRECT_INSERT_SIZE);

    for (let i = 0; i < records.length; i += effectiveBatchSize) {
      const batch = records.slice(i, i + effectiveBatchSize);

      try {
        const sql = this.buildInsertSql(table, batch);
        const result = await this.executor.execute(sql);
        totalInserted += result.statistics.rowsAffected || batch.length;
      } catch (error) {
        if (onError === 'ABORT') {
          throw error;
        }
        // Continue on error - log or handle as needed
      }
    }

    return totalInserted;
  }

  /**
   * Inserts records via staging.
   */
  private async insertViaStaging(
    table: string,
    records: Record<string, unknown>[],
    options?: BulkInsertOptions
  ): Promise<number> {
    const fileFormat = options?.fileFormat || CSV_COMMA;
    const tempFileName = `bulk_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const localFilePath = path.join(this.tempDir, `${tempFileName}.csv`);
    const stagePath = `@${this.stageName}/${tempFileName}.csv`;

    try {
      // Write records to local CSV file
      await this.writeRecordsToCsv(records, localFilePath, fileFormat);

      // Upload to stage
      await this.stageManager.putFile(localFilePath, `@${this.stageName}`, {
        autoCompress: true,
        overwrite: true,
      });

      // Load via COPY INTO
      const copyRequest = createCopyRequest(table, stagePath, {
        format: fileFormat,
        copyOptions: {
          onError: options?.onError === 'CONTINUE' ? 'CONTINUE' : 'ABORT_STATEMENT',
          purge: true, // Clean up after load
        },
      });

      const copyResult = await this.copyExecutor.execute(copyRequest);

      return copyResult.rowsLoaded;
    } finally {
      // Clean up local file
      try {
        await fs.unlink(localFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Writes records to a CSV file.
   */
  private async writeRecordsToCsv(
    records: Record<string, unknown>[],
    filePath: string,
    format: FileFormat
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const delimiter = format.fieldDelimiter || ',';
    const columns = Object.keys(records[0]!);
    const lines: string[] = [];

    // Add header if skipHeader is set
    if (format.skipHeader && format.skipHeader > 0) {
      lines.push(columns.join(delimiter));
    }

    // Add data rows
    for (const record of records) {
      const values = columns.map((col) => this.formatCsvValue(record[col], delimiter));
      lines.push(values.join(delimiter));
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  /**
   * Formats a value for CSV output.
   */
  private formatCsvValue(value: unknown, delimiter: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // Quote if contains delimiter, newline, or quote
    if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Builds an INSERT SQL statement for a batch of records.
   */
  private buildInsertSql(table: string, records: Record<string, unknown>[]): string {
    if (records.length === 0) {
      throw new ConfigurationError('Cannot build INSERT for empty records');
    }

    const columns = Object.keys(records[0]!);
    const columnList = columns.join(', ');

    const valuesList = records.map((record) => {
      const values = columns.map((col) => this.formatSqlValue(record[col]));
      return `(${values.join(', ')})`;
    });

    return `INSERT INTO ${table} (${columnList}) VALUES ${valuesList.join(', ')}`;
  }

  /**
   * Formats a value for SQL.
   */
  private formatSqlValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    // String or other - escape single quotes
    const str = String(value);
    return `'${str.replace(/'/g, "''")}'`;
  }

  /**
   * Estimates the optimal batch size based on record size.
   *
   * @param sampleRecord - Sample record to estimate size
   * @returns Recommended batch size
   */
  estimateBatchSize(sampleRecord: Record<string, unknown>): number {
    // Estimate record size in bytes
    const jsonSize = JSON.stringify(sampleRecord).length;

    // Target ~1MB batches
    const targetBatchBytes = 1024 * 1024;
    const estimatedBatchSize = Math.floor(targetBatchBytes / jsonSize);

    // Clamp between 100 and MAX_DIRECT_INSERT_SIZE
    return Math.max(100, Math.min(estimatedBatchSize, MAX_DIRECT_INSERT_SIZE));
  }

  /**
   * Determines if staging should be used based on data characteristics.
   *
   * @param recordCount - Number of records
   * @param avgRecordSize - Average record size in bytes
   * @returns True if staging is recommended
   */
  shouldUseStaging(recordCount: number, avgRecordSize?: number): boolean {
    // Always use staging for large batches
    if (recordCount >= STAGING_THRESHOLD) {
      return true;
    }

    // Use staging if total data size exceeds threshold
    if (avgRecordSize) {
      const totalBytes = recordCount * avgRecordSize;
      const threshold = 100 * 1024; // 100KB
      return totalBytes >= threshold;
    }

    return false;
  }
}

/**
 * Batches records into chunks.
 *
 * @param records - Records to batch
 * @param batchSize - Size of each batch
 * @returns Array of batches
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
 * Converts records to CSV string.
 *
 * @param records - Records to convert
 * @param options - CSV options
 * @returns CSV string
 */
export function recordsToCsv(
  records: Record<string, unknown>[],
  options?: {
    delimiter?: string;
    includeHeader?: boolean;
  }
): string {
  if (records.length === 0) {
    return '';
  }

  const delimiter = options?.delimiter || ',';
  const includeHeader = options?.includeHeader ?? true;
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
      if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(delimiter));
  }

  return lines.join('\n');
}
