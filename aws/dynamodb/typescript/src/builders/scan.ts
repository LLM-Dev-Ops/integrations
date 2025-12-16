/**
 * Scan Builder
 *
 * Fluent builder for constructing DynamoDB Scan operations
 * with support for filters and pagination.
 */

import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';

/**
 * Options for scan operations
 */
export interface ScanOptions {
  /** Index name for scanning a secondary index */
  indexName?: string;
  /** Filter expression */
  filterExpression?: string;
  /** Expression attribute names for filter */
  filterNames?: Record<string, string>;
  /** Expression attribute values for filter */
  filterValues?: Record<string, any>;
  /** Attributes to project (retrieve) */
  projectionExpression?: string;
  /** Maximum number of items to return */
  limit?: number;
  /** Consistent read flag */
  consistentRead?: boolean;
  /** Exclusive start key for pagination */
  exclusiveStartKey?: Record<string, any>;
  /** Segment number for parallel scans */
  segment?: number;
  /** Total number of segments for parallel scans */
  totalSegments?: number;
}

/**
 * Result of a scan operation
 */
export interface ScanResult<T> {
  /** Items returned by the scan */
  items: T[];
  /** Last evaluated key for pagination */
  lastEvaluatedKey?: Record<string, any>;
  /** Number of items evaluated before filter was applied */
  scannedCount: number;
  /** Number of items returned */
  count: number;
  /** Consumed capacity information */
  consumedCapacity?: any;
}

/**
 * Paginator for iterating through scan results
 */
export class ScanPaginator<T> {
  private builder: ScanBuilder<T>;
  private lastEvaluatedKey?: Record<string, any>;
  private done = false;

  constructor(builder: ScanBuilder<T>) {
    this.builder = builder;
  }

  /**
   * Get the next page of results
   *
   * @returns The next page of results, or null if done
   */
  async next(): Promise<ScanResult<T> | null> {
    if (this.done) {
      return null;
    }

    const result = await this.builder.execute(this.lastEvaluatedKey);

    if (!result.lastEvaluatedKey) {
      this.done = true;
    } else {
      this.lastEvaluatedKey = result.lastEvaluatedKey;
    }

    return result;
  }

  /**
   * Check if there are more pages
   */
  hasNext(): boolean {
    return !this.done;
  }

  /**
   * Iterate through all pages
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<ScanResult<T>> {
    while (this.hasNext()) {
      const result = await this.next();
      if (result) {
        yield result;
      }
    }
  }

  /**
   * Get all items from all pages
   *
   * @param maxPages - Maximum number of pages to fetch (default: unlimited)
   * @returns All items from all pages
   */
  async all(maxPages?: number): Promise<T[]> {
    const allItems: T[] = [];
    let pageCount = 0;

    while (this.hasNext() && (!maxPages || pageCount < maxPages)) {
      const result = await this.next();
      if (result) {
        allItems.push(...result.items);
        pageCount++;
      }
    }

    return allItems;
  }
}

/**
 * Builder for DynamoDB Scan operations
 *
 * Provides a fluent interface for constructing and executing table scans
 * with proper filters and pagination support.
 *
 * WARNING: Scan operations read every item in a table and can be expensive.
 * Consider using Query with appropriate indexes when possible.
 *
 * @template T - The type of items being scanned
 *
 * @example
 * ```typescript
 * const results = await new ScanBuilder<User>(docClient, 'Users')
 *   .filter('age > :age')
 *   .filterValues({ ':age': 21 })
 *   .limit(100)
 *   .execute();
 * ```
 */
export class ScanBuilder<T = any> {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  private options: ScanOptions = {};
  private nameCounter = 0;
  private names: Record<string, string> = {};
  private values: Record<string, any> = {};

  /**
   * Create a new ScanBuilder
   *
   * @param docClient - The DynamoDB DocumentClient
   * @param tableName - The name of the table to scan
   */
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  /**
   * Specify a secondary index to scan
   *
   * @param indexName - The name of the index
   * @returns This builder for chaining
   */
  index(indexName: string): ScanBuilder<T> {
    this.options.indexName = indexName;
    return this;
  }

  /**
   * Add a filter expression
   *
   * @param expression - The filter expression string
   * @param names - Expression attribute names
   * @param values - Expression attribute values
   * @returns This builder for chaining
   */
  filter(expression: string, names?: Record<string, string>, values?: Record<string, any>): ScanBuilder<T> {
    this.options.filterExpression = expression;
    if (names) {
      this.options.filterNames = names;
    }
    if (values) {
      this.options.filterValues = values;
    }
    return this;
  }

