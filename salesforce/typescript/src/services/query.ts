/**
 * Salesforce Query Service Implementation
 *
 * Provides SOQL query execution, query pagination, and SOSL search capabilities.
 * Implements query streaming with async generators for handling large result sets.
 *
 * @module services/query
 */

import type { SalesforceClient } from '../client/index.js';
import type {
  SObjectRecord,
  QueryResult,
  QueryExplainPlan,
} from '../types/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Search Types
// ============================================================================

/**
 * Represents the result of a SOSL (Salesforce Object Search Language) search.
 */
export interface SearchResult {
  /** Array of search records */
  searchRecords: SObjectRecord[];
}

// ============================================================================
// Query Service Interface
// ============================================================================

/**
 * Query service interface for SOQL and SOSL operations.
 */
export interface QueryService {
  /**
   * Execute a SOQL query.
   *
   * @template T - The type of SObject records returned
   * @param soql - The SOQL query string
   * @returns Promise resolving to query results with pagination info
   *
   * @example
   * ```typescript
   * const result = await queryService.query<Account>(
   *   'SELECT Id, Name FROM Account WHERE Industry = \'Technology\' LIMIT 100'
   * );
   * console.log(`Found ${result.totalSize} records`);
   * console.log(`Has more: ${!result.done}`);
   * ```
   */
  query<T extends SObjectRecord = SObjectRecord>(soql: string): Promise<QueryResult<T>>;

  /**
   * Fetch the next batch of query results using the nextRecordsUrl.
   *
   * @template T - The type of SObject records returned
   * @param nextRecordsUrl - The URL from a previous QueryResult's nextRecordsUrl field
   * @returns Promise resolving to the next batch of results
   *
   * @example
   * ```typescript
   * let result = await queryService.query<Account>('SELECT Id, Name FROM Account');
   * while (!result.done) {
   *   result = await queryService.queryMore(result.nextRecordsUrl!);
   *   // Process result.records
   * }
   * ```
   */
  queryMore<T extends SObjectRecord = SObjectRecord>(nextRecordsUrl: string): Promise<QueryResult<T>>;

  /**
   * Stream all records from a SOQL query using an async generator.
   * Automatically handles pagination by following nextRecordsUrl.
   *
   * @template T - The type of SObject records returned
   * @param soql - The SOQL query string
   * @yields Individual records one at a time
   *
   * @example
   * ```typescript
   * for await (const account of queryService.queryAll<Account>(
   *   'SELECT Id, Name FROM Account'
   * )) {
   *   console.log(account.Name);
   * }
   * ```
   */
  queryAll<T extends SObjectRecord = SObjectRecord>(soql: string): AsyncGenerator<T, void, unknown>;

  /**
   * Get the execution plan for a SOQL query.
   * Useful for query optimization and performance analysis.
   *
   * @param soql - The SOQL query string to explain
   * @returns Promise resolving to the query execution plan
   *
   * @example
   * ```typescript
   * const plan = await queryService.explain(
   *   'SELECT Id, Name FROM Account WHERE Industry = \'Technology\''
   * );
   * console.log(`Leading operation: ${plan.plans[0].leadingOperationType}`);
   * console.log(`Relative cost: ${plan.plans[0].relativeCost}`);
   * ```
   */
  explain(soql: string): Promise<QueryExplainPlan>;

  /**
   * Execute a SOSL (Salesforce Object Search Language) search.
   *
   * @param sosl - The SOSL search string
   * @returns Promise resolving to search results
   *
   * @example
   * ```typescript
   * const results = await queryService.search(
   *   'FIND {Acme} IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Name)'
   * );
   * console.log(`Found ${results.searchRecords.length} records`);
   * ```
   */
  search(sosl: string): Promise<SearchResult>;
}

// ============================================================================
// Query Service Implementation
// ============================================================================

/**
 * Implementation of the QueryService interface.
 */
export class QueryServiceImpl implements QueryService {
  constructor(private readonly client: SalesforceClient) {}

