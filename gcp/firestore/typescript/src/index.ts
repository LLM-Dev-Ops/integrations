/**
 * Google Cloud Firestore Integration Module
 *
 * A comprehensive adapter layer for Google Cloud Firestore providing:
 * - Document CRUD operations (get, create, set, update, delete)
 * - Query execution with filtering, ordering, and pagination
 * - Aggregation queries (COUNT, SUM, AVG)
 * - Real-time listeners with automatic reconnection
 * - Batch write operations
 * - ACID transactions with automatic retry
 * - Field transforms (server timestamp, increment, array operations)
 *
 * Built following the SPARC specification for the LLM Dev Ops platform.
 *
 * @module @integrations/gcp-firestore
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   clientBuilder,
 *   configBuilder,
 *   DocumentService,
 *   QueryService,
 *   TransactionService
 * } from "@integrations/gcp-firestore";
 *
 * // Create a client using the builder
 * const client = await clientBuilder()
 *   .projectId("my-project")
 *   .applicationDefault()
 *   .build();
 *
 * // Use services for operations
 * const docService = client.documents();
 * const snapshot = await docService.get("users/user123");
 * ```
 */

// Configuration and client
export {
  // Config types
  type FirestoreConfig,
  type AuthConfig,
  type ServiceAccountKey,
  // Config builder
  FirestoreConfigBuilder,
  configBuilder,
  validateConfig,
  validateCollectionPath,
  validateDocumentPath,
  validateFieldPath,
  // Default config
  DEFAULT_CONFIG,
} from "./config/index.js";

// Client
export {
  // Client types
  type FirestoreClient,
  type DocumentService as ClientDocumentService,
  type CollectionService as ClientCollectionService,
  type QueryService as ClientQueryService,
  type BatchService as ClientBatchService,
  type TransactionService as ClientTransactionService,
  type ListenerService as ClientListenerService,
  type FieldTransformService as ClientFieldTransformService,
  // Client builder and factories
  FirestoreClientBuilder,
  FirestoreClientImpl,
  clientBuilder,
  createClient,
  createClientFromEnv,
  // Path helpers
  buildDatabasePath,
  buildDocumentPath as buildClientDocumentPath,
  buildCollectionPath as buildClientCollectionPath,
} from "./client/index.js";

// Credentials
export {
  // Auth provider types
  type GcpAuthProvider,
  type CachedToken,
  type TokenResponse,
  // Auth provider implementations
  ServiceAccountAuthProvider,
  AccessTokenAuthProvider,
  EmulatorAuthProvider,
  MetadataServerAuthProvider,
  DefaultCredentialsAuthProvider,
  UserCredentialsAuthProvider,
  // Factory
  createAuthProvider,
} from "./credentials/index.js";

// Error handling
export {
  // Error codes
  GrpcCode,
  // Base error
  FirestoreError,
  // Specific errors
  ConfigurationError,
  NotFoundError,
  AlreadyExistsError,
  PermissionDeniedError,
  InvalidArgumentError,
  FailedPreconditionError,
  AbortedError,
  ResourceExhaustedError,
  UnavailableError,
  DeadlineExceededError,
  InternalError,
  CancelledError,
  UnauthenticatedError,
  DocumentTooLargeError,
  BatchSizeLimitError,
  TransactionContentionError,
  FieldPathTooDeepError,
  IndexRequiredError,
  // Error utilities
  mapFirestoreError,
  isRetryableError,
  getRetryPolicy,
  calculateBackoff,
  shouldRetry,
  // Retry policy type
  type RetryPolicy,
  type GrpcErrorResponse,
} from "./error/index.js";

// Types - Document
export {
  // Document types
  type Document,
  type DocumentPath,
  type DocumentRef,
  type DocumentSnapshot,
  type DocumentMask,
  type WriteResult,
  type CreateResult,
  type UpdateResult,
  type DeleteResult,
  type Precondition,
  type Timestamp,
  // Document factories
  createDocumentPath,
  createDocumentRef,
  createDocumentSnapshot,
  createDocumentMask,
  createTimestamp,
  timestampToDate,
  formatDocumentPath,
  parseDocumentPath as parseDocumentPathFull,
  preconditionExists,
  preconditionUpdateTime,
} from "./types/document.js";

// Types - Field values
export {
  // Field value types
  type FieldValue,
  type FieldValueMap,
  type GeoPoint,
  type SetOptions,
  type ListOptions,
  // Field value utilities
  createGeoPoint,
  toFieldValue,
  fromFieldValue,
  toFirestoreFields,
  fromFirestoreFields,
  validateFieldPath as validateFieldPathValue,
  validateDocumentDepth,
} from "./types/field-value.js";

// Types - Query
export {
  // Filter types
  type FilterOp,
  type CompositeOp,
  type UnaryOp,
  type Filter,
  type FieldFilter,
  type UnaryFilter,
  type CompositeFilter,
  type FieldReference,
  // Query types
  type Query,
  type OrderBy,
  type Direction,
  type Cursor,
  type Projection,
  type CollectionSelector,
  // Query result types
  type QueryResult,
  // Aggregation types
  type AggregationType,
  type Aggregation,
  type CountAggregation,
  type SumAggregation,
  type AverageAggregation,
  type AggregationQuery,
  type AggregateResult,
  type AggregationResult,
  // Request/Response types
  type RunQueryRequest,
  type RunQueryResponse,
  type RunAggregationQueryRequest,
  // Helper type
  type FieldValueInput,
} from "./types/index.js";

