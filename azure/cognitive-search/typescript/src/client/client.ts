/**
 * Azure Cognitive Search Client
 *
 * Main client class providing unified access to all search and document operations.
 */

import type { AcsConfig, NormalizedAcsConfig } from './config.js';
import { normalizeConfig, configFromEnv } from './config.js';
import type { AuthProvider } from '../auth/index.js';
import { createAuthProvider } from '../auth/index.js';
import { HttpTransport, createTransport } from '../transport/index.js';
import { SearchService, createSearchService } from '../services/search.js';
import { DocumentService, createDocumentService } from '../services/documents.js';
import { IndexService, createIndexService } from '../services/indexes.js';
import type { VectorStoreConfig } from '../vector-store/types.js';
import { AcsVectorStore, createVectorStore } from '../vector-store/store.js';
import { IndexBoundSearchBuilder } from '../query/builder.js';
import { ResilientExecutor, createResilientExecutor } from '../resilience/index.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Azure Cognitive Search client interface
 */
export interface AcsClient {
  /** Search service for queries */
  readonly search: SearchService;
  /** Document service for indexing */
  readonly documents: DocumentService;
  /** Index service for metadata */
  readonly indexes: IndexService;

  /** Get current configuration */
  getConfig(): Readonly<NormalizedAcsConfig>;

  /** Get a fluent search builder for an index */
  inIndex(index: string): IndexBoundSearchBuilder;

  /** Create a VectorStore instance for an index */
  asVectorStore(config: VectorStoreConfig): AcsVectorStore;
}

/**
 * Azure Cognitive Search client implementation
 */
export class AcsClientImpl implements AcsClient {
  public readonly search: SearchService;
  public readonly documents: DocumentService;
  public readonly indexes: IndexService;

  private readonly config: NormalizedAcsConfig;
  private readonly authProvider: AuthProvider;
  private readonly transport: HttpTransport;
  private readonly resilientExecutor: ResilientExecutor;

  constructor(config: AcsConfig) {
    try {
      this.config = normalizeConfig(config);
    } catch (error) {
      throw new ConfigurationError({
        message: error instanceof Error ? error.message : 'Invalid configuration',
        cause: error instanceof Error ? error : undefined,
      });
    }

    try {
      this.authProvider = createAuthProvider(this.config.apiKey, this.config.azureAdCredentials);
    } catch (error) {
      throw new ConfigurationError({
        message: error instanceof Error ? error.message : 'Invalid authentication configuration',
        cause: error instanceof Error ? error : undefined,
      });
    }

    // Initialize transport
    this.transport = createTransport(this.config, this.authProvider);

    // Initialize resilient executor
    this.resilientExecutor = createResilientExecutor(
      this.config.retryConfig,
      this.config.circuitBreakerConfig
    );

    // Initialize services
    this.search = createSearchService(this.transport);
    this.documents = createDocumentService(this.transport);
    this.indexes = createIndexService(this.transport);
  }

  /** Get current configuration (read-only copy) */
  getConfig(): Readonly<NormalizedAcsConfig> {
    return { ...this.config };
  }

  /** Get a fluent search builder for an index */
  inIndex(index: string): IndexBoundSearchBuilder {
    return new IndexBoundSearchBuilder(this.search, index);
  }

  /** Create a VectorStore instance for an index */
  asVectorStore(config: VectorStoreConfig): AcsVectorStore {
    return createVectorStore(this.search, this.documents, config);
  }
}

/**
 * Create an Azure Cognitive Search client with the given configuration
 */
export function createClient(config: AcsConfig): AcsClient {
  return new AcsClientImpl(config);
}

/**
 * Create an Azure Cognitive Search client from environment variables
 */
export function createClientFromEnv(): AcsClient {
  return new AcsClientImpl(configFromEnv());
}

/**
 * Builder for creating Azure Cognitive Search clients
 */
export class AcsClientBuilder {
  private config: Partial<AcsConfig> = {};

  /** Set service name */
  serviceName(name: string): this {
    this.config.serviceName = name;
    return this;
  }

  /** Set API key */
  apiKey(key: string): this {
    this.config.apiKey = key;
    return this;
  }

  /** Set Azure AD credentials */
  azureAd(tenantId: string, clientId: string, clientSecret?: string): this {
    this.config.azureAdCredentials = {
      tenantId,
      clientId,
      clientSecret,
    };
    return this;
  }

  /** Set managed identity */
  managedIdentity(clientId?: string): this {
    this.config.azureAdCredentials = {
      tenantId: '',
      clientId: clientId ?? '',
      useManagedIdentity: true,
    };
    return this;
  }

  /** Set API version */
  apiVersion(version: '2024-07-01' | '2023-11-01' | '2023-07-01-Preview'): this {
    this.config.apiVersion = version;
    return this;
  }

  /** Set request timeout */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /** Set retry configuration */
  retry(config: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }): this {
    this.config.retryConfig = config;
    return this;
  }

  /** Set circuit breaker configuration */
  circuitBreaker(config: { failureThreshold?: number; successThreshold?: number; resetTimeoutMs?: number }): this {
    this.config.circuitBreakerConfig = config;
    return this;
  }

  /** Build the client */
  build(): AcsClient {
    if (!this.config.serviceName) {
      throw new ConfigurationError({ message: 'Service name is required' });
    }
    return createClient(this.config as AcsConfig);
  }
}

/** Create a client builder */
export function builder(): AcsClientBuilder {
  return new AcsClientBuilder();
}
