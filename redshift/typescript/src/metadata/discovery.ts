/**
 * Redshift Metadata Discovery
 *
 * Provides interfaces and implementations for discovering and exploring
 * Redshift database schemas, tables, columns, and statistics.
 *
 * @module @llmdevops/redshift-integration/metadata/discovery
 */

import type { ConnectionPool } from '../pool/pool.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Information about a database schema.
 */
export interface SchemaInfo {
  /**
   * Schema name.
   */
  schemaName: string;

  /**
   * Owner of the schema.
   */
  owner: string;

  /**
   * Schema type (e.g., 'local', 'external').
   */
  schemaType: string;

  /**
   * Number of tables in this schema.
   */
  tableCount?: number;
}

/**
 * Information about a table.
 */
export interface TableInfo {
  /**
   * Schema name.
   */
  schemaName: string;

  /**
   * Table name.
   */
  tableName: string;

  /**
   * Table type (e.g., 'TABLE', 'VIEW', 'EXTERNAL TABLE').
   */
  tableType: string;

  /**
   * Owner of the table.
   */
  owner: string;

  /**
   * Number of rows (approximate, from statistics).
   */
  rowCount?: number;

  /**
   * Table size in bytes.
   */
  sizeBytes?: number;

  /**
   * Distribution style (KEY, EVEN, ALL).
   */
  distributionStyle?: string;

  /**
   * Sort key columns.
   */
  sortKeys?: string[];

  /**
   * Whether the table is encoded.
   */
  encoded?: boolean;
}

/**
 * Information about a table column.
 */
export interface ColumnInfo {
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
   * Whether the column is nullable.
   */
  isNullable: boolean;

  /**
   * Default value expression.
   */
  defaultValue?: string;

  /**
   * Maximum character length (for string types).
   */
  characterMaximumLength?: number;

  /**
   * Numeric precision (for numeric types).
   */
  numericPrecision?: number;

  /**
   * Numeric scale (for numeric types).
   */
  numericScale?: number;

  /**
   * Encoding type (e.g., 'lzo', 'zstd').
   */
  encoding?: string;

  /**
   * Whether this column is a distribution key.
   */
  isDistKey?: boolean;

  /**
   * Whether this column is a sort key.
   */
  isSortKey?: boolean;
}

/**
 * Statistics about a table.
 */
export interface TableStats {
  /**
   * Schema name.
   */
  schemaName: string;

  /**
   * Table name.
   */
  tableName: string;

  /**
   * Approximate row count.
   */
  rowCount: number;

  /**
   * Table size in bytes.
   */
  sizeBytes: number;

  /**
   * Number of data blocks.
   */
  blockCount?: number;

  /**
   * Percentage of table that is unsorted.
   */
  unsortedPercent?: number;

  /**
   * Statistics staleness (days since last ANALYZE).
   */
  statsStaleness?: number;

  /**
   * Last vacuum time.
   */
  lastVacuum?: Date;

  /**
   * Last analyze time.
   */
  lastAnalyze?: Date;

  /**
   * Number of columns.
   */
  columnCount?: number;
}

// ============================================================================
// Schema Discovery
// ============================================================================

/**
 * SchemaDiscovery provides methods for discovering and exploring Redshift schemas.
 *
 * This class allows you to:
 * - List all schemas in the database
 * - Discover tables and their properties
 * - Explore column metadata
 * - Retrieve table statistics
 *
 * @example
 * ```typescript
 * const discovery = new SchemaDiscovery(pool);
 *
 * // List all schemas
 * const schemas = await discovery.listSchemas();
 * for (const schema of schemas) {
 *   console.log(`Schema: ${schema.schemaName} (${schema.tableCount} tables)`);
 * }
 *
 * // List tables in a schema
 * const tables = await discovery.listTables('public');
 * for (const table of tables) {
 *   console.log(`  Table: ${table.tableName} (${table.rowCount} rows, ${table.distributionStyle})`);
 * }
 *
 * // Get table columns
 * const columns = await discovery.listColumns('public', 'sales');
 * for (const col of columns) {
 *   console.log(`    Column: ${col.columnName} ${col.dataType}`);
 * }
 *
 * // Get table statistics
 * const stats = await discovery.getTableStats('public', 'sales');
 * console.log(`Statistics: ${stats.rowCount} rows, ${stats.sizeBytes} bytes`);
 * ```
 */
export class SchemaDiscovery {
  private readonly pool: ConnectionPool;

