/**
 * Warehouse Router Types
 *
 * Additional type definitions for warehouse routing functionality.
 * @module @llmdevops/snowflake-integration/warehouse/types
 */

import type { WarehouseStatus, WorkloadType, WarehouseSize } from '../types/index.js';

// ============================================================================
// Warehouse Selection Types
// ============================================================================

/**
 * Criteria for warehouse selection.
 */
export interface WarehouseSelectionCriteria {
  /** Required workload type */
  workloadType: WorkloadType;
  /** Minimum warehouse size */
  minSize?: WarehouseSize;
  /** Maximum acceptable queue depth */
  maxQueueDepth?: number;
  /** Require warehouse to be started */
  requireStarted?: boolean;
}

/**
 * Warehouse selection result.
 */
export interface WarehouseSelectionResult {
  /** Selected warehouse name */
  warehouseName: string;
  /** Current warehouse status */
  status: WarehouseStatus;
  /** Selection reason */
  reason: string;
  /** Selection score (higher is better) */
  score: number;
}

/**
 * Warehouse routing metrics.
 */
export interface WarehouseRoutingMetrics {
  /** Total routing decisions made */
  totalRoutingDecisions: number;
  /** Routing decisions by warehouse */
  decisionsByWarehouse: Map<string, number>;
  /** Routing decisions by workload type */
  decisionsByWorkloadType: Map<WorkloadType, number>;
  /** Fallback to default count */
  fallbackToDefaultCount: number;
  /** Failed routing attempts */
  failedRoutingAttempts: number;
  /** Average queue depth at selection time */
  averageQueueDepthAtSelection: number;
}

/**
 * Warehouse availability check result.
 */
export interface WarehouseAvailabilityResult {
  /** Warehouse name */
  warehouseName: string;
  /** Is the warehouse available */
  available: boolean;
  /** Reason for unavailability (if not available) */
  reason?: string;
  /** Current queue depth */
  queueDepth: number;
}

// ============================================================================
// Warehouse Size Utilities
// ============================================================================

/**
 * Warehouse size ordering (for minimum size comparisons).
 */
export const WAREHOUSE_SIZE_ORDER: Record<WarehouseSize, number> = {
  'X-Small': 1,
  'Small': 2,
  'Medium': 3,
  'Large': 4,
  'X-Large': 5,
  '2X-Large': 6,
  '3X-Large': 7,
  '4X-Large': 8,
  '5X-Large': 9,
  '6X-Large': 10,
};

/**
 * Checks if a warehouse size meets the minimum size requirement.
 */
export function meetsMinimumSize(
  actualSize: WarehouseSize,
  minSize: WarehouseSize
): boolean {
  return WAREHOUSE_SIZE_ORDER[actualSize] >= WAREHOUSE_SIZE_ORDER[minSize];
}

/**
 * Compares two warehouse sizes.
 * @returns -1 if size1 < size2, 0 if equal, 1 if size1 > size2
 */
export function compareWarehouseSizes(
  size1: WarehouseSize,
  size2: WarehouseSize
): number {
  const order1 = WAREHOUSE_SIZE_ORDER[size1];
  const order2 = WAREHOUSE_SIZE_ORDER[size2];
  if (order1 < order2) return -1;
  if (order1 > order2) return 1;
  return 0;
}
