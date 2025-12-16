/**
 * Query builder for Google Cloud Firestore.
 *
 * Provides a fluent API for constructing and executing Firestore queries
 * with support for filtering, ordering, pagination, and aggregations.
 */

import {
  FirestoreClient,
  Query,
  Filter,
  OrderBy,
  Cursor,
  FieldValue,
  CollectionSelector,
  Projection,
  QueryResult,
  DocumentSnapshot,
  Aggregation,
  AggregationResult,
  Direction,
  FilterOp,
  CompositeOp,
  RunQueryRequest,
  RunQueryResponse,
} from "../types/index.js";
import {
  fieldFilter,
  compositeFilter,
  toFieldValue,
  fromFieldValue,
  createFieldReference,
  andFilters,
  orFilters,
} from "./filter.js";
import {
  createCursor,
  createCursorFromValues,
  encodeCursor,
  decodeCursor,
  extractCursorFromDocument,
} from "./cursor.js";
import {
  createCountAggregation,
  createSumAggregation,
  createAverageAggregation,
  buildAggregationQuery,
  parseAggregationResults,
} from "./aggregation.js";

/**
 * QueryBuilder provides a fluent interface for constructing Firestore queries.
 *
 * @example
 * ```typescript
 * const results = await new QueryBuilder(client, parent, "users")
 *   .where("age", "GREATER_THAN", 18)
 *   .where("city", "EQUAL", "NYC")
 *   .orderBy("lastName")
 *   .limit(10)
 *   .get();
 * ```
 */
