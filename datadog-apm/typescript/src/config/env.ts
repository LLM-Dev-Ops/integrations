/**
 * Environment variable configuration for Datadog APM integration
 */

import { DatadogAPMConfig } from '../types';

/**
 * Parse tags from environment variable string
 *
 * Expected format: "key1:value1,key2:value2"
 *
 * @param tagsString - Comma-separated key:value pairs
 * @returns Parsed tags object
 */
function parseTags(tagsString: string): Record<string, string> {
  const tags: Record<string, string> = {};

  const pairs = tagsString.split(',');
  for (const pair of pairs) {
    const trimmedPair = pair.trim();
    if (!trimmedPair) {
      continue;
    }

    const colonIndex = trimmedPair.indexOf(':');
    if (colonIndex === -1) {
      // Skip invalid pairs without colon
      continue;
    }

    const key = trimmedPair.substring(0, colonIndex).trim();
    const value = trimmedPair.substring(colonIndex + 1).trim();

    if (key && value) {
      tags[key] = value;
    }
  }

  return tags;
}

/**
 * Parse numeric environment variable
 *
 * @param value - String value to parse
 * @returns Parsed number or undefined if invalid
 */
function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse boolean environment variable
 *
 * @param value - String value to parse
 * @returns Parsed boolean or undefined if not set
 */
function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }

  return undefined;
}

/**
 * Create configuration from environment variables
 *
 * Reads configuration from the following environment variables:
 * - DD_SERVICE, OTEL_SERVICE_NAME - Service name
 * - DD_ENV, NODE_ENV - Environment name
 * - DD_VERSION - Service version
 * - DD_AGENT_HOST - Datadog agent hostname
 * - DD_TRACE_AGENT_PORT - Datadog trace agent port
 * - DD_DOGSTATSD_HOST - DogStatsD hostname
 * - DD_DOGSTATSD_PORT - DogStatsD port
 * - DD_TRACE_SAMPLE_RATE - Trace sample rate (0-1)
 * - DD_PRIORITY_SAMPLING - Enable priority sampling
 * - DD_API_KEY - Datadog API key
 * - DD_TAGS - Tags as comma-separated key:value pairs
 *
 * @returns Partial configuration from environment variables
 */
export function configFromEnvironment(): Partial<DatadogAPMConfig> {
  const config: Partial<DatadogAPMConfig> = {};

  // Service name - try DD_SERVICE first, then OTEL_SERVICE_NAME
  const service = process.env.DD_SERVICE || process.env.OTEL_SERVICE_NAME;
  if (service) {
    config.service = service;
  }

  // Environment - try DD_ENV first, then NODE_ENV
  const env = process.env.DD_ENV || process.env.NODE_ENV;
  if (env) {
    config.env = env;
  }

  // Version
  if (process.env.DD_VERSION) {
    config.version = process.env.DD_VERSION;
  }

  // Agent configuration
  if (process.env.DD_AGENT_HOST) {
    config.agentHost = process.env.DD_AGENT_HOST;
  }

  const agentPort = parseNumber(process.env.DD_TRACE_AGENT_PORT);
  if (agentPort !== undefined) {
    config.agentPort = agentPort;
  }

  // DogStatsD configuration
  if (process.env.DD_DOGSTATSD_HOST) {
    config.statsdHost = process.env.DD_DOGSTATSD_HOST;
  }

  const statsdPort = parseNumber(process.env.DD_DOGSTATSD_PORT);
  if (statsdPort !== undefined) {
    config.statsdPort = statsdPort;
  }

  // Sampling configuration
  const sampleRate = parseNumber(process.env.DD_TRACE_SAMPLE_RATE);
  if (sampleRate !== undefined) {
    config.sampleRate = sampleRate;
  }

  const prioritySampling = parseBoolean(process.env.DD_PRIORITY_SAMPLING);
  if (prioritySampling !== undefined) {
    config.prioritySampling = prioritySampling;
  }

  // API key
  if (process.env.DD_API_KEY) {
    config.apiKey = process.env.DD_API_KEY;
  }

  // Tags
  if (process.env.DD_TAGS) {
    config.tags = parseTags(process.env.DD_TAGS);
  }

  return config;
}
