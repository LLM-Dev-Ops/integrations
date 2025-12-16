/**
 * Query types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents queries, filters, ordering, cursors, and projections.
 */

import { FieldValue } from "./field-value.js";

/**
 * Reference to a field in a document.
 */
export interface FieldReference {
  /** Field path using dot notation (e.g., "address.city") */
  fieldPath: string;
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Filter operators for field comparisons.
 */
export type FilterOp =
  | "Equal"
  | "NotEqual"
  | "LessThan"
  | "LessThanOrEqual"
  | "GreaterThan"
  | "GreaterThanOrEqual"
  | "ArrayContains"
  | "ArrayContainsAny"
  | "In"
  | "NotIn";

/**
 * Composite filter operators.
 */
export type CompositeOp = "And" | "Or";

/**
 * Unary filter operators.
 */
export type UnaryOp = "IsNan" | "IsNull" | "IsNotNan" | "IsNotNull";

/**
 * Field filter - compares a field to a value.
 */
export interface FieldFilter {
  /** Field to filter on */
  field: FieldReference;
  /** Comparison operator */
  op: FilterOp;
  /** Value to compare against */
  value: FieldValue;
}

/**
 * Unary filter - checks field properties.
 */
export interface UnaryFilter {
  /** Field to check */
  field: FieldReference;
  /** Unary operator */
  op: UnaryOp;
}

/**
 * Composite filter - combines multiple filters.
 */
export interface CompositeFilter {
  /** Composite operator (AND/OR) */
  op: CompositeOp;
  /** Child filters to combine */
  filters: Filter[];
}

/**
 * Filter union type.
 */
export type Filter =
  | { type: "field"; filter: FieldFilter }
  | { type: "unary"; filter: UnaryFilter }
  | { type: "composite"; filter: CompositeFilter };

// ============================================================================
// Ordering and Cursor Types
// ============================================================================

/**
 * Sort direction.
 */
export type Direction = "Ascending" | "Descending";

/**
 * Order by clause for sorting results.
 */
export interface OrderBy {
  /** Field to order by */
  field: FieldReference;
  /** Sort direction */
  direction: Direction;
}

/**
 * Cursor for pagination.
 * Defines a position in the query results.
 */
export interface Cursor {
  /** Field values defining the cursor position */
  values: FieldValue[];
  /** Whether this cursor is before the position (true) or at/after (false) */
  before: boolean;
}

// ============================================================================
// Projection and Collection Selector
// ============================================================================

/**
 * Projection - specifies which fields to return.
 */
export interface Projection {
  /** List of fields to include in results */
  fields: FieldReference[];
}

/**
 * Collection selector for queries.
 */
export interface CollectionSelector {
  /** Collection ID to query */
  collectionId: string;
  /** Include all descendant collections with this ID */
  allDescendants: boolean;
}

// ============================================================================
// Query Type
// ============================================================================

/**
 * Structured query for Firestore.
 * Combines filters, ordering, pagination, and projections.
 */
export interface Query {
  /** Fields to return (if omitted, returns all fields) */
  select?: Projection;
  /** Collections to query */
  from: CollectionSelector[];
  /** Filter conditions */
  where?: Filter;
  /** Ordering clauses */
  orderBy?: OrderBy[];
  /** Starting position (inclusive or exclusive based on cursor.before) */
  startAt?: Cursor;
  /** Ending position (inclusive or exclusive based on cursor.before) */
  endAt?: Cursor;
  /** Number of results to skip */
  offset?: number;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Query snapshot containing results.
 */
export interface QuerySnapshot {
  /** Documents in this snapshot */
  documents: QueryDocumentSnapshot[];
  /** Time this snapshot was read */
  readTime: string;
  /** Number of results skipped */
  skippedResults?: number;
  /** Query that produced this snapshot */
  query: Query;
}

/**
 * Document snapshot from a query result.
 */
export interface QueryDocumentSnapshot {
  /** Document name (full path) */
  name: string;
  /** Document fields */
  fields: Record<string, FieldValue>;
  /** Creation time */
  createTime?: string;
  /** Last update time */
  updateTime?: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a field reference.
 */
export function createFieldReference(fieldPath: string): FieldReference {
  return { fieldPath };
}

/**
 * Create a field filter.
 */
export function createFieldFilter(
  fieldPath: string,
  op: FilterOp,
  value: FieldValue
): Filter {
  return {
    type: "field",
    filter: {
      field: { fieldPath },
      op,
      value,
    },
  };
}

/**
 * Create a unary filter.
 */
export function createUnaryFilter(fieldPath: string, op: UnaryOp): Filter {
  return {
    type: "unary",
    filter: {
      field: { fieldPath },
      op,
    },
  };
}

/**
 * Create a composite filter.
 */
export function createCompositeFilter(
  op: CompositeOp,
  filters: Filter[]
): Filter {
  return {
    type: "composite",
    filter: { op, filters },
  };
}

/**
 * Create an AND filter.
 */
export function andFilter(...filters: Filter[]): Filter {
  return createCompositeFilter("And", filters);
}

/**
 * Create an OR filter.
 */
export function orFilter(...filters: Filter[]): Filter {
  return createCompositeFilter("Or", filters);
}

/**
 * Create an order by clause.
 */
export function createOrderBy(
  fieldPath: string,
  direction: Direction = "Ascending"
): OrderBy {
  return {
    field: { fieldPath },
    direction,
  };
}

/**
 * Create a cursor for pagination.
 */
export function createCursor(values: FieldValue[], before: boolean = false): Cursor {
  return { values, before };
}

/**
 * Create a start-at cursor (inclusive).
 */
export function startAt(...values: FieldValue[]): Cursor {
  return createCursor(values, true);
}

/**
 * Create a start-after cursor (exclusive).
 */
export function startAfter(...values: FieldValue[]): Cursor {
  return createCursor(values, false);
}

/**
 * Create an end-at cursor (inclusive).
 */
export function endAt(...values: FieldValue[]): Cursor {
  return createCursor(values, false);
}

/**
 * Create an end-before cursor (exclusive).
 */
export function endBefore(...values: FieldValue[]): Cursor {
  return createCursor(values, true);
}

/**
 * Create a projection.
 */
export function createProjection(...fieldPaths: string[]): Projection {
  return {
    fields: fieldPaths.map((fieldPath) => ({ fieldPath })),
  };
}

/**
 * Create a collection selector.
 */
export function createCollectionSelector(
  collectionId: string,
  allDescendants: boolean = false
): CollectionSelector {
  return { collectionId, allDescendants };
}

/**
 * Create a basic query.
 */
export function createQuery(
  collectionId: string,
  allDescendants: boolean = false
): Query {
  return {
    from: [createCollectionSelector(collectionId, allDescendants)],
  };
}

/**
 * Add a where clause to a query.
 */
export function withWhere(query: Query, filter: Filter): Query {
  return { ...query, where: filter };
}

/**
 * Add ordering to a query.
 */
export function withOrderBy(query: Query, ...orderBy: OrderBy[]): Query {
  return { ...query, orderBy };
}

/**
 * Add a limit to a query.
 */
export function withLimit(query: Query, limit: number): Query {
  return { ...query, limit };
}

/**
 * Add an offset to a query.
 */
export function withOffset(query: Query, offset: number): Query {
  return { ...query, offset };
}

/**
 * Add start/end cursors to a query.
 */
export function withCursors(
  query: Query,
  startAt?: Cursor,
  endAt?: Cursor
): Query {
  return { ...query, startAt, endAt };
}

/**
 * Add a projection to a query.
 */
export function withSelect(query: Query, projection: Projection): Query {
  return { ...query, select: projection };
}
