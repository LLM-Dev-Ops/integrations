/**
 * Collection-specific types for Qdrant operations.
 *
 * This module defines types for collection management including:
 * - Collection configuration and creation
 * - Vector configuration (single and multi-vector)
 * - Distance metrics
 * - HNSW indexing parameters
 * - Quantization configurations
 * - Collection information and status
 *
 * @module collection/types
 */

/**
 * Distance metrics supported by Qdrant for vector similarity.
 */
export enum Distance {
  /** Cosine similarity (normalized dot product) */
  Cosine = 'Cosine',
  /** Euclidean distance (L2) */
  Euclidean = 'Euclidean',
  /** Dot product similarity */
  Dot = 'Dot',
  /** Manhattan distance (L1) */
  Manhattan = 'Manhattan',
}

/**
 * Vector data types supported by Qdrant.
 */
export enum VectorDataType {
  /** 32-bit floating point */
  Float32 = 'Float32',
  /** 8-bit unsigned integer */
  Uint8 = 'Uint8',
}

/**
 * Configuration for HNSW (Hierarchical Navigable Small World) index.
 */
export interface HnswConfig {
  /** Number of edges per node in the index graph (default: 16) */
  m: number;
  /** Size of the dynamic candidate list for constructing the graph (default: 100) */
  efConstruct: number;
  /** Minimum size of the dynamic candidate list for search (default: 100) */
  ef?: number;
  /** Max number of outgoing edges for an element (default: m * 2) */
  mMax?: number;
  /** Max number of outgoing edges for the first layer (default: 0) */
  mMax0?: number;
  /** Threshold for full scan (default: 20000) */
  fullScanThreshold?: number;
  /** Store HNSW index on disk */
  onDisk?: boolean;
}

/**
 * Scalar quantization configuration.
 */
export interface ScalarQuantizationConfig {
  type: 'scalar';
  /** Quantization type (int8) */
  quantile?: number;
  /** Always use RAM for quantized vectors */
  alwaysRam?: boolean;
}

/**
 * Product quantization configuration.
 */
export interface ProductQuantizationConfig {
  type: 'product';
  /** Compression ratio */
  compression: 'x4' | 'x8' | 'x16' | 'x32' | 'x64';
  /** Always use RAM for quantized vectors */
  alwaysRam?: boolean;
}

/**
 * Binary quantization configuration.
 */
export interface BinaryQuantizationConfig {
  type: 'binary';
  /** Always use RAM for quantized vectors */
  alwaysRam?: boolean;
}

/**
 * Union type for all quantization configurations.
 */
export type QuantizationConfig =
  | ScalarQuantizationConfig
  | ProductQuantizationConfig
  | BinaryQuantizationConfig;

/**
 * Configuration for a single vector space.
 */
export interface VectorConfig {
  /** Dimensionality of the vectors */
  size: number;
  /** Distance metric to use for similarity */
  distance: Distance;
  /** HNSW index configuration */
  hnswConfig?: HnswConfig;
  /** Quantization configuration */
  quantizationConfig?: QuantizationConfig;
  /** Store vectors on disk */
  onDisk?: boolean;
  /** Vector data type */
  datatype?: VectorDataType;
}

/**
 * Write consistency factor options.
 */
export type WriteConsistencyFactor = number | 'majority' | 'quorum' | 'all';

/**
 * Configuration for creating a collection.
 */
export interface CollectionConfig {
  /** Vector space configuration (for single-vector collections) */
  vectors?: VectorConfig;
  /** Named vector spaces (for multi-vector collections) */
  namedVectors?: Record<string, VectorConfig>;
  /** Number of shards */
  shardNumber?: number;
  /** Replication factor */
  replicationFactor?: number;
  /** Write consistency factor */
  writeConsistencyFactor?: WriteConsistencyFactor;
  /** Store payload on disk */
  onDiskPayload?: boolean;
  /** HNSW configuration (legacy - use vectors.hnswConfig instead) */
  hnswConfig?: HnswConfig;
  /** Quantization configuration (legacy - use vectors.quantizationConfig instead) */
  quantizationConfig?: QuantizationConfig;
  /** Optimizers configuration */
  optimizersConfig?: OptimizersConfig;
  /** WAL (Write-Ahead Log) configuration */
  walConfig?: WalConfig;
  /** Enable sparse vectors */
  sparseVectors?: Record<string, SparseVectorConfig>;
}

/**
 * Sparse vector configuration.
 */
