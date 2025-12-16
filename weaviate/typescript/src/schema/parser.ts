/**
 * Schema Parser
 *
 * Functions to parse Weaviate API responses into typed schema objects.
 * Handles conversion from JSON responses to TypeScript types with validation.
 *
 * @module @weaviate/schema/parser
 */

import type {
  Schema,
  ClassDefinition,
  PropertyDefinition,
  VectorIndexConfig,
  InvertedIndexConfig,
  ReplicationConfig,
  ShardingConfig,
  MultiTenancyConfig,
  ShardInfo,
} from '../types/schema.js';
import { Tokenization, ShardStatus } from '../types/schema.js';
import { DistanceMetric } from '../types/vector.js';

/**
 * Parse full schema response from Weaviate
 *
 * @param data - Raw schema response data
 * @returns Parsed schema object
 *
 * @example
 * ```typescript
 * const response = await fetch('/v1/schema');
 * const data = await response.json();
 * const schema = parseSchema(data);
 * ```
 */
export function parseSchema(data: unknown): Schema {
  if (!data || typeof data !== 'object') {
    return { classes: [] };
  }

  const obj = data as Record<string, unknown>;
  const classes = Array.isArray(obj.classes) ? obj.classes : [];

  return {
    classes: classes.map((classData) => parseClassDefinition(classData)),
  };
}

/**
 * Parse a class definition from Weaviate response
 *
 * @param data - Raw class definition data
 * @returns Parsed class definition
 *
 * @example
 * ```typescript
 * const response = await fetch('/v1/schema/Article');
 * const data = await response.json();
 * const classDef = parseClassDefinition(data);
 * ```
 */
export function parseClassDefinition(data: unknown): ClassDefinition {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid class definition: expected object');
  }

  const obj = data as Record<string, unknown>;

  const name = typeof obj.class === 'string' ? obj.class : '';
  const description = typeof obj.description === 'string' ? obj.description : undefined;
  const vectorizer = typeof obj.vectorizer === 'string' ? obj.vectorizer : 'none';
  const moduleConfig = obj.moduleConfig as Record<string, unknown> | undefined;

  const properties = Array.isArray(obj.properties)
    ? obj.properties.map((prop) => parsePropertyDefinition(prop))
    : [];

  const vectorIndexConfig = obj.vectorIndexConfig
    ? parseVectorIndexConfig(obj.vectorIndexConfig)
    : undefined;

  const vectorIndexType = typeof obj.vectorIndexType === 'string'
    ? (obj.vectorIndexType as 'hnsw' | 'flat' | 'dynamic')
    : undefined;

  const invertedIndexConfig = obj.invertedIndexConfig
    ? parseInvertedIndexConfig(obj.invertedIndexConfig)
    : undefined;

  const replicationConfig = obj.replicationConfig
    ? parseReplicationConfig(obj.replicationConfig)
    : undefined;

  const shardingConfig = obj.shardingConfig
    ? parseShardingConfig(obj.shardingConfig)
    : undefined;

  const multiTenancyConfig = obj.multiTenancyConfig
    ? parseMultiTenancyConfig(obj.multiTenancyConfig)
    : undefined;

  return {
    name,
    description,
    vectorizer,
    moduleConfig,
    properties,
    vectorIndexConfig,
    vectorIndexType,
    invertedIndexConfig,
    replicationConfig,
    shardingConfig,
    multiTenancyConfig,
  };
}

/**
 * Parse a property definition from Weaviate response
 *
 * @param data - Raw property definition data
 * @returns Parsed property definition
 */
export function parsePropertyDefinition(data: unknown): PropertyDefinition {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid property definition: expected object');
  }

  const obj = data as Record<string, unknown>;

  const name = typeof obj.name === 'string' ? obj.name : '';
  const dataType = Array.isArray(obj.dataType) ? obj.dataType.map(String) : [];
  const description = typeof obj.description === 'string' ? obj.description : undefined;

  const tokenization = obj.tokenization
    ? parseTokenization(String(obj.tokenization))
    : undefined;

  const indexFilterable = typeof obj.indexFilterable === 'boolean'
    ? obj.indexFilterable
    : undefined;

  const indexSearchable = typeof obj.indexSearchable === 'boolean'
    ? obj.indexSearchable
    : undefined;

  const indexInverted = typeof obj.indexInverted === 'boolean'
    ? obj.indexInverted
    : undefined;

  const moduleConfig = obj.moduleConfig as Record<string, unknown> | undefined;

  return {
    name,
    dataType,
    description,
    tokenization,
    indexFilterable,
    indexSearchable,
    indexInverted,
    moduleConfig,
  };
}

/**
 * Parse vector index configuration from Weaviate response
 *
 * @param data - Raw vector index config data
 * @returns Parsed vector index configuration
 */
