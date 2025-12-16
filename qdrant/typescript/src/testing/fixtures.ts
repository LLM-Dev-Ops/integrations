/**
 * Test Fixtures for Qdrant Integration
 *
 * Provides helper functions to generate test data for Qdrant operations.
 */

import {
  Point,
  PointId,
  Payload,
  CollectionConfig,
  MockQdrantClient,
} from './mock.js';

/**
 * Generate a random vector of specified dimensions
 */
export function randomVector(dimensions: number): number[] {
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    vector.push(Math.random() * 2 - 1); // Random values between -1 and 1
  }
  return normalizeVector(vector);
}

/**
 * Normalize a vector to unit length (for cosine similarity)
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}

/**
 * Generate a test payload with common fields
 */
export function testPayload(overrides?: Partial<Payload>): Payload {
  return {
    content: 'Test document content',
    title: 'Test Document',
    category: 'testing',
    timestamp: Date.now(),
    metadata: {
      source: 'test',
      version: '1.0',
    },
    tags: ['test', 'fixture'],
    ...overrides,
  };
}

/**
 * Create a single test point
 */
export function createTestPoint(
  id: PointId,
  dimensions: number,
  payload?: Payload
): Point {
  return {
    id,
    vector: randomVector(dimensions),
    payload: payload || testPayload(),
  };
}

/**
 * Create multiple test points
 */
export function createTestPoints(count: number, dimensions: number): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    points.push(
      createTestPoint(
        i + 1,
        dimensions,
        testPayload({
          content: `Test document ${i + 1}`,
          index: i,
          category: i % 3 === 0 ? 'electronics' : i % 3 === 1 ? 'books' : 'clothing',
          price: Math.floor(Math.random() * 1000) + 10,
          rating: Math.random() * 5,
        })
      )
    );
  }

  return points;
}

/**
 * Create test points with similar vectors (for search testing)
 */
export function createSimilarPoints(
  baseVector: number[],
  count: number,
  similarity: number = 0.9
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    // Create a vector that is similar to the base vector
    const noise = randomVector(baseVector.length);
    const vector = baseVector.map((val, idx) => {
      return val * similarity + noise[idx] * (1 - similarity);
    });

    points.push({
      id: i + 1,
      vector: normalizeVector(vector),
      payload: testPayload({ similarity: similarity, index: i }),
    });
  }

  return points;
}

/**
 * Create a test collection with specified configuration
 */
export async function createTestCollection(
  client: MockQdrantClient,
  name: string,
  config?: Partial<CollectionConfig>
): Promise<void> {
  const collectionConfig: CollectionConfig = {
    vectorSize: 128,
    distance: 'Cosine',
    onDisk: false,
    ...config,
  };

  await client.collection(name).create(collectionConfig);
}

/**
 * Create and populate a test collection with points
 */
export async function createPopulatedCollection(
  client: MockQdrantClient,
  name: string,
  pointCount: number,
  dimensions: number = 128
): Promise<Point[]> {
  await createTestCollection(client, name, { vectorSize: dimensions });

  const points = createTestPoints(pointCount, dimensions);
  await client.collection(name).upsert(points);

  return points;
}

/**
 * Create test points with specific categories for filter testing
 */
export function createCategorizedPoints(
  categories: string[],
  pointsPerCategory: number,
  dimensions: number
): Point[] {
  const points: Point[] = [];
  let id = 1;

  for (const category of categories) {
    for (let i = 0; i < pointsPerCategory; i++) {
      points.push(
        createTestPoint(
          id++,
          dimensions,
          testPayload({
            category,
            categoryIndex: i,
            price: Math.floor(Math.random() * 1000) + 10,
          })
        )
      );
    }
  }

  return points;
}

/**
 * Create test points with time-based data for range filtering
 */
export function createTimeSeriesPoints(
  count: number,
  dimensions: number,
  startTime: number = Date.now() - 86400000 // 24 hours ago
): Point[] {
  const points: Point[] = [];
  const interval = 3600000; // 1 hour

  for (let i = 0; i < count; i++) {
    points.push(
      createTestPoint(
        i + 1,
        dimensions,
        testPayload({
          timestamp: startTime + i * interval,
          hour: i,
          value: Math.random() * 100,
        })
      )
    );
  }

  return points;
}

/**
 * Create test points with nested payload structures
 */
export function createNestedPayloadPoints(
  count: number,
  dimensions: number
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    points.push(
      createTestPoint(
        i + 1,
        dimensions,
        {
          title: `Document ${i + 1}`,
          metadata: {
            author: `Author ${i % 5}`,
            year: 2020 + (i % 5),
            tags: ['tag1', 'tag2'],
          },
          nested: {
            level1: {
              level2: {
                value: i * 10,
              },
            },
          },
          items: [
            { id: 1, name: 'Item 1', price: 10 },
            { id: 2, name: 'Item 2', price: 20 },
          ],
        }
      )
    );
  }

  return points;
}

/**
 * Create test points with multi-vector support
 */
