import { MilvusConfig } from '../config/types.js';
import { LoadState } from '../types/field.js';
import { SearchResponse, SearchHits } from '../types/search.js';
import { InsertResponse, UpsertResponse, DeleteResponse } from '../types/insert.js';
import { QueryResponse } from '../types/query.js';
import { FieldValue } from '../types/entity.js';

/**
 * Mock transport for testing without a real Milvus connection.
 */
export class MockTransport {
  private collections: Map<string, MockCollection> = new Map();
  private connected: boolean = false;

  constructor(_config: MilvusConfig) {
    // Config stored for future use with real transport implementation
  }

  /**
   * Simulate connection.
   */
  async connect(): Promise<void> {
    this.connected = true;
  }

  /**
   * Simulate disconnection.
   */
  async close(): Promise<void> {
    this.connected = false;
  }

  /**
   * Check connection status.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Add a mock collection.
   */
  addCollection(name: string, options: MockCollectionOptions = {}): void {
    this.collections.set(name, {
      name,
      entities: options.entities ?? [],
      loadState: options.loadState ?? LoadState.Loaded,
      partitions: options.partitions ?? ['_default'],
      schema: options.schema ?? { fields: [], enableDynamicField: false },
    });
  }

  /**
   * Get mock collection list.
   */
  listCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Get mock collection info.
   */
  getCollection(name: string): MockCollection | undefined {
    return this.collections.get(name);
  }

  /**
   * Mock insert operation.
   */
  async insert(
    collectionName: string,
    _partitionName: string | undefined,
    rowCount: number
  ): Promise<InsertResponse> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    const startId = BigInt(collection.entities.length + 1);
    const ids: bigint[] = [];
    for (let i = 0; i < rowCount; i++) {
      ids.push(startId + BigInt(i));
    }

    return {
      insertCount: rowCount,
      ids,
      timestamp: BigInt(Date.now()),
    };
  }

  /**
   * Mock upsert operation.
   */
  async upsert(
    collectionName: string,
    _partitionName: string | undefined,
    rowCount: number
  ): Promise<UpsertResponse> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    const ids: bigint[] = [];
    for (let i = 0; i < rowCount; i++) {
      ids.push(BigInt(i + 1));
    }

    return {
      upsertCount: rowCount,
      ids,
      timestamp: BigInt(Date.now()),
    };
  }

  /**
   * Mock delete operation.
   */
  async delete(
    collectionName: string,
    _filter: string
  ): Promise<DeleteResponse> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    // Mock: delete count based on filter complexity
    const deleteCount = 1n;

    return {
      deleteCount,
      timestamp: BigInt(Date.now()),
    };
  }

  /**
   * Mock search operation.
   */
  async search(
    collectionName: string,
    vectors: number[][],
    topK: number
  ): Promise<SearchResponse> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    // Generate mock results for each query vector
    const results: SearchHits[] = vectors.map((_, queryIndex) => {
      const ids: bigint[] = [];
      const scores: number[] = [];
      const fields: Record<string, FieldValue>[] = [];

      for (let i = 0; i < Math.min(topK, 10); i++) {
        ids.push(BigInt(queryIndex * 100 + i + 1));
        scores.push(0.99 - i * 0.05); // Decreasing scores
        fields.push({ mockField: `value_${i}` });
      }

      return { ids, scores, fields };
    });

    return { results };
  }

  /**
   * Mock query operation.
   */
  async query(
    collectionName: string,
    _filter: string,
    limit: number = 10
  ): Promise<QueryResponse> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }

    // Generate mock entities
    const entities = [];
    for (let i = 0; i < Math.min(limit, 10); i++) {
      entities.push({
        fields: {
          id: BigInt(i + 1),
          mockField: `value_${i}`,
        },
      });
    }

    return { entities };
  }

  /**
   * Mock load collection.
   */
  async loadCollection(collectionName: string): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }
    collection.loadState = LoadState.Loaded;
  }

  /**
   * Mock release collection.
   */
  async releaseCollection(collectionName: string): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }
    collection.loadState = LoadState.NotLoad;
  }
}

/**
 * Mock collection data structure.
 */
export interface MockCollection {
  name: string;
  entities: MockEntity[];
  loadState: LoadState;
  partitions: string[];
  schema: {
    fields: Array<{ name: string; type: string }>;
    enableDynamicField: boolean;
  };
}

/**
 * Mock entity data structure.
 */
export interface MockEntity {
  id: bigint;
  fields: Record<string, unknown>;
}

/**
 * Options for creating mock collections.
 */
export interface MockCollectionOptions {
  entities?: MockEntity[];
  loadState?: LoadState;
  partitions?: string[];
  schema?: {
    fields: Array<{ name: string; type: string }>;
    enableDynamicField: boolean;
  };
}

/**
 * Create a mock transport for testing.
 */
export function createMockTransport(config: MilvusConfig): MockTransport {
  return new MockTransport(config);
}
