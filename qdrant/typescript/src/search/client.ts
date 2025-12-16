/**
 * Search operations client for Qdrant vector database.
 *
 * This module provides comprehensive vector similarity search capabilities:
 * - KNN search with filtering and score thresholds
 * - Batch search for multiple queries
 * - Grouped search for diverse results
 * - Recommendation based on positive/negative examples
 * - Discovery with context pairs
 *
 * All operations support:
 * - Pre-filtering with boolean algebra
 * - Payload and vector selection
 * - HNSW parameter tuning
 * - Score thresholding
 *
 * @module search/client
 */

import type {
  SearchRequest,
  SearchGroupsRequest,
  RecommendRequest,
  DiscoverRequest,
  ScoredPoint,
  PointGroup,
  PayloadSelectorType,
  VectorSelectorType,
  Filter,
  SearchParams,
} from './types.js';

/**
 * HTTP client interface for making API requests.
 *
 * This interface defines the contract for the underlying HTTP transport.
 * Implementations should handle authentication, retries, and error mapping.
 */
export interface HttpClient {
  /**
   * Sends a POST request to the specified path.
   *
   * @param path - API endpoint path
   * @param body - Request body
   * @returns Response data
   */
  post<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse>;
}

/**
 * Options for configuring the search client.
 */
export interface SearchClientOptions {
  /** HTTP client for API requests. */
  httpClient: HttpClient;
  /** Collection name to operate on. */
  collectionName: string;
  /** Metrics collector for telemetry (optional). */
  metrics?: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    histogram(name: string, value: number, tags?: Record<string, string>): void;
    timing(name: string, value: number, tags?: Record<string, string>): void;
  };
  /** Logger for debug information (optional). */
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
  };
}

/**
 * Internal API request/response types for Qdrant REST API.
 * These map directly to the Qdrant API format.
 */

interface ApiSearchRequest {
  vector: number[] | { name: string; vector: number[] };
  limit: number;
  offset?: number;
  filter?: Filter;
  with_payload?: boolean | string[] | { include?: string[]; exclude?: string[] };
  with_vector?: boolean | string[];
  score_threshold?: number;
  params?: {
    hnsw_ef?: number;
    exact?: boolean;
    quantization?: { oversampling?: number };
  };
}

interface ApiScoredPoint {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: number[] | Record<string, number[]> | { indices: number[]; values: number[] };
  version?: number;
}

interface ApiSearchResponse {
  result: ApiScoredPoint[];
  status: string;
  time: number;
}

interface ApiSearchBatchRequest {
  searches: ApiSearchRequest[];
}

interface ApiSearchBatchResponse {
  result: ApiScoredPoint[][];
  status: string;
  time: number;
}

interface ApiSearchGroupsRequest {
  vector: number[] | { name: string; vector: number[] };
  group_by: string;
  group_size: number;
  limit: number;
  filter?: Filter;
  with_payload?: boolean | string[] | { include?: string[]; exclude?: string[] };
  with_vector?: boolean | string[];
  score_threshold?: number;
  params?: {
    hnsw_ef?: number;
    exact?: boolean;
    quantization?: { oversampling?: number };
  };
}

interface ApiPointGroup {
  id: string | number;
  hits: ApiScoredPoint[];
}

interface ApiSearchGroupsResponse {
  result: {
    groups: ApiPointGroup[];
  };
  status: string;
  time: number;
}

interface ApiRecommendRequest {
  positive: (string | number)[];
  negative?: (string | number)[];
  limit: number;
  filter?: Filter;
  with_payload?: boolean | string[] | { include?: string[]; exclude?: string[] };
  with_vector?: boolean | string[];
  score_threshold?: number;
  params?: {
    hnsw_ef?: number;
    exact?: boolean;
    quantization?: { oversampling?: number };
  };
  using?: string;
  strategy?: "average_vector" | "best_score";
}

interface ApiRecommendResponse {
  result: ApiScoredPoint[];
  status: string;
  time: number;
}

