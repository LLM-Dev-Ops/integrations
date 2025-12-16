/**
 * Redshift Cluster Status Monitoring
 *
 * Provides interfaces and implementations for monitoring Redshift cluster
 * health, resource utilization, and query performance.
 *
 * @module @llmdevops/redshift-integration/workload/status
 */

import type { ConnectionPool } from '../pool/pool.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// Status Types
// ============================================================================

/**
 * Overall cluster status information.
 */
export interface ClusterStatus {
  /**
   * Total number of nodes in the cluster.
   */
  nodeCount: number;

  /**
   * Leader node identifier.
   */
  leaderNode: string;

  /**
   * List of compute node identifiers.
   */
  computeNodes: string[];

  /**
   * Total disk space used across all nodes (in MB).
   */
  diskSpaceUsed: number;

  /**
   * Total disk space available across all nodes (in MB).
   */
  diskSpaceTotal: number;

  /**
   * Number of queries currently executing.
   */
  concurrentQueries: number;

  /**
   * Number of queries currently queued.
   */
  queuedQueries: number;
}

/**
 * Information about a running query.
 */
export interface RunningQuery {
  /**
   * Unique query ID.
   */
  queryId: number;

  /**
   * Process ID of the query.
   */
  pid: number;

  /**
   * Database name.
   */
  database: string;

  /**
   * User executing the query.
   */
  user: string;

  /**
   * Query text (may be truncated).
   */
  queryText: string;

  /**
   * Query start time.
   */
  startTime: Date;

  /**
   * Query duration in milliseconds.
   */
  durationMs: number;

  /**
   * Query status (e.g., 'Running', 'Returning', 'Waiting').
   */
  status: string;

  /**
   * WLM queue/service class.
   */
  queue: number;
}

/**
 * Detailed information about a query (including slow queries).
 */
export interface QueryInfo {
  /**
   * Unique query ID.
   */
  queryId: number;

  /**
   * User who executed the query.
   */
  user: string;

  /**
   * Database name.
   */
  database: string;

  /**
   * Query text.
   */
  queryText: string;

  /**
   * Query start time.
   */
  startTime: Date;

  /**
   * Query end time (if completed).
   */
  endTime?: Date;

  /**
   * Query duration in milliseconds.
   */
  durationMs: number;

  /**
   * Number of rows returned.
   */
  rowsReturned?: number;

  /**
   * Query status.
   */
  status: string;

  /**
   * Whether the query was aborted.
   */
  aborted: boolean;

  /**
   * Error message (if query failed).
   */
  errorMessage?: string;
}

/**
 * Node-level disk usage information.
 */
export interface NodeDiskUsage {
  /**
   * Node identifier.
   */
  nodeId: string;

  /**
   * Disk space used (in MB).
   */
  usedMb: number;

  /**
   * Total disk space (in MB).
   */
  totalMb: number;

  /**
   * Percentage of disk used.
   */
  usedPercent: number;
}

// ============================================================================
// Status Monitor
// ============================================================================

/**
 * StatusMonitor provides methods for monitoring Redshift cluster health and performance.
 *
 * This class allows you to:
 * - Monitor cluster resource utilization
 * - Track running and queued queries
 * - Identify slow or problematic queries
 * - Monitor disk usage across nodes
 *
 * @example
 * ```typescript
 * const monitor = new StatusMonitor(pool);
 *
 * // Get overall cluster status
 * const status = await monitor.getClusterStatus();
 * console.log(`Cluster: ${status.nodeCount} nodes, ${status.concurrentQueries} queries running`);
 * console.log(`Disk usage: ${(status.diskSpaceUsed / status.diskSpaceTotal * 100).toFixed(1)}%`);
 *
 * // Monitor running queries
 * const running = await monitor.getRunningQueries();
 * for (const query of running) {
 *   console.log(`Query ${query.queryId}: ${query.durationMs}ms, User: ${query.user}`);
 * }
 *
 * // Find slow queries
 * const slowQueries = await monitor.getSlowQueries(60000); // Slower than 60 seconds
 * for (const query of slowQueries) {
 *   console.log(`Slow query ${query.queryId}: ${query.durationMs}ms`);
 *   console.log(`  ${query.queryText.substring(0, 100)}...`);
 * }
 * ```
 */
export class StatusMonitor {
  private readonly pool: ConnectionPool;

