/**
 * Mock Qdrant Client for Testing
 *
 * Provides in-memory simulation of Qdrant operations for testing purposes.
 * Implements the same interface as QdrantClient but stores data in memory.
 */

import { EventEmitter } from 'events';

// Types
export type PointId = string | number;

export interface Vector {
  values: number[];
}

export interface Payload {
  [key: string]: any;
}

export interface Point {
  id: PointId;
  vector: number[] | { [vectorName: string]: number[] };
  payload?: Payload;
}

export interface ScoredPoint {
  id: PointId;
  score: number;
  payload?: Payload;
  vector?: number[] | { [vectorName: string]: number[] };
}

export interface CollectionConfig {
  vectorSize?: number;
  distance?: 'Cosine' | 'Euclidean' | 'Dot' | 'Manhattan';
  onDisk?: boolean;
  hnswConfig?: {
    m?: number;
    efConstruct?: number;
  };
  vectors?: {
    [name: string]: {
      size: number;
      distance?: 'Cosine' | 'Euclidean' | 'Dot' | 'Manhattan';
    };
  };
  shardNumber?: number;
  replicationFactor?: number;
}

export interface CollectionInfo {
  name: string;
  status: 'green' | 'yellow' | 'red';
  vectorsCount: number;
  pointsCount: number;
  segmentsCount: number;
  config: CollectionConfig;
}

export interface SearchRequest {
  vector: number[];
  limit: number;
  offset?: number;
  filter?: Filter;
  withPayload?: boolean | string[];
  withVector?: boolean | string[];
  scoreThreshold?: number;
  vectorName?: string;
}

export interface Filter {
  must?: Condition[];
  should?: Condition[];
  mustNot?: Condition[];
}

export interface Condition {
  key?: string;
  match?: { value: any } | { any: any[] };
  range?: {
    gte?: number;
    lte?: number;
    gt?: number;
    lt?: number;
  };
  hasId?: PointId[];
  isNull?: boolean;
  isEmpty?: boolean;
  nested?: {
    key: string;
    filter: Filter;
  };
}

export interface ScrollOptions {
  filter?: Filter;
  limit?: number;
  offset?: PointId;
  withPayload?: boolean | string[];
  withVector?: boolean | string[];
}

export interface ScrollResult {
  points: Point[];
  nextOffset?: PointId;
}

export interface UpsertResult {
  operationId: number;
  status: 'completed' | 'pending';
}

export interface DeleteResult {
  operationId: number;
  status: 'completed' | 'pending';
}

export interface HealthStatus {
  title: string;
  version: string;
  status: 'ok' | 'error';
}

export interface Operation {
  type: string;
  collection?: string;
  timestamp: number;
  params?: any;
  result?: any;
}

// Mock Collection
interface MockCollection {
  config: CollectionConfig;
  points: Map<PointId, Point>;
}

// Mock Collection Client
export class MockCollectionClient {
  constructor(
    private client: MockQdrantClient,
    private collectionName: string
  ) {}

  async create(config: CollectionConfig): Promise<void> {
    this.client.logOperation('collection.create', this.collectionName, { config });
    await this.client.simulateLatency();

    if (this.client.collections.has(this.collectionName)) {
      throw new Error(`Collection '${this.collectionName}' already exists`);
    }

    this.client.collections.set(this.collectionName, {
      config,
      points: new Map(),
    });
  }

  async info(): Promise<CollectionInfo> {
    this.client.logOperation('collection.info', this.collectionName);
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);