export interface SparseVectorConfig {
  /** Index configuration for sparse vectors */
  index?: {
    /** Store index on disk */
    onDisk?: boolean;
  };
}

/**
 * Optimizers configuration.
 */
export interface OptimizersConfig {
  /** Deleted vectors threshold to trigger optimization */
  deletedThreshold?: number;
  /** Vacuum threshold */
  vacuumMinVectorNumber?: number;
  /** Default segment number */
  defaultSegmentNumber?: number;
  /** Max segment size (KB) */
  maxSegmentSize?: number;
  /** Memmap threshold (KB) */
  memmapThreshold?: number;
  /** Indexing threshold (KB) */
  indexingThreshold?: number;
  /** Flush interval (seconds) */
  flushIntervalSec?: number;
  /** Max optimization threads */
  maxOptimizationThreads?: number;
}

/**
 * Write-Ahead Log configuration.
 */
export interface WalConfig {
  /** WAL capacity (MB) */
  walCapacityMb?: number;
  /** WAL segments ahead */
  walSegmentsAhead?: number;
}

/**
 * Parameters for updating collection configuration.
 */
export interface UpdateParams {
  /** New optimizers configuration */
  optimizersConfig?: OptimizersConfig;
  /** New collection parameters */
  params?: {
    /** New replication factor */
    replicationFactor?: number;
    /** New write consistency factor */
    writeConsistencyFactor?: WriteConsistencyFactor;
  };
}

/**
 * Collection status information.
 */
export enum CollectionStatus {
  /** Collection is ready for operations */
  Green = 'green',
  /** Collection is operational but degraded */
  Yellow = 'yellow',
  /** Collection is not operational */
  Red = 'red',
}

/**
 * Optimizer status.
 */
export interface OptimizerStatus {
  /** Is optimizer running */
  ok: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * Payload schema field type.
 */
export enum PayloadSchemaType {
  Keyword = 'keyword',
  Integer = 'integer',
  Float = 'float',
  Geo = 'geo',
  Text = 'text',
  Bool = 'bool',
  Datetime = 'datetime',
}

/**
 * Payload schema field information.
 */
export interface PayloadSchemaInfo {
  /** Field data type */
  dataType: PayloadSchemaType;
  /** Number of points with this field */
  points?: number;
}

/**
 * Collection information response.
 */
export interface CollectionInfo {
  /** Collection status */
  status: CollectionStatus;
  /** Optimizer status */
  optimizerStatus: OptimizerStatus;
  /** Number of vectors in collection */
  vectorsCount?: number;
  /** Number of indexed vectors */
  indexedVectorsCount?: number;
  /** Number of points in collection */
  pointsCount: number;
  /** Number of segments */
  segmentsCount: number;
  /** Collection configuration */
  config: {
    /** Vector parameters */
    params: {
      /** Vector configuration (single-vector) */
      vectors?: VectorConfig;
      /** Named vectors configuration (multi-vector) */
      namedVectors?: Record<string, VectorConfig>;
      /** Shard number */
      shardNumber: number;
      /** Replication factor */
      replicationFactor?: number;
      /** Write consistency factor */
      writeConsistencyFactor?: WriteConsistencyFactor;
      /** On-disk payload storage */
      onDiskPayload: boolean;
    };
    /** HNSW configuration */
    hnswConfig: HnswConfig;
    /** Optimizers configuration */
    optimizerConfig: OptimizersConfig;
    /** WAL configuration */
    walConfig: WalConfig;
    /** Quantization configuration */
    quantizationConfig?: QuantizationConfig;
  };
  /** Payload schema information */
  payloadSchema?: Record<string, PayloadSchemaInfo>;
}

/**
 * Collection existence check response.
 */
export interface CollectionExistsInfo {
  /** Whether the collection exists */
  exists: boolean;
}

/**
 * Builder class for CollectionConfig with fluent API.
 */
export class CollectionConfigBuilder {
  private config: CollectionConfig = {};

  /**
   * Create a builder with default configuration for a given vector size.
   * @param size - Vector dimensionality
   * @returns Builder instance
   */
  static defaultWithSize(size: number): CollectionConfigBuilder {
    const builder = new CollectionConfigBuilder();
    builder.config.vectors = {
      size,
      distance: Distance.Cosine,
    };
    return builder;
  }

  /**
   * Set the distance metric.
   * @param distance - Distance metric to use
   * @returns Builder instance for chaining
   */
  withDistance(distance: Distance): this {
    if (!this.config.vectors) {
      this.config.vectors = { size: 0, distance };
    } else {
      this.config.vectors.distance = distance;
    }
    return this;
  }

