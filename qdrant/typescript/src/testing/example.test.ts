/**
 * Example Test Suite for Qdrant Mock Client
 *
 * Demonstrates comprehensive usage of the mock client and fixtures.
 */

import {
  createMockQdrantClient,
  MockQdrantClient,
  createTestPoints,
  createPopulatedCollection,
  createCategorizedPoints,
  createQueryVector,
  createDocumentChunks,
  randomVector,
  assertions,
  PerformanceTracker,
} from './index';

describe('MockQdrantClient', () => {
  let client: MockQdrantClient;

  beforeEach(() => {
    client = createMockQdrantClient();
  });

  afterEach(() => {
    client.reset();
  });

  describe('Collection Operations', () => {
    it('should create a collection', async () => {
      await client.collection('test').create({
        vectorSize: 128,
        distance: 'Cosine',
      });

      const exists = await client.collection('test').exists();
      expect(exists).toBe(true);
    });

    it('should throw error for duplicate collection', async () => {
      await client.collection('test').create({ vectorSize: 128 });

      await expect(
        client.collection('test').create({ vectorSize: 128 })
      ).rejects.toThrow('already exists');
    });

    it('should get collection info', async () => {
      await client.collection('test').create({
        vectorSize: 128,
        distance: 'Cosine',
      });

      const info = await client.collection('test').info();

      expect(info.name).toBe('test');
      expect(info.status).toBe('green');
      expect(info.config.vectorSize).toBe(128);
      expect(info.config.distance).toBe('Cosine');
    });

    it('should list collections', async () => {
      await client.collection('collection1').create({ vectorSize: 128 });
      await client.collection('collection2').create({ vectorSize: 256 });

      const collections = await client.listCollections();

      expect(collections).toHaveLength(2);
      expect(collections.map((c) => c.name)).toContain('collection1');
      expect(collections.map((c) => c.name)).toContain('collection2');
    });

    it('should delete a collection', async () => {
      await client.collection('test').create({ vectorSize: 128 });
      await client.collection('test').delete();

      const exists = await client.collection('test').exists();
      expect(exists).toBe(false);
    });
  });

  describe('Point Operations', () => {
    beforeEach(async () => {
      await client.collection('test').create({
        vectorSize: 128,
        distance: 'Cosine',
      });
    });

    it('should upsert points', async () => {
      const points = createTestPoints(10, 128);

      const result = await client.collection('test').upsert(points);

      expect(result.status).toBe('completed');
      expect(result.operationId).toBeGreaterThan(0);

      const count = await client.collection('test').count();
      expect(count).toBe(10);
    });

    it('should validate vector dimensions', async () => {
      const points = createTestPoints(1, 256); // Wrong dimension

      await expect(
        client.collection('test').upsert(points)
      ).rejects.toThrow('dimension mismatch');
    });

    it('should get points by ID', async () => {
      const points = createTestPoints(10, 128);
      await client.collection('test').upsert(points);

      const retrieved = await client.collection('test').get([1, 2, 3]);

      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].id).toBe(1);
      expect(retrieved[1].id).toBe(2);
      expect(retrieved[2].id).toBe(3);
    });

    it('should delete points by ID', async () => {
      const points = createTestPoints(10, 128);
      await client.collection('test').upsert(points);

      await client.collection('test').delete([1, 2, 3]);

      const count = await client.collection('test').count();
      expect(count).toBe(7);
    });

    it('should delete points by filter', async () => {
      const points = createCategorizedPoints(['electronics', 'books'], 5, 128);
      await client.collection('test').upsert(points);

      await client.collection('test').deleteByFilter({
        must: [{ key: 'category', match: { value: 'electronics' } }],
      });

      const count = await client.collection('test').count();
      expect(count).toBe(5); // Only 'books' remain
    });

    it('should scroll through points', async () => {
      const points = createTestPoints(100, 128);
      await client.collection('test').upsert(points);

      const result = await client.collection('test').scroll({
        limit: 10,
        withPayload: true,
        withVector: false,
      });

      expect(result.points).toHaveLength(10);
      expect(result.points[0].payload).toBeDefined();
      expect(result.points[0].vector).toBeUndefined();
      expect(result.nextOffset).toBeDefined();
    });

    it('should count points with filter', async () => {
      const points = createCategorizedPoints(
        ['electronics', 'books', 'clothing'],
        10,
        128
      );
      await client.collection('test').upsert(points);

      const count = await client.collection('test').count({
        must: [{ key: 'category', match: { value: 'electronics' } }],
      });

      expect(count).toBe(10);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await client.collection('test').create({
        vectorSize: 128,
        distance: 'Cosine',
      });
    });

    it('should perform basic search', async () => {
      const points = createTestPoints(50, 128);
      await client.collection('test').upsert(points);

      const results = await client.collection('test').search({
        vector: points[0].vector as number[],
        limit: 10,
      });

      expect(results).toHaveLength(10);
      expect(results[0].id).toBe(points[0].id); // Should find itself
      expect(results[0].score).toBeGreaterThan(0.99); // Nearly perfect match
      expect(assertions.resultsSorted(results)).toBe(true);
    });

    it('should search with score threshold', async () => {
      const points = createTestPoints(50, 128);
      await client.collection('test').upsert(points);

      const results = await client.collection('test').search({
        vector: randomVector(128),
        limit: 50,
        scoreThreshold: 0.8,
      });

      expect(assertions.scoresAboveThreshold(results, 0.8)).toBe(true);
    });

    it('should search with filter', async () => {
      const points = createCategorizedPoints(['electronics', 'books'], 25, 128);
      await client.collection('test').upsert(points);

      const results = await client.collection('test').search({
        vector: randomVector(128),
        limit: 10,
        filter: {
          must: [{ key: 'category', match: { value: 'electronics' } }],
        },
      });

      expect(
        assertions.allResultsMatch(results, 'category', 'electronics')
      ).toBe(true);
    });

    it('should search with range filter', async () => {
      const points = createTestPoints(100, 128);
      await client.collection('test').upsert(points);

      const results = await client.collection('test').search({
        vector: randomVector(128),
        limit: 50,
        filter: {
          must: [{ key: 'price', range: { gte: 100, lte: 500 } }],
        },
      });

      results.forEach((result) => {
        expect(result.payload?.price).toBeGreaterThanOrEqual(100);
        expect(result.payload?.price).toBeLessThanOrEqual(500);
      });
    });

    it('should search with complex filter', async () => {
      const points = createTestPoints(100, 128);
      await client.collection('test').upsert(points);

      const results = await client.collection('test').search({
        vector: randomVector(128),
        limit: 20,
        filter: {
          must: [{ key: 'price', range: { gte: 100 } }],
          should: [
            { key: 'category', match: { value: 'electronics' } },
            { key: 'category', match: { value: 'books' } },
          ],
          mustNot: [{ key: 'index', match: { value: 0 } }],
        },
      });

      results.forEach((result) => {
        expect(result.payload?.price).toBeGreaterThanOrEqual(100);
        expect(result.payload?.index).not.toBe(0);
        expect(['electronics', 'books', 'clothing']).toContain(
          result.payload?.category
        );
      });
    });

    it('should perform batch search', async () => {
      const points = createTestPoints(50, 128);
      await client.collection('test').upsert(points);

      const requests = [
        { vector: randomVector(128), limit: 5 },
        { vector: randomVector(128), limit: 5 },
        { vector: randomVector(128), limit: 5 },
      ];

      const results = await client.collection('test').searchBatch(requests);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(5);
      expect(results[1]).toHaveLength(5);
      expect(results[2]).toHaveLength(5);
    });

    it('should find similar vectors', async () => {
      const points = createTestPoints(50, 128);
      await client.collection('test').upsert(points);

      const queryVector = createQueryVector(points[0], 0.95);
      const results = await client.collection('test').search({
        vector: queryVector,
        limit: 5,
      });

      expect(results[0].id).toBe(points[0].id);
      expect(results[0].score).toBeGreaterThan(0.9);
    });
  });

  describe('Distance Metrics', () => {
    it('should calculate cosine similarity', async () => {
      await client.collection('test').create({
        vectorSize: 3,
        distance: 'Cosine',
      });

      await client.collection('test').upsert([
        { id: 1, vector: [1, 0, 0] },
        { id: 2, vector: [1, 1, 0] },
      ]);

      const results = await client.collection('test').search({
        vector: [1, 0, 0],
        limit: 2,
      });

      expect(results[0].id).toBe(1); // Perfect match
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('should calculate euclidean distance', async () => {
      await client.collection('test').create({
        vectorSize: 3,
        distance: 'Euclidean',
      });

      await client.collection('test').upsert([
        { id: 1, vector: [1, 0, 0] },
        { id: 2, vector: [0, 1, 0] },
      ]);

      const results = await client.collection('test').search({
        vector: [1, 0, 0],
        limit: 2,
      });

      expect(results[0].id).toBe(1); // Closest point
    });
  });

  describe('RAG Workflows', () => {
    it('should retrieve document chunks', async () => {
      await client.collection('docs').create({
        vectorSize: 128,
        distance: 'Cosine',
      });

      const chunks = createDocumentChunks(5, 10, 128);
      await client.collection('docs').upsert(chunks);

      // Search for chunks
      const results = await client.collection('docs').search({
        vector: randomVector(128),
        limit: 5,
        filter: {
          must: [{ key: 'documentId', match: { value: 'doc-1' } }],
        },
      });

      expect(
        assertions.allResultsMatch(results, 'documentId', 'doc-1')
      ).toBe(true);
    });

    it('should retrieve chunks with context window', async () => {
      await client.collection('docs').create({
        vectorSize: 128,
        distance: 'Cosine',
      });

      const chunks = createDocumentChunks(1, 20, 128);
      await client.collection('docs').upsert(chunks);

      // Find a specific chunk
      const targetChunk = chunks[10];
      const results = await client.collection('docs').search({
        vector: targetChunk.vector as number[],
        limit: 1,
      });

      // Get surrounding chunks
      const chunkIndex = results[0].payload?.chunkIndex as number;
      const documentId = results[0].payload?.documentId as string;

      const contextResults = await client.collection('docs').scroll({
        filter: {
          must: [
            { key: 'documentId', match: { value: documentId } },
            {
              key: 'chunkIndex',
              range: {
                gte: chunkIndex - 2,
                lte: chunkIndex + 2,
              },
            },
          ],
        },
      });

      expect(contextResults.points.length).toBeLessThanOrEqual(5); // ±2 chunks
    });
  });

  describe('Operation Logging', () => {
    it('should log all operations', async () => {
      await client.collection('test').create({ vectorSize: 128 });

      const points = createTestPoints(10, 128);
      await client.collection('test').upsert(points);

      await client.collection('test').search({
        vector: randomVector(128),
        limit: 5,
      });

      const log = client.getOperationLog();

      expect(log).toHaveLength(3);
      expect(log[0].type).toBe('collection.create');
      expect(log[1].type).toBe('points.upsert');
      expect(log[2].type).toBe('search');
    });

    it('should clear operation log', async () => {
      await client.collection('test').create({ vectorSize: 128 });

      expect(client.getOperationLog()).toHaveLength(1);

      client.clearOperationLog();

      expect(client.getOperationLog()).toHaveLength(0);
    });
  });

  describe('Latency Simulation', () => {
    it('should simulate latency', async () => {
      const slowClient = createMockQdrantClient().withSimulatedLatency(50);

      await slowClient.collection('test').create({ vectorSize: 128 });

      const start = Date.now();
      await slowClient.healthCheck();
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(45); // Allow some variance
    });
  });

  describe('Performance Tracking', () => {
    it('should track operation performance', async () => {
      const tracker = new PerformanceTracker();
      const points = await createPopulatedCollection(client, 'test', 100, 128);

      // Perform multiple searches
      for (let i = 0; i < 10; i++) {
        await tracker.measure('search', () =>
          client.collection('test').search({
            vector: randomVector(128),
            limit: 10,
          })
        );
      }

      const stats = tracker.getStats('search');

      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(10);
      expect(stats!.avg).toBeGreaterThan(0);
      expect(stats!.p95).toBeGreaterThanOrEqual(stats!.p50);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const status = await client.healthCheck();

      expect(status.title).toBe('qdrant-mock');
      expect(status.version).toBe('1.0.0');
      expect(status.status).toBe('ok');
    });
  });
});
