/**
 * Warehouse Router
 *
 * Intelligent routing of queries to appropriate warehouses based on workload type,
 * queue depth, size requirements, and priority settings.
 * @module @llmdevops/snowflake-integration/warehouse/router
 */

import type { WorkloadType, WarehouseSize } from '../types/index.js';
import type { WarehouseConfig, WarehouseRoutingConfig } from '../config/index.js';
import { WarehouseNotFoundError, ConfigurationError } from '../errors/index.js';
import type { WarehouseStatusChecker } from './status.js';
import {
  meetsMinimumSize,
  compareWarehouseSizes,
  type WarehouseSelectionCriteria,
  type WarehouseSelectionResult,
  type WarehouseRoutingMetrics,
} from './types.js';

// ============================================================================
// Warehouse Pool Entry
// ============================================================================

/**
 * Internal representation of a warehouse in the routing pool.
 */
interface WarehousePoolEntry {
  config: WarehouseConfig;
  enabled: boolean;
  addedAt: Date;
}

// ============================================================================
// Warehouse Router
// ============================================================================

/**
 * Warehouse router that selects optimal warehouses for query execution.
 */
export class WarehouseRouter {
  private readonly statusChecker: WarehouseStatusChecker;
  private readonly warehousePool: Map<string, WarehousePoolEntry>;
  private defaultWarehouse: string;
  private readonly enableDynamicRouting: boolean;
  private readonly queueThreshold: number;
  private readonly metrics: WarehouseRoutingMetrics;

  /**
   * Creates a new warehouse router.
   *
   * @param statusChecker - Warehouse status checker instance
   * @param config - Warehouse routing configuration
   */
  constructor(
    statusChecker: WarehouseStatusChecker,
    config: WarehouseRoutingConfig
  ) {
    this.statusChecker = statusChecker;
    this.warehousePool = new Map();
    this.defaultWarehouse = config.defaultWarehouse;
    this.enableDynamicRouting = config.enableDynamicRouting ?? true;
    this.queueThreshold = config.queueThreshold ?? 5;

    // Initialize metrics
    this.metrics = {
      totalRoutingDecisions: 0,
      decisionsByWarehouse: new Map(),
      decisionsByWorkloadType: new Map(),
      fallbackToDefaultCount: 0,
      failedRoutingAttempts: 0,
      averageQueueDepthAtSelection: 0,
    };

    // Add configured warehouses to pool
    for (const warehouse of config.warehouses) {
      this.addWarehouse(warehouse);
    }

    // Validate default warehouse is in pool
    if (!this.warehousePool.has(this.defaultWarehouse)) {
      throw new ConfigurationError(
        `Default warehouse '${this.defaultWarehouse}' is not in the warehouse pool`
      );
    }
  }

  /**
   * Adds a warehouse to the routing pool.
   *
   * @param config - Warehouse configuration
   */
  addWarehouse(config: WarehouseConfig): void {
    this.warehousePool.set(config.name, {
      config,
      enabled: true,
      addedAt: new Date(),
    });
  }

  /**
   * Removes a warehouse from the routing pool.
   *
   * @param name - Warehouse name
   * @throws {ConfigurationError} If attempting to remove the default warehouse
   */
  removeWarehouse(name: string): void {
    if (name === this.defaultWarehouse) {
      throw new ConfigurationError(
        'Cannot remove the default warehouse from the pool. Set a new default first.'
      );
    }
    this.warehousePool.delete(name);
  }

  /**
   * Enables or disables a warehouse in the routing pool.
   *
   * @param name - Warehouse name
   * @param enabled - Whether to enable or disable the warehouse
   * @throws {WarehouseNotFoundError} If warehouse is not in the pool
   */
  setWarehouseEnabled(name: string, enabled: boolean): void {
    const entry = this.warehousePool.get(name);
    if (!entry) {
      throw new WarehouseNotFoundError(name);
    }
    entry.enabled = enabled;
  }

  /**
   * Sets the default warehouse.
   *
   * @param name - Warehouse name
   * @throws {WarehouseNotFoundError} If warehouse is not in the pool
   */
  setDefaultWarehouse(name: string): void {
    if (!this.warehousePool.has(name)) {
      throw new WarehouseNotFoundError(name);
    }
    this.defaultWarehouse = name;
  }

