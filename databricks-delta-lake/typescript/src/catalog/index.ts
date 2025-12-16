/**
 * Unity Catalog Client
 *
 * Client for interacting with Databricks Unity Catalog API.
 * Provides operations for listing catalogs, schemas, and tables,
 * and retrieving table metadata.
 *
 * @module @llmdevops/databricks-delta-lake/catalog
 *
 * @example
 * ```typescript
 * import { CatalogClient } from '@llmdevops/databricks-delta-lake/catalog';
 *
 * // Create catalog client with HTTP executor
 * const catalogClient = new CatalogClient(httpExecutor);
 *
 * // List all catalogs
 * const catalogs = await catalogClient.listCatalogs();
 *
 * // List schemas in a catalog
 * const schemas = await catalogClient.listSchemas('main');
 *
 * // List tables in a schema
 * const tables = await catalogClient.listTables('main', 'analytics');
 *
 * // Get table metadata
 * const table = await catalogClient.getTable('main.analytics.user_events');
 * ```
 */

import {
  CatalogNotFound,
  SchemaNotFound,
  AccessDenied,
} from '../errors/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Catalog information from Unity Catalog
 */
export interface CatalogInfo {
  /** Catalog name */
  name: string;
  /** Optional comment/description */
  comment?: string;
  /** Owner of the catalog */
  owner?: string;
  /** Creation timestamp */
  createdAt?: Date;
}

/**
 * Schema information from Unity Catalog
 */
export interface SchemaInfo {
  /** Schema name */
  name: string;
  /** Parent catalog name */
  catalogName: string;
  /** Optional comment/description */
  comment?: string;
  /** Owner of the schema */
  owner?: string;
}

/**
 * Column information for a table
 */
export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Data type (e.g., STRING, INT, BIGINT, TIMESTAMP) */
  dataType: string;
  /** Whether the column is nullable */
  nullable: boolean;
  /** Optional comment/description */
  comment?: string;
  /** Ordinal position in table */
  position?: number;
  /** Type name (e.g., "int", "string") */
  typeName?: string;
  /** Type text (full type specification) */
  typeText?: string;
  /** Type precision for numeric types */
  typePrecision?: number;
  /** Type scale for numeric types */
  typeScale?: number;
  /** Type interval for interval types */
  typeInterval?: string;
}

/**
 * Table information from Unity Catalog
 */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Catalog name */
  catalogName: string;
  /** Schema name */
  schemaName: string;
  /** Table type (e.g., MANAGED, EXTERNAL, VIEW) */
  tableType: string;
  /** Data source format (e.g., DELTA, PARQUET, JSON) */
  dataSourceFormat?: string;
  /** Storage location (for external tables) */
  storageLocation?: string;
  /** Table columns */
  columns: ColumnInfo[];
  /** Optional comment/description */
  comment?: string;
  /** Owner of the table */
  owner?: string;
  /** Creation timestamp */
  createdAt?: Date;
  /** Last updated timestamp */
  updatedAt?: Date;
  /** Full name (catalog.schema.table) */
  fullName?: string;
}

/**
 * HTTP executor interface for making API requests
 */
export interface HttpExecutor {
  /**
   * Execute an HTTP request
   * @param method HTTP method
   * @param path API path
   * @param options Request options
   */
  request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string>;
    }
  ): Promise<T>;
}

// ============================================================================
// Unity Catalog Client
// ============================================================================

/**
 * Client for Unity Catalog operations.
 *
 * Provides methods for exploring the three-level namespace:
 * - Catalog (top-level namespace)
 * - Schema (database within a catalog)
 * - Table (table/view within a schema)
 *
 * Full table reference: catalog.schema.table
 * Example: main.analytics.user_events
 */
export class CatalogClient {
  /**
   * Creates a new CatalogClient
   * @param httpExecutor HTTP executor for API requests
   */
  constructor(private readonly httpExecutor: HttpExecutor) {}