interface ApiDiscoverRequest {
  target?: string | number | number[];
  context?: Array<{ positive: string | number; negative: string | number }>;
  limit: number;
  filter?: Filter;
  with_payload?: boolean | string[] | { include?: string[]; exclude?: string[] };
  with_vector?: boolean | string[];
  score_threshold?: number;
  params?: {
    hnsw_ef?: number;
    exact?: boolean;
    quantization?: { oversampling?: number };
  };
  using?: string;
}

interface ApiDiscoverResponse {
  result: ApiScoredPoint[];
  status: string;
  time: number;
}

/**
 * Search client for Qdrant vector similarity operations.
 *
 * Provides methods for:
 * - Vector similarity search (KNN)
 * - Batch search for multiple queries
 * - Grouped search for diverse results
 * - Point-based recommendations
 * - Context-based discovery
 *
 * Features:
 * - Builder pattern for fluent request construction
 * - Automatic metric collection
 * - Debug logging for troubleshooting
 * - Type-safe API with comprehensive TypeScript definitions
 *
 * Performance considerations:
 * - Use batch search for multiple queries to reduce network overhead
 * - Apply filters to reduce search space
 * - Use score thresholds to limit results
 * - Tune HNSW parameters (hnswEf) for accuracy vs speed tradeoff
 *
 * @example
 * ```typescript
 * const client = new SearchClient({
 *   httpClient: myHttpClient,
 *   collectionName: 'my_vectors'
 * });
 *
 * // Simple search
 * const results = await client.search({
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10
 * });
 *
 * // Search with filter and score threshold
 * const filtered = await client.search({
 *   vector: queryVector,
 *   limit: 10,
 *   filter: {
 *     must: [{ key: 'category', match: 'electronics' }]
 *   },
 *   scoreThreshold: 0.7
 * });
 * ```
 */
export class SearchClient {
  private readonly httpClient: HttpClient;
  private readonly collectionName: string;
  private readonly metrics?: SearchClientOptions['metrics'];
  private readonly logger?: SearchClientOptions['logger'];

  /**
   * Creates a new search client.
   *
   * @param options - Client configuration options
   */
  constructor(options: SearchClientOptions) {
    this.httpClient = options.httpClient;
    this.collectionName = options.collectionName;
    this.metrics = options.metrics;
    this.logger = options.logger;
  }

  /**
   * Performs vector similarity search.
   *
   * Finds the most similar points to the given query vector using
   * approximate nearest neighbor search (HNSW index by default).
   *
   * The search can be filtered using boolean conditions on payload fields.
   * Results can be limited by similarity score threshold.
   *
   * @param request - Search request parameters
   * @returns Array of scored points ordered by similarity (highest first)
   *
   * @example
   * ```typescript
   * // Basic search
   * const results = await client.search({
   *   vector: [0.1, 0.2, 0.3, ...],
   *   limit: 10
   * });
   *
   * // Search with filter
   * const results = await client.search({
   *   vector: queryVector,
   *   limit: 10,
   *   filter: {
   *     must: [
   *       { key: 'status', match: 'active' },
   *       { key: 'price', range: { gte: 10, lte: 100 } }
   *     ]
   *   },
   *   scoreThreshold: 0.75,
   *   withPayload: true
   * });
   *
   * // Search specific named vector
   * const results = await client.search({
   *   vector: textEmbedding,
   *   limit: 5,
   *   vectorName: 'text-dense'
   * });
   * ```
   */
  async search(request: SearchRequest): Promise<ScoredPoint[]> {
    const startTime = Date.now();
    this.logger?.debug('Executing search', {
      collection: this.collectionName,
      limit: request.limit,
      hasFilter: !!request.filter,
      scoreThreshold: request.scoreThreshold,
    });

    // Build API request
    const apiRequest: ApiSearchRequest = {
      vector: request.vectorName
        ? { name: request.vectorName, vector: request.vector }
        : request.vector,
      limit: request.limit,
      offset: request.offset,
      filter: request.filter,
      with_payload: this.convertPayloadSelector(request.withPayload),
      with_vector: this.convertVectorSelector(request.withVectors),
      score_threshold: request.scoreThreshold,
      params: this.convertSearchParams(request.searchParams),
    };

    // Execute search
    const path = `/collections/${this.collectionName}/points/search`;
    const response = await this.httpClient.post<ApiSearchRequest, ApiSearchResponse>(
      path,
      apiRequest
    );

    const duration = Date.now() - startTime;

    // Record metrics
    this.metrics?.timing('qdrant.search.duration', duration, {
      collection: this.collectionName,
    });
    this.metrics?.histogram('qdrant.search.results', response.result.length, {
      collection: this.collectionName,
    });
    this.metrics?.increment('qdrant.search.total', 1, {
      collection: this.collectionName,
      status: response.status,
    });

    this.logger?.debug('Search completed', {
      collection: this.collectionName,
      resultsCount: response.result.length,
      duration,
    });

    // Convert to typed results
    return response.result.map((point) => this.convertScoredPoint(point));
  }

