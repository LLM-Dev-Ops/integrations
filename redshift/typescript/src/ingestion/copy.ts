/**
 * Redshift COPY Command Executor
 *
 * Provides execution and error handling for Redshift COPY operations
 * from S3 and other data sources.
 * @module @llmdevops/redshift-integration/ingestion/copy
 */

import type {
  DataFormat,
  CsvFormatOptions,
  JsonFormatOptions,
  ParquetFormatOptions,
  AvroFormatOptions,
  OrcFormatOptions,
} from './format.js';
import { formatToSqlClause } from './format.js';
import { RedshiftError, RedshiftErrorCode, ConfigurationError } from '../errors/index.js';

// ============================================================================
// Connection Pool Interface
// ============================================================================

/**
 * Minimal connection pool interface for COPY operations.
 */
export interface ConnectionPool {
  /**
   * Executes a query on the connection pool.
   *
   * @param sql - SQL query to execute
   * @returns Query result with rows
   */
  query<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>>;
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
// COPY Options
// ============================================================================

/**
 * Options for COPY operation.
 */
export interface CopyOptions {
  /** Data format */
  format: DataFormat;
  /** Format-specific options */
  formatOptions?: CsvFormatOptions | JsonFormatOptions | ParquetFormatOptions | AvroFormatOptions | OrcFormatOptions;
  /** IAM role ARN for S3 access */
  iamRole?: string;
  /** AWS access key ID (alternative to IAM role) */
  accessKeyId?: string;
  /** AWS secret access key (alternative to IAM role) */
  secretAccessKey?: string;
  /** AWS session token (for temporary credentials) */
  sessionToken?: string;
  /** AWS region for S3 bucket */
  region?: string;
  /** Column compression encoding: ON = auto-update, OFF = preserve */
  compUpdate?: 'ON' | 'OFF';
  /** Statistics update: ON = auto-update, OFF = skip */
  statUpdate?: 'ON' | 'OFF';
  /** Maximum number of errors before aborting */
  maxErrors?: number;
  /** Whether the path points to a manifest file */
  manifest?: boolean;
  /** List of specific columns to load (subset of table columns) */
  columns?: string[];
  /** Remove leading/trailing whitespace from character fields */
  trimBlanks?: boolean;
  /** Truncate data that exceeds column width instead of erroring */
  truncateColumns?: boolean;
  /** Explicit column mapping (for transformation) */
  columnMapping?: Record<string, string>;
}

/**
 * Default COPY configuration.
 */
export interface CopyConfig {
  /** Default IAM role ARN */
  defaultIamRole?: string;
  /** Default AWS region */
  defaultRegion?: string;
  /** Default max errors */
  defaultMaxErrors?: number;
  /** Default compression update setting */
  defaultCompUpdate?: 'ON' | 'OFF';
  /** Default statistics update setting */
  defaultStatUpdate?: 'ON' | 'OFF';
}

// ============================================================================
// COPY Results
// ============================================================================

/**
 * Result of a COPY operation.
 */
export interface CopyResult {
  /** Number of rows successfully loaded */
  rowsLoaded: number;
  /** Number of files processed */
  filesProcessed: number;
  /** Warning messages (if any) */
  warnings?: string[];
  /** Error messages (if any) */
  errors?: LoadError[];
  /** STL_LOAD_ERRORS query results */
  stlLoadErrors?: StlLoadError[];
}

/**
 * Load error from COPY operation.
 */
export interface LoadError {
  /** Line number in source file */
  line?: number;
  /** Column name or position */
  column?: string;
  /** Error message */
  error: string;
  /** Raw data that caused the error */
  rawData?: string;
}

/**
 * STL_LOAD_ERRORS system table record.
 */
export interface StlLoadError {
  /** User ID */
  userId?: number;
  /** Slice number */
  slice?: number;
  /** Transaction ID */
  tbl?: number;
  /** Start time */
  startTime?: Date;
  /** Session ID */
  session?: number;
  /** Query ID */
  query?: number;
  /** File name */
  filename?: string;
  /** Line number */
  line?: number;
  /** Column name */
  colname?: string;
  /** Column type */
  type?: string;
  /** Column length */
  colLength?: number;
  /** Position in file */
  position?: number;
  /** Raw line data */
  rawLine?: string;
  /** Raw field value */
  rawFieldValue?: string;
  /** Error reason */
  err_reason?: string;
  /** Error code */
  err_code?: number;
}

// ============================================================================
// COPY Executor
// ============================================================================

/**
 * Executor for Redshift COPY operations.
 *
 * @example
 * ```typescript
 * const executor = new CopyExecutor(pool, {
 *   defaultIamRole: 'arn:aws:iam::123456789012:role/RedshiftCopyRole',
 *   defaultRegion: 'us-east-1'
 * });
 *
 * const result = await executor.copyFromS3(
 *   'my_table',
 *   's3://my-bucket/data/',
 *   {
 *     format: 'CSV',
 *     formatOptions: { delimiter: ',', ignoreHeader: 1 },
 *     maxErrors: 100
 *   }
 * );
 *
 * console.log(`Loaded ${result.rowsLoaded} rows`);
 * ```
 */
export class CopyExecutor {
  private readonly pool: ConnectionPool;
  private readonly defaultConfig: CopyConfig;

