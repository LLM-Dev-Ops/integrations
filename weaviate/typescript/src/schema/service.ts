/**
 * Schema Service
 *
 * Provides methods for introspecting the Weaviate schema, including
 * fetching class definitions, listing classes, and retrieving shard information.
 *
 * @module @weaviate/schema/service
 */

import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import type {
  Schema,
  ClassDefinition,
  ShardInfo,
} from '../types/schema.js';
import {
  ClassNotFoundError,
  InternalError,
} from '../errors/types.js';
import {
  parseSchema,
  parseClassDefinition,
  parseShardInfo,
} from './parser.js';
import { SpanNames, SpanAttributes, MetricNames } from '../observability/types.js';

/**
 * Schema service for introspecting Weaviate schema
 *
 * Provides read-only access to the Weaviate schema, including class definitions,
 * properties, and shard information. Does not support schema creation or modification.
 *
 * @example
 * ```typescript
 * const service = new SchemaService(transport, observability);
 *
 * // Get full schema
 * const schema = await service.getSchema();
 * console.log(`Found ${schema.classes.length} classes`);
 *
 * // Get specific class
 * const articleClass = await service.getClass('Article');
 * if (articleClass) {
 *   console.log(`Article has ${articleClass.properties.length} properties`);
 * }
 *
 * // List all classes
 * const classes = await service.listClasses();
 * console.log('Available classes:', classes);
 *
 * // Get shard information
 * const shards = await service.getShards('Article');
 * console.log(`Article has ${shards.length} shards`);
 * ```
 */
