/**
 * Databricks Delta Lake client implementation.
 *
 * Main client class providing unified access to all Databricks services:
 * - Jobs API for workflow execution
 * - SQL API for warehouse queries
 * - Delta Lake operations
 * - Unity Catalog management
 * - Streaming job configuration
 */

import { DatabricksConfig, type DatabricksConfigOptions } from '../config/index.js';
import { HttpExecutor } from '../http/index.js';
import { createAuthProvider } from '../auth/index.js';
import type { AuthProvider } from '../http/index.js';

// Import service client types (these would be implemented in their respective modules)
// Note: Import paths assume services exist or will be created
export interface JobsClient {
  // Jobs service methods
}

export interface SqlClient {
  // SQL service methods
}

export interface DeltaClient {
  // Delta Lake service methods
}

export interface CatalogClient {
  // Catalog service methods
}

export interface SchemaManager {
  // Schema management methods
}

export interface StreamingJobBuilder {
  // Streaming job builder methods
}

/**
 * Client options for DatabricksClient
 */
export interface DatabricksClientOptions {
  /** Databricks workspace URL */
  workspaceUrl: string;
  /** Authentication configuration */
  auth: DatabricksConfigOptions['auth'];
  /** Default SQL warehouse ID */
  warehouseId?: string;
  /** Default catalog name */
  catalog?: string;
  /** Default schema name */
  schema?: string;
  /** Request timeout in seconds */
  timeoutSecs?: number;
  /** Rate limit: requests per second */
  rateLimit?: number;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Custom user agent suffix */
  userAgentSuffix?: string;
  /** Custom auth provider (advanced usage) */
  authProvider?: AuthProvider;
}

/**
 * Main Databricks Delta Lake client
 *
 * Provides unified access to all Databricks services with:
 * - Automatic authentication and token refresh
 * - Built-in resilience patterns (retry, circuit breaker, rate limiting)
 * - Observability hooks for monitoring
 *
 * @example
 * ```typescript
 * import { DatabricksClient } from '@llm-devops/databricks-delta-lake';
 *
 * // Create client with Personal Access Token
 * const client = new DatabricksClient({
 *   workspaceUrl: 'https://my-workspace.cloud.databricks.com',
 *   auth: {
 *     type: 'personal_access_token',
 *     token: new SecretString('dapi...')
 *   }
 * });
 *
 * // Use jobs API
 * const run = await client.jobs.submitRun({ ... });
 *
 * // Use SQL API
 * const sqlClient = client.sql('my-warehouse-id');
 * const result = await sqlClient.execute('SELECT * FROM table');
 *
 * // Use Delta Lake API
 * const deltaClient = client.delta('main', 'default');
 * const data = await deltaClient.read('my_table');
 *
 * // Use Unity Catalog API
 * const catalogs = await client.catalog.listCatalogs();
 * ```
 */
export class DatabricksClient {
  private readonly config: DatabricksConfig;
  private readonly httpExecutor: HttpExecutor;

  // Lazy-initialized service clients
  private _jobs?: JobsClient;
  private _catalog?: CatalogClient;

