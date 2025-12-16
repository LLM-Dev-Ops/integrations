/**
 * Snowflake Data Ingestion Module
 *
 * Provides components for efficient data ingestion into Snowflake, including
 * stage operations, COPY INTO operations, and bulk insert capabilities.
 *
 * @module @llmdevops/snowflake-integration/ingestion
 *
 * @example
 * ```typescript
 * import {
 *   StageManager,
 *   CopyIntoBuilder,
 *   BulkInserter,
 *   csv,
 * } from '@llmdevops/snowflake-integration/ingestion';
 *
 * // Upload file to stage
 * const stageManager = new StageManager(executor);
 * await stageManager.putFile('./data.csv', '@my_stage/');
 *
 * // Build and execute COPY INTO
 * const copyRequest = new CopyIntoBuilder()
 *   .targetTable('my_table')
 *   .fromStage('@my_stage/data.csv')
 *   .fileFormat(csv().skipHeader(1).build())
 *   .build();
 *
 * // Bulk insert records
 * const bulkInserter = new BulkInserter({ executor });
 * await bulkInserter.insert('my_table', records);
 * ```
 */

// ============================================================================
// Stage Operations
// ============================================================================

export {
  StageManager,
  type StageQueryExecutor,
  type ListStageOptions,
  type GetFileOptions,
  createStagePath,
  parseStagePath,
  isValidStagePath,
} from './stage.js';

// ============================================================================
// COPY INTO Operations
// ============================================================================

export {
  CopyIntoBuilder,
  CopyIntoExecutor,
  type CopyQueryExecutor,
  copyInto,
  validateCopyRequest,
  estimateFileCount,
  createCopyRequest,
} from './copy.js';

// ============================================================================
// Bulk Insert Operations
// ============================================================================

export {
  BulkInserter,
  type BulkQueryExecutor,
  type BulkInserterConfig,
  batchRecords,
  validateBulkRecords,
  recordsToCsv,
} from './bulk.js';

// ============================================================================
// File Format Specifications
// ============================================================================

export {
  FileFormatBuilder,
  csv,
  json,
  avro,
  orc,
  parquet,
  xml,
  formatToSql,
  CSV_COMMA,
  CSV_PIPE,
  CSV_TAB,
  JSON_AUTO,
  JSON_ARRAY,
  PARQUET_AUTO,
} from './format.js';

// ============================================================================
// Re-export Types from Types Module
// ============================================================================

export type {
  StageFile,
  FileFormat,
  FormatType,
  CopyOptions,
  PutOptions,
  PutResult,
  CopyIntoRequest,
  CopyIntoResult,
  BulkInsertOptions,
} from '../types/index.js';