  /**
   * Performs batch search for multiple query vectors.
   *
   * Executes multiple search requests in a single API call, reducing
   * network overhead and improving throughput for batch operations.
   *
   * All searches are executed in parallel on the server side.
   *
   * @param requests - Array of search requests
   * @returns Array of result arrays (one per request, in same order)
   *
   * @example
   * ```typescript
   * const queries = [
   *   { vector: vector1, limit: 10 },
   *   { vector: vector2, limit: 10, scoreThreshold: 0.8 },
   *   { vector: vector3, limit: 5, filter: myFilter }
   * ];
   *
   * const results = await client.searchBatch(queries);
   * // results[0] contains results for vector1
   * // results[1] contains results for vector2
   * // results[2] contains results for vector3
   * ```
   */
  async searchBatch(requests: SearchRequest[]): Promise<ScoredPoint[][]> {
    const startTime = Date.now();
    this.logger?.debug('Executing batch search', {
      collection: this.collectionName,
      batchSize: requests.length,
    });

    // Build API request
    const searches: ApiSearchRequest[] = requests.map((req) => ({
      vector: req.vectorName
        ? { name: req.vectorName, vector: req.vector }
        : req.vector,
      limit: req.limit,
      offset: req.offset,
      filter: req.filter,
      with_payload: this.convertPayloadSelector(req.withPayload),
      with_vector: this.convertVectorSelector(req.withVectors),
      score_threshold: req.scoreThreshold,
      params: this.convertSearchParams(req.searchParams),
    }));

    const apiRequest: ApiSearchBatchRequest = { searches };

    // Execute batch search
    const path = `/collections/${this.collectionName}/points/search/batch`;
    const response = await this.httpClient.post<
      ApiSearchBatchRequest,
      ApiSearchBatchResponse
    >(path, apiRequest);

    const duration = Date.now() - startTime;

    // Record metrics
    this.metrics?.timing('qdrant.search_batch.duration', duration, {
      collection: this.collectionName,
    });
    this.metrics?.histogram('qdrant.search_batch.size', requests.length, {
      collection: this.collectionName,
    });
    this.metrics?.increment('qdrant.search_batch.total', 1, {
      collection: this.collectionName,
      status: response.status,
    });

    this.logger?.debug('Batch search completed', {
      collection: this.collectionName,
      batchSize: requests.length,
      duration,
    });

    // Convert to typed results
    return response.result.map((batch) =>
      batch.map((point) => this.convertScoredPoint(point))
    );
  }