  constructor(options: DatabricksClientOptions | DatabricksConfig) {
    // Handle both direct config and options
    if (options instanceof DatabricksConfig) {
      this.config = options;
    } else {
      this.config = DatabricksConfig.create(options);
    }

    // Create auth provider
    const authProvider = options instanceof DatabricksConfig
      ? createAuthProvider({
          method: this.config.auth.type === 'personal_access_token' ? 'pat' :
                 this.config.auth.type === 'oauth' ? 'oauth' :
                 this.config.auth.type === 'service_principal' ? 'service_principal' :
                 'pat', // fallback
          config: this.config.auth.type === 'personal_access_token'
            ? { token: this.config.auth.token.expose() }
            : this.config.auth.type === 'oauth'
            ? {
                workspaceUrl: this.config.workspaceUrl,
                clientId: this.config.auth.clientId,
                clientSecret: this.config.auth.clientSecret.expose(),
                scopes: this.config.auth.scopes
              }
            : this.config.auth.type === 'service_principal'
            ? {
                tenantId: this.config.auth.tenantId,
                clientId: this.config.auth.clientId,
                clientSecret: this.config.auth.clientSecret.expose()
              }
            : { token: '' } // fallback
        } as any)
      : ('authProvider' in options && options.authProvider)
        ? options.authProvider
        : createAuthProvider({
            method: options.auth.type === 'personal_access_token' ? 'pat' :
                   options.auth.type === 'oauth' ? 'oauth' :
                   options.auth.type === 'service_principal' ? 'service_principal' :
                   'pat', // fallback
            config: options.auth.type === 'personal_access_token'
              ? { token: options.auth.token.expose() }
              : options.auth.type === 'oauth'
              ? {
                  workspaceUrl: options.workspaceUrl,
                  clientId: options.auth.clientId,
                  clientSecret: options.auth.clientSecret.expose(),
                  scopes: options.auth.scopes
                }
              : options.auth.type === 'service_principal'
              ? {
                  tenantId: options.auth.tenantId,
                  clientId: options.auth.clientId,
                  clientSecret: options.auth.clientSecret.expose()
                }
              : { token: '' } // fallback
          } as any);

    // Create HTTP executor with resilience patterns
    this.httpExecutor = new HttpExecutor({
      workspaceUrl: this.config.workspaceUrl,
      authProvider,
      baseTimeout: this.config.getTimeoutMs(),
      resilience: {
        retry: {
          RATE_LIMITED: {
            maxAttempts: this.config.resilience.retry.maxRetries,
            initialDelayMs: this.config.resilience.retry.baseDelayMs,
            multiplier: 2,
            maxDelayMs: this.config.resilience.retry.maxDelayMs,
          },
          SERVICE_UNAVAILABLE: {
            maxAttempts: this.config.resilience.retry.maxRetries,
            initialDelayMs: this.config.resilience.retry.baseDelayMs,
            multiplier: 2,
            maxDelayMs: this.config.resilience.retry.maxDelayMs,
          },
          INTERNAL_ERROR: {
            maxAttempts: this.config.resilience.retry.maxRetries,
            initialDelayMs: this.config.resilience.retry.baseDelayMs,
            multiplier: 2,
            maxDelayMs: this.config.resilience.retry.maxDelayMs,
          },
        },
        circuitBreaker: {
          failureThreshold: this.config.resilience.circuitBreakerThreshold,
          successThreshold: 2,
          resetTimeoutMs: this.config.resilience.circuitBreakerResetTimeout * 1000,
        },
      },
    });
  }

  /**
   * Jobs API client for workflow execution
   *
   * @example
   * ```typescript
   * const run = await client.jobs.submitRun({
   *   task: {
   *     type: 'notebook',
   *     notebookPath: '/Shared/my-notebook',
   *   },
   *   cluster: { ... }
   * });
   * ```
   */
  get jobs(): JobsClient {
    if (!this._jobs) {
      // Lazy initialization - would import and instantiate actual JobsClient
      throw new Error('JobsClient not yet implemented');
    }
    return this._jobs;
  }

  /**
   * Create SQL client for a specific warehouse
   *
   * @param warehouseId - SQL warehouse ID (optional if configured in client)
   * @returns SQL client instance
   *
   * @example
   * ```typescript
   * const sqlClient = client.sql('my-warehouse-id');
   * const result = await sqlClient.execute('SELECT * FROM table');
   * ```
   */
  sql(warehouseId?: string): SqlClient {
    const actualWarehouseId = warehouseId ?? this.config.warehouseId;
    if (!actualWarehouseId) {
      throw new Error(
        'Warehouse ID is required. Provide it when calling sql() or set it in the client configuration.'
      );
    }
    // Would import and instantiate actual SqlClient
    throw new Error('SqlClient not yet implemented');
  }

  /**
   * Create Delta Lake client for a specific catalog and schema
   *
   * @param catalog - Catalog name (optional, defaults to client config)
   * @param schema - Schema name (optional, defaults to client config)
   * @returns Delta Lake client instance
   *
   * @example
   * ```typescript
   * const deltaClient = client.delta('main', 'default');
   * const data = await deltaClient.read('my_table');
   * ```
   */
  delta(catalog?: string, schema?: string): DeltaClient {
    const actualCatalog = catalog ?? this.config.catalog;
    const actualSchema = schema ?? this.config.schema;
    // Would import and instantiate actual DeltaClient
    throw new Error('DeltaClient not yet implemented');
  }

