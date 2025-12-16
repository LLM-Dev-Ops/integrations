/**
 * Tenant Service Implementation
 *
 * Provides core tenant management operations for Weaviate multi-tenancy.
 */

import type { HttpTransport } from '../transport/types.js';
import type { ObservabilityContext } from '../observability/types.js';
import type { WeaviateConfig } from '../config/types.js';
import type { Tenant, TenantStatus, TenantOptions } from '../types/tenant.js';
import {
  ClassNotFoundError,
  TenantNotFoundError,
  TenantNotActiveError,
} from '../errors/types.js';
import { mapHttpError } from '../errors/mapper.js';
import { parseTenantStatus, serializeTenantStatus, isTenantQueryable } from './status.js';
import { TenantStatusCache } from './cache.js';

/**
 * API response for listing tenants
 */
interface ListTenantsApiResponse {
  name: string;
  activityStatus: string;
}

/**
 * API request for updating tenant status
 */
interface UpdateTenantStatusRequest {
  name: string;
  activityStatus: string;
}

/**
 * Options for ensuring tenant is active
 */
export interface EnsureTenantActiveOptions {
  /**
   * Automatically activate tenant if it's inactive
   * Default: false
   */
  autoActivate?: boolean;
}

/**
 * TenantService manages multi-tenancy operations in Weaviate.
 *
 * This service provides methods to:
 * - List and retrieve tenants for a class
 * - Activate, deactivate, and offload tenants
 * - Ensure tenant is in active state before operations
 * - Cache tenant status for performance
 *
 * @example
 * ```typescript
 * const tenantService = new TenantService(transport, observability, config);
 *
 * // List all tenants for a class
 * const tenants = await tenantService.listTenants('Article');
 *
 * // Get specific tenant
 * const tenant = await tenantService.getTenant('Article', 'tenant-a');
 *
 * // Activate a tenant
 * await tenantService.activateTenant('Article', 'tenant-a');
 *
 * // Ensure tenant is active before operations
 * await tenantService.ensureTenantActive('Article', 'tenant-a', {
 *   autoActivate: true
 * });
 * ```
 */
export class TenantService {
  private transport: HttpTransport;
  private observability: ObservabilityContext;
  private config: WeaviateConfig;
  private cache: TenantStatusCache;

  /**
   * Create a new TenantService instance.
   *
   * @param transport - HTTP transport for API requests
   * @param observability - Observability context for logging and metrics
   * @param config - Weaviate configuration
   */
  constructor(
    transport: HttpTransport,
    observability: ObservabilityContext,
    config: WeaviateConfig
  ) {
    this.transport = transport;
    this.observability = observability;
    this.config = config;
    this.cache = new TenantStatusCache({
      ttlMs: 60000, // 60 seconds TTL for tenant status
    });
  }

