/**
 * Redshift Result Exporter
 *
 * UNLOAD command execution for exporting large result sets to S3.
 * @module @llmdevops/redshift-integration/result/export
 */

import type { Client } from 'pg';
import type { UnloadCommand, UnloadFormat, UnloadOptions, UnloadResult } from '../types/index.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// UnloadConfig Interface
// ============================================================================

/**
 * Default configuration for UNLOAD operations.
 */
export interface UnloadConfig {
  /** Default IAM role ARN */
  defaultIamRole?: string;
  /** Default AWS region */
  defaultRegion?: string;
  /** Default enable parallel unload */
  defaultParallel?: boolean;
  /** Default maximum file size in MB */
  defaultMaxFileSizeMb?: number;
  /** Default enable manifest */
  defaultManifest?: boolean;
  /** Default encryption setting */
  defaultEncrypted?: boolean;
}

// ============================================================================
// UnloadExecutor Class
// ============================================================================

/**
 * Executor for UNLOAD commands to export data to S3.
 */
export class UnloadExecutor {
  private readonly client: Client;
  private readonly defaultConfig: UnloadConfig;

  /**
   * Creates a new UnloadExecutor.
   *
   * @param client - PostgreSQL client connection
   * @param defaultConfig - Default configuration for UNLOAD operations
   */
  constructor(client: Client, defaultConfig: UnloadConfig = {}) {
    this.client = client;
    this.defaultConfig = defaultConfig;
  }

