/**
 * OpenTelemetry Configuration Module
 *
 * Provides configuration management for OpenTelemetry integration including
 * default values, configuration builders, environment variable parsing, and validation.
 */

import type {
  OpenTelemetryConfig,
  SamplerConfig,
  RedactionConfig,
  ExporterConfig,
  TracerConfig,
  MeterConfig,
  BatchConfig,
  ResourceAttributes,
  OtlpProtocol,
} from '../types/index.js';

/**
 * Default OTLP endpoint for local development
 */
export const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4317';

/**
 * Default protocol for OTLP export (gRPC)
 */
export const DEFAULT_PROTOCOL: OtlpProtocol = 'grpc';

/**
 * Default maximum batch size for span exports
 */
export const DEFAULT_BATCH_SIZE = 512;

/**
 * Default maximum queue size for pending spans
 */
export const DEFAULT_QUEUE_SIZE = 2048;

/**
 * Default batch timeout in milliseconds (5 seconds)
 */
export const DEFAULT_BATCH_TIMEOUT = 5000;

/**
 * Default export timeout in milliseconds (30 seconds)
 */
export const DEFAULT_EXPORT_TIMEOUT = 30000;

/**
 * Default sample rate (10% of traces)
 */
export const DEFAULT_SAMPLE_RATE = 0.1;

/**
 * Configuration error class
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Fluent API builder for creating OpenTelemetryConfig objects
 */
export class ConfigBuilder {
  private serviceName?: string;
  private serviceVersion?: string;
  private environment?: string;
  private resourceAttributes: ResourceAttributes = {};
  private otlpEndpoint: string = DEFAULT_OTLP_ENDPOINT;
  private protocol: OtlpProtocol = DEFAULT_PROTOCOL;
  private samplerConfig?: SamplerConfig;
  private batchConfig?: BatchConfig;
  private redactionConfig?: RedactionConfig;
  private tracerConfig?: TracerConfig;
  private meterConfig?: MeterConfig;
  private headers?: Record<string, string>;

  /**
   * Set the service name
   */
  withServiceName(name: string): this {
    this.serviceName = name;
    return this;
  }

  /**
   * Set the service version
   */
  withServiceVersion(version: string): this {
    this.serviceVersion = version;
    return this;
  }

  /**
   * Set the deployment environment
   */
  withEnvironment(env: string): this {
    this.environment = env;
    return this;
  }

  /**
   * Add a resource attribute
   */
  withResourceAttribute(key: string, value: string | number | boolean): this {
    this.resourceAttributes[key] = value;
    return this;
  }

  /**
   * Set the OTLP endpoint
   */
  withOtlpEndpoint(endpoint: string): this {
    this.otlpEndpoint = endpoint;
    return this;
  }

  /**
   * Set the OTLP protocol
   */
  withProtocol(protocol: 'grpc' | 'http'): this {
    this.protocol = protocol;
    return this;
  }

  /**
   * Set the sampling configuration
   */
  withSampling(config: SamplerConfig): this {
    this.samplerConfig = config;
    return this;
  }

  /**
   * Set the batch configuration
   */
  withBatchConfig(config: BatchConfig): this {
    this.batchConfig = config;
    return this;
  }

  /**
   * Set the redaction configuration
   */
  withRedaction(config: RedactionConfig): this {
    this.redactionConfig = config;
    return this;
  }

  /**
   * Set the tracer configuration
   */
  withTracerConfig(config: TracerConfig): this {
    this.tracerConfig = config;
    return this;
  }

  /**
   * Set the meter configuration
   */
  withMeterConfig(config: MeterConfig): this {
    this.meterConfig = config;
    return this;
  }

  /**
   * Set custom headers for OTLP export
   */
  withHeaders(headers: Record<string, string>): this {
    this.headers = headers;
    return this;
  }

  /**
   * Build and return the final OpenTelemetryConfig
   */
  build(): OpenTelemetryConfig {
    if (!this.serviceName) {
      throw new ConfigurationError('Service name is required');
    }

    // Create exporter config
    const exporterConfig: ExporterConfig = {
      type: 'otlp',
      endpoint: this.otlpEndpoint,
      protocol: this.protocol === 'grpc' ? 'grpc' : 'http/protobuf',
      headers: this.headers,
      batchConfig: this.batchConfig ?? {
        maxQueueSize: DEFAULT_QUEUE_SIZE,
        maxExportBatchSize: DEFAULT_BATCH_SIZE,
        scheduledDelayMillis: DEFAULT_BATCH_TIMEOUT,
        exportTimeoutMillis: DEFAULT_EXPORT_TIMEOUT,
      },
    };

    // Create sampler config if not provided
    const samplerConfig: SamplerConfig = this.samplerConfig ?? {
      type: 'trace_id_ratio',
      ratio: DEFAULT_SAMPLE_RATE,
    };

    const config: OpenTelemetryConfig = {
      serviceName: this.serviceName,
      serviceVersion: this.serviceVersion,
      environment: this.environment,
      exporterConfig,
      samplerConfig,
      redactionConfig: this.redactionConfig,
      tracerConfig: this.tracerConfig,
      meterConfig: this.meterConfig,
    };

    validateConfig(config);
    return config;
  }
}

