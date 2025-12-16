/**
 * Protocol Buffer Conversion for Firestore
 *
 * Converts between domain types and Firestore REST API format.
 * Firestore REST API uses specific JSON format for field values.
 */

import type {
  FieldValue,
  FieldValueMap,
  Filter,
  FieldFilter,
  UnaryFilter,
  CompositeFilter,
  OrderBy,
  Cursor,
  Timestamp,
  GeoPoint,
} from "../types/index.js";

import type { FieldTransform } from "../types/field-value.js";

/**
 * Firestore value proto representation (REST API format).
 */
export type FirestoreValueProto = FieldValue;

/**
 * Firestore document proto representation (REST API format).
 */
export interface FirestoreDocumentProto {
  name?: string;
  fields: Record<string, FirestoreValueProto>;
  createTime?: string;
  updateTime?: string;
}

/**
 * Firestore filter proto representation.
 */
export type FirestoreFilterProto =
  | { fieldFilter: FirestoreFieldFilterProto }
  | { unaryFilter: FirestoreUnaryFilterProto }
  | { compositeFilter: FirestoreCompositeFilterProto };

/**
 * Firestore field filter proto.
 */
export interface FirestoreFieldFilterProto {
  field: { fieldPath: string };
  op: string;
  value: FirestoreValueProto;
}

/**
 * Firestore unary filter proto.
 */
export interface FirestoreUnaryFilterProto {
  field: { fieldPath: string };
  op: string;
}

/**
 * Firestore composite filter proto.
 */
export interface FirestoreCompositeFilterProto {
  op: string;
  filters: FirestoreFilterProto[];
}

/**
 * Firestore order by proto.
 */
export interface FirestoreOrderByProto {
  field: { fieldPath: string };
  direction: string;
}

/**
 * Firestore cursor proto.
 */
export interface FirestoreCursorProto {
  values: FirestoreValueProto[];
  before: boolean;
}

/**
 * Firestore field transform proto.
 */
export type FirestoreFieldTransformProto =
  | { increment: FirestoreValueProto }
  | { maximum: FirestoreValueProto }
  | { minimum: FirestoreValueProto }
  | { appendMissingElements: { values: FirestoreValueProto[] } }
  | { removeAllFromArray: { values: FirestoreValueProto[] } }
  | { setToServerValue: string };

/**
 * Convert a JavaScript value to Firestore FieldValue proto.
 * @param value - JavaScript value
 * @returns Firestore FieldValue proto
 */
export function toFirestoreValue(value: unknown): FirestoreValueProto {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && !Number.isNaN(value) && Number.isFinite(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return { bytesValue: buffer.toString("base64") };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => toFirestoreValue(v)),
      },
    };
  }

  if (typeof value === "object") {
    // Check for GeoPoint
    if ("latitude" in value && "longitude" in value) {
      const geo = value as GeoPoint;
      return {
        geoPointValue: {
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
      };
    }

    // Check for Timestamp
    if ("seconds" in value && "nanos" in value) {
      const ts = value as Timestamp;
      const date = new Date(ts.seconds * 1000 + Math.floor(ts.nanos / 1_000_000));
      return { timestampValue: date.toISOString() };
    }

    // Check for reference value (document reference)
    if ("path" in value && typeof (value as any).path === "string") {
      return { referenceValue: (value as any).path };
    }

    // Convert to map
    const fields: Record<string, FirestoreValueProto> = {};
    for (const [key, val] of Object.entries(value)) {
      fields[key] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }

  throw new Error(`Cannot convert value to Firestore proto: ${typeof value}`);
}

/**
 * Convert Firestore FieldValue proto to JavaScript value.
 * @param proto - Firestore FieldValue proto
 * @returns JavaScript value
 */
export function fromFirestoreValue(proto: FirestoreValueProto): unknown {
  if ("nullValue" in proto) {
    return null;
  }

  if ("booleanValue" in proto) {
    return proto.booleanValue;
  }

  if ("integerValue" in proto) {
    const intVal = proto.integerValue;
    return typeof intVal === "string" ? parseInt(intVal, 10) : intVal;
  }

  if ("doubleValue" in proto) {
    return proto.doubleValue;
  }

  if ("timestampValue" in proto) {
    const ts = proto.timestampValue;
    if (typeof ts === "string") {
      return new Date(ts);
    }
    // Handle Timestamp object
    const timestamp = ts as Timestamp;
    const milliseconds = timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000);
    return new Date(milliseconds);
  }

  if ("stringValue" in proto) {
    return proto.stringValue;
  }

  if ("bytesValue" in proto) {
    const bytes = proto.bytesValue;
    if (typeof bytes === "string") {
      return Buffer.from(bytes, "base64");
    }
    return bytes;
  }

  if ("referenceValue" in proto) {
    return proto.referenceValue;
  }

  if ("geoPointValue" in proto) {
    return proto.geoPointValue;
  }

  if ("arrayValue" in proto) {
    return proto.arrayValue.values.map((v) => fromFirestoreValue(v));
  }

  if ("mapValue" in proto) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(proto.mapValue.fields)) {
      result[key] = fromFirestoreValue(val);
    }
    return result;
  }

  return null;
}