export function parseVectorIndexConfig(data: unknown): VectorIndexConfig {
  if (!data || typeof data !== 'object') {
    return { distance: DistanceMetric.Cosine };
  }

  const obj = data as Record<string, unknown>;

  const distance = obj.distance
    ? parseDistanceMetric(String(obj.distance))
    : DistanceMetric.Cosine;

  const ef = typeof obj.ef === 'number' ? obj.ef : undefined;
  const efConstruction = typeof obj.efConstruction === 'number' ? obj.efConstruction : undefined;
  const maxConnections = typeof obj.maxConnections === 'number' ? obj.maxConnections : undefined;
  const dynamicEfMin = typeof obj.dynamicEfMin === 'number' ? obj.dynamicEfMin : undefined;
  const dynamicEfMax = typeof obj.dynamicEfMax === 'number' ? obj.dynamicEfMax : undefined;
  const dynamicEfFactor = typeof obj.dynamicEfFactor === 'number' ? obj.dynamicEfFactor : undefined;
  const vectorCacheMaxObjects = typeof obj.vectorCacheMaxObjects === 'number'
    ? obj.vectorCacheMaxObjects
    : undefined;
  const flatSearchCutoff = typeof obj.flatSearchCutoff === 'number'
    ? obj.flatSearchCutoff
    : undefined;
  const skip = typeof obj.skip === 'boolean' ? obj.skip : undefined;
  const cleanupIntervalSeconds = typeof obj.cleanupIntervalSeconds === 'number'
    ? obj.cleanupIntervalSeconds
    : undefined;

  const pq = obj.pq && typeof obj.pq === 'object' ? (obj.pq as Record<string, unknown>) : undefined;

  return {
    distance,
    ef,
    efConstruction,
    maxConnections,
    dynamicEfMin,
    dynamicEfMax,
    dynamicEfFactor,
    vectorCacheMaxObjects,
    flatSearchCutoff,
    skip,
    pq: pq ? {
      enabled: typeof pq.enabled === 'boolean' ? pq.enabled : false,
      segments: typeof pq.segments === 'number' ? pq.segments : undefined,
      centroids: typeof pq.centroids === 'number' ? pq.centroids : undefined,
      trainingLimit: typeof pq.trainingLimit === 'number' ? pq.trainingLimit : undefined,
      encoder: pq.encoder && typeof pq.encoder === 'object'
        ? {
            type: typeof (pq.encoder as Record<string, unknown>).type === 'string'
              ? String((pq.encoder as Record<string, unknown>).type)
              : undefined,
            distribution: typeof (pq.encoder as Record<string, unknown>).distribution === 'string'
              ? String((pq.encoder as Record<string, unknown>).distribution)
              : undefined,
          }
        : undefined,
    } : undefined,
    cleanupIntervalSeconds,
  };
}

/**
 * Parse inverted index configuration from Weaviate response
 *
 * @param data - Raw inverted index config data
 * @returns Parsed inverted index configuration
 */
export function parseInvertedIndexConfig(data: unknown): InvertedIndexConfig {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const obj = data as Record<string, unknown>;

  const bm25 = obj.bm25 && typeof obj.bm25 === 'object'
    ? {
        b: typeof (obj.bm25 as Record<string, unknown>).b === 'number'
          ? (obj.bm25 as Record<string, unknown>).b as number
          : 0.75,
        k1: typeof (obj.bm25 as Record<string, unknown>).k1 === 'number'
          ? (obj.bm25 as Record<string, unknown>).k1 as number
          : 1.2,
      }
    : undefined;

  const cleanupIntervalSeconds = typeof obj.cleanupIntervalSeconds === 'number'
    ? obj.cleanupIntervalSeconds
    : undefined;

  const stopwords = obj.stopwords && typeof obj.stopwords === 'object'
    ? {
        preset: typeof (obj.stopwords as Record<string, unknown>).preset === 'string'
          ? String((obj.stopwords as Record<string, unknown>).preset)
          : undefined,
        additions: Array.isArray((obj.stopwords as Record<string, unknown>).additions)
          ? ((obj.stopwords as Record<string, unknown>).additions as unknown[]).map(String)
          : undefined,
        removals: Array.isArray((obj.stopwords as Record<string, unknown>).removals)
          ? ((obj.stopwords as Record<string, unknown>).removals as unknown[]).map(String)
          : undefined,
      }
    : undefined;

  const indexTimestamps = typeof obj.indexTimestamps === 'boolean'
    ? obj.indexTimestamps
    : undefined;

  const indexNullState = typeof obj.indexNullState === 'boolean'
    ? obj.indexNullState
    : undefined;

  const indexPropertyLength = typeof obj.indexPropertyLength === 'boolean'
    ? obj.indexPropertyLength
    : undefined;

  return {
    bm25,
    cleanupIntervalSeconds,
    stopwords,
    indexTimestamps,
    indexNullState,
    indexPropertyLength,
  };
}

/**
 * Parse replication configuration from Weaviate response
 *
 * @param data - Raw replication config data
 * @returns Parsed replication configuration
 */
export function parseReplicationConfig(data: unknown): ReplicationConfig {
  if (!data || typeof data !== 'object') {
    return { factor: 1 };
  }

  const obj = data as Record<string, unknown>;

  const factor = typeof obj.factor === 'number' ? obj.factor : 1;
  const asyncEnabled = typeof obj.asyncEnabled === 'boolean'
    ? obj.asyncEnabled
    : undefined;

  return {
    factor,
    asyncEnabled,
  };
}

