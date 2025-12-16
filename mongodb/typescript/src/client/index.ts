/**
 * MongoDB client core implementation following SPARC specification.
 *
 * Provides a thin adapter layer over the MongoDB Node.js driver with connection
 * management, observability, and resilience orchestration.
 */

import {
  MongoClient,
  Db,
  Collection,
  MongoClientOptions,
  ReadPreference,
  WriteConcern,
  ReadConcern,
  ServerHeartbeatFailedEvent,
  ServerHeartbeatSucceededEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolClosedEvent,
  ConnectionCreatedEvent,
  ConnectionClosedEvent,
  Document as MongoDocument,
} from 'mongodb';

import { MongoDBConfig, MongoDBConfigBuilder } from '../config/index.js';
import {
  MongoDBError,
  parseMongoDBError,
  ConnectionFailedError,
  ConnectionTimeoutError,
} from '../errors/index.js';
import { ResilienceOrchestrator } from '../resilience/index.js';
import {
  Observability,
  createNoopObservability,
  MetricNames,
  Logger,
  MetricsCollector,
  Tracer,
} from '../observability/index.js';
import { Document } from '../types/index.js';

// ============================================================================
// Collection Information Types
// ============================================================================

/**
 * Collection information returned by listCollections.
 */
export interface CollectionInfo {
  name: string;
  type: 'collection' | 'view';
  options: Record<string, unknown>;
  info?: {
    readOnly?: boolean;
    uuid?: string;
  };
  idIndex?: Record<string, unknown>;
}

/**
 * Options for creating collections.
 */
export interface CreateCollectionOptions {
  capped?: boolean;
  size?: number;
  max?: number;
  validationLevel?: 'off' | 'strict' | 'moderate';
  validationAction?: 'error' | 'warn';
  validator?: Record<string, unknown>;
  collation?: Record<string, unknown>;
  timeseries?: {
    timeField: string;
    metaField?: string;
    granularity?: 'seconds' | 'minutes' | 'hours';
  };
  expireAfterSeconds?: number;
  changeStreamPreAndPostImages?: {
    enabled: boolean;
  };
}

/**
 * Database statistics.
 */
export interface DatabaseStats {
  db: string;
  collections: number;
  views: number;
  objects: number;
  avgObjSize: number;
  dataSize: number;
  storageSize: number;
  indexes: number;
  indexSize: number;
  totalSize: number;
  scaleFactor: number;
  ok: number;
}

// ============================================================================
// MongoDB Collection Wrapper
// ============================================================================

/**
 * Wrapper for MongoDB collection - delegates operations to service layer.
 * This is a thin adapter that provides access to the underlying driver collection.
 */
export class MongoDBCollection<T extends Document = Document> {
  private readonly collection: Collection<T>;
  private readonly client: MongoDBClient;

  constructor(collection: Collection<T>, client: MongoDBClient) {
    this.collection = collection;
    this.client = client;
  }

  /**
   * Gets the collection name.
   */
  get name(): string {
    return this.collection.collectionName;
  }

  /**
   * Gets the database name.
   */
  get databaseName(): string {
    return this.collection.dbName;
  }

  /**
   * Gets the underlying MongoDB driver collection.
   * Use this for operations not wrapped by the service layer.
   */
  getDriverCollection(): Collection<T> {
    return this.collection;
  }

  /**
   * Gets the client reference.
   */
  getClient(): MongoDBClient {
    return this.client;
  }
}

// ============================================================================
// MongoDB Database Wrapper
// ============================================================================

/**
 * Wrapper for MongoDB database operations.
 */
export class MongoDBDatabase {
  private readonly database: Db;
  private readonly client: MongoDBClient;

  constructor(db: Db, client: MongoDBClient) {
    this.database = db;
    this.client = client;
  }

  /**
   * Gets the database name.
   */
  get name(): string {
    return this.database.databaseName;
  }

  /**
   * Gets a collection wrapper.
   */
  collection<T extends Document = Document>(name: string): MongoDBCollection<T> {
    const collection = this.database.collection<T>(name);
    return new MongoDBCollection(collection, this.client);
  }