  /**
   * Performs grouped search for diverse results.
   *
   * Searches for similar points but groups results by a specified payload field,
   * ensuring diverse results across different groups. Useful for:
   * - Deduplication (group by document_id, return top chunk per document)
   * - Category diversity (group by category, return top items per category)
   * - Author diversity (group by author, return top articles per author)
   *
   * @param request - Grouped search request parameters
   * @returns Array of point groups, each containing top-scoring points
   *
   * @example
   * ```typescript
   * // Get top 5 documents, with top 3 chunks per document
   * const groups = await client.searchGroups({
   *   vector: queryVector,
   *   groupBy: 'document_id',
   *   groupSize: 3,
   *   limit: 5
   * });
   *
   * for (const group of groups) {
   *   console.log(`Document ${group.id}:`);
   *   for (const hit of group.hits) {
   *     console.log(`  - Score: ${hit.score}, Chunk: ${hit.payload?.chunk}`);
   *   }
   * }
   * ```
   */
  async searchGroups(request: SearchGroupsRequest): Promise<PointGroup[]> {
    const startTime = Date.now();
    this.logger?.debug('Executing grouped search', {
      collection: this.collectionName,
      groupBy: request.groupBy,
      groupSize: request.groupSize,
      limit: request.limit,
    });

    // Build API request
    const apiRequest: ApiSearchGroupsRequest = {
      vector: request.vectorName
        ? { name: request.vectorName, vector: request.vector }
        : request.vector,
      group_by: request.groupBy,
      group_size: request.groupSize,
      limit: request.limit,
      filter: request.filter,
      with_payload: this.convertPayloadSelector(request.withPayload),
      with_vector: this.convertVectorSelector(request.withVectors),
      score_threshold: request.scoreThreshold,
      params: this.convertSearchParams(request.searchParams),
    };

    // Execute grouped search
    const path = `/collections/${this.collectionName}/points/search/groups`;
    const response = await this.httpClient.post<
      ApiSearchGroupsRequest,
      ApiSearchGroupsResponse
    >(path, apiRequest);

    const duration = Date.now() - startTime;

    // Record metrics
    this.metrics?.timing('qdrant.search_groups.duration', duration, {
      collection: this.collectionName,
    });
    this.metrics?.histogram('qdrant.search_groups.groups', response.result.groups.length, {
      collection: this.collectionName,
    });
    this.metrics?.increment('qdrant.search_groups.total', 1, {
      collection: this.collectionName,
      status: response.status,
    });

    this.logger?.debug('Grouped search completed', {
      collection: this.collectionName,
      groupsCount: response.result.groups.length,
      duration,
    });

    // Convert to typed results
    return response.result.groups.map((group) => ({
      id: group.id,
      hits: group.hits.map((point) => this.convertScoredPoint(point)),
    }));
  }

  /**
   * Performs point-based recommendations.
   *
   * Finds points similar to positive examples and dissimilar to negative examples.
   * The query vector is computed as the centroid of positive examples minus negative examples.
   *
   * Useful for:
   * - "More like this" features
   * - Content recommendations based on user interactions
   * - Similar product discovery
   *
   * @param request - Recommendation request parameters
   * @returns Array of recommended points ordered by score
   *
   * @example
   * ```typescript
   * // Recommend items similar to liked items, but not like disliked items
   * const recommendations = await client.recommend({
   *   positive: [123, 456, 789], // IDs of liked items
   *   negative: [999], // IDs of disliked items
   *   limit: 10,
   *   filter: {
   *     must: [{ key: 'in_stock', match: true }]
   *   }
   * });
   *
   * // Simple "more like this"
   * const similar = await client.recommend({
   *   positive: [itemId],
   *   limit: 5
   * });
   * ```
   */
  async recommend(request: RecommendRequest): Promise<ScoredPoint[]> {
    const startTime = Date.now();
    this.logger?.debug('Executing recommendation', {
      collection: this.collectionName,
      positiveCount: request.positive.length,
      negativeCount: request.negative?.length ?? 0,
      limit: request.limit,
    });

    // Build API request
    const apiRequest: ApiRecommendRequest = {
      positive: request.positive,
      negative: request.negative,
      limit: request.limit,
      filter: request.filter,
      with_payload: this.convertPayloadSelector(request.withPayload),
      with_vector: this.convertVectorSelector(request.withVectors),
      score_threshold: request.scoreThreshold,
      params: this.convertSearchParams(request.searchParams),
      using: request.vectorName,
      strategy: request.strategy,
    };

    // Execute recommendation
    const path = `/collections/${this.collectionName}/points/recommend`;
    const response = await this.httpClient.post<
      ApiRecommendRequest,
      ApiRecommendResponse
    >(path, apiRequest);

    const duration = Date.now() - startTime;

    // Record metrics
    this.metrics?.timing('qdrant.recommend.duration', duration, {
      collection: this.collectionName,
    });
    this.metrics?.histogram('qdrant.recommend.results', response.result.length, {
      collection: this.collectionName,
    });
    this.metrics?.increment('qdrant.recommend.total', 1, {
      collection: this.collectionName,
      status: response.status,
    });

    this.logger?.debug('Recommendation completed', {
      collection: this.collectionName,
      resultsCount: response.result.length,
      duration,
    });

    // Convert to typed results
    return response.result.map((point) => this.convertScoredPoint(point));
  }