export class QueryBuilder {
  private client: FirestoreClient;
  private parent: string;
  private collectionId: string;
  private allDescendants: boolean = false;
  private filters: Filter[] = [];
  private orderByClauses: OrderBy[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private startAtCursor?: Cursor;
  private endAtCursor?: Cursor;
  private selectFields?: string[];

  /**
   * Create a new QueryBuilder.
   *
   * @param client - Firestore client instance
   * @param parent - Parent path (e.g., "projects/my-project/databases/(default)/documents")
   * @param collectionId - Collection ID to query
   */
  constructor(client: FirestoreClient, parent: string, collectionId: string) {
    this.client = client;
    this.parent = parent;
    this.collectionId = collectionId;
  }

  /**
   * Enable collection group query (query across all collections with this ID).
   *
   * @returns This builder for chaining
   */
  collectionGroup(): QueryBuilder {
    this.allDescendants = true;
    return this;
  }

  /**
   * Add a field filter to the query.
   *
   * @param field - Field path to filter on
   * @param op - Filter operator
   * @param value - Value to filter with (JavaScript type, will be converted)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.where("age", "GREATER_THAN", 18)
   *        .where("status", "EQUAL", "active");
   * ```
   */
  where(field: string, op: FilterOp, value: unknown): QueryBuilder {
    const fieldValue = toFieldValue(value);
    const filter = fieldFilter(field, op, fieldValue);
    this.filters.push(filter);
    return this;
  }

  /**
   * Add an IN filter (field value must be in the provided array).
   *
   * @param field - Field path to filter on
   * @param values - Array of values (max 30)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereIn("status", ["active", "pending", "approved"]);
   * ```
   */
  whereIn(field: string, values: unknown[]): QueryBuilder {
    const fieldValues = values.map((v) => toFieldValue(v));
    const arrayValue: FieldValue = {
      arrayValue: { values: fieldValues },
    };
    const filter = fieldFilter(field, "IN", arrayValue);
    this.filters.push(filter);
    return this;
  }

  /**
   * Add a NOT_IN filter (field value must not be in the provided array).
   *
   * @param field - Field path to filter on
   * @param values - Array of values (max 30)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereNotIn("status", ["deleted", "banned"]);
   * ```
   */
  whereNotIn(field: string, values: unknown[]): QueryBuilder {
    const fieldValues = values.map((v) => toFieldValue(v));
    const arrayValue: FieldValue = {
      arrayValue: { values: fieldValues },
    };
    const filter = fieldFilter(field, "NOT_IN", arrayValue);
    this.filters.push(filter);
    return this;
  }

  /**
   * Add an ARRAY_CONTAINS filter.
   *
   * @param field - Field path (must be an array field)
   * @param value - Value that must be in the array
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereArrayContains("tags", "featured");
   * ```
   */
  whereArrayContains(field: string, value: unknown): QueryBuilder {
    const fieldValue = toFieldValue(value);
    const filter = fieldFilter(field, "ARRAY_CONTAINS", fieldValue);
    this.filters.push(filter);
    return this;
  }

  /**
   * Add an ARRAY_CONTAINS_ANY filter.
   *
   * @param field - Field path (must be an array field)
   * @param values - Array of values (max 30)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereArrayContainsAny("tags", ["featured", "promoted", "new"]);
   * ```
   */
  whereArrayContainsAny(field: string, values: unknown[]): QueryBuilder {
    const fieldValues = values.map((v) => toFieldValue(v));
    const arrayValue: FieldValue = {
      arrayValue: { values: fieldValues },
    };
    const filter = fieldFilter(field, "ARRAY_CONTAINS_ANY", arrayValue);
    this.filters.push(filter);
    return this;
  }

  /**
   * Add a composite filter (AND/OR combination of filters).
   *
   * @param op - Composite operator (AND or OR)
   * @param filters - Array of filters to combine
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereComposite("OR", [
   *   fieldFilter("age", "LESS_THAN", toFieldValue(18)),
   *   fieldFilter("age", "GREATER_THAN", toFieldValue(65))
   * ]);
   * ```
   */
  whereComposite(op: CompositeOp, filters: Filter[]): QueryBuilder {
    const filter = compositeFilter(op, filters);
    this.filters.push(filter);
    return this;
  }

  /**
   * Add an order by clause.
   *
   * @param field - Field path to order by
   * @param direction - Sort direction (default: ASCENDING)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy("lastName")
   *        .orderBy("firstName", "ASCENDING")
   *        .orderBy("age", "DESCENDING");
   * ```
   */
  orderBy(field: string, direction: Direction = "ASCENDING"): QueryBuilder {
    const orderByClause: OrderBy = {
      field: createFieldReference(field),
      direction,
    };
    this.orderByClauses.push(orderByClause);
    return this;
  }

  /**
   * Set the maximum number of results to return.
   *
   * @param count - Maximum number of documents
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.limit(10);
   * ```
   */
  limit(count: number): QueryBuilder {
    if (count < 0) {
      throw new Error("Limit must be non-negative");
    }
    this.limitValue = count;
    return this;
  }

  /**
   * Set the number of results to skip.
   *
   * @param count - Number of documents to skip
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.offset(20);
   * ```
   */
  offset(count: number): QueryBuilder {
    if (count < 0) {
      throw new Error("Offset must be non-negative");
    }
    this.offsetValue = count;
    return this;
  }

  /**
   * Start the query at the specified cursor values.
   * Values must match the order by clauses.
   *
   * @param values - Cursor values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * // If ordering by lastName, firstName:
   * builder.orderBy("lastName").orderBy("firstName")
   *        .startAt("Smith", "John");
   * ```
   */
  startAt(...values: unknown[]): QueryBuilder {
    this.startAtCursor = createCursorFromValues(values, false);
    return this;
  }

  /**
   * Start the query after the specified cursor values.
   *
   * @param values - Cursor values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy("lastName").orderBy("firstName")
   *        .startAfter("Smith", "John");
   * ```
   */
  startAfter(...values: unknown[]): QueryBuilder {
    this.startAtCursor = createCursorFromValues(values, true);
    return this;
  }

  /**
   * End the query at the specified cursor values.
   *
   * @param values - Cursor values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy("lastName")
   *        .endAt("Williams");
   * ```
   */
  endAt(...values: unknown[]): QueryBuilder {
    this.endAtCursor = createCursorFromValues(values, false);
    return this;
  }

  /**
   * End the query before the specified cursor values.
   *
   * @param values - Cursor values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy("lastName")
   *        .endBefore("Williams");
   * ```
   */
  endBefore(...values: unknown[]): QueryBuilder {
    this.endAtCursor = createCursorFromValues(values, true);
    return this;
  }

  /**
   * Select specific fields to return.
   * If not called, all fields are returned.
   *
   * @param fields - Field paths to select
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.select("name", "email", "age");
   * ```
   */
  select(...fields: string[]): QueryBuilder {
    this.selectFields = fields;
    return this;
  }

  /**
   * Build the internal Query object.
   * This is used internally and can also be used to inspect the query.
   *
   * @returns The structured query object
   */
  toQuery(): Query {
    const query: Query = {
      from: [
        {
          collectionId: this.collectionId,
          allDescendants: this.allDescendants,
        } as CollectionSelector,
      ],
    };

    // Add filters
    if (this.filters.length > 0) {
      if (this.filters.length === 1) {
        query.where = this.filters[0];
      } else {
        // Multiple filters - combine with AND
        query.where = andFilters(...this.filters);
      }
    }

    // Add order by
    if (this.orderByClauses.length > 0) {
      query.orderBy = this.orderByClauses;
    }

    // Add cursors
    if (this.startAtCursor) {
      query.startAt = this.startAtCursor;
    }
    if (this.endAtCursor) {
      query.endAt = this.endAtCursor;
    }

    // Add limit and offset
    if (this.limitValue !== undefined) {
      query.limit = this.limitValue;
    }
    if (this.offsetValue !== undefined) {
      query.offset = this.offsetValue;
    }

    // Add projection
    if (this.selectFields && this.selectFields.length > 0) {
      query.select = {
        fields: this.selectFields.map((f) => createFieldReference(f)),
      } as Projection;
    }

    return query;
  }

  /**
   * Execute the query and return all matching documents.
   *
   * @returns Query result with documents
   *
   * @example
   * ```typescript
   * const result = await builder
   *   .where("status", "EQUAL", "active")
   *   .orderBy("createdAt", "DESCENDING")
   *   .limit(10)
   *   .get();
   *
   * for (const doc of result.documents) {
   *   console.log(doc.name, doc.fields);
   * }
   * ```
   */
  async get(): Promise<QueryResult> {
    const query = this.toQuery();
    const request: RunQueryRequest = {
      structuredQuery: query,
    };

    const documents: DocumentSnapshot[] = [];
    let readTime = "";
    let skippedResults = 0;

    // Firestore returns streaming results, we need to collect them
    const responses = await this.runQueryStream(request);

    for (const response of responses) {
      if (response.document) {
        documents.push(response.document);
      }
      if (response.readTime) {
        readTime = response.readTime;
      }
      if (response.skippedResults) {
        skippedResults += response.skippedResults;
      }
    }

    return {
      documents,
      readTime,
      skippedResults: skippedResults > 0 ? skippedResults : undefined,
    };
  }

  /**
   * Execute the query and return an async iterator over documents.
   * More memory efficient for large result sets.
   *
   * @returns Async iterator of document snapshots
   *
   * @example
   * ```typescript
   * for await (const doc of builder.stream()) {
   *   console.log(doc.name, doc.fields);
   * }
   * ```
   */
  async *stream(): AsyncIterableIterator<DocumentSnapshot> {
    const query = this.toQuery();
    const request: RunQueryRequest = {
      structuredQuery: query,
    };

    const responses = await this.runQueryStream(request);

    for (const response of responses) {
      if (response.document) {
        yield response.document;
      }
    }
  }

  /**
   * Count the number of documents matching the query.
   *
   * @returns The count of matching documents
   *
   * @example
   * ```typescript
   * const count = await builder
   *   .where("status", "EQUAL", "active")
   *   .count();
   * console.log(`Active users: ${count}`);
   * ```
   */
  async count(): Promise<number> {
    const aggregations = [createCountAggregation()];
    const result = await this.aggregate(aggregations);
    const parsed = parseAggregationResults(result.results);
    return parsed.count ?? 0;
  }

  /**
   * Sum a numeric field across matching documents.
   *
   * @param field - Field path to sum
   * @returns The sum value
   *
   * @example
   * ```typescript
   * const total = await builder
   *   .where("category", "EQUAL", "electronics")
   *   .sum("price");
   * console.log(`Total price: $${total}`);
   * ```
   */
  async sum(field: string): Promise<number> {
    const aggregations = [createSumAggregation(field)];
    const result = await this.aggregate(aggregations);
    const parsed = parseAggregationResults(result.results);
    return parsed[`sum_${field}`] ?? 0;
  }

  /**
   * Calculate the average of a numeric field across matching documents.
   *
   * @param field - Field path to average
   * @returns The average value
   *
   * @example
   * ```typescript
   * const avgRating = await builder
   *   .where("productId", "EQUAL", "prod-123")
   *   .average("rating");
   * console.log(`Average rating: ${avgRating}`);
   * ```
   */
  async average(field: string): Promise<number> {
    const aggregations = [createAverageAggregation(field)];
    const result = await this.aggregate(aggregations);
    const parsed = parseAggregationResults(result.results);
    return parsed[`avg_${field}`] ?? 0;
  }

  /**
   * Execute custom aggregations on the query.
   *
   * @param aggregations - Array of aggregation operations
   * @returns Aggregation result
   *
   * @example
   * ```typescript
   * const result = await builder
   *   .where("category", "EQUAL", "books")
   *   .aggregate([
   *     createCountAggregation("total_books"),
   *     createSumAggregation("price", "total_revenue"),
   *     createAverageAggregation("rating", "avg_rating")
   *   ]);
   *
   * const parsed = parseAggregationResults(result.results);
   * console.log(parsed); // { total_books: 150, total_revenue: 4500, avg_rating: 4.2 }
   * ```
   */
  async aggregate(aggregations: Aggregation[]): Promise<AggregationResult> {
    const query = this.toQuery();
    const aggQuery = buildAggregationQuery(query, aggregations);

    return await this.client.runAggregationQuery(this.parent, aggQuery);
  }

  /**
   * Run query stream (internal helper).
   * This would normally stream from the Firestore API.
   *
   * @param request - Run query request
   * @returns Array of query responses
   */
  private async runQueryStream(
    request: RunQueryRequest
  ): Promise<RunQueryResponse[]> {
    // In a real implementation, this would stream from the Firestore REST API
    // For now, we'll call the client's runQuery method
    const response = await this.client.runQuery(this.parent, request);

    // The response structure would depend on the actual client implementation
    // This is a simplified version
    return [response];
  }

  /**
   * Clone this query builder.
   * Useful for creating variations of a base query.
   *
   * @returns A new QueryBuilder instance with the same configuration
   *
   * @example
   * ```typescript
   * const baseQuery = new QueryBuilder(client, parent, "users")
   *   .where("status", "EQUAL", "active");
   *
   * const adminQuery = baseQuery.clone().where("role", "EQUAL", "admin");
   * const userQuery = baseQuery.clone().where("role", "EQUAL", "user");
   * ```
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder(this.client, this.parent, this.collectionId);
    cloned.allDescendants = this.allDescendants;
    cloned.filters = [...this.filters];
    cloned.orderByClauses = [...this.orderByClauses];
    cloned.limitValue = this.limitValue;
    cloned.offsetValue = this.offsetValue;
    cloned.startAtCursor = this.startAtCursor;
    cloned.endAtCursor = this.endAtCursor;
    cloned.selectFields = this.selectFields
      ? [...this.selectFields]
      : undefined;
    return cloned;
  }
}

/**
 * Create a query builder instance.
 * Convenience function for creating a new QueryBuilder.
 *
 * @param client - Firestore client instance
 * @param parent - Parent path
 * @param collectionId - Collection ID to query
 * @returns New QueryBuilder instance
 */
export function createQueryBuilder(
  client: FirestoreClient,
  parent: string,
  collectionId: string
): QueryBuilder {
  return new QueryBuilder(client, parent, collectionId);
}