  /**
   * Creates a new COPY executor.
   *
   * @param pool - Connection pool for executing queries
   * @param defaultConfig - Default configuration for COPY operations
   */
  constructor(pool: ConnectionPool, defaultConfig: CopyConfig = {}) {
    this.pool = pool;
    this.defaultConfig = defaultConfig;
  }

  /**
   * Executes a COPY operation from S3.
   *
   * @param table - Target table name
   * @param s3Path - S3 path to data files (s3://bucket/key)
   * @param options - COPY options
   * @returns COPY operation result
   * @throws {ConfigurationError} If required options are missing
   * @throws {RedshiftError} If COPY operation fails
   *
   * @example
   * ```typescript
   * const result = await executor.copyFromS3(
   *   'sales_data',
   *   's3://my-bucket/sales/2024/',
   *   {
   *     format: 'CSV',
   *     formatOptions: {
   *       delimiter: '|',
   *       ignoreHeader: 1,
   *       nullAs: 'NULL'
   *     },
   *     iamRole: 'arn:aws:iam::123456789012:role/RedshiftRole',
   *     region: 'us-east-1',
   *     maxErrors: 100
   *   }
   * );
   * ```
   */
  async copyFromS3(
    table: string,
    s3Path: string,
    options: CopyOptions
  ): Promise<CopyResult> {
    // Validate inputs
    this.validateCopyInputs(table, s3Path, options);

    // Build COPY SQL
    const sql = this.buildCopySql(table, s3Path, options);

    try {
      // Execute COPY
      await this.pool.query(sql);

      // Query STL_LOAD_ERRORS for detailed error information
      const loadErrors = await this.queryLoadErrors();

      // Parse results
      return this.parseCopyResult(loadErrors);
    } catch (error) {
      // Query load errors even on failure
      const loadErrors = await this.queryLoadErrors().catch(() => []);

      throw new RedshiftError(
        `COPY operation failed: ${error instanceof Error ? error.message : String(error)}`,
        RedshiftErrorCode.COPY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: false,
          context: {
            table,
            s3Path,
            loadErrors: loadErrors.slice(0, 10), // Include up to 10 errors
          },
        }
      );
    }
  }

