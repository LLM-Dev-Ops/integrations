/**
 * Type Check File
 *
 * This file ensures all exported types are properly typed.
 * It should compile without errors if the type system is correct.
 */

import {
  // Classes
  MockQdrantClient,
  MockCollectionClient,
  createMockQdrantClient,

  // Types
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
  DocumentChunk,

  // Fixtures
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
} from './index';

// Type assertions to ensure proper typing
const client: MockQdrantClient = createMockQdrantClient();
const collection: MockCollectionClient = client.collection('test');

// Point types
const pointId: PointId = 1;
const pointId2: PointId = 'uuid';
const vector: Vector = { values: [1, 2, 3] };
const payload: Payload = { key: 'value' };
const point: Point = { id: 1, vector: [1, 2, 3], payload: {} };
const scoredPoint: ScoredPoint = { id: 1, score: 0.95 };

// Config types
const config: CollectionConfig = { vectorSize: 128, distance: 'Cosine' };
const info: CollectionInfo = {
  name: 'test',
  status: 'green',
  vectorsCount: 100,
  pointsCount: 100,
  segmentsCount: 1,
  config: {},
};

// Request types
const searchRequest: SearchRequest = {
  vector: [1, 2, 3],
  limit: 10,
  withPayload: true,
  withVector: false,
};

// Filter types
const filter: Filter = {
  must: [{ key: 'field', match: { value: 'test' } }],
};
const condition: Condition = { key: 'field', match: { value: 'test' } };

// Scroll types
const scrollOptions: ScrollOptions = { limit: 10, withPayload: true };
const scrollResult: ScrollResult = { points: [], nextOffset: 1 };

// Result types
const upsertResult: UpsertResult = { operationId: 1, status: 'completed' };
const deleteResult: DeleteResult = { operationId: 1, status: 'completed' };

// Health types
const health: HealthStatus = { title: 'test', version: '1.0', status: 'ok' };

// Operation types
const operation: Operation = {
  type: 'search',
  collection: 'test',
  timestamp: Date.now(),
};

// Document chunk types
const chunk: DocumentChunk = {
  documentId: 'doc-1',
  chunkIndex: 0,
  content: 'content',
  vector: [1, 2, 3],
};

// Function return types
const vec: number[] = randomVector(128);
const normalized: number[] = normalizeVector([1, 2, 3]);
const pay: Payload = testPayload();
const testPoint: Point = createTestPoint(1, 128);
const testPoints: Point[] = createTestPoints(10, 128);
const similar: Point[] = createSimilarPoints([1, 2, 3], 10, 0.9);
const categorized: Point[] = createCategorizedPoints(['cat1'], 10, 128);
const timeSeries: Point[] = createTimeSeriesPoints(10, 128);
const nested: Point[] = createNestedPayloadPoints(10, 128);
const multi: Point[] = createMultiVectorPoints(10, { vec1: 128 });
const query: number[] = createQueryVector({ id: 1, vector: [1, 2, 3] });
const batch: number[][] = createSearchVectorBatch(10, 128);
const uuid: Point[] = createUuidPoints(10, 128);
const clustered: Point[] = createClusteredPoints(5, 10, 128);
const chunks: Point[] = createDocumentChunks(5, 10, 128);
const varied: Point[] = createVariedPayloadPoints(10, 128);

// Async function return types
const testCreateCollection: Promise<void> = createTestCollection(
  client,
  'test',
  {}
);
const testPopulated: Promise<Point[]> = createPopulatedCollection(
  client,
  'test',
  100
);

// Assertion types
const exists: boolean = assertions.pointExists([], 1);
const sorted: boolean = assertions.resultsSorted([]);
const match: boolean = assertions.allResultsMatch([], 'key', 'value');
const threshold: boolean = assertions.scoresAboveThreshold([], 0.8);

// Performance tracker types
const tracker: PerformanceTracker = new PerformanceTracker();
const stats = tracker.getStats('test');
if (stats) {
  const count: number = stats.count;
  const min: number = stats.min;
  const max: number = stats.max;
  const avg: number = stats.avg;
  const p50: number = stats.p50;
  const p95: number = stats.p95;
  const p99: number = stats.p99;
}

// Export for type checking (prevents "unused" errors)
export {
  client,
  collection,
  pointId,
  pointId2,
  vector,
  payload,
  point,
  scoredPoint,
  config,
  info,
  searchRequest,
  filter,
  condition,
  scrollOptions,
  scrollResult,
  upsertResult,
  deleteResult,
  health,
  operation,
  chunk,
  vec,
  normalized,
  pay,
  testPoint,
  testPoints,
  similar,
  categorized,
  timeSeries,
  nested,
  multi,
  query,
  batch,
  uuid,
  clustered,
  chunks,
  varied,
  testCreateCollection,
  testPopulated,
  exists,
  sorted,
  match,
  threshold,
  tracker,
  stats,
};
