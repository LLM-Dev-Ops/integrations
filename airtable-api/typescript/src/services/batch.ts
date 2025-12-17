/**
 * Batch operations service for Airtable API following SPARC specification.
 *
 * Provides batch create, update, delete, and upsert operations with automatic
 * chunking support. Airtable limits batch operations to 10 records per request.
 */

import type {
  Record as AirtableRecord,
  DeletedRecord,
  UpsertRequest,
  UpsertResult,
  FieldValue,
} from '../types/index.js';
import { isValidRecordId, validateBatchSize, MAX_BATCH_SIZE } from '../types/index.js';
import { BatchSizeExceededError, ValidationError } from '../errors/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Client Interface (Minimal)
// ============================================================================

/**
 * Minimal Airtable client interface required for batch operations.
 * The actual client implementation should be imported from '../client/index.js'.
 */
export interface AirtableClient {
  /** Observability components */
  observability: {
    logger: {
      info(message: string, context?: Record<string, unknown>): void;
      error(message: string, context?: Record<string, unknown>): void;
      debug(message: string, context?: Record<string, unknown>): void;
    };
    metrics: {
      increment(name: string, value?: number): void;
      timing(name: string, durationMs: number, labels?: Record<string, string>): void;
    };
    tracer: {
      withSpan<T>(
        name: string,
        fn: (span: SpanContext) => Promise<T>,
        attributes?: Record<string, unknown>
      ): Promise<T>;
    };
  };
  /** Make HTTP request */
  request<T>(options: {
    method: string;
    path: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  }): Promise<{ data: T }>;
}

/**
 * Minimal span context interface.
 */
export interface SpanContext {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'OK' | 'ERROR'): void;
  recordException(error: Error): void;
}

// ============================================================================
// Batch Service Interface
// ============================================================================

/**
 * Batch operations service interface.
 */
