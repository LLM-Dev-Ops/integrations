/**
 * Tenant Status Utilities
 *
 * Provides utilities for parsing, serializing, and validating tenant status transitions.
 */

import { TenantStatus } from '../types/tenant.js';

/**
 * Parse API tenant status string to TenantStatus enum.
 *
 * Maps Weaviate API status strings to TypeScript enum values:
 * - "ACTIVE" -> TenantStatus.Active
 * - "INACTIVE" -> TenantStatus.Inactive
 * - "OFFLOADED" -> TenantStatus.Offloaded
 * - "CREATING" -> TenantStatus.Creating
 * - "DELETING" -> TenantStatus.Deleting
 * - "UPDATING" -> TenantStatus.Updating
 *
 * @param status - API status string
 * @returns TenantStatus enum value
 * @throws Error if status is not recognized
 *
 * @example
 * ```typescript
 * const status = parseTenantStatus('ACTIVE');  // TenantStatus.Active
 * const status2 = parseTenantStatus('INACTIVE');  // TenantStatus.Inactive
 * ```
 */
export function parseTenantStatus(status: string): TenantStatus {
  const upperStatus = status.toUpperCase();

  switch (upperStatus) {
    case 'ACTIVE':
      return TenantStatus.Active;
    case 'INACTIVE':
      return TenantStatus.Inactive;
    case 'OFFLOADED':
      return TenantStatus.Offloaded;
    case 'CREATING':
      return TenantStatus.Creating;
    case 'DELETING':
      return TenantStatus.Deleting;
    case 'UPDATING':
      return TenantStatus.Updating;
    default:
      throw new Error(`Unknown tenant status: ${status}`);
  }
}

/**
 * Serialize TenantStatus enum to API status string.
 *
 * Maps TypeScript enum values to Weaviate API status strings:
 * - TenantStatus.Active -> "ACTIVE"
 * - TenantStatus.Inactive -> "INACTIVE"
 * - TenantStatus.Offloaded -> "OFFLOADED"
 * - TenantStatus.Creating -> "CREATING"
 * - TenantStatus.Deleting -> "DELETING"
 * - TenantStatus.Updating -> "UPDATING"
 *
 * @param status - TenantStatus enum value
 * @returns API status string
 *
 * @example
 * ```typescript
 * const apiStatus = serializeTenantStatus(TenantStatus.Active);  // "ACTIVE"
 * const apiStatus2 = serializeTenantStatus(TenantStatus.Inactive);  // "INACTIVE"
 * ```
 */
export function serializeTenantStatus(status: TenantStatus): string {
  return status;
}

/**
 * Check if a tenant with given status can be queried.
 *
 * Only ACTIVE tenants are queryable. All other statuses
 * (INACTIVE, OFFLOADED, CREATING, DELETING, UPDATING) are not queryable.
 *
 * @param status - Tenant status
 * @returns True if tenant is queryable (ACTIVE)
 *
 * @example
 * ```typescript
 * isTenantQueryable(TenantStatus.Active);     // true
 * isTenantQueryable(TenantStatus.Inactive);   // false
 * isTenantQueryable(TenantStatus.Offloaded);  // false
 * isTenantQueryable(TenantStatus.Creating);   // false
 * ```
 */
export function isTenantQueryable(status: TenantStatus): boolean {
  return status === TenantStatus.Active;
}

/**
 * Check if a tenant can transition from one status to another.
 *
 * Valid transitions:
 * - INACTIVE -> ACTIVE (activate)
 * - INACTIVE -> OFFLOADED (offload)
 * - ACTIVE -> INACTIVE (deactivate)
 * - ACTIVE -> OFFLOADED (offload)
 * - OFFLOADED -> ACTIVE (activate from cold storage)
 * - CREATING -> ACTIVE (creation complete)
 * - UPDATING -> ACTIVE (update complete)
 * - Any -> DELETING (deletion initiated)
 *
 * Invalid transitions:
 * - CREATING -> INACTIVE (must finish creating first)
 * - DELETING -> anything (deletion is final)
 * - OFFLOADED -> INACTIVE (must activate first)
 *
 * @param from - Current tenant status
 * @param to - Target tenant status
 * @returns True if transition is valid
 *
 * @example
 * ```typescript
 * canTransitionTo(TenantStatus.Inactive, TenantStatus.Active);    // true
 * canTransitionTo(TenantStatus.Active, TenantStatus.Inactive);    // true
 * canTransitionTo(TenantStatus.Offloaded, TenantStatus.Inactive); // false
 * canTransitionTo(TenantStatus.Deleting, TenantStatus.Active);    // false
 * ```
 */