  /**
   * Selects the best warehouse for a given workload.
   *
   * Selection algorithm:
   * 1. Filter warehouses by workload type preference
   * 2. Filter by minimum size requirement
   * 3. Filter by enabled status
   * 4. Check warehouse availability (state = 'started')
   * 5. Filter by queue depth threshold
   * 6. Score remaining warehouses based on:
   *    - Priority (higher is better)
   *    - Queue depth (lower is better)
   *    - Size match (prefer exact match, then larger)
   * 7. Return highest scoring warehouse
   * 8. Fall back to default warehouse if no suitable warehouse found
   *
   * @param workloadType - Type of workload
   * @param minSize - Minimum warehouse size (optional)
   * @returns Selected warehouse name
   */
  async selectWarehouse(
    workloadType: WorkloadType,
    minSize?: WarehouseSize
  ): Promise<string> {
    this.metrics.totalRoutingDecisions++;

    // Update workload type metrics
    const workloadCount = this.metrics.decisionsByWorkloadType.get(workloadType) ?? 0;
    this.metrics.decisionsByWorkloadType.set(workloadType, workloadCount + 1);

    // If dynamic routing is disabled, always use default
    if (!this.enableDynamicRouting) {
      this.recordWarehouseSelection(this.defaultWarehouse);
      return this.defaultWarehouse;
    }

    try {
      const result = await this.selectWarehouseWithDetails(workloadType, minSize);
      this.recordWarehouseSelection(result.warehouseName);
      return result.warehouseName;
    } catch (error) {
      // Fall back to default warehouse on error
      this.metrics.failedRoutingAttempts++;
      this.metrics.fallbackToDefaultCount++;
      this.recordWarehouseSelection(this.defaultWarehouse);
      return this.defaultWarehouse;
    }
  }

  /**
   * Selects the best warehouse with detailed information about the selection.
   *
   * @param workloadType - Type of workload
   * @param minSize - Minimum warehouse size (optional)
   * @returns Warehouse selection result with details
   */
  async selectWarehouseWithDetails(
    workloadType: WorkloadType,
    minSize?: WarehouseSize
  ): Promise<WarehouseSelectionResult> {
    // Get all warehouse statuses
    const statuses = await this.statusChecker.getAllStatuses();
    const statusMap = new Map(statuses.map((s) => [s.name, s]));

    // Score all eligible warehouses
    const candidates: Array<{
      name: string;
      score: number;
      reason: string;
    }> = [];

    for (const [name, entry] of this.warehousePool.entries()) {
      // Skip disabled warehouses
      if (!entry.enabled) {
        continue;
      }

      const config = entry.config;
      const status = statusMap.get(name);

      // Skip if status not available (warehouse may not exist)
      if (!status) {
        continue;
      }

      // Skip if warehouse is not started
      if (status.state !== 'started') {
        continue;
      }

      // Check minimum size requirement
      if (minSize && config.size && !meetsMinimumSize(config.size, minSize)) {
        continue;
      }

      // Check queue depth threshold
      const queueDepth = status.queuedQueries;
      const maxQueueDepth = config.maxQueueDepth ?? this.queueThreshold;
      if (queueDepth >= maxQueueDepth) {
        continue;
      }

      // Calculate score
      let score = 0;
      let reason = 'Selected';

      // Priority scoring (0-100 points)
      const priority = config.priority ?? 50;
      score += priority;

      // Workload type preference (0-50 points)
      if (config.preferredWorkloads?.includes(workloadType)) {
        score += 50;
        reason = `Preferred for ${workloadType} workloads`;
      }

      // Queue depth scoring (0-30 points, inverted - lower is better)
      const queueScore = Math.max(0, 30 - queueDepth * 3);
      score += queueScore;

      // Size matching (0-20 points)
      if (minSize && config.size) {
        const comparison = compareWarehouseSizes(config.size, minSize);
        if (comparison === 0) {
          // Exact match
          score += 20;
        } else if (comparison > 0) {
          // Larger than required (acceptable but not ideal)
          score += 10;
        }
      }

      candidates.push({ name, score, reason });
    }

    // If no candidates, fall back to default
    if (candidates.length === 0) {
      this.metrics.fallbackToDefaultCount++;
      const defaultStatus = statusMap.get(this.defaultWarehouse);

      if (!defaultStatus) {
        throw new WarehouseNotFoundError(this.defaultWarehouse);
      }

      return {
        warehouseName: this.defaultWarehouse,
        status: defaultStatus,
        reason: 'Default warehouse (no suitable alternatives)',
        score: 0,
      };
    }

    // Sort by score (descending) and return the best
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;
    const bestStatus = statusMap.get(best.name)!;

    // Update average queue depth metric
    this.updateAverageQueueDepth(bestStatus.queuedQueries);

    return {
      warehouseName: best.name,
      status: bestStatus,
      reason: best.reason,
      score: best.score,
    };
  }

