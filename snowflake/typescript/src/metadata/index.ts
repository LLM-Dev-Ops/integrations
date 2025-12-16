/**
 * Metadata Service Module
 *
 * Services for exploring and analyzing Snowflake metadata including schema discovery,
 * query history, and table statistics.
 *
 * @module @llmdevops/snowflake-integration/metadata
 *
 * @example
 * ```typescript
 * import {
 *   SchemaDiscoveryService,
 *   QueryHistoryService,
 *   TableStatsService
 * } from '@llmdevops/snowflake-integration/metadata';
 *
 * // Create services with a query executor
 * const discovery = new SchemaDiscoveryService(client);
 * const history = new QueryHistoryService(client);
 * const stats = new TableStatsService(client);
 *
 * // Discover schema
 * const databases = await discovery.listDatabases();
 * const schemas = await discovery.listSchemas('MYDB');
 * const tables = await discovery.listTables('MYDB', 'PUBLIC');
 *
 * // Get query history
 * const queries = await history.getHistory(
 *   new Date('2024-01-01'),
 *   new Date('2024-01-31')
 * );
 *
 * // Get table statistics
 * const tableStats = await stats.getTableStats('MYDB', 'PUBLIC', 'USERS');
 * ```
 */

// Export schema discovery service
export {
  SchemaDiscoveryService,
  type QueryExecutor as DiscoveryQueryExecutor,
} from './discovery.js';

// Export query history service
export {
  QueryHistoryService,
  type QueryExecutor as HistoryQueryExecutor,
  type QueryHistoryOptions,
} from './history.js';

// Export table statistics service
export {
  TableStatsService,
  type QueryExecutor as StatsQueryExecutor,
  type TableStatistics,
  type ClusteringInfo,
  type StorageInfo,
} from './stats.js';
