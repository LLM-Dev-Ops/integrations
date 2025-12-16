/**
 * Snowflake Result Parser
 *
 * Utilities for parsing Snowflake query results and converting data types.
 * @module @llmdevops/snowflake-integration/result/parser
 */

import type {
  ColumnMetadata,
  Row,
  ResultSet,
  SnowflakeDataType,
  Value,
} from '../types/index.js';
import { createRow, toValue } from '../types/index.js';
import { QueryError, SnowflakeErrorCode } from '../errors/index.js';

// ============================================================================
// Type Guards and Converters
// ============================================================================

/**
 * Raw column metadata from Snowflake response.
 */
export interface RawColumnMetadata {
  name: string;
  database?: string | null;
  schema?: string | null;
  table?: string | null;
  type: string;
  nullable?: boolean;
  precision?: number | null;
  scale?: number | null;
  length?: number | null;
  byteLength?: number | null;
  collation?: string | null;
}

/**
 * Raw row data from Snowflake response.
 */
export type RawRow = Record<string, unknown>;

/**
 * Raw result set data from Snowflake response.
 */
export interface RawResultSet {
  columns?: RawColumnMetadata[];
  rows?: RawRow[];
  rowCount?: number;
  hasMore?: boolean;
  lastPosition?: string | null;
}

// ============================================================================
// Data Type Parsing
// ============================================================================

/**
 * Normalizes Snowflake data type names.
 */
function normalizeDataType(type: string): SnowflakeDataType {
  const normalized = type.toUpperCase().trim();

  // Handle common variations and aliases
  const typeMap: Record<string, SnowflakeDataType> = {
    'NUMBER': 'NUMBER',
    'DECIMAL': 'DECIMAL',
    'NUMERIC': 'NUMERIC',
    'INT': 'INT',
    'INTEGER': 'INTEGER',
    'BIGINT': 'BIGINT',
    'SMALLINT': 'SMALLINT',
    'TINYINT': 'TINYINT',
    'BYTEINT': 'BYTEINT',
    'FLOAT': 'FLOAT',
    'FLOAT4': 'FLOAT4',
    'FLOAT8': 'FLOAT8',
    'DOUBLE': 'DOUBLE',
    'DOUBLE PRECISION': 'DOUBLE PRECISION',
    'REAL': 'REAL',
    'VARCHAR': 'VARCHAR',
    'CHAR': 'CHAR',
    'CHARACTER': 'CHARACTER',
    'STRING': 'STRING',
    'TEXT': 'TEXT',
    'BINARY': 'BINARY',
    'VARBINARY': 'VARBINARY',
    'BOOLEAN': 'BOOLEAN',
    'DATE': 'DATE',
    'DATETIME': 'DATETIME',
    'TIME': 'TIME',
    'TIMESTAMP': 'TIMESTAMP',
    'TIMESTAMP_LTZ': 'TIMESTAMP_LTZ',
    'TIMESTAMP_NTZ': 'TIMESTAMP_NTZ',
    'TIMESTAMP_TZ': 'TIMESTAMP_TZ',
    'VARIANT': 'VARIANT',
    'OBJECT': 'OBJECT',
    'ARRAY': 'ARRAY',
    'GEOGRAPHY': 'GEOGRAPHY',
    'GEOMETRY': 'GEOMETRY',
  };

  // Extract base type (handle parameterized types like VARCHAR(100))
  const baseType = normalized.split('(')[0]!.trim();

  return typeMap[baseType] || (baseType as SnowflakeDataType);
}

/**
 * Parses a value based on its Snowflake data type.
 */
