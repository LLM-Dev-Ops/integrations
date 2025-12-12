/**
 * RuvVector Postgres Database Connectivity Module
 * Provides shared database connection utilities for all integrations
 */

import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    version?: string;
    database?: string;
    user?: string;
    extensions?: string[];
  };
  error?: Error;
}

/**
 * Default configuration from environment variables
 */
export function getDefaultConfig(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      ssl: url.searchParams.get('ssl') === 'true',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'ruvector',
    password: process.env.POSTGRES_PASSWORD || 'ruvector_secret',
    database: process.env.POSTGRES_DB || 'ruvector',
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * RuvVector Database Pool Manager
 */
export class RuvectorDatabase {
  private pool: Pool;
  private config: DatabaseConfig;

  constructor(config?: Partial<DatabaseConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
    this.pool = new Pool(this.config as PoolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Execute a query
   */
  async query(text: string, params?: any[]): Promise<QueryResult> {
    return this.pool.query(text, params);
  }

  /**
   * Test database connectivity with a connect -> query -> write -> read cycle
   */
  async testConnection(): Promise<ConnectionTestResult> {
    let client: PoolClient | null = null;

    try {
      // Step 1: Connect
      client = await this.pool.connect();

      // Step 2: Query - get database info
      const versionResult = await client.query('SELECT version()');
      const version = versionResult.rows[0]?.version;

      const dbInfoResult = await client.query(
        'SELECT current_database(), current_user'
      );
      const database = dbInfoResult.rows[0]?.current_database;
      const user = dbInfoResult.rows[0]?.current_user;

      // Get installed extensions
      const extResult = await client.query(
        "SELECT extname FROM pg_extension WHERE extname IN ('ruvector', 'vector', 'pgvector')"
      );
      const extensions = extResult.rows.map((r) => r.extname);

      // Step 3: Write - create temp table and insert
      await client.query(`
        CREATE TEMP TABLE IF NOT EXISTS _connectivity_test (
          id SERIAL PRIMARY KEY,
          integration TEXT NOT NULL,
          tested_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await client.query(
        'INSERT INTO _connectivity_test (integration) VALUES ($1)',
        ['connectivity-test']
      );

      // Step 4: Read - verify the write
      const readResult = await client.query(
        'SELECT * FROM _connectivity_test ORDER BY id DESC LIMIT 1'
      );

      if (readResult.rows.length === 0) {
        throw new Error('Write verification failed: no rows returned');
      }

      return {
        success: true,
        message: 'Connection test passed: connect -> query -> write -> read cycle complete',
        details: {
          version,
          database,
          user,
          extensions,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${(error as Error).message}`,
        error: error as Error,
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

/**
 * Singleton instance for shared usage
 */
let defaultInstance: RuvectorDatabase | null = null;

/**
 * Get the default database instance
 */
export function getDatabase(config?: Partial<DatabaseConfig>): RuvectorDatabase {
  if (!defaultInstance) {
    defaultInstance = new RuvectorDatabase(config);
  }
  return defaultInstance;
}

/**
 * Close the default database instance
 */
export async function closeDatabase(): Promise<void> {
  if (defaultInstance) {
    await defaultInstance.close();
    defaultInstance = null;
  }
}

// Export types
export type { Pool, PoolClient, QueryResult } from 'pg';
