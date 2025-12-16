/**
 * Redshift Workload Management (WLM)
 *
 * Provides interfaces and implementations for managing Redshift WLM queues,
 * query groups, and concurrency settings.
 *
 * @module @llmdevops/redshift-integration/workload/wlm
 */

import type { ConnectionPool } from '../pool/pool.js';
import type { Session } from '../pool/session.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

// ============================================================================
// WLM Types
// ============================================================================

/**
 * Concurrency scaling mode for a WLM queue.
 */
export type ConcurrencyScalingMode = 'AUTO' | 'OFF';

/**
 * Information about a WLM queue configuration.
 */
export interface WlmQueueInfo {
  /**
   * Name or identifier of the queue.
   */
  queueName: string;

  /**
   * Number of query slots allocated to this queue.
   */
  slots: number;

  /**
   * Percentage of cluster memory allocated to this queue.
   */
  memoryPercent: number;

  /**
   * Maximum execution time for queries in this queue (in seconds).
   * 0 means no limit.
   */
  maxExecutionTime: number;

  /**
   * List of user groups assigned to this queue.
   */
  userGroups: string[];

  /**
   * List of query groups assigned to this queue.
   */
  queryGroups: string[];

  /**
   * Concurrency scaling mode.
   */
  concurrencyScaling: ConcurrencyScalingMode;
}

/**
 * Current state of a WLM queue.
 */
export interface WlmQueueState {
  /**
   * Queue name or service class ID.
   */
  queueName: string;

  /**
   * Number of queries currently running in this queue.
   */
  runningQueries: number;

  /**
   * Number of queries currently queued.
   */
  queuedQueries: number;

  /**
   * Number of available slots.
   */
  availableSlots: number;

  /**
   * Total number of slots for this queue.
   */
  totalSlots: number;

  /**
   * Whether concurrency scaling is active for this queue.
   */
  concurrencyScalingActive: boolean;
}

// ============================================================================
// WLM Manager
// ============================================================================

/**
 * WlmManager provides methods for managing Redshift workload management.
 *
 * This class allows you to:
 * - Query WLM queue configurations
 * - Monitor current queue states
 * - Set query groups for sessions
 * - Control query routing to specific queues
 *
 * @example
 * ```typescript
 * const wlm = new WlmManager(pool);
 *
 * // Get queue configurations
 * const queues = await wlm.getQueueConfiguration();
 * console.log(`Found ${queues.length} WLM queues`);
 *
 * // Check current queue states
 * const states = await wlm.getCurrentQueues();
 * for (const state of states) {
 *   console.log(`Queue ${state.queueName}: ${state.runningQueries} running, ${state.queuedQueries} queued`);
 * }
 *
 * // Route queries to a specific queue
 * const session = await pool.acquire();
 * await wlm.setQueryGroup(session, 'reporting');
 * // ... execute queries ...
 * await wlm.resetQueryGroup(session);
 * await pool.release(session);
 * ```
 */
export class WlmManager {
  private readonly pool: ConnectionPool;

