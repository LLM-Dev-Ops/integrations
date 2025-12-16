/**
 * Configuration-related errors for Datadog APM.
 *
 * Errors related to invalid configuration, missing required fields,
 * or invalid configuration values.
 */

import { DatadogAPMError } from './base';

/**
 * Error thrown when configuration is invalid or missing required fields
 */
export class ConfigurationError extends DatadogAPMError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'configuration',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ConfigurationError';
  }

  /**
   * Create a ConfigurationError for a missing required field
   */
  static missingRequiredField(field: string): ConfigurationError {
    return new ConfigurationError(
      `Missing required configuration field: ${field}`,
      { field }
    );
  }

  /**
   * Create a ConfigurationError for an invalid field value
   */
  static invalidFieldValue(
    field: string,
    value: unknown,
    reason?: string
  ): ConfigurationError {
    const message = reason
      ? `Invalid value for configuration field '${field}': ${reason}`
      : `Invalid value for configuration field '${field}'`;
    return new ConfigurationError(message, { field, value });
  }

  /**
   * Create a ConfigurationError for an invalid sample rate
   */
  static invalidSampleRate(value: number): ConfigurationError {
    return new ConfigurationError(
      `Sample rate must be between 0.0 and 1.0, got ${value}`,
      { value }
    );
  }

  /**
   * Create a ConfigurationError for an invalid buffer size
   */
  static invalidBufferSize(field: string, value: number): ConfigurationError {
    return new ConfigurationError(
      `Buffer size for '${field}' must be a positive integer, got ${value}`,
      { field, value }
    );
  }

  /**
   * Create a ConfigurationError for an invalid interval
   */
  static invalidInterval(field: string, value: number): ConfigurationError {
    return new ConfigurationError(
      `Interval for '${field}' must be a positive number, got ${value}`,
      { field, value }
    );
  }

  /**
   * Create a ConfigurationError for an invalid port
   */
  static invalidPort(field: string, value: number): ConfigurationError {
    return new ConfigurationError(
      `Port for '${field}' must be between 1 and 65535, got ${value}`,
      { field, value }
    );
  }
}
