/**
 * Operations Module
 *
 * Re-exports all vector operation functions and their configuration types.
 * Provides a unified interface for all Pinecone vector operations.
 *
 * @module operations
 */

// Upsert operation
export {
  upsert,
  chunkVectors,
  type UpsertOperationConfig,
} from './upsert.js';

// Query operation
export {
  query,
  type QueryOperationConfig,
} from './query.js';

// Fetch operation
export {
  fetch,
  type FetchOperationConfig,
} from './fetch.js';

// Update operation
export {
  update,
  type UpdateOperationConfig,
} from './update.js';

// Delete operation
export {
  deleteVectors,
  type DeleteOperationConfig,
} from './delete.js';

// Stats operation
export {
  describeIndexStats,
  type StatsOperationConfig,
} from './stats.js';
