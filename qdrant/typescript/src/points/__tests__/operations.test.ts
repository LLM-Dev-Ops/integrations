/**
 * Point Operations Tests
 *
 * Unit tests for the PointsClient
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PointsClient, createPointsClient } from '../operations.js';
import type { HttpClient } from '../operations.js';
import type { Point, Filter } from '../types.js';

/**
 * Mock HTTP client for testing
 */
class MockHttpClient implements HttpClient {
  public requests: Array<{
    method: string;
    path: string;
    body?: unknown;
  }> = [];

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    this.requests.push({ method, path, body });

    // Mock successful response
    return {
      result: {
        operation_id: 1,
        status: 'acknowledged',
        points: [],
        count: 0,
      },
    } as T;
  }

  reset() {
    this.requests = [];
  }
}

describe('PointsClient', () => {
  let client: PointsClient;
  let httpClient: MockHttpClient;

  beforeEach(() => {
    httpClient = new MockHttpClient();
    client = createPointsClient({
      httpClient,
      collectionName: 'test_collection',
    });
  });

  describe('upsert', () => {
    it('should upsert points successfully', async () => {
      const points: Point[] = [
        {
          id: 1,
          vector: [0.1, 0.2, 0.3],
          payload: { name: 'test' },
        },
      ];

      const result = await client.upsert(points);

      expect(result).toHaveProperty('operationId');
      expect(result).toHaveProperty('status');
      expect(httpClient.requests).toHaveLength(1);
      expect(httpClient.requests[0]?.method).toBe('PUT');
      expect(httpClient.requests[0]?.path).toBe('/collections/test_collection/points');
    });

    it('should throw error for empty points array', async () => {
      await expect(client.upsert([])).rejects.toThrow('Points array cannot be empty');
    });

    it('should serialize points correctly', async () => {
      const points: Point[] = [
        {
          id: 'uuid-1',
          vector: [0.1, 0.2, 0.3, 0.4],
          payload: { category: 'test', count: 42 },
        },
      ];

      await client.upsert(points);

      const request = httpClient.requests[0];
      expect(request?.body).toHaveProperty('points');
      const body = request?.body as { points: unknown[] };
      expect(body.points).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('should get points by IDs', async () => {
      const ids = [1, 2, 3];
      await client.get(ids);

      expect(httpClient.requests).toHaveLength(1);
      expect(httpClient.requests[0]?.method).toBe('POST');
      expect(httpClient.requests[0]?.path).toBe('/collections/test_collection/points');

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.ids).toEqual(ids);
      expect(body.with_payload).toBe(true);
      expect(body.with_vector).toBe(true);
    });

    it('should respect withPayload parameter', async () => {
      await client.get([1], false, true);

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.with_payload).toBe(false);
    });

    it('should respect withVectors parameter', async () => {
      await client.get([1], true, false);

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.with_vector).toBe(false);
    });

    it('should return empty array for empty IDs', async () => {
      const result = await client.get([]);
      expect(result).toEqual([]);
      expect(httpClient.requests).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete points by IDs', async () => {
      const ids = [1, 2, 3];
      const result = await client.delete(ids);

      expect(result).toHaveProperty('operationId');
      expect(result).toHaveProperty('status');
      expect(httpClient.requests).toHaveLength(1);
      expect(httpClient.requests[0]?.method).toBe('POST');
      expect(httpClient.requests[0]?.path).toBe('/collections/test_collection/points/delete');

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.points).toEqual(ids);
    });

    it('should throw error for empty IDs array', async () => {
      await expect(client.delete([])).rejects.toThrow('IDs array cannot be empty');
    });
  });

  describe('deleteByFilter', () => {
    it('should delete points by filter', async () => {
      const filter: Filter = {
        must: [
          {
            key: 'status',
            match: { value: 'inactive' },
          },
        ],
      };

      const result = await client.deleteByFilter(filter);

      expect(result).toHaveProperty('operationId');
      expect(httpClient.requests).toHaveLength(1);
      expect(httpClient.requests[0]?.method).toBe('POST');

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body).toHaveProperty('filter');
    });
  });

  describe('scroll', () => {
    it('should scroll with default options', async () => {
      await client.scroll();

      expect(httpClient.requests).toHaveLength(1);
      expect(httpClient.requests[0]?.method).toBe('POST');
      expect(httpClient.requests[0]?.path).toBe('/collections/test_collection/points/scroll');

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.limit).toBe(10);
      expect(body.with_payload).toBe(true);
      expect(body.with_vector).toBe(false);
    });

    it('should apply custom options', async () => {
      await client.scroll({
        limit: 20,
        offset: 'point-123',
        withPayload: false,
        withVectors: true,
      });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.limit).toBe(20);
      expect(body.offset).toBe('point-123');
      expect(body.with_payload).toBe(false);
      expect(body.with_vector).toBe(true);
    });

    it('should include filter when provided', async () => {
      const filter: Filter = {
        must: [
          {
            key: 'category',
            match: { value: 'news' },
          },
        ],
      };

      await client.scroll({ filter });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body).toHaveProperty('filter');
      expect(body.filter).toHaveProperty('must');
    });

    it('should include orderBy when provided', async () => {
      await client.scroll({
        orderBy: {
          key: 'created_at',
          direction: 'desc',
        },
      });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body).toHaveProperty('order_by');
      const orderBy = body.order_by as Record<string, unknown>;
      expect(orderBy.key).toBe('created_at');
      expect(orderBy.direction).toBe('desc');
    });
  });

  describe('count', () => {
    it('should count all points without filter', async () => {
      await client.count();

      expect(httpClient.requests).toHaveLength(1);
      expect(httpClient.requests[0]?.method).toBe('POST');
      expect(httpClient.requests[0]?.path).toBe('/collections/test_collection/points/count');

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.exact).toBe(true);
      expect(body).not.toHaveProperty('filter');
    });

    it('should count points with filter', async () => {
      const filter: Filter = {
        must: [
          {
            key: 'active',
            match: { value: true },
          },
        ],
      };

      await client.count(filter);

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      expect(body.exact).toBe(true);
      expect(body).toHaveProperty('filter');
    });
  });

  describe('upsertBatch', () => {
    it('should handle empty points array', async () => {
      const result = await client.upsertBatch([]);

      expect(result.totalPoints).toBe(0);
      expect(result.batchesProcessed).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(httpClient.requests).toHaveLength(0);
    });

    it('should call onProgress callback', async () => {
      const points: Point[] = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      const onProgress = vi.fn();

      await client.upsertBatch(points, 10, { onProgress });

      expect(onProgress).toHaveBeenCalled();
      // Should be called multiple times as batches complete
      expect(onProgress.mock.calls.length).toBeGreaterThan(0);
    });

    it('should call onBatchComplete callback', async () => {
      const points: Point[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        vector: [0.1, 0.2],
      }));

      const onBatchComplete = vi.fn();

      await client.upsertBatch(points, 10, { onBatchComplete });

      expect(onBatchComplete).toHaveBeenCalled();
      expect(onBatchComplete.mock.calls.length).toBe(3); // 30 points / 10 batch size
    });
  });

  describe('filter serialization', () => {
    it('should serialize must conditions', async () => {
      const filter: Filter = {
        must: [
          {
            key: 'category',
            match: { value: 'news' },
          },
        ],
      };

      await client.scroll({ filter });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      const serializedFilter = body.filter as Record<string, unknown>;
      expect(serializedFilter).toHaveProperty('must');
    });

    it('should serialize should conditions', async () => {
      const filter: Filter = {
        should: [
          {
            key: 'featured',
            match: { value: true },
          },
        ],
      };

      await client.scroll({ filter });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      const serializedFilter = body.filter as Record<string, unknown>;
      expect(serializedFilter).toHaveProperty('should');
    });

    it('should serialize must_not conditions', async () => {
      const filter: Filter = {
        must_not: [
          {
            key: 'archived',
            match: { value: true },
          },
        ],
      };

      await client.scroll({ filter });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      const serializedFilter = body.filter as Record<string, unknown>;
      expect(serializedFilter).toHaveProperty('must_not');
    });

    it('should serialize complex filters', async () => {
      const filter: Filter = {
        must: [
          {
            key: 'views',
            range: { gte: 100, lte: 1000 },
          },
        ],
        should: [
          {
            key: 'featured',
            match: { value: true },
          },
        ],
        must_not: [
          {
            key: 'archived',
            match: { value: true },
          },
        ],
      };

      await client.scroll({ filter });

      const body = httpClient.requests[0]?.body as Record<string, unknown>;
      const serializedFilter = body.filter as Record<string, unknown>;
      expect(serializedFilter).toHaveProperty('must');
      expect(serializedFilter).toHaveProperty('should');
      expect(serializedFilter).toHaveProperty('must_not');
    });
  });
});
