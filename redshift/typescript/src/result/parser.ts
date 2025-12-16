/**
 * Redshift Result Parser
 *
 * Utilities for parsing Redshift query results and converting PostgreSQL data types.
 * @module @llmdevops/redshift-integration/result/parser
 */

import type { FieldDef, QueryResult as PgQueryResult } from 'pg';
import type {
  ColumnMetadata,
  Row,
  ResultSet,
  RedshiftDataType,
  Value,
} from '../types/index.js';
import { createRow, toValue } from '../types/index.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// PostgreSQL OID to Redshift Type Mapping
// ============================================================================

/**
 * Maps PostgreSQL OIDs to Redshift data types.
 * Based on pg_type catalog and Redshift extensions.
 */
const OID_TO_TYPE_MAP: Record<number, RedshiftDataType> = {
  // Boolean
  16: 'BOOLEAN',

  // Integer types
  20: 'BIGINT', // int8
  21: 'SMALLINT', // int2
  23: 'INTEGER', // int4

  // Numeric types
  700: 'REAL', // float4
  701: 'DOUBLE PRECISION', // float8
  1700: 'NUMERIC', // numeric/decimal

  // Character types
  18: 'CHAR', // char
  19: 'VARCHAR', // name (treat as varchar)
  25: 'TEXT', // text
  1042: 'CHAR', // bpchar (blank-padded char)
  1043: 'VARCHAR', // varchar

  // Date/Time types
  1082: 'DATE', // date
  1083: 'TIMESTAMP', // time without time zone (map to timestamp)
  1114: 'TIMESTAMP', // timestamp without time zone
  1184: 'TIMESTAMPTZ', // timestamp with time zone
  1266: 'TIMESTAMPTZ', // timetz (map to timestamptz)

  // Binary types
  17: 'BYTEA', // bytea

  // JSON types
  114: 'JSON', // json
  3802: 'JSONB', // jsonb

  // UUID
  2950: 'UUID', // uuid

  // Redshift SUPER type (custom OID)
  // Note: SUPER might use a different OID in practice
  16400: 'SUPER',

  // Geometry/Geography (PostGIS extensions)
  // These OIDs may vary depending on PostGIS version
  // Using common values
  17316: 'GEOMETRY',
  17317: 'GEOGRAPHY',
};

/**
 * Converts a PostgreSQL OID to a Redshift data type.
 */
function oidToRedshiftType(oid: number): RedshiftDataType {
  return OID_TO_TYPE_MAP[oid] || 'UNKNOWN';
}

// ============================================================================
// Value Parsing Functions
// ============================================================================

/**
 * Parses a boolean value from various representations.
 */
export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 't' || lower === 'yes' || lower === '1';
  }
  return false;
}

/**
 * Parses a numeric value with optional type hint.
 */
export function parseNumber(value: unknown, type: RedshiftDataType): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return 0;
}

/**
 * Parses a bigint value.
 */
export function parseBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return BigInt(0);
    }
  }
  return BigInt(0);
}

/**
 * Parses a date value (date only, no time component).
 */
export function parseDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(0);
}

/**
 * Parses a timestamp value with optional timezone handling.
 */
export function parseTimestamp(value: unknown, withTz: boolean = false): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  return new Date(0);
}

/**
 * Parses a JSON value (handles both JSON and JSONB).
 */
export function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      // If not valid JSON, return as-is
      return value;
    }
  }
  return value;
}

/**
 * Parses a SUPER type value (Redshift semi-structured data).
 */
function parseSuper(value: unknown): unknown {
  // SUPER is similar to JSON but with additional capabilities
  return parseJson(value);
}

/**
 * Parses a binary value (BYTEA, VARBYTE).
 */
function parseBinary(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof Buffer) {
    return new Uint8Array(value);
  }
  if (typeof value === 'string') {
    // Handle hex-encoded strings (PostgreSQL returns bytea as hex: \x...)
    if (value.startsWith('\\x')) {
      const hex = value.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return bytes;
    }
    // Handle base64-encoded strings
    try {
      const binary = Buffer.from(value, 'base64');
      return new Uint8Array(binary);
    } catch {
      return new Uint8Array(0);
    }
  }
  return new Uint8Array(0);
}

/**
 * Parses a UUID value.
 */
function parseUuid(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return String(value || '');
}

/**
 * Parses a value based on its Redshift data type.
 */