  /**
   * Lists all accessible catalogs in Unity Catalog.
   *
   * @returns Array of catalog information
   * @throws {AccessDenied} If user lacks permission to list catalogs
   * @throws {DatabricksError} If the API request fails
   *
   * @example
   * ```typescript
   * const catalogs = await catalogClient.listCatalogs();
   * for (const catalog of catalogs) {
   *   console.log(`Catalog: ${catalog.name}`);
   * }
   * ```
   */
  async listCatalogs(): Promise<CatalogInfo[]> {
    try {
      const response = await this.httpExecutor.request<{
        catalogs?: unknown[];
      }>('GET', '/unity-catalog/catalogs');

      if (!response.catalogs || !Array.isArray(response.catalogs)) {
        return [];
      }

      return response.catalogs.map((catalog) => this.parseCatalogInfo(catalog));
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('403') || error.message.includes('permission'))
      ) {
        throw new AccessDenied(
          'Access denied to list catalogs',
          'catalogs',
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Lists all schemas in a catalog.
   *
   * @param catalog Catalog name
   * @returns Array of schema information
   * @throws {CatalogNotFound} If the catalog does not exist
   * @throws {AccessDenied} If user lacks permission to list schemas
   * @throws {DatabricksError} If the API request fails
   *
   * @example
   * ```typescript
   * const schemas = await catalogClient.listSchemas('main');
   * for (const schema of schemas) {
   *   console.log(`Schema: ${schema.name}`);
   * }
   * ```
   */
  async listSchemas(catalog: string): Promise<SchemaInfo[]> {
    try {
      const response = await this.httpExecutor.request<{
        schemas?: unknown[];
      }>('GET', '/unity-catalog/schemas', {
        params: { catalog_name: catalog },
      });

      if (!response.schemas || !Array.isArray(response.schemas)) {
        return [];
      }

      return response.schemas.map((schema) => this.parseSchemaInfo(schema));
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('404') || error.message.toLowerCase().includes('not found'))
      ) {
        throw new CatalogNotFound(catalog, { cause: error });
      }
      if (
        error instanceof Error &&
        (error.message.includes('403') || error.message.includes('permission'))
      ) {
        throw new AccessDenied(
          `Access denied to list schemas in catalog: ${catalog}`,
          catalog,
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Lists all tables in a schema.
   *
   * @param catalog Catalog name
   * @param schema Schema name
   * @returns Array of table information
   * @throws {CatalogNotFound} If the catalog does not exist
   * @throws {SchemaNotFound} If the schema does not exist
   * @throws {AccessDenied} If user lacks permission to list tables
   * @throws {DatabricksError} If the API request fails
   *
   * @example
   * ```typescript
   * const tables = await catalogClient.listTables('main', 'analytics');
   * for (const table of tables) {
   *   console.log(`Table: ${table.name} (${table.tableType})`);
   * }
   * ```
   */
  async listTables(catalog: string, schema: string): Promise<TableInfo[]> {
    try {
      const response = await this.httpExecutor.request<{
        tables?: unknown[];
      }>('GET', '/unity-catalog/tables', {
        params: {
          catalog_name: catalog,
          schema_name: schema,
        },
      });

      if (!response.tables || !Array.isArray(response.tables)) {
        return [];
      }

      return response.tables.map((table) => this.parseTableInfo(table));
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('404') || message.includes('not found')) {
          if (message.includes('catalog')) {
            throw new CatalogNotFound(catalog, { cause: error });
          }
          if (message.includes('schema')) {
            throw new SchemaNotFound(schema, { cause: error });
          }
        }
        if (message.includes('403') || message.includes('permission')) {
          throw new AccessDenied(
            `Access denied to list tables in ${catalog}.${schema}`,
            `${catalog}.${schema}`,
            { cause: error }
          );
        }
      }
      throw error;
    }
  }

  /**
   * Gets table metadata by full name.
   *
   * Full table name format: catalog.schema.table
   *
   * @param fullName Full table name (catalog.schema.table)
   * @returns Table information
   * @throws {TableNotFound} If the table does not exist
   * @throws {AccessDenied} If user lacks permission to access table
   * @throws {DatabricksError} If the API request fails
   *
   * @example
   * ```typescript
   * const table = await catalogClient.getTable('main.analytics.user_events');
   * console.log(`Table type: ${table.tableType}`);
   * console.log(`Columns: ${table.columns.length}`);
   * ```
   */
  async getTable(fullName: string): Promise<TableInfo> {
    try {
      const encodedName = this.urlEncode(fullName);
      const response = await this.httpExecutor.request<unknown>(
        'GET',
        `/unity-catalog/tables/${encodedName}`
      );

      return this.parseTableInfo(response);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('404') || error.message.toLowerCase().includes('not found'))
      ) {
        throw new SchemaNotFound(fullName, { cause: error });
      }
      if (
        error instanceof Error &&
        (error.message.includes('403') || error.message.includes('permission'))
      ) {
        throw new AccessDenied(
          `Access denied to table: ${fullName}`,
          fullName,
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Gets table metadata by catalog, schema, and table name.
   *
   * @param catalog Catalog name
   * @param schema Schema name
   * @param table Table name
   * @returns Table information
   * @throws {TableNotFound} If the table does not exist
   * @throws {AccessDenied} If user lacks permission to access table
   * @throws {DatabricksError} If the API request fails
   *
   * @example
   * ```typescript
   * const table = await catalogClient.getTableByParts('main', 'analytics', 'user_events');
   * console.log(`Storage location: ${table.storageLocation}`);
   * ```
   */
  async getTableByParts(
    catalog: string,
    schema: string,
    table: string
  ): Promise<TableInfo> {
    const fullName = `${catalog}.${schema}.${table}`;
    return this.getTable(fullName);
  }

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  /**
   * URL encodes a name for use in API paths.
   * Handles special characters in catalog, schema, or table names.
   *
   * @param name Name to encode
   * @returns URL-encoded name
   */
  private urlEncode(name: string): string {
    return encodeURIComponent(name);
  }

  /**
   * Parses catalog information from API response.
   *
   * @param response Raw catalog response
   * @returns Parsed catalog information
   */
  private parseCatalogInfo(response: unknown): CatalogInfo {
    const catalog = response as Record<string, unknown>;

    return {
      name: this.getString(catalog, 'name'),
      comment: this.getOptionalString(catalog, 'comment'),
      owner: this.getOptionalString(catalog, 'owner'),
      createdAt: this.getOptionalDate(catalog, 'created_at'),
    };
  }

  /**
   * Parses schema information from API response.
   *
   * @param response Raw schema response
   * @returns Parsed schema information
   */
  private parseSchemaInfo(response: unknown): SchemaInfo {
    const schema = response as Record<string, unknown>;

    return {
      name: this.getString(schema, 'name'),
      catalogName: this.getString(schema, 'catalog_name'),
      comment: this.getOptionalString(schema, 'comment'),
      owner: this.getOptionalString(schema, 'owner'),
    };
  }

  /**
   * Parses table information from API response.
   *
   * @param response Raw table response
   * @returns Parsed table information
   */
  private parseTableInfo(response: unknown): TableInfo {
    const table = response as Record<string, unknown>;

    const name = this.getString(table, 'name');
    const catalogName = this.getString(table, 'catalog_name');
    const schemaName = this.getString(table, 'schema_name');

    // Parse columns array
    const columnsArray = table.columns;
    const columns = Array.isArray(columnsArray)
      ? columnsArray.map((col) => this.parseColumnInfo(col))
      : [];

    return {
      name,
      catalogName,
      schemaName,
      tableType: this.getString(table, 'table_type'),
      dataSourceFormat: this.getOptionalString(table, 'data_source_format'),
      storageLocation: this.getOptionalString(table, 'storage_location'),
      columns,
      comment: this.getOptionalString(table, 'comment'),
      owner: this.getOptionalString(table, 'owner'),
      createdAt: this.getOptionalDate(table, 'created_at'),
      updatedAt: this.getOptionalDate(table, 'updated_at'),
      fullName: `${catalogName}.${schemaName}.${name}`,
    };
  }

  /**
   * Parses column information from API response.
   *
   * @param column Raw column response
   * @returns Parsed column information
   */
  private parseColumnInfo(column: unknown): ColumnInfo {
    const col = column as Record<string, unknown>;

    return {
      name: this.getString(col, 'name'),
      dataType: this.getString(col, 'type_text') || this.getString(col, 'type_name') || 'STRING',
      nullable: this.getBoolean(col, 'nullable'),
      comment: this.getOptionalString(col, 'comment'),
      position: this.getOptionalNumber(col, 'position'),
      typeName: this.getOptionalString(col, 'type_name'),
      typeText: this.getOptionalString(col, 'type_text'),
      typePrecision: this.getOptionalNumber(col, 'type_precision'),
      typeScale: this.getOptionalNumber(col, 'type_scale'),
      typeInterval: this.getOptionalString(col, 'type_interval_type'),
    };
  }

  // ==========================================================================
  // Value Extraction Helpers
  // ==========================================================================

  /**
   * Gets a required string value from an object.
   *
   * @param obj Source object
   * @param key Property key
   * @returns String value or empty string if missing
   */
  private getString(obj: Record<string, unknown>, key: string): string {
    const value = obj[key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  /**
   * Gets an optional string value from an object.
   *
   * @param obj Source object
   * @param key Property key
   * @returns String value or undefined if missing/empty
   */
  private getOptionalString(
    obj: Record<string, unknown>,
    key: string
  ): string | undefined {
    const value = obj[key];
    if (value === null || value === undefined) {
      return undefined;
    }
    const str = String(value).trim();
    return str === '' ? undefined : str;
  }

  /**
   * Gets an optional number value from an object.
   *
   * @param obj Source object
   * @param key Property key
   * @returns Number value or undefined if missing/invalid
   */
  private getOptionalNumber(
    obj: Record<string, unknown>,
    key: string
  ): number | undefined {
    const value = obj[key];
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
   * Gets a boolean value from an object.
   *
   * @param obj Source object
   * @param key Property key
   * @returns Boolean value (defaults to false if missing)
   */
  private getBoolean(obj: Record<string, unknown>, key: string): boolean {
    const value = obj[key];
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  }

  /**
   * Gets an optional date value from an object.
   *
   * @param obj Source object
   * @param key Property key
   * @returns Date object or undefined if missing/invalid
   */
  private getOptionalDate(
    obj: Record<string, unknown>,
    key: string
  ): Date | undefined {
    const value = obj[key];
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