/**
 * Create an OpenTelemetryConfig from environment variables
 *
 * Reads standard OpenTelemetry environment variables:
 * - OTEL_SERVICE_NAME: Service name
 * - OTEL_SERVICE_VERSION: Service version
 * - OTEL_DEPLOYMENT_ENVIRONMENT: Deployment environment (e.g., production, staging)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint URL
 * - OTEL_EXPORTER_OTLP_PROTOCOL: Protocol (grpc or http/protobuf)
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers as comma-separated key=value pairs
 * - OTEL_TRACES_SAMPLER: Sampler type (always_on, always_off, traceidratio, parentbased_always_on, etc.)
 * - OTEL_TRACES_SAMPLER_ARG: Sampler argument (e.g., probability for traceidratio)
 * - OTEL_BSP_MAX_QUEUE_SIZE: Maximum queue size for batch span processor
 * - OTEL_BSP_MAX_EXPORT_BATCH_SIZE: Maximum batch size for exports
 * - OTEL_BSP_SCHEDULE_DELAY: Delay interval in milliseconds
 * - OTEL_BSP_EXPORT_TIMEOUT: Export timeout in milliseconds
 */
export function configFromEnv(): OpenTelemetryConfig {
  const serviceName = process.env['OTEL_SERVICE_NAME'];
  if (!serviceName) {
    throw new ConfigurationError('OTEL_SERVICE_NAME environment variable is required');
  }

  const builder = new ConfigBuilder().withServiceName(serviceName);

  // Optional service metadata
  const serviceVersion = process.env['OTEL_SERVICE_VERSION'];
  if (serviceVersion) {
    builder.withServiceVersion(serviceVersion);
  }

  const environment = process.env['OTEL_DEPLOYMENT_ENVIRONMENT'];
  if (environment) {
    builder.withEnvironment(environment);
  }

  // OTLP exporter configuration
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (endpoint) {
    builder.withOtlpEndpoint(endpoint);
  }

  const protocol = process.env['OTEL_EXPORTER_OTLP_PROTOCOL'];
  if (protocol) {
    if (protocol === 'grpc' || protocol === 'http/protobuf') {
      builder.withProtocol(protocol === 'grpc' ? 'grpc' : 'http');
    } else {
      throw new ConfigurationError(
        `Invalid OTEL_EXPORTER_OTLP_PROTOCOL: ${protocol}. Must be 'grpc' or 'http/protobuf'`
      );
    }
  }

  // Parse headers
  const headersEnv = process.env['OTEL_EXPORTER_OTLP_HEADERS'];
  if (headersEnv) {
    const headers: Record<string, string> = {};
    const pairs = headersEnv.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=').map((s) => s.trim());
      if (key && value) {
        headers[key] = value;
      }
    }
    builder.withHeaders(headers);
  }

  // Sampling configuration
  const sampler = process.env['OTEL_TRACES_SAMPLER'];
  const samplerArg = process.env['OTEL_TRACES_SAMPLER_ARG'];

  if (sampler) {
    const samplingConfig = parseSamplerConfig(sampler, samplerArg);
    builder.withSampling(samplingConfig);
  }

  // Batch processor configuration
  const maxQueueSize = process.env['OTEL_BSP_MAX_QUEUE_SIZE'];
  const maxExportBatchSize = process.env['OTEL_BSP_MAX_EXPORT_BATCH_SIZE'];
  const scheduleDelay = process.env['OTEL_BSP_SCHEDULE_DELAY'];
  const exportTimeout = process.env['OTEL_BSP_EXPORT_TIMEOUT'];

  if (maxQueueSize || maxExportBatchSize || scheduleDelay || exportTimeout) {
    const batchConfig: BatchConfig = {
      maxQueueSize: maxQueueSize ? parseInt(maxQueueSize, 10) : DEFAULT_QUEUE_SIZE,
      maxExportBatchSize: maxExportBatchSize
        ? parseInt(maxExportBatchSize, 10)
        : DEFAULT_BATCH_SIZE,
      scheduledDelayMillis: scheduleDelay ? parseInt(scheduleDelay, 10) : DEFAULT_BATCH_TIMEOUT,
      exportTimeoutMillis: exportTimeout
        ? parseInt(exportTimeout, 10)
        : DEFAULT_EXPORT_TIMEOUT,
    };
    builder.withBatchConfig(batchConfig);
  }

  return builder.build();
}

/**
 * Parse sampler configuration from environment variables
 */
function parseSamplerConfig(sampler: string, samplerArg?: string): SamplerConfig {
  switch (sampler.toLowerCase()) {
    case 'always_on':
    case 'parentbased_always_on':
      return {
        type: 'always_on',
      };

    case 'always_off':
    case 'parentbased_always_off':
      return {
        type: 'always_off',
      };

    case 'traceidratio':
    case 'parentbased_traceidratio': {
      const ratio = samplerArg ? parseFloat(samplerArg) : DEFAULT_SAMPLE_RATE;
      if (isNaN(ratio) || ratio < 0 || ratio > 1) {
        throw new ConfigurationError(
          `Invalid sampler ratio: ${samplerArg}. Must be between 0 and 1`
        );
      }
      return {
        type: 'trace_id_ratio',
        ratio,
      };
    }

    case 'parent_based':
      return {
        type: 'parent_based',
      };

    default:
      throw new ConfigurationError(`Unsupported sampler type: ${sampler}`);
  }
}

