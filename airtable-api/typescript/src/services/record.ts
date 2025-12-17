/**
 * Record service implementation following SPARC specification.
 *
 * Provides CRUD operations for Airtable records with proper validation,
 * tracing, and error handling.
 */

import { Record as AirtableRecord, DeletedRecord, isValidRecordId } from '../types/index.js';
import { ValidationError } from '../errors/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// AirtableClient Interface (Forward Reference)
// ============================================================================

/**
 * Minimal AirtableClient interface required by RecordService.
 * The actual implementation will be in ../client/index.js
 */
export interface AirtableClient {
  /** Logger instance */
  readonly logger: {
    info(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
  /** Metrics collector instance */
  readonly metrics: {
    increment(name: string, value?: number, labels?: Record<string, string>): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    timing(name: string, durationMs: number, labels?: Record<string, string>): void;
  };
  /** Tracer instance */
  readonly tracer: {
    withSpan<T>(
      name: string,
      fn: (span: SpanContext) => Promise<T>,
      attributes?: Record<string, unknown>
    ): Promise<T>;
  };
  /** Performs a GET request */
  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>;
  /** Performs a POST request */
  post<T>(path: string, body?: unknown): Promise<T>;
  /** Performs a PATCH request */
  patch<T>(path: string, body?: unknown): Promise<T>;
  /** Performs a PUT request */
  put<T>(path: string, body?: unknown): Promise<T>;
  /** Performs a DELETE request */
  delete<T = void>(path: string): Promise<T>;
}

/**
 * Span context for tracing.
 */
export interface SpanContext {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'OK' | 'ERROR'): void;
  recordException(error: Error): void;
}

// ============================================================================
// Record Service Interface
// ============================================================================

/**
 * Record service interface for CRUD operations on Airtable records.
 */
export interface RecordService {
  /**
   * Creates a new record in the table.
   *
   * @param fields - Field values for the new record
   * @returns The created record with ID and createdTime
   *
   * @example
   * ```typescript
   * const record = await recordService.create({
   *   'Name': 'John Doe',
   *   'Email': 'john@example.com',
   *   'Status': 'Active'
   * });
   * console.log(record.id); // recXXXXXXXXXXXXXX
   * ```
   */
  create(fields: Record<string, unknown>): Promise<AirtableRecord>;

  /**
   * Retrieves a record by ID.
   *
   * @param recordId - The record ID (must be a valid Airtable record ID)
   * @returns The record with all fields
   * @throws {ValidationError} If recordId is invalid
   * @throws {NotFoundError} If record does not exist
   *
   * @example
   * ```typescript
   * const record = await recordService.get('recXXXXXXXXXXXXXX');
   * console.log(record.fields['Name']);
   * ```
   */
  get(recordId: string): Promise<AirtableRecord>;

  /**
   * Updates specific fields in a record (PATCH operation).
   * Only the fields provided will be updated; other fields remain unchanged.
   *
   * @param recordId - The record ID (must be a valid Airtable record ID)
   * @param fields - Field values to update
   * @returns The updated record
   * @throws {ValidationError} If recordId is invalid
   * @throws {NotFoundError} If record does not exist
   *
   * @example
   * ```typescript
   * const record = await recordService.update('recXXXXXXXXXXXXXX', {
   *   'Status': 'Completed'
   * });
   * ```
   */
  update(recordId: string, fields: Record<string, unknown>): Promise<AirtableRecord>;

  /**
   * Replaces a record completely (PUT operation).
   * All fields not provided will be cleared.
   *
   * @param recordId - The record ID (must be a valid Airtable record ID)
   * @param fields - Complete field values for the record
   * @returns The replaced record
   * @throws {ValidationError} If recordId is invalid
   * @throws {NotFoundError} If record does not exist
   *
   * @example
   * ```typescript
   * const record = await recordService.replace('recXXXXXXXXXXXXXX', {
   *   'Name': 'Jane Doe',
   *   'Email': 'jane@example.com'
   * });
   * ```
   */
  replace(recordId: string, fields: Record<string, unknown>): Promise<AirtableRecord>;

