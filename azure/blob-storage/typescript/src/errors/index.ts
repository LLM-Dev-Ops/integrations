/**
 * Azure Blob Storage Errors
 *
 * Re-exports all error types.
 */

export {
  BlobStorageError,
  BlobNotFoundError,
  ContainerNotFoundError,
  BlobAlreadyExistsError,
  AuthenticationError,
  AuthorizationError,
  QuotaExceededError,
  ServerBusyError,
  ServiceUnavailableError,
  TimeoutError,
  NetworkError,
  UploadFailedError,
  DownloadFailedError,
  ChecksumMismatchError,
  CopyFailedError,
  CopyAbortedError,
  ConfigurationError,
  SimulationNoMatchError,
  SimulationLoadError,
  ValidationError,
  createErrorFromResponse,
  isRetryableStatus,
} from './error.js';

export type { BlobStorageErrorOptions } from './error.js';