  /**
   * Execute a SOQL query.
   */
  async query<T extends SObjectRecord = SObjectRecord>(soql: string): Promise<QueryResult<T>> {
    validateSOQL(soql);

    const startTime = Date.now();

    return this.client.tracer.withSpan(
      'salesforce.query',
      async (span) => {
        span.setAttribute('soql', soql);

        this.client.logger.debug('Executing SOQL query', { soql });

        try {
          // Execute query via GET with URL-encoded SOQL
          const result = await this.client.get<QueryResult<T>>('/query', {
            q: soql,
          });

          // Record metrics
          this.client.metrics.increment(MetricNames.SOQL_QUERIES_TOTAL, 1, {
            status: 'success',
          });
          this.client.metrics.timing(
            MetricNames.SOQL_QUERY_LATENCY,
            Date.now() - startTime
          );
          this.client.metrics.increment(
            MetricNames.RECORDS_QUERIED,
            result.records.length
          );

          span.setAttribute('totalSize', result.totalSize);
          span.setAttribute('recordCount', result.records.length);
          span.setAttribute('done', result.done);
          span.setStatus('OK');

          this.client.logger.debug('Query completed', {
            totalSize: result.totalSize,
            recordCount: result.records.length,
            done: result.done,
          });

          return result;
        } catch (error) {
          this.client.metrics.increment(MetricNames.SOQL_QUERIES_TOTAL, 1, {
            status: 'error',
          });
          span.recordException(error as Error);
          throw error;
        }
      }
    );
  }

  /**
   * Fetch the next batch of query results.
   */
  async queryMore<T extends SObjectRecord = SObjectRecord>(nextRecordsUrl: string): Promise<QueryResult<T>> {
    if (!nextRecordsUrl) {
      throw new Error('nextRecordsUrl is required');
    }

    const startTime = Date.now();

    return this.client.tracer.withSpan(
      'salesforce.queryMore',
      async (span) => {
        span.setAttribute('nextRecordsUrl', nextRecordsUrl);

        this.client.logger.debug('Fetching next batch of query results', {
          nextRecordsUrl,
        });

        try {
          // Extract the path from the nextRecordsUrl
          // nextRecordsUrl format: /services/data/vXX.0/query/xxxxx-xxxx
          const url = new URL(nextRecordsUrl, this.client.baseUrl);
          const path = url.pathname.replace(/^\/services\/data\/v[\d.]+/, '');

          const result = await this.client.get<QueryResult<T>>(path);

          // Record metrics
          this.client.metrics.increment(MetricNames.SOQL_QUERIES_TOTAL, 1, {
            status: 'success',
            type: 'queryMore',
          });
          this.client.metrics.timing(
            MetricNames.SOQL_QUERY_LATENCY,
            Date.now() - startTime,
            { type: 'queryMore' }
          );
          this.client.metrics.increment(
            MetricNames.RECORDS_QUERIED,
            result.records.length
          );

          span.setAttribute('recordCount', result.records.length);
          span.setAttribute('done', result.done);
          span.setStatus('OK');

          this.client.logger.debug('Query batch completed', {
            recordCount: result.records.length,
            done: result.done,
          });

          return result;
        } catch (error) {
          this.client.metrics.increment(MetricNames.SOQL_QUERIES_TOTAL, 1, {
            status: 'error',
            type: 'queryMore',
          });
          span.recordException(error as Error);
          throw error;
        }
      }
    );
  }

