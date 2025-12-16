/**
 * Query evaluation engine for Firestore simulation.
 *
 * Evaluates queries against in-memory documents, applying filters,
 * ordering, pagination, and projections according to Firestore semantics.
 *
 * Following the SPARC specification for Firestore integration.
 */

import type {
  Query,
  Filter,
  FieldFilter,
  UnaryFilter,
  CompositeFilter,
  OrderBy,
  Cursor,
  FilterOp,
} from "../types/query.js";
import type { FieldValue } from "../types/field-value.js";
import type { StoredDocument } from "./mock-store.js";
import { fromFieldValue } from "../types/field-value.js";

/**
 * Query evaluation engine.
 *
 * Evaluates structured queries against a set of documents,
 * applying filters, ordering, and pagination.
 */
export class MockQueryEngine {
  /**
   * Evaluate a query against a set of documents.
   *
   * @param query - Query to evaluate
   * @param documents - Documents to query
   * @returns Filtered, ordered, and paginated documents
   */
  evaluate(query: Query, documents: StoredDocument[]): StoredDocument[] {
    let results = [...documents];

    // Apply filters
    if (query.where) {
      results = results.filter((doc) => this.evaluateFilter(doc, query.where!));
    }

    // Apply ordering
    if (query.orderBy && query.orderBy.length > 0) {
      results = this.applyOrderBy(results, query.orderBy);
    }

    // Apply cursors
    if (query.startAt) {
      results = this.applyCursor(results, query.startAt, query.orderBy || [], true);
    }
    if (query.endAt) {
      results = this.applyCursor(results, query.endAt, query.orderBy || [], false);
    }

    // Apply offset
    if (query.offset && query.offset > 0) {
      results = results.slice(query.offset);
    }

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = this.applyLimit(results, query.limit);
    }

