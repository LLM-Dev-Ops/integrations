/**
 * Configuration validation for Datadog APM integration
 */

import { DatadogAPMConfig } from '../types';
import { ConfigurationError } from '../errors';
import { applyDefaults } from './defaults';

/**
 * Service name validation regex - lowercase alphanumeric, underscores, and hyphens only
 */
const SERVICE_NAME_REGEX = /^[a-z0-9_-]+$/;

/**
 * Validate port number is in valid range
 *
 * @param port - Port number to validate
 * @param name - Name of the port field for error messages
 * @throws ConfigurationError if port is invalid
 */
function validatePort(port: number | undefined, name: string): void {
  if (port !== undefined) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ConfigurationError(
        `Invalid ${name}: must be an integer between 1 and 65535, got ${port}`
      );
    }
  }
}

/**
 * Validate sample rate is in valid range
 *
 * @param sampleRate - Sample rate to validate
 * @throws ConfigurationError if sample rate is invalid
 */
function validateSampleRate(sampleRate: number | undefined): void {
  if (sampleRate !== undefined) {
    if (typeof sampleRate !== 'number' || sampleRate < 0 || sampleRate > 1) {
      throw new ConfigurationError(
        `Invalid sampleRate: must be a number between 0 and 1, got ${sampleRate}`
      );
    }
  }
}

/**
 * Validate service name format
 *
 * @param service - Service name to validate
 * @throws ConfigurationError if service name is invalid
 */
function validateServiceName(service: string): void {
  if (!service) {
    throw new ConfigurationError('Service name is required');
  }

  if (!SERVICE_NAME_REGEX.test(service)) {
    throw new ConfigurationError(
      `Invalid service name: must contain only lowercase letters, numbers, underscores, and hyphens, got "${service}"`
    );
  }
}

/**
 * Validate required fields are present
 *
 * @param config - Configuration to validate
 * @throws ConfigurationError if required fields are missing
 */
function validateRequiredFields(config: Partial<DatadogAPMConfig>): void {
  const requiredFields: (keyof DatadogAPMConfig)[] = ['service', 'env', 'version'];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new ConfigurationError(`Required field missing: ${field}`);
    }
  }
}

/**
 * Validate Datadog APM configuration
 *
 * Performs validation checks on the configuration:
 * - Checks required fields: service, env, version
 * - Validates service name format with regex /^[a-z0-9_-]+$/
 * - Validates sampleRate is between 0 and 1
 * - Validates port numbers are valid (1-65535)
 * - Returns config with defaults applied
 * - Throws ConfigurationError on validation failure
 *
 * @param config - Partial configuration to validate
 * @returns Validated configuration with defaults applied
 * @throws ConfigurationError if validation fails
 */
export function validateConfig(config: Partial<DatadogAPMConfig>): DatadogAPMConfig {
  // Check required fields
  validateRequiredFields(config);

  // Validate service name format
  validateServiceName(config.service!);

  // Validate sample rate
  validateSampleRate(config.sampleRate);

  // Validate port numbers
  validatePort(config.agentPort, 'agentPort');
  validatePort(config.statsdPort, 'statsdPort');

  // Validate buffer sizes if provided
  if (config.metricsBufferSize !== undefined) {
    if (!Number.isInteger(config.metricsBufferSize) || config.metricsBufferSize <= 0) {
      throw new ConfigurationError(
        `Invalid metricsBufferSize: must be a positive integer, got ${config.metricsBufferSize}`
      );
    }
  }

  if (config.traceBufferSize !== undefined) {
    if (!Number.isInteger(config.traceBufferSize) || config.traceBufferSize <= 0) {
      throw new ConfigurationError(
        `Invalid traceBufferSize: must be a positive integer, got ${config.traceBufferSize}`
      );
    }
  }

  // Validate flush intervals if provided
  if (config.metricsFlushInterval !== undefined) {
    if (!Number.isInteger(config.metricsFlushInterval) || config.metricsFlushInterval <= 0) {
      throw new ConfigurationError(
        `Invalid metricsFlushInterval: must be a positive integer, got ${config.metricsFlushInterval}`
      );
    }
  }

  if (config.flushTimeout !== undefined) {
    if (!Number.isInteger(config.flushTimeout) || config.flushTimeout <= 0) {
      throw new ConfigurationError(
        `Invalid flushTimeout: must be a positive integer, got ${config.flushTimeout}`
      );
    }
  }

  // Apply defaults and return validated config
  return applyDefaults(config);
}