  /**
   * Builds the COPY SQL command.
   *
   * @param table - Target table name
   * @param s3Path - S3 path to data files
   * @param options - COPY options
   * @returns SQL COPY command
   */
  private buildCopySql(table: string, s3Path: string, options: CopyOptions): string {
    const parts: string[] = [];

    // COPY table
    parts.push(`COPY ${table}`);

    // Column list (if specified)
    if (options.columns && options.columns.length > 0) {
      parts.push(`(${options.columns.join(', ')})`);
    }

    // FROM S3 path
    parts.push(`FROM '${s3Path}'`);

    // Authorization (IAM role or credentials)
    if (options.iamRole || this.defaultConfig.defaultIamRole) {
      const role = options.iamRole || this.defaultConfig.defaultIamRole!;
      parts.push(`IAM_ROLE '${role}'`);
    } else if (options.accessKeyId && options.secretAccessKey) {
      parts.push(`ACCESS_KEY_ID '${options.accessKeyId}'`);
      parts.push(`SECRET_ACCESS_KEY '${options.secretAccessKey}'`);
      if (options.sessionToken) {
        parts.push(`SESSION_TOKEN '${options.sessionToken}'`);
      }
    }

    // Region
    if (options.region || this.defaultConfig.defaultRegion) {
      const region = options.region || this.defaultConfig.defaultRegion!;
      parts.push(`REGION '${region}'`);
    }

    // Format and format options
    const formatClause = formatToSqlClause(options.format, options.formatOptions);
    parts.push(formatClause);

    // Manifest
    if (options.manifest) {
      parts.push(`MANIFEST`);
    }

    // COMPUPDATE
    const compUpdate = options.compUpdate || this.defaultConfig.defaultCompUpdate;
    if (compUpdate) {
      parts.push(`COMPUPDATE ${compUpdate}`);
    }

    // STATUPDATE
    const statUpdate = options.statUpdate || this.defaultConfig.defaultStatUpdate;
    if (statUpdate) {
      parts.push(`STATUPDATE ${statUpdate}`);
    }

    // MAXERROR
    const maxErrors = options.maxErrors ?? this.defaultConfig.defaultMaxErrors;
    if (maxErrors !== undefined) {
      parts.push(`MAXERROR ${maxErrors}`);
    }

    // TRIMBLANKS
    if (options.trimBlanks) {
      parts.push(`TRIMBLANKS`);
    }

    // TRUNCATECOLUMNS
    if (options.truncateColumns) {
      parts.push(`TRUNCATECOLUMNS`);
    }

    return parts.join('\n');
  }

  /**
   * Validates COPY inputs.
   *
   * @param table - Target table name
   * @param s3Path - S3 path
   * @param options - COPY options
   * @throws {ConfigurationError} If inputs are invalid
   */
  private validateCopyInputs(table: string, s3Path: string, options: CopyOptions): void {
    if (!table || table.trim().length === 0) {
      throw new ConfigurationError('Table name cannot be empty');
    }

    if (!s3Path || !s3Path.startsWith('s3://')) {
      throw new ConfigurationError('S3 path must start with s3://');
    }

    // Validate authorization
    const hasIamRole = options.iamRole || this.defaultConfig.defaultIamRole;
    const hasCredentials = options.accessKeyId && options.secretAccessKey;

    if (!hasIamRole && !hasCredentials) {
      throw new ConfigurationError(
        'Either IAM role or AWS credentials (accessKeyId + secretAccessKey) must be provided'
      );
    }

    if (hasIamRole && hasCredentials) {
      throw new ConfigurationError('Cannot specify both IAM role and AWS credentials');
    }
  }

  /**
   * Queries STL_LOAD_ERRORS for recent load errors.
   *
   * @returns Array of load errors
   */
  private async queryLoadErrors(): Promise<StlLoadError[]> {
    const sql = `
      SELECT
        userid,
        slice,
        tbl,
        starttime,
        session,
        query,
        filename,
        line_number as line,
        colname,
        type,
        col_length as colLength,
        position,
        raw_line as rawLine,
        raw_field_value as rawFieldValue,
        err_reason,
        err_code
      FROM stl_load_errors
      WHERE query = pg_last_copy_id()
      ORDER BY starttime DESC
      LIMIT 100
    `;

    try {
      const result = await this.pool.query<StlLoadError>(sql);
      return result.rows;
    } catch (error) {
      // If we can't query load errors, return empty array
      return [];
    }
  }