export function canTransitionTo(from: TenantStatus, to: TenantStatus): boolean {
  // Same status is always valid (no-op)
  if (from === to) {
    return true;
  }

  // Cannot transition from DELETING
  if (from === TenantStatus.Deleting) {
    return false;
  }

  // Can always transition to DELETING
  if (to === TenantStatus.Deleting) {
    return true;
  }

  // CREATING can only transition to ACTIVE or DELETING
  if (from === TenantStatus.Creating) {
    return to === TenantStatus.Active || to === TenantStatus.Deleting;
  }

  // UPDATING can only transition to ACTIVE or DELETING
  if (from === TenantStatus.Updating) {
    return to === TenantStatus.Active || to === TenantStatus.Deleting;
  }

  // Define valid transitions
  const validTransitions: Record<TenantStatus, TenantStatus[]> = {
    [TenantStatus.Active]: [
      TenantStatus.Inactive,
      TenantStatus.Offloaded,
      TenantStatus.Updating,
      TenantStatus.Deleting,
    ],
    [TenantStatus.Inactive]: [
      TenantStatus.Active,
      TenantStatus.Offloaded,
      TenantStatus.Deleting,
    ],
    [TenantStatus.Offloaded]: [
      TenantStatus.Active,
      TenantStatus.Deleting,
    ],
    [TenantStatus.Creating]: [
      TenantStatus.Active,
      TenantStatus.Deleting,
    ],
    [TenantStatus.Updating]: [
      TenantStatus.Active,
      TenantStatus.Deleting,
    ],
    [TenantStatus.Deleting]: [],
  };

  const allowedTransitions = validTransitions[from] || [];
  return allowedTransitions.includes(to);
}

/**
 * Get human-readable description of tenant status.
 *
 * @param status - Tenant status
 * @returns Human-readable description
 *
 * @example
 * ```typescript
 * getStatusDescription(TenantStatus.Active);
 * // "Fully operational - data is loaded and queryable"
 *
 * getStatusDescription(TenantStatus.Offloaded);
 * // "Data offloaded to cold storage - slower to reactivate"
 * ```
 */
export function getStatusDescription(status: TenantStatus): string {
  switch (status) {
    case TenantStatus.Active:
      return 'Fully operational - data is loaded and queryable';
    case TenantStatus.Inactive:
      return 'Data preserved but not queryable - can be quickly reactivated';
    case TenantStatus.Offloaded:
      return 'Data offloaded to cold storage - slower to reactivate';
    case TenantStatus.Creating:
      return 'Tenant is being created';
    case TenantStatus.Updating:
      return 'Tenant configuration is being updated';
    case TenantStatus.Deleting:
      return 'Tenant is being deleted';
    default:
      return 'Unknown status';
  }
}

/**
 * Check if a tenant status represents a transitional state.
 *
 * Transitional states: CREATING, UPDATING, DELETING
 * Stable states: ACTIVE, INACTIVE, OFFLOADED
 *
 * @param status - Tenant status
 * @returns True if status is transitional
 *
 * @example
 * ```typescript
 * isTransitionalStatus(TenantStatus.Creating);  // true
 * isTransitionalStatus(TenantStatus.Active);    // false
 * ```
 */
export function isTransitionalStatus(status: TenantStatus): boolean {
  return (
    status === TenantStatus.Creating ||
    status === TenantStatus.Updating ||
    status === TenantStatus.Deleting
  );
}

/**
 * Check if a tenant status represents a stable state.
 *
 * Stable states: ACTIVE, INACTIVE, OFFLOADED
 * Transitional states: CREATING, UPDATING, DELETING
 *
 * @param status - Tenant status
 * @returns True if status is stable
 *
 * @example
 * ```typescript
 * isStableStatus(TenantStatus.Active);     // true
 * isStableStatus(TenantStatus.Creating);   // false
 * ```
 */
export function isStableStatus(status: TenantStatus): boolean {
  return !isTransitionalStatus(status);
}