/**
 * Validate an OpenTelemetryConfig object
 *
 * Ensures all required fields are present and values are valid.
 * Throws ConfigurationError if validation fails.
 */
export function validateConfig(config: OpenTelemetryConfig): void {
  // Validate service name
  if (!config.serviceName || config.serviceName.trim() === '') {
    throw new ConfigurationError('Service name is required and cannot be empty');
  }

  // Validate exporter configuration
  if (config.exporterConfig) {
    validateExporterConfig(config.exporterConfig);
  }

  // Validate sampler configuration
  if (config.samplerConfig) {
    validateSamplerConfig(config.samplerConfig);
  }

  // Validate tracer configuration
  if (config.tracerConfig) {
    validateTracerConfig(config.tracerConfig);
  }

  // Validate meter configuration
  if (config.meterConfig) {
    validateMeterConfig(config.meterConfig);
  }
}

/**
 * Validate exporter configuration
 */
function validateExporterConfig(config: ExporterConfig): void {
  if (config.endpoint) {
    try {
      new URL(config.endpoint);
    } catch {
      throw new ConfigurationError(`Invalid exporter endpoint URL: ${config.endpoint}`);
    }
  }

  if (config.protocol) {
    const validProtocols = ['grpc', 'http/protobuf', 'http/json'];
    if (!validProtocols.includes(config.protocol)) {
      throw new ConfigurationError(
        `Invalid protocol: ${config.protocol}. Must be one of: ${validProtocols.join(', ')}`
      );
    }
  }

  if (config.batchConfig) {
    validateBatchConfig(config.batchConfig);
  }
}

/**
 * Validate sampler configuration
 */
function validateSamplerConfig(config: SamplerConfig): void {
  const validTypes = ['always_on', 'always_off', 'trace_id_ratio', 'parent_based'];
  if (!validTypes.includes(config.type as string)) {
    throw new ConfigurationError(
      `Invalid sampler type: ${config.type}. Must be one of: ${validTypes.join(', ')}`
    );
  }

  if (config.type === 'trace_id_ratio' && config.ratio !== undefined) {
    if (typeof config.ratio !== 'number' || config.ratio < 0 || config.ratio > 1) {
      throw new ConfigurationError(
        `Sampler ratio must be a number between 0 and 1, got: ${config.ratio}`
      );
    }
  }
}

/**
 * Validate batch configuration
 */
function validateBatchConfig(config: BatchConfig): void {
  const queueSize = config.maxQueueSize ?? 0;
  const batchSize = config.maxExportBatchSize ?? 0;
  const scheduleDelay = config.scheduledDelayMillis ?? 0;
  const exportTimeout = config.exportTimeoutMillis ?? 0;

  if (queueSize <= 0) {
    throw new ConfigurationError(`maxQueueSize must be positive, got: ${queueSize}`);
  }

  if (batchSize <= 0) {
    throw new ConfigurationError(
      `maxExportBatchSize must be positive, got: ${batchSize}`
    );
  }

  if (batchSize > queueSize) {
    throw new ConfigurationError(
      `maxExportBatchSize (${batchSize}) cannot be greater than maxQueueSize (${queueSize})`
    );
  }

  if (scheduleDelay < 0) {
    throw new ConfigurationError(
      `scheduledDelayMillis must be non-negative, got: ${scheduleDelay}`
    );
  }

  if (exportTimeout <= 0) {
    throw new ConfigurationError(
      `exportTimeoutMillis must be positive, got: ${exportTimeout}`
    );
  }
}

/**
 * Validate tracer configuration
 */
function validateTracerConfig(config: TracerConfig): void {
  if (config.tracerName !== undefined && typeof config.tracerName !== 'string') {
    throw new ConfigurationError('tracerName must be a string');
  }

  if (config.tracerVersion !== undefined && typeof config.tracerVersion !== 'string') {
    throw new ConfigurationError('tracerVersion must be a string');
  }

  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    throw new ConfigurationError('enabled must be a boolean');
  }
}

/**
 * Validate meter configuration
 */
function validateMeterConfig(config: MeterConfig): void {
  if (config.meterName !== undefined && typeof config.meterName !== 'string') {
    throw new ConfigurationError('meterName must be a string');
  }

  if (config.meterVersion !== undefined && typeof config.meterVersion !== 'string') {
    throw new ConfigurationError('meterVersion must be a string');
  }

  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    throw new ConfigurationError('enabled must be a boolean');
  }
}

/**
 * Create a default configuration with minimal required fields
 */
export function createDefaultConfig(serviceName: string): OpenTelemetryConfig {
  return new ConfigBuilder().withServiceName(serviceName).build();
}