function parseValue(rawValue: unknown, dataType: SnowflakeDataType): Value {
  // Handle null values
  if (rawValue === null || rawValue === undefined) {
    return { type: 'null' };
  }

  // Normalize type for comparison
  const normalizedType = dataType.toUpperCase();

  // Numeric types
  if (
    normalizedType === 'NUMBER' ||
    normalizedType === 'DECIMAL' ||
    normalizedType === 'NUMERIC' ||
    normalizedType === 'INT' ||
    normalizedType === 'INTEGER' ||
    normalizedType === 'SMALLINT' ||
    normalizedType === 'TINYINT' ||
    normalizedType === 'BYTEINT' ||
    normalizedType === 'FLOAT' ||
    normalizedType === 'FLOAT4' ||
    normalizedType === 'FLOAT8' ||
    normalizedType === 'DOUBLE' ||
    normalizedType === 'DOUBLE PRECISION' ||
    normalizedType === 'REAL'
  ) {
    if (typeof rawValue === 'number') {
      return { type: 'number', value: rawValue };
    }
    if (typeof rawValue === 'string') {
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        return { type: 'number', value: parsed };
      }
    }
    return { type: 'null' };
  }

  // BigInt types
  if (normalizedType === 'BIGINT') {
    if (typeof rawValue === 'bigint') {
      return { type: 'bigint', value: rawValue };
    }
    if (typeof rawValue === 'number') {
      return { type: 'bigint', value: BigInt(rawValue) };
    }
    if (typeof rawValue === 'string') {
      try {
        return { type: 'bigint', value: BigInt(rawValue) };
      } catch {
        return { type: 'null' };
      }
    }
    return { type: 'null' };
  }

  // Boolean types
  if (normalizedType === 'BOOLEAN') {
    if (typeof rawValue === 'boolean') {
      return { type: 'boolean', value: rawValue };
    }
    if (typeof rawValue === 'number') {
      return { type: 'boolean', value: rawValue !== 0 };
    }
    if (typeof rawValue === 'string') {
      const lower = rawValue.toLowerCase();
      if (lower === 'true' || lower === '1') {
        return { type: 'boolean', value: true };
      }
      if (lower === 'false' || lower === '0') {
        return { type: 'boolean', value: false };
      }
    }
    return { type: 'null' };
  }

  // Date types
  if (normalizedType === 'DATE') {
    if (rawValue instanceof Date) {
      return { type: 'date', value: rawValue };
    }
    if (typeof rawValue === 'string' || typeof rawValue === 'number') {
      const date = new Date(rawValue);
      if (!isNaN(date.getTime())) {
        return { type: 'date', value: date };
      }
    }
    return { type: 'null' };
  }

  // Timestamp types
  if (
    normalizedType === 'TIMESTAMP' ||
    normalizedType === 'TIMESTAMP_LTZ' ||
    normalizedType === 'TIMESTAMP_NTZ' ||
    normalizedType === 'TIMESTAMP_TZ' ||
    normalizedType === 'DATETIME' ||
    normalizedType === 'TIME'
  ) {
    if (rawValue instanceof Date) {
      return { type: 'timestamp', value: rawValue };
    }
    if (typeof rawValue === 'string' || typeof rawValue === 'number') {
      const date = new Date(rawValue);
      if (!isNaN(date.getTime())) {
        return { type: 'timestamp', value: date };
      }
    }
    return { type: 'null' };
  }

  // Binary types
  if (normalizedType === 'BINARY' || normalizedType === 'VARBINARY') {
    if (rawValue instanceof Uint8Array) {
      return { type: 'binary', value: rawValue };
    }
    if (typeof rawValue === 'string') {
      // Snowflake returns binary as hex string
      const hexMatch = rawValue.match(/^[0-9A-Fa-f]+$/);
      if (hexMatch) {
        const bytes = new Uint8Array(rawValue.length / 2);
        for (let i = 0; i < rawValue.length; i += 2) {
          bytes[i / 2] = parseInt(rawValue.substr(i, 2), 16);
        }
        return { type: 'binary', value: bytes };
      }
    }
    return { type: 'null' };
  }

  // VARIANT type - can be any JSON value
  if (normalizedType === 'VARIANT') {
    if (typeof rawValue === 'string') {
      try {
        const parsed = JSON.parse(rawValue);
        return { type: 'variant', value: parsed };
      } catch {
        // If not valid JSON, treat as string
        return { type: 'variant', value: rawValue };
      }
    }
    return { type: 'variant', value: rawValue };
  }

  // OBJECT type - structured object
  if (normalizedType === 'OBJECT') {
    if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      return { type: 'object', value: rawValue as Record<string, unknown> };
    }
    if (typeof rawValue === 'string') {
      try {
        const parsed = JSON.parse(rawValue);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { type: 'object', value: parsed as Record<string, unknown> };
        }
      } catch {
        // Ignore parse error
      }
    }
    return { type: 'null' };
  }

  // ARRAY type
  if (normalizedType === 'ARRAY') {
    if (Array.isArray(rawValue)) {
      return { type: 'array', value: rawValue };
    }
    if (typeof rawValue === 'string') {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return { type: 'array', value: parsed };
        }
      } catch {
        // Ignore parse error
      }
    }
    return { type: 'null' };
  }

  // String types (default fallback)
  if (typeof rawValue === 'string') {
    return { type: 'string', value: rawValue };
  }

  // Convert other types to string
  return { type: 'string', value: String(rawValue) };
}

// ============================================================================
// Public Parser Functions
// ============================================================================

/**
 * Parses column metadata from Snowflake response.
 */
export function parseColumns(rawColumns: RawColumnMetadata[]): ColumnMetadata[] {
  if (!Array.isArray(rawColumns)) {
    throw new QueryError('Invalid column metadata: expected array', {
      cause: new Error(`Received: ${typeof rawColumns}`),
    });
  }

  return rawColumns.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new QueryError(`Invalid column metadata at index ${index}`, {
        cause: new Error(`Expected object, received: ${typeof raw}`),
      });
    }

    if (!raw.name || typeof raw.name !== 'string') {
      throw new QueryError(`Missing or invalid column name at index ${index}`, {
        cause: new Error(`Name: ${raw.name}`),
      });
    }

    if (!raw.type || typeof raw.type !== 'string') {
      throw new QueryError(`Missing or invalid column type for '${raw.name}'`, {
        cause: new Error(`Type: ${raw.type}`),
      });
    }

    return {
      name: raw.name,
      database: raw.database || undefined,
      schema: raw.schema || undefined,
      table: raw.table || undefined,
      type: normalizeDataType(raw.type),
      nullable: raw.nullable ?? true,
      precision: raw.precision ?? undefined,
      scale: raw.scale ?? undefined,
      length: raw.length ?? undefined,
      byteLength: raw.byteLength ?? undefined,
      collation: raw.collation || undefined,
    };
  });
}

