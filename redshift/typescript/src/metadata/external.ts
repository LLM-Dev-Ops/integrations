/**
 * Redshift Spectrum External Tables
 *
 * Provides interfaces and implementations for working with Redshift Spectrum
 * external schemas, tables, and partitions stored in S3.
 *
 * @module @llmdevops/redshift-integration/metadata/external
 */

import type { ConnectionPool } from '../pool/pool.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// External Schema Types
// ============================================================================

/**
 * Information about an external schema (Redshift Spectrum).
 */
export interface ExternalSchemaInfo {
  /**
   * Schema name.
   */
  schemaName: string;

  /**
   * External database name (in AWS Glue Data Catalog or Hive Metastore).
   */
  databaseName: string;

  /**
   * Schema owner.
   */
  owner: string;

  /**
   * Schema type (e.g., 'GLUE', 'HIVE', 'POSTGRES').
   */
  schemaType: string;

  /**
   * IAM role ARN used for accessing S3 data.
   */
  iamRole?: string;

  /**
   * External database URI (for Hive Metastore).
   */
  databaseUri?: string;

  /**
   * Schema options/configuration.
   */
  options?: Record<string, string>;
}

/**
 * Information about an external table.
 */
export interface ExternalTableInfo {
  /**
   * Schema name.
   */
  schemaName: string;

  /**
   * Table name.
   */
  tableName: string;

  /**
   * S3 location of the data.
   */
  location: string;

  /**
   * Number of columns.
   */
  columnCount: number;

  /**
   * File format (e.g., 'PARQUET', 'ORC', 'TEXTFILE', 'AVRO').
   */
  format?: string;

  /**
   * Whether the table is partitioned.
   */
  isPartitioned: boolean;

  /**
   * Partition columns.
   */
  partitionColumns?: string[];

  /**
   * Input format class (for Hive-style tables).
   */
  inputFormat?: string;

  /**
   * Output format class (for Hive-style tables).
   */
  outputFormat?: string;

  /**
   * Serialization library (SerDe).
   */
  serdeLib?: string;

  /**
   * SerDe parameters.
   */
  serdeParams?: Record<string, string>;
}

/**
 * Column information for an external table.
 */
export interface ExternalColumnInfo {
  /**
   * Column name.
   */
  columnName: string;

  /**
   * Column position (ordinal).
   */
  ordinalPosition: number;

  /**
   * Data type.
   */
  dataType: string;

  /**
   * Whether this is a partition column.
   */
  isPartitionColumn: boolean;
}

/**
 * Information about a table partition.
 */
export interface PartitionInfo {
  /**
   * Schema name.
   */
  schemaName: string;

  /**
   * Table name.
   */
  tableName: string;

  /**
   * Partition values (key-value pairs).
   */
  values: Record<string, string>;

  /**
   * S3 location of the partition data.
   */
  location: string;

  /**
   * Last modified time.
   */
  lastModified?: Date;

  /**
   * Partition size in bytes.
   */
  sizeBytes?: number;
}

// ============================================================================
// Spectrum Manager
// ============================================================================

/**
 * SpectrumManager provides methods for working with Redshift Spectrum external tables.
 *
 * This class allows you to:
 * - Discover external schemas
 * - List external tables and their properties
 * - Explore partition information
 * - Query external table metadata
 *
 * @example
 * ```typescript
 * const spectrum = new SpectrumManager(pool);
 *
 * // List all external schemas
 * const schemas = await spectrum.listExternalSchemas();
 * for (const schema of schemas) {
 *   console.log(`External Schema: ${schema.schemaName}`);
 *   console.log(`  Database: ${schema.databaseName}`);
 *   console.log(`  Type: ${schema.schemaType}`);
 *   if (schema.iamRole) {
 *     console.log(`  IAM Role: ${schema.iamRole}`);
 *   }
 * }
 *
 * // List external tables
 * const tables = await spectrum.listExternalTables('spectrum_schema');
 * for (const table of tables) {
 *   console.log(`  Table: ${table.tableName}`);
 *   console.log(`    Location: ${table.location}`);
 *   console.log(`    Format: ${table.format}`);
 *   console.log(`    Partitioned: ${table.isPartitioned}`);
 * }
 *
 * // Get partitions for a partitioned table
 * const partitions = await spectrum.getPartitions('spectrum_schema', 'sales_data');
 * for (const partition of partitions) {
 *   console.log(`  Partition: ${JSON.stringify(partition.values)}`);
 *   console.log(`    Location: ${partition.location}`);
 * }
 * ```
 */
