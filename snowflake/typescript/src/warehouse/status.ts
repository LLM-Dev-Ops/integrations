/**
 * Warehouse Status Checker
 *
 * Monitors and reports on warehouse status and availability.
 * @module @llmdevops/snowflake-integration/warehouse/status
 */

import type { WarehouseStatus, WarehouseState } from '../types/index.js';
import { WarehouseNotFoundError, WarehouseSuspendedError } from '../errors/index.js';

// ============================================================================
// Warehouse Status Checker Interface
// ============================================================================

/**
 * Interface for checking warehouse status.
 * This would typically be implemented by a client that can query Snowflake.
 */
export interface WarehouseStatusProvider {
  /**
   * Retrieves the current status of a warehouse.
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   */
  getWarehouseStatus(warehouseName: string): Promise<WarehouseStatus>;

  /**
   * Retrieves the status of all warehouses.
   */
  getAllWarehouseStatuses(): Promise<WarehouseStatus[]>;
}

// ============================================================================
// Warehouse Status Checker
// ============================================================================

/**
 * Options for warehouse status checker.
 */
export interface WarehouseStatusCheckerOptions {
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Maximum queue depth threshold for warnings */
  queueDepthWarningThreshold?: number;
}

/**
 * Cached warehouse status entry.
 */
interface CachedStatus {
  status: WarehouseStatus;
  timestamp: number;
}

/**
 * Warehouse status checker that monitors warehouse availability and health.
 */
export class WarehouseStatusChecker {
  private readonly provider: WarehouseStatusProvider;
  private readonly cacheTtlMs: number;
  private readonly queueDepthWarningThreshold: number;
  private readonly statusCache: Map<string, CachedStatus>;

  constructor(
    provider: WarehouseStatusProvider,
    options: WarehouseStatusCheckerOptions = {}
  ) {
    this.provider = provider;
    this.cacheTtlMs = options.cacheTtlMs ?? 30000; // 30 seconds default
    this.queueDepthWarningThreshold = options.queueDepthWarningThreshold ?? 10;
    this.statusCache = new Map();
  }

  /**
   * Gets the current status of a warehouse.
   * Results are cached based on the configured TTL.
   *
   * @param warehouseName - Name of the warehouse
   * @returns Warehouse status information
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   */
  async getStatus(warehouseName: string): Promise<WarehouseStatus> {
    const cached = this.statusCache.get(warehouseName);
    const now = Date.now();

    // Return cached status if still valid
    if (cached && now - cached.timestamp < this.cacheTtlMs) {
      return cached.status;
    }

    // Fetch fresh status
    const status = await this.provider.getWarehouseStatus(warehouseName);

    // Update cache
    this.statusCache.set(warehouseName, {
      status,
      timestamp: now,
    });

    return status;
  }

  /**
   * Gets the status of all warehouses.
   * This bypasses the cache and always fetches fresh data.
   *
   * @returns Array of warehouse statuses
   */
  async getAllStatuses(): Promise<WarehouseStatus[]> {
    const statuses = await this.provider.getAllWarehouseStatuses();

    // Update cache with all statuses
    const now = Date.now();
    for (const status of statuses) {
      this.statusCache.set(status.name, {
        status,
        timestamp: now,
      });
    }

    return statuses;
  }

  /**
   * Checks if a warehouse is available for query execution.
   * A warehouse is considered available if it is in 'started' state.
   *
   * @param warehouseName - Name of the warehouse
   * @returns true if warehouse is available, false otherwise
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   */
  async isAvailable(warehouseName: string): Promise<boolean> {
    const status = await this.getStatus(warehouseName);
    return status.state === 'started';
  }

  /**
   * Gets the current queue depth for a warehouse.
   * Queue depth is the number of queued queries waiting for execution.
   *
   * @param warehouseName - Name of the warehouse
   * @returns Current queue depth
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   */
  async getQueueDepth(warehouseName: string): Promise<number> {
    const status = await this.getStatus(warehouseName);
    return status.queuedQueries;
  }

  /**
   * Checks if a warehouse is overloaded based on its queue depth.
   *
   * @param warehouseName - Name of the warehouse
   * @returns true if warehouse queue exceeds warning threshold
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   */
  async isOverloaded(warehouseName: string): Promise<boolean> {
    const queueDepth = await this.getQueueDepth(warehouseName);
    return queueDepth >= this.queueDepthWarningThreshold;
  }

  /**
   * Validates that a warehouse is ready to execute queries.
   * Throws an error if the warehouse is not in a valid state.
   *
   * @param warehouseName - Name of the warehouse
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   * @throws {WarehouseSuspendedError} If warehouse is suspended
   */
  async validateWarehouseReady(warehouseName: string): Promise<void> {
    const status = await this.getStatus(warehouseName);

    if (status.state === 'suspended') {
      throw new WarehouseSuspendedError(warehouseName);
    }

    // 'resizing' state is acceptable - queries can still run
    // 'started' state is the ideal state
  }

  /**
   * Gets detailed availability information for a warehouse.
   *
   * @param warehouseName - Name of the warehouse
   * @returns Detailed availability information
   * @throws {WarehouseNotFoundError} If warehouse does not exist
   */
  async getAvailabilityInfo(
    warehouseName: string
  ): Promise<{
    available: boolean;
    state: WarehouseState;
    queueDepth: number;
    isOverloaded: boolean;
  }> {
    const status = await this.getStatus(warehouseName);
    const queueDepth = status.queuedQueries;
    const isOverloaded = queueDepth >= this.queueDepthWarningThreshold;

    return {
      available: status.state === 'started',
      state: status.state,
      queueDepth,
      isOverloaded,
    };
  }

  /**
   * Clears the status cache for a specific warehouse or all warehouses.
   *
   * @param warehouseName - Optional warehouse name. If not provided, clears all cache.
   */
  clearCache(warehouseName?: string): void {
    if (warehouseName) {
      this.statusCache.delete(warehouseName);
    } else {
      this.statusCache.clear();
    }
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache statistics including size and hit rate
   */
  getCacheStats(): {
    size: number;
    warehouses: string[];
  } {
    return {
      size: this.statusCache.size,
      warehouses: Array.from(this.statusCache.keys()),
    };
  }

  /**
   * Performs a health check on multiple warehouses.
   *
   * @param warehouseNames - Names of warehouses to check
   * @returns Health check results for each warehouse
   */
  async healthCheck(
    warehouseNames: string[]
  ): Promise<
    Array<{
      warehouseName: string;
      healthy: boolean;
      state: WarehouseState;
      queueDepth: number;
      error?: string;
    }>
  > {
    const results = await Promise.allSettled(
      warehouseNames.map(async (name) => {
        const status = await this.getStatus(name);
        return {
          warehouseName: name,
          healthy: status.state === 'started',
          state: status.state,
          queueDepth: status.queuedQueries,
        };
      })
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          warehouseName: warehouseNames[index]!,
          healthy: false,
          state: 'suspended' as WarehouseState,
          queueDepth: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });
  }
}
