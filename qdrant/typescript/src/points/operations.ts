/**
 * Point Operations Implementation for Qdrant
 *
 * Provides methods for managing points (vectors) in Qdrant collections:
 * - Upsert (insert/update) points
 * - Batch upsert with parallel processing
 * - Get points by ID
 * - Delete points by ID or filter
 * - Scroll through points with pagination
 * - Count points matching a filter
 */

import type {
  Point,
  PointId,
  UpsertResult,
  BatchUpsertResult,
  DeleteResult,
  ScrollOptions,
  ScrollResult,
  Filter,
  BatchOptions,
} from './types.js';
import { BatchProcessor } from './batch.js';

/**
 * HTTP client interface for making requests
 */
export interface HttpClient {
  /**
   * Send an HTTP request
   */
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: {
      params?: Record<string, string>;
      headers?: Record<string, string>;
    }
  ): Promise<T>;
}

/**
 * Point operations client configuration
 */
export interface PointsClientConfig {
  /**
   * HTTP client for making requests
   */
  httpClient: HttpClient;

  /**
   * Collection name for operations
   */
  collectionName: string;

  /**
   * Base URL for the Qdrant API
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Points operations client
 */
export class PointsClient {
  private readonly httpClient: HttpClient;
  private readonly collectionName: string;
  private readonly batchProcessor: BatchProcessor;

  constructor(config: PointsClientConfig) {
    this.httpClient = config.httpClient;
    this.collectionName = config.collectionName;
    this.batchProcessor = new BatchProcessor((points) => this.upsert(points));
  }

  /**
   * Upsert (insert or update) points in the collection
   *
   * @param points - Array of points to upsert
   * @returns Promise resolving to upsert result
   *
   * @example
   * ```typescript
   * const result = await client.upsert([
   *   {
   *     id: 1,
   *     vector: [0.1, 0.2, 0.3, 0.4],
   *     payload: { name: 'Document 1' }
   *   },
   *   {
   *     id: '550e8400-e29b-41d4-a716-446655440000',
   *     vector: [0.5, 0.6, 0.7, 0.8],
   *     payload: { name: 'Document 2' }
   *   }
   * ]);
   * ```
   */
  async upsert(points: Point[]): Promise<UpsertResult> {
    if (points.length === 0) {
      throw new Error('Points array cannot be empty');
    }

    const path = `/collections/${this.collectionName}/points`;
    const body = {
      points: points.map((point) => this.serializePoint(point)),
    };

    const response = await this.httpClient.request<{
      result: {
        operation_id: number;
        status: string;
      };
    }>('PUT', path, body);

    return {
      operationId: response.result.operation_id,
      status: response.result.status,
    };
  }

  /**
   * Upsert points in batches with parallel processing
   *
   * @param points - Array of points to upsert
   * @param batchSize - Number of points per batch (default: 100)
   * @returns Promise resolving to batch upsert result
   *
   * @example
   * ```typescript
   * const result = await client.upsertBatch(largePointsArray, 100, {
   *   maxConcurrency: 5,
   *   onProgress: (processed, total) => {
   *     console.log(`Progress: ${processed}/${total}`);
   *   }
   * });
   * ```
   */
  async upsertBatch(
    points: Point[],
    batchSize?: number,
    options?: Omit<BatchOptions, 'batchSize'>
  ): Promise<BatchUpsertResult> {
    if (points.length === 0) {
      return {
        totalPoints: 0,
        batchesProcessed: 0,
        results: [],
      };
    }

    return this.batchProcessor.processBatches(points, {
      ...options,
      batchSize,
    });
  }

  /**
   * Get points by their IDs
   *
   * @param ids - Array of point IDs to retrieve
   * @param withPayload - Whether to include payload (default: true)
   * @param withVectors - Whether to include vectors (default: true)
   * @returns Promise resolving to array of points
   *
   * @example
   * ```typescript
   * const points = await client.get([1, 2, 3]);
   * const pointsWithoutVectors = await client.get([1, 2], true, false);
   * ```
   */
  async get(
    ids: PointId[],
    withPayload = true,
    withVectors = true
  ): Promise<Point[]> {
    if (ids.length === 0) {
      return [];
    }

    const path = `/collections/${this.collectionName}/points`;
    const body = {
      ids: ids,
      with_payload: withPayload,
      with_vector: withVectors,
    };

    const response = await this.httpClient.request<{
      result: Array<{
        id: PointId;
        version?: number;
        vector?: unknown;
        payload?: Record<string, unknown>;
      }>;
    }>('POST', path, body);

    return response.result.map((item) => this.deserializePoint(item));
  }

  /**
   * Delete points by their IDs
   *
   * @param ids - Array of point IDs to delete
   * @returns Promise resolving to delete result
   *
   * @example
   * ```typescript
   * const result = await client.delete([1, 2, 3]);
   * ```
   */
  async delete(ids: PointId[]): Promise<DeleteResult> {
    if (ids.length === 0) {
      throw new Error('IDs array cannot be empty');
    }

    const path = `/collections/${this.collectionName}/points/delete`;
    const body = {
      points: ids,
    };

    const response = await this.httpClient.request<{
      result: {
        operation_id: number;
        status: string;
      };
    }>('POST', path, body);

    return {
      operationId: response.result.operation_id,
      status: response.result.status,
    };
  }