function parseValue(rawValue: unknown, dataType: RedshiftDataType): Value {
  // Handle null values
  if (rawValue === null || rawValue === undefined) {
    return { type: 'null' };
  }

  const normalizedType = dataType.toUpperCase();

  // Boolean types
  if (normalizedType === 'BOOLEAN' || normalizedType === 'BOOL') {
    return { type: 'boolean', value: parseBoolean(rawValue) };
  }

  // BigInt types
  if (normalizedType === 'BIGINT' || normalizedType === 'INT8') {
    return { type: 'bigint', value: parseBigInt(rawValue) };
  }

  // Numeric types (integers)
  if (
    normalizedType === 'SMALLINT' ||
    normalizedType === 'INT2' ||
    normalizedType === 'INTEGER' ||
    normalizedType === 'INT' ||
    normalizedType === 'INT4'
  ) {
    return { type: 'number', value: parseNumber(rawValue, dataType) };
  }

  // Numeric types (floating point and decimal)
  if (
    normalizedType === 'DECIMAL' ||
    normalizedType === 'NUMERIC' ||
    normalizedType === 'REAL' ||
    normalizedType === 'FLOAT4' ||
    normalizedType === 'DOUBLE PRECISION' ||
    normalizedType === 'FLOAT8' ||
    normalizedType === 'FLOAT'
  ) {
    return { type: 'number', value: parseNumber(rawValue, dataType) };
  }

  // Date type
  if (normalizedType === 'DATE') {
    return { type: 'date', value: parseDate(rawValue) };
  }

  // Timestamp types
  if (
    normalizedType === 'TIMESTAMP' ||
    normalizedType === 'TIMESTAMP WITHOUT TIME ZONE'
  ) {
    return { type: 'timestamp', value: parseTimestamp(rawValue, false) };
  }

  if (
    normalizedType === 'TIMESTAMPTZ' ||
    normalizedType === 'TIMESTAMP WITH TIME ZONE'
  ) {
    return { type: 'timestamp', value: parseTimestamp(rawValue, true) };
  }

  // Binary types
  if (
    normalizedType === 'BYTEA' ||
    normalizedType === 'VARBYTE'
  ) {
    return { type: 'binary', value: parseBinary(rawValue) };
  }

  // JSON types
  if (normalizedType === 'JSON' || normalizedType === 'JSONB') {
    return { type: 'json', value: parseJson(rawValue) };
  }

  // SUPER type (Redshift semi-structured data)
  if (normalizedType === 'SUPER') {
    return { type: 'super', value: parseSuper(rawValue) };
  }

  // UUID type
  if (normalizedType === 'UUID') {
    return { type: 'uuid', value: parseUuid(rawValue) };
  }

  // Geometry/Geography types
  if (normalizedType === 'GEOMETRY') {
    return { type: 'geometry', value: rawValue };
  }

  if (normalizedType === 'GEOGRAPHY') {
    return { type: 'geography', value: rawValue };
  }

  // HLLSKETCH type
  if (normalizedType === 'HLLSKETCH') {
    return { type: 'hllsketch', value: parseBinary(rawValue) };
  }

  // String types (default fallback)
  if (typeof rawValue === 'string') {
    return { type: 'string', value: rawValue };
  }

  // Convert other types to string
  return { type: 'string', value: String(rawValue) };
}

// ============================================================================
// Column Parsing
// ============================================================================

/**
 * Parses PostgreSQL field definitions into Redshift column metadata.
 */