  /**
   * Deletes a record.
   *
   * @param recordId - The record ID (must be a valid Airtable record ID)
   * @returns Confirmation of deletion with record ID
   * @throws {ValidationError} If recordId is invalid
   * @throws {NotFoundError} If record does not exist
   *
   * @example
   * ```typescript
   * const result = await recordService.delete('recXXXXXXXXXXXXXX');
   * console.log(result.deleted); // true
   * ```
   */
  delete(recordId: string): Promise<DeletedRecord>;
}

// ============================================================================
// Record Service Implementation
// ============================================================================

/**
 * Record service implementation with validation, tracing, and metrics.
 */
export class RecordServiceImpl implements RecordService {
  private readonly client: AirtableClient;
  private readonly baseId: string;
  private readonly tableIdOrName: string;

  /**
   * Creates a new record service instance.
   *
   * @param client - The Airtable client instance
   * @param baseId - The Airtable base ID (e.g., "appXXXXXXXXXXXXXX")
   * @param tableIdOrName - The table ID (e.g., "tblXXXXXXXXXXXXXX") or table name
   */
  constructor(client: AirtableClient, baseId: string, tableIdOrName: string) {
    this.client = client;
    this.baseId = baseId;
    this.tableIdOrName = tableIdOrName;
  }

  /**
   * Creates a new record.
   */
  async create(fields: Record<string, unknown>): Promise<AirtableRecord> {
    return this.client.tracer.withSpan(
      'airtable.record.create',
      async (span) => {
        span.setAttribute('base', this.baseId);
        span.setAttribute('table', this.tableIdOrName);

        // Build request body
        const requestBody = { fields };

        // Create the record
        const path = `/${this.baseId}/${this.tableIdOrName}`;
        const response = await this.client.post<AirtableRecord>(path, requestBody);

        this.client.logger.info('Record created', {
          base: this.baseId,
          table: this.tableIdOrName,
          recordId: response.id,
        });

        this.client.metrics.increment(MetricNames.RECORDS_CREATED, 1, {
          base: this.baseId,
          table: this.tableIdOrName,
        });

        return response;
      },
      { operation: 'createRecord' }
    );
  }