  /**
   * List all tenants for a class.
   *
   * Returns an array of tenants with their current activity status.
   * Handle 404 as ClassNotFound error.
   *
   * @param className - Name of the class
   * @returns Promise resolving to array of tenants
   * @throws ClassNotFoundError if the class doesn't exist
   *
   * @example
   * ```typescript
   * const tenants = await tenantService.listTenants('Article');
   * console.log(`Found ${tenants.length} tenants`);
   * for (const tenant of tenants) {
   *   console.log(`${tenant.name}: ${tenant.activityStatus}`);
   * }
   * ```
   */
  async listTenants(className: string): Promise<Tenant[]> {
    const span = this.observability.tracer.startSpan('weaviate.tenant.list', {
      class_name: className,
    });

    try {
      const response = await this.transport.get<ListTenantsApiResponse[]>(
        `/v1/schema/${className}/tenants`
      );

      if (response.status === 404) {
        throw new ClassNotFoundError(className);
      }

      if (response.status !== 200) {
        throw mapHttpError(response);
      }

      // Parse tenants
      const tenants: Tenant[] = response.body.map((t) => ({
        name: t.name,
        activityStatus: parseTenantStatus(t.activityStatus),
      }));

      // Update cache
      for (const tenant of tenants) {
        this.cache.set(className, tenant.name, tenant.activityStatus);
      }

      this.observability.logger.debug('Listed tenants', {
        className,
        count: tenants.length,
      });

      this.observability.metrics.increment('weaviate.tenant.list', 1, {
        class_name: className,
      });

      span.setAttribute('tenant_count', tenants.length);
      span.end('ok');

      return tenants;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  /**
   * Get a specific tenant by name.
   *
   * Internally uses listTenants and filters by name.
   * Returns null if the tenant is not found.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant
   * @returns Promise resolving to tenant or null if not found
   * @throws ClassNotFoundError if the class doesn't exist
   *
   * @example
   * ```typescript
   * const tenant = await tenantService.getTenant('Article', 'tenant-a');
   * if (tenant) {
   *   console.log(`Tenant status: ${tenant.activityStatus}`);
   * } else {
   *   console.log('Tenant not found');
   * }
   * ```
   */
  async getTenant(className: string, tenantName: string): Promise<Tenant | null> {
    const span = this.observability.tracer.startSpan('weaviate.tenant.get', {
      class_name: className,
      tenant: tenantName,
    });

    try {
      // Check cache first
      const cachedStatus = this.cache.get(className, tenantName);
      if (cachedStatus !== undefined) {
        this.observability.metrics.increment('weaviate.tenant.cache.hit', 1);
        span.setAttribute('cache', 'hit');
        span.end('ok');
        return {
          name: tenantName,
          activityStatus: cachedStatus,
        };
      }

      this.observability.metrics.increment('weaviate.tenant.cache.miss', 1);
      span.setAttribute('cache', 'miss');

      // List all tenants and filter
      const tenants = await this.listTenants(className);
      const tenant = tenants.find((t) => t.name === tenantName);

      if (tenant) {
        this.observability.logger.debug('Retrieved tenant', {
          className,
          tenantName,
          status: tenant.activityStatus,
        });
      }

      span.end('ok');
      return tenant ?? null;
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  /**
   * Activate a tenant.
   *
   * Changes the tenant status to ACTIVE, making it queryable.
   * Uses PUT /v1/schema/{className}/tenants with status update.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant to activate
   * @returns Promise that resolves when activation is complete
   *
   * @example
   * ```typescript
   * await tenantService.activateTenant('Article', 'tenant-a');
   * console.log('Tenant activated successfully');
   * ```
   */
  async activateTenant(className: string, tenantName: string): Promise<void> {
    await this.updateTenantStatus(className, tenantName, 'ACTIVE');

    this.observability.logger.info('Tenant activated', {
      className,
      tenantName,
    });
  }

  /**
   * Deactivate a tenant.
   *
   * Changes the tenant status to INACTIVE, making it non-queryable but
   * keeping data in memory for quick reactivation.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant to deactivate
   * @returns Promise that resolves when deactivation is complete
   *
   * @example
   * ```typescript
   * await tenantService.deactivateTenant('Article', 'tenant-a');
   * console.log('Tenant deactivated successfully');
   * ```
   */
  async deactivateTenant(className: string, tenantName: string): Promise<void> {
    await this.updateTenantStatus(className, tenantName, 'INACTIVE');

    this.observability.logger.info('Tenant deactivated', {
      className,
      tenantName,
    });
  }

  /**
   * Offload a tenant to cold storage.
   *
   * Changes the tenant status to OFFLOADED, moving data to cold storage.
   * Reactivation from offloaded state may take longer than from inactive.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant to offload
   * @returns Promise that resolves when offload is complete
   *
   * @example
   * ```typescript
   * await tenantService.offloadTenant('Article', 'tenant-a');
   * console.log('Tenant offloaded to cold storage');
   * ```
   */
  async offloadTenant(className: string, tenantName: string): Promise<void> {
    await this.updateTenantStatus(className, tenantName, 'OFFLOADED');

    this.observability.logger.info('Tenant offloaded', {
      className,
      tenantName,
    });
  }

  /**
   * Ensure a tenant is active before performing operations.
   *
   * Checks the tenant status and either:
   * - Returns immediately if already active
   * - Auto-activates if inactive and autoActivate option is true
   * - Throws TenantNotActiveError if inactive without autoActivate
   * - Throws TenantNotActiveError if offloaded (cannot auto-activate)
   *
   * Per refinement-weaviate.md Section 1.3, this method provides a safe
   * way to ensure tenant is ready for queries.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant
   * @param options - Options for ensuring active state
   * @returns Promise that resolves when tenant is active
   * @throws TenantNotFoundError if tenant doesn't exist
   * @throws TenantNotActiveError if tenant is not active and cannot be activated
   *
   * @example
   * ```typescript
   * // Auto-activate if needed
   * await tenantService.ensureTenantActive('Article', 'tenant-a', {
   *   autoActivate: true
   * });
   *
   * // Strict mode - throw if not active
   * await tenantService.ensureTenantActive('Article', 'tenant-a');
   * ```
   */
  async ensureTenantActive(
    className: string,
    tenantName: string,
    options?: EnsureTenantActiveOptions
  ): Promise<void> {
    const span = this.observability.tracer.startSpan('weaviate.tenant.ensure_active', {
      class_name: className,
      tenant: tenantName,
      auto_activate: options?.autoActivate ?? false,
    });

    try {
      // Get tenant status
      const tenant = await this.getTenant(className, tenantName);

      if (!tenant) {
        throw new TenantNotFoundError(tenantName, className);
      }

      // Already active - done
      if (isTenantQueryable(tenant.activityStatus)) {
        this.observability.logger.debug('Tenant already active', {
          className,
          tenantName,
        });
        span.end('ok');
        return;
      }

      // Handle inactive tenant
      if (tenant.activityStatus === 'INACTIVE') {
        if (options?.autoActivate) {
          this.observability.logger.info('Auto-activating inactive tenant', {
            className,
            tenantName,
          });

          await this.activateTenant(className, tenantName);

          span.setAttribute('auto_activated', true);
          span.end('ok');
          return;
        } else {
          throw new TenantNotActiveError(
            tenantName,
            'INACTIVE',
            className,
            {
              message: 'Tenant is inactive. Call activateTenant() first or use autoActivate option.',
            }
          );
        }
      }

      // Handle offloaded tenant - cannot auto-activate
      if (tenant.activityStatus === 'OFFLOADED') {
        throw new TenantNotActiveError(
          tenantName,
          'OFFLOADED',
          className,
          {
            message: 'Tenant is offloaded to cold storage. Activation may take time and must be done explicitly.',
          }
        );
      }

      // Other statuses (CREATING, UPDATING, DELETING)
      throw new TenantNotActiveError(
        tenantName,
        tenant.activityStatus,
        className,
        {
          message: `Tenant is in ${tenant.activityStatus} state and cannot be used for operations.`,
        }
      );
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  /**
   * Update tenant status (internal method).
   *
   * Sends PUT request to update tenant activity status.
   * Invalidates cache for the tenant.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant
   * @param status - New activity status
   * @returns Promise that resolves when update is complete
   * @private
   */
  private async updateTenantStatus(
    className: string,
    tenantName: string,
    status: string
  ): Promise<void> {
    const span = this.observability.tracer.startSpan('weaviate.tenant.update_status', {
      class_name: className,
      tenant: tenantName,
      status,
    });

    try {
      const body: UpdateTenantStatusRequest[] = [
        {
          name: tenantName,
          activityStatus: status,
        },
      ];

      const response = await this.transport.put(
        `/v1/schema/${className}/tenants`,
        body
      );

      if (response.status !== 200) {
        throw mapHttpError(response);
      }

      // Invalidate cache
      this.cache.invalidate(className, tenantName);

      this.observability.logger.debug('Tenant status updated', {
        className,
        tenantName,
        status,
      });

      this.observability.metrics.increment('weaviate.tenant.update', 1, {
        class_name: className,
        status,
      });

      span.end('ok');
    } catch (error) {
      span.recordError(error as Error);
      span.end('error');
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific tenant or all tenants in a class.
   *
   * @param className - Name of the class
   * @param tenantName - Optional tenant name (if omitted, invalidates all tenants in class)
   *
   * @example
   * ```typescript
   * // Invalidate specific tenant
   * tenantService.invalidateCache('Article', 'tenant-a');
   *
   * // Invalidate all tenants for a class
   * tenantService.invalidateCache('Article');
   * ```
   */
  invalidateCache(className: string, tenantName?: string): void {
    this.cache.invalidate(className, tenantName);

    this.observability.logger.debug('Tenant cache invalidated', {
      className,
      tenantName,
    });
  }

  /**
   * Clear all cached tenant status.
   *
   * @example
   * ```typescript
   * tenantService.clearCache();
   * ```
   */
  clearCache(): void {
    this.cache.clear();

    this.observability.logger.debug('Tenant cache cleared');
  }
}
