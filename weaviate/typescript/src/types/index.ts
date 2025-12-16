/**
 * Weaviate TypeScript Integration - Type Definitions
 *
 * This module provides comprehensive TypeScript type definitions for the
 * Weaviate vector database integration, covering all aspects of object
 * management, vector search, filtering, aggregations, and schema introspection.
 *
 * @module @weaviate/types
 */

// Property types
export type {
  PropertyValue,
  Properties,
  GeoCoordinates,
  PhoneNumber,
  UUID,
  ObjectReference,
} from './property.js';

export {
  isGeoCoordinates,
  isPhoneNumber,
  isObjectReference,
  isObjectReferenceArray,
  createUUID,
  isValidUUID,
} from './property.js';

// Vector types
export type {
  Vector,
  VectorWithMetadata,
  SimilarityScores,
  PQConfig,
} from './vector.js';

export {
  DistanceMetric,
  isValidVectorDimensions,
  isValidVectorValues,
  isValidVector,
  normalizeVector,
} from './vector.js';

// Filter types
export type {
  WhereFilter,
  FilterOperand,
  FilterValue,
  GeoRange,
  AndFilter,
  OrFilter,
  OperandFilter,
} from './filter.js';

export {
  FilterOperator,
  isOperandFilter,
  isAndFilter,
  isOrFilter,
  isGeoRange,
} from './filter.js';

// Object types
export type {
  WeaviateObject,
  CreateOptions,
  GetOptions,
  UpdateOptions,
  DeleteOptions,
  ExistsOptions,
  ValidateOptions,
  ValidationResult,
  ListOptions,
  ListResponse,
  SortOptions,
} from './object.js';

export { ConsistencyLevel } from './object.js';

// Search types
export type {
  NearVectorQuery,
  NearObjectQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchResult,
  SearchHit,
  SearchGroup,
  MoveParams,
  GroupByConfig,
  AskQuery,
  AskResult,
} from './search.js';

export { FusionType } from './search.js';

// Batch types
export type {
  BatchObject,
  BatchRequest,
  BatchResponse,
  BatchError,
  BatchObjectResult,
  BatchDeleteRequest,
  BatchDeleteResponse,
  BatchUpdateRequest,
  BatchUpdateResponse,
  BatchReferenceRequest,
  BatchReferenceResponse,
  BatchStatus,
} from './batch.js';

export { ConsistencyLevel as BatchConsistencyLevel } from './batch.js';

// Aggregate types
export type {
  AggregateQuery,
  AggregateField,
  AggregateResult,
  AggregateGroup,
  AggregateValue,
  AggregateMeta,
  OccurrenceCount,
  TypeCount,
  NumericAggregation,
  TextAggregation,
  BooleanAggregation,
  DateAggregation,
  ReferenceAggregation,
  CountQuery,
  CountResult,
  MetaCountQuery,
  TopOccurrencesConfig,
} from './aggregate.js';

export {
  Aggregation,
  isNumericAggregation,
  isTextAggregation,
  isBooleanAggregation,
  isDateAggregation,
} from './aggregate.js';

// Tenant types
export type {
  Tenant,
  TenantOptions,
  CreateTenantOptions,
  UpdateTenantOptions,
  ListTenantsRequest,
  ListTenantsResponse,
  GetTenantRequest,
  ActivateTenantRequest,
  DeactivateTenantRequest,
  DeleteTenantRequest,
  TenantStats,
  BatchTenantOperation,
  BatchTenantResult,
} from './tenant.js';

export {
  TenantStatus,
  isTenantActive,
  isTenantInactive,
  isTenantOffloaded,
  isTenantQueryable,
} from './tenant.js';

// Schema types
export type {
  Schema,
  ClassDefinition,
  PropertyDefinition,
  VectorIndexConfig,
  InvertedIndexConfig,
  ReplicationConfig,
  ShardingConfig,
  MultiTenancyConfig,
  ShardInfo,
  ShardsResponse,
  GetSchemaRequest,
  GetClassRequest,
  ListClassesResponse,
  GetShardsRequest,
} from './schema.js';

export {
  Tokenization,
  ShardStatus,
  isTextProperty,
  isReferenceProperty,
  isArrayProperty,
  getBaseDataType,
} from './schema.js';

// Reference types
export type {
  Reference,
  AddReferenceOptions,
  DeleteReferenceOptions,
  UpdateReferencesOptions,
  GetReferencesOptions,
  ReferenceWithMetadata,
  GetReferencesResponse,
  ReferenceValidationResult,
  BatchReferenceOperation,
  BatchReferenceResult,
} from './reference.js';

export {
  createBeacon,
  parseBeacon,
  createReference,
  isValidBeacon,
  isReference,
  isReferenceArray,
} from './reference.js';
