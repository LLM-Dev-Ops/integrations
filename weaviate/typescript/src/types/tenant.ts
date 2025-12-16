/**
 * Weaviate tenant types
 *
 * This module defines types for multi-tenancy support in Weaviate,
 * allowing data isolation at the class level.
 */

/**
 * Tenant activity status
 *
 * Determines whether a tenant is active and how its data is stored.
 */
export enum TenantStatus {
  /**
   * Fully operational - data is loaded and queryable
   */
  Active = 'ACTIVE',

  /**
   * Data preserved but not queryable
   * Tenant can be reactivated
   */
  Inactive = 'INACTIVE',

  /**
   * Data offloaded to cold storage
   * Slower to reactivate than inactive
   */
  Offloaded = 'OFFLOADED',

  /**
   * Tenant is in the process of being created
   */
  Creating = 'CREATING',

  /**
   * Tenant is in the process of being deleted
   */
  Deleting = 'DELETING',

  /**
   * Tenant is in the process of being updated
   */
  Updating = 'UPDATING',
}

/**
 * Tenant definition
 *
 * @example
 * ```typescript
 * const tenant: Tenant = {
 *   name: "tenant-a",
 *   activityStatus: TenantStatus.Active
 * };
 * ```
 */
export interface Tenant {
  /**
   * Unique tenant name
   * Must be unique within the class
   */
  name: string;

  /**
   * Current activity status
   */
  activityStatus: TenantStatus;
}

/**
 * Options for creating a tenant
 */
export interface CreateTenantOptions {
  /**
   * Tenant name
   */
  name: string;

  /**
   * Initial activity status
   * Default: Active
   */
  activityStatus?: TenantStatus;
}

/**
 * Options for updating a tenant
 */
export interface UpdateTenantOptions {
  /**
   * Tenant name
   */
  name: string;

  /**
   * New activity status
   */
  activityStatus: TenantStatus;
}

/**
 * Tenant options for operations
 */
export interface TenantOptions {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenant name
   */
  tenant: string;
}

/**
 * List tenants request
 */
export interface ListTenantsRequest {
  /**
   * Name of the class
   */
  className: string;
}

/**
 * List tenants response
 */
export interface ListTenantsResponse {
  /**
   * Array of tenants
   */
  tenants: Tenant[];

  /**
   * Total count
   */
  total?: number;
}

/**
 * Get tenant request
 */
export interface GetTenantRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenant name
   */
  tenantName: string;
}

/**
 * Activate tenant request
 */
export interface ActivateTenantRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenant name
   */
  tenantName: string;
}

/**
 * Deactivate tenant request
 */
export interface DeactivateTenantRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenant name
   */
  tenantName: string;

  /**
   * Whether to offload to cold storage
   * If false, tenant becomes INACTIVE
   * If true, tenant becomes OFFLOADED
   * Default: false
   */
  offload?: boolean;
}

/**
 * Delete tenant request
 */
export interface DeleteTenantRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenant name
   */
  tenantName: string;
}

/**
 * Tenant statistics
 */
export interface TenantStats {
  /**
   * Tenant name
   */
  name: string;

  /**
   * Activity status
   */
  activityStatus: TenantStatus;

  /**
   * Number of objects
   */
  objectCount?: number;

  /**
   * Storage size in bytes
   */
  storageSize?: number;

  /**
   * Last access time
   */
  lastAccessTime?: Date;

  /**
   * Creation time
   */
  creationTime?: Date;
}

/**
 * Batch tenant operation
 */
export interface BatchTenantOperation {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenants to create
   */
  create?: CreateTenantOptions[];

  /**
   * Tenants to update
   */
  update?: UpdateTenantOptions[];

  /**
   * Tenant names to delete
   */
  delete?: string[];
}

/**
 * Batch tenant result
 */
export interface BatchTenantResult {
  /**
   * Successfully created tenants
   */
  created?: Tenant[];

  /**
   * Successfully updated tenants
   */
  updated?: Tenant[];

  /**
   * Successfully deleted tenant names
   */
  deleted?: string[];

  /**
   * Errors that occurred
   */
  errors?: Array<{
    /**
     * Tenant name
     */
    tenant: string;

    /**
     * Operation that failed
     */
    operation: 'create' | 'update' | 'delete';

    /**
     * Error message
     */
    message: string;
  }>;
}

/**
 * Type guard to check if a tenant is active
 *
 * @param tenant - The tenant to check
 * @returns True if the tenant is active
 */
export function isTenantActive(tenant: Tenant): boolean {
  return tenant.activityStatus === TenantStatus.Active;
}

/**
 * Type guard to check if a tenant is inactive
 *
 * @param tenant - The tenant to check
 * @returns True if the tenant is inactive
 */
export function isTenantInactive(tenant: Tenant): boolean {
  return tenant.activityStatus === TenantStatus.Inactive;
}

/**
 * Type guard to check if a tenant is offloaded
 *
 * @param tenant - The tenant to check
 * @returns True if the tenant is offloaded
 */
export function isTenantOffloaded(tenant: Tenant): boolean {
  return tenant.activityStatus === TenantStatus.Offloaded;
}

/**
 * Type guard to check if a tenant is queryable
 *
 * @param tenant - The tenant to check
 * @returns True if the tenant can be queried
 */
export function isTenantQueryable(tenant: Tenant): boolean {
  return tenant.activityStatus === TenantStatus.Active;
}
