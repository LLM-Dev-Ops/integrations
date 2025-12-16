/**
 * Client module for Datadog APM integration.
 *
 * Exports client interface, implementation, and factory.
 */

// Client interface
export type { DatadogAPMClient } from './interface';

// Client implementation
export { DatadogAPMClientImpl } from './client';

// Client factory
export { DatadogAPMClientFactory } from './factory';
