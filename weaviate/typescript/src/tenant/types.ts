/**
 * Tenant Service Types
 *
 * Re-exports types from the main tenant types module and
 * defines additional service-specific types.
 */

// Re-export all tenant types from main types module
export type {
  Tenant,
  TenantStatus,
  CreateTenantOptions,
  UpdateTenantOptions,
  TenantOptions,
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
  isTenantQueryable,
} from '../types/tenant.js';

// Service-specific types
export type { TenantValidationOptions } from './validation.js';
export type { TenantCacheEntry, TenantCacheOptions } from './cache.js';
export type { EnsureTenantActiveOptions } from './service.js';