  /**
   * Delete points matching a filter
   *
   * @param filter - Filter to match points for deletion
   * @returns Promise resolving to delete result
   *
   * @example
   * ```typescript
   * const result = await client.deleteByFilter({
   *   must: [
   *     { key: 'status', match: { value: 'inactive' } }
   *   ]
   * });
   * ```
   */
  async deleteByFilter(filter: Filter): Promise<DeleteResult> {
    const path = `/collections/${this.collectionName}/points/delete`;
    const body = {
      filter: this.serializeFilter(filter),
    };

    const response = await this.httpClient.request<{
      result: {
        operation_id: number;
        status: string;
      };
    }>('POST', path, body);

    return {
      operationId: response.result.operation_id,
      status: response.result.status,
    };
  }

  /**
   * Scroll through points with pagination
   *
   * @param options - Scroll options including filter, limit, and offset
   * @returns Promise resolving to scroll result
   *
   * @example
   * ```typescript
   * // First page
   * const page1 = await client.scroll({ limit: 10 });
   *
   * // Next page
   * const page2 = await client.scroll({
   *   limit: 10,
   *   offset: page1.nextOffset
   * });
   *
   * // With filter
   * const filtered = await client.scroll({
   *   filter: {
   *     must: [
   *       { key: 'category', match: { value: 'news' } }
   *     ]
   *   },
   *   limit: 20
   * });
   * ```
   */
  async scroll(options: ScrollOptions = {}): Promise<ScrollResult> {
    const {
      filter,
      limit = 10,
      offset,
      withPayload = true,
      withVectors = false,
      orderBy,
    } = options;

    const path = `/collections/${this.collectionName}/points/scroll`;
    const body: Record<string, unknown> = {
      limit,
      with_payload: withPayload,
      with_vector: withVectors,
    };

    if (filter) {
      body.filter = this.serializeFilter(filter);
    }

    if (offset !== undefined) {
      body.offset = offset;
    }

    if (orderBy) {
      body.order_by = {
        key: orderBy.key,
        direction: orderBy.direction,
      };
    }

    const response = await this.httpClient.request<{
      result: {
        points: Array<{
          id: PointId;
          version?: number;
          vector?: unknown;
          payload?: Record<string, unknown>;
        }>;
        next_page_offset?: PointId;
      };
    }>('POST', path, body);

    return {
      points: response.result.points.map((item) => this.deserializePoint(item)),
      nextOffset: response.result.next_page_offset,
    };
  }

  /**
   * Count points matching a filter
   *
   * @param filter - Optional filter to count matching points
   * @returns Promise resolving to count of points
   *
   * @example
   * ```typescript
   * // Count all points
   * const total = await client.count();
   *
   * // Count points matching filter
   * const activeCount = await client.count({
   *   must: [
   *     { key: 'status', match: { value: 'active' } }
   *   ]
   * });
   * ```
   */
  async count(filter?: Filter): Promise<number> {
    const path = `/collections/${this.collectionName}/points/count`;
    const body: Record<string, unknown> = {
      exact: true,
    };

    if (filter) {
      body.filter = this.serializeFilter(filter);
    }

    const response = await this.httpClient.request<{
      result: {
        count: number;
      };
    }>('POST', path, body);

    return response.result.count;
  }

  /**
   * Serialize a point for the API
   */
  private serializePoint(point: Point): Record<string, unknown> {
    const serialized: Record<string, unknown> = {
      id: point.id,
      vector: point.vector,
    };

    if (point.payload) {
      serialized.payload = point.payload;
    }

    return serialized;
  }

  /**
   * Deserialize a point from the API response
   */
  private deserializePoint(data: {
    id: PointId;
    version?: number;
    vector?: unknown;
    payload?: Record<string, unknown>;
  }): Point {
    const point: Point = {
      id: data.id,
      vector: (data.vector || []) as Point['vector'],
    };

    if (data.payload) {
      point.payload = data.payload;
    }

    return point;
  }

  /**
   * Serialize a filter for the API
   */
  private serializeFilter(filter: Filter): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};

    if (filter.must && filter.must.length > 0) {
      serialized.must = filter.must;
    }

    if (filter.should && filter.should.length > 0) {
      serialized.should = filter.should;
    }

    if (filter.must_not && filter.must_not.length > 0) {
      serialized.must_not = filter.must_not;
    }

    return serialized;
  }
}

/**
 * Create a points client for a collection
 *
 * @param config - Client configuration
 * @returns PointsClient instance
 *
 * @example
 * ```typescript
 * const client = createPointsClient({
 *   httpClient: myHttpClient,
 *   collectionName: 'my_collection'
 * });
 * ```
 */
export function createPointsClient(config: PointsClientConfig): PointsClient {
  return new PointsClient(config);
}
