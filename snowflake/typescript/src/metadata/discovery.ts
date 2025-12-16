/**
 * Schema Discovery Service
 *
 * Service for discovering and exploring Snowflake database schema metadata.
 * @module @llmdevops/snowflake-integration/metadata/discovery
 */

import {
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  SnowflakeDataType,
} from '../types/index.js';
import { ObjectNotFoundError } from '../errors/index.js';

/**
 * Connection interface for executing queries.
 * This should be implemented by the Snowflake client or connection pool.
 */
export interface QueryExecutor {
  execute<T = unknown>(sql: string): Promise<T[]>;
}

/**
 * Schema discovery service for exploring database objects.
 */
export class SchemaDiscoveryService {
  constructor(private readonly executor: QueryExecutor) {}

  /**
   * Lists all accessible databases.
   *
   * @returns Array of database information
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const databases = await discovery.listDatabases();
   * console.log(`Found ${databases.length} databases`);
   * ```
   */
  async listDatabases(): Promise<DatabaseInfo[]> {
    const sql = 'SHOW DATABASES';
    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    return rows.map((row) => ({
      name: this.getString(row, 'name'),
      owner: this.getOptionalString(row, 'owner'),
      comment: this.getOptionalString(row, 'comment'),
      createdAt: this.getOptionalDate(row, 'created_on'),
      retentionTime: this.getOptionalNumber(row, 'retention_time'),
      isTransient: this.getString(row, 'is_transient') === 'Y',
      isDefault: this.getString(row, 'is_default') === 'Y',
    }));
  }

  /**
   * Lists all schemas in a database.
   *
   * @param database - Database name
   * @returns Array of schema information
   * @throws {ObjectNotFoundError} If the database does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const schemas = await discovery.listSchemas('MYDB');
   * for (const schema of schemas) {
   *   console.log(schema.name);
   * }
   * ```
   */
  async listSchemas(database: string): Promise<SchemaInfo[]> {
    const sql = `SHOW SCHEMAS IN DATABASE ${this.quoteIdentifier(database)}`;
    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    return rows.map((row) => ({
      name: this.getString(row, 'name'),
      database,
      owner: this.getOptionalString(row, 'owner'),
      comment: this.getOptionalString(row, 'comment'),
      createdAt: this.getOptionalDate(row, 'created_on'),
      retentionTime: this.getOptionalNumber(row, 'retention_time'),
      isTransient: this.getString(row, 'is_transient') === 'Y',
      isManagedAccess: this.getString(row, 'is_managed_access') === 'Y',
    }));
  }

  /**
   * Lists all tables in a schema.
   *
   * @param database - Database name
   * @param schema - Schema name
   * @returns Array of table information
   * @throws {ObjectNotFoundError} If the database or schema does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const tables = await discovery.listTables('MYDB', 'PUBLIC');
   * console.log(`Found ${tables.length} tables`);
   * ```
   */
  async listTables(database: string, schema: string): Promise<TableInfo[]> {
    const sql = `SHOW TABLES IN ${this.quoteIdentifier(database)}.${this.quoteIdentifier(schema)}`;
    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    return rows
      .filter((row) => {
        const kind = this.getString(row, 'kind');
        return kind === 'TABLE' || kind === 'TRANSIENT' || kind === 'TEMPORARY';
      })
      .map((row) => this.parseTableInfo(row, database, schema));
  }

  /**
   * Lists all views in a schema.
   *
   * @param database - Database name
   * @param schema - Schema name
   * @returns Array of view information
   * @throws {ObjectNotFoundError} If the database or schema does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const views = await discovery.listViews('MYDB', 'PUBLIC');
   * console.log(`Found ${views.length} views`);
   * ```
   */
  async listViews(database: string, schema: string): Promise<TableInfo[]> {
    const sql = `SHOW VIEWS IN ${this.quoteIdentifier(database)}.${this.quoteIdentifier(schema)}`;
    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    return rows.map((row) => this.parseTableInfo(row, database, schema));
  }