export function parseColumns(pgFields: FieldDef[]): ColumnMetadata[] {
  if (!Array.isArray(pgFields)) {
    throw new RedshiftError(
      'Invalid field definitions: expected array',
      RedshiftErrorCode.QUERY_FAILED,
      {
        cause: new Error(`Received: ${typeof pgFields}`),
        retryable: false,
      }
    );
  }

  return pgFields.map((field, index) => {
    if (!field || typeof field !== 'object') {
      throw new RedshiftError(
        `Invalid field definition at index ${index}`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: new Error(`Expected object, received: ${typeof field}`),
          retryable: false,
        }
      );
    }

    if (!field.name || typeof field.name !== 'string') {
      throw new RedshiftError(
        `Missing or invalid field name at index ${index}`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: new Error(`Name: ${field.name}`),
          retryable: false,
        }
      );
    }

    const dataTypeID = field.dataTypeID || 0;
    const type = oidToRedshiftType(dataTypeID);

    // Extract precision and scale from dataTypeModifier for NUMERIC/DECIMAL
    let precision: number | undefined;
    let scale: number | undefined;
    let length: number | undefined;

    if (
      (type === 'NUMERIC' || type === 'DECIMAL') &&
      field.dataTypeModifier !== undefined &&
      field.dataTypeModifier > 0
    ) {
      // PostgreSQL stores precision and scale in dataTypeModifier
      // Formula: ((precision << 16) | scale) + 4
      const modifier = field.dataTypeModifier - 4;
      precision = (modifier >> 16) & 0xffff;
      scale = modifier & 0xffff;
    }

    // Extract length for character types
    if (
      (type === 'VARCHAR' || type === 'CHAR' || type === 'BPCHAR') &&
      field.dataTypeModifier !== undefined &&
      field.dataTypeModifier > 0
    ) {
      length = field.dataTypeModifier - 4;
    }

    return {
      name: field.name,
      type,
      dataTypeID,
      tableID: field.tableID,
      columnID: field.columnID,
      dataTypeModifier: field.dataTypeModifier,
      dataTypeSize: field.dataTypeSize,
      format: field.format,
      nullable: true, // PostgreSQL doesn't provide this in field metadata
      precision,
      scale,
      length,
    };
  });
}

// ============================================================================
// Row Parsing
// ============================================================================

/**
 * Parses a single row from PostgreSQL result.
 */
export function parseRow(pgRow: Record<string, unknown>, columns: ColumnMetadata[]): Row {
  if (!pgRow || typeof pgRow !== 'object') {
    throw new RedshiftError(
      'Invalid row data: expected object',
      RedshiftErrorCode.QUERY_FAILED,
      {
        cause: new Error(`Received: ${typeof pgRow}`),
        retryable: false,
      }
    );
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new RedshiftError(
      'Cannot parse row without column metadata',
      RedshiftErrorCode.QUERY_FAILED,
      {
        cause: new Error('Columns array is empty or invalid'),
        retryable: false,
      }
    );
  }

  // Parse each column value according to its type
  const parsedData: Record<string, unknown> = {};
  for (const column of columns) {
    const rawValue = pgRow[column.name];
    const parsedValue = parseValue(rawValue, column.type);
    // Extract the raw value for createRow
    parsedData[column.name] = parsedValue.type === 'null' ? null : parsedValue.value;
  }

  return createRow(parsedData, columns);
}

// ============================================================================
// Result Parsing
// ============================================================================

/**
 * Parses a PostgreSQL QueryResult into a Redshift ResultSet.
 */
export function parseResult(pgResult: PgQueryResult): ResultSet {
  if (!pgResult || typeof pgResult !== 'object') {
    throw new RedshiftError(
      'Invalid query result: expected object',
      RedshiftErrorCode.QUERY_FAILED,
      {
        cause: new Error(`Received: ${typeof pgResult}`),
        retryable: false,
      }
    );
  }

  // Parse columns
  const columns = parseColumns(pgResult.fields || []);

  // Parse rows
  const rawRows = pgResult.rows || [];
  if (!Array.isArray(rawRows)) {
    throw new RedshiftError(
      'Invalid rows data: expected array',
      RedshiftErrorCode.QUERY_FAILED,
      {
        cause: new Error(`Received: ${typeof rawRows}`),
        retryable: false,
      }
    );
  }

  const rows: Row[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    try {
      const row = parseRow(rawRows[i]!, columns);
      rows.push(row);
    } catch (error) {
      throw new RedshiftError(
        `Failed to parse row at index ${i}`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          retryable: false,
        }
      );
    }
  }

  return {
    columns,
    rows,
    rowCount: pgResult.rowCount || rows.length,
    command: pgResult.command,
    oid: pgResult.oid,
    hasMore: false,
  };
}

/**
 * ResultParser class for stateful parsing.
 */
export class ResultParser {
  /**
   * Parses PostgreSQL field definitions into Redshift column metadata.
   */
  parseColumns(pgFields: FieldDef[]): ColumnMetadata[] {
    return parseColumns(pgFields);
  }

  /**
   * Parses a single row from PostgreSQL result.
   */
  parseRow(pgRow: Record<string, unknown>, columns: ColumnMetadata[]): Row {
    return parseRow(pgRow, columns);
  }

  /**
   * Parses a PostgreSQL QueryResult into a Redshift ResultSet.
   */
  parseResult(pgResult: PgQueryResult): ResultSet {
    return parseResult(pgResult);
  }
}