  /**
   * Lists all collections in the database.
   */
  async listCollections(): Promise<CollectionInfo[]> {
    return this.client.tracer.withSpan(
      'mongodb.listCollections',
      async (span) => {
        span.setAttribute('db.name', this.name);

        try {
          const collections = await this.database.listCollections().toArray();
          const result = collections.map((col: any) => ({
            name: col.name,
            type: col.type as 'collection' | 'view',
            options: col.options || {},
            info: col.info,
            idIndex: col.idIndex,
          }));

          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'listCollections',
            database: this.name,
          });

          span.setStatus('OK');
          return result;
        } catch (error) {
          const mongoError = parseMongoDBError(error);
          span.recordException(mongoError);
          this.client.logger.error('Failed to list collections', {
            database: this.name,
            error: mongoError.message,
          });
          throw mongoError;
        }
      },
      { 'db.operation': 'listCollections' }
    );
  }

  /**
   * Creates a new collection.
   */
  async createCollection(name: string, options?: CreateCollectionOptions): Promise<void> {
    return this.client.tracer.withSpan(
      'mongodb.createCollection',
      async (span) => {
        span.setAttribute('db.name', this.name);
        span.setAttribute('collection.name', name);

        try {
          await this.database.createCollection(name, options as any);

          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'createCollection',
            database: this.name,
          });

          this.client.logger.info('Collection created', {
            database: this.name,
            collection: name,
          });

          span.setStatus('OK');
        } catch (error) {
          const mongoError = parseMongoDBError(error);
          span.recordException(mongoError);
          this.client.logger.error('Failed to create collection', {
            database: this.name,
            collection: name,
            error: mongoError.message,
          });
          throw mongoError;
        }
      },
      { 'db.operation': 'createCollection' }
    );
  }

  /**
   * Drops a collection.
   * @returns true if the collection was dropped, false if it didn't exist
   */
  async dropCollection(name: string): Promise<boolean> {
    return this.client.tracer.withSpan(
      'mongodb.dropCollection',
      async (span) => {
        span.setAttribute('db.name', this.name);
        span.setAttribute('collection.name', name);

        try {
          const result = await this.database.dropCollection(name);

          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'dropCollection',
            database: this.name,
          });

          this.client.logger.info('Collection dropped', {
            database: this.name,
            collection: name,
          });

          span.setStatus('OK');
          return result;
        } catch (error) {
          const mongoError = parseMongoDBError(error);
          // If collection doesn't exist, return false instead of throwing
          if (mongoError.message.includes('ns not found')) {
            span.setStatus('OK');
            return false;
          }
          span.recordException(mongoError);
          this.client.logger.error('Failed to drop collection', {
            database: this.name,
            collection: name,
            error: mongoError.message,
          });
          throw mongoError;
        }
      },
      { 'db.operation': 'dropCollection' }
    );
  }

  /**
   * Runs a raw database command.
   */
  async command(command: MongoDocument): Promise<MongoDocument> {
    return this.client.tracer.withSpan(
      'mongodb.command',
      async (span) => {
        span.setAttribute('db.name', this.name);

        try {
          const result = await this.database.command(command);

          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'command',
            database: this.name,
          });

          span.setStatus('OK');
          return result;
        } catch (error) {
          const mongoError = parseMongoDBError(error);
          span.recordException(mongoError);
          this.client.logger.error('Database command failed', {
            database: this.name,
            error: mongoError.message,
          });
          throw mongoError;
        }
      },
      { 'db.operation': 'command' }
    );
  }

  /**
   * Gets database statistics.
   */
  async stats(): Promise<DatabaseStats> {
    return this.client.tracer.withSpan(
      'mongodb.stats',
      async (span) => {
        span.setAttribute('db.name', this.name);

        try {
          const stats = await this.database.stats();

          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'stats',
            database: this.name,
          });

          span.setStatus('OK');
          return stats as DatabaseStats;
        } catch (error) {
          const mongoError = parseMongoDBError(error);
          span.recordException(mongoError);
          this.client.logger.error('Failed to get database stats', {
            database: this.name,
            error: mongoError.message,
          });
          throw mongoError;
        }
      },
      { 'db.operation': 'stats' }
    );
  }

  /**
   * Gets the underlying MongoDB driver database.
   */
  getDriverDatabase(): Db {
    return this.database;
  }
}

// ============================================================================
// MongoDB Client
// ============================================================================

/**
 * MongoDB client with resilience and observability.
 * Thin adapter layer over the MongoDB Node.js driver.
 */
