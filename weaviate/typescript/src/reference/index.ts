/**
 * Reference Management Module
 *
 * Provides utilities and services for managing cross-references between
 * Weaviate objects, including beacon handling, validation, and CRUD operations.
 *
 * @module @llmdevops/weaviate-integration/reference
 */

// Export service
export { ReferenceService } from './service.js';
export type { GetReferencesOptions } from './service.js';

// Export beacon utilities
export {
  createBeacon,
  parseBeacon,
  validateBeacon,
  isValidBeaconFormat,
  extractClassFromBeacon,
  extractIdFromBeacon,
  extractHostFromBeacon,
  parseBeacons,
  validateBeacons,
} from './beacon.js';

// Export validation utilities
export {
  validateReferenceProperty,
  getExpectedReferenceClasses,
  validateCrossReference,
  checkCircularReference,
  detectCircularReferenceChain,
  validateReferenceDepth,
  calculateReferenceDepth,
  validateReference,
} from './validation.js';
export type { ValidationResult } from './validation.js';

// Export types
export type {
  ReferenceOptions,
  BeaconComponents,
  ValidationError,
  ExtendedValidationResult,
} from './types.js';

// Re-export common types from main types module
export type {
  Reference,
  AddReferenceOptions,
  DeleteReferenceOptions,
  UpdateReferencesOptions,
  GetReferencesOptions as BaseGetReferencesOptions,
  ReferenceWithMetadata,
  GetReferencesResponse,
  ReferenceValidationResult,
  BatchReferenceOperation,
  BatchReferenceResult,
} from '../types/reference.js';
