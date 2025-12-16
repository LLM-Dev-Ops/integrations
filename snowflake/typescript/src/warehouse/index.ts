/**
 * Warehouse Router Module
 *
 * Intelligent warehouse routing and status monitoring for Snowflake.
 * @module @llmdevops/snowflake-integration/warehouse
 */

// Export status checker
export {
  WarehouseStatusChecker,
  type WarehouseStatusProvider,
  type WarehouseStatusCheckerOptions,
} from './status.js';

// Export router
export { WarehouseRouter } from './router.js';

// Export types
export {
  type WarehouseSelectionCriteria,
  type WarehouseSelectionResult,
  type WarehouseRoutingMetrics,
  type WarehouseAvailabilityResult,
  WAREHOUSE_SIZE_ORDER,
  meetsMinimumSize,
  compareWarehouseSizes,
} from './types.js';