export interface BatchService {
  /**
   * Creates multiple records in a single batch.
   * @param records - Array of record data (max 10 records)
   * @param typecast - Whether to enable automatic type conversion
   * @returns Array of created records
   * @throws BatchSizeExceededError if more than 10 records
   */
  createRecords(
    records: Array<{ fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]>;

  /**
   * Creates multiple records with automatic chunking.
   * Splits large batches into chunks of 10 and processes sequentially.
   * @param records - Array of record data (any size)
   * @param typecast - Whether to enable automatic type conversion
   * @returns Array of all created records
   */
  createRecordsChunked(
    records: Array<{ fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]>;

  /**
   * Updates multiple records in a single batch.
   * @param records - Array of record updates (max 10 records)
   * @param typecast - Whether to enable automatic type conversion
   * @returns Array of updated records
   * @throws BatchSizeExceededError if more than 10 records
   */
  updateRecords(
    records: Array<{ id: string; fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]>;

  /**
   * Updates multiple records with automatic chunking.
   * Splits large batches into chunks of 10 and processes sequentially.
   * @param records - Array of record updates (any size)
   * @param typecast - Whether to enable automatic type conversion
   * @returns Array of all updated records
   */
  updateRecordsChunked(
    records: Array<{ id: string; fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]>;

  /**
   * Deletes multiple records in a single batch.
   * @param recordIds - Array of record IDs to delete (max 10 records)
   * @returns Array of deleted record confirmations
   * @throws BatchSizeExceededError if more than 10 records
   */
  deleteRecords(recordIds: string[]): Promise<DeletedRecord[]>;

  /**
   * Deletes multiple records with automatic chunking.
   * Splits large batches into chunks of 10 and processes sequentially.
   * @param recordIds - Array of record IDs to delete (any size)
   * @returns Array of all deleted record confirmations
   */
  deleteRecordsChunked(recordIds: string[]): Promise<DeletedRecord[]>;

  /**
   * Upserts records (insert or update based on merge fields).
   * @param request - Upsert request with records and merge fields
   * @param typecast - Whether to enable automatic type conversion
   * @returns Upsert result with created/updated record IDs
   */
  upsertRecords(request: UpsertRequest, typecast?: boolean): Promise<UpsertResult>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Splits an array into chunks of specified size.
 *
 * @param array - Array to chunk
 * @param size - Maximum chunk size
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5];
 * const chunks = chunk(items, 2);
 * // Result: [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be positive');
  }
  if (array.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// Batch Service Implementation
// ============================================================================

/**
 * Batch operations service implementation.
 */
export class BatchServiceImpl implements BatchService {
  private readonly client: AirtableClient;
  private readonly baseId: string;
  private readonly tableIdOrName: string;

  /**
   * Batch size constant (Airtable limit).
   */
  private static readonly BATCH_SIZE = MAX_BATCH_SIZE;

  /**
   * Creates a new batch service instance.
   *
   * @param client - Airtable client for HTTP operations
   * @param baseId - Base ID (e.g., "appXXXXXXXXXXXXXX")
   * @param tableIdOrName - Table ID or table name
   */
  constructor(client: AirtableClient, baseId: string, tableIdOrName: string) {
    this.client = client;
    this.baseId = baseId;
    this.tableIdOrName = tableIdOrName;
  }

  /**
   * Creates multiple records in a single batch.
   */
  async createRecords(
    records: Array<{ fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.createRecords',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('recordCount', records.length);

        // Validate batch size
        validateBatchSize(records.length);

        // Validate records
        if (records.length === 0) {
          throw new ValidationError('Cannot create empty batch');
        }

        this.client.observability.logger.info('Creating batch of records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          count: records.length,
        });

        try {
          // Build request body
          const body: Record<string, unknown> = { records };
          if (typecast !== undefined) {
            body.typecast = typecast;
          }

          // Make API request
          const response = await this.client.request<{ records: AirtableRecord[] }>({
            method: 'POST',
            path: `/${this.baseId}/${encodeURIComponent(this.tableIdOrName)}`,
            body,
          });

          const createdRecords = response.data.records;

          // Record metrics
          const duration = Date.now() - startTime;
          this.client.observability.metrics.increment(MetricNames.BATCHES_PROCESSED);
          this.client.observability.metrics.increment(
            MetricNames.RECORDS_CREATED,
            createdRecords.length
          );
          this.client.observability.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            duration,
            { operation: 'batch_create' }
          );

          this.client.observability.logger.info('Successfully created batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: createdRecords.length,
            durationMs: duration,
          });

          span.setAttribute('recordsCreated', createdRecords.length);
          span.setStatus('OK');

          return createdRecords;
        } catch (error) {
          span.recordException(error as Error);
          this.client.observability.logger.error('Failed to create batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: records.length,
            error: (error as Error).message,
          });
          throw error;
        }
      }
    );
  }

  /**
   * Creates multiple records with automatic chunking.
   */
  async createRecordsChunked(
    records: Array<{ fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.createRecordsChunked',
      async (span) => {
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('totalRecords', records.length);

        if (records.length === 0) {
          return [];
        }

        this.client.observability.logger.info('Creating records with chunking', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          totalCount: records.length,
          chunkSize: BatchServiceImpl.BATCH_SIZE,
        });

        // Split into chunks
        const chunks = chunk(records, BatchServiceImpl.BATCH_SIZE);
        span.setAttribute('chunkCount', chunks.length);

        // Process chunks sequentially
        const allCreatedRecords: AirtableRecord[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkRecords = await this.createRecords(chunks[i], typecast);
          allCreatedRecords.push(...chunkRecords);

          this.client.observability.logger.debug('Processed chunk', {
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            recordsInChunk: chunkRecords.length,
          });
        }

        this.client.observability.logger.info('Successfully created all records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          totalCount: allCreatedRecords.length,
          chunks: chunks.length,
        });

        span.setAttribute('totalCreated', allCreatedRecords.length);
        span.setStatus('OK');

        return allCreatedRecords;
      }
    );
  }

  /**
   * Updates multiple records in a single batch.
   */
  async updateRecords(
    records: Array<{ id: string; fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.updateRecords',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('recordCount', records.length);

        // Validate batch size
        validateBatchSize(records.length);

        // Validate records
        if (records.length === 0) {
          throw new ValidationError('Cannot update empty batch');
        }

        // Validate record IDs
        for (const record of records) {
          if (!isValidRecordId(record.id)) {
            throw new ValidationError(`Invalid record ID: ${record.id}`);
          }
        }

        this.client.observability.logger.info('Updating batch of records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          count: records.length,
        });

        try {
          // Build request body
          const body: Record<string, unknown> = { records };
          if (typecast !== undefined) {
            body.typecast = typecast;
          }

          // Make API request
          const response = await this.client.request<{ records: AirtableRecord[] }>({
            method: 'PATCH',
            path: `/${this.baseId}/${encodeURIComponent(this.tableIdOrName)}`,
            body,
          });

          const updatedRecords = response.data.records;

          // Record metrics
          const duration = Date.now() - startTime;
          this.client.observability.metrics.increment(MetricNames.BATCHES_PROCESSED);
          this.client.observability.metrics.increment(
            MetricNames.RECORDS_UPDATED,
            updatedRecords.length
          );
          this.client.observability.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            duration,
            { operation: 'batch_update' }
          );

          this.client.observability.logger.info('Successfully updated batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: updatedRecords.length,
            durationMs: duration,
          });

          span.setAttribute('recordsUpdated', updatedRecords.length);
          span.setStatus('OK');

          return updatedRecords;
        } catch (error) {
          span.recordException(error as Error);
          this.client.observability.logger.error('Failed to update batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: records.length,
            error: (error as Error).message,
          });
          throw error;
        }
      }
    );
  }

  /**
   * Updates multiple records with automatic chunking.
   */
  async updateRecordsChunked(
    records: Array<{ id: string; fields: Record<string, FieldValue> }>,
    typecast?: boolean
  ): Promise<AirtableRecord[]> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.updateRecordsChunked',
      async (span) => {
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('totalRecords', records.length);

        if (records.length === 0) {
          return [];
        }

        this.client.observability.logger.info('Updating records with chunking', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          totalCount: records.length,
          chunkSize: BatchServiceImpl.BATCH_SIZE,
        });

        // Split into chunks
        const chunks = chunk(records, BatchServiceImpl.BATCH_SIZE);
        span.setAttribute('chunkCount', chunks.length);

        // Process chunks sequentially
        const allUpdatedRecords: AirtableRecord[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkRecords = await this.updateRecords(chunks[i], typecast);
          allUpdatedRecords.push(...chunkRecords);

          this.client.observability.logger.debug('Processed chunk', {
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            recordsInChunk: chunkRecords.length,
          });
        }

        this.client.observability.logger.info('Successfully updated all records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          totalCount: allUpdatedRecords.length,
          chunks: chunks.length,
        });

        span.setAttribute('totalUpdated', allUpdatedRecords.length);
        span.setStatus('OK');

        return allUpdatedRecords;
      }
    );
  }

  /**
   * Deletes multiple records in a single batch.
   */
  async deleteRecords(recordIds: string[]): Promise<DeletedRecord[]> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.deleteRecords',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('recordCount', recordIds.length);

        // Validate batch size
        validateBatchSize(recordIds.length);

        // Validate record IDs
        if (recordIds.length === 0) {
          throw new ValidationError('Cannot delete empty batch');
        }

        for (const id of recordIds) {
          if (!isValidRecordId(id)) {
            throw new ValidationError(`Invalid record ID: ${id}`);
          }
        }

        this.client.observability.logger.info('Deleting batch of records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          count: recordIds.length,
        });

        try {
          // Build query parameters
          // Note: The client's request method will need to handle array query parameters
          // by converting them to multiple `records[]=id` query strings
          const query: Record<string, string | string[]> = {
            'records[]': recordIds,
          };

          // Make API request
          const response = await this.client.request<{ records: DeletedRecord[] }>({
            method: 'DELETE',
            path: `/${this.baseId}/${encodeURIComponent(this.tableIdOrName)}`,
            query: query as any, // Cast needed due to simplified interface
          });

          const deletedRecords = response.data.records;

          // Record metrics
          const duration = Date.now() - startTime;
          this.client.observability.metrics.increment(MetricNames.BATCHES_PROCESSED);
          this.client.observability.metrics.increment(
            MetricNames.RECORDS_DELETED,
            deletedRecords.length
          );
          this.client.observability.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            duration,
            { operation: 'batch_delete' }
          );

          this.client.observability.logger.info('Successfully deleted batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: deletedRecords.length,
            durationMs: duration,
          });

          span.setAttribute('recordsDeleted', deletedRecords.length);
          span.setStatus('OK');

          return deletedRecords;
        } catch (error) {
          span.recordException(error as Error);
          this.client.observability.logger.error('Failed to delete batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: recordIds.length,
            error: (error as Error).message,
          });
          throw error;
        }
      }
    );
  }

  /**
   * Deletes multiple records with automatic chunking.
   */
  async deleteRecordsChunked(recordIds: string[]): Promise<DeletedRecord[]> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.deleteRecordsChunked',
      async (span) => {
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('totalRecords', recordIds.length);

        if (recordIds.length === 0) {
          return [];
        }

        this.client.observability.logger.info('Deleting records with chunking', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          totalCount: recordIds.length,
          chunkSize: BatchServiceImpl.BATCH_SIZE,
        });

        // Split into chunks
        const chunks = chunk(recordIds, BatchServiceImpl.BATCH_SIZE);
        span.setAttribute('chunkCount', chunks.length);

        // Process chunks sequentially
        const allDeletedRecords: DeletedRecord[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkRecords = await this.deleteRecords(chunks[i]);
          allDeletedRecords.push(...chunkRecords);

          this.client.observability.logger.debug('Processed chunk', {
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            recordsInChunk: chunkRecords.length,
          });
        }

        this.client.observability.logger.info('Successfully deleted all records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          totalCount: allDeletedRecords.length,
          chunks: chunks.length,
        });

        span.setAttribute('totalDeleted', allDeletedRecords.length);
        span.setStatus('OK');

        return allDeletedRecords;
      }
    );
  }

  /**
   * Upserts records (insert or update based on merge fields).
   */
  async upsertRecords(request: UpsertRequest, typecast?: boolean): Promise<UpsertResult> {
    return this.client.observability.tracer.withSpan(
      'airtable.batch.upsertRecords',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('baseId', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('recordCount', request.records.length);

        // Validate request
        if (request.records.length === 0) {
          throw new ValidationError('Cannot upsert empty batch');
        }

        if (!request.fieldsToMergeOn || request.fieldsToMergeOn.length === 0) {
          throw new ValidationError('Must specify at least one field to merge on');
        }

        this.client.observability.logger.info('Upserting batch of records', {
          baseId: this.baseId,
          table: this.tableIdOrName,
          count: request.records.length,
          mergeFields: request.fieldsToMergeOn,
        });

        try {
          // Build request body
          const body: Record<string, unknown> = {
            records: request.records,
            fieldsToMergeOn: request.fieldsToMergeOn,
          };
          if (typecast !== undefined) {
            body.typecast = typecast;
          }

          // Make API request
          const response = await this.client.request<UpsertResult>({
            method: 'PUT',
            path: `/${this.baseId}/${encodeURIComponent(this.tableIdOrName)}`,
            body,
          });

          const result = response.data;

          // Record metrics
          const duration = Date.now() - startTime;
          this.client.observability.metrics.increment(MetricNames.BATCHES_PROCESSED);
          this.client.observability.metrics.increment(
            MetricNames.RECORDS_CREATED,
            result.createdRecords.length
          );
          this.client.observability.metrics.increment(
            MetricNames.RECORDS_UPDATED,
            result.updatedRecords.length
          );
          this.client.observability.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            duration,
            { operation: 'batch_upsert' }
          );

          this.client.observability.logger.info('Successfully upserted batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            created: result.createdRecords.length,
            updated: result.updatedRecords.length,
            durationMs: duration,
          });

          span.setAttribute('recordsCreated', result.createdRecords.length);
          span.setAttribute('recordsUpdated', result.updatedRecords.length);
          span.setStatus('OK');

          return result;
        } catch (error) {
          span.recordException(error as Error);
          this.client.observability.logger.error('Failed to upsert batch of records', {
            baseId: this.baseId,
            table: this.tableIdOrName,
            count: request.records.length,
            error: (error as Error).message,
          });
          throw error;
        }
      }
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new batch service instance.
 *
 * @param client - Airtable client for HTTP operations
 * @param baseId - Base ID (e.g., "appXXXXXXXXXXXXXX")
 * @param tableIdOrName - Table ID or table name
 * @returns A new BatchService instance
 *
 * @example
 * ```typescript
 * const batchService = createBatchService(client, 'appXXXXXXXXXXXXXX', 'tblYYYYYYYYYYYYYY');
 *
 * // Create records
 * const created = await batchService.createRecords([
 *   { fields: { Name: 'Alice', Age: 30 } },
 *   { fields: { Name: 'Bob', Age: 25 } }
 * ]);
 *
 * // Create many records with automatic chunking
 * const manyCreated = await batchService.createRecordsChunked(largeArray);
 * ```
 */
export function createBatchService(
  client: AirtableClient,
  baseId: string,
  tableIdOrName: string
): BatchService {
  return new BatchServiceImpl(client, baseId, tableIdOrName);
}