  /**
   * Describes a table, returning column information.
   *
   * @param fullyQualifiedName - Fully qualified table name (database.schema.table)
   * @returns Array of column information
   * @throws {ObjectNotFoundError} If the table does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const columns = await discovery.describeTable('MYDB.PUBLIC.USERS');
   * for (const col of columns) {
   *   console.log(`${col.name}: ${col.dataType}`);
   * }
   * ```
   */
  async describeTable(fullyQualifiedName: string): Promise<ColumnInfo[]> {
    const sql = `DESCRIBE TABLE ${fullyQualifiedName}`;
    const rows = await this.executor.execute<Record<string, unknown>>(sql);

    if (rows.length === 0) {
      throw new ObjectNotFoundError('Table', fullyQualifiedName);
    }

    return rows.map((row, index) => ({
      name: this.getString(row, 'name'),
      ordinalPosition: index + 1,
      dataType: this.parseDataType(this.getString(row, 'type')),
      isNullable: this.getString(row, 'null?') === 'Y',
      defaultValue: this.getOptionalString(row, 'default'),
      comment: this.getOptionalString(row, 'comment'),
      isPrimaryKey: this.getString(row, 'primary key') === 'Y',
      isUnique: this.getString(row, 'unique key') === 'Y',
      characterMaxLength: this.parseCharacterLength(this.getString(row, 'type')),
      numericPrecision: this.parseNumericPrecision(this.getString(row, 'type')),
      numericScale: this.parseNumericScale(this.getString(row, 'type')),
    }));
  }

