// Base error
export { MilvusError, ErrorCategory } from './base.js';

// Error categories
export {
  MilvusConfigurationError,
  MilvusAuthenticationError,
  MilvusAuthorizationError,
  MilvusValidationError,
  MilvusConnectionError,
  MilvusTimeoutError,
  MilvusRateLimitError,
  MilvusNotFoundError,
  MilvusCollectionNotFoundError,
  MilvusPartitionNotFoundError,
  MilvusCollectionNotLoadedError,
  MilvusLoadFailedError,
  MilvusLoadTimeoutError,
  MilvusServerError,
  MilvusPoolError,
  MilvusSimulationError,
} from './categories.js';

// Error mapping utilities
export {
  GrpcStatusCode,
  MilvusErrorCode,
  isRetryableGrpcCode,
  createErrorFromGrpcStatus,
  createErrorFromMilvusCode,
  isRetryableError,
  shouldAutoLoad,
  getRetryDelay,
} from './mapping.js';
