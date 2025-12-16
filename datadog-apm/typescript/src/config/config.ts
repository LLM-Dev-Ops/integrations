/**
 * Configuration module for Datadog APM integration
 *
 * Re-exports configuration-related types and functions
 */

export { DatadogAPMConfig } from '../types';
export { DEFAULT_CONFIG, applyDefaults } from './defaults';
export { validateConfig } from './validation';
export { configFromEnvironment } from './env';