  /**
   * Gets the current default warehouse.
   *
   * @returns Default warehouse name
   */
  getDefaultWarehouse(): string {
    return this.defaultWarehouse;
  }

  /**
   * Gets all warehouses in the routing pool.
   *
   * @returns Array of warehouse names
   */
  getWarehousePool(): string[] {
    return Array.from(this.warehousePool.keys());
  }

  /**
   * Gets enabled warehouses in the routing pool.
   *
   * @returns Array of enabled warehouse names
   */
  getEnabledWarehouses(): string[] {
    return Array.from(this.warehousePool.entries())
      .filter(([_, entry]) => entry.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Gets warehouse configuration by name.
   *
   * @param name - Warehouse name
   * @returns Warehouse configuration
   * @throws {WarehouseNotFoundError} If warehouse is not in the pool
   */
  getWarehouseConfig(name: string): WarehouseConfig {
    const entry = this.warehousePool.get(name);
    if (!entry) {
      throw new WarehouseNotFoundError(name);
    }
    return entry.config;
  }

  /**
   * Checks if a warehouse is in the routing pool.
   *
   * @param name - Warehouse name
   * @returns true if warehouse is in the pool
   */
  hasWarehouse(name: string): boolean {
    return this.warehousePool.has(name);
  }

  /**
   * Checks if a warehouse is enabled.
   *
   * @param name - Warehouse name
   * @returns true if warehouse is enabled
   * @throws {WarehouseNotFoundError} If warehouse is not in the pool
   */
  isWarehouseEnabled(name: string): boolean {
    const entry = this.warehousePool.get(name);
    if (!entry) {
      throw new WarehouseNotFoundError(name);
    }
    return entry.enabled;
  }

  /**
   * Gets routing metrics.
   *
   * @returns Current routing metrics
   */
  getMetrics(): WarehouseRoutingMetrics {
    return {
      ...this.metrics,
      decisionsByWarehouse: new Map(this.metrics.decisionsByWarehouse),
      decisionsByWorkloadType: new Map(this.metrics.decisionsByWorkloadType),
    };
  }

  /**
   * Resets routing metrics.
   */
  resetMetrics(): void {
    this.metrics.totalRoutingDecisions = 0;
    this.metrics.decisionsByWarehouse.clear();
    this.metrics.decisionsByWorkloadType.clear();
    this.metrics.fallbackToDefaultCount = 0;
    this.metrics.failedRoutingAttempts = 0;
    this.metrics.averageQueueDepthAtSelection = 0;
  }

  /**
   * Records a warehouse selection in metrics.
   *
   * @param warehouseName - Selected warehouse name
   */
  private recordWarehouseSelection(warehouseName: string): void {
    const count = this.metrics.decisionsByWarehouse.get(warehouseName) ?? 0;
    this.metrics.decisionsByWarehouse.set(warehouseName, count + 1);
  }

  /**
   * Updates the average queue depth metric.
   *
   * @param currentQueueDepth - Current queue depth of selected warehouse
   */
  private updateAverageQueueDepth(currentQueueDepth: number): void {
    const total = this.metrics.totalRoutingDecisions;
    const currentAvg = this.metrics.averageQueueDepthAtSelection;

    // Calculate running average
    this.metrics.averageQueueDepthAtSelection =
      (currentAvg * (total - 1) + currentQueueDepth) / total;
  }
}
