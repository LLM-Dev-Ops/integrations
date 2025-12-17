/**
 * HubSpot Client
 *
 * Main entry point for the HubSpot API integration.
 * Provides a clean interface for CRM operations, batch processing,
 * search, associations, and webhook handling.
 */

import type { HubSpotConfig, Tokens } from './types/config.js';
import type {
  ObjectType,
  CrmObject,
  Properties,
  GetOptions,
  AssociationInput,
} from './types/objects.js';
import type { BatchResult, BatchOptions } from './types/batch.js';
import type { SearchQuery, SearchResult, FilterClause } from './types/search.js';
import type { RateLimitStatus } from './types/rate-limit.js';
import type { Pipeline, PipelineStage } from './types/pipelines.js';
import type { Engagement, EngagementType, EngagementProperties } from './types/engagements.js';
import type { WebhookHandler } from './types/webhooks.js';
import type { HttpRequestOptions, HttpResponse } from './http/client.js';

import { HttpClient } from './http/client.js';
import { RateLimiter } from './rate-limiter.js';
import { TokenManager } from './token-manager.js';
import { WebhookProcessor, type WebhookProcessorConfig } from './webhooks/processor.js';
import { parseHubSpotError } from './error-parser.js';

// Import operations
import {
  createObject,
  getObject,
  updateObject,
  deleteObject,
} from './operations/objects.js';
import {
  batchCreate,
  batchRead,
  batchUpdate,
  batchArchive,
} from './operations/batch.js';
import {
  searchObjects,
  searchAll,
  searchByEmail,
  searchByDomain,
} from './operations/search.js';
import {
  createAssociation,
  getAssociations,
  deleteAssociation,
  batchAssociate,
} from './operations/associations.js';
import {
  getPipelines,
  getPipelineStages,
  moveToPipelineStage,
} from './operations/pipelines.js';
import {
  createEngagement,
  getEngagement,
  updateEngagement,
  deleteEngagement,
  createNote,
  createTask,
  logCall,
} from './operations/engagements.js';

/**
 * Logger interface (minimal)
 */
interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * No-op logger
 */
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  baseUrl: 'https://api.hubapi.com',
  apiVersion: 'v3',
  timeout: 30000,
  maxRetries: 3,
  dailyLimit: 500000,
  burstLimit: 100,
  searchLimit: 4,
  rateLimitBuffer: 0.1,
  batchSize: 100,
};

/**
 * HubSpotClient provides a unified interface to the HubSpot CRM API
 *
 * Features:
 * - CRM object CRUD operations (contacts, companies, deals, tickets)
 * - Batch operations with automatic chunking
 * - Search with filters and pagination
 * - Association management
 * - Pipeline operations
 * - Engagement tracking (notes, calls, meetings, tasks)
 * - Webhook processing with signature validation
 * - Rate limiting with token bucket algorithm
 * - OAuth token management with automatic refresh
 *
 * @example
 * ```typescript
 * const client = new HubSpotClient({
 *   accessToken: 'your-access-token',
 *   portalId: 'your-portal-id',
 * });
 *
 * // Create a contact
 * const contact = await client.contacts.create({
 *   email: 'john@example.com',
 *   firstname: 'John',
 *   lastname: 'Doe',
 * });
 *
 * // Search for contacts
 * const results = await client.contacts.search({
 *   filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN', value: '@example.com' }],
 * });
 * ```
 */
export class HubSpotClient {
  private readonly config: Required<Omit<HubSpotConfig, 'refreshToken' | 'clientId' | 'clientSecret' | 'webhookSecret' | 'logger' | 'metrics' | 'onTokenRefresh'>> & Partial<Pick<HubSpotConfig, 'refreshToken' | 'clientId' | 'clientSecret' | 'webhookSecret' | 'logger' | 'metrics' | 'onTokenRefresh'>>;
  private readonly httpClient: HttpClient;
  private readonly rateLimiter: RateLimiter;
  private readonly tokenManager: TokenManager;
  private readonly logger: Logger;
  private webhookProcessor?: WebhookProcessor;

  /**
   * Contacts API operations
   */
  readonly contacts: ObjectOperations;

  /**
   * Companies API operations
   */
  readonly companies: ObjectOperations;

  /**
   * Deals API operations
   */
  readonly deals: ObjectOperations;

  /**
   * Tickets API operations
   */
  readonly tickets: ObjectOperations;