  /**
   * Creates a new WlmManager instance.
   *
   * @param pool - Connection pool for executing WLM queries
   */
  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  /**
   * Gets the current WLM queue configuration.
   *
   * Queries the STV_WLM_SERVICE_CLASS_CONFIG system table to retrieve
   * configuration information for all WLM queues.
   *
   * @returns Promise resolving to an array of WLM queue configurations
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const queues = await wlm.getQueueConfiguration();
   * for (const queue of queues) {
   *   console.log(`Queue: ${queue.queueName}`);
   *   console.log(`  Slots: ${queue.slots}`);
   *   console.log(`  Memory: ${queue.memoryPercent}%`);
   *   console.log(`  Max Execution Time: ${queue.maxExecutionTime}s`);
   * }
   * ```
   */
  async getQueueConfiguration(): Promise<WlmQueueInfo[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          service_class AS queue_id,
          num_query_tasks AS slots,
          query_working_mem AS memory_percent,
          max_execution_time,
          user_group_wild_card AS user_groups,
          query_group_wild_card AS query_groups,
          auto_wlm
        FROM stv_wlm_service_class_config
        WHERE service_class >= 6
        ORDER BY service_class
      `;

      const result = await session.execute(query);

      return result.rows.map((row: any) => ({
        queueName: `Queue ${row.queue_id}`,
        slots: parseInt(row.slots, 10) || 1,
        memoryPercent: parseInt(row.memory_percent, 10) || 0,
        maxExecutionTime: parseInt(row.max_execution_time, 10) || 0,
        userGroups: row.user_groups ? row.user_groups.split(',').filter(Boolean) : [],
        queryGroups: row.query_groups ? row.query_groups.split(',').filter(Boolean) : [],
        concurrencyScaling: row.auto_wlm ? 'AUTO' : 'OFF',
      }));
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve WLM queue configuration',
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
   * Gets the current state of all WLM queues.
   *
   * Queries the STV_WLM_QUERY_STATE system table to get real-time
   * information about running and queued queries in each queue.
   *
   * @returns Promise resolving to an array of WLM queue states
   * @throws {RedshiftError} If the query fails
   *
   * @example
   * ```typescript
   * const states = await wlm.getCurrentQueues();
   * for (const state of states) {
   *   const utilization = (state.totalSlots - state.availableSlots) / state.totalSlots * 100;
   *   console.log(`${state.queueName}: ${utilization.toFixed(1)}% utilized`);
   *
   *   if (state.queuedQueries > 0) {
   *     console.log(`  WARNING: ${state.queuedQueries} queries queued`);
   *   }
   * }
   * ```
   */
  async getCurrentQueues(): Promise<WlmQueueState[]> {
    const session = await this.pool.acquire();

    try {
      const query = `
        SELECT
          service_class,
          COUNT(CASE WHEN state = 'Running' THEN 1 END) AS running_queries,
          COUNT(CASE WHEN state = 'Queued' THEN 1 END) AS queued_queries,
          MAX(num_query_tasks) AS total_slots
        FROM stv_wlm_query_state
        WHERE service_class >= 6
        GROUP BY service_class
        ORDER BY service_class
      `;

      const result = await session.execute(query);

      // Also get queue configuration for slot information
      const configs = await this.getQueueConfiguration();
      const configMap = new Map(
        configs.map(c => [c.queueName, c])
      );

      return result.rows.map((row: any) => {
        const queueName = `Queue ${row.service_class}`;
        const config = configMap.get(queueName);
        const totalSlots = config?.slots || parseInt(row.total_slots, 10) || 1;
        const runningQueries = parseInt(row.running_queries, 10) || 0;
        const queuedQueries = parseInt(row.queued_queries, 10) || 0;

        return {
          queueName,
          runningQueries,
          queuedQueries,
          availableSlots: Math.max(0, totalSlots - runningQueries),
          totalSlots,
          concurrencyScalingActive: config?.concurrencyScaling === 'AUTO',
        };
      });
    } catch (error) {
      throw new RedshiftError(
        'Failed to retrieve current WLM queue states',
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
   * Sets the query group for a session.
   *
   * The query group determines which WLM queue will process queries
   * executed on this session. This allows you to route different types
   * of queries to appropriate queues.
   *
   * @param session - Session to configure
   * @param queryGroup - Name of the query group
   * @throws {RedshiftError} If the operation fails
   *
   * @example
   * ```typescript
   * const session = await pool.acquire();
   * try {
   *   // Route to reporting queue
   *   await wlm.setQueryGroup(session, 'reporting');
   *
   *   // Execute reporting queries
   *   const result = await session.execute('SELECT * FROM sales_report');
   * } finally {
   *   await wlm.resetQueryGroup(session);
   *   await pool.release(session);
   * }
   * ```
   */
  async setQueryGroup(session: Session, queryGroup: string): Promise<void> {
    try {
      await session.setQueryGroup(queryGroup);
    } catch (error) {
      throw new RedshiftError(
        `Failed to set query group to '${queryGroup}'`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: false,
          context: { queryGroup },
        }
      );
    }
  }

  /**
   * Resets the query group for a session to default.
   *
   * Clears any query group assignment, allowing queries to use
   * the default WLM queue routing rules.
   *
   * @param session - Session to reset
   * @throws {RedshiftError} If the operation fails
   *
   * @example
   * ```typescript
   * await wlm.setQueryGroup(session, 'reporting');
   * // ... execute queries ...
   * await wlm.resetQueryGroup(session); // Back to default routing
   * ```
   */
  async resetQueryGroup(session: Session): Promise<void> {
    try {
      await session.execute("RESET query_group");
    } catch (error) {
      throw new RedshiftError(
        'Failed to reset query group',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: false,
        }
      );
    }
  }

  /**
   * Gets the WLM queue assignment for a specific query group.
   *
   * This is a convenience method to find which queue a query group
   * is assigned to based on the current WLM configuration.
   *
   * @param queryGroup - Name of the query group
   * @returns Promise resolving to queue info if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const queue = await wlm.getQueueForQueryGroup('reporting');
   * if (queue) {
   *   console.log(`Reporting queries use ${queue.queueName}`);
   *   console.log(`Available slots: ${queue.slots}`);
   * }
   * ```
   */
  async getQueueForQueryGroup(queryGroup: string): Promise<WlmQueueInfo | undefined> {
    const queues = await this.getQueueConfiguration();
    return queues.find(queue =>
      queue.queryGroups.some(qg =>
        qg === queryGroup || qg === '*'
      )
    );
  }

  /**
   * Checks if a specific queue has available capacity.
   *
   * Useful for implementing custom queue selection logic or
   * load balancing across multiple queues.
   *
   * @param queueName - Name of the queue to check
   * @returns Promise resolving to true if queue has available slots
   *
   * @example
   * ```typescript
   * if (await wlm.hasAvailableCapacity('Queue 1')) {
   *   console.log('Queue 1 has capacity');
   * } else {
   *   console.log('Queue 1 is at full capacity');
   * }
   * ```
   */
  async hasAvailableCapacity(queueName: string): Promise<boolean> {
    const states = await this.getCurrentQueues();
    const state = states.find(s => s.queueName === queueName);
    return state ? state.availableSlots > 0 : false;
  }
}
