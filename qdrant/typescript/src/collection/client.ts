/**
 * Collection client for Qdrant collection-scoped operations.
 *
 * This module provides the CollectionClient class for managing collections:
 * - Create and delete collections
 * - Get collection information
 * - Update collection parameters
 * - Support for single-vector and multi-vector (named vectors) collections
 *
 * @module collection/client
 */

import type {
  CollectionConfig as CollectionConfigType,
  CollectionInfo,
  CollectionExistsInfo,
  UpdateParams,
  VectorConfig,
} from './types.js';
import { CollectionConfigBuilder } from './types.js';

/**
 * Interface for the parent QdrantClient.
 * This allows the CollectionClient to make API calls through the parent.
 */
export interface QdrantClientInterface {
  /**
   * Make a raw API request.
   * @param method - HTTP method
   * @param path - API endpoint path
   * @param body - Request body (optional)
   * @returns Response data
   */
  request<T>(method: string, path: string, body?: any): Promise<T>;

  /**
   * Get the base URL for the Qdrant instance.
   */
  getBaseUrl(): string;
}

/**
 * Client for collection-scoped operations in Qdrant.
 *
 * This class provides methods for managing a specific collection:
 * - Creating and deleting the collection
 * - Retrieving collection information
 * - Updating collection parameters
 * - Checking collection existence
 *
 * @example
 * ```typescript
 * const collection = qdrantClient.collection('my_collection');
 *
 * // Create a collection with default configuration
 * await collection.create(
 *   CollectionConfig.defaultWithSize(384)
 *     .withDistance(Distance.Cosine)
 *     .withHnsw(16, 200)
 *     .withScalarQuantization()
 *     .build()
 * );
 *
 * // Get collection info
 * const info = await collection.info();
 * console.log(`Points: ${info.pointsCount}`);
 *
 * // Check if collection exists
 * const exists = await collection.exists();
 *
 * // Delete collection
 * await collection.delete();
 * ```
 */
export class CollectionClient {
  private readonly client: QdrantClientInterface;
  private readonly collectionName: string;

  /**
   * Create a new CollectionClient.
   *
   * @param client - Parent QdrantClient instance
   * @param collectionName - Name of the collection
   */
  constructor(client: QdrantClientInterface, collectionName: string) {
    if (!collectionName || collectionName.trim().length === 0) {
      throw new Error('Collection name cannot be empty');
    }

    this.client = client;
    this.collectionName = collectionName;
  }

  /**
   * Get the collection name.
   *
   * @returns Collection name
   */
  getName(): string {
    return this.collectionName;
  }

  /**
   * Create a new collection with the specified configuration.
   *
   * This method creates a collection with a single vector space. For multi-vector
   * collections, use createWithNamedVectors() instead.
   *
   * @param config - Collection configuration
   * @throws Error if the collection already exists or configuration is invalid
   *
   * @example
   * ```typescript
   * // Create a simple collection
   * await collection.create({
   *   vectors: {
   *     size: 384,
   *     distance: Distance.Cosine
   *   }
   * });
   *
   * // Create with advanced configuration
   * await collection.create(
   *   CollectionConfig.defaultWithSize(768)
   *     .withDistance(Distance.Euclidean)
   *     .withHnsw(32, 200)
   *     .withScalarQuantization()
   *     .withOnDisk(true)
   *     .withReplicationFactor(2)
   *     .build()
   * );
   * ```
   */
  async create(config: CollectionConfigType): Promise<void> {
    if (!config.vectors && !config.namedVectors) {
      throw new Error(
        'Collection configuration must include either vectors or namedVectors'
      );
    }

    if (config.vectors && config.namedVectors) {
      throw new Error(
        'Collection configuration cannot include both vectors and namedVectors. ' +
        'Use either create() for single-vector or createWithNamedVectors() for multi-vector collections.'
      );
    }

    const requestBody: any = {};

    // Handle vector configuration
    if (config.vectors) {
      requestBody.vectors = this.serializeVectorConfig(config.vectors);
    } else if (config.namedVectors) {
      requestBody.vectors = Object.entries(config.namedVectors).reduce(
        (acc, [name, vectorConfig]) => {
          acc[name] = this.serializeVectorConfig(vectorConfig);
          return acc;
        },
        {} as Record<string, any>
      );
    }

    // Add optional parameters
    if (config.shardNumber !== undefined) {
      requestBody.shard_number = config.shardNumber;
    }

    if (config.replicationFactor !== undefined) {
      requestBody.replication_factor = config.replicationFactor;
    }

    if (config.writeConsistencyFactor !== undefined) {
      requestBody.write_consistency_factor = config.writeConsistencyFactor;
    }

    if (config.onDiskPayload !== undefined) {
      requestBody.on_disk_payload = config.onDiskPayload;
    }

    // Legacy HNSW config (if not already set in vectors)
    if (config.hnswConfig && !config.vectors?.hnswConfig) {
      requestBody.hnsw_config = this.serializeHnswConfig(config.hnswConfig);
    }

    // Legacy quantization config (if not already set in vectors)
    if (config.quantizationConfig && !config.vectors?.quantizationConfig) {
      requestBody.quantization_config = this.serializeQuantizationConfig(
        config.quantizationConfig
      );
    }

    if (config.optimizersConfig) {
      requestBody.optimizers_config = this.serializeOptimizersConfig(
        config.optimizersConfig
      );
    }

    if (config.walConfig) {
      requestBody.wal_config = this.serializeWalConfig(config.walConfig);
    }

    if (config.sparseVectors) {
      requestBody.sparse_vectors = config.sparseVectors;
    }

    await this.client.request<{ result: boolean; status: string }>(
      'PUT',
      `/collections/${encodeURIComponent(this.collectionName)}`,
      requestBody
    );
  }

