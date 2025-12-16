/**
 * Redshift Data Ingestion Module
 *
 * Provides components for efficient data ingestion into Redshift, including
 * COPY operations from S3, bulk insert capabilities, and format specifications.
 *
 * @module @llmdevops/redshift-integration/ingestion
 *
 * @example
 * ```typescript
 * import {
 *   CopyExecutor,
 *   BulkInsert,
 *   CSV_COMMA,
 *   JSON_AUTO,
 * } from '@llmdevops/redshift-integration/ingestion';
 *
 * // Execute COPY from S3
 * const copyExecutor = new CopyExecutor(pool, {
 *   defaultIamRole: 'arn:aws:iam::123456789012:role/RedshiftRole',
 *   defaultRegion: 'us-east-1'
 * });
 *
 * const copyResult = await copyExecutor.copyFromS3(
 *   'sales_data',
 *   's3://my-bucket/data/',
 *   {
 *     format: 'CSV',
 *     formatOptions: CSV_COMMA,
 *     maxErrors: 100
 *   }
 * );
 *
 * // Bulk insert records
 * const bulkInsert = new BulkInsert(pool);
 * const insertResult = await bulkInsert.insert('products', records, {
 *   batchSize: 1000,
 *   onError: 'CONTINUE'
 * });
 * ```
 */

// ============================================================================
// COPY Operations
// ============================================================================

export {
  CopyExecutor,
  validateS3Path,
  parseS3Path,
  buildS3Path,
  type ConnectionPool as CopyConnectionPool,
  type QueryResult as CopyQueryResult,
  type CopyOptions,
  type CopyConfig,
  type CopyResult,
  type LoadError,
  type StlLoadError,
} from './copy.js';

// ============================================================================
// Bulk Insert Operations
// ============================================================================

export {
  BulkInsert,
  batchRecords,
  validateBulkRecords,
  estimateBatchSize,
  recordsToCsv,
  type ConnectionPool as BulkConnectionPool,
  type QueryResult as BulkQueryResult,
  type BulkInsertOptions,
  type BulkInsertResult,
  type BulkInsertError,
} from './bulk.js';

// ============================================================================
// File Format Specifications
// ============================================================================

export {
  formatToSqlClause,
  CSV_COMMA,
  CSV_PIPE,
  CSV_TAB,
  JSON_AUTO,
  type DataFormat,
  type CsvFormatOptions,
  type JsonFormatOptions,
  type ParquetFormatOptions,
  type AvroFormatOptions,
  type OrcFormatOptions,
} from './format.js';