export class SchemaService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly observability: ObservabilityContext
  ) {}

  /**
   * Get the complete Weaviate schema
   *
   * Fetches all class definitions from the Weaviate instance.
   *
   * @returns Promise resolving to the complete schema
   * @throws {InternalError} If the request fails
   *
   * @example
   * ```typescript
   * const schema = await service.getSchema();
   * for (const classDef of schema.classes) {
   *   console.log(`Class: ${classDef.name}`);
   *   console.log(`  Vectorizer: ${classDef.vectorizer}`);
   *   console.log(`  Properties: ${classDef.properties.length}`);
   * }
   * ```
   */
  async getSchema(): Promise<Schema> {
    const span = this.observability.tracer.startSpan('weaviate.schema.get_schema');

    try {
      this.observability.logger.debug('Fetching schema', {
        operation: 'getSchema',
      });

      const response = await this.transport.get<unknown>('/v1/schema');

      if (response.status !== 200) {
        throw new InternalError(
          `Failed to fetch schema: ${response.status}`,
          response.status,
          { responseBody: response.body }
        );
      }

      const schema = parseSchema(response.body);

      span.setAttribute(SpanAttributes.RESULT_COUNT, schema.classes.length);
      this.observability.metrics.increment(MetricNames.SCHEMA_GET);

      this.observability.logger.debug('Schema fetched successfully', {
        classCount: schema.classes.length,
      });

      return schema;
    } catch (error) {
      span.recordError(error as Error);
      this.observability.logger.error('Failed to fetch schema', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get a specific class definition by name
   *
   * Fetches the schema definition for a single class. Returns null if the class
   * does not exist (404 response).
   *
   * @param className - Name of the class to retrieve
   * @returns Promise resolving to the class definition, or null if not found
   * @throws {InternalError} If the request fails for reasons other than 404
   *
   * @example
   * ```typescript
   * const articleClass = await service.getClass('Article');
   * if (articleClass) {
   *   console.log(`Found class: ${articleClass.name}`);
   *   console.log(`Vectorizer: ${articleClass.vectorizer}`);
   *   console.log(`Vector index: ${articleClass.vectorIndexType}`);
   *
   *   for (const prop of articleClass.properties) {
   *     console.log(`  - ${prop.name}: ${prop.dataType.join(', ')}`);
   *   }
   * } else {
   *   console.log('Article class not found');
   * }
   * ```
   */
  async getClass(className: string): Promise<ClassDefinition | null> {
    const span = this.observability.tracer.startSpan('weaviate.schema.get_class', {
      [SpanAttributes.CLASS_NAME]: className,
    });

    try {
      this.observability.logger.debug('Fetching class definition', {
        operation: 'getClass',
        className,
      });

      const response = await this.transport.get<unknown>(
        `/v1/schema/${className}`
      );

      // Return null on 404 (class not found)
      if (response.status === 404) {
        this.observability.logger.debug('Class not found', { className });
        return null;
      }

      if (response.status !== 200) {
        throw new InternalError(
          `Failed to fetch class '${className}': ${response.status}`,
          response.status,
          { className, responseBody: response.body }
        );
      }

      const classDefinition = parseClassDefinition(response.body);

      span.setAttribute('property_count', classDefinition.properties.length);
      this.observability.metrics.increment(MetricNames.SCHEMA_GET, 1, {
        class_name: className,
      });

      this.observability.logger.debug('Class definition fetched successfully', {
        className,
        propertyCount: classDefinition.properties.length,
        vectorizer: classDefinition.vectorizer,
      });

      return classDefinition;
    } catch (error) {
      span.recordError(error as Error);
      this.observability.logger.error('Failed to fetch class definition', {
        className,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * List all class names in the schema
   *
   * Fetches the complete schema and extracts class names. This is a convenience
   * method that internally calls getSchema().
   *
   * @returns Promise resolving to array of class names
   * @throws {InternalError} If the request fails
   *
   * @example
   * ```typescript
   * const classes = await service.listClasses();
   * console.log('Available classes:');
   * for (const className of classes) {
   *   console.log(`  - ${className}`);
   * }
   *
   * // Check if a class exists
   * if (classes.includes('Article')) {
   *   console.log('Article class exists');
   * }
   * ```
   */
  async listClasses(): Promise<string[]> {
    const span = this.observability.tracer.startSpan('weaviate.schema.list_classes');

    try {
      this.observability.logger.debug('Listing classes', {
        operation: 'listClasses',
      });

      const schema = await this.getSchema();
      const classNames = schema.classes.map((c) => c.name);

      span.setAttribute(SpanAttributes.RESULT_COUNT, classNames.length);

      this.observability.logger.debug('Classes listed successfully', {
        count: classNames.length,
        classes: classNames,
      });

      return classNames;
    } catch (error) {
      span.recordError(error as Error);
      this.observability.logger.error('Failed to list classes', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get shard information for a class
   *
   * Retrieves detailed information about all shards for the specified class,
   * including status, object counts, and indexing status.
   *
   * @param className - Name of the class
   * @returns Promise resolving to array of shard information
   * @throws {ClassNotFoundError} If the class does not exist
   * @throws {InternalError} If the request fails
   *
   * @example
   * ```typescript
   * const shards = await service.getShards('Article');
   *
   * console.log(`Class 'Article' has ${shards.length} shard(s)`);
   *
   * for (const shard of shards) {
   *   console.log(`Shard: ${shard.name}`);
   *   console.log(`  Status: ${shard.status}`);
   *   console.log(`  Object count: ${shard.objectCount}`);
   *   console.log(`  Vector indexing: ${shard.vectorIndexingStatus}`);
   *
   *   if (shard.vectorQueueLength !== undefined) {
   *     console.log(`  Vector queue: ${shard.vectorQueueLength}`);
   *   }
   * }
   * ```
   */
  async getShards(className: string): Promise<ShardInfo[]> {
    const span = this.observability.tracer.startSpan('weaviate.schema.get_shards', {
      [SpanAttributes.CLASS_NAME]: className,
    });

    try {
      this.observability.logger.debug('Fetching shard information', {
        operation: 'getShards',
        className,
      });

      const response = await this.transport.get<unknown>(
        `/v1/schema/${className}/shards`
      );

      // Handle 404 as ClassNotFoundError
      if (response.status === 404) {
        throw new ClassNotFoundError(className);
      }

      if (response.status !== 200) {
        throw new InternalError(
          `Failed to fetch shards for class '${className}': ${response.status}`,
          response.status,
          { className, responseBody: response.body }
        );
      }

      // Response should be an array of shard objects
      const shardsData = Array.isArray(response.body)
        ? response.body
        : [];

      const shards = shardsData.map((shardData) => parseShardInfo(shardData));

      span.setAttribute(SpanAttributes.RESULT_COUNT, shards.length);

      this.observability.logger.debug('Shard information fetched successfully', {
        className,
        shardCount: shards.length,
        totalObjects: shards.reduce((sum, s) => sum + s.objectCount, 0),
      });

      return shards;
    } catch (error) {
      span.recordError(error as Error);
      this.observability.logger.error('Failed to fetch shard information', {
        className,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }
}