  /**
   * Create a collection with multiple named vector spaces.
   *
   * This method is useful when you need to store multiple vector embeddings
   * per point (e.g., text embeddings and image embeddings together).
   *
   * @param configs - Map of vector space names to their configurations
   * @throws Error if the collection already exists or configuration is invalid
   *
   * @example
   * ```typescript
   * await collection.createWithNamedVectors(
   *   new Map([
   *     ['text', { size: 384, distance: Distance.Cosine }],
   *     ['image', { size: 512, distance: Distance.Euclidean }]
   *   ])
   * );
   * ```
   */
  async createWithNamedVectors(
    configs: Map<string, VectorConfig>
  ): Promise<void> {
    if (configs.size === 0) {
      throw new Error('At least one named vector configuration is required');
    }

    const namedVectors: Record<string, VectorConfig> = {};
    configs.forEach((config, name) => {
      if (!name || name.trim().length === 0) {
        throw new Error('Vector space name cannot be empty');
      }
      namedVectors[name] = config;
    });

    await this.create({ namedVectors });
  }

  /**
   * Get detailed information about the collection.
   *
   * Returns comprehensive information including:
   * - Collection status and health
   * - Vector counts and indexing status
   * - Configuration parameters
   * - Payload schema
   *
   * @returns Collection information
   * @throws Error if the collection does not exist
   *
   * @example
   * ```typescript
   * const info = await collection.info();
   * console.log(`Status: ${info.status}`);
   * console.log(`Points: ${info.pointsCount}`);
   * console.log(`Vectors: ${info.vectorsCount}`);
   * console.log(`Segments: ${info.segmentsCount}`);
   * ```
   */
  async info(): Promise<CollectionInfo> {
    const response = await this.client.request<{ result: CollectionInfo }>(
      'GET',
      `/collections/${encodeURIComponent(this.collectionName)}`
    );

    return response.result;
  }

  /**
   * Check if the collection exists.
   *
   * @returns True if the collection exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await collection.exists();
   * if (!exists) {
   *   await collection.create(config);
   * }
   * ```
   */
  async exists(): Promise<boolean> {
    try {
      const response = await this.client.request<{
        result: CollectionExistsInfo;
      }>(
        'GET',
        `/collections/${encodeURIComponent(this.collectionName)}/exists`
      );

      return response.result.exists;
    } catch (error: any) {
      // If the endpoint doesn't exist, fall back to checking via collection list
      if (error.statusCode === 404) {
        try {
          await this.info();
          return true;
        } catch {
          return false;
        }
      }
      throw error;
    }
  }

  /**
   * Delete the collection.
   *
   * This permanently removes the collection and all its data.
   * This operation cannot be undone.
   *
   * @throws Error if the collection does not exist
   *
   * @example
   * ```typescript
   * await collection.delete();
   * ```
   */
  async delete(): Promise<void> {
    await this.client.request<{ result: boolean; status: string }>(
      'DELETE',
      `/collections/${encodeURIComponent(this.collectionName)}`
    );
  }

