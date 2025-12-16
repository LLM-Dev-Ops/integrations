/**
 * Firestore Services Export Module
 *
 * Exports all Firestore service implementations following the SPARC specification.
 * Services provide high-level operations for documents, collections, queries,
 * batches, transactions, listeners, and field transformations.
 */

// Document service - CRUD operations on individual documents
export { DocumentService } from './document.js';
export type {
  HttpTransport,
  CircuitBreaker,
  MetricsEmitter,
  Tracer,
  Span,
} from './document.js';

// Collection service - operations on collections
export { CollectionService } from './collection.js';
export type { QueryBuilder } from './collection.js';

// Batch service - batched write operations
export {
  WriteBatchImpl,
  BatchService,
  BatchSizeLimitError,
  EmptyBatchError,
} from './batch.js';

// Field transform service - server-side field transformations
export { FieldTransformService } from './field-transform.js';
export type { FieldTransform } from './field-transform.js';

// Query service - query execution, streaming, aggregation, pagination
export * from './query.js';

// Transaction service - ACID transactions with automatic retry
export * from './transaction.js';

// Listener service - real-time updates for documents, collections, and queries
export * from './listener.js';
