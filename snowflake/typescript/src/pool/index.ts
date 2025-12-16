/**
 * Snowflake Connection Pool Module
 *
 * Provides connection pooling and session management for Snowflake.
 * @module @llmdevops/snowflake-integration/pool
 */

export { Session, type ExecuteOptions } from './session.js';
export { ConnectionPool, type PoolEvents } from './pool.js';
