/**
 * Search Service
 *
 * Main service for executing search operations against Weaviate.
 * Supports vector search, text search, hybrid search, and BM25 keyword search.
 *
 * @module search/service
 */

import type {
  NearVectorQuery,
  NearObjectQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchResult,
} from '../types/search.js';
import type { SearchServiceConfig } from './types.js';
import { MetricNames, SpanNames, SpanAttributes } from '../observability/types.js';
import { parseSearchResult } from '../graphql/parser.js';
import {
  buildNearVectorQuery,
  validateNearVectorQuery,
  validateVectorDimensions,
} from './near-vector.js';
import {
  buildNearTextQuery,
  validateNearTextQuery,
  validateVectorizer,
} from './near-text.js';
import { buildHybridQuery, validateHybridQuery } from './hybrid.js';
import { GetQueryBuilder } from '../graphql/builder.js';
import { buildNearObjectClause, buildBm25Clause } from '../graphql/search-builder.js';

/**
 * Search service class
 *
 * Provides high-level search operations with validation, tracing, and metrics.
 *
 * @example
 * ```typescript
 * const searchService = new SearchService({
 *   graphqlExecutor,
 *   observability,
 *   schemaCache,
 *   resilience
 * });
 *
 * // Vector search
 * const results = await searchService.nearVector('Article', {
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10,
 *   certainty: 0.7
 * });
 * ```
 */
export class SearchService {
  private readonly graphqlExecutor: SearchServiceConfig['graphqlExecutor'];
  private readonly observability: SearchServiceConfig['observability'];
  private readonly schemaCache: SearchServiceConfig['schemaCache'];
  private readonly resilience: SearchServiceConfig['resilience'];

  /**
   * Creates a new search service instance
   *
   * @param config - Service configuration
   */
  constructor(config: SearchServiceConfig) {
    this.graphqlExecutor = config.graphqlExecutor;
    this.observability = config.observability;
    this.schemaCache = config.schemaCache;
    this.resilience = config.resilience;
  }