    return {
      name: this.collectionName,
      status: 'green',
      vectorsCount: collection.points.size,
      pointsCount: collection.points.size,
      segmentsCount: 1,
      config: collection.config,
    };
  }

  async exists(): Promise<boolean> {
    this.client.logOperation('collection.exists', this.collectionName);
    await this.client.simulateLatency();
    return this.client.collections.has(this.collectionName);
  }

  async deleteCollection(): Promise<void> {
    this.client.logOperation('collection.delete', this.collectionName);
    await this.client.simulateLatency();

    if (!this.client.collections.has(this.collectionName)) {
      throw new Error(`Collection '${this.collectionName}' not found`);
    }

    this.client.collections.delete(this.collectionName);
  }

  async upsert(points: Point[]): Promise<UpsertResult> {
    this.client.logOperation('points.upsert', this.collectionName, {
      pointCount: points.length,
    });
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);

    // Validate vector dimensions
    for (const point of points) {
      this.validatePoint(point, collection.config);
      collection.points.set(point.id, point);
    }

    return {
      operationId: this.client.nextOperationId++,
      status: 'completed',
    };
  }

  async get(ids: PointId[]): Promise<Point[]> {
    this.client.logOperation('points.get', this.collectionName, { ids });
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);
    const points: Point[] = [];

    for (const id of ids) {
      const point = collection.points.get(id);
      if (point) {
        points.push(point);
      }
    }

    return points;
  }

  async deletePoints(ids: PointId[]): Promise<DeleteResult> {
    this.client.logOperation('points.delete', this.collectionName, { ids });
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);

    for (const id of ids) {
      collection.points.delete(id);
    }

    return {
      operationId: this.client.nextOperationId++,
      status: 'completed',
    };
  }

  async deleteByFilter(filter: Filter): Promise<DeleteResult> {
    this.client.logOperation('points.deleteByFilter', this.collectionName, { filter });
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);
    const toDelete: PointId[] = [];

    for (const [id, point] of collection.points) {
      if (this.evaluateFilter(point, filter)) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      collection.points.delete(id);
    }

    return {
      operationId: this.client.nextOperationId++,
      status: 'completed',
    };
  }

  async scroll(options: ScrollOptions = {}): Promise<ScrollResult> {
    this.client.logOperation('points.scroll', this.collectionName, options);
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);
    const limit = options.limit || 100;
    const points: Point[] = [];
    let nextOffset: PointId | undefined;

    let skipUntilOffset = !!options.offset;
    let count = 0;

    for (const [id, point] of collection.points) {
      // Skip until we reach the offset
      if (skipUntilOffset) {
        if (id === options.offset) {
          skipUntilOffset = false;
        }
        continue;
      }

      // Apply filter if provided
      if (options.filter && !this.evaluateFilter(point, options.filter)) {
        continue;
      }

      points.push(this.formatPoint(point, options));
      count++;

      if (count >= limit) {
        // Set next offset to the next point ID
        const pointsArray = Array.from(collection.points.keys());
        const currentIndex = pointsArray.indexOf(id);
        if (currentIndex >= 0 && currentIndex < pointsArray.length - 1) {
          nextOffset = pointsArray[currentIndex + 1];
        }
        break;
      }
    }

    return { points, nextOffset };
  }

  async count(filter?: Filter): Promise<number> {
    this.client.logOperation('points.count', this.collectionName, { filter });
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);

    if (!filter) {
      return collection.points.size;
    }

    let count = 0;
    for (const point of collection.points.values()) {
      if (this.evaluateFilter(point, filter)) {
        count++;
      }
    }

    return count;
  }

  async search(request: SearchRequest): Promise<ScoredPoint[]> {
    this.client.logOperation('search', this.collectionName, {
      limit: request.limit,
      hasFilter: !!request.filter,
    });
    await this.client.simulateLatency();

    const collection = this.client.getCollection(this.collectionName);
    const results: ScoredPoint[] = [];

    // Get distance metric
    const distance = collection.config.distance || 'Cosine';

    for (const point of collection.points.values()) {
      // Apply filter if provided
      if (request.filter && !this.evaluateFilter(point, request.filter)) {
        continue;
      }

      // Calculate similarity score
      const pointVector = this.extractVector(point, request.vectorName);
      const score = this.calculateSimilarity(
        request.vector,
        pointVector,
        distance
      );

      // Apply score threshold
      if (request.scoreThreshold !== undefined && score < request.scoreThreshold) {
        continue;
      }

      results.push({
        id: point.id,
        score,
        payload: request.withPayload !== false ? point.payload : undefined,
        vector: request.withVector ? point.vector : undefined,
      });
    }

    // Sort by score (descending) and apply limit
    results.sort((a, b) => b.score - a.score);

    const offset = request.offset || 0;
    return results.slice(offset, offset + request.limit);
  }

  async searchBatch(requests: SearchRequest[]): Promise<ScoredPoint[][]> {
    this.client.logOperation('search.batch', this.collectionName, {
      batchSize: requests.length,
    });

    const results: ScoredPoint[][] = [];
    for (const request of requests) {
      results.push(await this.search(request));
    }

    return results;
  }

  // Helper methods
  private validatePoint(point: Point, config: CollectionConfig): void {
    if (Array.isArray(point.vector)) {
      if (config.vectorSize && point.vector.length !== config.vectorSize) {
        throw new Error(
          `Vector dimension mismatch: expected ${config.vectorSize}, got ${point.vector.length}`
        );
      }
    } else if (typeof point.vector === 'object' && config.vectors) {
      for (const [name, vector] of Object.entries(point.vector)) {
        const vectorConfig = config.vectors[name];
        if (!vectorConfig) {
          throw new Error(`Unknown vector name: ${name}`);
        }
        if (vector.length !== vectorConfig.size) {
          throw new Error(
            `Vector dimension mismatch for '${name}': expected ${vectorConfig.size}, got ${vector.length}`
          );
        }
      }
    }
  }

  private extractVector(point: Point, vectorName?: string): number[] {
    if (Array.isArray(point.vector)) {
      return point.vector;
    } else if (typeof point.vector === 'object') {
      const name = vectorName || Object.keys(point.vector)[0];
      return point.vector[name];
    }
    throw new Error('Invalid vector format');
  }

  private calculateSimilarity(
    a: number[],
    b: number[],
    distance: string
  ): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions do not match');
    }

    switch (distance) {
      case 'Cosine':
        return this.cosineSimilarity(a, b);
      case 'Euclidean':
        return 1 / (1 + this.euclideanDistance(a, b));
      case 'Dot':
        return this.dotProduct(a, b);
      case 'Manhattan':
        return 1 / (1 + this.manhattanDistance(a, b));
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProd = this.dotProduct(a, b);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProd / (magnitudeA * magnitudeB);
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(
      a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
    );
  }

  private manhattanDistance(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + Math.abs(val - b[i]), 0);
  }

  private evaluateFilter(point: Point, filter: Filter): boolean {
    const payload = point.payload || {};

    // Evaluate must conditions (all must be true)
    if (filter.must && filter.must.length > 0) {
      if (!filter.must.every((cond) => this.evaluateCondition(point, payload, cond))) {
        return false;
      }
    }

    // Evaluate mustNot conditions (all must be false)
    if (filter.mustNot && filter.mustNot.length > 0) {
      if (filter.mustNot.some((cond) => this.evaluateCondition(point, payload, cond))) {
        return false;
      }
    }

    // Evaluate should conditions (at least one must be true)
    if (filter.should && filter.should.length > 0) {
      if (!filter.should.some((cond) => this.evaluateCondition(point, payload, cond))) {
        return false;
      }
    }

    return true;
  }

  private evaluateCondition(point: Point, payload: Payload, condition: Condition): boolean {
    // HasId condition
    if (condition.hasId) {
      return condition.hasId.includes(point.id);
    }

    // Field conditions
    if (condition.key) {
      const value = this.getNestedValue(payload, condition.key);

      // Match condition
      if (condition.match) {
        if ('value' in condition.match) {
          return value === condition.match.value;
        }
        if ('any' in condition.match) {
          return condition.match.any.includes(value);
        }
      }

      // Range condition
      if (condition.range) {
        const numValue = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(numValue)) return false;

        if (condition.range.gte !== undefined && numValue < condition.range.gte) {
          return false;
        }
        if (condition.range.lte !== undefined && numValue > condition.range.lte) {
          return false;
        }
        if (condition.range.gt !== undefined && numValue <= condition.range.gt) {
          return false;
        }
        if (condition.range.lt !== undefined && numValue >= condition.range.lt) {
          return false;
        }
        return true;
      }

      // IsNull condition
      if (condition.isNull !== undefined) {
        return condition.isNull ? value === null : value !== null;
      }

      // IsEmpty condition
      if (condition.isEmpty !== undefined) {
        return condition.isEmpty ? value === undefined : value !== undefined;
      }
    }

    // Nested condition
    if (condition.nested) {
      const nestedValue = this.getNestedValue(payload, condition.nested.key);
      if (Array.isArray(nestedValue)) {
        return nestedValue.some((item) =>
          this.evaluateFilter({ id: point.id, vector: [], payload: item }, condition.nested!.filter)
        );
      }
    }

    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  private formatPoint(point: Point, options: ScrollOptions): Point {
    const result: Partial<Point> & { id: PointId } = {
      id: point.id,
    };

    if (options.withVector !== false) {
      result.vector = point.vector;
    }

    if (options.withPayload !== false) {
      result.payload = point.payload;
    }

    return result as Point;
  }
}

