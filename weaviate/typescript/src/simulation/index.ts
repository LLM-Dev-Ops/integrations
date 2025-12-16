/**
 * Weaviate Simulation/Mock Module
 *
 * This module provides a complete in-memory mock implementation of the
 * Weaviate client for testing purposes. It includes:
 *
 * - MockWeaviateClient: Full client implementation with in-memory storage
 * - Vector similarity computation using configurable distance metrics
 * - Filter evaluation for where clauses
 * - Operation recording for test verification
 * - Configurable error injection and latency simulation
 *
 * @example
 * ```typescript
 * import { MockWeaviateClient, createMockConfig } from './simulation';
 *
 * // Create a mock client
 * const schema = {
 *   classes: [{
 *     name: 'Article',
 *     vectorizer: 'none',
 *     properties: [
 *       { name: 'title', dataType: ['text'] }
 *     ]
 *   }]
 * };
 *
 * const config = createMockConfig({
 *   distanceMetric: 'cosine',
 *   simulatedLatency: 10
 * });
 *
 * const mock = new MockWeaviateClient(schema, config);
 *
 * // Use in tests
 * await mock.createObject('Article', { title: 'Test' });
 * const results = await mock.nearVector('Article', {
 *   className: 'Article',
 *   vector: [1, 0, 0],
 *   limit: 10
 * });
 *
 * // Verify operations
 * mock.assertObjectCreated('Article', 1);
 * mock.assertSearchExecuted('Article');
 * ```
 *
 * @module simulation
 */

// Main mock client
export { MockWeaviateClient } from './mock-client.js';

// Configuration
export type { MockConfig } from './config.js';
export { DEFAULT_MOCK_CONFIG, createMockConfig } from './config.js';

// In-memory storage
export { MemoryStore } from './memory-store.js';

// Vector operations
export {
  computeDistance,
  computeCosineDistance,
  computeDotProduct,
  computeL2Squared,
  computeManhattan,
  computeHamming,
  computeSimilarity,
  normalizeVector,
  distanceToCertainty,
} from './vector-ops.js';

// Filter evaluation
export { matchesFilter, evaluateOperand, evaluateOperator } from './filter-eval.js';

// Operation recording
export { OperationRecorder } from './recorder.js';
export type {
  OperationType,
  RecordedOperation,
  CreateObjectOperation,
  GetObjectOperation,
  UpdateObjectOperation,
  DeleteObjectOperation,
  ExistsOperation,
  NearVectorOperation,
  NearObjectOperation,
  NearTextOperation,
  HybridOperation,
  BM25Operation,
  BatchCreateOperation,
  BatchDeleteOperation,
} from './recorder.js';

/**
 * Creates a mock schema for testing
 *
 * @param classes - Array of class names
 * @returns Mock schema
 */
export function createMockSchema(classes?: string[]) {
  const classNames = classes ?? ['Article', 'Person', 'Company'];
  return {
    classes: classNames.map((name) => ({
      name,
      vectorizer: 'none',
      properties: [
        {
          name: 'title',
          dataType: ['text'],
        },
        {
          name: 'content',
          dataType: ['text'],
        },
      ],
      vectorIndexConfig: {
        distance: 'cosine' as const,
      },
    })),
  };
}

/**
 * Creates a mock client with a default schema
 *
 * @param config - Optional mock configuration
 * @returns Mock Weaviate client
 */
export function createMockClient(config?: Partial<import('./config.js').MockConfig>) {
  const schema = createMockSchema();
  return new MockWeaviateClient(schema, config);
}