  /**
   * Create a new HubSpotClient instance
   *
   * @param config - Client configuration
   */
  constructor(config: HubSpotConfig) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.logger = config.logger ?? noopLogger;

    // Initialize HTTP client
    this.httpClient = new HttpClient({
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      retries: this.config.maxRetries,
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      dailyLimit: this.config.dailyLimit,
      burstLimit: this.config.burstLimit,
      searchLimit: this.config.searchLimit,
      buffer: this.config.rateLimitBuffer,
    });

    // Initialize token manager
    this.tokenManager = new TokenManager({
      accessToken: this.config.accessToken,
      refreshToken: this.config.refreshToken,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      onRefresh: this.config.onTokenRefresh,
    });

    // Initialize webhook processor if secret provided
    if (this.config.webhookSecret) {
      this.webhookProcessor = new WebhookProcessor({
        webhookSecret: this.config.webhookSecret,
        logger: this.logger,
      });
    }

    // Initialize object-specific APIs
    this.contacts = this.createObjectOperations('contacts');
    this.companies = this.createObjectOperations('companies');
    this.deals = this.createObjectOperations('deals');
    this.tickets = this.createObjectOperations('tickets');
  }

  // ==================== Core Request Methods ====================

  /**
   * Execute an authenticated request to the HubSpot API
   *
   * @param options - HTTP request options
   * @returns HTTP response
   */
  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    // Get valid token
    const token = await this.tokenManager.getValidToken();

    // Wait for rate limit slot
    const isSearch = options.endpoint.includes('/search');
    await this.rateLimiter.waitForSlot(isSearch ? 'search' : 'standard');

    try {
      const response = await this.httpClient.request<T>(options, token);

      // Update rate limits from response headers
      if (response.headers) {
        const headers = new Headers();
        Object.entries(response.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });
        this.rateLimiter.handleRateLimitResponse(headers);
      }

      return response;
    } catch (error) {
      // Parse and throw appropriate error
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const httpError = error as { statusCode: number; headers?: Record<string, string>; body?: unknown };
        throw parseHubSpotError({
          statusCode: httpError.statusCode,
          headers: httpError.headers ?? {},
          body: httpError.body,
          endpoint: options.endpoint,
        });
      }
      throw error;
    }
  }

  // ==================== Generic Object Operations ====================

  /**
   * Create a CRM object
   */
  async create(
    objectType: ObjectType,
    properties: Properties,
    associations?: AssociationInput[]
  ): Promise<CrmObject> {
    return createObject(
      (opts) => this.request(opts),
      this.config.apiVersion,
      objectType,
      properties,
      associations
    );
  }

  /**
   * Get a CRM object by ID
   */
  async get(
    objectType: ObjectType,
    objectId: string,
    options?: GetOptions
  ): Promise<CrmObject> {
    return getObject(
      (opts) => this.request(opts),
      this.config.apiVersion,
      objectType,
      objectId,
      options
    );
  }

  /**
   * Update a CRM object
   */
  async update(
    objectType: ObjectType,
    objectId: string,
    properties: Properties
  ): Promise<CrmObject> {
    return updateObject(
      (opts) => this.request(opts),
      this.config.apiVersion,
      objectType,
      objectId,
      properties
    );
  }

  /**
   * Delete a CRM object
   */
  async delete(objectType: ObjectType, objectId: string): Promise<void> {
    return deleteObject(
      (opts) => this.request(opts),
      this.config.apiVersion,
      objectType,
      objectId
    );
  }

  // ==================== Batch Operations ====================

  /**
   * Batch namespace for bulk operations
   */
  readonly batch = {
    /**
     * Create multiple objects in batch
     */
    create: async (
      objectType: ObjectType,
      inputs: Array<{ properties: Properties; associations?: AssociationInput[] }>,
      options?: BatchOptions
    ): Promise<BatchResult> => {
      return batchCreate(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType,
        inputs,
        options?.chunkSize ?? this.config.batchSize
      );
    },

    /**
     * Read multiple objects by ID
     */
    read: async (
      objectType: ObjectType,
      ids: string[],
      properties?: string[]
    ): Promise<BatchResult> => {
      return batchRead(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType,
        ids,
        properties
      );
    },

    /**
     * Update multiple objects
     */
    update: async (
      objectType: ObjectType,
      inputs: Array<{ id: string; properties: Properties }>,
      options?: BatchOptions
    ): Promise<BatchResult> => {
      return batchUpdate(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType,
        inputs,
        options?.chunkSize ?? this.config.batchSize
      );
    },

    /**
     * Archive multiple objects
     */
    archive: async (
      objectType: ObjectType,
      ids: string[],
      options?: BatchOptions
    ): Promise<void> => {
      return batchArchive(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType,
        ids,
        options?.chunkSize ?? this.config.batchSize
      );
    },
  };

  // ==================== Search Operations ====================

  /**
   * Search for CRM objects
   */
  async search(
    objectType: ObjectType,
    query: SearchQuery
  ): Promise<SearchResult> {
    return searchObjects(
      (opts) => this.request(opts),
      this.config.apiVersion,
      objectType,
      query
    );
  }

  /**
   * Search all matching objects (auto-pagination)
   */
  async *searchAll(
    objectType: ObjectType,
    query: SearchQuery
  ): AsyncGenerator<CrmObject, void, unknown> {
    yield* searchAll(
      (opts) => this.request(opts),
      this.config.apiVersion,
      objectType,
      query
    );
  }

  // ==================== Association Operations ====================

  /**
   * Associations namespace for relationship management
   */
  readonly associations = {
    /**
     * Create an association between objects
     */
    create: async (
      fromType: ObjectType,
      fromId: string,
      toType: ObjectType,
      toId: string,
      associationType: string
    ): Promise<void> => {
      return createAssociation(
        (opts) => this.request(opts),
        this.config.apiVersion,
        fromType,
        fromId,
        toType,
        toId,
        associationType
      );
    },

    /**
     * Get associations for an object
     */
    get: async (
      fromType: ObjectType,
      fromId: string,
      toType: ObjectType
    ): Promise<string[]> => {
      return getAssociations(
        (opts) => this.request(opts),
        this.config.apiVersion,
        fromType,
        fromId,
        toType
      );
    },

    /**
     * Delete an association between objects
     */
    delete: async (
      fromType: ObjectType,
      fromId: string,
      toType: ObjectType,
      toId: string,
      associationType: string
    ): Promise<void> => {
      return deleteAssociation(
        (opts) => this.request(opts),
        this.config.apiVersion,
        fromType,
        fromId,
        toType,
        toId,
        associationType
      );
    },

    /**
     * Batch create associations
     */
    batchCreate: async (
      fromType: ObjectType,
      toType: ObjectType,
      inputs: Array<{ fromId: string; toId: string; type: string }>
    ): Promise<void> => {
      return batchAssociate(
        (opts) => this.request(opts),
        this.config.apiVersion,
        fromType,
        toType,
        inputs
      );
    },
  };

  // ==================== Pipeline Operations ====================

  /**
   * Pipelines namespace for deal/ticket pipeline management
   */
  readonly pipelines = {
    /**
     * Get all pipelines for an object type
     */
    list: async (objectType: 'deals' | 'tickets'): Promise<Pipeline[]> => {
      return getPipelines(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType
      );
    },

    /**
     * Get stages for a pipeline
     */
    getStages: async (
      objectType: 'deals' | 'tickets',
      pipelineId: string
    ): Promise<PipelineStage[]> => {
      return getPipelineStages(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType,
        pipelineId
      );
    },

    /**
     * Move an object to a different pipeline stage
     */
    moveToStage: async (
      objectType: 'deals' | 'tickets',
      objectId: string,
      pipelineId: string,
      stageId: string
    ): Promise<CrmObject> => {
      return moveToPipelineStage(
        (opts) => this.request(opts),
        this.config.apiVersion,
        objectType,
        objectId,
        pipelineId,
        stageId
      );
    },
  };

  // ==================== Engagement Operations ====================

  /**
   * Engagements namespace for notes, calls, meetings, tasks
   */
  readonly engagements = {
    /**
     * Create an engagement
     */
    create: async (
      type: EngagementType,
      properties: EngagementProperties,
      associations?: AssociationInput[]
    ): Promise<Engagement> => {
      return createEngagement(
        (opts) => this.request(opts),
        this.config.apiVersion,
        type,
        properties,
        associations
      );
    },

    /**
     * Get an engagement by ID
     */
    get: async (type: EngagementType, engagementId: string): Promise<Engagement> => {
      return getEngagement(
        (opts) => this.request(opts),
        this.config.apiVersion,
        type,
        engagementId
      );
    },

    /**
     * Update an engagement
     */
    update: async (
      type: EngagementType,
      engagementId: string,
      properties: Partial<EngagementProperties>
    ): Promise<Engagement> => {
      return updateEngagement(
        (opts) => this.request(opts),
        this.config.apiVersion,
        type,
        engagementId,
        properties
      );
    },

    /**
     * Delete an engagement
     */
    delete: async (type: EngagementType, engagementId: string): Promise<void> => {
      return deleteEngagement(
        (opts) => this.request(opts),
        this.config.apiVersion,
        type,
        engagementId
      );
    },

    /**
     * Create a note
     */
    createNote: async (
      body: string,
      associations?: AssociationInput[]
    ): Promise<Engagement> => {
      return createNote(
        (opts) => this.request(opts),
        this.config.apiVersion,
        body,
        associations
      );
    },

    /**
     * Create a task
     */
    createTask: async (
      subject: string,
      dueDate?: Date,
      associations?: AssociationInput[]
    ): Promise<Engagement> => {
      return createTask(
        (opts) => this.request(opts),
        this.config.apiVersion,
        subject,
        dueDate,
        associations
      );
    },

    /**
     * Log a call
     */
    logCall: async (
      durationMs: number,
      body?: string,
      associations?: AssociationInput[]
    ): Promise<Engagement> => {
      return logCall(
        (opts) => this.request(opts),
        this.config.apiVersion,
        durationMs,
        body,
        associations
      );
    },
  };

  // ==================== Webhook Operations ====================

  /**
   * Webhooks namespace for event processing
   */
  readonly webhooks = {
    /**
     * Register a webhook handler
     */
    on: (pattern: string, handler: WebhookHandler): void => {
      if (!this.webhookProcessor) {
        throw new Error('Webhook secret not configured');
      }
      this.webhookProcessor.on(pattern, handler);
    },

    /**
     * Remove a webhook handler
     */
    off: (pattern: string, handler?: WebhookHandler): void => {
      if (!this.webhookProcessor) {
        throw new Error('Webhook secret not configured');
      }
      this.webhookProcessor.off(pattern, handler);
    },

    /**
     * Process an incoming webhook request
     */
    process: async (request: {
      method: string;
      url: string;
      body: string;
      headers: Record<string, string>;
    }) => {
      if (!this.webhookProcessor) {
        throw new Error('Webhook secret not configured');
      }
      return this.webhookProcessor.process(request);
    },
  };

  // ==================== Utility Methods ====================

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    return this.rateLimiter.getStatus();
  }

  /**
   * Get portal ID
   */
  getPortalId(): string {
    return this.config.portalId;
  }

  // ==================== Private Helper Methods ====================

  /**
   * Create object-specific operations interface
   */
  private createObjectOperations(objectType: ObjectType): ObjectOperations {
    return {
      create: (properties: Properties, associations?: AssociationInput[]) =>
        this.create(objectType, properties, associations),

      get: (objectId: string, options?: GetOptions) =>
        this.get(objectType, objectId, options),

      update: (objectId: string, properties: Properties) =>
        this.update(objectType, objectId, properties),

      delete: (objectId: string) =>
        this.delete(objectType, objectId),

      search: (query: SearchQuery) =>
        this.search(objectType, query),

      searchAll: (query: SearchQuery) =>
        this.searchAll(objectType, query),

      findByEmail: async (email: string) => {
        const results = await searchByEmail(
          (opts) => this.request(opts),
          this.config.apiVersion,
          objectType,
          email
        );
        return results.results[0] ?? null;
      },

      findByDomain: async (domain: string) => {
        const results = await searchByDomain(
          (opts) => this.request(opts),
          this.config.apiVersion,
          objectType,
          domain
        );
        return results.results;
      },
    };
  }
}

/**
 * Object-specific operations interface
 */
interface ObjectOperations {
  create(properties: Properties, associations?: AssociationInput[]): Promise<CrmObject>;
  get(objectId: string, options?: GetOptions): Promise<CrmObject>;
  update(objectId: string, properties: Properties): Promise<CrmObject>;
  delete(objectId: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  searchAll(query: SearchQuery): AsyncGenerator<CrmObject, void, unknown>;
  findByEmail(email: string): Promise<CrmObject | null>;
  findByDomain(domain: string): Promise<CrmObject[]>;
}

// Re-export for convenience
export type { HubSpotConfig, ObjectOperations };
