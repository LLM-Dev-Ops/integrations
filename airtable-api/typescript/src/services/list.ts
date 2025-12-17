/**
 * List and pagination service for Airtable API following SPARC specification.
 *
 * Provides fluent builder pattern for querying records with support for:
 * - Filtering with Airtable formulas
 * - Sorting by multiple fields
 * - Field selection
 * - View filtering
 * - Pagination (cursor-based)
 * - Streaming and batch processing
 *
 * @module services/list
 */

import type {
  Record as AirtableRecord,
  SortDirection,
  CellFormat,
} from '../types/index.js';
import { validatePageSize } from '../types/index.js';
import type { Observability } from '../observability/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Client Interface (minimal interface needed for list operations)
// ============================================================================

/**
 * HTTP response structure from AirtableClient.
 */
export interface HttpResponse<T = unknown> {
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Parsed response body */
  data: T;
}

/**
 * Minimal AirtableClient interface required for list operations.
 */
export interface AirtableClient {
  /**
   * Make a GET request to the Airtable API.
   *
   * @param path - API path (relative to base URL)
   * @param options - Request options including query parameters
   * @returns Promise resolving to HTTP response
   */
  get<T = unknown>(
    path: string,
    options?: {
      query?: Record<string, string | number | boolean | string[] | undefined>;
      headers?: Record<string, string>;
    }
  ): Promise<HttpResponse<T>>;

  /**
   * Get observability components for logging and metrics.
   */
  getObservability?(): Observability;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from listing records.
 */
export interface ListRecordsResponse {
  /** Array of records */
  records: AirtableRecord[];
  /** Pagination offset token (if more records available) */
  offset?: string;
}

// ============================================================================
// Sort Configuration
// ============================================================================

/**
 * Internal sort configuration.
 */
interface SortConfig {
  field: string;
  direction: SortDirection;
}

// ============================================================================
// List Records Builder
// ============================================================================

/**
 * Fluent builder for constructing list record queries.
 *
 * Provides a chainable API for configuring query parameters including
 * filtering, sorting, field selection, pagination, and formatting options.
 *
 * @example
 * ```typescript
 * // Simple query
 * const response = await builder
 *   .filterByFormula("Status = 'Active'")
 *   .sortBy('Name', 'asc')
 *   .page();
 *
 * // Fetch all records
 * const allRecords = await builder
 *   .selectFields(['Name', 'Email'])
 *   .all();
 *
 * // Stream records
 * for await (const record of builder.stream()) {
 *   console.log(record);
 * }
 *
 * // Process in batches
 * await builder.forEachBatch(50, async (batch) => {
 *   await processBatch(batch);
 * });
 * ```
 */
export class ListRecordsBuilder {
  private readonly client: AirtableClient;
  private readonly baseId: string;
  private readonly tableIdOrName: string;
  private readonly observability?: Observability;

  // Query parameters
  private filterFormula?: string;
  private sorts: SortConfig[] = [];
  private fields?: string[];
  private view?: string;
  private pageSizeValue?: number;
  private offsetValue?: string;
  private cellFormatValue?: CellFormat;
  private timeZoneValue?: string;
  private userLocaleValue?: string;

  /**
   * Creates a new ListRecordsBuilder.
   *
   * @param client - AirtableClient instance
   * @param baseId - Airtable base ID
   * @param tableIdOrName - Table ID or name
   */
  constructor(client: AirtableClient, baseId: string, tableIdOrName: string) {
    this.client = client;
    this.baseId = baseId;
    this.tableIdOrName = tableIdOrName;
    this.observability = client.getObservability?.();
  }

  /**
   * Sets the filter formula for the query.
   *
   * Uses Airtable formula syntax to filter records.
   *
   * @param formula - Airtable formula string (e.g., "Status = 'Active'")
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.filterByFormula("AND({Status} = 'Active', {Count} > 10)")
   * ```
   */
  filterByFormula(formula: string): this {
    this.filterFormula = formula;
    return this;
  }

  /**
   * Adds a sort field to the query.
   *
   * Multiple calls will add multiple sort fields in the order specified.
   *
   * @param field - Field name or ID to sort by
   * @param direction - Sort direction ('asc' or 'desc'), defaults to 'asc'
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .sortBy('Name', 'asc')
   *   .sortBy('Date', 'desc')
   * ```
   */
  sortBy(field: string, direction: SortDirection = 'asc'): this {
    this.sorts.push({ field, direction });
    return this;
  }

  /**
   * Selects specific fields to return in the response.
   *
   * Only the specified fields will be included in each record.
   * If not called, all fields are returned.
   *
   * @param fields - Array of field names or IDs
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.selectFields(['Name', 'Email', 'Status'])
   * ```
   */
  selectFields(fields: string[]): this {
    this.fields = fields;
    return this;
  }

  /**
   * Filters records to those visible in a specific view.
   *
   * @param viewIdOrName - View ID or name
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.inView('Active Users')
   * ```
   */
  inView(viewIdOrName: string): this {
    this.view = viewIdOrName;
    return this;
  }

