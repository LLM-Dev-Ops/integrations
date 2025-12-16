/**
 * Tenant Validation Utilities
 *
 * Provides validation functions for tenant access and naming.
 */

import type { WeaviateConfig } from '../config/types.js';

/**
 * Schema cache interface (minimal interface for validation)
 */
export interface SchemaCache {
  getClass(className: string): Promise<ClassDefinition | null>;
}

/**
 * Class definition interface (minimal for validation)
 */
export interface ClassDefinition {
  name: string;
  multiTenancyConfig?: {
    enabled: boolean;
  };
  [key: string]: unknown;
}

/**
 * Tenant validation options
 */
export interface TenantValidationOptions {
  /**
   * Whether to enforce tenant allowlist from config
   * Default: true
   */
  enforceAllowlist?: boolean;

  /**
   * Whether to warn about tenant on non-multi-tenant class
   * Default: true
   */
  warnOnNonMultiTenant?: boolean;
}

/**
 * Validate tenant access for a class.
 *
 * Checks:
 * 1. If class is multi-tenant enabled
 * 2. If multi-tenant: tenant parameter is required
 * 3. If not multi-tenant: tenant parameter should not be provided (warn)
 * 4. If tenant allowlist is configured: tenant must be in allowlist
 *
 * @param schemaCache - Schema cache for looking up class definition
 * @param config - Weaviate configuration (for tenant allowlist)
 * @param className - Name of the class
 * @param tenant - Optional tenant name
 * @param options - Validation options
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * // Validate tenant access
 * await validateTenantAccess(schemaCache, config, 'Article', 'tenant-a');
 *
 * // This will throw if Article is multi-tenant but no tenant provided
 * await validateTenantAccess(schemaCache, config, 'Article', undefined);
 * ```
 */
export async function validateTenantAccess(
  schemaCache: SchemaCache,
  config: WeaviateConfig,
  className: string,
  tenant?: string,
  options?: TenantValidationOptions
): Promise<void> {
  const opts = {
    enforceAllowlist: options?.enforceAllowlist ?? true,
    warnOnNonMultiTenant: options?.warnOnNonMultiTenant ?? true,
  };

  // Get class definition from schema
  const classDef = await schemaCache.getClass(className);

  if (!classDef) {
    throw new Error(`Class '${className}' not found in schema`);
  }

  const isMultiTenant = classDef.multiTenancyConfig?.enabled ?? false;

  // If class is multi-tenant, tenant is required
  if (isMultiTenant) {
    if (!tenant) {
      throw new Error(
        `Tenant required for multi-tenant class '${className}'. ` +
        'Specify tenant in operation options.'
      );
    }

    // Check tenant allowlist if configured
    if (opts.enforceAllowlist && config.tenantAllowlist) {
      if (!isTenantAllowed(tenant, config.tenantAllowlist)) {
        throw new Error(
          `Tenant '${tenant}' is not in the allowlist. ` +
          `Allowed tenants: ${config.tenantAllowlist.join(', ')}`
        );
      }
    }
  } else {
    // If class is not multi-tenant, tenant should not be provided
    if (tenant && opts.warnOnNonMultiTenant) {
      console.warn(
        `Warning: Tenant '${tenant}' specified for non-multi-tenant class '${className}'. ` +
        'Tenant parameter will be ignored.'
      );
    }
  }
}

/**
 * Validate tenant name format.
 *
 * Tenant names must:
 * - Not be empty
 * - Not exceed 64 characters
 * - Contain only alphanumeric characters, hyphens, and underscores
 * - Start with an alphanumeric character
 *
 * @param name - Tenant name to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * ```typescript
 * validateTenantName('tenant-a');      // true
 * validateTenantName('tenant_123');    // true
 * validateTenantName('123-tenant');    // true
 * validateTenantName('-invalid');      // false (starts with hyphen)
 * validateTenantName('');              // false (empty)
 * ```
 */
export function validateTenantName(name: string): boolean {
  // Check if empty
  if (!name || name.length === 0) {
    return false;
  }

  // Check length
  if (name.length > 64) {
    return false;
  }

  // Check format: alphanumeric, hyphens, underscores, must start with alphanumeric
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  return validPattern.test(name);
}

/**
 * Check if a tenant is allowed by the allowlist.
 *
 * If allowlist is undefined or empty, all tenants are allowed.
 * Otherwise, tenant must be in the allowlist.
 *
 * @param tenant - Tenant name to check
 * @param allowlist - Optional list of allowed tenant names
 * @returns True if tenant is allowed
 *
 * @example
 * ```typescript
 * // No allowlist - all allowed
 * isTenantAllowed('tenant-a', undefined);  // true
 * isTenantAllowed('tenant-a', []);         // true
 *
 * // With allowlist
 * isTenantAllowed('tenant-a', ['tenant-a', 'tenant-b']);  // true
 * isTenantAllowed('tenant-c', ['tenant-a', 'tenant-b']);  // false
 * ```
 */
export function isTenantAllowed(tenant: string, allowlist?: string[]): boolean {
  // If no allowlist configured, all tenants are allowed
  if (!allowlist || allowlist.length === 0) {
    return true;
  }

  // Check if tenant is in allowlist
  return allowlist.includes(tenant);
}

/**
 * Assert that a tenant name is valid.
 *
 * Throws an error if the tenant name is invalid.
 *
 * @param name - Tenant name to validate
 * @throws Error if tenant name is invalid
 *
 * @example
 * ```typescript
 * assertValidTenantName('tenant-a');  // OK
 * assertValidTenantName('-invalid');  // throws Error
 * ```
 */
export function assertValidTenantName(name: string): void {
  if (!validateTenantName(name)) {
    throw new Error(
      `Invalid tenant name: '${name}'. ` +
      'Tenant names must be 1-64 characters, contain only alphanumeric characters, ' +
      'hyphens, and underscores, and start with an alphanumeric character.'
    );
  }
}
