/**
 * Collection module for Qdrant integration.
 *
 * This module provides comprehensive collection management capabilities:
 *
 * ## CollectionClient
 * Main client class for collection-scoped operations:
 * - create() - Create a single-vector collection
 * - createWithNamedVectors() - Create a multi-vector collection
 * - info() - Get collection information and status
 * - exists() - Check if collection exists
 * - delete() - Delete the collection
 * - updateParams() - Update collection parameters
 *
 * ## Types and Configuration
 * - CollectionConfig - Builder pattern for collection configuration
 * - Distance - Distance metrics (Cosine, Euclidean, Dot, Manhattan)
 * - VectorConfig - Vector space configuration
 * - HnswConfig - HNSW index parameters
 * - QuantizationConfig - Compression configurations
 * - CollectionInfo - Collection information and status
 *
 * @example
 * ```typescript
 * import { CollectionClient, Distance, CollectionConfig } from './collection';
 *
 * // Create a collection client
 * const collection = new CollectionClient(qdrantClient, 'my_collection');
 *
 * // Create with builder pattern
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
 * console.log(`Points: ${info.pointsCount}, Status: ${info.status}`);
 *
 * // Check existence
 * if (await collection.exists()) {
 *   await collection.delete();
 * }
 * ```
 *
 * @module collection
 */

// Export the main client class
export { CollectionClient } from './client.js';
export type { QdrantClientInterface } from './client.js';

// Export all types
export {
  Distance,
  VectorDataType,
  CollectionStatus,
  PayloadSchemaType,
} from './types.js';

export type {
  HnswConfig,
  ScalarQuantizationConfig,
  ProductQuantizationConfig,
  BinaryQuantizationConfig,
  QuantizationConfig,
  VectorConfig,
  WriteConsistencyFactor,
  CollectionConfig as CollectionConfigType,
  SparseVectorConfig,
  OptimizersConfig,
  WalConfig,
  UpdateParams,
  OptimizerStatus,
  PayloadSchemaInfo,
  CollectionInfo,
  CollectionExistsInfo,
} from './types.js';

// Export the builder
export { CollectionConfigBuilder as CollectionConfig } from './types.js';
