/**
 * DynamoDB Client
 *
 * Provides the main client interface for DynamoDB operations following SPARC specification.
 * Wraps AWS SDK DynamoDBDocumentClient with resilience, observability, and a clean API.
 */

import {
  DynamoDBClient as AWSDynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';

import type { DynamoDBConfig } from '../config/index.js';
import { Logger, ConsoleLogger } from '../observability/logging.js';
import { MetricsCollector, InMemoryMetricsCollector, DynamoDBMetricNames } from '../observability/metrics.js';
import { Tracer, DefaultTracer, DynamoDBSpan } from '../observability/tracing.js';
import { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from '../resilience/circuit-breaker.js';
import { DynamoDBRetryExecutor, createDefaultRetryConfig } from '../resilience/retry.js';
import type {
  Key,
  AttributeValue,
  Item,
  GetItemOptions,
  PutItemOptions,
  UpdateItemOptions,
  DeleteItemOptions,
  QueryOptions,
  ScanOptions,
  GetItemResult,
  PutItemResult,
  UpdateItemResult,
  DeleteItemResult,
  QueryResult,
  ScanResult,
  BatchGetResult,
  BatchWriteResult,
  WriteRequest,
} from '../types/index.js';
import { toKeyMap } from '../types/index.js';
import { getItem } from '../operations/get.js';
import { putItem } from '../operations/put.js';
import { updateItem } from '../operations/update.js';
import { deleteItem } from '../operations/delete.js';
import { query } from '../operations/query.js';
import { scan } from '../operations/scan.js';

// ============================================================================
// TableClient - Scoped to a specific table
// ============================================================================

/**
 * Table-scoped client for DynamoDB operations.
 *
 * Provides a clean API for CRUD operations on a specific table,
 * with built-in resilience and observability.
 */
export class TableClient<T extends Item = Item> {
  private readonly tableName: string;
  private readonly pkName: string;
  private readonly skName?: string;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryExecutor: DynamoDBRetryExecutor;

  /**
   * Creates a new TableClient instance.
   *
   * @param tableName - Name of the DynamoDB table
   * @param pkName - Name of the partition key attribute
   * @param skName - Name of the sort key attribute (optional)
   * @param docClient - DynamoDB Document Client instance
   * @param logger - Logger instance
   * @param metrics - Metrics collector instance
   * @param tracer - Tracer instance
   * @param circuitBreaker - Circuit breaker instance
   * @param retryExecutor - Retry executor instance
   */
  constructor(
    tableName: string,
    pkName: string,
    skName: string | undefined,
    docClient: DynamoDBDocumentClient,
    logger: Logger,
    metrics: MetricsCollector,
    tracer: Tracer,
    circuitBreaker: CircuitBreaker,
    retryExecutor: DynamoDBRetryExecutor
  ) {
    this.tableName = tableName;
    this.pkName = pkName;
    this.skName = skName;
    this.docClient = docClient;
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.circuitBreaker = circuitBreaker;
    this.retryExecutor = retryExecutor;
  }

  /**
   * Gets the table name.
   */
  get name(): string {
    return this.tableName;
  }

  /**
   * Gets the partition key name.
   */
  get partitionKeyName(): string {
    return this.pkName;
  }

  /**
   * Gets the sort key name (if configured).
   */
  get sortKeyName(): string | undefined {
    return this.skName;
  }

  /**
   * Retrieves a single item by its primary key.
   *
   * @param key - Primary key of the item
   * @param options - Get operation options
   * @returns Result containing the item (if found) and consumed capacity
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * const result = await table.get({ partitionKey: 'user-123' });
   * if (result.item) {
   *   console.log('User found:', result.item);
   * }
   * ```
   */
  async get(key: Key, options?: GetItemOptions): Promise<GetItemResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:GetItem', this.tableName, {
      pk: String(key.partitionKey),
      sk: key.sortKey ? String(key.sortKey) : undefined,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        return await getItem<T>(
          this.docClient,
          this.tableName,
          key,
          this.pkName,
          this.skName,
          options
        );
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'GetItem',
        table: this.tableName,
        status: 'success',
      });

      this.logger.debug('GetItem succeeded', {
        tableName: this.tableName,
        found: !!result.item,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'GetItem',
        table: this.tableName,
      });
      this.logger.error('GetItem failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Puts (creates or replaces) an item in the table.
   *
   * @param item - Item to put
   * @param options - Put operation options
   * @returns Result containing the old item (if requested) and consumed capacity
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * await table.put({
   *   userId: 'user-123',
   *   email: 'user@example.com',
   *   name: 'John Doe'
   * });
   * ```
   */
  async put(item: T, options?: PutItemOptions): Promise<PutItemResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:PutItem', this.tableName);

    try {
      const result = await this.executeWithResilience(async () => {
        return await putItem<T>(
          this.docClient,
          this.tableName,
          item,
          options
        );
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'PutItem',
        table: this.tableName,
        status: 'success',
      });

      this.logger.debug('PutItem succeeded', {
        tableName: this.tableName,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'PutItem',
        table: this.tableName,
      });
      this.logger.error('PutItem failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Updates an existing item in the table.
   *
   * @param key - Primary key of the item
   * @param updateExpression - Update expression (e.g., "SET #name = :name")
   * @param expressionNames - Expression attribute names mapping
   * @param expressionValues - Expression attribute values for update
   * @param options - Update operation options
   * @returns Result containing the updated attributes and consumed capacity
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * await table.update(
   *   { partitionKey: 'user-123' },
   *   'SET #email = :email, #updatedAt = :now',
   *   { '#email': 'email', '#updatedAt': 'updatedAt' },
   *   { ':email': 'new@example.com', ':now': Date.now() },
   *   { returnNewValues: true }
   * );
   * ```
   */
  async update(
    key: Key,
    updateExpression: string,
    expressionNames: Record<string, string>,
    expressionValues: Record<string, AttributeValue>,
    options?: UpdateItemOptions
  ): Promise<UpdateItemResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:UpdateItem', this.tableName, {
      pk: String(key.partitionKey),
      sk: key.sortKey ? String(key.sortKey) : undefined,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        return await updateItem<T>(
          this.docClient,
          this.tableName,
          key,
          this.pkName,
          this.skName,
          updateExpression,
          expressionNames,
          expressionValues,
          options
        );
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'UpdateItem',
        table: this.tableName,
        status: 'success',
      });

      this.logger.debug('UpdateItem succeeded', {
        tableName: this.tableName,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'UpdateItem',
        table: this.tableName,
      });
      this.logger.error('UpdateItem failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Deletes an item from the table.
   *
   * @param key - Primary key of the item to delete
   * @param options - Delete operation options
   * @returns Result containing the deleted item (if requested) and consumed capacity
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * await table.delete({ partitionKey: 'user-123' });
   * ```
   */
  async delete(key: Key, options?: DeleteItemOptions): Promise<DeleteItemResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:DeleteItem', this.tableName, {
      pk: String(key.partitionKey),
      sk: key.sortKey ? String(key.sortKey) : undefined,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        return await deleteItem<T>(
          this.docClient,
          this.tableName,
          key,
          this.pkName,
          this.skName,
          options
        );
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'DeleteItem',
        table: this.tableName,
        status: 'success',
      });

      this.logger.debug('DeleteItem succeeded', {
        tableName: this.tableName,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'DeleteItem',
        table: this.tableName,
      });
      this.logger.error('DeleteItem failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Queries items from the table or index.
   *
   * @param pkValue - Value of the partition key to match
   * @param options - Query options (sort key condition, filtering, pagination, etc.)
   * @returns Query result with items and pagination info
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId', 'dataType');
   * const result = await table.query('user-123', {
   *   filterExpression: 'dataType = :type',
   *   limit: 10
   * });
   * ```
   */
  async query(pkValue: AttributeValue, options?: QueryOptions): Promise<QueryResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:Query', this.tableName, {
      pk: String(pkValue),
      indexName: options?.indexName,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        return await query<T>(
          this.docClient,
          this.tableName,
          this.pkName,
          pkValue,
          options
        );
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'Query',
        table: this.tableName,
        status: 'success',
      });
      this.metrics.recordHistogram(DynamoDBMetricNames.ITEMS_RETURNED, result.count, {
        operation: 'Query',
        table: this.tableName,
      });

      this.logger.debug('Query succeeded', {
        tableName: this.tableName,
        count: result.count,
        scannedCount: result.scannedCount,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'Query',
        table: this.tableName,
      });
      this.logger.error('Query failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Scans items from the table or index.
   *
   * Note: Scan is less efficient than query and should be used sparingly.
   *
   * @param options - Scan options (filtering, pagination, parallel scanning, etc.)
   * @returns Scan result with items and pagination info
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * const result = await table.scan({
   *   filterExpression: 'age > :age',
   *   limit: 100
   * });
   * ```
   */
  async scan(options?: ScanOptions): Promise<ScanResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:Scan', this.tableName, {
      indexName: options?.indexName,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        return await scan<T>(
          this.docClient,
          this.tableName,
          options
        );
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'Scan',
        table: this.tableName,
        status: 'success',
      });
      this.metrics.recordHistogram(DynamoDBMetricNames.ITEMS_RETURNED, result.count, {
        operation: 'Scan',
        table: this.tableName,
      });

      this.logger.debug('Scan succeeded', {
        tableName: this.tableName,
        count: result.count,
        scannedCount: result.scannedCount,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'Scan',
        table: this.tableName,
      });
      this.logger.error('Scan failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Batch retrieves multiple items by their primary keys.
   *
   * @param keys - Array of primary keys to retrieve
   * @returns Result containing retrieved items and unprocessed keys
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * const result = await table.batchGet([
   *   { partitionKey: 'user-123' },
   *   { partitionKey: 'user-456' },
   *   { partitionKey: 'user-789' }
   * ]);
   * ```
   */
  async batchGet(keys: Key[]): Promise<BatchGetResult<T>> {
    const span = this.tracer.startSpan('DynamoDB:BatchGetItem', this.tableName, {
      itemCount: keys.length,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        // Convert keys to DynamoDB format
        const keyMaps = keys.map((key) => toKeyMap(key, this.pkName, this.skName));

        const command = new BatchGetCommand({
          RequestItems: {
            [this.tableName]: {
              Keys: keyMaps,
            },
          },
          ReturnConsumedCapacity: 'TOTAL',
        });

        const response = await this.docClient.send(command);

        const items = (response.Responses?.[this.tableName] as T[]) || [];
        const unprocessedKeys = response.UnprocessedKeys?.[this.tableName]?.Keys?.map((keyMap) => ({
          partitionKey: keyMap[this.pkName],
          sortKey: this.skName ? keyMap[this.skName] : undefined,
        }));

        return {
          items,
          unprocessedKeys,
          consumedCapacity: response.ConsumedCapacity?.map((cc) => ({
            tableCapacity: cc.CapacityUnits || 0,
          })),
        };
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'BatchGetItem',
        table: this.tableName,
        status: 'success',
      });
      this.metrics.recordHistogram(DynamoDBMetricNames.ITEMS_RETURNED, result.items.length, {
        operation: 'BatchGetItem',
        table: this.tableName,
      });

      if (result.unprocessedKeys && result.unprocessedKeys.length > 0) {
        this.metrics.incrementCounter(DynamoDBMetricNames.BATCH_UNPROCESSED, result.unprocessedKeys.length, {
          operation: 'BatchGetItem',
          table: this.tableName,
        });
      }

      this.logger.debug('BatchGetItem succeeded', {
        tableName: this.tableName,
        requested: keys.length,
        retrieved: result.items.length,
        unprocessed: result.unprocessedKeys?.length || 0,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'BatchGetItem',
        table: this.tableName,
      });
      this.logger.error('BatchGetItem failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Batch writes (puts or deletes) multiple items.
   *
   * @param operations - Array of write operations (put or delete)
   * @returns Result containing processed count and unprocessed items
   *
   * @example
   * ```typescript
   * const table = client.table('Users', 'userId');
   * await table.batchWrite([
   *   { type: 'put', item: { userId: 'user-123', name: 'John' } },
   *   { type: 'put', item: { userId: 'user-456', name: 'Jane' } },
   *   { type: 'delete', key: { partitionKey: 'user-789' } }
   * ]);
   * ```
   */
  async batchWrite(operations: WriteRequest[]): Promise<BatchWriteResult> {
    const span = this.tracer.startSpan('DynamoDB:BatchWriteItem', this.tableName, {
      itemCount: operations.length,
    });

    try {
      const result = await this.executeWithResilience(async () => {
        // Convert operations to DynamoDB format
        const requestItems = operations.map((op) => {
          if (op.type === 'put') {
            return { PutRequest: { Item: op.item } };
          } else {
            const keyMap = toKeyMap(op.key, this.pkName, this.skName);
            return { DeleteRequest: { Key: keyMap } };
          }
        });

        const command = new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: requestItems,
          },
          ReturnConsumedCapacity: 'TOTAL',
        });

        const response = await this.docClient.send(command);

        const unprocessedItems = response.UnprocessedItems?.[this.tableName]?.map((item) => {
          if ('PutRequest' in item) {
            return {
              type: 'put' as const,
              item: item.PutRequest!.Item as Record<string, AttributeValue>,
            };
          } else {
            const key = item.DeleteRequest!.Key!;
            return {
              type: 'delete' as const,
              key: {
                partitionKey: key[this.pkName],
                sortKey: this.skName ? key[this.skName] : undefined,
              },
            };
          }
        });

        const processedCount = operations.length - (unprocessedItems?.length || 0);

        return {
          processedCount,
          unprocessedItems,
          consumedCapacity: response.ConsumedCapacity?.map((cc) => ({
            tableCapacity: cc.CapacityUnits || 0,
          })),
        };
      });

      this.tracer.finishSpan(span);
      this.metrics.incrementCounter(DynamoDBMetricNames.OPERATIONS_TOTAL, 1, {
        operation: 'BatchWriteItem',
        table: this.tableName,
        status: 'success',
      });

      if (result.unprocessedItems && result.unprocessedItems.length > 0) {
        this.metrics.incrementCounter(DynamoDBMetricNames.BATCH_UNPROCESSED, result.unprocessedItems.length, {
          operation: 'BatchWriteItem',
          table: this.tableName,
        });
      }

      this.logger.debug('BatchWriteItem succeeded', {
        tableName: this.tableName,
        requested: operations.length,
        processed: result.processedCount,
        unprocessed: result.unprocessedItems?.length || 0,
      });

      return result;
    } catch (error) {
      this.tracer.finishSpanWithError(span, error as Error);
      this.metrics.incrementCounter(DynamoDBMetricNames.ERRORS, 1, {
        operation: 'BatchWriteItem',
        table: this.tableName,
      });
      this.logger.error('BatchWriteItem failed', {
        tableName: this.tableName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Executes an operation with circuit breaker and retry logic.
   *
   * @param operation - Operation to execute
   * @returns Operation result
   */
  private async executeWithResilience<R>(operation: () => Promise<R>): Promise<R> {
    return await this.circuitBreaker.execute(async () => {
      return await this.retryExecutor.execute(operation);
    });
  }
}

// ============================================================================
// DynamoDB Client
// ============================================================================

/**
 * Main DynamoDB client with resilience and observability.
 *
 * Wraps AWS SDK DynamoDBDocumentClient and provides a clean API
 * for creating table-scoped clients.
 */
export class DynamoDBClient {
  private readonly config: DynamoDBConfig;
  private readonly awsClient: AWSDynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryExecutor: DynamoDBRetryExecutor;

  /**
   * Creates a new DynamoDB client instance.
   *
   * @param config - DynamoDB configuration
   *
   * @example
   * ```typescript
   * const client = new DynamoDBClient({
   *   region: 'us-east-1',
   *   retryConfig: {
   *     maxAttempts: 5,
   *     baseDelayMs: 100,
   *     maxDelayMs: 5000
   *   }
   * });
   * ```
   */
  constructor(config: DynamoDBConfig) {
    this.config = config;

    // Initialize observability components
    this.logger = new ConsoleLogger('info');
    this.metrics = new InMemoryMetricsCollector();
    this.tracer = new DefaultTracer('dynamodb');

    // Initialize resilience components
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerConfig || DEFAULT_CIRCUIT_BREAKER_CONFIG
    );
    this.retryExecutor = new DynamoDBRetryExecutor(
      config.retryConfig || createDefaultRetryConfig()
    );

    // Build AWS client configuration
    const awsConfig: DynamoDBClientConfig = {
      region: config.region,
      endpoint: config.endpoint,
    };

    // Configure credentials
    if (config.credentials) {
      switch (config.credentials.type) {
        case 'static':
          awsConfig.credentials = {
            accessKeyId: config.credentials.accessKeyId,
            secretAccessKey: config.credentials.secretAccessKey,
            sessionToken: config.credentials.sessionToken,
          };
          break;
        case 'profile':
          awsConfig.credentials = fromIni({
            profile: config.credentials.profileName,
          });
          break;
        case 'environment':
          // AWS SDK automatically uses environment variables
          break;
        // Additional credential types would be handled here
      }
    }

    // Configure timeout
    if (config.timeout) {
      awsConfig.requestHandler = {
        metadata: { handlerProtocol: 'http/1.1' },
        handle: async (request: any) => {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), config.timeout);
          });
          return Promise.race([request, timeoutPromise]);
        },
      } as any;
    }

    // Create AWS clients
    this.awsClient = new AWSDynamoDBClient(awsConfig);
    this.docClient = DynamoDBDocumentClient.from(this.awsClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });

    this.logger.info('DynamoDB client initialized', {
      region: config.region,
      endpoint: config.endpoint,
    });
  }

  /**
   * Creates a table-scoped client for the specified table.
   *
   * @param tableName - Name of the DynamoDB table
   * @param pkName - Name of the partition key attribute
   * @param skName - Name of the sort key attribute (optional)
   * @returns TableClient instance for the specified table
   *
   * @example
   * ```typescript
   * // Simple primary key (partition key only)
   * const usersTable = client.table('Users', 'userId');
   *
   * // Composite primary key (partition key + sort key)
   * const ordersTable = client.table('Orders', 'userId', 'orderId');
   * ```
   */
  table<T extends Item = Item>(
    tableName: string,
    pkName: string,
    skName?: string
  ): TableClient<T> {
    return new TableClient<T>(
      tableName,
      pkName,
      skName,
      this.docClient,
      this.logger,
      this.metrics,
      this.tracer,
      this.circuitBreaker,
      this.retryExecutor
    );
  }

  /**
   * Gets the underlying DynamoDB Document Client.
   *
   * Use this for advanced operations not covered by the TableClient API.
   *
   * @returns DynamoDB Document Client instance
   */
  getDocumentClient(): DynamoDBDocumentClient {
    return this.docClient;
  }

  /**
   * Gets the underlying AWS DynamoDB Client.
   *
   * Use this for low-level AWS SDK operations.
   *
   * @returns AWS DynamoDB Client instance
   */
  getAWSClient(): AWSDynamoDBClient {
    return this.awsClient;
  }

  /**
   * Gets the logger instance.
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Gets the metrics collector instance.
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Gets the tracer instance.
   */
  getTracer(): Tracer {
    return this.tracer;
  }

  /**
   * Gets circuit breaker statistics.
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Resets circuit breaker state.
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Closes the client and releases resources.
   */
  async close(): Promise<void> {
    this.logger.info('Closing DynamoDB client');
    this.awsClient.destroy();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a DynamoDB client from configuration.
 *
 * @param config - DynamoDB configuration
 * @returns DynamoDB client instance
 */
export function createDynamoDBClient(config: DynamoDBConfig): DynamoDBClient {
  return new DynamoDBClient(config);
}
