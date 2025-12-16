/**
 * Redshift Metadata Module
 *
 * This module provides tools for discovering and managing Redshift metadata,
 * including schema discovery, table exploration, and Spectrum external tables.
 *
 * @module @llmdevops/redshift-integration/metadata
 */

// Export discovery types and classes
export type {
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  TableStats,
} from './discovery.js';
export { SchemaDiscovery } from './discovery.js';

// Export external/Spectrum types and classes
export type {
  ExternalSchemaInfo,
  ExternalTableInfo,
  ExternalColumnInfo,
  PartitionInfo,
} from './external.js';
export { SpectrumManager } from './external.js';