/**
 * Convert a FieldValueMap to Firestore document proto.
 * @param data - Field value map
 * @returns Firestore document proto
 */
export function toFirestoreDocument(data: FieldValueMap): FirestoreDocumentProto {
  const fields: Record<string, FirestoreValueProto> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }
  return { fields };
}

/**
 * Convert Firestore document proto to plain object.
 * @param proto - Firestore document proto
 * @returns Object with fields, createTime, updateTime, readTime
 */
export function fromFirestoreDocument(proto: FirestoreDocumentProto): {
  fields: FieldValueMap;
  createTime?: string;
  updateTime?: string;
  readTime?: string;
} {
  const fields: FieldValueMap = {};
  for (const [key, value] of Object.entries(proto.fields)) {
    fields[key] = fromFirestoreValue(value);
  }

  return {
    fields,
    createTime: proto.createTime,
    updateTime: proto.updateTime,
  };
}

/**
 * Convert Filter to Firestore filter proto.
 * @param filter - Domain filter
 * @returns Firestore filter proto
 */
export function toFirestoreFilter(filter: Filter): FirestoreFilterProto {
  if ("fieldFilter" in filter) {
    return {
      fieldFilter: toFirestoreFieldFilter(filter.fieldFilter),
    };
  }

  if ("unaryFilter" in filter) {
    return {
      unaryFilter: toFirestoreUnaryFilter(filter.unaryFilter),
    };
  }

  if ("compositeFilter" in filter) {
    return {
      compositeFilter: toFirestoreCompositeFilter(filter.compositeFilter),
    };
  }

  throw new Error("Invalid filter type");
}

/**
 * Convert FieldFilter to Firestore field filter proto.
 * @param filter - Field filter
 * @returns Firestore field filter proto
 */
function toFirestoreFieldFilter(filter: FieldFilter): FirestoreFieldFilterProto {
  return {
    field: { fieldPath: filter.field.fieldPath },
    op: filter.op,
    value: filter.value,
  };
}

/**
 * Convert UnaryFilter to Firestore unary filter proto.
 * @param filter - Unary filter
 * @returns Firestore unary filter proto
 */
function toFirestoreUnaryFilter(filter: UnaryFilter): FirestoreUnaryFilterProto {
  return {
    field: { fieldPath: filter.field.fieldPath },
    op: filter.op,
  };
}

/**
 * Convert CompositeFilter to Firestore composite filter proto.
 * @param filter - Composite filter
 * @returns Firestore composite filter proto
 */
function toFirestoreCompositeFilter(filter: CompositeFilter): FirestoreCompositeFilterProto {
  return {
    op: filter.op,
    filters: filter.filters.map((f) => toFirestoreFilter(f)),
  };
}

/**
 * Convert OrderBy to Firestore order by proto.
 * @param orderBy - Order by clause
 * @returns Firestore order by proto
 */
export function toFirestoreOrderBy(orderBy: OrderBy): FirestoreOrderByProto {
  return {
    field: { fieldPath: orderBy.field.fieldPath },
    direction: orderBy.direction,
  };
}

/**
 * Convert Cursor to Firestore cursor proto.
 * @param cursor - Cursor
 * @returns Firestore cursor proto
 */
