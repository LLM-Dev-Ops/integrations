/**
 * Firestore Query Service
 *
 * Provides query execution, streaming, aggregation, pagination, and query planning.
 * Following the SPARC specification for Google Firestore integration.
 */

/**
 * Query object representing a Firestore query.
 */
export interface Query {
  /** Collection path to query */
  collection: string;
  /** Optional filter conditions */
  where?: WhereFilter[];
  /** Optional ordering */
  orderBy?: OrderBy[];
  /** Optional limit */
  limit?: number;
  /** Optional offset */
  offset?: number;
  /** Optional start cursor */
  startAt?: Cursor;
  /** Optional end cursor */
  endAt?: Cursor;
  /** Select specific fields */
  select?: string[];
}

/**
 * Where filter for queries.
 */
export interface WhereFilter {
  /** Field path */
  field: string;
  /** Comparison operator */
  operator: '<' | '<=' | '==' | '!=' | '>=' | '>' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';
  /** Value to compare against */
  value: unknown;
}

/**
 * Order by clause.
 */
export interface OrderBy {
  /** Field to order by */
  field: string;
  /** Direction (default: 'asc') */
  direction?: 'asc' | 'desc';
}

/**
 * Cursor for pagination.
 */
export interface Cursor {
  /** Document snapshot values at cursor position */
  values: unknown[];
  /** Whether cursor is before the values (default: false for after) */
  before?: boolean;
}

/**
 * Document snapshot from query results.
 */
export interface DocumentSnapshot {
  /** Document path */
  path: string;
  /** Document ID */
  id: string;
  /** Document data */
  data: FieldValueMap;
  /** Document creation time */
  createTime: Timestamp;
  /** Document update time */
  updateTime: Timestamp;
  /** Document read time */
  readTime: Timestamp;
}

/**
 * Field value map (document data).
 */
export interface FieldValueMap {
  [field: string]: unknown;
}

/**
 * Timestamp representation.
 */
export interface Timestamp {
  seconds: number;
  nanos: number;
}

/**
 * Query result containing documents and metadata.
 */
export interface QueryResult {
  /** Retrieved documents */
  documents: DocumentSnapshot[];
  /** Time at which the query was executed */
  readTime: Timestamp;
}

/**
 * Aggregation specification.
 */
export interface Aggregation {
  /** Aggregation type */
  type: 'count' | 'sum' | 'avg';
  /** Field to aggregate (not used for count) */
  field?: string;
  /** Alias for the aggregation result */
  alias: string;
}

/**
 * Aggregation result.
 */
export interface AggregationResult {
  /** Aggregation values keyed by alias */
  values: Record<string, number | null>;
  /** Time at which the aggregation was executed */
  readTime: Timestamp;
}

/**
 * Paginated query result.
 */
export interface PaginatedResult {
  /** Documents in this page */
  docs: DocumentSnapshot[];
  /** Cursor for next page (undefined if no more pages) */
  nextCursor?: Cursor;
}

/**
 * Query execution plan.
 */
export interface QueryPlan {
  /** Estimated number of documents to scan */
  estimatedDocumentScans: number;
  /** Indexes used by the query */
  indexesUsed: IndexInfo[];
  /** Whether the query requires a full collection scan */
  requiresFullScan: boolean;
  /** Estimated cost (arbitrary units) */
  estimatedCost: number;
}

/**
 * Index information.
 */
export interface IndexInfo {
  /** Index name */
  name: string;
  /** Fields in the index */
  fields: Array<{
    field: string;
    order?: 'asc' | 'desc';
  }>;
}

/**
 * Query snapshot for listeners.
 */
export interface QuerySnapshot {
  /** Documents in the snapshot */
  documents: DocumentSnapshot[];
  /** Document changes since last snapshot */
  changes: DocumentChange[];
  /** Metadata about the snapshot */
  metadata: {
    hasPendingWrites: boolean;
    fromCache: boolean;
  };
}

/**
 * Document change in a query snapshot.
 */