// Mock Qdrant Client
export class MockQdrantClient extends EventEmitter {
  collections: Map<string, MockCollection>;
  private operations: Operation[];
  private latencyBaseMs: number;
  private latencyVarianceMs: number;
  nextOperationId: number;

  constructor() {
    super();
    this.collections = new Map();
    this.operations = [];
    this.latencyBaseMs = 0;
    this.latencyVarianceMs = 0;
    this.nextOperationId = 1;
  }

  /**
   * Configure simulated latency for all operations
   */
  withSimulatedLatency(baseMs: number, varianceMs: number = 0): this {
    this.latencyBaseMs = baseMs;
    this.latencyVarianceMs = varianceMs;
    return this;
  }

  /**
   * Get operation log for assertions
   */
  getOperationLog(): Operation[] {
    return [...this.operations];
  }

  /**
   * Clear operation log
   */
  clearOperationLog(): void {
    this.operations = [];
  }

  /**
   * Reset all data and state
   */
  reset(): void {
    this.collections.clear();
    this.operations = [];
    this.nextOperationId = 1;
  }

  /**
   * Get a collection client
   */
  collection(name: string): MockCollectionClient {
    return new MockCollectionClient(this, name);
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionInfo[]> {
    this.logOperation('listCollections');
    await this.simulateLatency();

    const collections: CollectionInfo[] = [];

    for (const [name, collection] of this.collections) {
      collections.push({
        name,
        status: 'green',
        vectorsCount: collection.points.size,
        pointsCount: collection.points.size,
        segmentsCount: 1,
        config: collection.config,
      });
    }

    return collections;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    this.logOperation('healthCheck');
    await this.simulateLatency();

    return {
      title: 'qdrant-mock',
      version: '1.0.0',
      status: 'ok',
    };
  }

  // Internal helper methods
  getCollection(name: string): MockCollection {
    const collection = this.collections.get(name);
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }
    return collection;
  }

  logOperation(type: string, collection?: string, params?: any): void {
    const operation: Operation = {
      type,
      collection,
      timestamp: Date.now(),
      params,
    };
    this.operations.push(operation);
    this.emit('operation', operation);
  }

  async simulateLatency(): Promise<void> {
    if (this.latencyBaseMs > 0) {
      const variance = this.latencyVarianceMs > 0
        ? Math.random() * this.latencyVarianceMs * 2 - this.latencyVarianceMs
        : 0;
      const latency = this.latencyBaseMs + variance;
      await new Promise((resolve) => setTimeout(resolve, latency));
    }
  }
}

/**
 * Create a mock Qdrant client instance
 */
export function createMockQdrantClient(): MockQdrantClient {
  return new MockQdrantClient();
}