  /**
   * Performs context-based discovery.
   *
   * More advanced than recommend - discovers points in a specific context
   * defined by positive-negative example pairs. Each pair defines a direction
   * in the vector space, and the discovery finds points that match all directions.
   *
   * Useful for:
   * - Fine-grained contextual search
   * - Multi-faceted similarity
   * - Style transfer discovery
   *
   * @param request - Discovery request parameters
   * @returns Array of discovered points ordered by score
   *
   * @example
   * ```typescript
   * // Discover items in a specific context
   * const discovered = await client.discover({
   *   target: targetPointId,
   *   context: [
   *     { positive: 'formal_example', negative: 'casual_example' },
   *     { positive: 'technical_example', negative: 'simple_example' }
   *   ],
   *   limit: 10
   * });
   *
   * // Discover with vector target
   * const discovered = await client.discover({
   *   target: queryVector,
   *   context: contextPairs,
   *   limit: 5
   * });
   * ```
   */
  async discover(request: DiscoverRequest): Promise<ScoredPoint[]> {
    const startTime = Date.now();
    this.logger?.debug('Executing discovery', {
      collection: this.collectionName,
      hasTarget: !!request.target,
      contextPairs: request.context?.length ?? 0,
      limit: request.limit,
    });

    // Build API request
    const apiRequest: ApiDiscoverRequest = {
      target: request.target,
      context: request.context?.map((pair) => ({
        positive: pair.positive,
        negative: pair.negative,
      })),
      limit: request.limit,
      filter: request.filter,
      with_payload: this.convertPayloadSelector(request.withPayload),
      with_vector: this.convertVectorSelector(request.withVectors),
      score_threshold: request.scoreThreshold,
      params: this.convertSearchParams(request.searchParams),
      using: request.vectorName,
    };

    // Execute discovery
    const path = `/collections/${this.collectionName}/points/discover`;
    const response = await this.httpClient.post<
      ApiDiscoverRequest,
      ApiDiscoverResponse
    >(path, apiRequest);

    const duration = Date.now() - startTime;

    // Record metrics
    this.metrics?.timing('qdrant.discover.duration', duration, {
      collection: this.collectionName,
    });
    this.metrics?.histogram('qdrant.discover.results', response.result.length, {
      collection: this.collectionName,
    });
    this.metrics?.increment('qdrant.discover.total', 1, {
      collection: this.collectionName,
      status: response.status,
    });

    this.logger?.debug('Discovery completed', {
      collection: this.collectionName,
      resultsCount: response.result.length,
      duration,
    });

    // Convert to typed results
    return response.result.map((point) => this.convertScoredPoint(point));
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Converts payload selector to API format.
   */
  private convertPayloadSelector(
    selector?: PayloadSelectorType
  ): boolean | string[] | { include?: string[]; exclude?: string[] } | undefined {
    if (selector === undefined) {
      return true; // Default: include all
    }

    if (typeof selector === 'boolean') {
      return selector;
    }

    if (Array.isArray(selector)) {
      return selector;
    }

    return {
      include: selector.include,
      exclude: selector.exclude,
    };
  }

  /**
   * Converts vector selector to API format.
   */
  private convertVectorSelector(
    selector?: VectorSelectorType
  ): boolean | string[] | undefined {
    if (selector === undefined) {
      return false; // Default: exclude vectors
    }

    return selector;
  }

  /**
   * Converts search params to API format.
   */
  private convertSearchParams(
    params?: SearchParams
  ):
    | {
        hnsw_ef?: number;
        exact?: boolean;
        quantization?: { oversampling?: number };
      }
    | undefined {
    if (!params) {
      return undefined;
    }

    return {
      hnsw_ef: params.hnswEf,
      exact: params.exact,
      quantization: params.quantizationOversampling
        ? { oversampling: params.quantizationOversampling }
        : undefined,
    };
  }

  /**
   * Converts API scored point to typed ScoredPoint.
   */
  private convertScoredPoint(point: ApiScoredPoint): ScoredPoint {
    return {
      id: point.id,
      score: point.score,
      payload: point.payload,
      vector: point.vector,
      version: point.version,
    };
  }
}

// ============================================================================
// Builder Pattern for Search Requests
// ============================================================================

/**
 * Builder for constructing SearchRequest objects with a fluent API.
 *
 * Provides a convenient way to build search requests with optional parameters.
 *
 * @example
 * ```typescript
 * const request = SearchRequestBuilder
 *   .create(queryVector, 10)
 *   .withFilter({ must: [{ key: 'status', match: 'active' }] })
 *   .withScoreThreshold(0.75)
 *   .withHnswEf(128)
 *   .withPayload(['title', 'description'])
 *   .build();
 *
 * const results = await client.search(request);
 * ```
 */
export class SearchRequestBuilder {
  private request: SearchRequest;