  /**
   * Sets the page size for pagination.
   *
   * The value will be clamped to the valid range (1-100).
   *
   * @param size - Number of records per page (1-100)
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.pageSize(50)
   * ```
   */
  pageSize(size: number): this {
    this.pageSizeValue = validatePageSize(size);
    return this;
  }

  /**
   * Sets the cell format for the response.
   *
   * - 'json': Returns cell values as JSON objects (default)
   * - 'string': Returns cell values as strings
   *
   * @param format - Cell format ('json' or 'string')
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.cellFormat('string')
   * ```
   */
  cellFormat(format: CellFormat): this {
    this.cellFormatValue = format;
    return this;
  }

  /**
   * Sets the timezone for date/time values.
   *
   * @param tz - Timezone string (e.g., 'America/New_York')
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.timeZone('America/Los_Angeles')
   * ```
   */
  timeZone(tz: string): this {
    this.timeZoneValue = tz;
    return this;
  }

  /**
   * Sets the user locale for formatting.
   *
   * @param locale - Locale string (e.g., 'en-US')
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.userLocale('en-GB')
   * ```
   */
  userLocale(locale: string): this {
    this.userLocaleValue = locale;
    return this;
  }

  /**
   * Fetches a single page of records.
   *
   * @param offset - Optional pagination offset token from a previous response
   * @returns Promise resolving to a page of records with optional offset for next page
   *
   * @example
   * ```typescript
   * const page1 = await builder.page();
   * if (page1.offset) {
   *   const page2 = await builder.page(page1.offset);
   * }
   * ```
   */
  async page(offset?: string): Promise<ListRecordsResponse> {
    const startTime = Date.now();
    this.observability?.logger.debug('Fetching page of records', {
      baseId: this.baseId,
      table: this.tableIdOrName,
      offset,
    });

    try {
      // Build query parameters
      const query = this.buildQueryParams(offset);

      // Make API request
      const path = `/${this.baseId}/${encodeURIComponent(this.tableIdOrName)}`;
      const response = await this.client.get<ListRecordsResponse>(path, { query });

      // Record metrics
      this.observability?.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'list',
        baseId: this.baseId,
        table: this.tableIdOrName,
      });
      this.observability?.metrics.timing(
        MetricNames.OPERATION_LATENCY,
        Date.now() - startTime,
        {
          operation: 'list',
        }
      );

      this.observability?.logger.debug('Fetched page of records', {
        count: response.data.records.length,
        hasMore: !!response.data.offset,
      });

