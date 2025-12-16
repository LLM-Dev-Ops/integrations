/**
 * Redshift Result Handler Module
 *
 * Provides utilities for parsing, streaming, and exporting query results.
 * @module @llmdevops/redshift-integration/result
 */

// ============================================================================
// Parser Exports
// ============================================================================

export {
  ResultParser,
  parseColumns,
  parseRow,
  parseResult,
  parseBoolean,
  parseNumber,
  parseBigInt,
  parseDate,
  parseTimestamp,
  parseJson,
} from './parser.js';

// ============================================================================
// Stream Exports
// ============================================================================

export {
  ResultStream,
  createCursorStream,
  type StreamOptions,
} from './stream.js';

// ============================================================================
// Export Exports
// ============================================================================

export {
  UnloadExecutor,
  createUnloadExecutor,
  buildCsvUnload,
  buildParquetUnload,
  buildJsonUnload,
  type UnloadConfig,
} from './export.js';

// ============================================================================
// Re-export Types from types module
// ============================================================================

export type {
  ResultSet,
  Row,
  ColumnMetadata,
  Value,
  RedshiftDataType,
  UnloadCommand,
  UnloadFormat,
  UnloadOptions,
  UnloadResult,
} from '../types/index.js';