  /**
   * Unity Catalog client for metadata operations
   *
   * @example
   * ```typescript
   * const catalogs = await client.catalog.listCatalogs();
   * const schemas = await client.catalog.listSchemas('main');
   * const tables = await client.catalog.listTables('main', 'default');
   * ```
   */
  get catalog(): CatalogClient {
    if (!this._catalog) {
      // Lazy initialization - would import and instantiate actual CatalogClient
      throw new Error('CatalogClient not yet implemented');
    }
    return this._catalog;
  }

  /**
   * Create streaming job builder
   *
   * @returns Streaming job builder instance
   *
   * @example
   * ```typescript
   * const stream = client.streaming()
   *   .source({ type: 'delta', table: 'source_table' })
   *   .sink({ type: 'delta', table: 'target_table' })
   *   .trigger({ type: 'processing_time', intervalMs: 10000 })
   *   .build();
   * ```
   */
  streaming(): StreamingJobBuilder {
    // Would import and instantiate actual StreamingJobBuilder
    throw new Error('StreamingJobBuilder not yet implemented');
  }

  /**
   * Get the resilience orchestrator for monitoring circuit breaker state
   *
   * @returns HTTP executor with resilience patterns
   */
  getResilience(): HttpExecutor {
    return this.httpExecutor;
  }

  /**
   * Get the observability context for metrics and tracing
   *
   * @returns Observability context (placeholder for now)
   */
  getObservability(): Record<string, unknown> {
    // Placeholder - would return actual observability context
    return {
      metrics: {},
      traces: {},
    };
  }

  /**
   * Get the client configuration
   *
   * @returns Databricks configuration
   */
  getConfig(): DatabricksConfig {
    return this.config;
  }

  /**
   * Get the underlying HTTP executor
   *
   * @returns HTTP executor instance
   */
  getHttpExecutor(): HttpExecutor {
    return this.httpExecutor;
  }
}

/**
 * Create a Databricks client with options
 *
 * @param options - Client configuration options
 * @returns Databricks client instance
 *
 * @example
 * ```typescript
 * import { createClient, SecretString } from '@llm-devops/databricks-delta-lake';
 *
 * const client = createClient({
 *   workspaceUrl: 'https://my-workspace.cloud.databricks.com',
 *   auth: {
 *     type: 'personal_access_token',
 *     token: new SecretString('dapi...')
 *   }
 * });
 * ```
 */
export function createClient(options: DatabricksClientOptions): DatabricksClient {
  return new DatabricksClient(options);
}

/**
 * Create a Databricks client from environment variables
 *
 * Required environment variables:
 * - DATABRICKS_HOST: Workspace URL
 * - DATABRICKS_TOKEN: Personal access token (or other auth credentials)
 *
 * Optional environment variables:
 * - DATABRICKS_WAREHOUSE_ID: Default SQL warehouse ID
 * - DATABRICKS_CATALOG: Default catalog name
 * - DATABRICKS_SCHEMA: Default schema name
 * - DATABRICKS_TIMEOUT_SECS: Request timeout in seconds
 * - DATABRICKS_RATE_LIMIT: Rate limit (requests per second)
 * - DATABRICKS_MAX_RETRIES: Maximum retry attempts
 *
 * @param options - Additional options to override environment variables
 * @returns Databricks client instance
 *
 * @example
 * ```typescript
 * import { createClientFromEnv } from '@llm-devops/databricks-delta-lake';
 *
 * const client = createClientFromEnv();
 * ```
 */
export function createClientFromEnv(
  options?: Omit<DatabricksClientOptions, 'workspaceUrl' | 'auth'>
): DatabricksClient {
  const config = DatabricksConfig.fromEnv();
  return new DatabricksClient({
    workspaceUrl: config.workspaceUrl,
    auth: config.auth,
    warehouseId: options?.warehouseId ?? config.warehouseId,
    catalog: options?.catalog ?? config.catalog,
    schema: options?.schema ?? config.schema,
    timeoutSecs: options?.timeoutSecs ?? config.timeoutSecs,
    rateLimit: options?.rateLimit ?? config.resilience.rateLimit,
    maxRetries: options?.maxRetries ?? config.resilience.retry.maxRetries,
    userAgentSuffix: options?.userAgentSuffix ?? config.userAgentSuffix,
  });
}
