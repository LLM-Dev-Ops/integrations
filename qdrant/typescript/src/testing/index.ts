/**
 * Qdrant Testing Module
 *
 * Provides mock clients and test fixtures for testing Qdrant integrations.
 *
 * @example
 * ```typescript
 * import { createMockQdrantClient, createTestPoints } from '@/testing';
 *
 * const client = createMockQdrantClient();
 * await client.collection('test').create({ vectorSize: 128 });
 *
 * const points = createTestPoints(100, 128);
 * await client.collection('test').upsert(points);
 * ```
 */

// Export mock client
export {
  MockQdrantClient,
  MockCollectionClient,
  createMockQdrantClient,
} from './mock.js';

// Export types
export type {
  PointId,
  Vector,
  Payload,
  Point,
  ScoredPoint,
  CollectionConfig,
  CollectionInfo,
  SearchRequest,
  Filter,
  Condition,
  ScrollOptions,
  ScrollResult,
  UpsertResult,
  DeleteResult,
  HealthStatus,
  Operation,
} from './mock.js';

// Export fixtures
export {
  randomVector,
  normalizeVector,
  testPayload,
  createTestPoint,
  createTestPoints,
  createSimilarPoints,
  createTestCollection,
  createPopulatedCollection,
  createCategorizedPoints,
  createTimeSeriesPoints,
  createNestedPayloadPoints,
  createMultiVectorPoints,
  createQueryVector,
  createSearchVectorBatch,
  createUuidPoints,
  createClusteredPoints,
  createDocumentChunks,
  createVariedPayloadPoints,
  assertions,
  PerformanceTracker,
} from './fixtures.js';

export type { DocumentChunk } from './fixtures.js';
