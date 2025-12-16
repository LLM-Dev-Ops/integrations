/**
 * Cursor handling for Firestore query pagination.
 *
 * Provides functions for creating, encoding, and decoding cursors
 * for pagination in Firestore queries.
 */

import {
  Cursor,
  FieldValue,
  OrderBy,
  DocumentSnapshot,
} from "../types/index.js";
import { fromFieldValue, toFieldValue } from "./filter.js";

/**
 * Create a cursor from field values.
 *
 * @param values - Array of field values representing the cursor position
 * @param before - Whether the cursor is before (true) or at/after (false) the position
 * @returns Cursor object
 *
 * @example
 * ```typescript
 * // Cursor for starting at a specific value
 * const cursor = createCursor([{ stringValue: "Smith" }], false);
 *
 * // Cursor for starting before a specific value
 * const beforeCursor = createCursor([{ stringValue: "Smith" }], true);
 * ```
 */
export function createCursor(values: FieldValue[], before: boolean): Cursor {
  if (!values || values.length === 0) {
    throw new Error("Cursor must have at least one value");
  }

  return {
    values,
    before,
  };
}

/**
 * Encode a cursor to a string for use as a page token.
 * The cursor is serialized to JSON and base64 encoded.
 *
 * @param cursor - The cursor to encode
 * @returns Base64 encoded cursor string
 *
 * @example
 * ```typescript
 * const cursor = createCursor([{ stringValue: "Smith" }], false);
 * const token = encodeCursor(cursor);
 * // Token can be passed to clients and used later
 * ```
 */
