/**
 * Point Operations Module
 *
 * Exports all point-related functionality including:
 * - Point operations client
 * - Batch processing utilities
 * - Type definitions
 */

// Main operations client
export { PointsClient, createPointsClient } from './operations.js';
export type { HttpClient, PointsClientConfig } from './operations.js';

// Batch processing
export {
  BatchProcessor,
  createBatchProcessor,
  chunkArray,
  parallelMap,
} from './batch.js';

// Type definitions
export type {
  Point,
  PointId,
  Vector,
  SparseVector,
  Payload,
  UpsertResult,
  BatchUpsertResult,
  BatchError,
  DeleteResult,
  Filter,
  FilterCondition,
  ScrollOptions,
  ScrollResult,
  BatchOptions,
} from './types.js';

// Type guards
export {
  isSparseVector,
  isNamedVector,
  isDenseVector,
} from './types.js';
