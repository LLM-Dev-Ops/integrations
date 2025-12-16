/**
 * Reference Service
 *
 * Manages cross-references between Weaviate objects.
 * Provides methods for adding, deleting, updating, and retrieving references.
 *
 * @module @llmdevops/weaviate-integration/reference/service
 */

import type { HttpTransport } from '../transport/types.js';
import type { Tracer, Logger, MetricsCollector } from '../observability/types.js';
import type { UUID } from '../types/property.js';
import type { Reference } from '../types/reference.js';
import type { ReferenceOptions } from './types.js';
import { createBeacon, parseBeacon } from './beacon.js';
import { ObjectNotFoundError, NetworkError, InternalError } from '../errors/index.js';

/**
 * Options for getting references
 */
export interface GetReferencesOptions extends ReferenceOptions {
  /**
   * Whether to include referenced object properties
   */
  includeProperties?: boolean;

  /**
   * Properties to include from referenced objects
   */
  properties?: string[];
}

/**
 * Reference service for managing cross-references between objects
 *
 * @example
 * ```typescript
 * const service = new ReferenceService(transport, {
 *   tracer,
 *   logger,
 *   metrics
 * });
 *
 * // Add a reference
 * await service.addReference(
 *   "Article",
 *   "article-id",
 *   "authors",
 *   "Author",
 *   "author-id"
 * );
 *
 * // Get references
 * const refs = await service.getReferences(
 *   "Article",
 *   "article-id",
 *   "authors"
 * );
 * ```
 */