  /**
   * Parses COPY result from load errors.
   *
   * @param loadErrors - STL_LOAD_ERRORS records
   * @returns COPY result
   */
  private parseCopyResult(loadErrors: StlLoadError[]): CopyResult {
    const errors: LoadError[] = loadErrors.map((err) => ({
      line: err.line,
      column: err.colname,
      error: err.err_reason || `Error code: ${err.err_code}`,
      rawData: err.rawFieldValue,
    }));

    // Extract unique filenames for file count
    const filenames = new Set(loadErrors.map((err) => err.filename).filter(Boolean));

    // Note: Redshift doesn't return exact row count from COPY command directly
    // We'd need to query SVL_S3QUERY_SUMMARY or similar for accurate counts
    // For now, we return 0 if there are errors, otherwise assume success
    const rowsLoaded = errors.length > 0 ? 0 : -1; // -1 indicates unknown

    return {
      rowsLoaded,
      filesProcessed: filenames.size,
      errors: errors.length > 0 ? errors : undefined,
      stlLoadErrors: loadErrors.length > 0 ? loadErrors : undefined,
    };
  }

  /**
   * Queries COPY operation statistics from SVL_S3QUERY_SUMMARY.
   *
   * @returns COPY statistics including row count
   *
   * @example
   * ```typescript
   * const stats = await executor.queryCopyStats();
   * console.log(`Loaded ${stats.rowsLoaded} rows from ${stats.filesProcessed} files`);
   * ```
   */
  async queryCopyStats(): Promise<{ rowsLoaded: number; filesProcessed: number }> {
    const sql = `
      SELECT
        SUM(lines_scanned) as rows_loaded,
        COUNT(DISTINCT file) as files_processed
      FROM svl_s3query_summary
      WHERE query = pg_last_copy_id()
    `;

    try {
      const result = await this.pool.query<{
        rows_loaded: number;
        files_processed: number;
      }>(sql);

      const row = result.rows[0];
      return {
        rowsLoaded: row?.rows_loaded || 0,
        filesProcessed: row?.files_processed || 0,
      };
    } catch (error) {
      return { rowsLoaded: 0, filesProcessed: 0 };
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates S3 path format.
 *
 * @param s3Path - S3 path to validate
 * @returns True if valid
 *
 * @example
 * ```typescript
 * validateS3Path('s3://my-bucket/path/to/data'); // true
 * validateS3Path('/local/path'); // false
 * ```
 */
export function validateS3Path(s3Path: string): boolean {
  if (!s3Path.startsWith('s3://')) {
    return false;
  }

  const pathWithoutProtocol = s3Path.slice(5); // Remove 's3://'
  const parts = pathWithoutProtocol.split('/');

  // Must have at least bucket name
  return parts.length > 0 && parts[0]!.length > 0;
}

/**
 * Parses S3 path into bucket and key components.
 *
 * @param s3Path - S3 path (s3://bucket/key)
 * @returns Bucket and key components
 * @throws {ConfigurationError} If path is invalid
 *
 * @example
 * ```typescript
 * const { bucket, key } = parseS3Path('s3://my-bucket/path/to/file.csv');
 * // bucket: 'my-bucket'
 * // key: 'path/to/file.csv'
 * ```
 */
export function parseS3Path(s3Path: string): { bucket: string; key: string } {
  if (!validateS3Path(s3Path)) {
    throw new ConfigurationError(`Invalid S3 path: ${s3Path}`);
  }

  const pathWithoutProtocol = s3Path.slice(5); // Remove 's3://'
  const firstSlashIndex = pathWithoutProtocol.indexOf('/');

  if (firstSlashIndex === -1) {
    // Just bucket, no key
    return {
      bucket: pathWithoutProtocol,
      key: '',
    };
  }

  return {
    bucket: pathWithoutProtocol.slice(0, firstSlashIndex),
    key: pathWithoutProtocol.slice(firstSlashIndex + 1),
  };
}

/**
 * Builds S3 path from bucket and key.
 *
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @returns Complete S3 path
 *
 * @example
 * ```typescript
 * const path = buildS3Path('my-bucket', 'path/to/file.csv');
 * // Returns: 's3://my-bucket/path/to/file.csv'
 * ```
 */
export function buildS3Path(bucket: string, key: string): string {
  if (!key || key.length === 0) {
    return `s3://${bucket}`;
  }
  return `s3://${bucket}/${key}`;
}