export class MongoDBClient {
  private readonly config: MongoDBConfig;
  private client: MongoClient | null = null;
  private readonly observability: Observability;
  private readonly resilience: ResilienceOrchestrator;
  private connected: boolean = false;

  constructor(config: MongoDBConfig, observability?: Observability) {
    this.config = config;
    this.observability = observability ?? createNoopObservability();
    this.resilience = new ResilienceOrchestrator(
      config.rateLimitConfig,
      config.circuitBreakerConfig,
      config.retryConfig,
      {
        onRetry: (attempt, error, delayMs) => {
          this.observability.logger.warn('Retrying MongoDB operation', {
            attempt,
            error: error.message,
            delayMs,
          });
          this.observability.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'retry',
            attempt: String(attempt),
          });
        },
        onRetriesExhausted: (error, attempts) => {
          this.observability.logger.error('MongoDB retries exhausted', {
            error: error.message,
            attempts,
          });
        },
      }
    );
  }

  /**
   * Gets the logger instance.
   */
  get logger(): Logger {
    return this.observability.logger;
  }

  /**
   * Gets the metrics collector instance.
   */
  get metrics(): MetricsCollector {
    return this.observability.metrics;
  }

  /**
   * Gets the tracer instance.
   */
  get tracer(): Tracer {
    return this.observability.tracer;
  }

  /**
   * Gets the configuration.
   */
  get configuration(): MongoDBConfig {
    return this.config;
  }

  /**
   * Establishes connection to MongoDB.
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      this.logger.debug('Already connected to MongoDB');
      return;
    }

    return this.tracer.withSpan('mongodb.connect', async (span) => {
      try {
        const options = this.buildConnectionOptions();
        const uri = this.config.connectionUri.expose();

        this.logger.info('Connecting to MongoDB', {
          defaultDatabase: this.config.defaultDatabase,
        });

        this.client = new MongoClient(uri, options);

        // Set up event listeners
        this.setupEventListeners();

        // Connect with timeout
        const connectPromise = this.client.connect();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new ConnectionTimeoutError(this.config.connectionOptions.connectTimeoutMs));
          }, this.config.connectionOptions.connectTimeoutMs);
        });

        await Promise.race([connectPromise, timeoutPromise]);

        this.connected = true;

        this.logger.info('Successfully connected to MongoDB');
        this.metrics.increment(MetricNames.CONNECTIONS_ACTIVE, 1);
        this.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
          operation: 'connect',
          status: 'success',
        });

        span.setStatus('OK');
      } catch (error) {
        const mongoError = error instanceof MongoDBError
          ? error
          : new ConnectionFailedError(String(error), error as Error);

        this.logger.error('Failed to connect to MongoDB', {
          error: mongoError.message,
        });

        this.metrics.increment(MetricNames.CONNECTION_ERRORS, 1);
        this.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
          operation: 'connect',
          status: 'error',
        });

        span.recordException(mongoError);
        throw mongoError;
      }
    });
  }

  /**
   * Gracefully disconnects from MongoDB.
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      this.logger.debug('No active connection to disconnect');
      return;
    }

    return this.tracer.withSpan('mongodb.disconnect', async (span) => {
      try {
        this.logger.info('Disconnecting from MongoDB');

        await this.client!.close();
        this.client = null;
        this.connected = false;

        this.logger.info('Successfully disconnected from MongoDB');
        this.metrics.increment(MetricNames.CONNECTIONS_ACTIVE, -1);

        span.setStatus('OK');
      } catch (error) {
        const mongoError = parseMongoDBError(error);
        this.logger.error('Error during disconnect', {
          error: mongoError.message,
        });
        span.recordException(mongoError);
        throw mongoError;
      }
    });
  }

  /**
   * Checks if the client is connected.
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Gets a database wrapper.
   * @param name - Database name (defaults to configured default database)
   */
  getDatabase(name?: string): MongoDBDatabase {
    if (!this.client) {
      throw new ConnectionFailedError('Not connected to MongoDB', new Error('Client not initialized'));
    }

    const dbName = name ?? this.config.defaultDatabase;
    const db = this.client.db(dbName);
    return new MongoDBDatabase(db, this);
  }

  /**
   * Gets a collection wrapper (convenience method).
   * @param name - Collection name
   * @param database - Database name (optional, defaults to configured default)
   */
  getCollection<T extends Document = Document>(name: string, database?: string): MongoDBCollection<T> {
    const db = this.getDatabase(database);
    return db.collection<T>(name);
  }

  /**
   * Gets the underlying MongoDB driver client.
   * Use with caution - bypasses observability and resilience.
   */
  getClient(): MongoClient {
    if (!this.client) {
      throw new ConnectionFailedError('Not connected to MongoDB', new Error('Client not initialized'));
    }
    return this.client;
  }

  /**
   * Gets resilience statistics.
   */
  getResilienceStats(): ReturnType<ResilienceOrchestrator['getStats']> {
    return this.resilience.getStats();
  }

  /**
   * Resets resilience state (use with caution).
   */
  resetResilience(): void {
    this.resilience.reset();
  }

  /**
   * Builds MongoDB connection options from configuration.
   */
  private buildConnectionOptions(): MongoClientOptions {
    const connOpts = this.config.connectionOptions;

    const options: MongoClientOptions = {
      maxPoolSize: connOpts.maxPoolSize,
      minPoolSize: connOpts.minPoolSize,
      maxIdleTimeMS: connOpts.maxIdleTimeMs,
      connectTimeoutMS: connOpts.connectTimeoutMs,
      serverSelectionTimeoutMS: connOpts.serverSelectionTimeoutMs,
      retryWrites: connOpts.retryWrites,
      retryReads: connOpts.retryReads,
    };

    // Read preference
    options.readPreference = ReadPreference.fromString(connOpts.readPreference);

    // Write concern
    options.writeConcern = new WriteConcern(
      connOpts.writeConcern.w,
      connOpts.writeConcern.wtimeoutMs,
      connOpts.writeConcern.j
    );

    // Read concern
    options.readConcern = new ReadConcern(connOpts.readConcern);

    // Compression
    if (connOpts.compressors && connOpts.compressors.length > 0) {
      options.compressors = connOpts.compressors;
    }

    return options;
  }

  /**
   * Sets up event listeners for connection monitoring.
   */
  private setupEventListeners(): void {
    if (!this.client) return;

    // Connection pool events
    this.client.on('connectionPoolCreated', (event: ConnectionPoolCreatedEvent) => {
      this.logger.debug('Connection pool created', {
        address: event.address,
      });
    });

    this.client.on('connectionPoolClosed', (event: ConnectionPoolClosedEvent) => {
      this.logger.debug('Connection pool closed', {
        address: event.address,
      });
    });

    this.client.on('connectionCreated', (event: ConnectionCreatedEvent) => {
      this.logger.debug('Connection created', {
        connectionId: event.connectionId,
        address: event.address,
      });
      this.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'connectionCreated',
      });
    });

    this.client.on('connectionClosed', (event: ConnectionClosedEvent) => {
      this.logger.debug('Connection closed', {
        connectionId: event.connectionId,
        address: event.address,
        reason: event.reason,
      });
      this.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'connectionClosed',
      });
    });

    // Server heartbeat events
    this.client.on('serverHeartbeatFailed', (event: ServerHeartbeatFailedEvent) => {
      this.logger.warn('Server heartbeat failed', {
        connectionId: event.connectionId,
        failure: event.failure.message,
      });
      this.metrics.increment(MetricNames.CONNECTION_ERRORS, 1, {
        type: 'heartbeat',
      });
    });

    this.client.on('serverHeartbeatSucceeded', (event: ServerHeartbeatSucceededEvent) => {
      this.logger.trace('Server heartbeat succeeded', {
        connectionId: event.connectionId,
        duration: event.duration,
      });
    });

    // Error event
    this.client.on('error', (error: Error) => {
      this.logger.error('MongoDB client error', {
        error: error.message,
      });
      this.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        type: 'client',
      });
    });

    // Close event
    this.client.on('close', () => {
      this.logger.info('MongoDB connection closed');
      this.connected = false;
    });
  }
}

// ============================================================================
// Client Factory Functions
// ============================================================================

/**
 * Creates a MongoDB client from a configuration.
 */
export function createMongoDBClient(
  config: MongoDBConfig,
  observability?: Observability
): MongoDBClient {
  return new MongoDBClient(config, observability);
}

/**
 * Creates a MongoDB client from environment variables.
 */
export function createMongoDBClientFromEnv(observability?: Observability): MongoDBClient {
  const config = MongoDBConfigBuilder.fromEnv().build();
  return new MongoDBClient(config, observability);
}
