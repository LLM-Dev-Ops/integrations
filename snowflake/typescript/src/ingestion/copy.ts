/**
 * Snowflake COPY INTO Builder
 *
 * Builder for constructing COPY INTO operations.
 * @module @llmdevops/snowflake-integration/ingestion/copy
 */

import type {
  CopyIntoRequest,
  CopyIntoResult,
  FileFormat,
  CopyOptions,
  QueryResult,
} from '../types/index.js';
import { CopyFailedError, ConfigurationError } from '../errors/index.js';
import { formatToSql } from './format.js';

/**
 * Query executor interface for COPY operations.
 */
export interface CopyQueryExecutor {
  execute(sql: string): Promise<QueryResult>;
}

/**
 * Builder for COPY INTO operations.
 */
export class CopyIntoBuilder {
  private request: Partial<CopyIntoRequest> = {};

  /**
   * Sets the target table.
   */
  targetTable(table: string): this {
    this.request.targetTable = table;
    return this;
  }

  /**
   * Sets the source stage.
   */
  fromStage(stage: string): this {
    this.request.stage = stage;
    return this;
  }

  /**
   * Sets the file pattern.
   */
  filePattern(pattern: string): this {
    this.request.filePattern = pattern;
    return this;
  }

  /**
   * Sets specific files to load.
   */
  files(files: string[]): this {
    this.request.files = files;
    return this;
  }

  /**
   * Sets the file format.
   */
  fileFormat(format: FileFormat): this {
    this.request.fileFormat = format;
    return this;
  }

  /**
   * Sets copy options.
   */
  copyOptions(options: CopyOptions): this {
    this.request.copyOptions = options;
    return this;
  }

  /**
   * Sets column mapping.
   */
  columnMapping(mapping: Record<string, string>): this {
    this.request.columnMapping = mapping;
    return this;
  }

  /**
   * Sets transformation select.
   */
  transformSelect(sql: string): this {
    this.request.transformationSelect = sql;
    return this;
  }

  /**
   * Builds the COPY INTO request.
   */
  build(): CopyIntoRequest {
    if (!this.request.targetTable) {
      throw new ConfigurationError('Target table is required');
    }
    if (!this.request.stage) {
      throw new ConfigurationError('Source stage is required');
    }

    return this.request as CopyIntoRequest;
  }

  /**
   * Resets the builder to its initial state.
   */
  reset(): this {
    this.request = {};
    return this;
  }
}

/**
 * Executor for COPY INTO operations.
 */
export class CopyIntoExecutor {
  private executor: CopyQueryExecutor;

  /**
   * Creates a new COPY INTO executor.
   */
  constructor(executor: CopyQueryExecutor) {
    this.executor = executor;
  }