  private constructor(vector: number[], limit: number) {
    this.request = {
      vector,
      limit,
    };
  }

  /**
   * Creates a new search request builder.
   *
   * @param vector - Query vector
   * @param limit - Maximum number of results
   * @returns Builder instance
   */
  static create(vector: number[], limit: number): SearchRequestBuilder {
    return new SearchRequestBuilder(vector, limit);
  }

  /**
   * Sets the pagination offset.
   */
  withOffset(offset: number): this {
    this.request.offset = offset;
    return this;
  }

  /**
   * Sets the filter.
   */
  withFilter(filter: Filter): this {
    this.request.filter = filter;
    return this;
  }

  /**
   * Sets the payload selector.
   */
  withPayload(selector: PayloadSelectorType): this {
    this.request.withPayload = selector;
    return this;
  }

  /**
   * Sets the vector selector.
   */
  withVectors(selector: VectorSelectorType): this {
    this.request.withVectors = selector;
    return this;
  }

  /**
   * Sets the minimum score threshold.
   */
  withScoreThreshold(threshold: number): this {
    this.request.scoreThreshold = threshold;
    return this;
  }

  /**
   * Sets the HNSW ef parameter.
   */
  withHnswEf(ef: number): this {
    if (!this.request.searchParams) {
      this.request.searchParams = {};
    }
    this.request.searchParams.hnswEf = ef;
    return this;
  }

  /**
   * Enables exact search (bypasses HNSW index).
   */
  withExactSearch(exact = true): this {
    if (!this.request.searchParams) {
      this.request.searchParams = {};
    }
    this.request.searchParams.exact = exact;
    return this;
  }

  /**
   * Sets the vector name (for multi-vector collections).
   */
  withVectorName(name: string): this {
    this.request.vectorName = name;
    return this;
  }

  /**
   * Builds and returns the search request.
   */
  build(): SearchRequest {
    return this.request;
  }
}
