/**
 * Weaviate schema types
 *
 * This module defines types for Weaviate schema introspection.
 * Note: Schema creation and modification is out of scope - these types
 * are for reading existing schema definitions only.
 */

import type { DistanceMetric, PQConfig } from './vector.js';

/**
 * Tokenization strategies for text properties
 */
export enum Tokenization {
  /**
   * Split on word boundaries
   */
  Word = 'word',

  /**
   * Lowercase and split on word boundaries
   */
  Lowercase = 'lowercase',

  /**
   * Split on whitespace only
   */
  Whitespace = 'whitespace',

  /**
   * Treat entire field as single token
   */
  Field = 'field',

  /**
   * Split into character trigrams
   */
  Trigram = 'trigram',

  /**
   * GSE tokenizer for CJK (Chinese, Japanese, Korean) text
   */
  Gse = 'gse',
}

/**
 * Shard status
 */
export enum ShardStatus {
  /**
   * Shard is ready for operations
   */
  Ready = 'READY',

  /**
   * Shard is read-only
   */
  ReadOnly = 'READONLY',

  /**
   * Shard is currently indexing
   */
  Indexing = 'INDEXING',

  /**
   * Shard is initializing
   */
  Initializing = 'INITIALIZING',
}

/**
 * Property definition
 *
 * Defines a single property in a Weaviate class schema.
 */
export interface PropertyDefinition {
  /**
   * Property name
   */
  name: string;

  /**
   * Data type(s)
   * Can be: "text", "int", "number", "boolean", "date", "uuid",
   * "text[]", "int[]", "number[]", "boolean[]", "date[]", "uuid[]",
   * "geoCoordinates", "phoneNumber", "blob",
   * or a class name for references (e.g., "Author")
   */
  dataType: string[];

  /**
   * Property description
   */
  description?: string;

  /**
   * Tokenization strategy (for text properties)
   */
  tokenization?: Tokenization;

  /**
   * Whether this property can be used in filters
   */
  indexFilterable?: boolean;

  /**
   * Whether this property is searchable (BM25)
   */
  indexSearchable?: boolean;

  /**
   * Whether this property is indexed in inverted index
   * @deprecated Use indexFilterable and indexSearchable instead
   */
  indexInverted?: boolean;

  /**
   * Module-specific configuration
   */
  moduleConfig?: Record<string, unknown>;
}

/**
 * Inverted index configuration
 */
export interface InvertedIndexConfig {
  /**
   * BM25 configuration
   */
  bm25?: {
    /**
     * BM25 b parameter (0-1)
     */
    b: number;

    /**
     * BM25 k1 parameter
     */
    k1: number;
  };

  /**
   * Cleanup interval in seconds
   */
  cleanupIntervalSeconds?: number;

  /**
   * Stopwords configuration
   */
  stopwords?: {
    /**
     * Preset stopwords list
     */
    preset?: string;

    /**
     * Additional stopwords
     */
    additions?: string[];

    /**
     * Stopwords to remove from preset
     */
    removals?: string[];
  };

  /**
   * Index timestamps
   */
  indexTimestamps?: boolean;

  /**
   * Index null state
   */
  indexNullState?: boolean;

  /**
   * Index property length
   */
  indexPropertyLength?: boolean;
}

/**
 * Vector index configuration
 */
export interface VectorIndexConfig {
  /**
   * Distance metric
   */
  distance: DistanceMetric;

  /**
   * Size of dynamic candidate list for search (default: 100)
   */
  ef?: number;

  /**
   * Size of dynamic candidate list during construction (default: 128)
   */
  efConstruction?: number;

  /**
   * Maximum number of connections per layer (default: 32)
   */
  maxConnections?: number;

  /**
   * Minimum value for dynamic ef (default: 100)
   */
  dynamicEfMin?: number;

  /**
   * Maximum value for dynamic ef (default: 500)
   */
  dynamicEfMax?: number;

  /**
   * Factor for dynamic ef calculation (default: 8)
   */
  dynamicEfFactor?: number;

  /**
   * Maximum objects in vector cache (default: 1000000000000)
   */
  vectorCacheMaxObjects?: number;

  /**
   * Threshold for flat search vs HNSW (default: 40000)
   */
  flatSearchCutoff?: number;

  /**
   * Whether to skip vector indexing
   */
  skip?: boolean;

  /**
   * Product Quantization configuration
   */
  pq?: PQConfig;

  /**
   * Cleanup interval in seconds
   */
  cleanupIntervalSeconds?: number;
}

/**
 * Replication configuration
 */
export interface ReplicationConfig {
  /**
   * Replication factor (number of replicas)
   */
  factor: number;

  /**
   * Async replication enabled
   */
  asyncEnabled?: boolean;
}

/**
 * Sharding configuration
 */
export interface ShardingConfig {
  /**
   * Virtual shards per physical shard
   */
  virtualPerPhysical?: number;

  /**
   * Desired shard count
   */
  desiredCount?: number;

  /**
   * Actual shard count
   */
  actualCount?: number;

  /**
   * Desired virtual count
   */
  desiredVirtualCount?: number;