  /**
   * Creates a new StatusMonitor instance.
   *
   * @param pool - Connection pool for executing monitoring queries
   */
  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  /**
   * Gets the current cluster status.
   *
   * Retrieves information about cluster nodes, disk usage, and
   * query workload from system tables.
   *
   * @returns Promise resolving to cluster status information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const status = await monitor.getClusterStatus();
   *
   * console.log(`Cluster Configuration:`);
   * console.log(`  Nodes: ${status.nodeCount}`);
   * console.log(`  Leader: ${status.leaderNode}`);
   * console.log(`  Compute: ${status.computeNodes.join(', ')}`);
   *
   * const diskUsagePercent = (status.diskSpaceUsed / status.diskSpaceTotal) * 100;
   * console.log(`Disk Usage: ${diskUsagePercent.toFixed(1)}%`);
   *
   * console.log(`Query Load:`);
   * console.log(`  Running: ${status.concurrentQueries}`);
   * console.log(`  Queued: ${status.queuedQueries}`);
   * ```
   */
  async getClusterStatus(): Promise<ClusterStatus> {
    const session = await this.pool.acquire();

    try {
      // Get node information
      const nodeQuery = `
        SELECT
          node,
          CASE WHEN node = -1 THEN 'Leader' ELSE 'Compute' END AS node_type
        FROM stv_slices
        GROUP BY node
        ORDER BY node
      `;

      const nodeResult = await session.execute(nodeQuery);

      const leaderNode = nodeResult.rows.find((r: any) => r.node_type === 'Leader')?.node?.toString() || '-1';
      const computeNodes = nodeResult.rows
        .filter((r: any) => r.node_type === 'Compute')
        .map((r: any) => r.node?.toString() || '0');

      // Get disk usage
      const diskQuery = `
        SELECT
          SUM(used) AS disk_used,
          SUM(capacity) AS disk_total
        FROM stv_partitions
        WHERE part_begin = 0
      `;

      const diskResult = await session.execute(diskQuery);
      const diskRow = diskResult.rows[0] || {};

      // Get query counts
      const queryCountQuery = `
        SELECT
          COUNT(CASE WHEN state = 'Running' OR state = 'Returning' THEN 1 END) AS running,
          COUNT(CASE WHEN state = 'Queued' THEN 1 END) AS queued
        FROM stv_recents
        WHERE status = 'Running'
      `;

      const queryCountResult = await session.execute(queryCountQuery);
      const queryRow = queryCountResult.rows[0] || {};

      return {
        nodeCount: nodeResult.rows.length,
        leaderNode,
        computeNodes,
        diskSpaceUsed: parseInt(diskRow.disk_used, 10) || 0,
        diskSpaceTotal: parseInt(diskRow.disk_total, 10) || 0,
        concurrentQueries: parseInt(queryRow.running, 10) || 0,
        queuedQueries: parseInt(queryRow.queued, 10) || 0,
      };
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve cluster status',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Gets all currently running queries.
   *
   * Queries the STV_RECENTS system table to get information about
   * queries that are currently executing.
   *
   * @returns Promise resolving to array of running query information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const queries = await monitor.getRunningQueries();
   *
   * console.log(`${queries.length} queries currently running:`);
   * for (const query of queries) {
   *   const durationSec = (query.durationMs / 1000).toFixed(1);
   *   console.log(`  [${query.queryId}] ${query.user} - ${durationSec}s`);
   *   console.log(`    ${query.queryText.substring(0, 80)}...`);
   * }
   * ```
   */
  async getRunningQueries(): Promise<RunningQuery[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          query AS query_id,
          pid,
          db_name AS database,
          user_name AS user,
          text AS query_text,
          starttime AS start_time,
          DATEDIFF(millisecond, starttime, GETDATE()) AS duration_ms,
          status,
          service_class AS queue
        FROM stv_recents
        WHERE status = 'Running'
          AND query >= 0
        ORDER BY starttime DESC
      `;

      const result = await session.execute(query);

      return result.rows.map((row: any) => ({
        queryId: parseInt(row.query_id, 10),
        pid: parseInt(row.pid, 10),
        database: row.database || '',
        user: row.user || '',
        queryText: row.query_text || '',
        startTime: new Date(row.start_time),
        durationMs: parseInt(row.duration_ms, 10) || 0,
        status: row.status || '',
        queue: parseInt(row.queue, 10) || 0,
      }));
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve running queries',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Gets slow queries that exceed a specified duration threshold.
   *
   * Useful for identifying performance problems and queries that
   * may need optimization.
   *
   * @param thresholdMs - Minimum query duration in milliseconds to be considered slow
   * @returns Promise resolving to array of slow query information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * // Find queries slower than 30 seconds
   * const slowQueries = await monitor.getSlowQueries(30000);
   *
   * if (slowQueries.length > 0) {
   *   console.log(`Found ${slowQueries.length} slow queries:`);
   *   for (const query of slowQueries) {
   *     const durationSec = (query.durationMs / 1000).toFixed(1);
   *     console.log(`  Query ${query.queryId}: ${durationSec}s`);
   *     console.log(`  User: ${query.user}, Database: ${query.database}`);
   *     console.log(`  Status: ${query.status}`);
   *     if (query.aborted) {
   *       console.log(`  ABORTED: ${query.errorMessage || 'Unknown error'}`);
   *     }
   *   }
   * }
   * ```
   */
  async getSlowQueries(thresholdMs: number): Promise<QueryInfo[]> {
    const session = await this.pool.acquire();

    try {
      const thresholdSeconds = Math.floor(thresholdMs / 1000);

      const query = `
        SELECT
          query AS query_id,
          userid AS user_id,
          TRIM(usename) AS user,
          TRIM(database) AS database,
          TRIM(querytxt) AS query_text,
          starttime AS start_time,
          endtime AS end_time,
          DATEDIFF(millisecond, starttime, COALESCE(endtime, GETDATE())) AS duration_ms,
          COALESCE(returned_rows, 0) AS rows_returned,
          TRIM(status) AS status,
          aborted,
          TRIM(err_msg) AS error_message
        FROM stl_query
        WHERE DATEDIFF(second, starttime, COALESCE(endtime, GETDATE())) >= ${thresholdSeconds}
          AND starttime >= DATEADD(hour, -24, GETDATE())
          AND userid > 1
        ORDER BY duration_ms DESC
        LIMIT 100
      `;

      const result = await session.execute(query);

      return result.rows.map((row: any) => ({
        queryId: parseInt(row.query_id, 10),
        user: row.user || '',
        database: row.database || '',
        queryText: row.query_text || '',
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        durationMs: parseInt(row.duration_ms, 10) || 0,
        rowsReturned: row.rows_returned ? parseInt(row.rows_returned, 10) : undefined,
        status: row.status || '',
        aborted: row.aborted === 1 || row.aborted === true,
        errorMessage: row.error_message || undefined,
      }));
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve slow queries',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
          context: { thresholdMs },
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Gets disk usage information for each node in the cluster.
   *
   * Helps identify nodes that may be running out of disk space.
   *
   * @returns Promise resolving to array of node disk usage information
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const diskUsage = await monitor.getNodeDiskUsage();
   *
   * for (const node of diskUsage) {
   *   console.log(`Node ${node.nodeId}:`);
   *   console.log(`  Used: ${node.usedMb} MB`);
   *   console.log(`  Total: ${node.totalMb} MB`);
   *   console.log(`  Usage: ${node.usedPercent.toFixed(1)}%`);
   *
   *   if (node.usedPercent > 80) {
   *     console.log(`  WARNING: High disk usage!`);
   *   }
   * }
   * ```
   */
  async getNodeDiskUsage(): Promise<NodeDiskUsage[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          node,
          SUM(used) AS used_mb,
          SUM(capacity) AS total_mb,
          (SUM(used)::FLOAT / NULLIF(SUM(capacity), 0) * 100) AS used_percent
        FROM stv_partitions
        WHERE part_begin = 0
        GROUP BY node
        ORDER BY node
      `;

      const result = await session.execute(query);

      return result.rows.map((row: any) => ({
        nodeId: row.node?.toString() || '0',
        usedMb: parseInt(row.used_mb, 10) || 0,
        totalMb: parseInt(row.total_mb, 10) || 0,
        usedPercent: parseFloat(row.used_percent) || 0,
      }));
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve node disk usage',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Gets the number of active connections to the cluster.
   *
   * @returns Promise resolving to the number of active connections
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const connections = await monitor.getActiveConnections();
   * console.log(`Active connections: ${connections}`);
   * ```
   */
  async getActiveConnections(): Promise<number> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT COUNT(DISTINCT pid) AS connection_count
        FROM stv_sessions
        WHERE user_name != 'rdsdb'
      `;

      const result = await session.execute(query);
      const row = result.rows[0];

      return parseInt(row?.connection_count, 10) || 0;
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve active connections count',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    } finally {
      await this.pool.release(session);
    }
  }

  /**
   * Checks if the cluster is healthy.
   *
   * Performs basic health checks including:
   * - Ability to execute queries
   * - Disk space availability (< 90% used)
   * - No excessive query queuing
   *
   * @returns Promise resolving to true if cluster is healthy, false otherwise
   *
   * @example
   * ```typescript
   * const healthy = await monitor.isHealthy();
   * if (!healthy) {
   *   console.error('Cluster health check failed!');
   *   const status = await monitor.getClusterStatus();
   *   console.error('Status:', status);
   * }
   * ```
   */
  async isHealthy(): Promise<boolean> {
    try {
      const status = await this.getClusterStatus();

      // Check disk usage (fail if > 90% used)
      const diskUsagePercent = (status.diskSpaceUsed / status.diskSpaceTotal) * 100;
      if (diskUsagePercent > 90) {
        return false;
      }

      // Check for excessive queuing (fail if > 10 queries queued)
      if (status.queuedQueries > 10) {
        return false;
      }

      return true;
    } catch (error) {
      // If we can't query the cluster, it's not healthy
      return false;
    }
  }
}
