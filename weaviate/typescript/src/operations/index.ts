/**
 * Object operations module
 *
 * This module provides comprehensive object CRUD operations for Weaviate,
 * including creation, retrieval, update, deletion, and validation of objects.
 *
 * Key features:
 * - Full CRUD operations with resilience and observability
 * - Schema validation support
 * - Multi-tenancy support
 * - Consistency level control
 * - Vector and property serialization/deserialization
 *
 * @module operations
 */

// Main service
export { ObjectService, type SchemaCache } from './object.js';

// Types
export type {
  CreateObjectOptions,
  GetObjectOptions,
  UpdateObjectOptions,
  DeleteObjectOptions,
  ValidateObjectOptions,
  ValidationError,
  ObjectValidationResult,
  IncludeParams,
  ObjectQueryParams,
  CreateObjectRequest,
  UpdateObjectRequest,
  ObjectApiResponse,
  ValidateObjectRequest,
  ValidateObjectResponse,
} from './types.js';

// Serialization utilities
export {
  serializeObject,
  deserializeObject,
  serializeUpdateRequest,
  serializeProperties,
  deserializeProperties,
  serializePropertyValue,
  deserializePropertyValue,
  buildIncludeParams,
} from './serialization.js';

// Validation utilities
export {
  validateObject,
  validateVector,
  validateProperties,
  getVectorDimension,
  validateRequiredProperties,
  isPropertyFilterable,
  isPropertySearchable,
} from './validation.js';
