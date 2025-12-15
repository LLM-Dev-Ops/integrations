// Re-export everything that should be public API

// Client
export {
  BigQueryClient,
  BigQueryClientImpl,
  BigQueryClientBuilder,
  clientBuilder,
  createClient,
  createClientFromEnv
} from "./client/index.js";

// Config
export {
  BigQueryConfig,
  BigQueryConfigBuilder,
  configBuilder,
  DEFAULT_CONFIG,
  resolveEndpoint,
  validateProjectId,
  validateDatasetId,
  validateTableId,
  GcpCredentials,
  RetryConfig,
  CircuitBreakerConfig,
  ServiceAccountKey
} from "./config/index.js";

// Types
export * from "./types/index.js";

// Errors
export * from "./error/index.js";

// Services (for advanced usage)
export { QueryService } from "./services/query/index.js";
// JobService not yet exported - still being implemented
export { StreamingService } from "./services/streaming/index.js";
// BufferedInserter not yet exported - still being implemented
export { LoadService } from "./services/load/index.js";
export { CostService } from "./services/cost/index.js";