export interface DocumentChange {
  /** Type of change */
  type: 'added' | 'modified' | 'removed';
  /** Document snapshot */
  document: DocumentSnapshot;
  /** Old index in the result set */
  oldIndex: number;
  /** New index in the result set */
  newIndex: number;
}

/**
 * Query service for executing Firestore queries.
 */
export class QueryService {
  /**
   * Execute a query and return all matching documents.
   *
   * @param query - Query specification
   * @returns Query result with documents and read time
   */
  async execute(query: Query): Promise<QueryResult> {
    // Validate query
    this.validateQuery(query);

    // Build gRPC RunQuery request
    const request = this.buildRunQueryRequest(query);

    // Execute query via gRPC
    // Note: This is a placeholder for the actual gRPC call
    // In production, this would use the Firestore gRPC client
    const documents = await this.executeGrpcQuery(request);

    const readTime = this.getCurrentTimestamp();

    return {
      documents,
      readTime,
    };
  }

  /**
   * Execute a query and stream results as they arrive.
   *
   * @param query - Query specification
   * @returns Async iterator of document snapshots
   */
  async *stream(query: Query): AsyncIterator<DocumentSnapshot> {
    // Validate query
    this.validateQuery(query);

    // Build gRPC RunQuery request
    const request = this.buildRunQueryRequest(query);

    // Stream query results via gRPC
    // Note: This is a placeholder for the actual gRPC streaming call
    const stream = this.executeGrpcQueryStream(request);

    for await (const document of stream) {
      yield document;
    }
  }

  /**
   * Execute aggregation queries (count, sum, avg).
   *
   * @param query - Query specification
   * @param aggregations - Aggregations to compute
   * @returns Aggregation result
   */
  async aggregate(query: Query, aggregations: Aggregation[]): Promise<AggregationResult> {
    // Validate query and aggregations
    this.validateQuery(query);
    this.validateAggregations(aggregations);

    // Build gRPC RunAggregationQuery request
    const request = this.buildAggregationQueryRequest(query, aggregations);

    // Execute aggregation via gRPC
    // Note: This is a placeholder for the actual gRPC call
    const values = await this.executeGrpcAggregation(request);

    const readTime = this.getCurrentTimestamp();

    return {
      values,
      readTime,
    };
  }

  /**
   * Execute a query with pagination support.
   *
   * @param query - Query specification
   * @param pageSize - Number of documents per page
   * @param cursor - Optional cursor to start from
   * @returns Paginated result with documents and next cursor
   */
  async paginate(
    query: Query,
    pageSize: number,
    cursor?: Cursor
  ): Promise<PaginatedResult> {
    // Validate inputs
    if (pageSize <= 0) {
      throw new Error(`Invalid page size: ${pageSize} (must be positive)`);
    }

    // Build paginated query
    const paginatedQuery: Query = {
      ...query,
      limit: pageSize + 1, // Fetch one extra to determine if there are more pages
      startAt: cursor,
    };

    // Execute query
    const result = await this.execute(paginatedQuery);

    // Check if there are more pages
    const hasMore = result.documents.length > pageSize;
    const docs = hasMore ? result.documents.slice(0, pageSize) : result.documents;

    // Build next cursor if there are more pages
    let nextCursor: Cursor | undefined;
    if (hasMore) {
      const lastDoc = docs[docs.length - 1]!;
      nextCursor = this.createCursorFromDocument(lastDoc, query.orderBy);
    }

    return {
      docs,
      nextCursor,
    };
  }

  /**
   * Get query execution plan without actually executing the query.
   *
   * @param query - Query specification
   * @returns Query plan with cost estimates
   */
  async explain(query: Query): Promise<QueryPlan> {
    // Validate query
    this.validateQuery(query);

    // Build gRPC ExplainQuery request
    const request = this.buildExplainQueryRequest(query);

    // Execute explain via gRPC
    // Note: This is a placeholder for the actual gRPC call
    const plan = await this.executeGrpcExplain(request);

    return plan;
  }

