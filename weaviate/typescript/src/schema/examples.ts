/**
 * Schema Service Examples
 *
 * Comprehensive examples demonstrating all features of the schema module.
 * These examples show real-world usage patterns and best practices.
 *
 * @module @weaviate/schema/examples
 */

import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import {
  SchemaService,
  SchemaCache,
  createSchemaSetup,
  isTextProperty,
  isReferenceProperty,
  findProperty,
  getTextProperties,
  getSearchableProperties,
  hasVectorizer,
  getVectorizerModule,
  isMultiTenancyEnabled,
  withSchemaRefresh,
} from './index.js';

// ============================================================================
// Example 1: Basic Schema Introspection
// ============================================================================

/**
 * Example: Get and inspect complete schema
 */
export async function example1_BasicSchemaIntrospection(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  // Create service
  const service = new SchemaService(transport, observability);

  // Get complete schema
  const schema = await service.getSchema();
  console.log(`Found ${schema.classes.length} classes in schema`);

  // List all classes
  for (const classDef of schema.classes) {
    console.log(`\nClass: ${classDef.name}`);
    console.log(`  Description: ${classDef.description ?? 'N/A'}`);
    console.log(`  Vectorizer: ${classDef.vectorizer}`);
    console.log(`  Properties: ${classDef.properties.length}`);
    console.log(`  Index type: ${classDef.vectorIndexType ?? 'hnsw'}`);
  }
}

// ============================================================================
// Example 2: Working with Specific Classes
// ============================================================================

/**
 * Example: Get and analyze specific class definition
 */
export async function example2_SpecificClassInspection(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const service = new SchemaService(transport, observability);

  // Get specific class
  const classDef = await service.getClass('Article');

  if (!classDef) {
    console.log('Article class not found');
    return;
  }

  console.log(`Class: ${classDef.name}`);
  console.log(`Vectorizer: ${classDef.vectorizer}`);

  // Analyze properties
  console.log('\nProperties:');
  for (const prop of classDef.properties) {
    const dataType = prop.dataType.join(', ');
    const searchable = prop.indexSearchable ? '🔍' : '';
    const filterable = prop.indexFilterable ? '🔧' : '';
    console.log(`  ${prop.name}: ${dataType} ${searchable}${filterable}`);

    if (isTextProperty(prop)) {
      console.log(`    Tokenization: ${prop.tokenization}`);
    }
  }

  // Vector index configuration
  if (classDef.vectorIndexConfig) {
    console.log('\nVector Index:');
    console.log(`  Distance: ${classDef.vectorIndexConfig.distance}`);
    console.log(`  EF: ${classDef.vectorIndexConfig.ef}`);
    console.log(`  EF Construction: ${classDef.vectorIndexConfig.efConstruction}`);
  }

  // Multi-tenancy
  if (isMultiTenancyEnabled(classDef)) {
    console.log('\n✓ Multi-tenancy enabled');
  }
}

// ============================================================================
// Example 3: Using Schema Cache
// ============================================================================

/**
 * Example: Efficient schema access with caching
 */
