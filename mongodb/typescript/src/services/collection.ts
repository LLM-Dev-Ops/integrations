/**
 * MongoDB collection service implementation following SPARC specification.
 *
 * Provides CRUD operations, aggregation, indexing, and change streams for MongoDB collections.
 */

import crypto from 'node:crypto';

import {
  Document,
  Filter,
  UpdateFilter,
  FindOptions,
  FindOneOptions,
  InsertOneOptions,
  InsertManyOptions,
  UpdateOptions,
  DeleteOptions,
  ReplaceOptions,
  CountOptions,
  DistinctOptions,
  AggregateOptions,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  BulkWriteOperation,
  BulkWriteResult,
  PipelineStage,
  ChangeStreamOptions,
  ChangeEvent,
  IndexSpecification,
  CreateIndexOptions,
  IndexDescription,
  validateDocument,
  validateFilter,
  validateUpdateFilter,
  validatePipeline,
  isDocumentTooLarge,
} from '../types/index.js';
import {
  InvalidQueryError,
  InvalidAggregationError,
  WriteError,
  parseMongoDBError,
} from '../errors/index.js';
import { MetricNames } from '../observability/index.js';
import { TelemetryEmitter } from '../../../../shared/telemetry-emitter/dist/index.js';

// Import MongoDB driver types (these would be from the official mongodb driver)
// In a real implementation, these would be: import { Collection, ...} from 'mongodb';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Collection<_T extends Document = Document> = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChangeStream<_T extends Document = Document> = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BulkWriteOptions = any;

