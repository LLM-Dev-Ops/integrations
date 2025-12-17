/**
 * Airtable API services following SPARC specification.
 *
 * Provides high-level service interfaces for common operations.
 */

// ============================================================================
// Record Service
// ============================================================================

export {
  RecordServiceImpl,
  createRecordService,
} from './record.js';

export type {
  RecordService,
  AirtableClient as RecordServiceClient,
  SpanContext as RecordSpanContext,
} from './record.js';

// ============================================================================
// List Service
// ============================================================================

export {
  ListServiceImpl,
  ListRecordsBuilder,
  createListService,
} from './list.js';

export type {
  ListService,
  ListRecordsResponse,
  AirtableClient as ListServiceClient,
  HttpResponse,
} from './list.js';

// ============================================================================
// Batch Service
// ============================================================================

export {
  BatchServiceImpl,
  createBatchService,
  chunk,
} from './batch.js';

export type {
  BatchService,
  AirtableClient,
  SpanContext,
} from './batch.js';

// ============================================================================
// Metadata Service
// ============================================================================

export {
  MetadataServiceImpl,
  createMetadataService,
  SchemaCache,
} from './metadata.js';

export type {
  MetadataService,
} from './metadata.js';
