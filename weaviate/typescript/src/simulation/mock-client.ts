/**
 * Mock Weaviate client for testing
 *
 * This module provides a complete in-memory implementation of the Weaviate
 * client interface for testing purposes. It simulates all core operations
 * without requiring a real Weaviate instance.
 */

import type { UUID, Properties } from '../types/property.js';
import type { WeaviateObject, CreateOptions, GetOptions, UpdateOptions, DeleteOptions } from '../types/object.js';
import type { Schema } from '../types/schema.js';
import type { SearchResult, SearchHit, NearVectorQuery, HybridQuery } from '../types/search.js';
import type { BatchObject, BatchResponse, BatchDeleteResponse } from '../types/batch.js';
import type { WhereFilter } from '../types/filter.js';
import { createUUID } from '../types/property.js';
import { MemoryStore } from './memory-store.js';
import { OperationRecorder, OperationType, RecordedOperation } from './recorder.js';
import { MockConfig, DEFAULT_MOCK_CONFIG } from './config.js';
import { computeDistance, distanceToCertainty } from './vector-ops.js';
import { matchesFilter } from './filter-eval.js';

/**
 * Mock Weaviate client
 *
 * Provides a complete in-memory implementation of the Weaviate client
 * interface for testing purposes.
 *
 * @example
 * ```typescript
 * const schema: Schema = {
 *   classes: [{
 *     name: 'Article',
 *     vectorizer: 'none',
 *     properties: [
 *       { name: 'title', dataType: ['text'] },
 *       { name: 'content', dataType: ['text'] }
 *     ]
 *   }]
 * };
 *
 * const mock = new MockWeaviateClient(schema);
 *
 * // Insert test data
 * mock.insertObject({
 *   id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
 *   className: 'Article',
 *   properties: { title: 'Test Article' },
 *   vector: [1.0, 0.0, 0.0]
 * });
 *
 * // Search
 * const results = await mock.nearVector('Article', {
 *   className: 'Article',
 *   vector: [1.0, 0.0, 0.0],
 *   limit: 10
 * });
 * ```
 */
export class MockWeaviateClient {
  private store: MemoryStore;
  private recorder: OperationRecorder;
  private schema: Schema;
  private config: MockConfig;
  private injectedErrors: Map<string, Error>;
  private searchResponses: Map<string, SearchResult>;

  constructor(schema: Schema, config?: Partial<MockConfig>) {
    this.store = new MemoryStore();
    this.recorder = new OperationRecorder();
    this.schema = schema;
    this.config = { ...DEFAULT_MOCK_CONFIG, ...config };
    this.injectedErrors = new Map();
    this.searchResponses = new Map();
  }