export function createMultiVectorPoints(
  count: number,
  vectorConfigs: { [name: string]: number }
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    const vectors: { [name: string]: number[] } = {};

    for (const [name, dimensions] of Object.entries(vectorConfigs)) {
      vectors[name] = randomVector(dimensions);
    }

    points.push({
      id: i + 1,
      vector: vectors,
      payload: testPayload({ index: i }),
    });
  }

  return points;
}

/**
 * Create a query vector that should match specific test points
 */
export function createQueryVector(
  targetPoint: Point,
  similarity: number = 0.95
): number[] {
  if (!Array.isArray(targetPoint.vector)) {
    throw new Error('Target point must have a single vector');
  }

  const noise = randomVector(targetPoint.vector.length);
  const vector = targetPoint.vector.map((val: number, idx: number) => {
    const noiseVal = noise[idx];
    return val * similarity + (noiseVal ?? 0) * (1 - similarity);
  });

  return normalizeVector(vector);
}

/**
 * Generate a batch of search vectors
 */
export function createSearchVectorBatch(
  count: number,
  dimensions: number
): number[][] {
  const vectors: number[][] = [];

  for (let i = 0; i < count; i++) {
    vectors.push(randomVector(dimensions));
  }

  return vectors;
}

/**
 * Create test points with UUID identifiers
 */
export function createUuidPoints(count: number, dimensions: number): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    const uuid = `${Math.random().toString(36).substring(2, 15)}-${Math.random()
      .toString(36)
      .substring(2, 15)}`;

    points.push(
      createTestPoint(uuid, dimensions, testPayload({ index: i }))
    );
  }

  return points;
}

/**
 * Create a sparse distribution of vectors for clustering tests
 */
export function createClusteredPoints(
  clustersCount: number,
  pointsPerCluster: number,
  dimensions: number
): Point[] {
  const points: Point[] = [];
  let id = 1;

  for (let cluster = 0; cluster < clustersCount; cluster++) {
    // Create a cluster center
    const center = randomVector(dimensions);

    // Create points around the center
    for (let i = 0; i < pointsPerCluster; i++) {
      const noise = randomVector(dimensions);
      const vector = center.map((val, idx) => {
        return val * 0.9 + noise[idx] * 0.1;
      });

      points.push({
        id: id++,
        vector: normalizeVector(vector),
        payload: testPayload({
          cluster,
          clusterIndex: i,
        }),
      });
    }
  }

  return points;
}

/**
 * Create test data for RAG workflows
 */
export interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  content: string;
  vector: number[];
}

export function createDocumentChunks(
  documentCount: number,
  chunksPerDocument: number,
  dimensions: number
): Point[] {
  const points: Point[] = [];
  let id = 1;

  for (let doc = 0; doc < documentCount; doc++) {
    const documentId = `doc-${doc + 1}`;

    for (let chunk = 0; chunk < chunksPerDocument; chunk++) {
      points.push({
        id: id++,
        vector: randomVector(dimensions),
        payload: {
          documentId,
          chunkIndex: chunk,
          content: `Content for document ${doc + 1}, chunk ${chunk + 1}`,
          metadata: {
            title: `Document ${doc + 1}`,
            totalChunks: chunksPerDocument,
          },
        },
      });
    }
  }

  return points;
}

/**
 * Create test points with various data types for payload testing
 */
export function createVariedPayloadPoints(
  count: number,
  dimensions: number
): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < count; i++) {
    points.push(
      createTestPoint(
        i + 1,
        dimensions,
        {
          stringField: `value-${i}`,
          intField: i,
          floatField: i * 1.5,
          boolField: i % 2 === 0,
          nullField: i % 3 === 0 ? null : 'not-null',
          arrayField: [1, 2, 3, i],
          objectField: {
            nested: i,
            data: `nested-${i}`,
          },
        }
      )
    );
  }

  return points;
}

/**
 * Assert helper for test expectations
 */
export const assertions = {
  /**
   * Assert that a point exists in a collection
   */
  pointExists: (points: Point[], id: PointId): boolean => {
    return points.some((p) => p.id === id);
  },

  /**
   * Assert that search results are sorted by score
   */
  resultsSorted: (results: Array<{ score: number }>): boolean => {
    for (let i = 1; i < results.length; i++) {
      if (results[i].score > results[i - 1].score) {
        return false;
      }
    }
    return true;
  },

  /**
   * Assert that all results match a payload condition
   */
  allResultsMatch: (
    results: Array<{ payload?: Payload }>,
    key: string,
    value: any
  ): boolean => {
    return results.every((r) => r.payload && r.payload[key] === value);
  },

  /**
   * Assert that scores are within a threshold
   */
  scoresAboveThreshold: (
    results: Array<{ score: number }>,
    threshold: number
  ): boolean => {
    return results.every((r) => r.score >= threshold);
  },
};

/**
 * Benchmarking helper
 */
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();

  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);

    return result;
  }

  getStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  reset(): void {
    this.measurements.clear();
  }
}