export function encodeCursor(cursor: Cursor): string {
  try {
    const json = JSON.stringify(cursor);
    return Buffer.from(json).toString("base64url");
  } catch (error) {
    throw new Error(
      `Failed to encode cursor: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Decode a cursor from a base64 encoded string.
 *
 * @param encoded - The base64 encoded cursor string
 * @returns Decoded cursor object
 * @throws {Error} If the encoded string is invalid
 *
 * @example
 * ```typescript
 * const cursor = decodeCursor(pageToken);
 * const query = queryBuilder.startAt(cursor);
 * ```
 */
export function decodeCursor(encoded: string): Cursor {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    const cursor = JSON.parse(json) as Cursor;

    // Validate decoded cursor
    if (!cursor.values || !Array.isArray(cursor.values)) {
      throw new Error("Invalid cursor: missing or invalid values array");
    }

    if (typeof cursor.before !== "boolean") {
      throw new Error("Invalid cursor: before must be a boolean");
    }

    return cursor;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid cursor:")) {
      throw error;
    }
    throw new Error(
      `Failed to decode cursor: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract cursor values from a document snapshot based on orderBy clauses.
 * This is useful for creating start/end cursors from actual documents.
 *
 * @param doc - The document snapshot to extract values from
 * @param orderBy - Array of orderBy clauses defining which fields to extract
 * @returns Array of field values in the order specified by orderBy clauses
 *
 * @example
 * ```typescript
 * // Given a document and query ordered by lastName, firstName
 * const orderByClauses = [
 *   { field: { fieldPath: "lastName" }, direction: "ASCENDING" },
 *   { field: { fieldPath: "firstName" }, direction: "ASCENDING" }
 * ];
 *
 * const cursorValues = extractCursorValuesFromDocument(doc, orderByClauses);
 * const cursor = createCursor(cursorValues, false);
 * ```
 */
export function extractCursorValuesFromDocument(
  doc: DocumentSnapshot,
  orderBy: OrderBy[]
): FieldValue[] {
  if (!orderBy || orderBy.length === 0) {
    throw new Error("OrderBy clauses are required to extract cursor values");
  }

  const values: FieldValue[] = [];

  for (const order of orderBy) {
    const fieldPath = order.field.fieldPath;

    // Handle special __name__ field (document ID)
    if (fieldPath === "__name__") {
      values.push({ referenceValue: doc.name });
      continue;
    }

    // Extract nested field value
    const fieldValue = getFieldValueFromPath(doc.fields, fieldPath);

    if (!fieldValue) {
      throw new Error(
        `Field "${fieldPath}" not found in document for cursor extraction`
      );
    }

    values.push(fieldValue);
  }

  return values;
}

/**
 * Get a field value from a document fields map using a field path.
 * Supports nested paths like "address.city".
 *
 * @param fields - The document fields map
 * @param path - The field path (can be nested with dots)
 * @returns The field value, or undefined if not found
 */
function getFieldValueFromPath(
  fields: Record<string, FieldValue>,
  path: string
): FieldValue | undefined {
  const parts = path.split(".");
  let current: FieldValue | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (i === 0) {
      // First level - get from fields
      current = fields[part];
    } else {
      // Nested level - navigate through mapValue
      if (!current || !("mapValue" in current)) {
        return undefined;
      }
      current = current.mapValue.fields[part];
    }

    if (!current) {
      return undefined;
    }
  }

  return current;
}

/**
 * Extract a cursor from a document snapshot.
 * Convenience function that creates a cursor from a document.
 *
 * @param doc - The document snapshot
 * @param orderBy - Array of orderBy clauses
 * @param before - Whether the cursor should be before the document
 * @returns Cursor object
 *
 * @example
 * ```typescript
 * // Start after the last document from the previous page
 * const lastDoc = results.documents[results.documents.length - 1];
 * const nextCursor = extractCursorFromDocument(lastDoc, orderByClauses, false);
 * ```
 */
export function extractCursorFromDocument(
  doc: DocumentSnapshot,
  orderBy: OrderBy[],
  before: boolean = false
): Cursor {
  const values = extractCursorValuesFromDocument(doc, orderBy);
  return createCursor(values, before);
}

/**
 * Create a cursor from JavaScript values.
 * Convenience function that converts JS values to FieldValues.
 *
 * @param values - Array of JavaScript values
 * @param before - Whether the cursor is before the position
 * @returns Cursor object
 *
 * @example
 * ```typescript
 * // Create cursor from simple values
 * const cursor = createCursorFromValues(["Smith", "John"], false);
 *
 * // Create cursor from mixed types
 * const cursor2 = createCursorFromValues([42, new Date(), "test"], false);
 * ```
 */
export function createCursorFromValues(
  values: unknown[],
  before: boolean = false
): Cursor {
  const fieldValues = values.map((v) => toFieldValue(v));
  return createCursor(fieldValues, before);
}

/**
 * Convert cursor values to JavaScript values.
 *
 * @param cursor - The cursor to convert
 * @returns Array of JavaScript values
 */
export function cursorToValues(cursor: Cursor): unknown[] {
  return cursor.values.map((v) => fromFieldValue(v));
}

/**
 * Validate a cursor against orderBy clauses.
 * Ensures the cursor has the correct number of values.
 *
 * @param cursor - The cursor to validate
 * @param orderBy - Array of orderBy clauses
 * @throws {Error} If the cursor is invalid
 */
export function validateCursor(cursor: Cursor, orderBy: OrderBy[]): void {
  if (!cursor.values || cursor.values.length === 0) {
    throw new Error("Cursor must have at least one value");
  }

  if (orderBy && cursor.values.length !== orderBy.length) {
    throw new Error(
      `Cursor value count (${cursor.values.length}) must match orderBy clause count (${orderBy.length})`
    );
  }

  if (typeof cursor.before !== "boolean") {
    throw new Error("Cursor before flag must be a boolean");
  }
}

/**
 * Create a page token from a document snapshot.
 * Combines extraction and encoding in one step.
 *
 * @param doc - The document snapshot
 * @param orderBy - Array of orderBy clauses
 * @param before - Whether the cursor should be before the document
 * @returns Encoded page token string
 */
export function createPageToken(
  doc: DocumentSnapshot,
  orderBy: OrderBy[],
  before: boolean = false
): string {
  const cursor = extractCursorFromDocument(doc, orderBy, before);
  return encodeCursor(cursor);
}

/**
 * Compare two cursors for equality.
 *
 * @param cursor1 - First cursor
 * @param cursor2 - Second cursor
 * @returns True if cursors are equal
 */
export function cursorsEqual(cursor1: Cursor, cursor2: Cursor): boolean {
  if (cursor1.before !== cursor2.before) {
    return false;
  }

  if (cursor1.values.length !== cursor2.values.length) {
    return false;
  }

  // Deep comparison of values
  return JSON.stringify(cursor1.values) === JSON.stringify(cursor2.values);
}
