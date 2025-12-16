/**
 * Default configuration values for Datadog APM integration
 */

import { DatadogAPMConfig } from '../types';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<DatadogAPMConfig> = {
  agentHost: 'localhost',
  agentPort: 8126,
  statsdPort: 8125,
  sampleRate: 1.0,
  prioritySampling: true,
  metricsPrefix: 'llmdevops.',
  metricsBufferSize: 8192,
  metricsFlushInterval: 2000,
  traceBufferSize: 1000,
  flushTimeout: 10000,
  enabled: true,
  logLevel: 'info',
};

/**
 * Apply default values to a partial configuration
 *
 * @param config - Partial configuration to apply defaults to
 * @returns Configuration with defaults applied
 */
export function applyDefaults(config: Partial<DatadogAPMConfig>): DatadogAPMConfig {
  const result = {
    ...DEFAULT_CONFIG,
    ...config,
  } as DatadogAPMConfig;

  // If statsdHost is not provided, use agentHost
  if (!result.statsdHost && result.agentHost) {
    result.statsdHost = result.agentHost;
  }

  return result;
}