  /**
   * Stream all records from a SOQL query.
   */
  async *queryAll<T extends SObjectRecord = SObjectRecord>(
    soql: string
  ): AsyncGenerator<T, void, unknown> {
    validateSOQL(soql);

    this.client.logger.info('Starting queryAll stream', { soql });

    let totalRecords = 0;
    const startTime = Date.now();

    try {
      // Execute initial query
      let result = await this.query<T>(soql);

      // Yield all records from the first batch
      for (const record of result.records) {
        totalRecords++;
        yield record;
      }

      // Continue fetching batches until done
      while (!result.done && result.nextRecordsUrl) {
        result = await this.queryMore<T>(result.nextRecordsUrl);

        for (const record of result.records) {
          totalRecords++;
          yield record;
        }
      }

      this.client.logger.info('QueryAll stream completed', {
        totalRecords,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      this.client.logger.error('QueryAll stream failed', {
        error: (error as Error).message,
        totalRecordsProcessed: totalRecords,
      });
      throw error;
    }
  }

  /**
   * Get the execution plan for a SOQL query.
   */
  async explain(soql: string): Promise<QueryExplainPlan> {
    validateSOQL(soql);

    const startTime = Date.now();

    return this.client.tracer.withSpan(
      'salesforce.query.explain',
      async (span) => {
        span.setAttribute('soql', soql);

        this.client.logger.debug('Explaining SOQL query', { soql });

        try {
          // Execute explain via GET with explain parameter
          const result = await this.client.get<QueryExplainPlan>('/query', {
            explain: soql,
          });

          // Record metrics
          this.client.metrics.timing(
            MetricNames.SOQL_QUERY_LATENCY,
            Date.now() - startTime,
            { type: 'explain' }
          );

          span.setAttribute('planCount', result.plans.length);
          span.setStatus('OK');

          this.client.logger.debug('Query explain completed', {
            planCount: result.plans.length,
          });

          return result;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        }
      }
    );
  }

  /**
   * Execute a SOSL search.
   */
  async search(sosl: string): Promise<SearchResult> {
    validateSOSL(sosl);

    const startTime = Date.now();

    return this.client.tracer.withSpan(
      'salesforce.search',
      async (span) => {
        span.setAttribute('sosl', sosl);

        this.client.logger.debug('Executing SOSL search', { sosl });

        try {
          // Execute search via GET with q parameter
          const result = await this.client.get<SearchResult>('/search', {
            q: sosl,
          });

          // Record metrics
          this.client.metrics.increment(MetricNames.REQUESTS_TOTAL, 1, {
            operation: 'search',
            status: 'success',
          });
          this.client.metrics.timing(
            MetricNames.REQUEST_LATENCY,
            Date.now() - startTime,
            { operation: 'search' }
          );
          this.client.metrics.increment(
            MetricNames.RECORDS_QUERIED,
            result.searchRecords.length,
            { type: 'search' }
          );

          span.setAttribute('recordCount', result.searchRecords.length);
          span.setStatus('OK');

          this.client.logger.debug('Search completed', {
            recordCount: result.searchRecords.length,
          });

          return result;
        } catch (error) {
          this.client.metrics.increment(MetricNames.REQUESTS_TOTAL, 1, {
            operation: 'search',
            status: 'error',
          });
          span.recordException(error as Error);
          throw error;
        }
      }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate a SOQL query string.
 *
 * @param soql - The SOQL query to validate
 * @throws Error if the query is invalid
 */
function validateSOQL(soql: string): void {
  if (!soql || typeof soql !== 'string') {
    throw new Error('SOQL query must be a non-empty string');
  }

  const trimmed = soql.trim();
  if (trimmed.length === 0) {
    throw new Error('SOQL query cannot be empty');
  }

  // Basic validation: SOQL queries must start with SELECT
  if (!trimmed.toUpperCase().startsWith('SELECT')) {
    throw new Error('SOQL query must start with SELECT');
  }
}

/**
 * Validate a SOSL search string.
 *
 * @param sosl - The SOSL search to validate
 * @throws Error if the search is invalid
 */
function validateSOSL(sosl: string): void {
  if (!sosl || typeof sosl !== 'string') {
    throw new Error('SOSL search must be a non-empty string');
  }

  const trimmed = sosl.trim();
  if (trimmed.length === 0) {
    throw new Error('SOSL search cannot be empty');
  }

  // Basic validation: SOSL searches must start with FIND
  if (!trimmed.toUpperCase().startsWith('FIND')) {
    throw new Error('SOSL search must start with FIND');
  }
}

/**
 * URL-encode a SOQL query for use in GET requests.
 *
 * @param soql - The SOQL query to encode
 * @returns The URL-encoded query string
 */
export function encodeSOQL(soql: string): string {
  return encodeURIComponent(soql);
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new QueryService instance.
 *
 * @param client - The SalesforceClient instance
 * @returns A new QueryService instance
 *
 * @example
 * ```typescript
 * const client = createSalesforceClient(config);
 * const queryService = createQueryService(client);
 *
 * const accounts = await queryService.query<Account>(
 *   'SELECT Id, Name FROM Account LIMIT 10'
 * );
 * ```
 */
export function createQueryService(client: SalesforceClient): QueryService {
  return new QueryServiceImpl(client);
}
