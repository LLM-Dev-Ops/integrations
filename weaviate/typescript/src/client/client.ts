/**
 * WeaviateClient - Main client class
 *
 * Provides a unified interface to all Weaviate operations by coordinating
 * the various service modules.
 *
 * @module client/client
 */

import type { WeaviateConfig } from '../config/types.js';
import type {
  UUID,
  Properties,
  Vector,
} from '../types/index.js';
import type {
  WeaviateObject,
  CreateOptions,
  GetOptions,
  UpdateOptions,
  DeleteOptions,
} from '../types/object.js';
import type {
  NearVectorQuery,
  NearObjectQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchResult,
} from '../types/search.js';
import type {
  BatchObject,
  BatchResponse,
  BatchDeleteResponse,
} from '../types/batch.js';
import type {
  AggregateQuery,
  AggregateResult,
} from '../types/aggregate.js';
import type { WhereFilter } from '../types/filter.js';
import type { Reference } from '../types/reference.js';
import type { Tenant } from '../types/tenant.js';
import type {
  Schema,
  ClassDefinition,
  ShardInfo,
} from '../types/schema.js';
import type { ClientState, HealthStatus } from './types.js';

// Service imports
import { createAuthProvider } from '../auth/factory.js';
import { HttpTransport } from '../transport/http.js';
import { ResilienceOrchestrator } from '../resilience/orchestrator.js';
import { createObservabilityContext } from '../observability/factory.js';
import { ObjectService } from '../operations/object.js';
import { SearchService } from '../search/service.js';
import { BatchService } from '../batch/service.js';
import { AggregateService } from '../aggregate/service.js';
import { ReferenceService } from '../reference/service.js';
import { TenantService } from '../tenant/service.js';
import { SchemaService } from '../schema/service.js';
import { SchemaCache } from '../schema/cache.js';
import { GraphQLExecutor } from '../graphql/executor.js';
import { healthCheck } from './health.js';
import { ClientState as State } from './types.js';

/**
 * Main Weaviate client class
 *
 * Provides a high-level API for all Weaviate operations including:
 * - Object CRUD operations
 * - Vector and hybrid search
 * - Batch operations
 * - Aggregations
 * - References
 * - Multi-tenancy
 * - Schema introspection
 *
 * @example
 * ```typescript
 * import { WeaviateClient } from '@llmdevops/weaviate-integration';
 *
 * const client = new WeaviateClient({
 *   endpoint: 'http://localhost:8080',
 *   auth: { type: 'apiKey', apiKey: 'secret' }
 * });
 *
 * // Create an object
 * const obj = await client.createObject('Article', {
 *   title: 'My Article',
 *   content: 'Content here...'
 * }, { vector: [0.1, 0.2, 0.3] });
 *
 * // Search
 * const results = await client.nearVector('Article', {
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10
 * });
 *
 * await client.close();
 * ```
 */
export class WeaviateClient {
  private readonly config: WeaviateConfig;
  private state: ClientState = State.Initialized;

  // Core infrastructure (initialized lazily)
  private _authProvider?: ReturnType<typeof createAuthProvider>;
  private _transport?: HttpTransport;
  private _resilience?: ResilienceOrchestrator;
  private _observability?: ReturnType<typeof createObservabilityContext>;
  private _schemaCache?: SchemaCache;
  private _graphqlExecutor?: GraphQLExecutor;

  // Services (initialized lazily)
  private _objectService?: ObjectService;
  private _searchService?: SearchService;
  private _batchService?: BatchService;
  private _aggregateService?: AggregateService;
  private _referenceService?: ReferenceService;
  private _tenantService?: TenantService;
  private _schemaService?: SchemaService;