export async function example3_SchemaCache(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  // Create service and cache
  const service = new SchemaService(transport, observability);
  const cache = new SchemaCache(service, 300); // 5-minute TTL

  // First access - cache miss
  console.log('First access (cache miss)...');
  const classDef1 = await cache.getClass('Article');
  console.log(`Loaded ${classDef1.name} with ${classDef1.properties.length} properties`);

  // Second access - cache hit
  console.log('\nSecond access (cache hit)...');
  const classDef2 = await cache.getClass('Article');
  console.log(`Retrieved ${classDef2.name} from cache`);

  // Check cache statistics
  const stats = cache.getStats();
  console.log('\nCache Statistics:');
  console.log(`  Size: ${stats.size}`);
  console.log(`  Hits: ${stats.hits}`);
  console.log(`  Misses: ${stats.misses}`);
  console.log(`  Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

  // Get cached classes
  const cached = cache.getCachedClasses();
  console.log(`\nCached classes: ${cached.join(', ')}`);
}

// ============================================================================
// Example 4: Helper Functions
// ============================================================================

/**
 * Example: Using helper functions for schema analysis
 */
export async function example4_HelperFunctions(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const service = new SchemaService(transport, observability);
  const classDef = await service.getClass('Article');

  if (!classDef) return;

  // Find specific property
  const titleProp = findProperty(classDef, 'title');
  if (titleProp) {
    console.log(`Title property: ${titleProp.dataType[0]}`);
    if (isTextProperty(titleProp)) {
      console.log(`  Tokenization: ${titleProp.tokenization}`);
    }
  }

  // Get properties by type
  const textProps = getTextProperties(classDef);
  console.log(`\nText properties (${textProps.length}):`);
  textProps.forEach((p) => console.log(`  - ${p.name}`));

  const searchableProps = getSearchableProperties(classDef);
  console.log(`\nSearchable properties (${searchableProps.length}):`);
  searchableProps.forEach((p) => console.log(`  - ${p.name}`));

  // Check vectorization
  if (hasVectorizer(classDef)) {
    const vectorizer = getVectorizerModule(classDef);
    console.log(`\nAutomatic vectorization: ${vectorizer}`);
  } else {
    console.log('\nManual vectors required');
  }

  // Check multi-tenancy
  if (isMultiTenancyEnabled(classDef)) {
    console.log('Multi-tenancy: ENABLED');
    console.log('Tenant parameter required for all operations');
  } else {
    console.log('Multi-tenancy: DISABLED');
  }
}

// ============================================================================
// Example 5: Shard Information
// ============================================================================

/**
 * Example: Get and analyze shard information
 */
export async function example5_ShardInformation(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const service = new SchemaService(transport, observability);

  try {
    const shards = await service.getShards('Article');

    console.log(`Article class has ${shards.length} shard(s)\n`);

    for (const shard of shards) {
      console.log(`Shard: ${shard.name}`);
      console.log(`  Status: ${shard.status}`);
      console.log(`  Objects: ${shard.objectCount}`);
      console.log(`  Vector indexing: ${shard.vectorIndexingStatus ?? 'N/A'}`);

      if (shard.vectorQueueLength !== undefined) {
        console.log(`  Vector queue: ${shard.vectorQueueLength}`);
      }

      if (shard.compressed) {
        console.log('  Compression: ENABLED');
      }
      console.log();
    }

    // Calculate totals
    const totalObjects = shards.reduce((sum, s) => sum + s.objectCount, 0);
    console.log(`Total objects across shards: ${totalObjects}`);
  } catch (error) {
    console.error('Failed to get shard information:', error);
  }
}

// ============================================================================
// Example 6: Error Handling with Cache Invalidation
// ============================================================================

/**
 * Example: Automatic cache invalidation on schema errors
 */
export async function example6_ErrorHandling(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const service = new SchemaService(transport, observability);
  const cache = new SchemaCache(service, 300);

  // Example operation that might fail on stale schema
  async function validateObjectAgainstSchema(
    className: string,
    properties: Record<string, unknown>
  ): Promise<boolean> {
    const schema = await cache.getClass(className);

    // Validate each property exists in schema
    for (const propName of Object.keys(properties)) {
      const prop = findProperty(schema, propName);
      if (!prop) {
        throw new Error(`Property '${propName}' not found in schema`);
      }
    }

    return true;
  }

  // Use withSchemaRefresh for automatic retry on schema errors
  try {
    const result = await withSchemaRefresh(
      cache,
      'Article',
      async () => {
        return await validateObjectAgainstSchema('Article', {
          title: 'Example',
          content: 'Content',
        });
      }
    );

    console.log('Validation successful:', result);
  } catch (error) {
    console.error('Validation failed:', error);
  }
}

// ============================================================================
// Example 7: Complete Setup with Factory Functions
// ============================================================================

/**
 * Example: Using factory functions for quick setup
 */
export async function example7_FactoryFunctions(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  // Create complete setup with one call
  const { service, cache } = createSchemaSetup(transport, observability, 300);

  // Use service for direct access
  const classes = await service.listClasses();
  console.log(`Available classes: ${classes.join(', ')}`);

  // Use cache for repeated access
  for (const className of classes) {
    const classDef = await cache.getClass(className);
    console.log(`${className}: ${classDef.properties.length} properties`);
  }

  // Check cache performance
  const stats = cache.getStats();
  console.log(`\nCache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
}

// ============================================================================
// Example 8: Property Analysis
// ============================================================================

/**
 * Example: Detailed property analysis
 */
export async function example8_PropertyAnalysis(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const service = new SchemaService(transport, observability);
  const classDef = await service.getClass('Article');

  if (!classDef) return;

  console.log(`Analyzing class: ${classDef.name}\n`);

  // Categorize properties
  const categorized = {
    text: [] as string[],
    references: [] as string[],
    arrays: [] as string[],
    numbers: [] as string[],
    dates: [] as string[],
    other: [] as string[],
  };

  for (const prop of classDef.properties) {
    if (isTextProperty(prop)) {
      categorized.text.push(prop.name);
    } else if (isReferenceProperty(prop)) {
      categorized.references.push(`${prop.name} -> ${prop.dataType[0]}`);
    } else if (prop.dataType.includes('int') || prop.dataType.includes('number')) {
      categorized.numbers.push(prop.name);
    } else if (prop.dataType.includes('date')) {
      categorized.dates.push(prop.name);
    } else {
      categorized.other.push(prop.name);
    }
  }

  // Display categorized properties
  console.log('Property Categories:');
  console.log(`  Text (${categorized.text.length}): ${categorized.text.join(', ')}`);
  console.log(`  References (${categorized.references.length}): ${categorized.references.join(', ')}`);
  console.log(`  Numbers (${categorized.numbers.length}): ${categorized.numbers.join(', ')}`);
  console.log(`  Dates (${categorized.dates.length}): ${categorized.dates.join(', ')}`);
  console.log(`  Other (${categorized.other.length}): ${categorized.other.join(', ')}`);
}

// ============================================================================
// Example 9: Cache Monitoring
// ============================================================================

/**
 * Example: Monitor cache performance over time
 */
export async function example9_CacheMonitoring(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const service = new SchemaService(transport, observability);
  const cache = new SchemaCache(service, 300);

  // Simulate some operations
  await cache.getClass('Article');
  await cache.getClass('Author');
  await cache.getClass('Article'); // Cache hit
  await cache.getClass('Category');
  await cache.getClass('Author'); // Cache hit
  await cache.getClass('Article'); // Cache hit

  // Display statistics
  const stats = cache.getStats();
  console.log('Cache Performance:');
  console.log(`  Entries: ${stats.size}`);
  console.log(`  Total requests: ${stats.hits + stats.misses}`);
  console.log(`  Cache hits: ${stats.hits}`);
  console.log(`  Cache misses: ${stats.misses}`);
  console.log(`  Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

  // Recommendations based on hit rate
  if (stats.hitRate < 0.5) {
    console.log('\n⚠️  Low cache hit rate - consider increasing TTL');
  } else if (stats.hitRate > 0.8) {
    console.log('\n✓ Excellent cache hit rate');
  }

  // Cleanup expired entries
  const removed = cache.cleanup();
  console.log(`\nCleaned up ${removed} expired entries`);
}

// ============================================================================
// Example 10: Multi-Class Operations
// ============================================================================

/**
 * Example: Work with multiple classes efficiently
 */
export async function example10_MultiClassOperations(
  transport: HttpTransport,
  observability: ObservabilityContext
): Promise<void> {
  const { service, cache } = createSchemaSetup(transport, observability);

  // Get all classes
  const classNames = await service.listClasses();
  console.log(`Processing ${classNames.length} classes...\n`);

  // Analyze each class
  const analysis = {
    withVectorizer: [] as string[],
    multiTenant: [] as string[],
    totalProperties: 0,
  };

  for (const className of classNames) {
    const classDef = await cache.getClass(className);

    analysis.totalProperties += classDef.properties.length;

    if (hasVectorizer(classDef)) {
      const vectorizer = getVectorizerModule(classDef);
      analysis.withVectorizer.push(`${className} (${vectorizer})`);
    }

    if (isMultiTenancyEnabled(classDef)) {
      analysis.multiTenant.push(className);
    }
  }

  // Display analysis
  console.log('Schema Analysis:');
  console.log(`  Total classes: ${classNames.length}`);
  console.log(`  Total properties: ${analysis.totalProperties}`);
  console.log(`  Average properties per class: ${(analysis.totalProperties / classNames.length).toFixed(1)}`);
  console.log(`  Classes with vectorizer: ${analysis.withVectorizer.length}`);
  console.log(`  Multi-tenant classes: ${analysis.multiTenant.length}`);

  // Cache statistics
  const stats = cache.getStats();
  console.log(`\nCache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
}