  /**
   * Creates a new object
   *
   * @param className - The class name
   * @param properties - Object properties
   * @param options - Creation options
   * @returns Created object
   */
  async createObject(
    className: string,
    properties: Properties,
    options?: Partial<CreateOptions>
  ): Promise<WeaviateObject> {
    await this.maybeDelay();
    this.maybeThrowError('create', className);

    // Validate class exists
    this.validateClassExists(className);

    // Generate or use provided ID
    const id = options?.id || this.generateId();
    const now = new Date();

    const object: WeaviateObject = {
      id,
      className,
      properties,
      vector: options?.vector,
      tenant: options?.tenant,
      creationTime: now,
      updateTime: now,
    };

    this.store.set(object);

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'create',
        timestamp: Date.now(),
        className,
        id,
        properties,
        vector: options?.vector,
      });
    }

    return object;
  }

  /**
   * Gets an object by ID
   *
   * @param className - The class name
   * @param id - Object ID
   * @param options - Get options
   * @returns The object or null if not found
   */
  async getObject(
    className: string,
    id: UUID,
    options?: Partial<GetOptions>
  ): Promise<WeaviateObject | null> {
    await this.maybeDelay();
    this.maybeThrowError('get', className);

    const object = this.store.get(className, id);
    const found = object !== undefined;

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'get',
        timestamp: Date.now(),
        className,
        id,
        found,
      });
    }

    if (!object) {
      return null;
    }

    // Filter properties if requested
    if (options?.properties && options.properties.length > 0) {
      const filteredProps: Properties = {};
      for (const prop of options.properties) {
        if (prop in object.properties) {
          filteredProps[prop] = object.properties[prop];
        }
      }
      return { ...object, properties: filteredProps };
    }

    // Remove vector if not requested
    if (!options?.includeVector) {
      const { vector, ...rest } = object;
      return rest;
    }

    return object;
  }

  /**
   * Updates an object
   *
   * @param className - The class name
   * @param id - Object ID
   * @param properties - Properties to update
   * @param options - Update options
   * @returns Updated object
   */
  async updateObject(
    className: string,
    id: UUID,
    properties: Properties,
    options?: Partial<UpdateOptions>
  ): Promise<WeaviateObject> {
    await this.maybeDelay();
    this.maybeThrowError('update', className);

    const existing = this.store.get(className, id);
    if (!existing) {
      throw new Error(`Object not found: ${className}/${id}`);
    }

    const merge = options?.merge ?? true;
    const updatedProperties = merge
      ? { ...existing.properties, ...properties }
      : properties;

    const updated: WeaviateObject = {
      ...existing,
      properties: updatedProperties,
      vector: options?.vector ?? existing.vector,
      updateTime: new Date(),
    };

    this.store.set(updated);

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'update',
        timestamp: Date.now(),
        className,
        id,
        properties,
        merge,
      });
    }

    return updated;
  }

  /**
   * Deletes an object
   *
   * @param className - The class name
   * @param id - Object ID
   * @param options - Delete options
   */
  async deleteObject(
    className: string,
    id: UUID,
    options?: Partial<DeleteOptions>
  ): Promise<void> {
    await this.maybeDelay();
    this.maybeThrowError('delete', className);

    const deleted = this.store.delete(className, id);
    if (!deleted) {
      throw new Error(`Object not found: ${className}/${id}`);
    }

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'delete',
        timestamp: Date.now(),
        className,
        id,
      });
    }
  }

  /**
   * Checks if an object exists
   *
   * @param className - The class name
   * @param id - Object ID
   * @param tenant - Optional tenant name
   * @returns True if the object exists
   */
  async exists(
    className: string,
    id: UUID,
    tenant?: string
  ): Promise<boolean> {
    await this.maybeDelay();
    const exists = this.store.has(className, id);

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'exists',
        timestamp: Date.now(),
        className,
        id,
        exists,
      });
    }

    return exists;
  }

  /**
   * Near vector search
   *
   * @param className - The class name
   * @param query - Search query
   * @returns Search results
   */
  async nearVector(
    className: string,
    query: NearVectorQuery
  ): Promise<SearchResult> {
    await this.maybeDelay();
    this.maybeThrowError('nearVector', className);

    // Check for pre-configured response
    if (this.searchResponses.has(className)) {
      return this.searchResponses.get(className)!;
    }

    // Get all objects from class
    let objects = this.store.getAllByClass(className);

    // Apply filter if provided
    if (query.filter) {
      objects = objects.filter((obj) => matchesFilter(obj, query.filter!));
    }

    // Filter out objects without vectors
    const objectsWithVectors = objects.filter((obj) => obj.vector !== undefined);

    // Compute distances
    const hits: SearchHit[] = objectsWithVectors.map((obj) => {
      const distance = computeDistance(
        query.vector,
        obj.vector!,
        this.config.distanceMetric
      );
      const certainty = distanceToCertainty(distance, this.config.distanceMetric);

      return {
        id: obj.id,
        className: obj.className,
        properties: obj.properties,
        vector: query.includeVector ? obj.vector : undefined,
        distance,
        certainty,
      };
    });

    // Filter by certainty/distance thresholds
    let filteredHits = hits;
    if (query.certainty !== undefined) {
      filteredHits = filteredHits.filter(
        (hit) => hit.certainty! >= query.certainty!
      );
    }
    if (query.distance !== undefined) {
      filteredHits = filteredHits.filter(
        (hit) => hit.distance! <= query.distance!
      );
    }

    // Sort by distance (lower is better)
    filteredHits.sort((a, b) => a.distance! - b.distance!);

    // Apply offset and limit
    const offset = query.offset ?? 0;
    const limit = query.limit;
    const paginatedHits = filteredHits.slice(offset, offset + limit);

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'nearVector',
        timestamp: Date.now(),
        className,
        vector: query.vector,
        limit: query.limit,
        resultsCount: paginatedHits.length,
      });
    }

    return {
      objects: paginatedHits,
      totalCount: filteredHits.length,
    };
  }

  /**
   * Hybrid search (combined vector + BM25)
   *
   * Simulates hybrid search by combining BM25 text matching and vector similarity.
   * The alpha parameter controls the balance:
   * - alpha = 0.0: Pure BM25 (keyword search)
   * - alpha = 1.0: Pure vector search
   * - alpha = 0.5: Equal weight between both
   *
   * @param className - The class name
   * @param query - Hybrid query
   * @returns Search results
   */
  async hybrid(
    className: string,
    query: HybridQuery
  ): Promise<SearchResult> {
    await this.maybeDelay();
    this.maybeThrowError('hybrid', className);

    // Get all objects from class
    let objects = this.store.getAllByClass(className);

    // Apply filter if provided
    if (query.filter) {
      objects = objects.filter((obj) => matchesFilter(obj, query.filter!));
    }

    const alpha = query.alpha;
    const searchQuery = query.query.toLowerCase();
    const searchWords = searchQuery.split(/\s+/).filter(w => w.length > 0);

    // Compute BM25-like scores (text matching)
    const bm25Scores: Map<string, number> = new Map();
    if (alpha < 1.0 && searchWords.length > 0) {
      for (const obj of objects) {
        let score = 0;
        const searchableProps = query.searchProperties || Object.keys(obj.properties);

        for (const propName of searchableProps) {
          const propValue = obj.properties[propName];
          if (typeof propValue === 'string') {
            const propLower = propValue.toLowerCase();
            // Simple BM25-like scoring: count word matches
            for (const word of searchWords) {
              if (propLower.includes(word)) {
                score += 1;
                // Bonus for exact word match
                if (propLower.split(/\s+/).includes(word)) {
                  score += 0.5;
                }
              }
            }
          }
        }
        bm25Scores.set(obj.id, score);
      }
    }

    // Compute vector scores
    const vectorScores: Map<string, number> = new Map();
    if (alpha > 0.0 && query.vector) {
      const objectsWithVectors = objects.filter((obj) => obj.vector !== undefined);
      for (const obj of objectsWithVectors) {
        const distance = computeDistance(
          query.vector,
          obj.vector!,
          this.config.distanceMetric
        );
        // Convert distance to a score (higher is better)
        const vectorScore = Math.max(0, 1 - distance);
        vectorScores.set(obj.id, vectorScore);
      }
    }

    // Combine scores based on alpha
    const combinedScores: Array<{ id: string; score: number; obj: WeaviateObject }> = [];

    for (const obj of objects) {
      const bm25Score = bm25Scores.get(obj.id) || 0;
      const vectorScore = vectorScores.get(obj.id) || 0;

      // Skip objects with no scores when searching
      const hasBm25 = bm25Score > 0;
      const hasVector = vectorScore > 0;

      // For pure BM25 (alpha=0), only include objects with text matches
      if (alpha === 0 && !hasBm25) continue;
      // For pure vector (alpha=1), only include objects with vectors
      if (alpha === 1.0 && !hasVector) continue;
      // For hybrid, include if either matches
      if (alpha > 0 && alpha < 1.0 && !hasBm25 && !hasVector) continue;

      // Normalize and combine scores
      const combinedScore = (1 - alpha) * bm25Score + alpha * vectorScore;

      combinedScores.push({ id: obj.id, score: combinedScore, obj });
    }

    // Sort by combined score (higher is better)
    combinedScores.sort((a, b) => b.score - a.score);

    // Apply offset and limit
    const offset = query.offset ?? 0;
    const limit = query.limit;
    const paginatedResults = combinedScores.slice(offset, offset + limit);

    // Build search hits
    const hits: SearchHit[] = paginatedResults.map(({ obj, score }) => {
      const hit: SearchHit = {
        id: obj.id,
        className: obj.className,
        properties: obj.properties,
        score,
        explainScore: `BM25: ${bm25Scores.get(obj.id)?.toFixed(3) || '0'}, Vector: ${vectorScores.get(obj.id)?.toFixed(3) || '0'}, Alpha: ${alpha}`,
      };

      if (query.includeVector && obj.vector) {
        hit.vector = obj.vector;
      }

      // Include certainty/distance if vector was used
      if (query.vector && obj.vector) {
        const distance = computeDistance(
          query.vector,
          obj.vector,
          this.config.distanceMetric
        );
        hit.distance = distance;
        hit.certainty = distanceToCertainty(distance, this.config.distanceMetric);
      }

      return hit;
    });

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'hybrid',
        timestamp: Date.now(),
        className,
        query: query.query,
        alpha: query.alpha,
        limit: query.limit,
        resultsCount: hits.length,
      });
    }

    return {
      objects: hits,
      totalCount: combinedScores.length,
    };
  }

  /**
   * BM25 keyword search
   *
   * Simulates BM25 keyword search by matching query words against text properties.
   *
   * @param className - The class name
   * @param query - BM25 query parameters
   * @returns Search results
   */
  async bm25(
    className: string,
    query: { query: string; properties?: string[]; limit: number; offset?: number; filter?: WhereFilter; returnProperties?: string[]; includeVector?: boolean }
  ): Promise<SearchResult> {
    await this.maybeDelay();
    this.maybeThrowError('bm25', className);

    // Get all objects from class
    let objects = this.store.getAllByClass(className);

    // Apply filter if provided
    if (query.filter) {
      objects = objects.filter((obj) => matchesFilter(obj, query.filter!));
    }

    const searchQuery = query.query.toLowerCase();
    const searchWords = searchQuery.split(/\s+/).filter(w => w.length > 0);

    if (searchWords.length === 0) {
      return { objects: [], totalCount: 0 };
    }

    // Compute BM25-like scores
    const scoredObjects: Array<{ obj: WeaviateObject; score: number }> = [];

    for (const obj of objects) {
      let score = 0;
      const searchableProps = query.properties || Object.keys(obj.properties);

      for (const propName of searchableProps) {
        const propValue = obj.properties[propName];
        if (typeof propValue === 'string') {
          const propLower = propValue.toLowerCase();
          for (const word of searchWords) {
            if (propLower.includes(word)) {
              score += 1;
              // Bonus for exact word match
              const words = propLower.split(/\s+/);
              if (words.includes(word)) {
                score += 0.5;
              }
              // Bonus for title property
              if (propName.toLowerCase() === 'title' || propName.toLowerCase() === 'name') {
                score += 0.25;
              }
            }
          }
        }
      }

      if (score > 0) {
        scoredObjects.push({ obj, score });
      }
    }

    // Sort by score (higher is better)
    scoredObjects.sort((a, b) => b.score - a.score);

    // Apply offset and limit
    const offset = query.offset ?? 0;
    const limit = query.limit;
    const paginatedResults = scoredObjects.slice(offset, offset + limit);

    // Build search hits
    const hits: SearchHit[] = paginatedResults.map(({ obj, score }) => {
      const hit: SearchHit = {
        id: obj.id,
        className: obj.className,
        properties: query.returnProperties
          ? Object.fromEntries(
              Object.entries(obj.properties).filter(([key]) =>
                query.returnProperties!.includes(key)
              )
            )
          : obj.properties,
        score,
      };

      if (query.includeVector && obj.vector) {
        hit.vector = obj.vector;
      }

      return hit;
    });

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'bm25',
        timestamp: Date.now(),
        className,
        query: query.query,
        limit: query.limit,
        resultsCount: hits.length,
      });
    }

    return {
      objects: hits,
      totalCount: scoredObjects.length,
    };
  }

  /**
   * Batch create objects
   *
   * @param objects - Objects to create
   * @param options - Batch options
   * @returns Batch response
   */
  async batchCreate(
    objects: BatchObject[],
    options?: { consistencyLevel?: string }
  ): Promise<BatchResponse> {
    await this.maybeDelay();

    let successful = 0;
    let failed = 0;
    const errors: any[] = [];

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      try {
        await this.createObject(obj.className, obj.properties, {
          id: obj.id,
          vector: obj.vector,
          tenant: obj.tenant,
        });
        successful++;
      } catch (error) {
        failed++;
        errors.push({
          index: i,
          objectId: obj.id,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'batchCreate',
        timestamp: Date.now(),
        className: objects[0]?.className ?? 'unknown',
        count: objects.length,
        successful,
        failed,
      });
    }

    return { successful, failed, errors };
  }

  /**
   * Batch delete objects matching a filter
   *
   * @param className - The class name
   * @param filter - Filter to select objects for deletion
   * @param options - Delete options
   * @returns Batch delete response
   */
  async batchDelete(
    className: string,
    filter: WhereFilter,
    options?: { dryRun?: boolean; tenant?: string }
  ): Promise<BatchDeleteResponse> {
    await this.maybeDelay();
    this.maybeThrowError('batchDelete', className);

    const matches = this.store.filter(className, filter);
    const matched = matches.length;

    let deleted = 0;
    if (!options?.dryRun) {
      for (const obj of matches) {
        this.store.delete(className, obj.id);
        deleted++;
      }
    }

    if (this.config.recordOperations) {
      this.recorder.record({
        type: 'batchDelete',
        timestamp: Date.now(),
        className,
        filter,
        matched,
        deleted,
      });
    }

    return {
      matched,
      deleted,
      dryRun: options?.dryRun ?? false,
      successful: true,
    };
  }

  // Mock-specific methods

  /**
   * Inserts an object directly (for test setup)
   *
   * @param object - The object to insert
   */
  insertObject(object: WeaviateObject): void {
    this.store.set(object);
  }

  /**
   * Clears all objects from a class
   *
   * @param className - The class name
   */
  clearClass(className: string): void {
    this.store.clearClass(className);
  }

  /**
   * Clears all objects from all classes
   */
  clearAll(): void {
    this.store.clear();
    this.recorder.clear();
  }

  /**
   * Sets a pre-configured search response for a class
   *
   * @param className - The class name
   * @param result - The search result to return
   */
  setSearchResponse(className: string, result: SearchResult): void {
    this.searchResponses.set(className, result);
  }

  /**
   * Injects an error for a specific operation pattern
   *
   * @param pattern - Operation pattern (e.g., "create:Article", "get")
   * @param error - Error to throw
   */
  injectError(pattern: string, error: Error): void {
    this.injectedErrors.set(pattern, error);
  }

  /**
   * Sets simulated latency
   *
   * @param ms - Latency in milliseconds
   */
  setLatency(ms: number): void {
    this.config.simulatedLatency = ms;
  }

  /**
   * Gets all recorded operations
   *
   * @returns Array of recorded operations
   */
  getRecordedOperations(): RecordedOperation[] {
    return this.recorder.getOperations();
  }

  /**
   * Clears recorded operations
   */
  clearRecordedOperations(): void {
    this.recorder.clear();
  }

  /**
   * Asserts that an operation was recorded
   *
   * @param opType - Operation type
   * @throws Error if the operation was not recorded
   */
  assertOperationRecorded(opType: OperationType): void {
    if (!this.recorder.hasOperation(opType)) {
      throw new Error(`Expected operation ${opType} was not recorded`);
    }
  }

  /**
   * Asserts that objects were created
   *
   * @param className - Class name
   * @param count - Expected count
   * @throws Error if the count doesn't match
   */
  assertObjectCreated(className: string, count: number): void {
    const creates = this.recorder
      .filterByType('create')
      .filter((op: any) => op.className === className);
    if (creates.length !== count) {
      throw new Error(
        `Expected ${count} objects created for ${className}, got ${creates.length}`
      );
    }
  }

  /**
   * Asserts that a search was executed
   *
   * @param className - Class name
   * @throws Error if no search was executed for the class
   */
  assertSearchExecuted(className: string): void {
    const searches = this.recorder
      .getOperations()
      .filter(
        (op: any) =>
          (op.type === 'nearVector' ||
            op.type === 'nearObject' ||
            op.type === 'nearText' ||
            op.type === 'hybrid' ||
            op.type === 'bm25') &&
          op.className === className
      );
    if (searches.length === 0) {
      throw new Error(`Expected search on ${className} was not executed`);
    }
  }

  // Private helper methods

  private validateClassExists(className: string): void {
    const classExists = this.schema.classes.some((c) => c.name === className);
    if (!classExists && this.config.validateSchema) {
      throw new Error(`Class not found in schema: ${className}`);
    }
  }

  private generateId(): UUID {
    const uuid = crypto.randomUUID();
    return createUUID(uuid);
  }

  private async maybeDelay(): Promise<void> {
    if (this.config.simulatedLatency && this.config.simulatedLatency > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.simulatedLatency)
      );
    }
  }

  private maybeThrowError(operation: string, className: string): void {
    // Check pattern-specific errors
    const fullPattern = `${operation}:${className}`;
    if (this.injectedErrors.has(fullPattern)) {
      throw this.injectedErrors.get(fullPattern)!;
    }
    if (this.injectedErrors.has(operation)) {
      throw this.injectedErrors.get(operation)!;
    }

    // Check random error rate
    if (this.config.errorRate && Math.random() < this.config.errorRate) {
      throw new Error(`Simulated random error for ${operation}`);
    }
  }
}