/**
 * Parse sharding configuration from Weaviate response
 *
 * @param data - Raw sharding config data
 * @returns Parsed sharding configuration
 */
export function parseShardingConfig(data: unknown): ShardingConfig {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const obj = data as Record<string, unknown>;

  return {
    virtualPerPhysical: typeof obj.virtualPerPhysical === 'number'
      ? obj.virtualPerPhysical
      : undefined,
    desiredCount: typeof obj.desiredCount === 'number'
      ? obj.desiredCount
      : undefined,
    actualCount: typeof obj.actualCount === 'number'
      ? obj.actualCount
      : undefined,
    desiredVirtualCount: typeof obj.desiredVirtualCount === 'number'
      ? obj.desiredVirtualCount
      : undefined,
    actualVirtualCount: typeof obj.actualVirtualCount === 'number'
      ? obj.actualVirtualCount
      : undefined,
    key: typeof obj.key === 'string' ? obj.key : undefined,
    strategy: typeof obj.strategy === 'string' ? obj.strategy : undefined,
    function: typeof obj.function === 'string' ? obj.function : undefined,
  };
}

/**
 * Parse multi-tenancy configuration from Weaviate response
 *
 * @param data - Raw multi-tenancy config data
 * @returns Parsed multi-tenancy configuration
 */
export function parseMultiTenancyConfig(data: unknown): MultiTenancyConfig {
  if (!data || typeof data !== 'object') {
    return { enabled: false };
  }

  const obj = data as Record<string, unknown>;

  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
  const autoTenantCreation = typeof obj.autoTenantCreation === 'boolean'
    ? obj.autoTenantCreation
    : undefined;
  const autoTenantActivation = typeof obj.autoTenantActivation === 'boolean'
    ? obj.autoTenantActivation
    : undefined;

  return {
    enabled,
    autoTenantCreation,
    autoTenantActivation,
  };
}

/**
 * Parse shard information from Weaviate response
 *
 * @param data - Raw shard info data
 * @returns Parsed shard information
 */
export function parseShardInfo(data: unknown): ShardInfo {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid shard info: expected object');
  }

  const obj = data as Record<string, unknown>;

  const name = typeof obj.name === 'string' ? obj.name : '';
  const status = obj.status ? parseShardStatus(String(obj.status)) : ShardStatus.Ready;
  const objectCount = typeof obj.objectCount === 'number' ? obj.objectCount : 0;
  const vectorIndexingStatus = typeof obj.vectorIndexingStatus === 'string'
    ? obj.vectorIndexingStatus
    : undefined;
  const vectorQueueLength = typeof obj.vectorQueueLength === 'number'
    ? obj.vectorQueueLength
    : undefined;
  const compressed = typeof obj.compressed === 'boolean'
    ? obj.compressed
    : undefined;

  return {
    name,
    status,
    objectCount,
    vectorIndexingStatus,
    vectorQueueLength,
    compressed,
  };
}

/**
 * Parse shard status string to enum
 *
 * @param status - Raw status string
 * @returns Parsed shard status
 */
export function parseShardStatus(status: string): ShardStatus {
  const normalized = status.toUpperCase();

  switch (normalized) {
    case 'READY':
      return ShardStatus.Ready;
    case 'READONLY':
    case 'READ_ONLY':
      return ShardStatus.ReadOnly;
    case 'INDEXING':
      return ShardStatus.Indexing;
    case 'INITIALIZING':
      return ShardStatus.Initializing;
    default:
      // Default to READY for unknown statuses
      return ShardStatus.Ready;
  }
}

/**
 * Parse tokenization string to enum
 *
 * @param tokenization - Raw tokenization string
 * @returns Parsed tokenization strategy
 */
export function parseTokenization(tokenization: string): Tokenization {
  const normalized = tokenization.toLowerCase();

  switch (normalized) {
    case 'word':
      return Tokenization.Word;
    case 'lowercase':
      return Tokenization.Lowercase;
    case 'whitespace':
      return Tokenization.Whitespace;
    case 'field':
      return Tokenization.Field;
    case 'trigram':
      return Tokenization.Trigram;
    case 'gse':
      return Tokenization.Gse;
    default:
      // Default to word tokenization
      return Tokenization.Word;
  }
}

/**
 * Parse distance metric string to enum
 *
 * @param distance - Raw distance metric string
 * @returns Parsed distance metric
 */
function parseDistanceMetric(distance: string): DistanceMetric {
  const normalized = distance.toLowerCase();

  switch (normalized) {
    case 'cosine':
      return DistanceMetric.Cosine;
    case 'dot':
      return DistanceMetric.Dot;
    case 'l2-squared':
    case 'l2_squared':
      return DistanceMetric.L2Squared;
    case 'manhattan':
      return DistanceMetric.Manhattan;
    case 'hamming':
      return DistanceMetric.Hamming;
    default:
      // Default to cosine
      return DistanceMetric.Cosine;
  }
}
