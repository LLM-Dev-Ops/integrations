/**
 * Redshift Workload Management Module
 *
 * This module provides tools for managing and monitoring Redshift workloads,
 * including WLM queue configuration, query routing, and cluster status monitoring.
 *
 * @module @llmdevops/redshift-integration/workload
 */

// Export WLM types and classes
export type {
  ConcurrencyScalingMode,
  WlmQueueInfo,
  WlmQueueState,
} from './wlm.js';
export { WlmManager } from './wlm.js';

// Export status monitoring types and classes
export type {
  ClusterStatus,
  RunningQuery,
  QueryInfo,
  NodeDiskUsage,
} from './status.js';
export { StatusMonitor } from './status.js';