  /**
   * Executes a near vector search
   *
   * Finds objects similar to the provided query vector.
   *
   * @param className - Class name to search
   * @param query - Near vector query parameters
   * @returns Promise resolving to search results
   * @throws Error if validation fails or query execution fails
   *
   * @example
   * ```typescript
   * const results = await searchService.nearVector('Article', {
   *   vector: [0.1, 0.2, 0.3, ...],
   *   limit: 10,
   *   certainty: 0.7,
   *   properties: ['title', 'content'],
   *   includeVector: true
   * });
   * ```
   */
  async nearVector(
    className: string,
    query: NearVectorQuery
  ): Promise<SearchResult> {
    const span = this.observability.tracer.startSpan(SpanNames.NEAR_VECTOR, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.VECTOR_DIMENSION]: query.vector.length,
      [SpanAttributes.LIMIT]: query.limit,
    });

    const startTime = Date.now();

    try {
      // Validate query parameters
      validateNearVectorQuery(query);

      // Get schema and validate vector dimensions
      const schema = await this.schemaCache.getClass(className);
      const validation = validateVectorDimensions(query.vector, schema);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      span.setAttribute(SpanAttributes.VECTOR_DIMENSION, validation.actualDimensions!);

      // Build GraphQL query
      const graphqlQuery = buildNearVectorQuery(className, query);

      // Execute query with resilience
      const result = await this.resilience.execute(async () => {
        return await this.graphqlExecutor.execute<Record<string, unknown>>(
          graphqlQuery
        );
      });

      // Parse results
      const searchResult = parseSearchResult(result, className);

      // Record metrics
      const duration = Date.now() - startTime;
      this.observability.metrics.increment(MetricNames.SEARCH_NEAR_VECTOR);
      this.observability.metrics.histogram(
        MetricNames.SEARCH_LATENCY_MS,
        duration,
        { operation: 'near_vector', class: className }
      );

      span.setAttribute(SpanAttributes.RESULT_COUNT, searchResult.objects.length);
      span.setAttribute(SpanAttributes.DURATION_MS, duration);

      if (query.certainty !== undefined) {
        span.setAttribute(SpanAttributes.CERTAINTY, query.certainty);
      }
      if (query.distance !== undefined) {
        span.setAttribute(SpanAttributes.DISTANCE, query.distance);
      }

      span.end('ok');
      return searchResult;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      this.observability.metrics.increment(MetricNames.ERROR, 1, {
        operation: 'near_vector',
        class: className,
      });
      throw error;
    }
  }

  /**
   * Executes a near object search
   *
   * Finds objects similar to a reference object.
   *
   * @param className - Class name to search
   * @param query - Near object query parameters
   * @returns Promise resolving to search results
   * @throws Error if validation fails or query execution fails
   *
   * @example
   * ```typescript
   * const results = await searchService.nearObject('Article', {
   *   id: '123e4567-e89b-12d3-a456-426614174000' as UUID,
   *   limit: 10,
   *   certainty: 0.7
   * });
   * ```
   */
  async nearObject(
    className: string,
    query: NearObjectQuery
  ): Promise<SearchResult> {
    const span = this.observability.tracer.startSpan(SpanNames.NEAR_OBJECT, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.LIMIT]: query.limit,
    });

    const startTime = Date.now();

    try {
      // Validate query
      if (!query.id) {
        throw new Error('id is required for nearObject search');
      }
      if (typeof query.limit !== 'number' || query.limit < 1) {
        throw new Error('limit must be a positive number');
      }

      // Build GraphQL query
      const builder = new GetQueryBuilder(className);

      builder.nearObject(query.id, className, {
        certainty: query.certainty,
        distance: query.distance,
      });

      if (query.filter) {
        builder.where(query.filter);
      }

      builder.limit(query.limit);
      if (query.offset !== undefined && query.offset > 0) {
        builder.offset(query.offset);
      }

      if (query.tenant) {
        builder.tenant(query.tenant);
      }

      if (query.groupBy) {
        builder.groupBy(query.groupBy);
      }

      const properties = query.properties || [];
      builder.properties(properties);

      const additionalFields = ['id', 'distance', 'certainty'];
      if (query.includeVector) {
        additionalFields.push('vector');
      }
      builder.additional(additionalFields);

      const graphqlQuery = builder.build();

      // Execute query with resilience
      const result = await this.resilience.execute(async () => {
        return await this.graphqlExecutor.execute<Record<string, unknown>>(
          graphqlQuery
        );
      });

      // Parse results
      const searchResult = parseSearchResult(result, className);

      // Record metrics
      const duration = Date.now() - startTime;
      this.observability.metrics.increment(
        MetricNames.SEARCH_NEAR_OBJECT
      );
      this.observability.metrics.histogram(
        MetricNames.SEARCH_LATENCY_MS,
        duration,
        { operation: 'near_object', class: className }
      );

      span.setAttribute(SpanAttributes.RESULT_COUNT, searchResult.objects.length);
      span.setAttribute(SpanAttributes.DURATION_MS, duration);
      span.end('ok');

      return searchResult;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      this.observability.metrics.increment(MetricNames.ERROR, 1, {
        operation: 'near_object',
        class: className,
      });
      throw error;
    }
  }

  /**
   * Executes a near text search
   *
   * Semantic search using the class's configured vectorizer.
   *
   * @param className - Class name to search
   * @param query - Near text query parameters
   * @returns Promise resolving to search results
   * @throws Error if validation fails or query execution fails
   *
   * @example
   * ```typescript
   * const results = await searchService.nearText('Article', {
   *   concepts: ['artificial intelligence', 'machine learning'],
   *   limit: 10,
   *   certainty: 0.7,
   *   moveTo: {
   *     concepts: ['deep learning'],
   *     force: 0.5
   *   }
   * });
   * ```
   */
  async nearText(
    className: string,
    query: NearTextQuery
  ): Promise<SearchResult> {
    const span = this.observability.tracer.startSpan(SpanNames.NEAR_TEXT, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.LIMIT]: query.limit,
    });

    const startTime = Date.now();

    try {
      // Validate query parameters
      validateNearTextQuery(query);

      // Get schema and validate vectorizer
      const schema = await this.schemaCache.getClass(className);
      const validation = validateVectorizer(className, schema);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Build GraphQL query
      const graphqlQuery = buildNearTextQuery(className, query);

      // Execute query with resilience
      const result = await this.resilience.execute(async () => {
        return await this.graphqlExecutor.execute<Record<string, unknown>>(
          graphqlQuery
        );
      });

      // Parse results
      const searchResult = parseSearchResult(result, className);

      // Record metrics
      const duration = Date.now() - startTime;
      this.observability.metrics.increment(MetricNames.SEARCH_NEAR_TEXT);
      this.observability.metrics.histogram(
        MetricNames.SEARCH_LATENCY_MS,
        duration,
        { operation: 'near_text', class: className }
      );

      span.setAttribute(SpanAttributes.RESULT_COUNT, searchResult.objects.length);
      span.setAttribute(SpanAttributes.DURATION_MS, duration);
      span.end('ok');

      return searchResult;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      this.observability.metrics.increment(MetricNames.ERROR, 1, {
        operation: 'near_text',
        class: className,
      });
      throw error;
    }
  }

  /**
   * Executes a hybrid search
   *
   * Combines BM25 keyword search with vector similarity search.
   *
   * @param className - Class name to search
   * @param query - Hybrid query parameters
   * @returns Promise resolving to search results
   * @throws Error if validation fails or query execution fails
   *
   * @example
   * ```typescript
   * const results = await searchService.hybrid('Article', {
   *   query: 'machine learning',
   *   alpha: 0.5, // 50% vector, 50% BM25
   *   limit: 10,
   *   fusionType: FusionType.RankedFusion
   * });
   * ```
   */
  async hybrid(className: string, query: HybridQuery): Promise<SearchResult> {
    const span = this.observability.tracer.startSpan(SpanNames.HYBRID, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.LIMIT]: query.limit,
    });

    const startTime = Date.now();

    try {
      // Validate query parameters
      validateHybridQuery(query);

      // Build GraphQL query
      const graphqlQuery = buildHybridQuery(className, query);

      // Execute query with resilience
      const result = await this.resilience.execute(async () => {
        return await this.graphqlExecutor.execute<Record<string, unknown>>(
          graphqlQuery
        );
      });

      // Parse results
      const searchResult = parseSearchResult(result, className);

      // Record metrics
      const duration = Date.now() - startTime;
      this.observability.metrics.increment(MetricNames.SEARCH_HYBRID);
      this.observability.metrics.histogram(
        MetricNames.SEARCH_LATENCY_MS,
        duration,
        { operation: 'hybrid', class: className }
      );

      span.setAttribute(SpanAttributes.RESULT_COUNT, searchResult.objects.length);
      span.setAttribute(SpanAttributes.DURATION_MS, duration);
      span.end('ok');

      return searchResult;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      this.observability.metrics.increment(MetricNames.ERROR, 1, {
        operation: 'hybrid',
        class: className,
      });
      throw error;
    }
  }

  /**
   * Executes a BM25 keyword search
   *
   * Traditional keyword-based search using BM25 algorithm.
   *
   * @param className - Class name to search
   * @param query - BM25 query parameters
   * @returns Promise resolving to search results
   * @throws Error if validation fails or query execution fails
   *
   * @example
   * ```typescript
   * const results = await searchService.bm25('Article', {
   *   query: 'machine learning',
   *   properties: ['title', 'content'],
   *   limit: 10
   * });
   * ```
   */
  async bm25(className: string, query: BM25Query): Promise<SearchResult> {
    const span = this.observability.tracer.startSpan(SpanNames.BM25, {
      [SpanAttributes.CLASS_NAME]: className,
      [SpanAttributes.LIMIT]: query.limit,
    });

    const startTime = Date.now();

    try {
      // Validate query
      if (!query.query || typeof query.query !== 'string') {
        throw new Error('query must be a non-empty string');
      }
      if (query.query.trim() === '') {
        throw new Error('query cannot be empty');
      }
      if (typeof query.limit !== 'number' || query.limit < 1) {
        throw new Error('limit must be a positive number');
      }

      // Build GraphQL query
      const builder = new GetQueryBuilder(className);

      builder.bm25(query.query, query.properties);

      if (query.filter) {
        builder.where(query.filter);
      }

      builder.limit(query.limit);
      if (query.offset !== undefined && query.offset > 0) {
        builder.offset(query.offset);
      }

      if (query.tenant) {
        builder.tenant(query.tenant);
      }

      if (query.groupBy) {
        builder.groupBy(query.groupBy);
      }

      const properties = query.returnProperties || [];
      builder.properties(properties);

      const additionalFields = ['id', 'score'];
      if (query.includeVector) {
        additionalFields.push('vector');
      }
      builder.additional(additionalFields);

      const graphqlQuery = builder.build();

      // Execute query with resilience
      const result = await this.resilience.execute(async () => {
        return await this.graphqlExecutor.execute<Record<string, unknown>>(
          graphqlQuery
        );
      });

      // Parse results
      const searchResult = parseSearchResult(result, className);

      // Record metrics
      const duration = Date.now() - startTime;
      this.observability.metrics.increment(MetricNames.SEARCH_BM25);
      this.observability.metrics.histogram(
        MetricNames.SEARCH_LATENCY_MS,
        duration,
        { operation: 'bm25', class: className }
      );

      span.setAttribute(SpanAttributes.RESULT_COUNT, searchResult.objects.length);
      span.setAttribute(SpanAttributes.DURATION_MS, duration);
      span.end('ok');

      return searchResult;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      this.observability.metrics.increment(MetricNames.ERROR, 1, {
        operation: 'bm25',
        class: className,
      });
      throw error;
    }
  }
}

/**
 * Creates a search service instance
 *
 * @param config - Service configuration
 * @returns SearchService instance
 */
export function createSearchService(
  config: SearchServiceConfig
): SearchService {
  return new SearchService(config);
}
