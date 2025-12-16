/**
 * Core data types for Qdrant vector database.
 *
 * This module provides TypeScript type definitions for all Qdrant entities,
 * including points, vectors, collections, search results, and configuration.
 *
 * @module types
 */

// ============================================================================
// Point Identifiers
// ============================================================================

/**
 * Point identifier - can be either a UUID string or a numeric ID.
 * Qdrant supports both formats for flexible point identification.
 */
export type PointId = string | number;

// ============================================================================
// Vector Types
// ============================================================================

/**
 * Dense vector representation - an array of floating-point numbers.
 * This is the most common vector type used in similarity search.
 */
export type DenseVector = number[];

/**
 * Sparse vector index - represents a non-zero element in a sparse vector.
 */
export interface SparseVectorIndex {
  /** Index position of the non-zero element. */
  readonly index: number;
  /** Value at the index position. */
  readonly value: number;
}

/**
 * Sparse vector representation - only stores non-zero elements.
 * Efficient for high-dimensional vectors with many zero values.
 */
export interface SparseVector {
  /** Array of non-zero elements with their indices. */
  readonly indices: SparseVectorIndex[];
  /** Total dimensionality of the vector (including zero elements). */
  readonly dimension?: number;
}

/**
 * Multi-vector representation - multiple vectors for a single point.
 * Used for advanced use cases like multi-aspect embeddings.
 */
export interface MultiVector {
  /** Array of dense vectors. */
  readonly vectors: DenseVector[];
}

/**
 * Union type representing any vector format supported by Qdrant.
 */
export type Vector = DenseVector | SparseVector | MultiVector;

/**
 * Named vectors - multiple vectors with different names for a single point.
 * Allows storing different embedding types (e.g., text, image) for one point.
 */
export type NamedVectors = Record<string, Vector>;

// ============================================================================
// Distance Metrics
// ============================================================================

/**
 * Distance metric for vector similarity calculation.
 * Determines how similarity between vectors is computed.
 */
export enum Distance {
  /** Cosine similarity (1 - cosine distance). Range: [-1, 1]. */
  Cosine = 'Cosine',
  /** Euclidean distance (L2 norm). Range: [0, ∞). */
  Euclidean = 'Euclid',
  /** Dot product similarity. Range: [-∞, ∞). */
  Dot = 'Dot',
  /** Manhattan distance (L1 norm). Range: [0, ∞). */
  Manhattan = 'Manhattan',
}

/**
 * @deprecated Use Distance instead
 * Alias for backward compatibility.
 */
export const DistanceMetric = Distance;
export type DistanceMetric = Distance;

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Payload value types supported by Qdrant.
 * Payloads can contain nested structures and arrays.
 */
export type PayloadValue =
  | string
  | number
  | boolean
  | null
  | PayloadValue[]
  | { [key: string]: PayloadValue };

/**
 * Point payload - arbitrary JSON-compatible data associated with a point.
 * Can be used for filtering, faceting, and returning metadata.
 */
export type Payload = Record<string, PayloadValue>;

// ============================================================================
// Point Types
// ============================================================================

/**
 * Point - a single vector with optional payload.
 * This is the fundamental unit stored in Qdrant collections.
 */
export interface Point {
  /** Unique identifier for the point. */
  readonly id: PointId;
  /** Vector(s) associated with the point. */
  readonly vector: DenseVector | NamedVectors;
  /** Optional payload data. */
  readonly payload?: Payload;
}

/**
 * Scored point - a point with a similarity score from search results.
 * Returned by search and recommendation operations.
 */
export interface ScoredPoint {
  /** Unique identifier for the point. */
  readonly id: PointId;
  /** Similarity score based on the distance metric. */
  readonly score: number;
  /** Vector(s) associated with the point (optional in results). */
  readonly vector?: DenseVector | NamedVectors;
  /** Payload data (optional in results). */
  readonly payload?: Payload;
  /** Version number for optimistic locking. */
  readonly version?: number;
}

// ============================================================================
// Collection Configuration
// ============================================================================

/**
 * Vector parameters for a single named vector in a collection.
 */
