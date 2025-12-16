/**
 * Query Builder
 *
 * Fluent builder for constructing DynamoDB Query operations
 * with support for key conditions, filters, and pagination.
 */

import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';

/**
 * Options for query operations
 */
export interface QueryOptions {
  /** Index name for querying a secondary index */
  indexName?: string;
  /** Filter expression for additional filtering */
  filterExpression?: string;
  /** Expression attribute names for filter */
  filterNames?: Record<string, string>;
  /** Expression attribute values for filter */
  filterValues?: Record<string, any>;
  /** Attributes to project (retrieve) */
  projectionExpression?: string;
  /** Maximum number of items to return */
  limit?: number;
  /** Sort order (true = descending, false = ascending) */
  scanIndexForward?: boolean;
  /** Consistent read flag */
  consistentRead?: boolean;
  /** Exclusive start key for pagination */
  exclusiveStartKey?: Record<string, any>;
}

/**
 * Result of a query operation
 */
export interface QueryResult<T> {
  /** Items returned by the query */
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
 * Sort key condition types
 */
type SortKeyCondition = {
  type: 'equals' | 'lessThan' | 'lessOrEqual' | 'greaterThan' | 'greaterOrEqual' | 'between' | 'beginsWith';
  values: any[];
};

/**
 * Paginator for iterating through query results
 */
export class QueryPaginator<T> {
  private builder: QueryBuilder<T>;
  private lastEvaluatedKey?: Record<string, any>;
  private done = false;

  constructor(builder: QueryBuilder<T>) {
    this.builder = builder;
  }

