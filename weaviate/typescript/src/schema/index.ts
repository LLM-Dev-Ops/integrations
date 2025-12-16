/**
 * Schema Module - Main Exports
 *
 * Provides schema introspection capabilities for the Weaviate integration.
 * This module is read-only - it does not support schema creation or modification.
 *
 * Features:
 * - Schema introspection (get schema, list classes, get class definitions)
 * - Shard information retrieval
 * - Schema caching with TTL
 * - Schema parsing and validation
 * - Helper utilities for working with schemas
 * - Error handling with automatic cache invalidation
 *
 * @module @weaviate/schema
 *
 * @example
 * ```typescript
 * import { SchemaService, SchemaCache } from '@weaviate/schema';
 * import { createTransport } from '@weaviate/transport';
 * import { createObservability } from '@weaviate/observability';
 *
 * // Create dependencies
 * const transport = createTransport(baseUrl, authProvider);
 * const observability = createObservability();
 *
 * // Create schema service
 * const schemaService = new SchemaService(transport, observability);
 *
 * // Optional: Add caching
 * const schemaCache = new SchemaCache(schemaService, 300); // 5-minute TTL
 *
 * // Get full schema
 * const schema = await schemaService.getSchema();
 * console.log(`Found ${schema.classes.length} classes`);
 *
 * // Get specific class (with caching)
 * const articleClass = await schemaCache.getClass('Article');
 * console.log(`Article has ${articleClass.properties.length} properties`);
 *
 * // Check cache stats
 * const stats = schemaCache.getStats();
 * console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
 * ```
 */

// ============================================================================
// Service Exports
// ============================================================================

export { SchemaService } from './service.js';
export { SchemaCache } from './cache.js';
export type { CacheStats } from './cache.js';

// ============================================================================
// Parser Exports
// ============================================================================

export {
  parseSchema,
  parseClassDefinition,
  parsePropertyDefinition,
  parseVectorIndexConfig,
  parseInvertedIndexConfig,
  parseReplicationConfig,
  parseShardingConfig,
  parseMultiTenancyConfig,
  parseShardInfo,
  parseShardStatus,
  parseTokenization,
} from './parser.js';

// ============================================================================
// Helper Exports
// ============================================================================

export {
  isTextProperty,
  isReferenceProperty,
  isArrayProperty,
  getBaseDataType,
  findProperty,
  getVectorDimension,
  hasVectorizer,
  getVectorizerModule,
  isMultiTenancyEnabled,
  getPropertyCount,
  getTextProperties,
  getReferenceProperties,
  getArrayProperties,
  getSearchableProperties,
  getFilterableProperties,
  getReplicationFactor,
  hasAsyncReplication,
  getDistanceMetric,
  isPQEnabled,
} from './helpers.js';

// ============================================================================
// Error Handler Exports
// ============================================================================

export {
  handleSchemaError,
  isSchemaError,
  withSchemaRefresh,
  invalidateCacheOnError,
  extractClassNameFromError,
  createSchemaValidationError,
  batchInvalidateCache,
  conditionallyInvalidateCache,
} from './error-handler.js';

// ============================================================================
// Re-export Schema Types for Convenience
// ============================================================================

export type {
  Schema,
  ClassDefinition,
  PropertyDefinition,
  VectorIndexConfig,
  InvertedIndexConfig,
  ReplicationConfig,
  ShardingConfig,
  MultiTenancyConfig,
  ShardInfo,
  ShardsResponse,
  GetSchemaRequest,
  GetClassRequest,
  ListClassesResponse,
  GetShardsRequest,
} from '../types/schema.js';

export { Tokenization, ShardStatus } from '../types/schema.js';

// ============================================================================
// Convenience Factory Functions
// ============================================================================

import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import { SchemaService } from './service.js';
import { SchemaCache } from './cache.js';

/**
 * Create a schema service instance
 *
 * Factory function to create a new SchemaService with the provided dependencies.
 *
 * @param transport - HTTP transport for API requests
 * @param observability - Observability context for tracing and metrics
 * @returns Configured SchemaService instance
 *
 * @example
 * ```typescript
 * const schemaService = createSchemaService(transport, observability);
 * const schema = await schemaService.getSchema();
 * ```
 */
export function createSchemaService(
  transport: HttpTransport,
  observability: ObservabilityContext
): SchemaService {
  return new SchemaService(transport, observability);
}

/**
 * Create a schema cache instance
 *
 * Factory function to create a new SchemaCache with the provided schema service.
 *
 * @param schemaService - Schema service for fetching class definitions
 * @param ttlSeconds - Cache TTL in seconds (default: 300 = 5 minutes)
 * @returns Configured SchemaCache instance
 *
 * @example
 * ```typescript
 * // Default 5-minute TTL
 * const cache = createSchemaCache(schemaService);
 *
 * // Custom 1-minute TTL
 * const fastCache = createSchemaCache(schemaService, 60);
 * ```
 */
export function createSchemaCache(
  schemaService: SchemaService,
  ttlSeconds?: number
): SchemaCache {
  return new SchemaCache(schemaService, ttlSeconds);
}

/**
 * Create a complete schema setup with service and cache
 *
 * Convenience function to create both a schema service and cache in one call.
 *
 * @param transport - HTTP transport for API requests
 * @param observability - Observability context for tracing and metrics
 * @param cacheTtlSeconds - Cache TTL in seconds (default: 300 = 5 minutes)
 * @returns Object containing both service and cache
 *
 * @example
 * ```typescript
 * const { service, cache } = createSchemaSetup(transport, observability);
 *
 * // Use service directly
 * const schema = await service.getSchema();
 *
 * // Use cache for repeated access
 * const articleClass = await cache.getClass('Article');
 * ```
 */
export function createSchemaSetup(
  transport: HttpTransport,
  observability: ObservabilityContext,
  cacheTtlSeconds?: number
): { service: SchemaService; cache: SchemaCache } {
  const service = createSchemaService(transport, observability);
  const cache = createSchemaCache(service, cacheTtlSeconds);

  return { service, cache };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  SchemaService,
  SchemaCache,
  createSchemaService,
  createSchemaCache,
  createSchemaSetup,
};