export function toFirestoreCursor(cursor: Cursor): FirestoreCursorProto {
  return {
    values: cursor.values,
    before: cursor.before,
  };
}

/**
 * Convert field transform to Firestore field transform proto.
 * @param field - Field path
 * @param transform - Field transform
 * @returns Field transform proto with field path
 */
export function toFieldTransform(
  field: string,
  transform: FieldTransform
): { fieldPath: string; transform: FirestoreFieldTransformProto } {
  let transformProto: FirestoreFieldTransformProto;

  if ("increment" in transform) {
    const value = typeof transform.increment === "number"
      ? toFirestoreValue(transform.increment)
      : { integerValue: transform.increment };
    transformProto = { increment: value };
  } else if ("maximum" in transform) {
    const value = typeof transform.maximum === "number"
      ? toFirestoreValue(transform.maximum)
      : { integerValue: transform.maximum };
    transformProto = { maximum: value };
  } else if ("minimum" in transform) {
    const value = typeof transform.minimum === "number"
      ? toFirestoreValue(transform.minimum)
      : { integerValue: transform.minimum };
    transformProto = { minimum: value };
  } else if ("appendMissingElements" in transform) {
    transformProto = {
      appendMissingElements: {
        values: transform.appendMissingElements.values,
      },
    };
  } else if ("removeAllFromArray" in transform) {
    transformProto = {
      removeAllFromArray: {
        values: transform.removeAllFromArray.values,
      },
    };
  } else if ("setToServerValue" in transform) {
    transformProto = { setToServerValue: transform.setToServerValue };
  } else {
    throw new Error("Unknown field transform type");
  }

  return {
    fieldPath: field,
    transform: transformProto,
  };
}

/**
 * Convert multiple fields to Firestore fields proto.
 * @param data - Field value map
 * @returns Record of field name to Firestore value proto
 */
export function toFirestoreFields(data: FieldValueMap): Record<string, FirestoreValueProto> {
  const fields: Record<string, FirestoreValueProto> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

/**
 * Convert Firestore fields proto to plain object.
 * @param fields - Firestore fields proto
 * @returns Plain object
 */
export function fromFirestoreFields(
  fields: Record<string, FirestoreValueProto>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(value);
  }
  return result;
}

/**
 * Create a timestamp proto from a Date.
 * @param date - Date object
 * @returns Timestamp in ISO 8601 format
 */
export function toTimestampProto(date: Date): string {
  return date.toISOString();
}

/**
 * Parse a timestamp proto to Date.
 * @param timestamp - Timestamp string
 * @returns Date object
 */
export function fromTimestampProto(timestamp: string): Date {
  return new Date(timestamp);
}

/**
 * Create a FieldValue from a native JavaScript value with proper type inference.
 * @param value - Native JavaScript value
 * @returns Firestore FieldValue
 */
export function createFieldValue(value: unknown): FieldValue {
  return toFirestoreValue(value) as FieldValue;
}

/**
 * Extract native JavaScript value from a FieldValue.
 * @param fieldValue - Firestore FieldValue
 * @returns Native JavaScript value
 */
export function extractFieldValue(fieldValue: FieldValue): unknown {
  return fromFirestoreValue(fieldValue);
}

/**
 * Validate that a value can be converted to Firestore format.
 * @param value - Value to validate
 * @returns True if valid, throws error otherwise
 */
export function validateFirestoreValue(value: unknown): boolean {
  try {
    toFirestoreValue(value);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid Firestore value: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Calculate approximate size of a Firestore document in bytes.
 * Firestore has a 1 MiB limit per document.
 * @param fields - Document fields
 * @returns Approximate size in bytes
 */
export function estimateDocumentSize(fields: Record<string, FirestoreValueProto>): number {
  const json = JSON.stringify(fields);
  return Buffer.byteLength(json, "utf8");
}

/**
 * Check if document size is within Firestore limits.
 * @param fields - Document fields
 * @returns True if within limits, false otherwise
 */
export function isDocumentSizeValid(fields: Record<string, FirestoreValueProto>): boolean {
  const size = estimateDocumentSize(fields);
  const MAX_DOCUMENT_SIZE = 1048576; // 1 MiB
  return size <= MAX_DOCUMENT_SIZE;
}