  /**
   * Executes a COPY INTO operation.
   *
   * @param request - COPY INTO request
   * @returns COPY INTO result
   * @throws {CopyFailedError} If copy operation fails
   */
  async execute(request: CopyIntoRequest): Promise<CopyIntoResult> {
    try {
      // Build COPY INTO SQL
      const sql = this.buildCopyIntoSql(request);

      // Execute COPY INTO
      const result = await this.executor.execute(sql);

      // Parse results
      return this.parseCopyIntoResult(result);
    } catch (error) {
      if (error instanceof CopyFailedError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CopyFailedError(
        `COPY INTO failed: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Builds COPY INTO SQL statement.
   */
  private buildCopyIntoSql(request: CopyIntoRequest): string {
    const parts: string[] = [];

    // COPY INTO table
    parts.push(`COPY INTO ${request.targetTable}`);

    // Column mapping or transformation
    if (request.columnMapping && Object.keys(request.columnMapping).length > 0) {
      const columns = Object.keys(request.columnMapping).join(', ');
      parts.push(`(${columns})`);
    }

    // FROM stage
    parts.push(`FROM ${request.stage}`);

    // FILES or PATTERN
    if (request.files && request.files.length > 0) {
      const fileList = request.files.map((f) => `'${f}'`).join(', ');
      parts.push(`FILES = (${fileList})`);
    } else if (request.filePattern) {
      parts.push(`PATTERN = '${request.filePattern}'`);
    }

    // File format
    if (request.fileFormat) {
      parts.push(`FILE_FORMAT = (${formatToSql(request.fileFormat)})`);
    }

    // Transformation select
    if (request.transformationSelect) {
      parts.push(`(${request.transformationSelect})`);
    } else if (request.columnMapping && Object.keys(request.columnMapping).length > 0) {
      // Build select from column mapping
      const selects = Object.entries(request.columnMapping)
        .map(([col, expr]) => `${expr} AS ${col}`)
        .join(', ');
      parts.push(`(SELECT ${selects} FROM @~)`);
    }

    // Copy options
    if (request.copyOptions) {
      const copyOpts = this.buildCopyOptions(request.copyOptions);
      if (copyOpts.length > 0) {
        parts.push(copyOpts.join(' '));
      }
    }

    return parts.join(' ');
  }

  /**
   * Builds COPY options SQL clauses.
   */
  private buildCopyOptions(options: CopyOptions): string[] {
    const parts: string[] = [];

    if (options.onError !== undefined) {
      parts.push(`ON_ERROR = ${options.onError}`);
    }
    if (options.sizeLimit !== undefined) {
      parts.push(`SIZE_LIMIT = ${options.sizeLimit}`);
    }
    if (options.purge !== undefined) {
      parts.push(`PURGE = ${options.purge}`);
    }
    if (options.returnFailedOnly !== undefined) {
      parts.push(`RETURN_FAILED_ONLY = ${options.returnFailedOnly}`);
    }
    if (options.matchByColumnName !== undefined) {
      parts.push(`MATCH_BY_COLUMN_NAME = ${options.matchByColumnName}`);
    }
    if (options.enforceLength !== undefined) {
      parts.push(`ENFORCE_LENGTH = ${options.enforceLength}`);
    }
    if (options.truncateColumns !== undefined) {
      parts.push(`TRUNCATE_COLUMNS = ${options.truncateColumns}`);
    }
    if (options.force !== undefined) {
      parts.push(`FORCE = ${options.force}`);
    }

    return parts;
  }

  /**
   * Parses COPY INTO result from query result.
   */
  private parseCopyIntoResult(result: QueryResult): CopyIntoResult {
    const fileResults: CopyIntoResult['fileResults'] = [];
    let totalRowsLoaded = 0;
    const errors: string[] = [];

    for (const row of result.resultSet.rows) {
      const fileName = row.getString('file') || '';
      const status = (row.getString('status') as 'LOADED' | 'LOAD_FAILED' | 'PARTIALLY_LOADED') || 'LOADED';
      const rowsParsed = row.getNumber('rows_parsed') || 0;
      const rowsLoaded = row.getNumber('rows_loaded') || 0;
      const errorsSeen = row.getNumber('errors_seen') || 0;
      const firstError = row.getString('first_error') || undefined;
      const firstErrorLine = row.getNumber('first_error_line') || undefined;
      const firstErrorCharacter = row.getNumber('first_error_character') || undefined;

      totalRowsLoaded += rowsLoaded;

      fileResults.push({
        fileName,
        status,
        rowsParsed,
        rowsLoaded,
        errorsSeen,
        firstError,
        firstErrorLine,
        firstErrorCharacter,
      });

      if (firstError) {
        errors.push(`${fileName}: ${firstError}`);
      }
    }

    return {
      rowsLoaded: totalRowsLoaded,
      filesProcessed: fileResults.length,
      fileResults,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

/**
 * Creates a new COPY INTO builder.
 */
export function copyInto(): CopyIntoBuilder {
  return new CopyIntoBuilder();
}

/**
 * Validates a COPY INTO request.
 *
 * @param request - Request to validate
 * @throws {ConfigurationError} If request is invalid
 */
export function validateCopyRequest(request: CopyIntoRequest): void {
  if (!request.targetTable || request.targetTable.trim().length === 0) {
    throw new ConfigurationError('Target table cannot be empty');
  }

  if (!request.stage || request.stage.trim().length === 0) {
    throw new ConfigurationError('Source stage cannot be empty');
  }

  // Cannot specify both files and pattern
  if (request.files && request.files.length > 0 && request.filePattern) {
    throw new ConfigurationError('Cannot specify both files and pattern');
  }

  // Column mapping and transformation select are mutually exclusive
  if (
    request.columnMapping &&
    Object.keys(request.columnMapping).length > 0 &&
    request.transformationSelect
  ) {
    throw new ConfigurationError('Cannot specify both columnMapping and transformationSelect');
  }
}

/**
 * Estimates the number of files to be loaded.
 *
 * @param request - COPY INTO request
 * @returns Estimated file count
 */
export function estimateFileCount(request: CopyIntoRequest): number {
  if (request.files && request.files.length > 0) {
    return request.files.length;
  }
  // Cannot estimate without querying stage
  return -1;
}

/**
 * Creates a simple COPY INTO request.
 *
 * @param table - Target table
 * @param stage - Source stage
 * @param options - Optional configuration
 * @returns COPY INTO request
 */
export function createCopyRequest(
  table: string,
  stage: string,
  options?: {
    pattern?: string;
    files?: string[];
    format?: FileFormat;
    copyOptions?: CopyOptions;
  }
): CopyIntoRequest {
  const builder = copyInto()
    .targetTable(table)
    .fromStage(stage);

  if (options?.pattern) {
    builder.filePattern(options.pattern);
  }
  if (options?.files) {
    builder.files(options.files);
  }
  if (options?.format) {
    builder.fileFormat(options.format);
  }
  if (options?.copyOptions) {
    builder.copyOptions(options.copyOptions);
  }

  return builder.build();
}