    return results;
  }

  /**
   * Evaluate a filter against a document.
   *
   * @param doc - Document to test
   * @param filter - Filter to apply
   * @returns True if the document matches the filter
   */
  evaluateFilter(doc: StoredDocument, filter: Filter): boolean {
    switch (filter.type) {
      case "field":
        return this.evaluateFieldFilter(doc, filter.filter);
      case "unary":
        return this.evaluateUnaryFilter(doc, filter.filter);
      case "composite":
        return this.evaluateCompositeFilter(doc, filter.filter);
      default:
        return true;
    }
  }

  /**
   * Evaluate a field filter.
   *
   * @param doc - Document to test
   * @param filter - Field filter
   * @returns True if the document matches
   */
  evaluateFieldFilter(doc: StoredDocument, filter: FieldFilter): boolean {
    const fieldValue = this.getFieldValue(doc, filter.field.fieldPath);
    if (fieldValue === undefined) {
      return false;
    }

    return this.compareValues(fieldValue, filter.op, filter.value);
  }

  /**
   * Evaluate a unary filter.
   *
   * @param doc - Document to test
   * @param filter - Unary filter
   * @returns True if the document matches
   */
  evaluateUnaryFilter(doc: StoredDocument, filter: UnaryFilter): boolean {
    const fieldValue = this.getFieldValue(doc, filter.field.fieldPath);

    switch (filter.op) {
      case "IsNull":
        return fieldValue === null || fieldValue === undefined;
      case "IsNotNull":
        return fieldValue !== null && fieldValue !== undefined;
      case "IsNan":
        return typeof fieldValue === "number" && isNaN(fieldValue);
      case "IsNotNan":
        return typeof fieldValue !== "number" || !isNaN(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Evaluate a composite filter.
   *
   * @param doc - Document to test
   * @param filter - Composite filter
   * @returns True if the document matches
   */
  evaluateCompositeFilter(doc: StoredDocument, filter: CompositeFilter): boolean {
    if (filter.filters.length === 0) {
      return true;
    }

    switch (filter.op) {
      case "And":
        return filter.filters.every((f) => this.evaluateFilter(doc, f));
      case "Or":
        return filter.filters.some((f) => this.evaluateFilter(doc, f));
      default:
        return false;
    }
  }

  /**
   * Compare two values using a filter operator.
   *
   * @param docValue - Value from document
   * @param op - Filter operator
   * @param filterValue - Value from filter
   * @returns True if the comparison matches
   */
  private compareValues(docValue: unknown, op: FilterOp, filterValue: FieldValue): boolean {
    const convertedFilterValue = fromFieldValue(filterValue);

    switch (op) {
      case "Equal":
        return this.valuesEqual(docValue, convertedFilterValue);
      case "NotEqual":
        return !this.valuesEqual(docValue, convertedFilterValue);
      case "LessThan":
        return this.compareOrdered(docValue, convertedFilterValue) < 0;
      case "LessThanOrEqual":
        return this.compareOrdered(docValue, convertedFilterValue) <= 0;
      case "GreaterThan":
        return this.compareOrdered(docValue, convertedFilterValue) > 0;
      case "GreaterThanOrEqual":
        return this.compareOrdered(docValue, convertedFilterValue) >= 0;
      case "ArrayContains":
        return Array.isArray(docValue) && docValue.some((v) => this.valuesEqual(v, convertedFilterValue));
      case "ArrayContainsAny":
        if (!Array.isArray(docValue) || !Array.isArray(convertedFilterValue)) {
          return false;
        }
        return convertedFilterValue.some((fv) => docValue.some((dv) => this.valuesEqual(dv, fv)));
      case "In":
        if (!Array.isArray(convertedFilterValue)) {
          return false;
        }
        return convertedFilterValue.some((fv) => this.valuesEqual(docValue, fv));
      case "NotIn":
        if (!Array.isArray(convertedFilterValue)) {
          return true;
        }
        return !convertedFilterValue.some((fv) => this.valuesEqual(docValue, fv));
      default:
        return false;
    }
  }

  /**
   * Check if two values are equal.
   *
   * @param a - First value
   * @param b - Second value
   * @returns True if values are equal
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }
    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }
    if (typeof a !== typeof b) {
      return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      return a.every((val, i) => this.valuesEqual(val, b[i]));
    }
    if (typeof a === "object" && typeof b === "object") {
      const aKeys = Object.keys(a as object);
      const bKeys = Object.keys(b as object);
      if (aKeys.length !== bKeys.length) {
        return false;
      }
      return aKeys.every((key) => this.valuesEqual((a as any)[key], (b as any)[key]));
    }
    return false;
  }

  /**
   * Compare two values for ordering.
   *
   * @param a - First value
   * @param b - Second value
   * @returns -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareOrdered(a: unknown, b: unknown): number {
    // Handle null/undefined
    if (a === null || a === undefined) {
      return b === null || b === undefined ? 0 : -1;
    }
    if (b === null || b === undefined) {
      return 1;
    }

    // Handle numbers
    if (typeof a === "number" && typeof b === "number") {
      if (isNaN(a) && isNaN(b)) return 0;
      if (isNaN(a)) return 1;
      if (isNaN(b)) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }

    // Handle strings
    if (typeof a === "string" && typeof b === "string") {
      return a < b ? -1 : a > b ? 1 : 0;
    }

    // Handle booleans
    if (typeof a === "boolean" && typeof b === "boolean") {
      return a === b ? 0 : a ? 1 : -1;
    }

    // Handle dates
    if (a instanceof Date && b instanceof Date) {
      const aTime = a.getTime();
      const bTime = b.getTime();
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    }

    // Different types - use type ordering
    return 0;
  }

  /**
   * Apply ordering to documents.
   *
   * @param docs - Documents to order
   * @param orderBy - Ordering clauses
   * @returns Ordered documents
   */
  applyOrderBy(docs: StoredDocument[], orderBy: OrderBy[]): StoredDocument[] {
    return [...docs].sort((a, b) => {
      for (const order of orderBy) {
        const aValue = this.getFieldValue(a, order.field.fieldPath);
        const bValue = this.getFieldValue(b, order.field.fieldPath);
        const comparison = this.compareOrdered(aValue, bValue);

        if (comparison !== 0) {
          return order.direction === "Descending" ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Apply limit to documents.
   *
   * @param docs - Documents to limit
   * @param limit - Maximum number of documents
   * @returns Limited documents
   */
  applyLimit(docs: StoredDocument[], limit: number): StoredDocument[] {
    return docs.slice(0, limit);
  }

  /**
   * Apply cursor to documents for pagination.
   *
   * @param docs - Documents to filter
   * @param cursor - Cursor position
   * @param orderBy - Ordering clauses
   * @param isStart - True for startAt/startAfter, false for endAt/endBefore
   * @returns Filtered documents
   */
  applyCursor(
    docs: StoredDocument[],
    cursor: Cursor,
    orderBy: OrderBy[],
    isStart: boolean
  ): StoredDocument[] {
    if (cursor.values.length === 0) {
      return docs;
    }

    return docs.filter((doc) => {
      // Compare document against cursor values
      for (let i = 0; i < cursor.values.length && i < orderBy.length; i++) {
        const fieldPath = orderBy[i].field.fieldPath;
        const docValue = this.getFieldValue(doc, fieldPath);
        const cursorValue = fromFieldValue(cursor.values[i]);
        const comparison = this.compareOrdered(docValue, cursorValue);

        if (comparison !== 0) {
          const direction = orderBy[i].direction === "Descending" ? -1 : 1;
          const effectiveComparison = comparison * direction;

          if (isStart) {
            // For startAt/startAfter
            return cursor.before ? effectiveComparison >= 0 : effectiveComparison > 0;
          } else {
            // For endAt/endBefore
            return cursor.before ? effectiveComparison < 0 : effectiveComparison <= 0;
          }
        }
      }

      // Values are equal - include based on cursor.before
      if (isStart) {
        return !cursor.before; // Include for startAt, exclude for startAfter
      } else {
        return cursor.before; // Exclude for endAt, include for endBefore
      }
    });
  }

  /**
   * Get a field value from a document using dot notation.
   *
   * @param doc - Document
   * @param fieldPath - Field path (e.g., "user.email")
   * @returns Field value or undefined
   */
  private getFieldValue(doc: StoredDocument, fieldPath: string): unknown {
    const parts = fieldPath.split(".");
    let current: any = doc.fields;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Count documents matching a query.
   *
   * @param query - Query to evaluate
   * @param documents - Documents to query
   * @returns Number of matching documents
   */
  count(query: Query, documents: StoredDocument[]): number {
    const results = this.evaluate(query, documents);
    return results.length;
  }

  /**
   * Check if any documents match a query.
   *
   * @param query - Query to evaluate
   * @param documents - Documents to query
   * @returns True if at least one document matches
   */
  exists(query: Query, documents: StoredDocument[]): boolean {
    return this.count(query, documents) > 0;
  }
}

/**
 * Create a new query engine.
 *
 * @returns New MockQueryEngine instance
 */
export function createMockQueryEngine(): MockQueryEngine {
  return new MockQueryEngine();
}