  /**
   * Get the next page of results
   *
   * @returns The next page of results, or null if done
   */
  async next(): Promise<QueryResult<T> | null> {
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
  async *[Symbol.asyncIterator](): AsyncIterableIterator<QueryResult<T>> {
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
 * Builder for DynamoDB Query operations
 *
 * Provides a fluent interface for constructing and executing queries
 * with proper key conditions, filters, and pagination support.
 *
 * @template T - The type of items being queried
 *
 * @example
 * ```typescript
 * const results = await new QueryBuilder<User>(docClient, 'Users', 'userId')
 *   .partitionKey('user-123')
 *   .sortKeyBeginsWith('order-')
 *   .filter('amount > :amount')
 *   .limit(10)
 *   .execute();
 * ```
 */
export class QueryBuilder<T = any> {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  private pkName: string;
  private skName?: string;
  private pkValue?: any;
  private skCondition?: SortKeyCondition;
  private options: QueryOptions = {};
  private nameCounter = 0;
  private valueCounter = 0;
  private names: Record<string, string> = {};
  private values: Record<string, any> = {};

  /**
   * Create a new QueryBuilder
   *
   * @param docClient - The DynamoDB DocumentClient
   * @param tableName - The name of the table to query
   * @param pkName - The partition key attribute name
   * @param skName - The sort key attribute name (optional)
   */
  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    pkName: string,
    skName?: string
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.pkName = pkName;
    this.skName = skName;
  }

  /**
   * Set the partition key value
   *
   * @param value - The partition key value
   * @returns This builder for chaining
   */
  partitionKey(value: any): QueryBuilder<T> {
    this.pkValue = value;
    return this;
  }

  /**
   * Add a sort key equals condition
   *
   * @param value - The value to match
   * @returns This builder for chaining
   */
  sortKeyEquals(value: any): QueryBuilder<T> {
    this.skCondition = { type: 'equals', values: [value] };
    return this;
  }

  /**
   * Add a sort key begins_with condition
   *
   * @param prefix - The prefix to match
   * @returns This builder for chaining
   */
  sortKeyBeginsWith(prefix: string): QueryBuilder<T> {
    this.skCondition = { type: 'beginsWith', values: [prefix] };
    return this;
  }

  /**
   * Add a sort key between condition
   *
   * @param low - The lower bound (inclusive)
   * @param high - The upper bound (inclusive)
   * @returns This builder for chaining
   */
  sortKeyBetween(low: any, high: any): QueryBuilder<T> {
    this.skCondition = { type: 'between', values: [low, high] };
    return this;
  }

  /**
   * Add a sort key less than condition
   *
   * @param value - The value to compare
   * @returns This builder for chaining
   */
  sortKeyLessThan(value: any): QueryBuilder<T> {
    this.skCondition = { type: 'lessThan', values: [value] };
    return this;
  }

  /**
   * Add a sort key less than or equal condition
   *
   * @param value - The value to compare
   * @returns This builder for chaining
   */
  sortKeyLessOrEqual(value: any): QueryBuilder<T> {
    this.skCondition = { type: 'lessOrEqual', values: [value] };
    return this;
  }

  /**
   * Add a sort key greater than condition
   *
   * @param value - The value to compare
   * @returns This builder for chaining
   */
  sortKeyGreaterThan(value: any): QueryBuilder<T> {
    this.skCondition = { type: 'greaterThan', values: [value] };
    return this;
  }

  /**
   * Add a sort key greater than or equal condition
   *
   * @param value - The value to compare
   * @returns This builder for chaining
   */
  sortKeyGreaterOrEqual(value: any): QueryBuilder<T> {
    this.skCondition = { type: 'greaterOrEqual', values: [value] };
    return this;
  }

  /**
   * Specify a secondary index to query
   *
   * @param indexName - The name of the index
   * @returns This builder for chaining
   */
  index(indexName: string): QueryBuilder<T> {
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
  filter(expression: string, names?: Record<string, string>, values?: Record<string, any>): QueryBuilder<T> {
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
   * Specify attributes to project (retrieve)
   *
   * @param attributes - Array of attribute names to retrieve
   * @returns This builder for chaining
   */
  projection(attributes: string[]): QueryBuilder<T> {
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
  limit(limit: number): QueryBuilder<T> {
    this.options.limit = limit;
    return this;
  }

  /**
   * Sort results in descending order
   *
   * @returns This builder for chaining
   */
  descending(): QueryBuilder<T> {
    this.options.scanIndexForward = false;
    return this;
  }

  /**
   * Sort results in ascending order
   *
   * @returns This builder for chaining
   */
  ascending(): QueryBuilder<T> {
    this.options.scanIndexForward = true;
    return this;
  }

  /**
   * Enable consistent read
   *
   * @returns This builder for chaining
   */
  consistentRead(): QueryBuilder<T> {
    this.options.consistentRead = true;
    return this;
  }

  /**
   * Build the key condition expression
   */
  private buildKeyCondition(): { expression: string; names: Record<string, string>; values: Record<string, any> } {
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};
    const conditions: string[] = [];

    // Partition key condition (required)
    const pkNameKey = `#pk`;
    const pkValueKey = `:pk`;
    names[pkNameKey] = this.pkName;
    values[pkValueKey] = this.pkValue;
    conditions.push(`${pkNameKey} = ${pkValueKey}`);

    // Sort key condition (optional)
    if (this.skCondition && this.skName) {
      const skNameKey = `#sk`;
      names[skNameKey] = this.skName;

      switch (this.skCondition.type) {
        case 'equals':
          values[':sk'] = this.skCondition.values[0];
          conditions.push(`${skNameKey} = :sk`);
          break;
        case 'lessThan':
          values[':sk'] = this.skCondition.values[0];
          conditions.push(`${skNameKey} < :sk`);
          break;
        case 'lessOrEqual':
          values[':sk'] = this.skCondition.values[0];
          conditions.push(`${skNameKey} <= :sk`);
          break;
        case 'greaterThan':
          values[':sk'] = this.skCondition.values[0];
          conditions.push(`${skNameKey} > :sk`);
          break;
        case 'greaterOrEqual':
          values[':sk'] = this.skCondition.values[0];
          conditions.push(`${skNameKey} >= :sk`);
          break;
        case 'between':
          values[':sk_low'] = this.skCondition.values[0];
          values[':sk_high'] = this.skCondition.values[1];
          conditions.push(`${skNameKey} BETWEEN :sk_low AND :sk_high`);
          break;
        case 'beginsWith':
          values[':sk'] = this.skCondition.values[0];
          conditions.push(`begins_with(${skNameKey}, :sk)`);
          break;
      }
    }

    return {
      expression: conditions.join(' AND '),
      names,
      values,
    };
  }

  /**
   * Execute the query
   *
   * @param exclusiveStartKey - Optional start key for pagination
   * @returns Query results
   */
  async execute(exclusiveStartKey?: Record<string, any>): Promise<QueryResult<T>> {
    if (!this.pkValue) {
      throw new Error('Partition key value is required');
    }

    const keyCondition = this.buildKeyCondition();

    // Merge all names and values
    const allNames = {
      ...keyCondition.names,
      ...this.names,
      ...this.options.filterNames,
    };
    const allValues = {
      ...keyCondition.values,
      ...this.values,
      ...this.options.filterValues,
    };

    const input: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: keyCondition.expression,
      ExpressionAttributeNames: Object.keys(allNames).length > 0 ? allNames : undefined,
      ExpressionAttributeValues: Object.keys(allValues).length > 0 ? allValues : undefined,
      IndexName: this.options.indexName,
      FilterExpression: this.options.filterExpression,
      ProjectionExpression: this.options.projectionExpression,
      Limit: this.options.limit,
      ScanIndexForward: this.options.scanIndexForward,
      ConsistentRead: this.options.consistentRead,
      ExclusiveStartKey: exclusiveStartKey || this.options.exclusiveStartKey,
    };

    const command = new QueryCommand(input);
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
  paginator(): QueryPaginator<T> {
    return new QueryPaginator(this);
  }

  /**
   * Execute the query and return all pages
   *
   * @param maxPages - Maximum number of pages to fetch (default: unlimited)
   * @returns All items from all pages
   */
  async all(maxPages?: number): Promise<T[]> {
    return this.paginator().all(maxPages);
  }
}
