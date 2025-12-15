/**
 * Azure Cognitive Search - Vector Store
 *
 * Re-exports all vector store components.
 */

export type {
  VectorStore,
  VectorStoreConfig,
  VectorDocument,
  VectorQuery,
  VectorSearchResult,
  MetadataFilter,
  FilterCondition,
  FilterOperator,
  FilterValue,
} from './types.js';

export { AcsVectorStore, createVectorStore } from './store.js';

export { buildMetadataFilter, FilterBuilder, filter } from './filter.js';