export class ReferenceService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly observability?: {
      tracer?: Tracer;
      logger?: Logger;
      metrics?: MetricsCollector;
    }
  ) {}

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Add a reference from one object to another
   *
   * @param fromClass - Source object's class name
   * @param fromId - Source object's UUID
   * @param property - Property name that holds the reference
   * @param toClass - Target object's class name
   * @param toId - Target object's UUID
   * @param options - Additional options
   *
   * @example
   * ```typescript
   * await service.addReference(
   *   "Article",
   *   "550e8400-..." as UUID,
   *   "authors",
   *   "Author",
   *   "660e8400-..." as UUID
   * );
   * ```
   */
  async addReference(
    fromClass: string,
    fromId: UUID,
    property: string,
    toClass: string,
    toId: UUID,
    options?: ReferenceOptions
  ): Promise<void> {
    const span = this.observability?.tracer?.startSpan('weaviate.add_reference', {
      from_class: fromClass,
      from_id: fromId,
      property,
      to_class: toClass,
      to_id: toId,
    });

    try {
      // Build beacon URL
      const beacon = createBeacon(toClass, toId);

      // Build request body
      const body = {
        beacon,
      };

      // Build query parameters
      const query: Record<string, string | undefined> = {};
      if (options?.tenant) {
        query.tenant = options.tenant;
      }
      if (options?.consistencyLevel) {
        query.consistency_level = options.consistencyLevel;
      }

      // Execute request
      const response = await this.transport.post(
        `/v1/objects/${fromClass}/${fromId}/references/${property}`,
        body,
        query
      );

      // Check response status
      if (response.status !== 200) {
        throw new NetworkError(
          `Failed to add reference: HTTP ${response.status}`,
          { details: { statusCode: response.status } }
        );
      }

      // Log success
      this.observability?.logger?.debug('Reference added', {
        from: `${fromClass}/${fromId}`,
        to: `${toClass}/${toId}`,
        property,
        tenant: options?.tenant,
      });

      // Record metrics
      this.observability?.metrics?.increment('weaviate.reference.add.success', 1, {
        from_class: fromClass,
        to_class: toClass,
      });

      span?.setAttribute('status', 'success');
    } catch (error) {
      // Record error
      span?.recordError(error as Error);
      this.observability?.metrics?.increment('weaviate.reference.add.error', 1);

      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Delete a reference from one object to another
   *
   * @param fromClass - Source object's class name
   * @param fromId - Source object's UUID
   * @param property - Property name that holds the reference
   * @param toClass - Target object's class name
   * @param toId - Target object's UUID
   * @param options - Additional options
   *
   * @example
   * ```typescript
   * await service.deleteReference(
   *   "Article",
   *   "550e8400-..." as UUID,
   *   "authors",
   *   "Author",
   *   "660e8400-..." as UUID
   * );
   * ```
   */
  async deleteReference(
    fromClass: string,
    fromId: UUID,
    property: string,
    toClass: string,
    toId: UUID,
    options?: ReferenceOptions
  ): Promise<void> {
    const span = this.observability?.tracer?.startSpan('weaviate.delete_reference', {
      from_class: fromClass,
      from_id: fromId,
      property,
      to_class: toClass,
      to_id: toId,
    });

    try {
      // Build beacon URL
      const beacon = createBeacon(toClass, toId);

      // Build request body
      const body = {
        beacon,
      };

      // Build query parameters
      const query: Record<string, string | undefined> = {};
      if (options?.tenant) {
        query.tenant = options.tenant;
      }
      if (options?.consistencyLevel) {
        query.consistency_level = options.consistencyLevel;
      }

      // Execute request
      const response = await this.transport.delete(
        `/v1/objects/${fromClass}/${fromId}/references/${property}`,
        body,
        query
      );

      // Check response status (204 for successful delete)
      if (response.status !== 204 && response.status !== 200) {
        throw new NetworkError(
          `Failed to delete reference: HTTP ${response.status}`,
          { details: { statusCode: response.status } }
        );
      }

      // Log success
      this.observability?.logger?.debug('Reference deleted', {
        from: `${fromClass}/${fromId}`,
        to: `${toClass}/${toId}`,
        property,
        tenant: options?.tenant,
      });

      // Record metrics
      this.observability?.metrics?.increment('weaviate.reference.delete.success', 1, {
        from_class: fromClass,
        to_class: toClass,
      });

      span?.setAttribute('status', 'success');
    } catch (error) {
      // Record error
      span?.recordError(error as Error);
      this.observability?.metrics?.increment('weaviate.reference.delete.error', 1);

      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Update (replace) all references on a property
   *
   * This replaces ALL existing references on the property with the new set.
   *
   * @param fromClass - Source object's class name
   * @param fromId - Source object's UUID
   * @param property - Property name that holds the references
   * @param references - New references to set (replaces all existing)
   * @param options - Additional options
   *
   * @example
   * ```typescript
   * const newRefs = [
   *   { className: "Author", id: "author-1" as UUID, beacon: "..." },
   *   { className: "Author", id: "author-2" as UUID, beacon: "..." }
   * ];
   *
   * await service.updateReferences(
   *   "Article",
   *   "550e8400-..." as UUID,
   *   "authors",
   *   newRefs
   * );
   * ```
   */
  async updateReferences(
    fromClass: string,
    fromId: UUID,
    property: string,
    references: Reference[],
    options?: ReferenceOptions
  ): Promise<void> {
    const span = this.observability?.tracer?.startSpan('weaviate.update_references', {
      from_class: fromClass,
      from_id: fromId,
      property,
      count: references.length,
    });

    try {
      // Build array of beacons
      const beacons = references.map((ref) => ({
        beacon: ref.beacon || createBeacon(ref.className, ref.id),
      }));

      // Build query parameters
      const query: Record<string, string | undefined> = {};
      if (options?.tenant) {
        query.tenant = options.tenant;
      }
      if (options?.consistencyLevel) {
        query.consistency_level = options.consistencyLevel;
      }

      // Execute request
      const response = await this.transport.put(
        `/v1/objects/${fromClass}/${fromId}/references/${property}`,
        beacons,
        query
      );

      // Check response status
      if (response.status !== 200) {
        throw new NetworkError(
          `Failed to update references: HTTP ${response.status}`,
          { details: { statusCode: response.status } }
        );
      }

      // Log success
      this.observability?.logger?.debug('References updated', {
        from: `${fromClass}/${fromId}`,
        property,
        count: references.length,
        tenant: options?.tenant,
      });

      // Record metrics
      this.observability?.metrics?.increment(
        'weaviate.reference.update.success',
        1,
        {
          from_class: fromClass,
        }
      );
      this.observability?.metrics?.histogram(
        'weaviate.reference.update.count',
        references.length,
        {
          from_class: fromClass,
        }
      );

      span?.setAttribute('status', 'success');
      span?.setAttribute('reference_count', references.length);
    } catch (error) {
      // Record error
      span?.recordError(error as Error);
      this.observability?.metrics?.increment('weaviate.reference.update.error', 1);

      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Get all references from a property
   *
   * @param fromClass - Source object's class name
   * @param fromId - Source object's UUID
   * @param property - Property name that holds the references
   * @param options - Additional options
   * @returns Array of references
   *
   * @example
   * ```typescript
   * const refs = await service.getReferences(
   *   "Article",
   *   "550e8400-..." as UUID,
   *   "authors"
   * );
   *
   * refs.forEach(ref => {
   *   console.log(`Reference to ${ref.className}/${ref.id}`);
   * });
   * ```
   */
  async getReferences(
    fromClass: string,
    fromId: UUID,
    property: string,
    options?: GetReferencesOptions
  ): Promise<Reference[]> {
    const span = this.observability?.tracer?.startSpan('weaviate.get_references', {
      from_class: fromClass,
      from_id: fromId,
      property,
    });

    try {
      // Build query parameters
      const query: Record<string, string | undefined> = {};
      if (options?.tenant) {
        query.tenant = options.tenant;
      }

      // Build include parameter
      const includes: string[] = ['vector'];
      if (options?.includeProperties && options?.properties) {
        includes.push(...options.properties);
      }
      query.include = includes.join(',');

      // Get the object to extract references
      const response = await this.transport.get<{
        id: string;
        class: string;
        properties?: Record<string, unknown>;
      }>(`/v1/objects/${fromClass}/${fromId}`, query);

      // Check response status
      if (response.status === 404) {
        throw new ObjectNotFoundError(fromId, fromClass);
      }

      if (response.status !== 200) {
        throw new NetworkError(
          `Failed to get references: HTTP ${response.status}`,
          { details: { statusCode: response.status } }
        );
      }

      // Extract references from the property
      const obj = response.body;
      const references: Reference[] = [];

      if (obj.properties && property in obj.properties) {
        const refValue = obj.properties[property];

        // References can be an array of beacon objects
        if (Array.isArray(refValue)) {
          for (const refItem of refValue) {
            if (typeof refItem === 'object' && refItem !== null && 'beacon' in refItem) {
              const beacon = (refItem as { beacon: string }).beacon;
              const parsed = parseBeacon(beacon);

              if (parsed) {
                references.push({
                  beacon,
                  className: parsed.className,
                  id: parsed.id,
                  href: (refItem as { href?: string }).href,
                });
              }
            }
          }
        }
      }

      // Log success
      this.observability?.logger?.debug('References retrieved', {
        from: `${fromClass}/${fromId}`,
        property,
        count: references.length,
      });

      // Record metrics
      this.observability?.metrics?.increment('weaviate.reference.get.success', 1);
      this.observability?.metrics?.histogram(
        'weaviate.reference.get.count',
        references.length
      );

      span?.setAttribute('status', 'success');
      span?.setAttribute('reference_count', references.length);

      return references;
    } catch (error) {
      // Record error
      span?.recordError(error as Error);
      this.observability?.metrics?.increment('weaviate.reference.get.error', 1);

      throw error;
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Add multiple references in a single operation
   *
   * Note: Weaviate doesn't have a native batch reference API,
   * so this executes multiple individual operations.
   *
   * @param operations - Array of reference operations
   * @returns Results for each operation
   */
  async batchAddReferences(
    operations: Array<{
      fromClass: string;
      fromId: UUID;
      property: string;
      toClass: string;
      toId: UUID;
      options?: ReferenceOptions;
    }>
  ): Promise<
    Array<{
      success: boolean;
      error?: Error;
    }>
  > {
    const span = this.observability?.tracer?.startSpan(
      'weaviate.batch_add_references',
      {
        count: operations.length,
      }
    );

    try {
      const results = await Promise.allSettled(
        operations.map((op) =>
          this.addReference(
            op.fromClass,
            op.fromId,
            op.property,
            op.toClass,
            op.toId,
            op.options
          )
        )
      );

      const formattedResults = results.map((result) => {
        if (result.status === 'fulfilled') {
          return { success: true };
        } else {
          return { success: false, error: result.reason as Error };
        }
      });

      const successCount = formattedResults.filter((r) => r.success).length;
      const errorCount = formattedResults.length - successCount;

      this.observability?.logger?.info('Batch add references completed', {
        total: operations.length,
        success: successCount,
        errors: errorCount,
      });

      this.observability?.metrics?.histogram(
        'weaviate.reference.batch_add.total',
        operations.length
      );
      this.observability?.metrics?.histogram(
        'weaviate.reference.batch_add.success',
        successCount
      );
      this.observability?.metrics?.histogram(
        'weaviate.reference.batch_add.errors',
        errorCount
      );

      span?.setAttribute('total', operations.length);
      span?.setAttribute('success', successCount);
      span?.setAttribute('errors', errorCount);

      return formattedResults;
    } catch (error) {
      span?.recordError(error as Error);
      throw error;
    } finally {
      span?.end();
    }
  }
}