export interface VectorParams {
  /** Dimensionality of the vector. */
  readonly size: number;
  /** Distance metric for similarity calculation. */
  readonly distance: Distance;
  /** Whether to store vectors on disk (optional). */
  readonly onDisk?: boolean;
  /** HNSW index configuration. */
  readonly hnswConfig?: HnswConfig;
  /** Quantization configuration. */
  readonly quantizationConfig?: QuantizationConfig;
}

/**
 * @deprecated Use VectorParams instead
 * Alias for backward compatibility.
 */
export type VectorConfig = VectorParams;

/**
 * Vector configuration - either a single unnamed vector or multiple named vectors.
 */
export type VectorsConfig = VectorParams | Record<string, VectorParams>;

/**
 * Optimizer configuration for collection indexing.
 */
export interface OptimizerConfig {
  /** Threshold for number of deleted vectors before optimization. */
  readonly deletedThreshold?: number;
  /** Threshold for number of unindexed vectors before optimization. */
  readonly vacuumMinVectorNumber?: number;
  /** Default segment size in KB. */
  readonly defaultSegmentNumber?: number;
  /** Maximum segment size in KB. */
  readonly maxSegmentSize?: number;
  /** Flush interval in seconds. */
  readonly flushIntervalSec?: number;
  /** Maximum optimization threads. */
  readonly maxOptimizationThreads?: number;
}

/**
 * Write-ahead log (WAL) configuration.
 */
export interface WalConfig {
  /** WAL capacity threshold in MB. */
  readonly walCapacityMb?: number;
  /** WAL segments ahead to write. */
  readonly walSegmentsAhead?: number;
}

/**
 * Scalar quantization configuration.
 */
export interface ScalarQuantization {
  /** Quantization type. */
  readonly type: 'int8';
  /** Quantile for outlier handling. */
  readonly quantile?: number;
  /** Whether to always keep quantized vectors in RAM. */
  readonly alwaysRam?: boolean;
}

/**
 * Product quantization configuration.
 */
export interface ProductQuantization {
  /** Compression ratio. */
  readonly compression: number;
  /** Whether to always keep quantized vectors in RAM. */
  readonly alwaysRam?: boolean;
}

/**
 * Quantization configuration for reducing memory usage.
 */
export interface QuantizationConfig {
  /** Scalar quantization settings. */
  readonly scalar?: ScalarQuantization;
  /** Product quantization settings. */
  readonly product?: ProductQuantization;
}

/**
 * HNSW (Hierarchical Navigable Small World) index configuration.
 */
export interface HnswConfig {
  /** Number of edges per node in the graph. */
  readonly m?: number;
  /** Size of the dynamic candidate list. */
  readonly efConstruct?: number;
  /** Full scan threshold for collection size. */
  readonly fullScanThreshold?: number;
  /** Maximum number of connections per layer. */
  readonly maxIndexingThreads?: number;
  /** Whether to store HNSW index on disk. */
  readonly onDisk?: boolean;
  /** Payload key for additional indexing. */
  readonly payloadM?: number;
}

/**
 * Collection configuration parameters.
 */
export interface CollectionConfig {
  /** Vector configuration for the collection. */
  readonly vectors?: VectorsConfig;
  /** Shard number for distributed collections. */
  readonly shardNumber?: number;
  /** Replication factor for high availability. */
  readonly replicationFactor?: number;
  /** Write consistency factor. */
  readonly writeConsistencyFactor?: number;
  /** Whether to store payload on disk. */
  readonly onDiskPayload?: boolean;
  /** Optimizer configuration. */
  readonly optimizerConfig?: OptimizerConfig;
  /** WAL configuration. */
  readonly walConfig?: WalConfig;
}

/**
 * Collection status information.
 */
export enum CollectionStatus {
  /** Collection is being created or initialized. */
  Yellow = 'yellow',
  /** Collection is ready for operations. */
  Green = 'green',
  /** Collection has errors or is unavailable. */
  Red = 'red',
}

/**
 * Collection information including metadata and statistics.
 */
