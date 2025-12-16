/**
 * Snowflake Result Handler Module
 *
 * Provides utilities for parsing, streaming, and exporting query results.
 * @module @llmdevops/snowflake-integration/result
 */

// ============================================================================
// Parser Exports
// ============================================================================

export {
  parseColumns,
  parseRow,
  parseResultSet,
  validateValue,
  toSnowflakeValue,
  type RawColumnMetadata,
  type RawRow,
  type RawResultSet,
} from './parser.js';

// ============================================================================
// Stream Exports
// ============================================================================

export {
  ResultStream,
  fromResultSet,
  type FetchPageFn,
  type ResultStreamOptions,
  type ResultStreamItem,
} from './stream.js';

// ============================================================================
// Export Exports
// ============================================================================

export {
  toCsv,
  toCsvStream,
  toJson,
  toJsonStream,
  toJsonLines,
  toJsonLinesStream,
  ResultExporter,
  createExporter,
  type CsvExportOptions,
  type JsonExportOptions,
  type JsonLinesExportOptions,
  type StreamExportOptions,
} from './export.js';

// ============================================================================
// Re-export Types from types module
// ============================================================================

export type { ResultSet, Row, ColumnMetadata, Value } from '../types/index.js';