  /**
   * Set filter attribute names
   *
   * @param names - Expression attribute names
   * @returns This builder for chaining
   */
  filterNames(names: Record<string, string>): ScanBuilder<T> {
    this.options.filterNames = { ...this.options.filterNames, ...names };
    return this;
  }

  /**
   * Set filter attribute values
   *
   * @param values - Expression attribute values
   * @returns This builder for chaining
   */
  filterValues(values: Record<string, any>): ScanBuilder<T> {
    this.options.filterValues = { ...this.options.filterValues, ...values };
    return this;
  }

  /**
   * Specify attributes to project (retrieve)
   *
   * @param attributes - Array of attribute names to retrieve
   * @returns This builder for chaining
   */
  projection(attributes: string[]): ScanBuilder<T> {
    const projectionNames: Record<string, string> = {};
    const projectionParts: string[] = [];

    attributes.forEach((attr) => {
      const nameKey = `#proj${this.nameCounter++}`;
      projectionNames[nameKey] = attr;
      projectionParts.push(nameKey);
    });

    this.options.projectionExpression = projectionParts.join(', ');
    this.names = { ...this.names, ...projectionNames };
    return this;
  }

  /**
   * Set the maximum number of items to return
   *
   * @param limit - Maximum number of items
   * @returns This builder for chaining
   */
  limit(limit: number): ScanBuilder<T> {
    this.options.limit = limit;
    return this;
  }

  /**
   * Enable consistent read
   *
   * @returns This builder for chaining
   */
  consistentRead(): ScanBuilder<T> {
    this.options.consistentRead = true;
    return this;
  }

  /**
   * Configure parallel scan
   *
   * Divides the table into segments and scans them in parallel.
   * Use this to improve scan performance on large tables.
   *
   * @param segment - The segment number (0-based)
   * @param totalSegments - Total number of segments
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * // Scan in 4 parallel segments
   * const results = await Promise.all([
   *   new ScanBuilder(client, 'Table').parallel(0, 4).execute(),
   *   new ScanBuilder(client, 'Table').parallel(1, 4).execute(),
   *   new ScanBuilder(client, 'Table').parallel(2, 4).execute(),
   *   new ScanBuilder(client, 'Table').parallel(3, 4).execute(),
   * ]);
   * ```
   */
  parallel(segment: number, totalSegments: number): ScanBuilder<T> {
    if (segment < 0 || segment >= totalSegments) {
      throw new Error(`Segment ${segment} must be between 0 and ${totalSegments - 1}`);
    }
    this.options.segment = segment;
    this.options.totalSegments = totalSegments;
    return this;
  }

  /**
   * Execute the scan
   *
   * @param exclusiveStartKey - Optional start key for pagination
   * @returns Scan results
   */
  async execute(exclusiveStartKey?: Record<string, any>): Promise<ScanResult<T>> {
    // Merge all names and values
    const allNames = {
      ...this.names,
      ...this.options.filterNames,
    };
    const allValues = {
      ...this.values,
      ...this.options.filterValues,
    };

    const input: ScanCommandInput = {
      TableName: this.tableName,
      ExpressionAttributeNames: Object.keys(allNames).length > 0 ? allNames : undefined,
      ExpressionAttributeValues: Object.keys(allValues).length > 0 ? allValues : undefined,
      IndexName: this.options.indexName,
      FilterExpression: this.options.filterExpression,
      ProjectionExpression: this.options.projectionExpression,
      Limit: this.options.limit,
      ConsistentRead: this.options.consistentRead,
      ExclusiveStartKey: exclusiveStartKey || this.options.exclusiveStartKey,
      Segment: this.options.segment,
      TotalSegments: this.options.totalSegments,
    };

    const command = new ScanCommand(input);
    const response = await this.docClient.send(command);

    return {
      items: (response.Items || []) as T[],
      lastEvaluatedKey: response.LastEvaluatedKey,
      scannedCount: response.ScannedCount || 0,
      count: response.Count || 0,
      consumedCapacity: response.ConsumedCapacity,
    };
  }

  /**
   * Create a paginator for iterating through results
   *
   * @returns A paginator instance
   */
  paginator(): ScanPaginator<T> {
    return new ScanPaginator(this);
  }

  /**
   * Execute the scan and return all pages
   *
   * @param maxPages - Maximum number of pages to fetch (default: unlimited)
   * @returns All items from all pages
   */
  async all(maxPages?: number): Promise<T[]> {
    return this.paginator().all(maxPages);
  }
}
