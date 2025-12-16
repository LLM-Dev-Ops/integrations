import {
  MilvusConfig,
  createDefaultConfig,
} from '../config/index.js';
import {
  ConsistencyLevel,
  getGuaranteeTimestamp,
} from '../types/consistency.js';
import {
  LoadState,
  CollectionInfo,
  CollectionStats,
  PartitionInfo,
  PartitionStats,
} from '../types/field.js';
import {
  InsertRequest,
  InsertResponse,
  UpsertRequest,
  UpsertResponse,
  DeleteRequest,
  DeleteResponse,
} from '../types/insert.js';
import {
  SearchRequest,
  SearchResponse,
  HybridSearchRequest,
} from '../types/search.js';
import {
  QueryRequest,
  QueryResponse,
  GetRequest,
  GetResponse,
} from '../types/query.js';
import { MilvusClientInterface } from './interfaces.js';
import {
  MilvusCollectionNotFoundError,
  MilvusLoadTimeoutError,
} from '../errors/index.js';
import { MockTransport, createMockTransport } from '../transport/index.js';
import { MetricsCollector, createMetricsCollector } from '../metrics/index.js';
import {
  validateInsertRequest,
  validateSearchRequest,
  validateHybridSearchRequest,
} from '../validation/index.js';
import { rerankResults } from '../search/reranker.js';

/**
 * Milvus client implementation.
 */
