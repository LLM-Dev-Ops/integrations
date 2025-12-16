/**
 * Schema Manager for Databricks Delta Lake
 *
 * Provides schema evolution capabilities including:
 * - Schema discovery and comparison
 * - Type compatibility checking
 * - Safe schema evolution with validation
 * - Column addition and type widening
 *
 * @module @llmdevops/databricks-delta-lake/schema
 */

import {
  DeltaError,
  SchemaEvolutionConflict,
  SyntaxError,
} from '../errors/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Column schema definition
 */
export interface ColumnSchema {
  /** Column name */
  name: string;
  /** Delta data type (e.g., INT, BIGINT, STRING, DECIMAL(10,2)) */
  dataType: string;
  /** Whether the column is nullable */
  nullable: boolean;
  /** Optional comment/description */
  comment?: string;
}

/**
 * Table schema definition
 */
export interface TableSchema {
  /** List of columns in order */
  columns: ColumnSchema[];
}

/**
 * Schema compatibility result
 */
export type SchemaCompatibility =
  | { type: 'identical' }
  | { type: 'evolution'; newColumns: ColumnSchema[] }
  | {
      type: 'type_widening';
      columns: Array<{ name: string; fromType: string; toType: string }>;
    }
  | { type: 'incompatible'; reason: string };

/**
 * Schema evolution result
 */
export type SchemaEvolutionResult =
  | { type: 'no_change' }
  | { type: 'evolved'; addedColumns: ColumnSchema[] }
  | {
      type: 'types_widened';
      columns: Array<{ name: string; fromType: string; toType: string }>;
    };

/**
 * SQL client interface required by SchemaManager
 */
