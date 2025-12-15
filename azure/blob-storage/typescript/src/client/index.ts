/**
 * Azure Blob Storage Client Module
 *
 * Re-exports the main client and configuration types.
 */

export { BlobStorageClient } from './client.js';
export {
  type BlobStorageConfig,
  type NormalizedBlobStorageConfig,
  type RetryConfig,
  type SimulationMode,
  BlobStorageConfigBuilder,
  builder,
  normalizeConfig,
  DEFAULT_CONFIG,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MAX_BLOB_NAME_LENGTH,
  SIMPLE_UPLOAD_LIMIT,
} from './config.js';