export class MilvusClient implements MilvusClientInterface {
  private readonly config: MilvusConfig;
  private readonly transport: MockTransport;
  private readonly metrics: MetricsCollector;
  private sessionTimestamp: bigint = 0n;
  private collectionCache: Map<string, { info: CollectionInfo; expiry: number }> = new Map();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    config: Partial<MilvusConfig> = {},
    options: { metrics?: MetricsCollector } = {}
  ) {
    this.config = { ...createDefaultConfig(), ...config };
    // Use mock transport for now - real gRPC would be swapped in production
    this.transport = createMockTransport(this.config);
    this.metrics = options.metrics ?? createMetricsCollector(true);
  }

  /**
   * Connect to Milvus server.
   */
  async connect(): Promise<void> {
    await this.transport.connect();
  }

  /**
   * Close the connection.
   */
  async close(): Promise<void> {
    await this.transport.close();
    this.collectionCache.clear();
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.transport.isConnected();
  }

  /**
   * Health check.
   */
  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const startTime = Date.now();
    try {
      await this.listCollections();
      const latencyMs = Date.now() - startTime;
      return { healthy: true, latencyMs };
    } catch {
      const latencyMs = Date.now() - startTime;
      return { healthy: false, latencyMs };
    }
  }

  // ==================== Vector Operations ====================

  async insert(request: InsertRequest): Promise<InsertResponse> {
    const stopTimer = this.metrics.startTimer('insert', {
      collection: request.collectionName,
    });

    try {
      validateInsertRequest(request);

      // Ensure collection is loaded if auto-load enabled
      if (this.config.autoLoad) {
        await this.ensureLoaded(request.collectionName);
      }

      const rowCount = request.fields[0]?.values.length ?? 0;
      const response = await this.transport.insert(
        request.collectionName,
        request.partitionName,
        rowCount
      );

      // Update session timestamp
      this.updateSessionTimestamp(response.timestamp);

      this.metrics.increment('entities_inserted', response.insertCount, {
        collection: request.collectionName,
      });

      return response;
    } finally {
      stopTimer();
    }
  }

  async upsert(request: UpsertRequest): Promise<UpsertResponse> {
    const stopTimer = this.metrics.startTimer('upsert', {
      collection: request.collectionName,
    });

    try {
      validateInsertRequest(request);

      if (this.config.autoLoad) {
        await this.ensureLoaded(request.collectionName);
      }

      const rowCount = request.fields[0]?.values.length ?? 0;
      const response = await this.transport.upsert(
        request.collectionName,
        request.partitionName,
        rowCount
      );

      this.updateSessionTimestamp(response.timestamp);

      this.metrics.increment('entities_upserted', response.upsertCount, {
        collection: request.collectionName,
      });

      return response;
    } finally {
      stopTimer();
    }
  }

  async delete(request: DeleteRequest): Promise<DeleteResponse> {
    const stopTimer = this.metrics.startTimer('delete', {
      collection: request.collectionName,
    });

    try {
      const response = await this.transport.delete(
        request.collectionName,
        request.filter
      );

      this.updateSessionTimestamp(response.timestamp);

      this.metrics.increment('entities_deleted', Number(response.deleteCount), {
        collection: request.collectionName,
      });

      return response;
    } finally {
      stopTimer();
    }
  }

  async get(request: GetRequest): Promise<GetResponse> {
    const stopTimer = this.metrics.startTimer('get', {
      collection: request.collectionName,
    });

    try {
      if (this.config.autoLoad) {
        await this.ensureLoaded(request.collectionName);
      }

      // Build filter for primary keys
      const filter = `id in [${request.ids.join(',')}]`;
      const response = await this.transport.query(
        request.collectionName,
        filter,
        request.ids.length
      );

      return { entities: response.entities };
    } finally {
      stopTimer();
    }
  }

  // ==================== Search Operations ====================

  async search(request: SearchRequest): Promise<SearchResponse> {
    const stopTimer = this.metrics.startTimer('search', {
      collection: request.collectionName,
      index_type: request.params.indexType,
    });

    try {
      validateSearchRequest(request);

      if (this.config.autoLoad) {
        await this.ensureLoaded(request.collectionName);
      }

      const response = await this.transport.search(
        request.collectionName,
        request.vectors,
        request.topK
      );

      this.metrics.increment('searches_total', 1, {
        collection: request.collectionName,
        index_type: request.params.indexType,
      });
      this.metrics.histogram('search_result_count', response.results[0]?.ids.length ?? 0);

      return response;
    } finally {
      stopTimer();
    }
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    const stopTimer = this.metrics.startTimer('query', {
      collection: request.collectionName,
    });

    try {
      if (this.config.autoLoad) {
        await this.ensureLoaded(request.collectionName);
      }

      const response = await this.transport.query(
        request.collectionName,
        request.filter,
        request.limit ?? 10
      );

      this.metrics.increment('queries_total', 1, {
        collection: request.collectionName,
      });

      return response;
    } finally {
      stopTimer();
    }
  }

  async hybridSearch(request: HybridSearchRequest): Promise<SearchResponse> {
    const stopTimer = this.metrics.startTimer('hybrid_search', {
      collection: request.collectionName,
    });

    try {
      validateHybridSearchRequest(request);

      if (this.config.autoLoad) {
        await this.ensureLoaded(request.collectionName);
      }

      // Execute individual searches
      const searchResults = await Promise.all(
        request.searches.map((searchReq) =>
          this.transport.search(
            searchReq.collectionName || request.collectionName,
            searchReq.vectors,
            searchReq.topK
          )
        )
      );

      // Collect all results for reranking
      const allHits = searchResults
        .map((r) => r.results[0])
        .filter((hit): hit is NonNullable<typeof hit> => hit !== undefined);

      // Apply reranking
      const rerankedHits = rerankResults(
        allHits,
        request.rerankStrategy,
        request.finalTopK
      );

      this.metrics.increment('hybrid_searches_total', 1, {
        collection: request.collectionName,
      });

      return { results: [rerankedHits] };
    } finally {
      stopTimer();
    }
  }

  // ==================== Collection Operations ====================

  async listCollections(): Promise<string[]> {
    return this.transport.listCollections();
  }

  async describeCollection(name: string): Promise<CollectionInfo> {
    // Check cache first
    const cached = this.collectionCache.get(name);
    if (cached && cached.expiry > Date.now()) {
      return cached.info;
    }

    const collection = this.transport.getCollection(name);
    if (!collection) {
      throw new MilvusCollectionNotFoundError(name);
    }

    const info: CollectionInfo = {
      name: collection.name,
      description: '',
      schema: {
        fields: collection.schema.fields.map((f) => ({
          name: f.name,
          dataType: f.type as any,
          isPrimary: f.name === 'id',
          isPartitionKey: false,
          isAutoId: false,
        })),
        enableDynamicField: collection.schema.enableDynamicField,
      },
      numEntities: BigInt(collection.entities.length),
      loadState: collection.loadState,
      createdTimestamp: BigInt(Date.now()),
    };

    // Update cache
    this.collectionCache.set(name, {
      info,
      expiry: Date.now() + this.cacheTtlMs,
    });

    return info;
  }

  async getCollectionStats(name: string): Promise<CollectionStats> {
    const collection = this.transport.getCollection(name);
    if (!collection) {
      throw new MilvusCollectionNotFoundError(name);
    }

    return {
      rowCount: BigInt(collection.entities.length),
    };
  }

  async loadCollection(name: string, _replicaNumber?: number): Promise<void> {
    const stopTimer = this.metrics.startTimer('load_collection');

    try {
      await this.transport.loadCollection(name);

      // Wait for load to complete
      await this.waitForLoadState(name, LoadState.Loaded);

      // Invalidate cache
      this.collectionCache.delete(name);
    } finally {
      stopTimer();
    }
  }

  async releaseCollection(name: string): Promise<void> {
    await this.transport.releaseCollection(name);
    this.collectionCache.delete(name);
  }

  async getLoadState(name: string): Promise<LoadState> {
    const collection = this.transport.getCollection(name);
    if (!collection) {
      throw new MilvusCollectionNotFoundError(name);
    }
    return collection.loadState;
  }

  async ensureLoaded(name: string): Promise<void> {
    const loadState = await this.getLoadState(name);

    switch (loadState) {
      case LoadState.Loaded:
        return;
      case LoadState.Loading:
        await this.waitForLoadState(name, LoadState.Loaded);
        return;
      case LoadState.NotLoad:
      case LoadState.LoadFailed:
        await this.loadCollection(name);
        return;
    }
  }

  private async waitForLoadState(
    name: string,
    targetState: LoadState,
    maxWaitMs: number = 300_000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const state = await this.getLoadState(name);
      if (state === targetState) {
        return;
      }
      if (state === LoadState.LoadFailed) {
        throw new MilvusCollectionNotFoundError(name);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new MilvusLoadTimeoutError(name, maxWaitMs);
  }

  // ==================== Partition Operations ====================

  async listPartitions(collectionName: string): Promise<PartitionInfo[]> {
    const collection = this.transport.getCollection(collectionName);
    if (!collection) {
      throw new MilvusCollectionNotFoundError(collectionName);
    }

    return collection.partitions.map((name) => ({
      name,
      numEntities: 0n,
      loadState: collection.loadState,
    }));
  }

  async loadPartitions(
    collectionName: string,
    _partitionNames: string[]
  ): Promise<void> {
    // Simplified - in real implementation would load specific partitions
    await this.loadCollection(collectionName);
  }

  async releasePartitions(
    collectionName: string,
    _partitionNames: string[]
  ): Promise<void> {
    // Simplified - in real implementation would release specific partitions
    await this.releaseCollection(collectionName);
  }

  async getPartitionStats(
    collectionName: string,
    partitionName: string
  ): Promise<PartitionStats> {
    const collection = this.transport.getCollection(collectionName);
    if (!collection) {
      throw new MilvusCollectionNotFoundError(collectionName);
    }

    if (!collection.partitions.includes(partitionName)) {
      throw new Error(`Partition not found: ${partitionName}`);
    }

    return {
      rowCount: 0n, // Simplified
    };
  }

  // ==================== Consistency Operations ====================

  getGuaranteeTimestamp(level: ConsistencyLevel): bigint {
    return getGuaranteeTimestamp(level, this.sessionTimestamp);
  }

  updateSessionTimestamp(timestamp: bigint): void {
    if (timestamp > this.sessionTimestamp) {
      this.sessionTimestamp = timestamp;
    }
  }

  getSessionTimestamp(): bigint {
    return this.sessionTimestamp;
  }
}
