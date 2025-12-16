import { ConsistencyLevel } from '../types/consistency.js';
import { LoadState, CollectionInfo, CollectionStats, PartitionInfo, PartitionStats } from '../types/field.js';
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
import { QueryRequest, QueryResponse, GetRequest, GetResponse } from '../types/query.js';

/**
 * Vector operations interface.
 */
export interface VectorOperations {
  /** Insert entities into a collection */
  insert(request: InsertRequest): Promise<InsertResponse>;
  /** Upsert (insert or update) entities */
  upsert(request: UpsertRequest): Promise<UpsertResponse>;
  /** Delete entities by filter expression */
  delete(request: DeleteRequest): Promise<DeleteResponse>;
  /** Get entities by primary keys */
  get(request: GetRequest): Promise<GetResponse>;
}

/**
 * Search operations interface.
 */
export interface SearchOperations {
  /** Vector similarity search */
  search(request: SearchRequest): Promise<SearchResponse>;
  /** Scalar query with filter */
  query(request: QueryRequest): Promise<QueryResponse>;
  /** Hybrid search with multiple vectors and reranking */
  hybridSearch(request: HybridSearchRequest): Promise<SearchResponse>;
}

/**
 * Collection management interface.
 */
export interface CollectionOperations {
  /** List all collections */
  listCollections(): Promise<string[]>;
  /** Get collection information */
  describeCollection(name: string): Promise<CollectionInfo>;
  /** Get collection statistics */
  getCollectionStats(name: string): Promise<CollectionStats>;
  /** Load collection into memory */
  loadCollection(name: string, replicaNumber?: number): Promise<void>;
  /** Release collection from memory */
  releaseCollection(name: string): Promise<void>;
  /** Get collection load state */
  getLoadState(name: string): Promise<LoadState>;
  /** Ensure collection is loaded (auto-load if needed) */
  ensureLoaded(name: string): Promise<void>;
}

/**
 * Partition management interface.
 */
export interface PartitionOperations {
  /** List partitions in a collection */
  listPartitions(collectionName: string): Promise<PartitionInfo[]>;
  /** Load specific partitions */
  loadPartitions(collectionName: string, partitionNames: string[]): Promise<void>;
  /** Release specific partitions */
  releasePartitions(collectionName: string, partitionNames: string[]): Promise<void>;
  /** Get partition statistics */
  getPartitionStats(collectionName: string, partitionName: string): Promise<PartitionStats>;
}

/**
 * Consistency management interface.
 */
export interface ConsistencyOperations {
  /** Get guarantee timestamp for consistency level */
  getGuaranteeTimestamp(level: ConsistencyLevel): bigint;
  /** Update session timestamp after write */
  updateSessionTimestamp(timestamp: bigint): void;
  /** Get current session timestamp */
  getSessionTimestamp(): bigint;
}

/**
 * Full Milvus client interface combining all operations.
 */
export interface MilvusClientInterface
  extends VectorOperations,
    SearchOperations,
    CollectionOperations,
    PartitionOperations,
    ConsistencyOperations {
  /** Check client health */
  health(): Promise<{ healthy: boolean; latencyMs: number }>;
  /** Close the client connection */
  close(): Promise<void>;
  /** Check if client is connected */
  isConnected(): boolean;
}