export interface CollectionInfo {
  /** Collection name. */
  readonly name: string;
  /** Current status. */
  readonly status?: CollectionStatus;
  /** Collection configuration. */
  readonly config?: CollectionConfig;
  /** Number of vectors in the collection. */
  readonly vectorsCount?: number;
  /** Number of indexed vectors. */
  readonly indexedVectorsCount?: number;
  /** Number of points in the collection. */
  readonly pointsCount?: number;
  /** Number of segments. */
  readonly segmentsCount?: number;
  /** Optimizer status. */
  readonly optimizerStatus?: string;
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Condition type for filtering points.
 */
export type Condition =
  | { key: string; match: { value: unknown } }
  | { key: string; matchAny: { any: unknown[] } }
  | { key: string; matchText: { text: string } }
  | { key: string; range: { gte?: number; lte?: number; gt?: number; lt?: number } }
  | { key: string; geoRadius: { center: { lon: number; lat: number }; radius: number } }
  | { key: string; geoBoundingBox: { topLeft: { lon: number; lat: number }; bottomRight: { lon: number; lat: number } } }
  | { key: string; geoPolygon: { exterior: { points: Array<{ lon: number; lat: number }> }; interiors?: Array<{ points: Array<{ lon: number; lat: number }> }> } }
  | { key: string; valuesCount: { lt?: number; gt?: number; gte?: number; lte?: number } }
  | { hasId: Array<PointId> }
  | { key: string; isEmpty: true }
  | { key: string; isNull: true }
  | { nested: { key: string; filter: Filter } };

/**
 * Filter for querying points based on payload conditions.
 */
export interface Filter {
  /** All conditions must match (AND logic). */
  readonly must?: Condition[];
  /** Any condition can match (OR logic). */
  readonly should?: Condition[];
  /** No condition should match (NOT logic). */
  readonly mustNot?: Condition[];
  /** Minimum number of 'should' conditions that must match. */
  readonly minShould?: number;
}

// ============================================================================
// Search Parameters
// ============================================================================

/**
 * Quantization search parameters.
 */
export interface QuantizationSearchParams {
  /** Whether to ignore quantization during search. */
  readonly ignore?: boolean;
  /** Whether to rescore using original vectors. */
  readonly rescore?: boolean;
  /** Oversampling factor for quantized search. */
  readonly oversampling?: number;
}

/**
 * Search parameters for vector similarity search.
 */
export interface SearchParams {
  /** HNSW-EF parameter - size of the dynamic candidate list. */
  readonly hnswEf?: number;
  /** Whether to perform exact search (bypass HNSW). */
  readonly exact?: boolean;
  /** Whether to use indexed data only. */
  readonly indexedOnly?: boolean;
  /** Quantization parameters. */
  readonly quantization?: QuantizationSearchParams;
}

/**
 * Search request parameters.
 */
export interface SearchRequest {
  /** Query vector. */
  readonly vector: DenseVector;
  /** Named vector to search against (for multi-vector collections). */
  readonly vectorName?: string;
  /** Payload filter. */
  readonly filter?: Filter;
  /** Maximum number of results to return. */
  readonly limit: number;
  /** Number of results to skip (for pagination). */
  readonly offset?: number;
  /** Whether to include vectors in results. */
  readonly withVector?: boolean | string[];
  /** Whether to include payload in results. */
  readonly withPayload?: boolean | string[];
  /** Search parameters. */
  readonly params?: SearchParams;
  /** Score threshold - only return results above this score. */
  readonly scoreThreshold?: number;
}

// ============================================================================
// Scroll Parameters
// ============================================================================

/**
 * Scroll parameters for iterating through points.
 */
export interface ScrollParams {
  /** Maximum number of points to return. */
  readonly limit?: number;
  /** Offset for pagination (point ID). */
  readonly offset?: PointId;
  /** Whether to include payload in results. */
  readonly withPayload?: boolean | string[];
  /** Whether to include vectors in results. */
  readonly withVector?: boolean | string[];
  /** Payload filter. */
  readonly filter?: Filter;
  /** Order by payload field. */
  readonly orderBy?: {
    readonly key: string;
    readonly direction?: 'asc' | 'desc';
  };
}

// ============================================================================
// Operation Results
// ============================================================================

/**
 * Result of a scroll operation for iterating through points.
 */
export interface ScrollResult {
  /** Retrieved points. */
  readonly points: Point[];
  /** Next offset for pagination (null if no more results). */
  readonly nextPageOffset?: PointId | null;
}

/**
 * Result of an upsert operation.
 */
export interface UpsertResult {
  /** Operation ID for tracking. */
  readonly operationId: number;
  /** Status of the operation. */
  readonly status: 'acknowledged' | 'completed';
}

/**
 * Result of an update operation.
 */
export interface UpdateResult {
  /** Operation ID for tracking. */
  readonly operationId: number;
  /** Status of the operation. */
  readonly status: 'acknowledged' | 'completed';
}

/**
 * Result of a delete operation.
 */
export interface DeleteResult {
  /** Operation ID for tracking. */
  readonly operationId: number;
  /** Status of the operation. */
  readonly status: 'acknowledged' | 'completed';
}

/**
 * Result of a collection creation operation.
 */
export interface CreateCollectionResult {
  /** Whether the operation was successful. */
  readonly result: boolean;
}

/**
 * Result of a collection deletion operation.
 */
export interface DeleteCollectionResult {
  /** Whether the operation was successful. */
  readonly result: boolean;
}

/**
 * Count result.
 */
export interface CountResult {
  /** Number of points matching the criteria. */
  readonly count: number;
}

/**
 * Batch operation result.
 */
export interface BatchResult {
  /** Operation ID for tracking. */
  readonly operationId: number;
  /** Status of the operation. */
  readonly status: 'acknowledged' | 'completed';
}

// ============================================================================
// Health and Status
// ============================================================================

/**
 * Health check status.
 */
export interface HealthStatus {
  /** Application title. */
  readonly title: string;
  /** Application version. */
  readonly version: string;
  /** Commit hash. */
  readonly commit?: string;
}

/**
 * Cluster information.
 */
export interface ClusterInfo {
  /** Peer ID. */
  readonly peerId: number;
  /** Number of shards. */
  readonly shardCount: number;
  /** Raft term. */
  readonly raftTerm?: number;
  /** Consensus thread status. */
  readonly consensusThreadStatus?: string;
}

/**
 * Collection aliases mapping.
 */
export interface CollectionAlias {
  /** Alias name. */
  readonly aliasName: string;
  /** Collection name. */
  readonly collectionName: string;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch upsert request for multiple points.
 */
export interface BatchUpsertRequest {
  /** Collection name. */
  readonly collectionName: string;
  /** Points to upsert. */
  readonly points: Point[];
  /** Whether to wait for the operation to complete. */
  readonly wait?: boolean;
  /** Ordering guarantee for write operations. */
  readonly ordering?: 'weak' | 'medium' | 'strong';
}

/**
 * Batch delete request.
 */
export interface BatchDeleteRequest {
  /** Collection name. */
  readonly collectionName: string;
  /** Point IDs to delete. */
  readonly points?: PointId[];
  /** Filter for deletion. */
  readonly filter?: Filter;
  /** Whether to wait for the operation to complete. */
  readonly wait?: boolean;
  /** Ordering guarantee for write operations. */
  readonly ordering?: 'weak' | 'medium' | 'strong';
}

// ============================================================================
// Recommendation
// ============================================================================

/**
 * Recommendation strategy.
 */
export enum RecommendStrategy {
  /** Average vectors of positive and negative examples. */
  AverageVector = 'average_vector',
  /** Find points closest to positive examples and farthest from negative. */
  BestScore = 'best_score',
}

/**
 * Recommendation request for finding similar points.
 */
export interface RecommendRequest {
  /** Positive example point IDs. */
  readonly positive: PointId[];
  /** Negative example point IDs (to avoid). */
  readonly negative?: PointId[];
  /** Named vector to use (for multi-vector collections). */
  readonly vectorName?: string;
  /** Payload filter. */
  readonly filter?: Filter;
  /** Maximum number of results to return. */
  readonly limit: number;
  /** Number of results to skip (for pagination). */
  readonly offset?: number;
  /** Whether to include vectors in results. */
  readonly withVector?: boolean | string[];
  /** Whether to include payload in results. */
  readonly withPayload?: boolean | string[];
  /** Search parameters. */
  readonly params?: SearchParams;
  /** Score threshold. */
  readonly scoreThreshold?: number;
  /** Recommendation strategy. */
  readonly strategy?: RecommendStrategy;
  /** Lookup from another collection for positive/negative examples. */
  readonly using?: string;
  /** Lookup from another collection. */
  readonly lookupFrom?: {
    readonly collection: string;
    readonly vector?: string;
  };
}

// ============================================================================
// Snapshot
// ============================================================================

/**
 * Snapshot information.
 */
export interface SnapshotInfo {
  /** Snapshot name/ID. */
  readonly name: string;
  /** Creation timestamp. */
  readonly creationTime: string;
  /** Snapshot size in bytes. */
  readonly size: number;
  /** Checksum of the snapshot. */
  readonly checksum?: string;
}

/**
 * Snapshot creation result.
 */
export interface SnapshotResult {
  /** Snapshot name. */
  readonly name: string;
  /** Creation timestamp. */
  readonly creationTime: string;
  /** File size in bytes. */
  readonly size: number;
  /** Checksum of the snapshot. */
  readonly checksum?: string;
}

// ============================================================================
// Payload Operations
// ============================================================================

/**
 * Set payload operation.
 */
export interface SetPayloadOperation {
  /** Payload to set. */
  readonly payload: Payload;
  /** Point IDs to update. */
  readonly points?: PointId[];
  /** Filter for points to update. */
  readonly filter?: Filter;
}

/**
 * Delete payload operation.
 */
export interface DeletePayloadOperation {
  /** Payload keys to delete. */
  readonly keys: string[];
  /** Point IDs to update. */
  readonly points?: PointId[];
  /** Filter for points to update. */
  readonly filter?: Filter;
}

/**
 * Clear payload operation.
 */
export interface ClearPayloadOperation {
  /** Point IDs to clear. */
  readonly points?: PointId[];
  /** Filter for points to clear. */
  readonly filter?: Filter;
}

// ============================================================================
// Discovery and Groups
// ============================================================================

/**
 * Context pair for discovery search.
 */
export interface ContextPair {
  /** Positive example point ID. */
  readonly positive: PointId;
  /** Negative example point ID. */
  readonly negative: PointId;
}

/**
 * Discovery request - find points in a specific context.
 */
export interface DiscoverRequest {
  /** Target vector or point ID. */
  readonly target?: PointId | DenseVector;
  /** Context examples. */
  readonly context?: ContextPair[];
  /** Named vector to use. */
  readonly vectorName?: string;
  /** Payload filter. */
  readonly filter?: Filter;
  /** Maximum number of results. */
  readonly limit: number;
  /** Number of results to skip. */
  readonly offset?: number;
  /** Whether to include vectors. */
  readonly withVector?: boolean | string[];
  /** Whether to include payload. */
  readonly withPayload?: boolean | string[];
  /** Search parameters. */
  readonly params?: SearchParams;
}

/**
 * Point group.
 */
export interface PointGroup {
  /** Group ID (value of the group_by field). */
  readonly id: PayloadValue;
  /** Points in the group. */
  readonly hits: ScoredPoint[];
}

/**
 * Groups result.
 */
export interface GroupsResult {
  /** Groups of points. */
  readonly groups: PointGroup[];
}

/**
 * Search groups request.
 */
export interface SearchGroupsRequest {
  /** Query vector. */
  readonly vector: DenseVector;
  /** Field to group by. */
  readonly groupBy: string;
  /** Number of groups to return. */
  readonly limit: number;
  /** Group size (points per group). */
  readonly groupSize: number;
  /** Named vector to search. */
  readonly vectorName?: string;
  /** Payload filter. */
  readonly filter?: Filter;
  /** Whether to include vectors. */
  readonly withVector?: boolean | string[];
  /** Whether to include payload. */
  readonly withPayload?: boolean | string[];
  /** Search parameters. */
  readonly params?: SearchParams;
  /** Score threshold. */
  readonly scoreThreshold?: number;
  /** Whether to include lookup data from another collection. */
  readonly withLookup?: string;
}