// Types - Batch
export {
  // Batch types
  type Write,
  type WriteBatch,
  type BatchWriteResult,
} from "./types/batch.js";

// Services
export {
  // Document service
  DocumentService,
  type HttpTransport,
  type CircuitBreaker,
  type MetricsEmitter,
  type Tracer,
  type Span,
} from "./services/document.js";

export {
  // Query service types and classes
  QueryService,
  type WhereFilter,
  type Cursor as QueryCursor,
  type FieldValueMap as QueryFieldValueMap,
  type Timestamp as QueryTimestamp,
  type DocumentSnapshot as QueryDocumentSnapshot,
  type QueryResult as QueryServiceResult,
  type Aggregation as QueryAggregation,
  type AggregationResult as QueryAggregationResult,
  type PaginatedResult,
  type QueryPlan,
  type IndexInfo,
  type QuerySnapshot,
  type DocumentChange,
} from "./services/query.js";

export {
  // Transaction service
  TransactionService,
  type Transaction,
  type TransactionOptions,
  type TransactionObservability,
  FirestoreErrorCode,
  FirestoreError as TransactionFirestoreError,
} from "./services/transaction.js";

export {
  // Listener service
  ListenerService,
  ListenerManager as ServiceListenerManager,
  type ListenerCallback,
  type QueryListenerCallback,
  type ListenerRegistration,
  type ResumeToken,
  type ListenerConfig,
  type ListenerObservability,
} from "./services/listener.js";

// Query builder
export {
  // Filter functions
  fieldFilter,
  unaryFilter,
  compositeFilter,
  andFilters,
  orFilters,
  createFieldReference,
  validateFilter,
  validateInClause,
  validateOrClauses,
  toFieldValue as filterToFieldValue,
  fromFieldValue as filterFromFieldValue,
} from "./query/filter.js";

export {
  // Cursor functions
  createCursor,
  encodeCursor,
  decodeCursor,
  extractCursorFromDocument,
  extractCursorValuesFromDocument,
  createCursorFromValues,
  cursorToValues,
  validateCursor,
  createPageToken,
  cursorsEqual,
} from "./query/cursor.js";

export {
  // Aggregation functions
  createCountAggregation,
  createSumAggregation,
  createAverageAggregation,
  buildAggregationQuery,
  validateAggregations,
  validateAggregation,
  createStatsAggregations,
  extractAggregationValue,
  parseAggregationResults,
  isCountAggregation,
  isSumAggregation,
  isAverageAggregation,
} from "./query/aggregation.js";

// Transport
export {
  // Transport types
  type HttpRequest,
  type HttpResponse,
  type HttpTransport as TransportHttpTransport,
  // Transport implementation
  FetchTransport,
  createTransport,
  // Request helpers
  createRequest,
  buildFirestoreUrl,
  buildParentPath,
  buildDocumentsPath,
  buildDocumentPath as buildTransportDocumentPath,
  buildCollectionPath as buildTransportCollectionPath,
  parseDocumentName as parseTransportDocumentName,
  withAuthorization,
  addQueryParams,
  // Response helpers
  isSuccess,
  getRequestId,
  getHeader,
  getContentType,
} from "./transport/index.js";

// Validation
export {
  // Document ID validation
  validateDocumentId,
  isValidDocumentId,
  generateDocumentId,
  sanitizeDocumentId,
  getSpecialCharacters,
  isAutoGeneratedId,
  MIN_DOCUMENT_ID_LENGTH,
  MAX_DOCUMENT_ID_LENGTH,
} from "./validation/document-id.js";

export {
  // Document path validation
  validateDocumentPath as validateDocPath,
  isValidDocumentPath,
  parseDocumentPath,
  buildDocumentPath,
  buildDocumentName,
  parseDocumentName,
  getParentCollectionPath,
  getParentDocumentPath,
  getPathSegments,
  isNestedDocument,
  getDocumentDepth,
  normalizeDocumentPath,
  type ValidatedDocumentPath,
} from "./validation/document-path.js";

// Listener module
export {
  // Listener manager
  ListenerManager,
  createListenerManager,
  type DocumentListenerCallback,
  type QueryListenerCallback as ManagerQueryListenerCallback,
} from "./listener/manager.js";

export {
  // Stream types and functions
  type ListenEventType,
  type TargetChangeType,
  type ListenResponse,
  type ListenerStreamEvents,
  type ListenerStreamOptions,
  processListenResponse,
  buildListenRequest,
} from "./listener/stream.js";

export {
  // Reconnection handling
  type ReconnectionState,
  type ReconnectionConfig,
  DEFAULT_RECONNECTION_CONFIG,
  calculateReconnectDelay,
  isTransientError,
  shouldReconnect,
  createReconnectionHandler,
  ReconnectionHandler,
  sleep,
  sleepWithAbort,
} from "./listener/reconnect.js";

export {
  // Snapshot accumulation
  SnapshotAccumulator,
  SnapshotDebouncer,
  createDocumentChange,
  computeChanges,
  createSnapshotDebouncer,
} from "./listener/snapshot.js";

// Query builder
export {
  QueryBuilder,
  createQueryBuilder,
} from "./query/builder.js";

// Collection service
export {
  CollectionService,
  type QueryBuilder as CollectionQueryBuilder,
} from "./services/collection.js";