export class SpectrumManager {
  private readonly pool: ConnectionPool;

  /**
   * Creates a new SpectrumManager instance.
   *
   * @param pool - Connection pool for executing Spectrum queries
   */
  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  /**
   * Lists all external schemas.
   *
   * Queries the SVV_EXTERNAL_SCHEMAS system view to retrieve information
   * about all external schemas configured in the cluster.
   *
   * @returns Promise resolving to array of external schema information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const schemas = await spectrum.listExternalSchemas();
   *
   * for (const schema of schemas) {
   *   console.log(`${schema.schemaName}:`);
   *   console.log(`  External Database: ${schema.databaseName}`);
   *   console.log(`  Type: ${schema.schemaType}`);
   *   console.log(`  Owner: ${schema.owner}`);
   * }
   * ```
   */
  async listExternalSchemas(): Promise<ExternalSchemaInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          schemaname AS schema_name,
          databasename AS database_name,
          esoptions AS options,
          esoid AS schema_oid
        FROM svv_external_schemas
        ORDER BY schemaname
      `;

      const result = await session.execute(query);

      // Get owner and IAM role information from pg_namespace
      const ownerQuery = `
        SELECT
          n.nspname AS schema_name,
          u.usename AS owner
        FROM pg_namespace n
        LEFT JOIN pg_user u ON n.nspowner = u.usesysid
        WHERE n.nspname IN (
          SELECT schemaname FROM svv_external_schemas
        )
      `;

      const ownerResult = await session.execute(ownerQuery);
      const ownerMap = new Map(
        ownerResult.rows.map((row: any) => [row.schema_name, row.owner])
      );

      return result.rows.map((row: any) => {
        const options = this.parseOptions(row.options);
        const schemaType = this.determineSchemaType(options);

        return {
          schemaName: row.schema_name || '',
          databaseName: row.database_name || '',
          owner: ownerMap.get(row.schema_name) || '',
          schemaType,
          iamRole: options.IAM_ROLE || options.iam_role || undefined,
          databaseUri: options.DATABASE || undefined,
          options,
        };
      });
    } catch (error) {
      throw new RedshiftError(
        'Failed to list external schemas',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Lists all external tables in a schema.
   *
   * Queries the SVV_EXTERNAL_TABLES system view to retrieve information
   * about external tables in the specified schema.
   *
   * @param schema - External schema name
   * @returns Promise resolving to array of external table information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const tables = await spectrum.listExternalTables('spectrum_schema');
   *
   * for (const table of tables) {
   *   console.log(`${table.tableName}:`);
   *   console.log(`  Location: ${table.location}`);
   *   console.log(`  Format: ${table.format}`);
   *   console.log(`  Columns: ${table.columnCount}`);
   *
   *   if (table.isPartitioned && table.partitionColumns) {
   *     console.log(`  Partition Keys: ${table.partitionColumns.join(', ')}`);
   *   }
   * }
   * ```
   */
  async listExternalTables(schema: string): Promise<ExternalTableInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          schemaname AS schema_name,
          tablename AS table_name,
          location,
          input_format,
          output_format,
          serialization_lib AS serde_lib,
          serde_parameters AS serde_params,
          compressed,
          parameters
        FROM svv_external_tables
        WHERE schemaname = $1
        ORDER BY tablename
      `;

      const result = await session.execute(query, [schema]);

      // Get column counts and partition info
      const tables = await Promise.all(
        result.rows.map(async (row: any) => {
          const tableName = row.table_name;

          // Get column count and partition columns
          const columnQuery = `
            SELECT
              columnname AS column_name,
              external_type AS data_type,
              columnnum AS ordinal_position,
              part_key AS is_partition_key
            FROM svv_external_columns
            WHERE schemaname = $1
              AND tablename = $2
            ORDER BY columnnum
          `;

          const columnResult = await session.execute(columnQuery, [schema, tableName]);
          const columns = columnResult.rows;

          const partitionColumns = columns
            .filter((c: any) => c.is_partition_key > 0)
            .map((c: any) => c.column_name);

          const serdeParams = this.parseSerdeParams(row.serde_params);
          const format = this.determineFileFormat(
            row.input_format,
            row.output_format,
            row.serde_lib
          );

          return {
            schemaName: row.schema_name || schema,
            tableName,
            location: row.location || '',
            columnCount: columns.length,
            format,
            isPartitioned: partitionColumns.length > 0,
            partitionColumns: partitionColumns.length > 0 ? partitionColumns : undefined,
            inputFormat: row.input_format || undefined,
            outputFormat: row.output_format || undefined,
            serdeLib: row.serde_lib || undefined,
            serdeParams: Object.keys(serdeParams).length > 0 ? serdeParams : undefined,
          };
        })
      );

      return tables;
    } catch (error) {
      throw new RedshiftError(
        `Failed to list external tables in schema '${schema}'`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
          context: { schema },
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Lists all columns in an external table.
   *
   * @param schema - External schema name
   * @param table - External table name
   * @returns Promise resolving to array of column information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const columns = await spectrum.listExternalColumns('spectrum_schema', 'sales_data');
   *
   * for (const col of columns) {
   *   const marker = col.isPartitionColumn ? ' [PARTITION KEY]' : '';
   *   console.log(`  ${col.columnName}: ${col.dataType}${marker}`);
   * }
   * ```
   */
  async listExternalColumns(schema: string, table: string): Promise<ExternalColumnInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          columnname AS column_name,
          external_type AS data_type,
          columnnum AS ordinal_position,
          part_key AS is_partition_key
        FROM svv_external_columns
        WHERE schemaname = $1
          AND tablename = $2
        ORDER BY columnnum
      `;

      const result = await session.execute(query, [schema, table]);

      return result.rows.map((row: any) => ({
        columnName: row.column_name || '',
        ordinalPosition: parseInt(row.ordinal_position, 10) || 0,
        dataType: row.data_type || '',
        isPartitionColumn: parseInt(row.is_partition_key, 10) > 0,
      }));
    } catch (error) {
      throw new RedshiftError(
        `Failed to list columns for external table '${schema}.${table}'`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
          context: { schema, table },
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Gets all partitions for a partitioned external table.
   *
   * Queries the SVV_EXTERNAL_PARTITIONS system view to retrieve
   * partition information.
   *
   * @param schema - External schema name
   * @param table - External table name
   * @returns Promise resolving to array of partition information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const partitions = await spectrum.getPartitions('spectrum_schema', 'sales_data');
   *
   * console.log(`Found ${partitions.length} partitions:`);
   * for (const partition of partitions) {
   *   console.log(`  Partition: ${JSON.stringify(partition.values)}`);
   *   console.log(`    Location: ${partition.location}`);
   *
   *   if (partition.sizeBytes) {
   *     const sizeMb = (partition.sizeBytes / 1024 / 1024).toFixed(2);
   *     console.log(`    Size: ${sizeMb} MB`);
   *   }
   * }
   * ```
   */
  async getPartitions(schema: string, table: string): Promise<PartitionInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          schemaname AS schema_name,
          tablename AS table_name,
          values AS partition_values,
          location
        FROM svv_external_partitions
        WHERE schemaname = $1
          AND tablename = $2
        ORDER BY values
      `;

      const result = await session.execute(query, [schema, table]);

      return result.rows.map((row: any) => ({
        schemaName: row.schema_name || schema,
        tableName: row.table_name || table,
        values: this.parsePartitionValues(row.partition_values),
        location: row.location || '',
      }));
    } catch (error) {
      throw new RedshiftError(
        `Failed to get partitions for external table '${schema}.${table}'`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
          context: { schema, table },
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Checks if an external schema exists.
   *
   * @param schema - External schema name
   * @returns Promise resolving to true if schema exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await spectrum.externalSchemaExists('spectrum_schema')) {
   *   console.log('External schema exists');
   * } else {
   *   console.log('External schema does not exist');
   * }
   * ```
   */
  async externalSchemaExists(schema: string): Promise<boolean> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT 1
        FROM svv_external_schemas
        WHERE schemaname = $1
        LIMIT 1
      `;

      const result = await session.execute(query, [schema]);
      return result.rows.length > 0;
    } catch (error) {
      throw new RedshiftError(
        `Failed to check if external schema '${schema}' exists`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
          context: { schema },
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Checks if an external table exists.
   *
   * @param schema - External schema name
   * @param table - External table name
   * @returns Promise resolving to true if table exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await spectrum.externalTableExists('spectrum_schema', 'sales_data')) {
   *   const partitions = await spectrum.getPartitions('spectrum_schema', 'sales_data');
   *   console.log(`Table has ${partitions.length} partitions`);
   * }
   * ```
   */
  async externalTableExists(schema: string, table: string): Promise<boolean> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT 1
        FROM svv_external_tables
        WHERE schemaname = $1
          AND tablename = $2
        LIMIT 1
      `;

      const result = await session.execute(query, [schema, table]);
      return result.rows.length > 0;
    } catch (error) {
      throw new RedshiftError(
        `Failed to check if external table '${schema}.${table}' exists`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
          context: { schema, table },
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Parses external schema options from the options string.
   */
  private parseOptions(optionsStr: string): Record<string, string> {
    if (!optionsStr) {
      return {};
    }

    const options: Record<string, string> = {};
    try {
      // Options are typically in the format: key=value, key2=value2
      const pairs = optionsStr.split(',');
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          options[key.trim()] = value.replace(/^['"]|['"]$/g, ''); // Remove quotes
        }
      }
    } catch (error) {
      // If parsing fails, return empty object
    }

    return options;
  }

  /**
   * Determines the schema type from options.
   */
  private determineSchemaType(options: Record<string, string>): string {
    if (options.catalog_role || options.CATALOG_ROLE) {
      return 'GLUE';
    }
    if (options.DATABASE) {
      return 'HIVE';
    }
    return 'UNKNOWN';
  }

  /**
   * Parses SerDe parameters.
   */
  private parseSerdeParams(paramsStr: string): Record<string, string> {
    if (!paramsStr) {
      return {};
    }

    const params: Record<string, string> = {};
    try {
      // Parameters are typically in a similar format to options
      const pairs = paramsStr.split(',');
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          params[key.trim()] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    } catch (error) {
      // If parsing fails, return empty object
    }

    return params;
  }

  /**
   * Determines the file format from input/output formats and SerDe.
   */
  private determineFileFormat(
    inputFormat?: string,
    outputFormat?: string,
    serdeLib?: string
  ): string | undefined {
    if (!inputFormat && !outputFormat && !serdeLib) {
      return undefined;
    }

    const formats = [inputFormat, outputFormat, serdeLib].join(' ').toLowerCase();

    if (formats.includes('parquet')) {
      return 'PARQUET';
    }
    if (formats.includes('orc')) {
      return 'ORC';
    }
    if (formats.includes('avro')) {
      return 'AVRO';
    }
    if (formats.includes('json')) {
      return 'JSON';
    }
    if (formats.includes('text')) {
      return 'TEXTFILE';
    }
    if (formats.includes('csv')) {
      return 'CSV';
    }

    return 'UNKNOWN';
  }

  /**
   * Parses partition values from the partition values string.
   */
  private parsePartitionValues(valuesStr: string): Record<string, string> {
    if (!valuesStr) {
      return {};
    }

    const values: Record<string, string> = {};
    try {
      // Partition values are typically in the format: [key1=value1, key2=value2]
      const cleaned = valuesStr.replace(/^\[|\]$/g, '').trim();
      const pairs = cleaned.split(',');

      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          values[key.trim()] = valueParts.join('=').trim();
        }
      }
    } catch (error) {
      // If parsing fails, return empty object
    }

    return values;
  }
}