  /**
   * Configure HNSW indexing parameters.
   * @param m - Number of edges per node
   * @param efConstruct - Size of dynamic candidate list
   * @returns Builder instance for chaining
   */
  withHnsw(m: number, efConstruct: number): this {
    const hnswConfig: HnswConfig = { m, efConstruct };

    if (this.config.vectors) {
      this.config.vectors.hnswConfig = hnswConfig;
    } else {
      this.config.hnswConfig = hnswConfig;
    }

    return this;
  }

  /**
   * Enable scalar quantization for compression.
   * @param quantile - Quantization quantile (optional)
   * @param alwaysRam - Keep quantized vectors in RAM
   * @returns Builder instance for chaining
   */
  withScalarQuantization(quantile?: number, alwaysRam?: boolean): this {
    const quantizationConfig: ScalarQuantizationConfig = {
      type: 'scalar',
      ...(quantile !== undefined && { quantile }),
      ...(alwaysRam !== undefined && { alwaysRam }),
    };

    if (this.config.vectors) {
      this.config.vectors.quantizationConfig = quantizationConfig;
    } else {
      this.config.quantizationConfig = quantizationConfig;
    }

    return this;
  }

  /**
   * Enable product quantization for compression.
   * @param compression - Compression ratio
   * @param alwaysRam - Keep quantized vectors in RAM
   * @returns Builder instance for chaining
   */
  withProductQuantization(
    compression: 'x4' | 'x8' | 'x16' | 'x32' | 'x64',
    alwaysRam?: boolean
  ): this {
    const quantizationConfig: ProductQuantizationConfig = {
      type: 'product',
      compression,
      ...(alwaysRam !== undefined && { alwaysRam }),
    };

    if (this.config.vectors) {
      this.config.vectors.quantizationConfig = quantizationConfig;
    } else {
      this.config.quantizationConfig = quantizationConfig;
    }

    return this;
  }

  /**
   * Enable binary quantization for compression.
   * @param alwaysRam - Keep quantized vectors in RAM
   * @returns Builder instance for chaining
   */
  withBinaryQuantization(alwaysRam?: boolean): this {
    const quantizationConfig: BinaryQuantizationConfig = {
      type: 'binary',
      ...(alwaysRam !== undefined && { alwaysRam }),
    };

    if (this.config.vectors) {
      this.config.vectors.quantizationConfig = quantizationConfig;
    } else {
      this.config.quantizationConfig = quantizationConfig;
    }

    return this;
  }

  /**
   * Store vectors on disk.
   * @param onDisk - Enable on-disk storage
   * @returns Builder instance for chaining
   */
  withOnDisk(onDisk: boolean = true): this {
    if (this.config.vectors) {
      this.config.vectors.onDisk = onDisk;
    }
    return this;
  }

  /**
   * Store payload on disk.
   * @param onDiskPayload - Enable on-disk payload storage
   * @returns Builder instance for chaining
   */
  withOnDiskPayload(onDiskPayload: boolean = true): this {
    this.config.onDiskPayload = onDiskPayload;
    return this;
  }

  /**
   * Configure sharding.
   * @param shardNumber - Number of shards
   * @returns Builder instance for chaining
   */
  withShardNumber(shardNumber: number): this {
    this.config.shardNumber = shardNumber;
    return this;
  }

  /**
   * Configure replication.
   * @param replicationFactor - Replication factor
   * @returns Builder instance for chaining
   */
  withReplicationFactor(replicationFactor: number): this {
    this.config.replicationFactor = replicationFactor;
    return this;
  }

  /**
   * Configure write consistency.
   * @param writeConsistencyFactor - Write consistency factor
   * @returns Builder instance for chaining
   */
  withWriteConsistency(writeConsistencyFactor: WriteConsistencyFactor): this {
    this.config.writeConsistencyFactor = writeConsistencyFactor;
    return this;
  }

  /**
   * Add named vector spaces for multi-vector collections.
   * @param name - Vector space name
   * @param vectorConfig - Vector configuration
   * @returns Builder instance for chaining
   */
  withNamedVector(name: string, vectorConfig: VectorConfig): this {
    if (!this.config.namedVectors) {
      this.config.namedVectors = {};
    }
    this.config.namedVectors[name] = vectorConfig;

    // Remove single vector config if named vectors are used
    delete this.config.vectors;

    return this;
  }

  /**
   * Build the final configuration.
   * @returns Collection configuration
   */
  build(): CollectionConfig {
    return this.config;
  }
}