/**
 * Parses a single row from Snowflake response.
 */
export function parseRow(rawRow: RawRow, columns: ColumnMetadata[]): Row {
  if (!rawRow || typeof rawRow !== 'object') {
    throw new QueryError('Invalid row data: expected object', {
      cause: new Error(`Received: ${typeof rawRow}`),
    });
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new QueryError('Cannot parse row without column metadata', {
      cause: new Error('Columns array is empty or invalid'),
    });
  }

  // Parse each column value according to its type
  const parsedData: Record<string, unknown> = {};
  for (const column of columns) {
    const rawValue = rawRow[column.name];
    const parsedValue = parseValue(rawValue, column.type);
    // Extract the raw value for createRow
    parsedData[column.name] = parsedValue.type === 'null' ? null : parsedValue.value;
  }

  return createRow(parsedData, columns);
}

/**
 * Parses an entire result set from Snowflake response.
 */
export function parseResultSet(rawData: RawResultSet, columns?: ColumnMetadata[]): ResultSet {
  if (!rawData || typeof rawData !== 'object') {
    throw new QueryError('Invalid result set data: expected object', {
      cause: new Error(`Received: ${typeof rawData}`),
    });
  }

  // Parse columns if not provided
  let parsedColumns: ColumnMetadata[];
  if (columns) {
    parsedColumns = columns;
  } else if (rawData.columns && Array.isArray(rawData.columns)) {
    parsedColumns = parseColumns(rawData.columns);
  } else {
    // No columns metadata - create empty result set
    parsedColumns = [];
  }

  // Parse rows
  const rawRows = rawData.rows || [];
  if (!Array.isArray(rawRows)) {
    throw new QueryError('Invalid rows data: expected array', {
      cause: new Error(`Received: ${typeof rawRows}`),
    });
  }

  const rows: Row[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    try {
      const row = parseRow(rawRows[i]!, parsedColumns);
      rows.push(row);
    } catch (error) {
      throw new QueryError(`Failed to parse row at index ${i}`, {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return {
    columns: parsedColumns,
    rows,
    rowCount: rawData.rowCount ?? rows.length,
    hasMore: rawData.hasMore ?? false,
    lastPosition: rawData.lastPosition || undefined,
  };
}

/**
 * Validates that a value matches the expected column type.
 */
export function validateValue(value: unknown, column: ColumnMetadata): boolean {
  // Null is valid for nullable columns
  if (value === null || value === undefined) {
    return column.nullable;
  }

  const normalizedType = column.type.toUpperCase();

  // Check type compatibility
  if (
    normalizedType === 'NUMBER' ||
    normalizedType === 'DECIMAL' ||
    normalizedType === 'NUMERIC' ||
    normalizedType === 'INT' ||
    normalizedType === 'INTEGER' ||
    normalizedType === 'SMALLINT' ||
    normalizedType === 'TINYINT' ||
    normalizedType === 'BYTEINT' ||
    normalizedType === 'FLOAT' ||
    normalizedType === 'FLOAT4' ||
    normalizedType === 'FLOAT8' ||
    normalizedType === 'DOUBLE' ||
    normalizedType === 'DOUBLE PRECISION' ||
    normalizedType === 'REAL'
  ) {
    return typeof value === 'number' && !isNaN(value);
  }

  if (normalizedType === 'BIGINT') {
    return typeof value === 'bigint' || typeof value === 'number';
  }

  if (normalizedType === 'BOOLEAN') {
    return typeof value === 'boolean';
  }

  if (normalizedType === 'DATE' || normalizedType.includes('TIMESTAMP') || normalizedType === 'DATETIME' || normalizedType === 'TIME') {
    return value instanceof Date;
  }

  if (normalizedType === 'BINARY' || normalizedType === 'VARBINARY') {
    return value instanceof Uint8Array;
  }

  if (normalizedType === 'ARRAY') {
    return Array.isArray(value);
  }

  if (normalizedType === 'OBJECT') {
    return typeof value === 'object' && !Array.isArray(value);
  }

  // String types and VARIANT accept most values
  return true;
}

/**
 * Converts a JavaScript value to a Snowflake-compatible value.
 */
export function toSnowflakeValue(value: Value): unknown {
  if (value.type === 'null') {
    return null;
  }

  if (value.type === 'binary') {
    // Convert binary to hex string
    const bytes = value.value;
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  if (value.type === 'date' || value.type === 'timestamp') {
    // Return Date object, Snowflake driver will handle conversion
    return value.value;
  }

  if (value.type === 'variant' || value.type === 'array' || value.type === 'object') {
    // Return as-is, Snowflake driver will stringify if needed
    return value.value;
  }

  // All other types can be returned directly
  return value.value;
}