  /**
   * Create a new Weaviate client
   *
   * @param config - Client configuration
   */
  constructor(config: WeaviateConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Infrastructure Getters (Lazy Initialization)
  // ==========================================================================

  /**
   * Get or create auth provider
   */
  private get authProvider() {
    if (!this._authProvider) {
      this._authProvider = createAuthProvider(this.config.auth || { type: 'none' });
    }
    return this._authProvider;
  }

  /**
   * Get or create HTTP transport
   */
  private get transport(): HttpTransport {
    if (!this._transport) {
      this._transport = new HttpTransport({
        baseUrl: this.config.endpoint,
        authProvider: this.authProvider,
        timeout: this.config.timeout,
        headers: this.config.headers,
      });
    }
    return this._transport;
  }

  /**
   * Get or create resilience orchestrator
   */
  public get resilience(): ResilienceOrchestrator {
    if (!this._resilience) {
      this._resilience = new ResilienceOrchestrator({
        enableRetry: true,
        enableCircuitBreaker: true,
        enableRateLimiter: true,
        maxRetries: this.config.maxRetries,
        retryBackoffMs: this.config.retryBackoff,
        circuitBreakerThreshold: this.config.circuitBreakerThreshold,
      });
    }
    return this._resilience;
  }

  /**
   * Get or create observability context
   */
  public get observability() {
    if (!this._observability) {
      this._observability = createObservabilityContext();
    }
    return this._observability;
  }

  /**
   * Get or create schema cache
   */
  private get schemaCache(): SchemaCache {
    if (!this._schemaCache) {
      this._schemaCache = new SchemaCache(
        this.schemaService,
        this.config.schemaCacheTtl ? this.config.schemaCacheTtl / 1000 : undefined
      );
    }
    return this._schemaCache;
  }

  /**
   * Get or create GraphQL executor
   */
  private get graphqlExecutor(): GraphQLExecutor {
    if (!this._graphqlExecutor) {
      this._graphqlExecutor = new GraphQLExecutor({
        transport: this.transport,
        observability: this.observability,
      });
    }
    return this._graphqlExecutor;
  }

  // ==========================================================================
  // Service Getters (Lazy Initialization)
  // ==========================================================================

  /**
   * Get or create object service
   */
  private get objectService(): ObjectService {
    if (!this._objectService) {
      this._objectService = new ObjectService(
        this.transport,
        this.observability,
        this.schemaCache,
        this.resilience
      );
    }
    return this._objectService;
  }

  /**
   * Get or create search service
   */
  private get searchService(): SearchService {
    if (!this._searchService) {
      this._searchService = new SearchService({
        graphqlExecutor: this.graphqlExecutor,
        observability: this.observability,
        schemaCache: this.schemaCache,
        resilience: this.resilience,
      });
    }
    return this._searchService;
  }

  /**
   * Get or create batch service
   */
  private get batchService(): BatchService {
    if (!this._batchService) {
      this._batchService = new BatchService(
        this.transport,
        this.observability,
        this.resilience,
        {
          defaultBatchSize: this.config.batchSize,
        }
      );
    }
    return this._batchService;
  }

  /**
   * Get or create aggregate service
   */
  private get aggregateService(): AggregateService {
    if (!this._aggregateService) {
      this._aggregateService = new AggregateService({
        graphqlExecutor: this.graphqlExecutor,
        observability: this.observability,
      });
    }
    return this._aggregateService;
  }

  /**
   * Get or create reference service
   */
  private get referenceService(): ReferenceService {
    if (!this._referenceService) {
      this._referenceService = new ReferenceService(this.transport, {
        tracer: this.observability.tracer,
        logger: this.observability.logger,
        metrics: this.observability.metrics,
      });
    }
    return this._referenceService;
  }

  /**
   * Get or create tenant service
   */
  private get tenantService(): TenantService {
    if (!this._tenantService) {
      this._tenantService = new TenantService(
        this.transport,
        this.observability,
        this.config
      );
    }
    return this._tenantService;
  }

  /**
   * Get or create schema service
   */
  private get schemaService(): SchemaService {
    if (!this._schemaService) {
      this._schemaService = new SchemaService(this.transport, this.observability);
    }
    return this._schemaService;
  }

  // ==========================================================================
  // Object Operations
  // ==========================================================================

  /**
   * Create a new object
   *
   * @param className - Name of the class
   * @param properties - Object properties
   * @param options - Creation options including vector
   * @returns Promise resolving to created object
   *
   * @example
   * ```typescript
   * const obj = await client.createObject('Article', {
   *   title: 'My Article',
   *   content: 'Content here...'
   * }, {
   *   vector: [0.1, 0.2, 0.3],
   *   tenant: 'tenant-a'
   * });
   * ```
   */
  async createObject(
    className: string,
    properties: Properties,
    options?: { vector?: Vector; id?: UUID; tenant?: string }
  ): Promise<WeaviateObject> {
    this.ensureNotClosed();
    return this.objectService.create(
      className,
      properties,
      options?.vector,
      {
        className,
        properties,
        vector: options?.vector,
        id: options?.id,
        tenant: options?.tenant,
      }
    );
  }

  /**
   * Get an object by ID
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param options - Retrieval options
   * @returns Promise resolving to object or null if not found
   */
  async getObject(
    className: string,
    id: UUID,
    options?: { includeVector?: boolean; properties?: string[]; tenant?: string }
  ): Promise<WeaviateObject | null> {
    this.ensureNotClosed();
    return this.objectService.get({
      className,
      id,
      includeVector: options?.includeVector,
      properties: options?.properties,
      tenant: options?.tenant,
    });
  }

  /**
   * Update an object
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param properties - Properties to update
   * @param options - Update options
   * @returns Promise resolving to updated object
   */
  async updateObject(
    className: string,
    id: UUID,
    properties: Properties,
    options?: { vector?: Vector; merge?: boolean; tenant?: string }
  ): Promise<WeaviateObject> {
    this.ensureNotClosed();
    return this.objectService.update({
      className,
      id,
      properties,
      vector: options?.vector,
      merge: options?.merge,
      tenant: options?.tenant,
    });
  }

  /**
   * Delete an object
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param options - Deletion options
   */
  async deleteObject(
    className: string,
    id: UUID,
    options?: { tenant?: string }
  ): Promise<void> {
    this.ensureNotClosed();
    return this.objectService.delete({
      className,
      id,
      tenant: options?.tenant,
    });
  }

  /**
   * Check if an object exists
   *
   * @param className - Name of the class
   * @param id - Object UUID
   * @param tenant - Optional tenant name
   * @returns Promise resolving to true if exists
   */
  async exists(className: string, id: UUID, tenant?: string): Promise<boolean> {
    this.ensureNotClosed();
    return this.objectService.exists({ className, id, tenant });
  }

  // ==========================================================================
  // Search Operations
  // ==========================================================================

  /**
   * Vector similarity search
   *
   * @param className - Class to search
   * @param query - Near vector query
   * @returns Promise resolving to search results
   */
  async nearVector(className: string, query: Omit<NearVectorQuery, 'className'>): Promise<SearchResult> {
    this.ensureNotClosed();
    return this.searchService.nearVector(className, { ...query, className });
  }

  /**
   * Object similarity search
   *
   * @param className - Class to search
   * @param query - Near object query
   * @returns Promise resolving to search results
   */
  async nearObject(className: string, query: Omit<NearObjectQuery, 'className'>): Promise<SearchResult> {
    this.ensureNotClosed();
    return this.searchService.nearObject(className, { ...query, className });
  }

  /**
   * Semantic text search (requires vectorizer)
   *
   * @param className - Class to search
   * @param query - Near text query
   * @returns Promise resolving to search results
   */
  async nearText(className: string, query: Omit<NearTextQuery, 'className'>): Promise<SearchResult> {
    this.ensureNotClosed();
    return this.searchService.nearText(className, { ...query, className });
  }

  /**
   * Hybrid BM25 + vector search
   *
   * @param className - Class to search
   * @param query - Hybrid query
   * @returns Promise resolving to search results
   */
  async hybrid(className: string, query: Omit<HybridQuery, 'className'>): Promise<SearchResult> {
    this.ensureNotClosed();
    return this.searchService.hybrid(className, { ...query, className });
  }

  /**
   * BM25 keyword search
   *
   * @param className - Class to search
   * @param query - BM25 query
   * @returns Promise resolving to search results
   */
  async bm25(className: string, query: Omit<BM25Query, 'className'>): Promise<SearchResult> {
    this.ensureNotClosed();
    return this.searchService.bm25(className, { ...query, className });
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Batch create objects
   *
   * @param objects - Array of objects to create
   * @param options - Batch options
   * @returns Promise resolving to batch response
   */
  async batchCreate(
    objects: BatchObject[],
    options?: { batchSize?: number; continueOnError?: boolean }
  ): Promise<BatchResponse> {
    this.ensureNotClosed();
    return this.batchService.batchCreate(objects, options);
  }

  /**
   * Batch create with automatic retry
   *
   * @param objects - Array of objects to create
   * @param options - Retry options
   * @returns Promise resolving to batch result with retry details
   */
  async batchCreateWithRetry(
    objects: BatchObject[],
    options?: { batchSize?: number; maxRetries?: number }
  ): Promise<BatchResponse> {
    this.ensureNotClosed();
    return this.batchService.batchCreateWithRetry(objects, options);
  }

  /**
   * Batch delete by filter
   *
   * @param className - Class name
   * @param filter - Filter to select objects
   * @param options - Delete options
   * @returns Promise resolving to delete response
   */
  async batchDelete(
    className: string,
    filter: WhereFilter,
    options?: { dryRun?: boolean; tenant?: string }
  ): Promise<BatchDeleteResponse> {
    this.ensureNotClosed();
    return this.batchService.batchDelete({
      className,
      filter,
      dryRun: options?.dryRun,
      tenant: options?.tenant,
    });
  }

  // ==========================================================================
  // Aggregation
  // ==========================================================================

  /**
   * Execute aggregation query
   *
   * @param query - Aggregation query
   * @returns Promise resolving to aggregation result
   */
  async aggregate(query: AggregateQuery): Promise<AggregateResult> {
    this.ensureNotClosed();
    return this.aggregateService.aggregate(query);
  }

  /**
   * Count objects matching filter
   *
   * @param className - Class name
   * @param filter - Optional filter
   * @param tenant - Optional tenant
   * @returns Promise resolving to count
   */
  async count(className: string, filter?: WhereFilter, tenant?: string): Promise<number> {
    this.ensureNotClosed();
    return this.aggregateService.count(className, filter, tenant);
  }

  // ==========================================================================
  // References
  // ==========================================================================

  /**
   * Add a cross-reference
   *
   * @param fromClass - Source class
   * @param fromId - Source object ID
   * @param property - Property name
   * @param toClass - Target class
   * @param toId - Target object ID
   * @param options - Reference options
   */
  async addReference(
    fromClass: string,
    fromId: UUID,
    property: string,
    toClass: string,
    toId: UUID,
    options?: { tenant?: string }
  ): Promise<void> {
    this.ensureNotClosed();
    return this.referenceService.addReference(
      fromClass,
      fromId,
      property,
      toClass,
      toId,
      options
    );
  }

  /**
   * Delete a cross-reference
   *
   * @param fromClass - Source class
   * @param fromId - Source object ID
   * @param property - Property name
   * @param toClass - Target class
   * @param toId - Target object ID
   * @param options - Reference options
   */
  async deleteReference(
    fromClass: string,
    fromId: UUID,
    property: string,
    toClass: string,
    toId: UUID,
    options?: { tenant?: string }
  ): Promise<void> {
    this.ensureNotClosed();
    return this.referenceService.deleteReference(
      fromClass,
      fromId,
      property,
      toClass,
      toId,
      options
    );
  }

  /**
   * Update all references for a property
   *
   * @param fromClass - Source class
   * @param fromId - Source object ID
   * @param property - Property name
   * @param references - Array of references
   * @param options - Reference options
   */
  async updateReferences(
    fromClass: string,
    fromId: UUID,
    property: string,
    references: Reference[],
    options?: { tenant?: string }
  ): Promise<void> {
    this.ensureNotClosed();
    return this.referenceService.updateReferences(
      fromClass,
      fromId,
      property,
      references,
      options
    );
  }

  // ==========================================================================
  // Tenants
  // ==========================================================================

  /**
   * List all tenants for a class
   *
   * @param className - Class name
   * @returns Promise resolving to array of tenants
   */
  async listTenants(className: string): Promise<Tenant[]> {
    this.ensureNotClosed();
    return this.tenantService.listTenants(className);
  }

  /**
   * Get a specific tenant
   *
   * @param className - Class name
   * @param tenantName - Tenant name
   * @returns Promise resolving to tenant or null
   */
  async getTenant(className: string, tenantName: string): Promise<Tenant | null> {
    this.ensureNotClosed();
    return this.tenantService.getTenant(className, tenantName);
  }

  /**
   * Activate a tenant
   *
   * @param className - Class name
   * @param tenantName - Tenant name
   */
  async activateTenant(className: string, tenantName: string): Promise<void> {
    this.ensureNotClosed();
    return this.tenantService.activateTenant(className, tenantName);
  }

  /**
   * Deactivate a tenant
   *
   * @param className - Class name
   * @param tenantName - Tenant name
   */
  async deactivateTenant(className: string, tenantName: string): Promise<void> {
    this.ensureNotClosed();
    return this.tenantService.deactivateTenant(className, tenantName);
  }

  // ==========================================================================
  // Schema (Read-Only)
  // ==========================================================================

  /**
   * Get the complete schema
   *
   * @returns Promise resolving to schema
   */
  async getSchema(): Promise<Schema> {
    this.ensureNotClosed();
    return this.schemaService.getSchema();
  }

  /**
   * Get a class definition
   *
   * @param className - Class name
   * @returns Promise resolving to class definition or null
   */
  async getClass(className: string): Promise<ClassDefinition | null> {
    this.ensureNotClosed();
    return this.schemaService.getClass(className);
  }

  /**
   * List all class names
   *
   * @returns Promise resolving to array of class names
   */
  async listClasses(): Promise<string[]> {
    this.ensureNotClosed();
    return this.schemaService.listClasses();
  }

  /**
   * Get shard information for a class
   *
   * @param className - Class name
   * @returns Promise resolving to array of shard info
   */
  async getShards(className: string): Promise<ShardInfo[]> {
    this.ensureNotClosed();
    return this.schemaService.getShards(className);
  }

  /**
   * Invalidate schema cache
   *
   * @param className - Optional class name (invalidates all if not provided)
   */
  invalidateSchemaCache(className?: string): void {
    if (className) {
      this.schemaCache.invalidate(className);
    } else {
      this.schemaCache.clear();
    }
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Perform health check
   *
   * @returns Promise resolving to health status
   */
  async healthCheck(): Promise<HealthStatus> {
    return healthCheck({
      transport: this.transport,
      schemaCache: this._schemaCache,
      resilience: this._resilience,
    });
  }

  /**
   * Close the client and cleanup resources
   */
  async close(): Promise<void> {
    if (this.state === State.Closed) {
      return;
    }

    // Clear caches
    this._schemaCache?.clear();

    // Mark as closed
    this.state = State.Closed;
  }

  /**
   * Ensure client is not closed
   */
  private ensureNotClosed(): void {
    if (this.state === State.Closed) {
      throw new Error('Client has been closed');
    }
    if (this.state === State.Initialized) {
      this.state = State.Connected;
    }
  }
}
