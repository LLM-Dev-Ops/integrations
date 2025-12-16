/**
 * Stats Operation Module
 *
 * Provides functionality to retrieve index statistics from Pinecone.
 * Returns information about namespaces, vector counts, and index fullness.
 *
 * @module operations/stats
 */

import { HttpTransport } from '../transport/http.js';
import type { IndexStats } from '../types/index.js';
import type { MetadataFilter } from '../types/filter.js';

/**
 * Configuration for stats operation
 */
export interface StatsOperationConfig {
  /** HTTP transport instance */
  transport: HttpTransport;
}

/**
 * Describes index statistics
 *
 * Retrieves statistics about the index including:
 * - Total vector count across all namespaces
 * - Per-namespace vector counts
 * - Index dimension
 * - Index fullness (0-1)
 *
 * Optionally filters statistics by metadata to get counts of vectors matching the filter.
 *
 * @param config - Configuration including transport
 * @param filter - Optional metadata filter to get filtered statistics
 * @returns Promise resolving to index statistics
 * @throws {NetworkError} If network request fails
 * @throws {ServerError} If server returns an error
 *
 * @example
 * ```typescript
 * // Get overall index stats
 * const stats = await describeIndexStats(config);
 * console.log(`Total vectors: ${stats.totalVectorCount}`);
 * console.log(`Namespaces: ${Object.keys(stats.namespaces || {}).length}`);
 *
 * // Get stats for vectors matching a filter
 * const filteredStats = await describeIndexStats(config, {
 *   category: { $eq: 'active' }
 * });
 * console.log(`Active vectors: ${filteredStats.totalVectorCount}`);
 * ```
 */
export async function describeIndexStats(
  config: StatsOperationConfig,
  filter?: MetadataFilter
): Promise<IndexStats> {
  // 1. Build request body (optionally with filter)
  const requestBody: any = {};

  if (filter !== undefined) {
    requestBody.filter = filter;
  }

  // 2. Execute POST /describe_index_stats
  const response = await config.transport.request<IndexStats>({
    method: 'POST',
    path: '/describe_index_stats',
    body: Object.keys(requestBody).length > 0 ? requestBody : undefined,
  });

  // 3. Parse and return IndexStats
  return response.data;
}