  /**
   * Actual virtual count
   */
  actualVirtualCount?: number;

  /**
   * Sharding key (property to shard by)
   */
  key?: string;

  /**
   * Sharding strategy
   */
  strategy?: string;

  /**
   * Sharding function
   */
  function?: string;
}

/**
 * Multi-tenancy configuration
 */
export interface MultiTenancyConfig {
  /**
   * Whether multi-tenancy is enabled
   */
  enabled: boolean;

  /**
   * Auto-tenant creation enabled
   */
  autoTenantCreation?: boolean;

  /**
   * Auto-tenant activation enabled
   */
  autoTenantActivation?: boolean;
}

/**
 * Class definition
 *
 * Defines a Weaviate class (collection) with its schema and configuration.
 *
 * @example
 * ```typescript
 * const classDef: ClassDefinition = {
 *   name: "Article",
 *   description: "A news article",
 *   vectorizer: "text2vec-openai",
 *   properties: [
 *     {
 *       name: "title",
 *       dataType: ["text"],
 *       tokenization: Tokenization.Word,
 *       indexFilterable: true,
 *       indexSearchable: true
 *     },
 *     {
 *       name: "content",
 *       dataType: ["text"],
 *       tokenization: Tokenization.Word,
 *       indexSearchable: true
 *     }
 *   ],
 *   vectorIndexConfig: {
 *     distance: DistanceMetric.Cosine,
 *     ef: 100,
 *     efConstruction: 128
 *   }
 * };
 * ```
 */
export interface ClassDefinition {
  /**
   * Class name (capitalized)
   */
  name: string;

  /**
   * Class description
   */
  description?: string;

  /**
   * Vectorizer module name
   * Examples: "text2vec-openai", "text2vec-huggingface", "none"
   */
  vectorizer: string;

  /**
   * Module-specific configuration
   */
  moduleConfig?: Record<string, unknown>;

  /**
   * Property definitions
   */
  properties: PropertyDefinition[];

  /**
   * Vector index configuration
   */
  vectorIndexConfig?: VectorIndexConfig;

  /**
   * Vector index type
   */
  vectorIndexType?: 'hnsw' | 'flat' | 'dynamic';

  /**
   * Inverted index configuration
   */
  invertedIndexConfig?: InvertedIndexConfig;

  /**
   * Replication configuration
   */
  replicationConfig?: ReplicationConfig;

  /**
   * Sharding configuration
   */
  shardingConfig?: ShardingConfig;

  /**
   * Multi-tenancy configuration
   */
  multiTenancyConfig?: MultiTenancyConfig;
}

/**
 * Complete schema
 */
export interface Schema {
  /**
   * Array of class definitions
   */
  classes: ClassDefinition[];
}

/**
 * Shard information
 */
export interface ShardInfo {
  /**
   * Shard name
   */
  name: string;

  /**
   * Shard status
   */
  status: ShardStatus;

  /**
   * Number of objects in this shard
   */
  objectCount: number;

  /**
   * Vector indexing status
   */
  vectorIndexingStatus?: string;

  /**
   * Vector queue length
   */
  vectorQueueLength?: number;

  /**
   * Compressed status
   */
  compressed?: boolean;
}

/**
 * Shards response
 */
export interface ShardsResponse {
  /**
   * Class name
   */
  className: string;

  /**
   * Array of shard information
   */
  shards: ShardInfo[];
}

/**
 * Get schema request
 */
export interface GetSchemaRequest {
  /**
   * Optional class name to get specific class
   */
  className?: string;
}

/**
 * Get class request
 */
export interface GetClassRequest {
  /**
   * Name of the class to retrieve
   */
  className: string;
}

/**
 * List classes response
 */
export interface ListClassesResponse {
  /**
   * Array of class names
   */
  classes: string[];
}

/**
 * Get shards request
 */
export interface GetShardsRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Optional tenant name (for multi-tenant classes)
   */
  tenant?: string;
}

/**
 * Type guard to check if a property is a text property
 *
 * @param property - The property to check
 * @returns True if the property is a text type
 */
export function isTextProperty(property: PropertyDefinition): boolean {
  return property.dataType.some((type) =>
    type.toLowerCase().includes('text')
  );
}

/**
 * Type guard to check if a property is a reference property
 *
 * @param property - The property to check
 * @returns True if the property is a reference
 */
export function isReferenceProperty(property: PropertyDefinition): boolean {
  // Reference properties have class names as data types (capitalized)
  return property.dataType.some(
    (type) => type[0] === type[0].toUpperCase() && !type.includes('[')
  );
}

/**
 * Type guard to check if a property is an array property
 *
 * @param property - The property to check
 * @returns True if the property is an array type
 */
export function isArrayProperty(property: PropertyDefinition): boolean {
  return property.dataType.some((type) => type.includes('[]'));
}

/**
 * Gets the base data type from a property definition
 *
 * @param property - The property definition
 * @returns Base data type without array notation
 */
export function getBaseDataType(property: PropertyDefinition): string {
  const firstType = property.dataType[0];
  return firstType.replace('[]', '');
}