      return response.data;
    } catch (error) {
      this.observability?.logger.error('Failed to fetch page of records', {
        error: error instanceof Error ? error.message : String(error),
        baseId: this.baseId,
        table: this.tableIdOrName,
      });
      this.observability?.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        operation: 'list',
      });
      throw error;
    }
  }

  /**
   * Fetches all records across all pages.
   *
   * Automatically handles pagination and collects all records into a single array.
   * Use with caution for large datasets as this will load all records into memory.
   *
   * @returns Promise resolving to array of all records
   *
   * @example
   * ```typescript
   * const allRecords = await builder.all();
   * console.log(`Found ${allRecords.length} records`);
   * ```
   */
  async all(): Promise<AirtableRecord[]> {
    this.observability?.logger.debug('Fetching all records', {
      baseId: this.baseId,
      table: this.tableIdOrName,
    });

    const allRecords: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const response = await this.page(offset);
      allRecords.push(...response.records);
      offset = response.offset;
    } while (offset);

    this.observability?.logger.info('Fetched all records', {
      totalCount: allRecords.length,
      baseId: this.baseId,
      table: this.tableIdOrName,
    });

    return allRecords;
  }

  /**
   * Streams records one at a time across all pages.
   *
   * Returns an async generator that yields records individually,
   * automatically handling pagination in the background.
   *
   * @returns AsyncGenerator yielding records one at a time
   *
   * @example
   * ```typescript
   * for await (const record of builder.stream()) {
   *   await processRecord(record);
   * }
   * ```
   */
  async *stream(): AsyncGenerator<AirtableRecord> {
    this.observability?.logger.debug('Starting record stream', {
      baseId: this.baseId,
      table: this.tableIdOrName,
    });

    let offset: string | undefined;
    let totalYielded = 0;

    do {
      const response = await this.page(offset);

      for (const record of response.records) {
        yield record;
        totalYielded++;
      }

      offset = response.offset;
    } while (offset);

    this.observability?.logger.debug('Completed record stream', {
      totalYielded,
      baseId: this.baseId,
      table: this.tableIdOrName,
    });
  }

  /**
   * Processes records in batches across all pages.
   *
   * Automatically handles pagination and groups records into batches
   * of the specified size for processing.
   *
   * @param batchSize - Number of records per batch
   * @param handler - Async function to process each batch
   * @returns Promise that resolves when all batches are processed
   *
   * @example
   * ```typescript
   * await builder.forEachBatch(100, async (batch) => {
   *   await database.insertMany(batch);
   *   console.log(`Processed ${batch.length} records`);
   * });
   * ```
   */
  async forEachBatch(
    batchSize: number,
    handler: (batch: AirtableRecord[]) => Promise<void>
  ): Promise<void> {
    if (batchSize <= 0) {
      throw new Error('Batch size must be greater than 0');
    }

    this.observability?.logger.debug('Starting batch processing', {
      batchSize,
      baseId: this.baseId,
      table: this.tableIdOrName,
    });

    let batch: AirtableRecord[] = [];
    let totalProcessed = 0;
    let batchCount = 0;

    for await (const record of this.stream()) {
      batch.push(record);

      if (batch.length >= batchSize) {
        await handler(batch);
        totalProcessed += batch.length;
        batchCount++;
        batch = [];

        this.observability?.logger.debug('Processed batch', {
          batchNumber: batchCount,
          recordsInBatch: batchSize,
          totalProcessed,
        });
      }
    }

    // Process remaining records in final batch
    if (batch.length > 0) {
      await handler(batch);
      totalProcessed += batch.length;
      batchCount++;

      this.observability?.logger.debug('Processed final batch', {
        batchNumber: batchCount,
        recordsInBatch: batch.length,
        totalProcessed,
      });
    }

    this.observability?.metrics.increment(MetricNames.BATCHES_PROCESSED, batchCount, {
      operation: 'list',
    });

    this.observability?.logger.info('Completed batch processing', {
      totalBatches: batchCount,
      totalRecords: totalProcessed,
      baseId: this.baseId,
      table: this.tableIdOrName,
    });
  }

  /**
   * Builds query parameters for the API request.
   *
   * @param offset - Optional pagination offset
   * @returns Query parameters object
   */
  private buildQueryParams(offset?: string): Record<string, string | string[] | undefined> {
    const query: Record<string, string | string[] | undefined> = {};

    // Filter formula
    if (this.filterFormula) {
      query.filterByFormula = this.filterFormula;
    }

    // Sorts - convert to sort[0][field], sort[0][direction], etc.
    this.sorts.forEach((sort, index) => {
      query[`sort[${index}][field]`] = sort.field;
      query[`sort[${index}][direction]`] = sort.direction;
    });

    // Fields - convert to fields[] array
    if (this.fields && this.fields.length > 0) {
      query['fields[]'] = this.fields;
    }

    // View
    if (this.view) {
      query.view = this.view;
    }

    // Page size
    if (this.pageSizeValue !== undefined) {
      query.pageSize = String(this.pageSizeValue);
    }

    // Offset
    if (offset || this.offsetValue) {
      query.offset = offset || this.offsetValue;
    }

    // Cell format
    if (this.cellFormatValue) {
      query.cellFormat = this.cellFormatValue;
    }

    // Timezone
    if (this.timeZoneValue) {
      query.timeZone = this.timeZoneValue;
    }

    // User locale
    if (this.userLocaleValue) {
      query.userLocale = this.userLocaleValue;
    }

    return query;
  }
}

// ============================================================================
// List Service Interface
// ============================================================================

/**
 * Service interface for list operations.
 */
export interface ListService {
  /**
   * Creates a new list records builder.
   *
   * @returns A new ListRecordsBuilder instance
   *
   * @example
   * ```typescript
   * const records = await listService
   *   .list()
   *   .filterByFormula("Status = 'Active'")
   *   .all();
   * ```
   */
  list(): ListRecordsBuilder;
}

// ============================================================================
// List Service Implementation
// ============================================================================

/**
 * Implementation of the list service.
 */
export class ListServiceImpl implements ListService {
  private readonly client: AirtableClient;
  private readonly baseId: string;
  private readonly tableIdOrName: string;

  /**
   * Creates a new ListServiceImpl.
   *
   * @param client - AirtableClient instance
   * @param baseId - Airtable base ID
   * @param tableIdOrName - Table ID or name
   */
  constructor(client: AirtableClient, baseId: string, tableIdOrName: string) {
    this.client = client;
    this.baseId = baseId;
    this.tableIdOrName = tableIdOrName;
  }

  /**
   * Creates a new list records builder.
   *
   * @returns A new ListRecordsBuilder instance
   */
  list(): ListRecordsBuilder {
    return new ListRecordsBuilder(this.client, this.baseId, this.tableIdOrName);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new list service instance.
 *
 * Factory function for creating a ListService bound to a specific
 * base and table.
 *
 * @param client - AirtableClient instance
 * @param baseId - Airtable base ID
 * @param tableIdOrName - Table ID or name
 * @returns A new ListService instance
 *
 * @example
 * ```typescript
 * const listService = createListService(client, 'appXXXXXXXXXXXXXX', 'Users');
 *
 * // Use the service
 * const activeUsers = await listService
 *   .list()
 *   .filterByFormula("Status = 'Active'")
 *   .sortBy('Name', 'asc')
 *   .all();
 * ```
 */
export function createListService(
  client: AirtableClient,
  baseId: string,
  tableIdOrName: string
): ListService {
  return new ListServiceImpl(client, baseId, tableIdOrName);
}