// Placeholder for MongoDBClient - this would be implemented similar to JiraClient
interface MongoDBClient {
  readonly logger: {
    trace(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
  readonly metrics: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    gauge(name: string, value: number, tags?: Record<string, string>): void;
    timing(name: string, durationMs: number, tags?: Record<string, string>): void;
  };
  readonly tracer: {
    withSpan<T>(
      name: string,
      fn: (span: any) => T | Promise<T>,
      attributes?: Record<string, unknown>
    ): Promise<T>;
  };
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

// ============================================================================
// Index Information Types
// ============================================================================

/**
 * Index information returned by listIndexes.
 */
export interface IndexInfo extends IndexDescription {
  /** Index namespace */
  ns?: string;
}

// ============================================================================
// Change Stream Wrapper
// ============================================================================

/**
 * Change stream wrapper with observability.
 */
export interface ChangeStreamWrapper<T = Document> {
  /** Get next change event */
  next(): Promise<ChangeEvent<T> | null>;
  /** Check if cursor has next */
  hasNext(): Promise<boolean>;
  /** Close the stream */
  close(): Promise<void>;
  /** Async iterator support */
  [Symbol.asyncIterator](): AsyncIterableIterator<ChangeEvent<T>>;
}

// ============================================================================
// Bulk Operation Builder
// ============================================================================

/**
 * Bulk operation builder for ordered and unordered operations.
 */
export interface BulkOperationBuilder<T = Document> {
  /** Add an insert operation */
  insert(document: T): this;
  /** Find documents for update/replace/delete */
  find(filter: Filter<T>): BulkOperationFinder<T>;
  /** Execute the bulk operation */
  execute(): Promise<BulkWriteResult>;
}

/**
 * Bulk operation finder for chaining update/replace/delete operations.
 */
export interface BulkOperationFinder<T = Document> {
  /** Update one matching document */
  updateOne(update: UpdateFilter<T>): BulkOperationBuilder<T>;
  /** Update all matching documents */
  update(update: UpdateFilter<T>): BulkOperationBuilder<T>;
  /** Replace one matching document */
  replaceOne(replacement: T): BulkOperationBuilder<T>;
  /** Delete one matching document */
  deleteOne(): BulkOperationBuilder<T>;
  /** Delete all matching documents */
  delete(): BulkOperationBuilder<T>;
  /** Enable upsert for the operation */
  upsert(): this;
}

// ============================================================================
// MongoDB Collection Service
// ============================================================================

/**
 * MongoDB collection service providing CRUD operations with resilience and observability.
 */
export class MongoDBCollection<T extends Document = Document> {
  private readonly collection: Collection<T>;
  private readonly client: MongoDBClient;
  private readonly collectionName: string;
  private readonly databaseName: string;
  private readonly telemetry: TelemetryEmitter;

  /**
   * Creates a new MongoDBCollection instance.
   *
   * @param collection - MongoDB driver Collection instance
   * @param client - MongoDBClient for resilience and observability
   * @param dbName - Database name
   * @param collName - Collection name
   */
  constructor(
    collection: Collection<T>,
    client: MongoDBClient,
    dbName: string,
    collName: string
  ) {
    this.collection = collection;
    this.client = client;
    this.databaseName = dbName;
    this.collectionName = collName;
    this.telemetry = TelemetryEmitter.getInstance();
  }

  /**
   * Gets the collection name.
   */
  get name(): string {
    return this.collectionName;
  }

  /**
   * Gets the database name.
   */
  get database(): string {
    return this.databaseName;
  }

  // ==========================================================================
  // Find Operations
  // ==========================================================================

  /**
   * Finds a single document matching the filter.
   *
   * @param filter - Query filter
   * @param options - Find options (projection, sort, etc.)
   * @returns The matching document or null
   */
  async findOne(filter: Filter<T>, options?: FindOneOptions<T>): Promise<T | null> {
    return this.client.tracer.withSpan(
      'mongodb.collection.findOne',
      async (span) => {
        const startTime = Date.now();
        const correlationId = crypto.randomUUID();

        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate filter
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Finding one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        // Emit telemetry: operation initiation
        try {
          this.telemetry.emitRequestStart('mongodb', correlationId, {
            operation: 'findOne',
            collection: this.collectionName,
            database: this.databaseName,
          });
        } catch {
          // Fail-open: suppress telemetry errors
        }

        try {
          const result = await this.client.execute(() =>
            this.collection.findOne(filter, options)
          ) as T | null;

          const latencyMs = Date.now() - startTime;

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'findOne',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            latencyMs,
            { operation: 'findOne', collection: this.collectionName }
          );

          if (result) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_READ, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('found', !!result);
          span.setStatus('OK');

          // Emit telemetry: operation completion
          try {
            this.telemetry.emitRequestComplete('mongodb', correlationId, {
              operation: 'findOne',
              collection: this.collectionName,
              database: this.databaseName,
              found: !!result,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'findOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          return result;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Emit telemetry: error
          try {
            this.telemetry.emitError('mongodb', correlationId, error as Error, {
              operation: 'findOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'findOne',
              collection: this.collectionName,
              database: this.databaseName,
              error: true,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          this.handleError('findOne', error, span);
          throw error;
        }
      },
      { operation: 'findOne' }
    );
  }

  /**
   * Finds all documents matching the filter.
   *
   * @param filter - Query filter
   * @param options - Find options (projection, sort, limit, skip, etc.)
   * @returns Array of matching documents
   */
  async find(filter: Filter<T>, options?: FindOptions<T>): Promise<T[]> {
    return this.client.tracer.withSpan(
      'mongodb.collection.find',
      async (span) => {
        const startTime = Date.now();
        const correlationId = crypto.randomUUID();

        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate filter
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Finding documents', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
          limit: options?.limit,
          skip: options?.skip,
        });

        // Emit telemetry: operation initiation
        try {
          this.telemetry.emitRequestStart('mongodb', correlationId, {
            operation: 'find',
            collection: this.collectionName,
            database: this.databaseName,
            limit: options?.limit,
            skip: options?.skip,
          });
        } catch {
          // Fail-open: suppress telemetry errors
        }

        try {
          const cursor = this.collection.find(filter, options);
          const results = await this.client.execute(() => cursor.toArray());
          const latencyMs = Date.now() - startTime;

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'find',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            latencyMs,
            { operation: 'find', collection: this.collectionName }
          );
          this.client.metrics.increment(MetricNames.DOCUMENTS_READ, results.length, {
            collection: this.collectionName,
          });

          span.setAttribute('count', results.length);
          span.setStatus('OK');

          // Emit telemetry: operation completion
          try {
            this.telemetry.emitRequestComplete('mongodb', correlationId, {
              operation: 'find',
              collection: this.collectionName,
              database: this.databaseName,
              documentCount: results.length,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'find',
              collection: this.collectionName,
              database: this.databaseName,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          return results;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Emit telemetry: error
          try {
            this.telemetry.emitError('mongodb', correlationId, error as Error, {
              operation: 'find',
              collection: this.collectionName,
              database: this.databaseName,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'find',
              collection: this.collectionName,
              database: this.databaseName,
              error: true,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          this.handleError('find', error, span);
          throw error;
        }
      },
      { operation: 'find' }
    );
  }

  /**
   * Finds a single document and updates it.
   *
   * @param filter - Query filter
   * @param update - Update operations
   * @param options - Update options (upsert, returnDocument, etc.)
   * @returns The updated document or null
   */
  async findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: UpdateOptions & { returnDocument?: 'before' | 'after' }
  ): Promise<T | null> {
    return this.client.tracer.withSpan(
      'mongodb.collection.findOneAndUpdate',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate inputs
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        const updateErrors = validateUpdateFilter(update);
        if (updateErrors.length > 0) {
          throw new InvalidQueryError(`Invalid update: ${updateErrors.join(', ')}`);
        }

        this.client.logger.debug('Finding and updating one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.findOneAndUpdate(filter, update, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'findOneAndUpdate',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'findOneAndUpdate', collection: this.collectionName }
          );

          if (result) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('found', !!result);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('findOneAndUpdate', error, span);
          throw error;
        }
      },
      { operation: 'findOneAndUpdate' }
    );
  }

  /**
   * Finds a single document and replaces it.
   *
   * @param filter - Query filter
   * @param replacement - Replacement document
   * @param options - Replace options (upsert, returnDocument, etc.)
   * @returns The replaced document or null
   */
  async findOneAndReplace(
    filter: Filter<T>,
    replacement: T,
    options?: ReplaceOptions & { returnDocument?: 'before' | 'after' }
  ): Promise<T | null> {
    return this.client.tracer.withSpan(
      'mongodb.collection.findOneAndReplace',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate inputs
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        const docErrors = validateDocument(replacement);
        if (docErrors.length > 0) {
          throw new WriteError(`Invalid replacement document: ${docErrors.join(', ')}`);
        }

        if (isDocumentTooLarge(replacement)) {
          throw new WriteError('Replacement document exceeds maximum size (16MB)');
        }

        this.client.logger.debug('Finding and replacing one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.findOneAndReplace(filter, replacement, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'findOneAndReplace',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'findOneAndReplace', collection: this.collectionName }
          );

          if (result) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('found', !!result);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('findOneAndReplace', error, span);
          throw error;
        }
      },
      { operation: 'findOneAndReplace' }
    );
  }

  /**
   * Finds a single document and deletes it.
   *
   * @param filter - Query filter
   * @param options - Delete options
   * @returns The deleted document or null
   */
  async findOneAndDelete(
    filter: Filter<T>,
    options?: DeleteOptions
  ): Promise<T | null> {
    return this.client.tracer.withSpan(
      'mongodb.collection.findOneAndDelete',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate filter
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Finding and deleting one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.findOneAndDelete(filter, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'findOneAndDelete',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'findOneAndDelete', collection: this.collectionName }
          );

          if (result) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('found', !!result);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('findOneAndDelete', error, span);
          throw error;
        }
      },
      { operation: 'findOneAndDelete' }
    );
  }

  // ==========================================================================
  // Insert Operations
  // ==========================================================================

  /**
   * Inserts a single document.
   *
   * @param document - Document to insert
   * @param options - Insert options
   * @returns Insert result with inserted ID
   */
  async insertOne(document: T, options?: InsertOneOptions): Promise<InsertOneResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.insertOne',
      async (span) => {
        const startTime = Date.now();
        const correlationId = crypto.randomUUID();

        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate document
        const docErrors = validateDocument(document);
        if (docErrors.length > 0) {
          throw new WriteError(`Invalid document: ${docErrors.join(', ')}`);
        }

        if (isDocumentTooLarge(document)) {
          throw new WriteError('Document exceeds maximum size (16MB)');
        }

        this.client.logger.debug('Inserting one document', {
          database: this.databaseName,
          collection: this.collectionName,
        });

        // Emit telemetry: operation initiation
        try {
          this.telemetry.emitRequestStart('mongodb', correlationId, {
            operation: 'insertOne',
            collection: this.collectionName,
            database: this.databaseName,
          });
        } catch {
          // Fail-open: suppress telemetry errors
        }

        try {
          const result = await this.client.execute(() =>
            this.collection.insertOne(document, options)
          );
          const latencyMs = Date.now() - startTime;

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'insertOne',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            latencyMs,
            { operation: 'insertOne', collection: this.collectionName }
          );
          this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
            collection: this.collectionName,
          });

          this.client.logger.info('Document inserted', {
            database: this.databaseName,
            collection: this.collectionName,
            insertedId: result.insertedId,
          });

          span.setStatus('OK');

          // Emit telemetry: operation completion
          try {
            this.telemetry.emitRequestComplete('mongodb', correlationId, {
              operation: 'insertOne',
              collection: this.collectionName,
              database: this.databaseName,
              documentCount: 1,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'insertOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          return result;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Emit telemetry: error
          try {
            this.telemetry.emitError('mongodb', correlationId, error as Error, {
              operation: 'insertOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'insertOne',
              collection: this.collectionName,
              database: this.databaseName,
              error: true,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          this.handleError('insertOne', error, span);
          throw error;
        }
      },
      { operation: 'insertOne' }
    );
  }

  /**
   * Inserts multiple documents.
   *
   * @param documents - Array of documents to insert
   * @param options - Insert options (ordered, etc.)
   * @returns Insert result with inserted IDs
   */
  async insertMany(documents: T[], options?: InsertManyOptions): Promise<InsertManyResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.insertMany',
      async (span) => {
        const startTime = Date.now();
        const correlationId = crypto.randomUUID();

        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);
        span.setAttribute('count', documents.length);

        // Validate all documents
        for (let i = 0; i < documents.length; i++) {
          const docErrors = validateDocument(documents[i]);
          if (docErrors.length > 0) {
            throw new WriteError(
              `Invalid document at index ${i}: ${docErrors.join(', ')}`
            );
          }

          if (isDocumentTooLarge(documents[i])) {
            throw new WriteError(`Document at index ${i} exceeds maximum size (16MB)`);
          }
        }

        this.client.logger.debug('Inserting many documents', {
          database: this.databaseName,
          collection: this.collectionName,
          count: documents.length,
        });

        // Emit telemetry: operation initiation
        try {
          this.telemetry.emitRequestStart('mongodb', correlationId, {
            operation: 'insertMany',
            collection: this.collectionName,
            database: this.databaseName,
            documentCount: documents.length,
          });
        } catch {
          // Fail-open: suppress telemetry errors
        }

        try {
          const result = await this.client.execute(() =>
            this.collection.insertMany(documents, options)
          );
          const latencyMs = Date.now() - startTime;

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'insertMany',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            latencyMs,
            { operation: 'insertMany', collection: this.collectionName }
          );
          this.client.metrics.increment(
            MetricNames.DOCUMENTS_WRITTEN,
            result.insertedCount,
            { collection: this.collectionName }
          );

          this.client.logger.info('Documents inserted', {
            database: this.databaseName,
            collection: this.collectionName,
            insertedCount: result.insertedCount,
          });

          span.setAttribute('insertedCount', result.insertedCount);
          span.setStatus('OK');

          // Emit telemetry: operation completion
          try {
            this.telemetry.emitRequestComplete('mongodb', correlationId, {
              operation: 'insertMany',
              collection: this.collectionName,
              database: this.databaseName,
              documentCount: result.insertedCount,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'insertMany',
              collection: this.collectionName,
              database: this.databaseName,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          return result;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Emit telemetry: error
          try {
            this.telemetry.emitError('mongodb', correlationId, error as Error, {
              operation: 'insertMany',
              collection: this.collectionName,
              database: this.databaseName,
              documentCount: documents.length,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'insertMany',
              collection: this.collectionName,
              database: this.databaseName,
              error: true,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          this.handleError('insertMany', error, span);
          throw error;
        }
      },
      { operation: 'insertMany' }
    );
  }

  // ==========================================================================
  // Update Operations
  // ==========================================================================

  /**
   * Updates a single document matching the filter.
   *
   * @param filter - Query filter
   * @param update - Update operations
   * @param options - Update options (upsert, etc.)
   * @returns Update result
   */
  async updateOne(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: UpdateOptions
  ): Promise<UpdateResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.updateOne',
      async (span) => {
        const startTime = Date.now();
        const correlationId = crypto.randomUUID();

        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate inputs
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        const updateErrors = validateUpdateFilter(update);
        if (updateErrors.length > 0) {
          throw new InvalidQueryError(`Invalid update: ${updateErrors.join(', ')}`);
        }

        this.client.logger.debug('Updating one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        // Emit telemetry: operation initiation
        try {
          this.telemetry.emitRequestStart('mongodb', correlationId, {
            operation: 'updateOne',
            collection: this.collectionName,
            database: this.databaseName,
          });
        } catch {
          // Fail-open: suppress telemetry errors
        }

        try {
          const result = await this.client.execute(() =>
            this.collection.updateOne(filter, update, options)
          );
          const latencyMs = Date.now() - startTime;

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'updateOne',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            latencyMs,
            { operation: 'updateOne', collection: this.collectionName }
          );

          if (result.modifiedCount > 0) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('matchedCount', result.matchedCount);
          span.setAttribute('modifiedCount', result.modifiedCount);
          span.setAttribute('upsertedCount', result.upsertedCount);
          span.setStatus('OK');

          // Emit telemetry: operation completion
          try {
            this.telemetry.emitRequestComplete('mongodb', correlationId, {
              operation: 'updateOne',
              collection: this.collectionName,
              database: this.databaseName,
              matchedCount: result.matchedCount,
              modifiedCount: result.modifiedCount,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'updateOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          return result;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Emit telemetry: error
          try {
            this.telemetry.emitError('mongodb', correlationId, error as Error, {
              operation: 'updateOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'updateOne',
              collection: this.collectionName,
              database: this.databaseName,
              error: true,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          this.handleError('updateOne', error, span);
          throw error;
        }
      },
      { operation: 'updateOne' }
    );
  }

  /**
   * Updates all documents matching the filter.
   *
   * @param filter - Query filter
   * @param update - Update operations
   * @param options - Update options (upsert, etc.)
   * @returns Update result
   */
  async updateMany(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: UpdateOptions
  ): Promise<UpdateResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.updateMany',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate inputs
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        const updateErrors = validateUpdateFilter(update);
        if (updateErrors.length > 0) {
          throw new InvalidQueryError(`Invalid update: ${updateErrors.join(', ')}`);
        }

        this.client.logger.debug('Updating many documents', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.updateMany(filter, update, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'updateMany',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'updateMany', collection: this.collectionName }
          );
          this.client.metrics.increment(
            MetricNames.DOCUMENTS_WRITTEN,
            result.modifiedCount,
            { collection: this.collectionName }
          );

          this.client.logger.info('Documents updated', {
            database: this.databaseName,
            collection: this.collectionName,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
          });

          span.setAttribute('matchedCount', result.matchedCount);
          span.setAttribute('modifiedCount', result.modifiedCount);
          span.setAttribute('upsertedCount', result.upsertedCount);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('updateMany', error, span);
          throw error;
        }
      },
      { operation: 'updateMany' }
    );
  }

  /**
   * Replaces a single document matching the filter.
   *
   * @param filter - Query filter
   * @param replacement - Replacement document
   * @param options - Replace options (upsert, etc.)
   * @returns Update result
   */
  async replaceOne(
    filter: Filter<T>,
    replacement: T,
    options?: ReplaceOptions
  ): Promise<UpdateResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.replaceOne',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate inputs
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        const docErrors = validateDocument(replacement);
        if (docErrors.length > 0) {
          throw new WriteError(`Invalid replacement document: ${docErrors.join(', ')}`);
        }

        if (isDocumentTooLarge(replacement)) {
          throw new WriteError('Replacement document exceeds maximum size (16MB)');
        }

        this.client.logger.debug('Replacing one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.replaceOne(filter, replacement, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'replaceOne',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'replaceOne', collection: this.collectionName }
          );

          if (result.modifiedCount > 0) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('matchedCount', result.matchedCount);
          span.setAttribute('modifiedCount', result.modifiedCount);
          span.setAttribute('upsertedCount', result.upsertedCount);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('replaceOne', error, span);
          throw error;
        }
      },
      { operation: 'replaceOne' }
    );
  }

  // ==========================================================================
  // Delete Operations
  // ==========================================================================

  /**
   * Deletes a single document matching the filter.
   *
   * @param filter - Query filter
   * @param options - Delete options
   * @returns Delete result
   */
  async deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.deleteOne',
      async (span) => {
        const startTime = Date.now();
        const correlationId = crypto.randomUUID();

        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate filter
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Deleting one document', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        // Emit telemetry: operation initiation
        try {
          this.telemetry.emitRequestStart('mongodb', correlationId, {
            operation: 'deleteOne',
            collection: this.collectionName,
            database: this.databaseName,
          });
        } catch {
          // Fail-open: suppress telemetry errors
        }

        try {
          const result = await this.client.execute(() =>
            this.collection.deleteOne(filter, options)
          );
          const latencyMs = Date.now() - startTime;

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'deleteOne',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            latencyMs,
            { operation: 'deleteOne', collection: this.collectionName }
          );

          if (result.deletedCount > 0) {
            this.client.metrics.increment(MetricNames.DOCUMENTS_WRITTEN, 1, {
              collection: this.collectionName,
            });
          }

          span.setAttribute('deletedCount', result.deletedCount);
          span.setStatus('OK');

          // Emit telemetry: operation completion
          try {
            this.telemetry.emitRequestComplete('mongodb', correlationId, {
              operation: 'deleteOne',
              collection: this.collectionName,
              database: this.databaseName,
              deletedCount: result.deletedCount,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'deleteOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          return result;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          // Emit telemetry: error
          try {
            this.telemetry.emitError('mongodb', correlationId, error as Error, {
              operation: 'deleteOne',
              collection: this.collectionName,
              database: this.databaseName,
            });
            this.telemetry.emitLatency('mongodb', correlationId, latencyMs, {
              operation: 'deleteOne',
              collection: this.collectionName,
              database: this.databaseName,
              error: true,
            });
          } catch {
            // Fail-open: suppress telemetry errors
          }

          this.handleError('deleteOne', error, span);
          throw error;
        }
      },
      { operation: 'deleteOne' }
    );
  }

  /**
   * Deletes all documents matching the filter.
   *
   * @param filter - Query filter
   * @param options - Delete options
   * @returns Delete result
   */
  async deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.deleteMany',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        // Validate filter
        const filterErrors = validateFilter(filter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Deleting many documents', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(filter),
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.deleteMany(filter, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'deleteMany',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'deleteMany', collection: this.collectionName }
          );
          this.client.metrics.increment(
            MetricNames.DOCUMENTS_WRITTEN,
            result.deletedCount,
            { collection: this.collectionName }
          );

          this.client.logger.info('Documents deleted', {
            database: this.databaseName,
            collection: this.collectionName,
            deletedCount: result.deletedCount,
          });

          span.setAttribute('deletedCount', result.deletedCount);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('deleteMany', error, span);
          throw error;
        }
      },
      { operation: 'deleteMany' }
    );
  }

  // ==========================================================================
  // Count and Distinct Operations
  // ==========================================================================

  /**
   * Counts documents matching the filter.
   *
   * @param filter - Query filter (optional)
   * @param options - Count options (limit, skip, etc.)
   * @returns Document count
   */
  async countDocuments(filter?: Filter<T>, options?: CountOptions): Promise<number> {
    return this.client.tracer.withSpan(
      'mongodb.collection.countDocuments',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        const actualFilter = filter ?? ({} as Filter<T>);

        // Validate filter
        const filterErrors = validateFilter(actualFilter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Counting documents', {
          database: this.databaseName,
          collection: this.collectionName,
          filter: this.sanitizeFilter(actualFilter),
        });

        try {
          const count = await this.client.execute(() =>
            this.collection.countDocuments(actualFilter, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'countDocuments',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'countDocuments', collection: this.collectionName }
          );

          span.setAttribute('count', count);
          span.setStatus('OK');
          return count;
        } catch (error) {
          this.handleError('countDocuments', error, span);
          throw error;
        }
      },
      { operation: 'countDocuments' }
    );
  }

  /**
   * Estimates the total document count (fast but approximate).
   *
   * @returns Estimated document count
   */
  async estimatedDocumentCount(): Promise<number> {
    return this.client.tracer.withSpan(
      'mongodb.collection.estimatedDocumentCount',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        this.client.logger.debug('Estimating document count', {
          database: this.databaseName,
          collection: this.collectionName,
        });

        try {
          const count = await this.client.execute(() =>
            this.collection.estimatedDocumentCount()
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'estimatedDocumentCount',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'estimatedDocumentCount', collection: this.collectionName }
          );

          span.setAttribute('estimatedCount', count);
          span.setStatus('OK');
          return count;
        } catch (error) {
          this.handleError('estimatedDocumentCount', error, span);
          throw error;
        }
      },
      { operation: 'estimatedDocumentCount' }
    );
  }

  /**
   * Gets distinct values for a field.
   *
   * @param field - Field name
   * @param filter - Query filter (optional)
   * @param options - Distinct options
   * @returns Array of distinct values
   */
  async distinct<K = unknown>(
    field: string,
    filter?: Filter<T>,
    options?: DistinctOptions
  ): Promise<K[]> {
    return this.client.tracer.withSpan(
      'mongodb.collection.distinct',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);
        span.setAttribute('field', field);

        const actualFilter = filter ?? ({} as Filter<T>);

        // Validate filter
        const filterErrors = validateFilter(actualFilter);
        if (filterErrors.length > 0) {
          throw new InvalidQueryError(`Invalid filter: ${filterErrors.join(', ')}`);
        }

        this.client.logger.debug('Getting distinct values', {
          database: this.databaseName,
          collection: this.collectionName,
          field,
          filter: this.sanitizeFilter(actualFilter),
        });

        try {
          const values = await this.client.execute(() =>
            this.collection.distinct(field, actualFilter, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'distinct',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'distinct', collection: this.collectionName }
          );

          span.setAttribute('distinctCount', values.length);
          span.setStatus('OK');
          return values as K[];
        } catch (error) {
          this.handleError('distinct', error, span);
          throw error;
        }
      },
      { operation: 'distinct' }
    );
  }

  // ==========================================================================
  // Aggregation Operations
  // ==========================================================================

  /**
   * Executes an aggregation pipeline and returns all results.
   *
   * @param pipeline - Aggregation pipeline stages
   * @param options - Aggregation options
   * @returns Array of aggregation results
   */
  async aggregate<R = Document>(
    pipeline: PipelineStage[],
    options?: AggregateOptions
  ): Promise<R[]> {
    return this.client.tracer.withSpan(
      'mongodb.collection.aggregate',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);
        span.setAttribute('stageCount', pipeline.length);

        // Validate pipeline
        const pipelineErrors = validatePipeline(pipeline);
        if (pipelineErrors.length > 0) {
          throw new InvalidAggregationError(
            `Invalid pipeline: ${pipelineErrors.join(', ')}`
          );
        }

        this.client.logger.debug('Executing aggregation pipeline', {
          database: this.databaseName,
          collection: this.collectionName,
          stageCount: pipeline.length,
        });

        try {
          const cursor = this.collection.aggregate<R>(pipeline, options);
          const results = await this.client.execute(() => cursor.toArray());

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'aggregate',
            collection: this.collectionName,
          });
          this.client.metrics.increment(MetricNames.AGGREGATIONS_TOTAL, 1, {
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'aggregate', collection: this.collectionName }
          );

          span.setAttribute('resultCount', results.length);
          span.setStatus('OK');
          return results;
        } catch (error) {
          this.handleError('aggregate', error, span);
          throw error;
        }
      },
      { operation: 'aggregate' }
    );
  }

  /**
   * Executes an aggregation pipeline and returns a cursor.
   *
   * @param pipeline - Aggregation pipeline stages
   * @param options - Aggregation options
   * @returns Async iterable cursor
   */
  async *aggregateCursor<R = Document>(
    pipeline: PipelineStage[],
    options?: AggregateOptions
  ): AsyncIterable<R> {
    // Validate pipeline
    const pipelineErrors = validatePipeline(pipeline);
    if (pipelineErrors.length > 0) {
      throw new InvalidAggregationError(`Invalid pipeline: ${pipelineErrors.join(', ')}`);
    }

    this.client.logger.debug('Executing aggregation pipeline (cursor)', {
      database: this.databaseName,
      collection: this.collectionName,
      stageCount: pipeline.length,
    });

    const cursor = this.collection.aggregate<R>(pipeline, options);
    let count = 0;

    try {
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (doc !== null) {
          count++;
          yield doc;
        }
      }

      this.client.logger.debug('Aggregation cursor completed', {
        database: this.databaseName,
        collection: this.collectionName,
        count,
      });
    } finally {
      await cursor.close();
    }
  }

  // ==========================================================================
  // Index Operations
  // ==========================================================================

  /**
   * Creates a single index.
   *
   * @param indexSpec - Index specification
   * @param options - Index creation options
   * @returns Index name
   */
  async createIndex(
    indexSpec: IndexSpecification,
    options?: CreateIndexOptions
  ): Promise<string> {
    return this.client.tracer.withSpan(
      'mongodb.collection.createIndex',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        this.client.logger.debug('Creating index', {
          database: this.databaseName,
          collection: this.collectionName,
          indexSpec,
          options,
        });

        try {
          const indexName = await this.client.execute(() =>
            this.collection.createIndex(indexSpec, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'createIndex',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'createIndex', collection: this.collectionName }
          );

          this.client.logger.info('Index created', {
            database: this.databaseName,
            collection: this.collectionName,
            indexName,
          });

          span.setAttribute('indexName', indexName);
          span.setStatus('OK');
          return indexName;
        } catch (error) {
          this.handleError('createIndex', error, span);
          throw error;
        }
      },
      { operation: 'createIndex' }
    );
  }

  /**
   * Creates multiple indexes.
   *
   * @param indexSpecs - Array of index specifications
   * @returns Array of index names
   */
  async createIndexes(
    indexSpecs: Array<{ key: IndexSpecification; options?: CreateIndexOptions }>
  ): Promise<string[]> {
    return this.client.tracer.withSpan(
      'mongodb.collection.createIndexes',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);
        span.setAttribute('indexCount', indexSpecs.length);

        this.client.logger.debug('Creating multiple indexes', {
          database: this.databaseName,
          collection: this.collectionName,
          count: indexSpecs.length,
        });

        try {
          const indexNames = await this.client.execute(() =>
            this.collection.createIndexes(indexSpecs.map(spec => ({
              key: spec.key,
              ...spec.options,
            })))
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'createIndexes',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'createIndexes', collection: this.collectionName }
          );

          this.client.logger.info('Indexes created', {
            database: this.databaseName,
            collection: this.collectionName,
            indexNames,
          });

          span.setAttribute('createdCount', indexNames.length);
          span.setStatus('OK');
          return indexNames;
        } catch (error) {
          this.handleError('createIndexes', error, span);
          throw error;
        }
      },
      { operation: 'createIndexes' }
    );
  }

  /**
   * Drops an index by name.
   *
   * @param indexName - Index name
   */
  async dropIndex(indexName: string): Promise<void> {
    return this.client.tracer.withSpan(
      'mongodb.collection.dropIndex',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);
        span.setAttribute('indexName', indexName);

        this.client.logger.debug('Dropping index', {
          database: this.databaseName,
          collection: this.collectionName,
          indexName,
        });

        try {
          await this.client.execute(() => this.collection.dropIndex(indexName));

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'dropIndex',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'dropIndex', collection: this.collectionName }
          );

          this.client.logger.info('Index dropped', {
            database: this.databaseName,
            collection: this.collectionName,
            indexName,
          });

          span.setStatus('OK');
        } catch (error) {
          this.handleError('dropIndex', error, span);
          throw error;
        }
      },
      { operation: 'dropIndex' }
    );
  }

  /**
   * Drops all indexes except _id.
   */
  async dropIndexes(): Promise<void> {
    return this.client.tracer.withSpan(
      'mongodb.collection.dropIndexes',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        this.client.logger.debug('Dropping all indexes', {
          database: this.databaseName,
          collection: this.collectionName,
        });

        try {
          await this.client.execute(() => this.collection.dropIndexes());

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'dropIndexes',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'dropIndexes', collection: this.collectionName }
          );

          this.client.logger.info('All indexes dropped', {
            database: this.databaseName,
            collection: this.collectionName,
          });

          span.setStatus('OK');
        } catch (error) {
          this.handleError('dropIndexes', error, span);
          throw error;
        }
      },
      { operation: 'dropIndexes' }
    );
  }

  /**
   * Lists all indexes on the collection.
   *
   * @returns Array of index information
   */
  async listIndexes(): Promise<IndexInfo[]> {
    return this.client.tracer.withSpan(
      'mongodb.collection.listIndexes',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);

        this.client.logger.debug('Listing indexes', {
          database: this.databaseName,
          collection: this.collectionName,
        });

        try {
          const cursor = this.collection.listIndexes();
          const indexes = await this.client.execute(() => cursor.toArray());

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'listIndexes',
            collection: this.collectionName,
          });
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'listIndexes', collection: this.collectionName }
          );

          span.setAttribute('indexCount', indexes.length);
          span.setStatus('OK');
          return indexes;
        } catch (error) {
          this.handleError('listIndexes', error, span);
          throw error;
        }
      },
      { operation: 'listIndexes' }
    );
  }

  // ==========================================================================
  // Change Stream Operations
  // ==========================================================================

  /**
   * Watches the collection for changes.
   *
   * @param pipeline - Aggregation pipeline to filter change events (optional)
   * @param options - Change stream options
   * @returns Change stream wrapper
   */
  watch(
    pipeline?: PipelineStage[],
    options?: ChangeStreamOptions
  ): ChangeStreamWrapper<T> {
    this.client.logger.debug('Opening change stream', {
      database: this.databaseName,
      collection: this.collectionName,
      pipeline: pipeline?.length ?? 0,
    });

    // Validate pipeline if provided
    if (pipeline && pipeline.length > 0) {
      const pipelineErrors = validatePipeline(pipeline);
      if (pipelineErrors.length > 0) {
        throw new InvalidAggregationError(
          `Invalid change stream pipeline: ${pipelineErrors.join(', ')}`
        );
      }
    }

    const changeStream: ChangeStream<T> = pipeline
      ? this.collection.watch(pipeline, options)
      : this.collection.watch(options);

    let eventCount = 0;

    const wrapper: ChangeStreamWrapper<T> = {
      next: async () => {
        const event = await changeStream.next();
        if (event) {
          eventCount++;
          this.client.metrics.increment(MetricNames.CHANGE_STREAM_EVENTS, 1, {
            collection: this.collectionName,
            operationType: event.operationType,
          });
        }
        return event;
      },

      hasNext: async () => {
        return changeStream.hasNext();
      },

      close: async () => {
        await changeStream.close();
        this.client.logger.debug('Change stream closed', {
          database: this.databaseName,
          collection: this.collectionName,
          eventCount,
        });
      },

      [Symbol.asyncIterator]: async function* () {
        try {
          while (await changeStream.hasNext()) {
            const event = await changeStream.next();
            if (event) {
              eventCount++;
              wrapper['client'].metrics.increment(MetricNames.CHANGE_STREAM_EVENTS, 1, {
                collection: wrapper['collectionName'],
                operationType: event.operationType,
              });
              yield event;
            }
          }
        } finally {
          await changeStream.close();
        }
      },
    };

    // Attach client reference for metrics
    (wrapper as any).client = this.client;
    (wrapper as any).collectionName = this.collectionName;

    return wrapper;
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Executes a bulk write operation.
   *
   * @param operations - Array of bulk write operations
   * @param options - Bulk write options
   * @returns Bulk write result
   */
  async bulkWrite(
    operations: BulkWriteOperation<T>[],
    options?: BulkWriteOptions
  ): Promise<BulkWriteResult> {
    return this.client.tracer.withSpan(
      'mongodb.collection.bulkWrite',
      async (span) => {
        const startTime = Date.now();
        span.setAttribute('database', this.databaseName);
        span.setAttribute('collection', this.collectionName);
        span.setAttribute('operationCount', operations.length);

        this.client.logger.debug('Executing bulk write', {
          database: this.databaseName,
          collection: this.collectionName,
          operationCount: operations.length,
        });

        try {
          const result = await this.client.execute(() =>
            this.collection.bulkWrite(operations, options)
          );

          // Record metrics
          this.client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: 'bulkWrite',
            collection: this.collectionName,
          });
          this.client.metrics.increment(MetricNames.BULK_OPERATIONS_TOTAL, 1, {
            collection: this.collectionName,
          });
          this.client.metrics.increment(
            MetricNames.BULK_ITEMS_PROCESSED,
            operations.length,
            { collection: this.collectionName }
          );
          this.client.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: 'bulkWrite', collection: this.collectionName }
          );

          this.client.logger.info('Bulk write completed', {
            database: this.databaseName,
            collection: this.collectionName,
            insertedCount: result.insertedCount,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            deletedCount: result.deletedCount,
            upsertedCount: result.upsertedCount,
          });

          span.setAttribute('insertedCount', result.insertedCount);
          span.setAttribute('modifiedCount', result.modifiedCount);
          span.setAttribute('deletedCount', result.deletedCount);
          span.setStatus('OK');
          return result;
        } catch (error) {
          this.handleError('bulkWrite', error, span);
          throw error;
        }
      },
      { operation: 'bulkWrite' }
    );
  }

  /**
   * Initializes an ordered bulk operation builder.
   *
   * @returns Bulk operation builder
   */
  initializeOrderedBulkOp(): BulkOperationBuilder<T> {
    this.client.logger.debug('Initializing ordered bulk operation', {
      database: this.databaseName,
      collection: this.collectionName,
    });

    const bulk = this.collection.initializeOrderedBulkOp();
    return this.createBulkOperationBuilder(bulk, true);
  }

  /**
   * Initializes an unordered bulk operation builder.
   *
   * @returns Bulk operation builder
   */
  initializeUnorderedBulkOp(): BulkOperationBuilder<T> {
    this.client.logger.debug('Initializing unordered bulk operation', {
      database: this.databaseName,
      collection: this.collectionName,
    });

    const bulk = this.collection.initializeUnorderedBulkOp();
    return this.createBulkOperationBuilder(bulk, false);
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Creates a bulk operation builder wrapper.
   */
  private createBulkOperationBuilder(
    bulk: any,
    ordered: boolean
  ): BulkOperationBuilder<T> {
    const client = this.client;
    const collectionName = this.collectionName;
    const databaseName = this.databaseName;

    let operationCount = 0;

    const builder: BulkOperationBuilder<T> = {
      insert(document: T) {
        bulk.insert(document);
        operationCount++;
        return this;
      },

      find(filter: Filter<T>) {
        const bulkFind = bulk.find(filter);
        let upsertEnabled = false;

        const finder: BulkOperationFinder<T> = {
          updateOne(update: UpdateFilter<T>) {
            if (upsertEnabled) {
              bulkFind.upsert().updateOne(update);
            } else {
              bulkFind.updateOne(update);
            }
            operationCount++;
            return builder;
          },

          update(update: UpdateFilter<T>) {
            if (upsertEnabled) {
              bulkFind.upsert().update(update);
            } else {
              bulkFind.update(update);
            }
            operationCount++;
            return builder;
          },

          replaceOne(replacement: T) {
            if (upsertEnabled) {
              bulkFind.upsert().replaceOne(replacement);
            } else {
              bulkFind.replaceOne(replacement);
            }
            operationCount++;
            return builder;
          },

          deleteOne() {
            bulkFind.deleteOne();
            operationCount++;
            return builder;
          },

          delete() {
            bulkFind.delete();
            operationCount++;
            return builder;
          },

          upsert() {
            upsertEnabled = true;
            return this;
          },
        };

        return finder;
      },

      async execute() {
        return client.tracer.withSpan(
          'mongodb.collection.bulkOp.execute',
          async (span) => {
            const startTime = Date.now();
            span.setAttribute('database', databaseName);
            span.setAttribute('collection', collectionName);
            span.setAttribute('operationCount', operationCount);
            span.setAttribute('ordered', ordered);

            client.logger.debug('Executing bulk operation', {
              database: databaseName,
              collection: collectionName,
              operationCount,
              ordered,
            });

            try {
              const result = await client.execute(() => bulk.execute());

              // Record metrics
              client.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
                operation: 'bulkOp.execute',
                collection: collectionName,
              });
              client.metrics.increment(MetricNames.BULK_OPERATIONS_TOTAL, 1, {
                collection: collectionName,
              });
              client.metrics.increment(
                MetricNames.BULK_ITEMS_PROCESSED,
                operationCount,
                { collection: collectionName }
              );
              client.metrics.timing(
                MetricNames.OPERATION_LATENCY,
                Date.now() - startTime,
                { operation: 'bulkOp.execute', collection: collectionName }
              );

              client.logger.info('Bulk operation completed', {
                database: databaseName,
                collection: collectionName,
                insertedCount: result.nInserted,
                matchedCount: result.nMatched,
                modifiedCount: result.nModified,
                deletedCount: result.nRemoved,
                upsertedCount: result.nUpserted,
              });

              span.setStatus('OK');

              // Convert driver result to our BulkWriteResult format
              return {
                insertedCount: result.nInserted ?? 0,
                matchedCount: result.nMatched ?? 0,
                modifiedCount: result.nModified ?? 0,
                deletedCount: result.nRemoved ?? 0,
                upsertedCount: result.nUpserted ?? 0,
                upsertedIds: result.upsertedIds ?? {},
                acknowledged: true,
              };
            } catch (error) {
              client.logger.error('Bulk operation failed', {
                database: databaseName,
                collection: collectionName,
                error: (error as Error).message,
              });
              client.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
                operation: 'bulkOp.execute',
                collection: collectionName,
              });
              span.recordException(error as Error);
              throw parseMongoDBError(error);
            }
          },
          { operation: 'bulkOp.execute' }
        );
      },
    };

    return builder;
  }

  /**
   * Sanitizes filter for logging (removes sensitive data).
   */
  private sanitizeFilter(filter: Filter<T>): Record<string, unknown> {
    // In a real implementation, this would remove sensitive fields
    // For now, just return field names without values
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(filter)) {
      sanitized[key] = '[FILTERED]';
    }
    return sanitized;
  }

  /**
   * Handles errors from MongoDB operations.
   */
  private handleError(operation: string, error: unknown, span: any): void {
    const mongoError = parseMongoDBError(error);

    this.client.logger.error(`MongoDB ${operation} failed`, {
      database: this.databaseName,
      collection: this.collectionName,
      error: mongoError.message,
      code: mongoError.code,
    });

    this.client.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
      operation,
      collection: this.collectionName,
      error_code: mongoError.code,
    });

    span.recordException(mongoError);
    span.setStatus('ERROR', mongoError.message);
  }
}

/**
 * Creates a MongoDBCollection instance.
 *
 * @param collection - MongoDB driver Collection instance
 * @param client - MongoDBClient for resilience and observability
 * @param dbName - Database name
 * @param collName - Collection name
 * @returns MongoDBCollection instance
 */
export function createMongoDBCollection<T extends Document = Document>(
  collection: Collection<T>,
  client: MongoDBClient,
  dbName: string,
  collName: string
): MongoDBCollection<T> {
  return new MongoDBCollection<T>(collection, client, dbName, collName);
}