  /**
   * Creates a new SchemaDiscovery instance.
   *
   * @param pool - Connection pool for executing metadata queries
   */
  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  /**
   * Lists all schemas in the database.
   *
   * Queries the pg_namespace catalog to retrieve schema information.
   * Excludes system schemas (pg_*, information_schema) by default.
   *
   * @param includeSystem - Whether to include system schemas (default: false)
   * @returns Promise resolving to array of schema information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * // List user schemas only
   * const schemas = await discovery.listSchemas();
   *
   * // Include system schemas
   * const allSchemas = await discovery.listSchemas(true);
   * ```
   */
  async listSchemas(includeSystem: boolean = false): Promise<SchemaInfo[]> {
    const session = await this.pool.acquire();

    try {
      const systemFilter = includeSystem
        ? ''
        : `WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'`;

      const query = `
        SELECT
          n.nspname AS schema_name,
          u.usename AS owner,
          CASE
            WHEN n.nspname LIKE 'pg_temp%' THEN 'temporary'
            WHEN n.nspname LIKE 'pg_%' THEN 'system'
            ELSE 'local'
          END AS schema_type,
          COUNT(c.oid) AS table_count
        FROM pg_namespace n
        LEFT JOIN pg_user u ON n.nspowner = u.usesysid
        LEFT JOIN pg_class c ON c.relnamespace = n.oid
          AND c.relkind IN ('r', 'v')
        ${systemFilter}
        GROUP BY n.nspname, u.usename, n.oid
        ORDER BY n.nspname
      `;

      const result = await session.execute(query);

      return result.rows.map((row: any) => ({
        schemaName: row.schema_name || '',
        owner: row.owner || '',
        schemaType: row.schema_type || 'local',
        tableCount: parseInt(row.table_count, 10) || 0,
      }));
    } catch (error) {
      throw new RedshiftError(
        'Failed to list schemas',
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
   * Lists all tables in a schema.
   *
   * Queries the SVV_TABLE_INFO view to get comprehensive table information
   * including Redshift-specific properties.
   *
   * @param schema - Schema name (default: 'public')
   * @returns Promise resolving to array of table information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const tables = await discovery.listTables('public');
   *
   * for (const table of tables) {
   *   console.log(`${table.tableName}:`);
   *   console.log(`  Type: ${table.tableType}`);
   *   console.log(`  Rows: ${table.rowCount}`);
   *   console.log(`  Size: ${(table.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
   *   console.log(`  Distribution: ${table.distributionStyle}`);
   *   if (table.sortKeys && table.sortKeys.length > 0) {
   *     console.log(`  Sort Keys: ${table.sortKeys.join(', ')}`);
   *   }
   * }
   * ```
   */
  async listTables(schema: string = 'public'): Promise<TableInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          schemaname AS schema_name,
          tablename AS table_name,
          tableowner AS owner,
          CASE
            WHEN "type" = 'TABLE' THEN 'TABLE'
            WHEN "type" = 'VIEW' THEN 'VIEW'
            ELSE 'OTHER'
          END AS table_type,
          "rows" AS row_count,
          size AS size_bytes,
          diststyle AS distribution_style,
          sortkey1 AS sort_keys,
          encoded
        FROM svv_table_info
        WHERE schemaname = $1
        ORDER BY tablename
      `;

      const result = await session.execute(query, [schema]);

      return result.rows.map((row: any) => ({
        schemaName: row.schema_name || '',
        tableName: row.table_name || '',
        tableType: row.table_type || 'TABLE',
        owner: row.owner || '',
        rowCount: parseInt(row.row_count, 10) || undefined,
        sizeBytes: parseInt(row.size_bytes, 10) || undefined,
        distributionStyle: row.distribution_style || undefined,
        sortKeys: row.sort_keys ? [row.sort_keys] : undefined,
        encoded: row.encoded === 'Y',
      }));
    } catch (error) {
      throw new RedshiftError(
        `Failed to list tables in schema '${schema}'`,
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
   * Lists all columns in a table.
   *
   * Queries the pg_attribute catalog and additional Redshift system tables
   * to get detailed column information including encoding and key information.
   *
   * @param schema - Schema name
   * @param table - Table name
   * @returns Promise resolving to array of column information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const columns = await discovery.listColumns('public', 'sales');
   *
   * for (const col of columns) {
   *   console.log(`${col.columnName}:`);
   *   console.log(`  Type: ${col.dataType}`);
   *   console.log(`  Nullable: ${col.isNullable}`);
   *   if (col.encoding) {
   *     console.log(`  Encoding: ${col.encoding}`);
   *   }
   *   if (col.isDistKey) {
   *     console.log(`  DISTKEY`);
   *   }
   *   if (col.isSortKey) {
   *     console.log(`  SORTKEY`);
   *   }
   * }
   * ```
   */
  async listColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          a.attname AS column_name,
          a.attnum AS ordinal_position,
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
          NOT a.attnotnull AS is_nullable,
          pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_value,
          CASE
            WHEN t.typname IN ('varchar', 'char', 'bpchar') THEN a.atttypmod - 4
            ELSE NULL
          END AS character_maximum_length,
          CASE
            WHEN t.typname IN ('numeric', 'decimal') THEN ((a.atttypmod - 4) >> 16) & 65535
            ELSE NULL
          END AS numeric_precision,
          CASE
            WHEN t.typname IN ('numeric', 'decimal') THEN (a.atttypmod - 4) & 65535
            ELSE NULL
          END AS numeric_scale,
          pg_catalog.col_description(c.oid, a.attnum) AS description
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_catalog.pg_type t ON a.atttypid = t.oid
        LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
        WHERE n.nspname = $1
          AND c.relname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `;

      const result = await session.execute(query, [schema, table]);

      // Get encoding information from pg_table_def
      const encodingQuery = `
        SELECT
          "column" AS column_name,
          encoding,
          distkey,
          sortkey > 0 AS is_sortkey
        FROM pg_table_def
        WHERE schemaname = $1
          AND tablename = $2
      `;

      const encodingResult = await session.execute(encodingQuery, [schema, table]);
      const encodingMap = new Map(
        encodingResult.rows.map((row: any) => [
          row.column_name,
          {
            encoding: row.encoding,
            distkey: row.distkey,
            isSortkey: row.is_sortkey,
          },
        ])
      );

      return result.rows.map((row: any) => {
        const encoding = encodingMap.get(row.column_name);
        return {
          columnName: row.column_name || '',
          ordinalPosition: parseInt(row.ordinal_position, 10),
          dataType: row.data_type || '',
          isNullable: row.is_nullable === true || row.is_nullable === 't',
          defaultValue: row.default_value || undefined,
          characterMaximumLength: row.character_maximum_length
            ? parseInt(row.character_maximum_length, 10)
            : undefined,
          numericPrecision: row.numeric_precision
            ? parseInt(row.numeric_precision, 10)
            : undefined,
          numericScale: row.numeric_scale
            ? parseInt(row.numeric_scale, 10)
            : undefined,
          encoding: encoding?.encoding || undefined,
          isDistKey: encoding?.distkey || false,
          isSortKey: encoding?.isSortkey || false,
        };
      });
    } catch (error) {
      throw new RedshiftError(
        `Failed to list columns for table '${schema}.${table}'`,
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
   * Gets statistics for a table.
   *
   * Retrieves comprehensive statistics including row count, size,
   * vacuum/analyze information, and sort status.
   *
   * @param schema - Schema name
   * @param table - Table name
   * @returns Promise resolving to table statistics
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const stats = await discovery.getTableStats('public', 'sales');
   *
   * console.log(`Table Statistics for ${stats.schemaName}.${stats.tableName}:`);
   * console.log(`  Rows: ${stats.rowCount.toLocaleString()}`);
   * console.log(`  Size: ${(stats.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
   * console.log(`  Unsorted: ${stats.unsortedPercent}%`);
   *
   * if (stats.statsStaleness && stats.statsStaleness > 7) {
   *   console.log(`  WARNING: Statistics are ${stats.statsStaleness} days old - consider running ANALYZE`);
   * }
   *
   * if (stats.unsortedPercent && stats.unsortedPercent > 10) {
   *   console.log(`  WARNING: Table is ${stats.unsortedPercent}% unsorted - consider running VACUUM`);
   * }
   * ```
   */
  async getTableStats(schema: string, table: string): Promise<TableStats> {
    const session = await this.pool.acquire();

    try {
      // Get basic stats from SVV_TABLE_INFO
      const statsQuery = `
        SELECT
          schemaname AS schema_name,
          tablename AS table_name,
          "rows" AS row_count,
          size AS size_bytes,
          unsorted AS unsorted_percent,
          stats_off AS stats_staleness
        FROM svv_table_info
        WHERE schemaname = $1
          AND tablename = $2
      `;

      const statsResult = await session.execute(statsQuery, [schema, table]);
      if (statsResult.rows.length === 0) {
        throw new RedshiftError(
          `Table '${schema}.${table}' not found`,
          RedshiftErrorCode.OBJECT_NOT_FOUND,
          {
            retryable: false,
            context: { schema, table },
          }
        );
      }

      const row = statsResult.rows[0];

      // Get column count
      const columnQuery = `
        SELECT COUNT(*) AS column_count
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = $1
          AND c.relname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
      `;

      const columnResult = await session.execute(columnQuery, [schema, table]);
      const columnCount = parseInt(columnResult.rows[0]?.column_count, 10) || 0;

      return {
        schemaName: row.schema_name || schema,
        tableName: row.table_name || table,
        rowCount: parseInt(row.row_count, 10) || 0,
        sizeBytes: parseInt(row.size_bytes, 10) || 0,
        unsortedPercent: parseFloat(row.unsorted_percent) || undefined,
        statsStaleness: parseFloat(row.stats_staleness) || undefined,
        columnCount,
      };
    } catch (error) {
      if (error instanceof RedshiftError) {
        throw error;
      }
      throw new RedshiftError(
        `Failed to get statistics for table '${schema}.${table}'`,
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
   * Checks if a table exists.
   *
   * @param schema - Schema name
   * @param table - Table name
   * @returns Promise resolving to true if table exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await discovery.tableExists('public', 'sales')) {
   *   console.log('Sales table exists');
   * } else {
   *   console.log('Sales table does not exist');
   * }
   * ```
   */
  async tableExists(schema: string, table: string): Promise<boolean> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = $1
          AND c.relname = $2
          AND c.relkind IN ('r', 'v')
        LIMIT 1
      `;

      const result = await session.execute(query, [schema, table]);
      return result.rows.length > 0;
    } catch (error) {
      throw new RedshiftError(
        `Failed to check if table '${schema}.${table}' exists`,
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
}