  /**
   * Update collection parameters.
   *
   * This method allows updating certain collection parameters without
   * recreating the collection. Not all parameters can be updated after
   * creation (e.g., vector size and distance metric are immutable).
   *
   * @param params - Parameters to update
   * @throws Error if the collection does not exist or update fails
   *
   * @example
   * ```typescript
   * // Update replication factor
   * await collection.updateParams({
   *   params: {
   *     replicationFactor: 3,
   *     writeConsistencyFactor: 'majority'
   *   }
   * });
   *
   * // Update optimizer configuration
   * await collection.updateParams({
   *   optimizersConfig: {
   *     deletedThreshold: 0.3,
   *     vacuumMinVectorNumber: 1000
   *   }
   * });
   * ```
   */
  async updateParams(params: UpdateParams): Promise<void> {
    const requestBody: any = {};

    if (params.optimizersConfig) {
      requestBody.optimizers_config = this.serializeOptimizersConfig(
        params.optimizersConfig
      );
    }

    if (params.params) {
      requestBody.params = {};

      if (params.params.replicationFactor !== undefined) {
        requestBody.params.replication_factor = params.params.replicationFactor;
      }

      if (params.params.writeConsistencyFactor !== undefined) {
        requestBody.params.write_consistency_factor =
          params.params.writeConsistencyFactor;
      }
    }

    await this.client.request<{ result: boolean; status: string }>(
      'PATCH',
      `/collections/${encodeURIComponent(this.collectionName)}`,
      requestBody
    );
  }

  /**
   * Serialize vector configuration to API format.
   * @private
   */
  private serializeVectorConfig(config: VectorConfig): any {
    const serialized: any = {
      size: config.size,
      distance: config.distance,
    };

    if (config.hnswConfig) {
      serialized.hnsw_config = this.serializeHnswConfig(config.hnswConfig);
    }

    if (config.quantizationConfig) {
      serialized.quantization_config = this.serializeQuantizationConfig(
        config.quantizationConfig
      );
    }

    if (config.onDisk !== undefined) {
      serialized.on_disk = config.onDisk;
    }

    if (config.datatype) {
      serialized.datatype = config.datatype;
    }

    return serialized;
  }

  /**
   * Serialize HNSW configuration to API format.
   * @private
   */
  private serializeHnswConfig(config: any): any {
    const serialized: any = {
      m: config.m,
      ef_construct: config.efConstruct,
    };

    if (config.ef !== undefined) {
      serialized.ef = config.ef;
    }

    if (config.mMax !== undefined) {
      serialized.m_max = config.mMax;
    }

    if (config.mMax0 !== undefined) {
      serialized.m_max0 = config.mMax0;
    }

    if (config.fullScanThreshold !== undefined) {
      serialized.full_scan_threshold = config.fullScanThreshold;
    }

    if (config.onDisk !== undefined) {
      serialized.on_disk = config.onDisk;
    }

    return serialized;
  }

  /**
   * Serialize quantization configuration to API format.
   * @private
   */
  private serializeQuantizationConfig(config: any): any {
    const serialized: any = {
      [config.type]: {},
    };

    if (config.type === 'scalar' && config.quantile !== undefined) {
      serialized.scalar.quantile = config.quantile;
    }

    if (config.type === 'product' && config.compression) {
      serialized.product.compression = config.compression;
    }

    if (config.alwaysRam !== undefined) {
      serialized[config.type].always_ram = config.alwaysRam;
    }

    return serialized;
  }

  /**
   * Serialize optimizers configuration to API format.
   * @private
   */
  private serializeOptimizersConfig(config: any): any {
    const serialized: any = {};

    if (config.deletedThreshold !== undefined) {
      serialized.deleted_threshold = config.deletedThreshold;
    }

    if (config.vacuumMinVectorNumber !== undefined) {
      serialized.vacuum_min_vector_number = config.vacuumMinVectorNumber;
    }

    if (config.defaultSegmentNumber !== undefined) {
      serialized.default_segment_number = config.defaultSegmentNumber;
    }

    if (config.maxSegmentSize !== undefined) {
      serialized.max_segment_size = config.maxSegmentSize;
    }

    if (config.memmapThreshold !== undefined) {
      serialized.memmap_threshold = config.memmapThreshold;
    }

    if (config.indexingThreshold !== undefined) {
      serialized.indexing_threshold = config.indexingThreshold;
    }

    if (config.flushIntervalSec !== undefined) {
      serialized.flush_interval_sec = config.flushIntervalSec;
    }

    if (config.maxOptimizationThreads !== undefined) {
      serialized.max_optimization_threads = config.maxOptimizationThreads;
    }

    return serialized;
  }

  /**
   * Serialize WAL configuration to API format.
   * @private
   */
  private serializeWalConfig(config: any): any {
    const serialized: any = {};

    if (config.walCapacityMb !== undefined) {
      serialized.wal_capacity_mb = config.walCapacityMb;
    }

    if (config.walSegmentsAhead !== undefined) {
      serialized.wal_segments_ahead = config.walSegmentsAhead;
    }

    return serialized;
  }
}

/**
 * Export builder for convenience.
 */
export { CollectionConfigBuilder as CollectionConfig };
