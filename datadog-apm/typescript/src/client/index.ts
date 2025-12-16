/**
 * Client module for Datadog APM integration.
 *
 * Exports client interface, implementation, and factory.
 */

// Client interface
export type { DatadogAPMClient } from './interface.js';

// Client implementation
export { DatadogAPMClientImpl } from './client.js';

// Client factory
export { DatadogAPMClientFactory } from './factory.js';