  /**
   * Gets a record by ID.
   */
  async get(recordId: string): Promise<AirtableRecord> {
    return this.client.tracer.withSpan(
      'airtable.record.get',
      async (span) => {
        span.setAttribute('base', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('record', this.redactRecordId(recordId));

        // Validate record ID
        this.validateRecordId(recordId);

        const path = `/${this.baseId}/${this.tableIdOrName}/${recordId}`;
        const response = await this.client.get<AirtableRecord>(path);

        this.client.logger.debug('Record retrieved', {
          base: this.baseId,
          table: this.tableIdOrName,
          recordId: this.redactRecordId(recordId),
        });

        return response;
      },
      { operation: 'getRecord' }
    );
  }

  /**
   * Updates a record (partial update).
   */
  async update(recordId: string, fields: Record<string, unknown>): Promise<AirtableRecord> {
    return this.client.tracer.withSpan(
      'airtable.record.update',
      async (span) => {
        span.setAttribute('base', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('record', this.redactRecordId(recordId));

        // Validate record ID
        this.validateRecordId(recordId);

        // Build request body
        const requestBody = { fields };

        // Update the record using PATCH
        const path = `/${this.baseId}/${this.tableIdOrName}/${recordId}`;
        const response = await this.client.patch<AirtableRecord>(path, requestBody);

        this.client.logger.info('Record updated', {
          base: this.baseId,
          table: this.tableIdOrName,
          recordId: this.redactRecordId(recordId),
        });

        this.client.metrics.increment(MetricNames.RECORDS_UPDATED, 1, {
          base: this.baseId,
          table: this.tableIdOrName,
        });

        return response;
      },
      { operation: 'updateRecord' }
    );
  }

  /**
   * Replaces a record (full replacement).
   */
  async replace(recordId: string, fields: Record<string, unknown>): Promise<AirtableRecord> {
    return this.client.tracer.withSpan(
      'airtable.record.replace',
      async (span) => {
        span.setAttribute('base', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('record', this.redactRecordId(recordId));

        // Validate record ID
        this.validateRecordId(recordId);

        // Build request body
        const requestBody = { fields };

        // Replace the record using PUT
        const path = `/${this.baseId}/${this.tableIdOrName}/${recordId}`;
        const response = await this.client.put<AirtableRecord>(path, requestBody);

        this.client.logger.info('Record replaced', {
          base: this.baseId,
          table: this.tableIdOrName,
          recordId: this.redactRecordId(recordId),
        });

        this.client.metrics.increment(MetricNames.RECORDS_UPDATED, 1, {
          base: this.baseId,
          table: this.tableIdOrName,
          operation: 'replace',
        });

        return response;
      },
      { operation: 'replaceRecord' }
    );
  }

  /**
   * Deletes a record.
   */
  async delete(recordId: string): Promise<DeletedRecord> {
    return this.client.tracer.withSpan(
      'airtable.record.delete',
      async (span) => {
        span.setAttribute('base', this.baseId);
        span.setAttribute('table', this.tableIdOrName);
        span.setAttribute('record', this.redactRecordId(recordId));

        // Validate record ID
        this.validateRecordId(recordId);

        const path = `/${this.baseId}/${this.tableIdOrName}/${recordId}`;
        const response = await this.client.delete<DeletedRecord>(path);

        this.client.logger.info('Record deleted', {
          base: this.baseId,
          table: this.tableIdOrName,
          recordId: this.redactRecordId(recordId),
        });

        this.client.metrics.increment(MetricNames.RECORDS_DELETED, 1, {
          base: this.baseId,
          table: this.tableIdOrName,
        });

        return response;
      },
      { operation: 'deleteRecord' }
    );
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Validates a record ID format.
   *
   * @param recordId - The record ID to validate
   * @throws {ValidationError} If the record ID is invalid
   */
  private validateRecordId(recordId: string): void {
    if (!isValidRecordId(recordId)) {
      throw new ValidationError(
        `Invalid record ID format: ${recordId}. Expected format: recXXXXXXXXXXXXXX (17 characters starting with 'rec')`,
        'recordId'
      );
    }
  }

  /**
   * Redacts record ID for logging (keeps prefix, hides suffix).
   *
   * @param recordId - The record ID to redact
   * @returns Redacted record ID for safe logging
   */
  private redactRecordId(recordId: string): string {
    if (recordId.length <= 6) {
      return 'rec***';
    }
    // Keep 'rec' prefix and first few chars, redact the rest
    return recordId.substring(0, 6) + '***********';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a record service instance.
 *
 * @param client - The Airtable client instance
 * @param baseId - The Airtable base ID (e.g., "appXXXXXXXXXXXXXX")
 * @param tableIdOrName - The table ID (e.g., "tblXXXXXXXXXXXXXX") or table name
 * @returns A new RecordService instance
 *
 * @example
 * ```typescript
 * const client = createAirtableClient(config);
 * const recordService = createRecordService(client, 'appXXXXXXXXXXXXXX', 'tblXXXXXXXXXXXXXX');
 *
 * // Create a record
 * const record = await recordService.create({
 *   'Name': 'John Doe',
 *   'Email': 'john@example.com'
 * });
 * ```
 */
export function createRecordService(
  client: AirtableClient,
  baseId: string,
  tableIdOrName: string
): RecordService {
  return new RecordServiceImpl(client, baseId, tableIdOrName);
}