  /**
   * Executes an UNLOAD command to export query results to S3.
   *
   * @param query - SQL query whose results to unload
   * @param s3Path - S3 destination path (s3://bucket/prefix)
   * @param options - UNLOAD options
   * @returns Promise resolving to UnloadResult
   */
  async unload(
    query: string,
    s3Path: string,
    options: Partial<UnloadOptions> = {}
  ): Promise<UnloadResult> {
    // Merge with default config
    const opts: UnloadOptions = {
      iamRole: options.iamRole || this.defaultConfig.defaultIamRole || '',
      parallel: options.parallel ?? this.defaultConfig.defaultParallel ?? true,
      maxFileSizeMb: options.maxFileSizeMb ?? this.defaultConfig.defaultMaxFileSizeMb,
      manifest: options.manifest ?? this.defaultConfig.defaultManifest ?? false,
      encrypted: options.encrypted ?? this.defaultConfig.defaultEncrypted ?? false,
      kmsKeyId: options.kmsKeyId,
      partitionBy: options.partitionBy,
      allowOverwrite: options.allowOverwrite ?? false,
    };

    // Validate required options
    if (!opts.iamRole) {
      throw new RedshiftError(
        'IAM role is required for UNLOAD operation',
        RedshiftErrorCode.INVALID_CONFIG,
        { retryable: false }
      );
    }

    // Build UNLOAD SQL
    const sql = this.buildUnloadSql(query, s3Path, opts);

    try {
      const startTime = Date.now();

      // Execute UNLOAD command
      const result = await this.client.query(sql);

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Parse result
      // Note: UNLOAD doesn't return detailed statistics in the query result
      // We would need to query system tables or parse manifest to get exact counts
      return {
        filesCreated: 0, // Would need to parse manifest or query STL_UNLOAD_LOG
        rowsUnloaded: result.rowCount || 0,
        bytesWritten: 0, // Would need to query STL_UNLOAD_LOG
        durationMs,
        manifestPath: opts.manifest ? `${s3Path}manifest` : undefined,
      };
    } catch (error) {
      throw new RedshiftError(
        'UNLOAD operation failed',
        RedshiftErrorCode.UNLOAD_FAILED,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          retryable: false,
        }
      );
    }
  }

  /**
   * Executes an UNLOAD command using the UnloadCommand specification.
   *
   * @param command - UNLOAD command specification
   * @returns Promise resolving to UnloadResult
   */
  async execute(command: UnloadCommand): Promise<UnloadResult> {
    const { query, destination, format, options } = command;

    // Build S3 path
    const s3Path = `s3://${destination.bucket}/${destination.prefix}`;

    // Convert format to options
    const unloadOptions: Partial<UnloadOptions> = {
      ...options,
    };

    // Build and execute UNLOAD SQL
    const sql = this.buildUnloadSqlFromCommand(command);

    try {
      const startTime = Date.now();
      const result = await this.client.query(sql);
      const endTime = Date.now();

      return {
        filesCreated: 0,
        rowsUnloaded: result.rowCount || 0,
        bytesWritten: 0,
        durationMs: endTime - startTime,
        manifestPath: options.manifest ? `${s3Path}manifest` : undefined,
      };
    } catch (error) {
      throw new RedshiftError(
        'UNLOAD operation failed',
        RedshiftErrorCode.UNLOAD_FAILED,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          retryable: false,
        }
      );
    }
  }

  /**
   * Queries UNLOAD statistics from system tables.
   *
   * @param queryId - Query ID from UNLOAD operation
   * @returns Promise resolving to detailed statistics
   */
  async getUnloadStats(queryId: string): Promise<{
    rowsUnloaded: number;
    filesCreated: number;
    bytesWritten: number;
  }> {
    const sql = `
      SELECT
        SUM(transfer_size) as bytes_written,
        COUNT(DISTINCT file_name) as files_created,
        SUM(record_count) as rows_unloaded
      FROM STL_UNLOAD_LOG
      WHERE query = $1
    `;

    try {
      const result = await this.client.query(sql, [queryId]);
      const row = result.rows[0];

      return {
        rowsUnloaded: parseInt(row?.rows_unloaded || '0'),
        filesCreated: parseInt(row?.files_created || '0'),
        bytesWritten: parseInt(row?.bytes_written || '0'),
      };
    } catch (error) {
      // Return zeros if we can't query stats
      return {
        rowsUnloaded: 0,
        filesCreated: 0,
        bytesWritten: 0,
      };
    }
  }

  /**
   * Builds UNLOAD SQL from command specification.
   */
  private buildUnloadSqlFromCommand(command: UnloadCommand): string {
    const { query, destination, format, options } = command;
    const s3Path = `s3://${destination.bucket}/${destination.prefix}`;

    // Build format options
    const formatOptions = this.buildFormatOptions(format);

    // Build UNLOAD options
    const unloadOptions = [
      `IAM_ROLE '${options.iamRole}'`,
      ...(options.parallel !== false ? ['PARALLEL ON'] : ['PARALLEL OFF']),
      ...formatOptions,
      ...(options.maxFileSizeMb ? [`MAXFILESIZE ${options.maxFileSizeMb} MB`] : []),
      ...(options.manifest ? ['MANIFEST'] : []),
      ...(options.encrypted ? ['ENCRYPTED'] : []),
      ...(options.kmsKeyId ? [`KMS_KEY_ID '${options.kmsKeyId}'`] : []),
      ...(options.allowOverwrite ? ['ALLOWOVERWRITE'] : []),
      ...(options.partitionBy && options.partitionBy.length > 0
        ? [`PARTITION BY (${options.partitionBy.join(', ')})`]
        : []),
    ];

    return `UNLOAD ('${this.escapeQueryForUnload(query)}')
TO '${s3Path}'
${unloadOptions.join('\n')}`;
  }

  /**
   * Builds UNLOAD SQL command.
   */
  private buildUnloadSql(
    query: string,
    s3Path: string,
    options: UnloadOptions
  ): string {
    const unloadOptions = [
      `IAM_ROLE '${options.iamRole}'`,
      ...(options.parallel !== false ? ['PARALLEL ON'] : ['PARALLEL OFF']),
      ...(options.maxFileSizeMb ? [`MAXFILESIZE ${options.maxFileSizeMb} MB`] : []),
      ...(options.manifest ? ['MANIFEST'] : []),
      ...(options.encrypted ? ['ENCRYPTED'] : []),
      ...(options.kmsKeyId ? [`KMS_KEY_ID '${options.kmsKeyId}'`] : []),
      ...(options.allowOverwrite ? ['ALLOWOVERWRITE'] : []),
      ...(options.partitionBy && options.partitionBy.length > 0
        ? [`PARTITION BY (${options.partitionBy.join(', ')})`]
        : []),
    ];

    return `UNLOAD ('${this.escapeQueryForUnload(query)}')
TO '${s3Path}'
${unloadOptions.join('\n')}`;
  }

  /**
   * Builds format-specific options for UNLOAD.
   */
  private buildFormatOptions(format: UnloadFormat): string[] {
    const options: string[] = [];

    switch (format.type) {
      case 'csv':
        options.push('FORMAT CSV');
        if (format.delimiter) {
          options.push(`DELIMITER '${format.delimiter}'`);
        }
        if (format.header) {
          options.push('HEADER');
        }
        break;

      case 'parquet':
        options.push('FORMAT PARQUET');
        if (format.compression) {
          const compressionMap = {
            none: 'NONE',
            snappy: 'SNAPPY',
            gzip: 'GZIP',
            zstd: 'ZSTD',
          };
          options.push(`COMPRESSION ${compressionMap[format.compression]}`);
        }
        break;

      case 'json':
        options.push('FORMAT JSON');
        break;

      default:
        // Default to CSV
        options.push('FORMAT CSV');
    }

    return options;
  }

  /**
   * Escapes a query for use in UNLOAD command.
   * Single quotes in the query need to be escaped.
   */
  private escapeQueryForUnload(query: string): string {
    return query.replace(/'/g, "''");
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates an UnloadExecutor with the given client and configuration.
 *
 * @param client - PostgreSQL client connection
 * @param config - Default configuration
 * @returns UnloadExecutor instance
 */
export function createUnloadExecutor(
  client: Client,
  config: UnloadConfig = {}
): UnloadExecutor {
  return new UnloadExecutor(client, config);
}

/**
 * Builds a simple UNLOAD command for CSV export.
 *
 * @param query - Query to unload
 * @param s3Path - S3 destination
 * @param iamRole - IAM role ARN
 * @param options - Additional options
 * @returns UnloadCommand specification
 */
export function buildCsvUnload(
  query: string,
  s3Path: { bucket: string; prefix: string },
  iamRole: string,
  options: Partial<UnloadOptions> = {}
): UnloadCommand {
  return {
    query,
    destination: s3Path,
    format: {
      type: 'csv',
      delimiter: ',',
      header: options.manifest ?? true,
    },
    options: {
      iamRole,
      parallel: options.parallel ?? true,
      manifest: options.manifest ?? false,
      encrypted: options.encrypted ?? false,
      allowOverwrite: options.allowOverwrite ?? false,
    },
  };
}

/**
 * Builds a Parquet UNLOAD command.
 *
 * @param query - Query to unload
 * @param s3Path - S3 destination
 * @param iamRole - IAM role ARN
 * @param options - Additional options
 * @returns UnloadCommand specification
 */
export function buildParquetUnload(
  query: string,
  s3Path: { bucket: string; prefix: string },
  iamRole: string,
  options: Partial<UnloadOptions> = {}
): UnloadCommand {
  return {
    query,
    destination: s3Path,
    format: {
      type: 'parquet',
      compression: 'snappy',
    },
    options: {
      iamRole,
      parallel: options.parallel ?? true,
      manifest: options.manifest ?? false,
      encrypted: options.encrypted ?? false,
      allowOverwrite: options.allowOverwrite ?? false,
      partitionBy: options.partitionBy,
    },
  };
}

/**
 * Builds a JSON UNLOAD command.
 *
 * @param query - Query to unload
 * @param s3Path - S3 destination
 * @param iamRole - IAM role ARN
 * @param options - Additional options
 * @returns UnloadCommand specification
 */
export function buildJsonUnload(
  query: string,
  s3Path: { bucket: string; prefix: string },
  iamRole: string,
  options: Partial<UnloadOptions> = {}
): UnloadCommand {
  return {
    query,
    destination: s3Path,
    format: {
      type: 'json',
    },
    options: {
      iamRole,
      parallel: options.parallel ?? true,
      manifest: options.manifest ?? false,
      encrypted: options.encrypted ?? false,
      allowOverwrite: options.allowOverwrite ?? false,
    },
  };
}