export interface SqlClient {
  execute(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}

// ============================================================================
// Reserved Words
// ============================================================================

/**
 * Delta Lake SQL reserved words
 */
const RESERVED_WORDS = new Set([
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
  'INDEX',
  'VIEW',
  'DATABASE',
  'SCHEMA',
  'CATALOG',
  'AS',
  'ON',
  'IN',
  'INTO',
  'VALUES',
  'SET',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'TRUE',
  'FALSE',
  'BETWEEN',
  'LIKE',
  'IS',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'CROSS',
  'UNION',
  'ALL',
  'DISTINCT',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'PARTITION',
  'WINDOW',
  'OVER',
  'ROW',
  'ROWS',
  'RANGE',
  'UNBOUNDED',
  'PRECEDING',
  'FOLLOWING',
  'CURRENT',
]);

/**
 * Valid Delta Lake data types
 */
const VALID_DELTA_TYPES = new Set([
  'BOOLEAN',
  'BYTE',
  'TINYINT',
  'SHORT',
  'SMALLINT',
  'INT',
  'INTEGER',
  'LONG',
  'BIGINT',
  'FLOAT',
  'REAL',
  'DOUBLE',
  'DATE',
  'TIMESTAMP',
  'TIMESTAMP_NTZ',
  'STRING',
  'BINARY',
  'DECIMAL',
  'ARRAY',
  'MAP',
  'STRUCT',
  'VOID',
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quote an identifier to handle special characters and reserved words
 */
export function quoteIdentifier(name: string): string {
  // If already quoted, return as is
  if (name.startsWith('`') && name.endsWith('`')) {
    return name;
  }
  // Quote the identifier
  return `\`${name.replace(/`/g, '``')}\``;
}

/**
 * Check if a word is a reserved SQL keyword
 */
export function isReservedWord(name: string): boolean {
  return RESERVED_WORDS.has(name.toUpperCase());
}

/**
 * Check if a data type is valid for Delta Lake
 */
export function isValidDeltaType(type: string): boolean {
  // Normalize the type string
  const normalized = type.trim().toUpperCase();

  // Check exact match for simple types
  if (VALID_DELTA_TYPES.has(normalized)) {
    return true;
  }

  // Check parameterized types
  if (normalized.startsWith('DECIMAL(') || normalized.startsWith('DEC(')) {
    return /^DEC(IMAL)?\(\s*\d+\s*(,\s*\d+\s*)?\)$/i.test(normalized);
  }

  if (normalized.startsWith('CHAR(') || normalized.startsWith('VARCHAR(')) {
    return /^(CHAR|VARCHAR)\(\s*\d+\s*\)$/i.test(normalized);
  }

  if (normalized.startsWith('ARRAY<')) {
    return /^ARRAY<.+>$/i.test(normalized);
  }

  if (normalized.startsWith('MAP<')) {
    return /^MAP<.+,.+>$/i.test(normalized);
  }

  if (normalized.startsWith('STRUCT<')) {
    return /^STRUCT<.+>$/i.test(normalized);
  }

  return false;
}

/**
 * Parse DECIMAL type to extract precision and scale
 */
function parseDecimalType(
  type: string
): { precision: number; scale: number } | null {
  const match = type.match(/DECIMAL\((\d+)(?:,\s*(\d+))?\)/i);
  if (!match) {
    return null;
  }
  return {
    precision: parseInt(match[1], 10),
    scale: match[2] ? parseInt(match[2], 10) : 0,
  };
}

/**
 * Normalize a type string for comparison
 */
function normalizeType(type: string): string {
  return type.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Infer schema from an array of data objects
 */
export function inferSchema<T>(data: T[]): TableSchema {
  if (data.length === 0) {
    return { columns: [] };
  }

  const sample = data[0] as Record<string, unknown>;
  const columns: ColumnSchema[] = [];

  for (const [key, value] of Object.entries(sample)) {
    let dataType = 'STRING'; // Default fallback
    let nullable = true;

    // Check if value is null/undefined in any record
    const hasNull = data.some((row) => {
      const r = row as Record<string, unknown>;
      return r[key] === null || r[key] === undefined;
    });

    nullable = hasNull;

    // Infer type from first non-null value
    const nonNullValue = data.find((row) => {
      const r = row as Record<string, unknown>;
      return r[key] !== null && r[key] !== undefined;
    });

    if (nonNullValue) {
      const val = (nonNullValue as Record<string, unknown>)[key];
      const valType = typeof val;

      if (valType === 'boolean') {
        dataType = 'BOOLEAN';
      } else if (valType === 'number') {
        // Check if it's an integer or float
        if (Number.isInteger(val)) {
          const num = val as number;
          if (num >= -128 && num <= 127) {
            dataType = 'TINYINT';
          } else if (num >= -32768 && num <= 32767) {
            dataType = 'SMALLINT';
          } else if (num >= -2147483648 && num <= 2147483647) {
            dataType = 'INT';
          } else {
            dataType = 'BIGINT';
          }
        } else {
          dataType = 'DOUBLE';
        }
      } else if (valType === 'bigint') {
        dataType = 'BIGINT';
      } else if (val instanceof Date) {
        dataType = 'TIMESTAMP';
      } else if (val instanceof Uint8Array || val instanceof Buffer) {
        dataType = 'BINARY';
      } else if (Array.isArray(val)) {
        dataType = 'ARRAY<STRING>'; // Default to string array
      } else if (valType === 'object') {
        dataType = 'STRUCT<>'; // Generic struct
      } else {
        dataType = 'STRING';
      }
    }

    columns.push({
      name: key,
      dataType,
      nullable,
    });
  }

  return { columns };
}

// ============================================================================
// Schema Manager
// ============================================================================

/**
 * Schema Manager for Delta Lake tables
 *
 * Provides schema evolution capabilities with validation.
 */
export class SchemaManager {
  private readonly sqlClient: SqlClient;
  private readonly tablePath: (table: string) => string;

  /**
   * Create a new SchemaManager
   *
   * @param sqlClient - SQL client for executing queries
   * @param tablePath - Function to construct full table path (catalog.schema.table)
   */
  constructor(sqlClient: SqlClient, tablePath?: (table: string) => string) {
    this.sqlClient = sqlClient;
    this.tablePath = tablePath || ((table: string) => table);
  }

  /**
   * Get the current schema of a Delta table
   *
   * @param table - Table name
   * @returns Table schema with column definitions
   */
  async getSchema(table: string): Promise<TableSchema> {
    const fullPath = this.tablePath(table);
    const sql = `DESCRIBE ${fullPath}`;

    try {
      const result = await this.sqlClient.execute(sql);

      // Parse DESCRIBE output
      const columns: ColumnSchema[] = [];
      for (const row of result.rows) {
        const colName = String(row['col_name'] || '');

        // Skip metadata rows (start with # or empty)
        if (!colName || colName.startsWith('#')) {
          break; // Metadata section starts here
        }

        const dataType = String(row['data_type'] || 'STRING');
        const nullable = String(row['nullable'] || 'true').toLowerCase() !== 'false';
        const comment = row['comment'] ? String(row['comment']) : undefined;

        columns.push({
          name: colName,
          dataType,
          nullable,
          comment,
        });
      }

      return { columns };
    } catch (error) {
      throw new DeltaError(
        `Failed to get schema for table ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
        fullPath,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Check compatibility between source and target schemas
   *
   * @param source - Source schema (current)
   * @param target - Target schema (desired)
   * @returns Compatibility result
   */
  checkCompatibility(
    source: TableSchema,
    target: TableSchema
  ): SchemaCompatibility {
    const sourceMap = new Map(
      source.columns.map((col) => [col.name.toUpperCase(), col])
    );
    const targetMap = new Map(
      target.columns.map((col) => [col.name.toUpperCase(), col])
    );

    // Check for removed columns
    for (const sourceCol of source.columns) {
      if (!targetMap.has(sourceCol.name.toUpperCase())) {
        return {
          type: 'incompatible',
          reason: `Column '${sourceCol.name}' was removed`,
        };
      }
    }

    // Check for type incompatibilities and collect changes
    const typeWidenings: Array<{
      name: string;
      fromType: string;
      toType: string;
    }> = [];

    for (const targetCol of target.columns) {
      const sourceCol = sourceMap.get(targetCol.name.toUpperCase());

      if (sourceCol) {
        // Column exists, check type compatibility
        if (!this.isTypeCompatible(sourceCol.dataType, targetCol.dataType)) {
          return {
            type: 'incompatible',
            reason: `Type mismatch for column '${targetCol.name}': ${sourceCol.dataType} vs ${targetCol.dataType}`,
          };
        }

        // Track type widening
        if (
          normalizeType(sourceCol.dataType) !==
          normalizeType(targetCol.dataType)
        ) {
          typeWidenings.push({
            name: targetCol.name,
            fromType: sourceCol.dataType,
            toType: targetCol.dataType,
          });
        }
      }
    }

    // Collect new columns
    const newColumns = target.columns.filter(
      (col) => !sourceMap.has(col.name.toUpperCase())
    );

    // Determine compatibility type
    if (newColumns.length === 0 && typeWidenings.length === 0) {
      return { type: 'identical' };
    }

    if (typeWidenings.length > 0) {
      return { type: 'type_widening', columns: typeWidenings };
    }

    if (newColumns.length > 0) {
      return { type: 'evolution', newColumns };
    }

    return { type: 'identical' };
  }

  /**
   * Check if source type is compatible with target type
   *
   * @param source - Source data type
   * @param target - Target data type
   * @returns True if compatible (same or safe widening)
   */
  isTypeCompatible(source: string, target: string): boolean {
    const normSource = normalizeType(source);
    const normTarget = normalizeType(target);

    // Same type is always compatible
    if (normSource === normTarget) {
      return true;
    }

    // Check if it's a safe widening
    return this.isSafeWidening(normSource, normTarget);
  }

  /**
   * Check if type conversion is a safe widening
   *
   * @param from - Source type
   * @param to - Target type
   * @returns True if safe widening is allowed
   */
  isSafeWidening(from: string, to: string): boolean {
    const normFrom = normalizeType(from);
    const normTo = normalizeType(to);

    // Numeric type widening hierarchy
    const numericWidenings: Record<string, string[]> = {
      TINYINT: ['SMALLINT', 'SHORT', 'INT', 'INTEGER', 'LONG', 'BIGINT'],
      BYTE: ['SMALLINT', 'SHORT', 'INT', 'INTEGER', 'LONG', 'BIGINT'],
      SMALLINT: ['INT', 'INTEGER', 'LONG', 'BIGINT'],
      SHORT: ['INT', 'INTEGER', 'LONG', 'BIGINT'],
      INT: ['LONG', 'BIGINT'],
      INTEGER: ['LONG', 'BIGINT'],
      FLOAT: ['DOUBLE'],
      REAL: ['DOUBLE'],
    };

    if (numericWidenings[normFrom]?.includes(normTo)) {
      return true;
    }

    // Decimal widening: DECIMAL(p1, s1) -> DECIMAL(p2, s2) if p2 >= p1 AND s2 >= s1
    if (normFrom.startsWith('DECIMAL(') && normTo.startsWith('DECIMAL(')) {
      const fromDecimal = parseDecimalType(normFrom);
      const toDecimal = parseDecimalType(normTo);

      if (fromDecimal && toDecimal) {
        return (
          toDecimal.precision >= fromDecimal.precision &&
          toDecimal.scale >= fromDecimal.scale
        );
      }
    }

    return false;
  }

  /**
   * Validate a column definition
   *
   * @param col - Column schema to validate
   * @throws Error if column definition is invalid
   */
  validateColumnDefinition(col: ColumnSchema): void {
    // Validate column name
    if (!col.name || col.name.trim() === '') {
      throw new SyntaxError('Column name cannot be empty');
    }

    // Check for invalid characters
    if (/[;\n\r]/.test(col.name)) {
      throw new SyntaxError(
        `Column name '${col.name}' contains invalid characters`
      );
    }

    // Warn about reserved words (but allow with quoting)
    if (isReservedWord(col.name) && !col.name.startsWith('`')) {
      // We'll quote it automatically, so just log a warning
      // In production, you might want to use a logger
    }

    // Validate data type
    if (!col.dataType || col.dataType.trim() === '') {
      throw new SyntaxError(`Column '${col.name}' has no data type`);
    }

    if (!isValidDeltaType(col.dataType)) {
      throw new SyntaxError(
        `Column '${col.name}' has invalid data type: ${col.dataType}`
      );
    }

    // Validate comment if present
    if (col.comment && /['\n\r]/.test(col.comment)) {
      throw new SyntaxError(
        `Column '${col.name}' comment contains invalid characters`
      );
    }
  }

  /**
   * Evolve schema by adding new columns
   *
   * @param table - Table name
   * @param newColumns - Columns to add
   */
  async evolveSchema(
    table: string,
    newColumns: ColumnSchema[]
  ): Promise<void> {
    const fullPath = this.tablePath(table);

    // Validate all columns first
    for (const col of newColumns) {
      this.validateColumnDefinition(col);
    }

    // Add each column
    for (const col of newColumns) {
      const quotedName = quoteIdentifier(col.name);
      const nullability = col.nullable ? '' : ' NOT NULL';
      const comment = col.comment
        ? ` COMMENT '${col.comment.replace(/'/g, "''")}'`
        : '';

      const sql = `ALTER TABLE ${fullPath} ADD COLUMN ${quotedName} ${col.dataType}${nullability}${comment}`;

      try {
        await this.sqlClient.execute(sql);
      } catch (error) {
        throw new SchemaEvolutionConflict(
          fullPath,
          `Failed to add column '${col.name}': ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined }
        );
      }
    }
  }

  /**
   * Safely evolve schema to match target schema
   *
   * @param table - Table name
   * @param newSchema - Target schema
   * @returns Evolution result
   */
  async evolveSafely(
    table: string,
    newSchema: TableSchema
  ): Promise<SchemaEvolutionResult> {
    // Get current schema
    const currentSchema = await this.getSchema(table);

    // Check compatibility
    const compatibility = this.checkCompatibility(currentSchema, newSchema);

    switch (compatibility.type) {
      case 'identical':
        return { type: 'no_change' };

      case 'evolution':
        // Validate new columns
        for (const col of compatibility.newColumns) {
          this.validateColumnDefinition(col);
        }

        // Add new columns
        await this.evolveSchema(table, compatibility.newColumns);

        return {
          type: 'evolved',
          addedColumns: compatibility.newColumns,
        };

      case 'type_widening':
        // Type widening requires ALTER COLUMN which is not supported in all Delta versions
        // Return information about required widening for manual handling
        return {
          type: 'types_widened',
          columns: compatibility.columns,
        };

      case 'incompatible':
        throw new SchemaEvolutionConflict(
          this.tablePath(table),
          compatibility.reason
        );
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export default SchemaManager;