  /**
   * Validate query specification.
   */
  private validateQuery(query: Query): void {
    if (!query.collection) {
      throw new Error('Query must specify a collection');
    }

    // Validate collection path format
    const pathParts = query.collection.split('/');
    if (pathParts.length % 2 !== 1) {
      throw new Error(`Invalid collection path: ${query.collection} (must have odd number of segments)`);
    }

    // Validate where filters
    if (query.where) {
      for (const filter of query.where) {
        if (!filter.field) {
          throw new Error('Where filter must specify a field');
        }
        if (!filter.operator) {
          throw new Error('Where filter must specify an operator');
        }
      }
    }

    // Validate order by
    if (query.orderBy) {
      for (const order of query.orderBy) {
        if (!order.field) {
          throw new Error('OrderBy must specify a field');
        }
      }
    }

    // Validate limit
    if (query.limit !== undefined && query.limit < 0) {
      throw new Error(`Invalid limit: ${query.limit} (must be non-negative)`);
    }

    // Validate offset
    if (query.offset !== undefined && query.offset < 0) {
      throw new Error(`Invalid offset: ${query.offset} (must be non-negative)`);
    }
  }

  /**
   * Validate aggregation specifications.
   */
  private validateAggregations(aggregations: Aggregation[]): void {
    if (aggregations.length === 0) {
      throw new Error('Must specify at least one aggregation');
    }

    for (const agg of aggregations) {
      if (!agg.type) {
        throw new Error('Aggregation must specify a type');
      }
      if (!agg.alias) {
        throw new Error('Aggregation must specify an alias');
      }
      if ((agg.type === 'sum' || agg.type === 'avg') && !agg.field) {
        throw new Error(`Aggregation type '${agg.type}' requires a field`);
      }
    }

    // Check for duplicate aliases
    const aliases = new Set<string>();
    for (const agg of aggregations) {
      if (aliases.has(agg.alias)) {
        throw new Error(`Duplicate aggregation alias: ${agg.alias}`);
      }
      aliases.add(agg.alias);
    }
  }

  /**
   * Build gRPC RunQuery request from query specification.
   */
  private buildRunQueryRequest(query: Query): unknown {
    // This would build the actual Firestore gRPC request
    // Placeholder implementation
    return {
      structuredQuery: {
        from: [{ collectionId: this.getCollectionId(query.collection) }],
        where: query.where ? this.buildWhereFilter(query.where) : undefined,
        orderBy: query.orderBy ? this.buildOrderBy(query.orderBy) : undefined,
        limit: query.limit ? { value: query.limit } : undefined,
        offset: query.offset,
        startAt: query.startAt ? this.buildCursor(query.startAt) : undefined,
        endAt: query.endAt ? this.buildCursor(query.endAt) : undefined,
        select: query.select ? { fields: query.select.map(f => ({ fieldPath: f })) } : undefined,
      },
    };
  }

  /**
   * Build gRPC aggregation query request.
   */
  private buildAggregationQueryRequest(query: Query, aggregations: Aggregation[]): unknown {
    // Build base query
    const baseQuery = this.buildRunQueryRequest(query);

    // Add aggregations
    return {
      ...baseQuery,
      aggregations: aggregations.map(agg => ({
        alias: agg.alias,
        ...(agg.type === 'count' ? { count: {} } : {}),
        ...(agg.type === 'sum' ? { sum: { field: { fieldPath: agg.field } } } : {}),
        ...(agg.type === 'avg' ? { avg: { field: { fieldPath: agg.field } } } : {}),
      })),
    };
  }

  /**
   * Build gRPC explain query request.
   */
  private buildExplainQueryRequest(query: Query): unknown {
    return {
      ...this.buildRunQueryRequest(query),
      explainOptions: {
        analyze: false, // Don't actually execute, just plan
      },
    };
  }

  /**
   * Build where filter for gRPC request.
   */
  private buildWhereFilter(filters: WhereFilter[]): unknown {
    if (filters.length === 0) {
      return undefined;
    }

    if (filters.length === 1) {
      const filter = filters[0]!;
      return this.buildSingleFilter(filter);
    }

    // Multiple filters: combine with AND
    return {
      compositeFilter: {
        op: 'AND',
        filters: filters.map(f => this.buildSingleFilter(f)),
      },
    };
  }

