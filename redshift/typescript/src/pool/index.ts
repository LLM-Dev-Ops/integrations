/**
 * Redshift Connection Pool Module
 *
 * Provides connection pooling and session management for Redshift.
 * @module @llmdevops/redshift-integration/pool
 */

export {
  Session,
  type SessionState,
  type SessionInfo,
  type ExecuteOptions,
} from './session.js';

export {
  ConnectionPool,
  type PoolEvents,
  type RedshiftEndpoint,
  type CredentialSource,
  type ConnectionConfig,
  type PoolConfig,
  DEFAULT_POOL_MIN,
  DEFAULT_POOL_MAX,
  DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
  DEFAULT_POOL_IDLE_TIMEOUT_MS,
  DEFAULT_POOL_MAX_LIFETIME_MS,
  DEFAULT_REDSHIFT_PORT,
} from './pool.js';

export {
  Transaction,
  TransactionManager,
  withTransaction,
  type IsolationLevel,
  type TransactionState,
  type TransactionOptions,
  type TransactionManagerOptions,
} from './transaction.js';
