/**
 * Azure Key Vault Rotation Module
 *
 * Exports rotation handlers and expiry monitoring functionality.
 * Following the SPARC specification for Azure Key Vault integration.
 */

// Export handler interfaces and implementations
export { RotationHandler, NoOpRotationHandler } from './handler.js';

// Export monitor classes and interfaces
export {
  ExpiryMonitor,
  ExpiryMonitorConfig,
  SecretsService,
  ObservabilityDeps,
  Logger,
  MetricsCollector,
} from './monitor.js';
