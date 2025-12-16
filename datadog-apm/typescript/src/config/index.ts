/**
 * Configuration module exports for Datadog APM integration
 */

export type { DatadogAPMConfig } from '../types';
export { DEFAULT_CONFIG, applyDefaults } from './defaults';
export { validateConfig } from './validation';
export { configFromEnvironment } from './env';
