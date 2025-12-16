/**
 * Tenant Service for Weaviate Multi-Tenancy
 *
 * This module provides comprehensive tenant management functionality for Weaviate's
 * multi-tenancy feature, including:
 *
 * - Listing and retrieving tenants
 * - Activating/deactivating tenants
 * - Offloading tenants to cold storage
 * - Tenant status validation and caching
 * - Tenant access validation
 *
 * @module @llmdevops/weaviate-integration/tenant
 */

// ============================================================================
// Service Exports
// ============================================================================

export { TenantService } from './service.js';

// ============================================================================
// Validation Exports
// ============================================================================

export {
  validateTenantAccess,
  validateTenantName,
  isTenantAllowed,
  type TenantValidationOptions,
} from './validation.js';

// ============================================================================
// Status Utilities Exports
// ============================================================================

export {
  parseTenantStatus,
  serializeTenantStatus,
  isTenantQueryable,
  canTransitionTo,
} from './status.js';

// ============================================================================
// Cache Exports
// ============================================================================

export {
  TenantStatusCache,
  type TenantCacheEntry,
  type TenantCacheOptions,
} from './cache.js';

// ============================================================================
// Type Re-Exports
// ============================================================================

export type {
  Tenant,
  TenantStatus,
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
} from '../types/tenant.js';

export {
  TenantStatus as TenantStatusEnum,
  isTenantActive,
  isTenantInactive,
  isTenantOffloaded,
  isTenantQueryable as isTenantQueryableType,
} from '../types/tenant.js';