  /**
   * Gets detailed information about a specific table.
   *
   * @param database - Database name
   * @param schema - Schema name
   * @param table - Table name
   * @returns Table information
   * @throws {ObjectNotFoundError} If the table does not exist
   * @throws {SnowflakeError} If the query fails
   *
   * @example
   * ```typescript
   * const tableInfo = await discovery.getTableInfo('MYDB', 'PUBLIC', 'USERS');
   * console.log(`Table has ${tableInfo.rowCount} rows`);
   * ```
   */
  async getTableInfo(
    database: string,
    schema: string,
    table: string
  ): Promise<TableInfo> {
    const sql = `
      SELECT
        t.TABLE_NAME,
        t.TABLE_TYPE,
        t.TABLE_OWNER,
        t.COMMENT,
        t.ROW_COUNT,
        t.BYTES,
        t.CREATED,
        t.LAST_ALTERED,
        t.CLUSTERING_KEY,
        t.IS_EXTERNAL
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
      name: this.getString(row, 'TABLE_NAME'),
      database,
      schema,
      tableType: this.getString(row, 'TABLE_TYPE'),
      owner: this.getOptionalString(row, 'TABLE_OWNER'),
      comment: this.getOptionalString(row, 'COMMENT'),
      rowCount: this.getOptionalNumber(row, 'ROW_COUNT'),
      bytes: this.getOptionalNumber(row, 'BYTES'),
      createdAt: this.getOptionalDate(row, 'CREATED'),
      lastAlteredAt: this.getOptionalDate(row, 'LAST_ALTERED'),
      clusterBy: this.parseClusterKeys(this.getOptionalString(row, 'CLUSTERING_KEY')),
      isExternal: this.getOptionalString(row, 'IS_EXTERNAL') === 'Y',
    };
  }

  /**
   * Parses table information from a SHOW TABLES/VIEWS result row.
   */
  private parseTableInfo(
    row: Record<string, unknown>,
    database: string,
    schema: string
  ): TableInfo {
    return {
      name: this.getString(row, 'name'),
      database,
      schema,
      tableType: this.getString(row, 'kind'),
      owner: this.getOptionalString(row, 'owner'),
      comment: this.getOptionalString(row, 'comment'),
      rowCount: this.getOptionalNumber(row, 'rows'),
      bytes: this.getOptionalNumber(row, 'bytes'),
      createdAt: this.getOptionalDate(row, 'created_on'),
      lastAlteredAt: this.getOptionalDate(row, 'updated_on'),
      clusterBy: this.parseClusterKeys(this.getOptionalString(row, 'cluster_by')),
      isExternal: false,
    };
  }

  /**
   * Parses a Snowflake data type string.
   */
  private parseDataType(typeStr: string): SnowflakeDataType {
    const upper = typeStr.toUpperCase();

    // Extract base type (before any parentheses)
    const baseType = upper.split('(')[0]!.trim();

    // Map to SnowflakeDataType
    switch (baseType) {
      case 'NUMBER':
      case 'NUMERIC':
      case 'DECIMAL':
        return 'NUMBER';
      case 'INT':
      case 'INTEGER':
        return 'INTEGER';
      case 'BIGINT':
        return 'BIGINT';
      case 'SMALLINT':
        return 'SMALLINT';
      case 'TINYINT':
        return 'TINYINT';
      case 'BYTEINT':
        return 'BYTEINT';
      case 'FLOAT':
      case 'FLOAT4':
      case 'FLOAT8':
        return 'FLOAT';
      case 'DOUBLE':
      case 'DOUBLE PRECISION':
      case 'REAL':
        return 'DOUBLE';
      case 'VARCHAR':
      case 'STRING':
        return 'VARCHAR';
      case 'CHAR':
      case 'CHARACTER':
        return 'CHAR';
      case 'TEXT':
        return 'TEXT';
      case 'BINARY':
        return 'BINARY';
      case 'VARBINARY':
        return 'VARBINARY';
      case 'BOOLEAN':
        return 'BOOLEAN';
      case 'DATE':
        return 'DATE';
      case 'DATETIME':
        return 'DATETIME';
      case 'TIME':
        return 'TIME';
      case 'TIMESTAMP':
      case 'TIMESTAMP_NTZ':
        return 'TIMESTAMP_NTZ';
      case 'TIMESTAMP_LTZ':
        return 'TIMESTAMP_LTZ';
      case 'TIMESTAMP_TZ':
        return 'TIMESTAMP_TZ';
      case 'VARIANT':
        return 'VARIANT';
      case 'OBJECT':
        return 'OBJECT';
      case 'ARRAY':
        return 'ARRAY';
      case 'GEOGRAPHY':
        return 'GEOGRAPHY';
      case 'GEOMETRY':
        return 'GEOMETRY';
      default:
        // Default to VARCHAR for unknown types
        return 'VARCHAR';
    }
  }

  /**
   * Parses character length from type string (e.g., VARCHAR(100)).
   */
  private parseCharacterLength(typeStr: string): number | undefined {
    const match = typeStr.match(/\((\d+)\)/);
    return match && match[1] ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Parses numeric precision from type string (e.g., NUMBER(38,0)).
   */
  private parseNumericPrecision(typeStr: string): number | undefined {
    const match = typeStr.match(/\((\d+),\d+\)/);
    return match && match[1] ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Parses numeric scale from type string (e.g., NUMBER(38,2)).
   */
  private parseNumericScale(typeStr: string): number | undefined {
    const match = typeStr.match(/\(\d+,(\d+)\)/);
    return match && match[1] ? parseInt(match[1], 10) : undefined;
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
      /[^a-zA-Z0-9_]/.test(identifier) ||
      /^[0-9]/.test(identifier) ||
      this.isReservedWord(identifier);

    return needsQuoting ? `"${identifier.replace(/"/g, '""')}"` : identifier;
  }

  /**
   * Checks if a word is a SQL reserved word.
   */
  private isReservedWord(word: string): boolean {
    const reserved = [
      'SELECT',
      'FROM',
      'WHERE',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'DROP',
      'ALTER',
      'TABLE',
      'VIEW',
      'INDEX',
      'DATABASE',
      'SCHEMA',
      'USER',
      'ROLE',
      'GRANT',
      'REVOKE',
    ];
    return reserved.includes(word.toUpperCase());
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