  /**
   * Build a single filter condition.
   */
  private buildSingleFilter(filter: WhereFilter): unknown {
    const operatorMap: Record<string, string> = {
      '<': 'LESS_THAN',
      '<=': 'LESS_THAN_OR_EQUAL',
      '==': 'EQUAL',
      '!=': 'NOT_EQUAL',
      '>=': 'GREATER_THAN_OR_EQUAL',
      '>': 'GREATER_THAN',
      'in': 'IN',
      'not-in': 'NOT_IN',
      'array-contains': 'ARRAY_CONTAINS',
      'array-contains-any': 'ARRAY_CONTAINS_ANY',
    };

    return {
      fieldFilter: {
        field: { fieldPath: filter.field },
        op: operatorMap[filter.operator] || 'EQUAL',
        value: this.serializeValue(filter.value),
      },
    };
  }

  /**
   * Build order by clause for gRPC request.
   */
  private buildOrderBy(orderBy: OrderBy[]): unknown {
    return orderBy.map(order => ({
      field: { fieldPath: order.field },
      direction: order.direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
    }));
  }

  /**
   * Build cursor for gRPC request.
   */
  private buildCursor(cursor: Cursor): unknown {
    return {
      values: cursor.values.map(v => this.serializeValue(v)),
      before: cursor.before || false,
    };
  }

  /**
   * Create cursor from document snapshot.
   */
  private createCursorFromDocument(doc: DocumentSnapshot, orderBy?: OrderBy[]): Cursor {
    const values: unknown[] = [];

    if (orderBy && orderBy.length > 0) {
      // Extract values in order by order
      for (const order of orderBy) {
        values.push(doc.data[order.field]);
      }
    } else {
      // Default: use document ID
      values.push(doc.id);
    }

    return { values };
  }

  /**
   * Serialize a value to Firestore Value format.
   */
  private serializeValue(value: unknown): unknown {
    if (value === null) {
      return { nullValue: 'NULL_VALUE' };
    }
    if (typeof value === 'boolean') {
      return { booleanValue: value };
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { integerValue: value.toString() };
      }
      return { doubleValue: value };
    }
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map(v => this.serializeValue(v)),
        },
      };
    }
    if (typeof value === 'object') {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        fields[k] = this.serializeValue(v);
      }
      return {
        mapValue: { fields },
      };
    }
    throw new Error(`Unsupported value type: ${typeof value}`);
  }

  /**
   * Get collection ID from collection path.
   */
  private getCollectionId(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1]!;
  }

  /**
   * Get current timestamp.
   */
  private getCurrentTimestamp(): Timestamp {
    const now = Date.now();
    return {
      seconds: Math.floor(now / 1000),
      nanos: (now % 1000) * 1000000,
    };
  }

  /**
   * Execute gRPC query (placeholder).
   */
  private async executeGrpcQuery(_request: unknown): Promise<DocumentSnapshot[]> {
    // Placeholder: In production, this would use the Firestore gRPC client
    // to execute the query and parse the response
    throw new Error('Not implemented: gRPC integration required');
  }

  /**
   * Execute gRPC query stream (placeholder).
   */
  private async *executeGrpcQueryStream(_request: unknown): AsyncIterator<DocumentSnapshot> {
    // Placeholder: In production, this would use the Firestore gRPC client
    // to stream query results
    throw new Error('Not implemented: gRPC integration required');
  }

  /**
   * Execute gRPC aggregation (placeholder).
   */
  private async executeGrpcAggregation(_request: unknown): Promise<Record<string, number | null>> {
    // Placeholder: In production, this would use the Firestore gRPC client
    // to execute the aggregation query
    throw new Error('Not implemented: gRPC integration required');
  }

  /**
   * Execute gRPC explain (placeholder).
   */
  private async executeGrpcExplain(_request: unknown): Promise<QueryPlan> {
    // Placeholder: In production, this would use the Firestore gRPC client
    // to get the query plan
    throw new Error('Not implemented: gRPC integration required');
  }
}
