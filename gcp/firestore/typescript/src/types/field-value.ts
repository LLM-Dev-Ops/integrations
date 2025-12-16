/**
 * Field value types for Google Cloud Firestore.
 *
 * Represents the various types that can be stored in Firestore document fields.
 */

import type { DocumentRef, Timestamp } from "./document.js";

/**
 * Geographic point with latitude and longitude coordinates.
 */
export interface GeoPoint {
  /** Latitude in degrees, range [-90, 90] */
  latitude: number;
  /** Longitude in degrees, range [-180, 180] */
  longitude: number;
}

/**
 * Field value - represents all possible types that can be stored in Firestore.
 * Maps to the Firestore Value proto message.
 */
export type FieldValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: number | string }
  | { doubleValue: number }
  | { timestampValue: Timestamp | string }
  | { stringValue: string }
  | { bytesValue: Uint8Array | string }
  | { referenceValue: string }
  | { geoPointValue: GeoPoint }
  | { arrayValue: { values: FieldValue[] } }
  | { mapValue: { fields: Record<string, FieldValue> } };

/**
 * Field value map - maps field paths to field values.
 */
export type FieldValueMap = Record<string, unknown>;

/**
 * Field transform operations for atomic updates.
 */
export type FieldTransform =
  | { increment: number | string }
  | { maximum: number | string }
  | { minimum: number | string }
  | { appendMissingElements: { values: FieldValue[] } }
  | { removeAllFromArray: { values: FieldValue[] } }
  | { setToServerValue: "REQUEST_TIME" };

/**
 * Set options for document writes.
 */
export interface SetOptions {
  /** Merge with existing document instead of overwriting */
  merge?: boolean;
  /** Merge only specific fields */
  mergeFields?: string[];
}

/**
 * List options for paginated queries.
 */
export interface ListOptions {
  /** Maximum number of documents to return */
  pageSize?: number;
  /** Continuation token for pagination */
  pageToken?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a GeoPoint from latitude and longitude.
 */
export function createGeoPoint(latitude: number, longitude: number): GeoPoint {
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be in range [-90, 90]`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be in range [-180, 180]`);
  }
  return { latitude, longitude };
}

/**
 * Convert a plain JavaScript value to a Firestore FieldValue.
 */
export function toFieldValue(value: unknown): FieldValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: value };
    }
    return { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (value instanceof Uint8Array) {
    return { bytesValue: value };
  }

  if (value instanceof Date) {
    const timestamp = {
      seconds: Math.floor(value.getTime() / 1000),
      nanos: (value.getTime() % 1000) * 1_000_000,
    };
    return { timestampValue: timestamp };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFieldValue),
      },
    };
  }

  if (typeof value === "object") {
    // Check for GeoPoint
    if ("latitude" in value && "longitude" in value) {
      return { geoPointValue: value as GeoPoint };
    }

    // Check for Timestamp
    if ("seconds" in value && "nanos" in value) {
      return { timestampValue: value as Timestamp };
    }

    // Check for DocumentRef
    if ("path" in value && "id" in value) {
      const ref = value as DocumentRef;
      return { referenceValue: formatDocumentReference(ref) };
    }

    // Convert to map
    const fields: Record<string, FieldValue> = {};
    for (const [key, val] of Object.entries(value)) {
      fields[key] = toFieldValue(val);
    }
    return { mapValue: { fields } };
  }

  throw new Error(`Unsupported field value type: ${typeof value}`);
}

/**
 * Convert a Firestore FieldValue to a plain JavaScript value.
 */
export function fromFieldValue(value: FieldValue): unknown {
  if ("nullValue" in value) {
    return null;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("integerValue" in value) {
    const intVal = value.integerValue;
    return typeof intVal === "string" ? parseInt(intVal, 10) : intVal;
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("timestampValue" in value) {
    const ts = value.timestampValue;
    if (typeof ts === "string") {
      return new Date(ts);
    }
    const milliseconds = ts.seconds * 1000 + Math.floor(ts.nanos / 1_000_000);
    return new Date(milliseconds);
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("bytesValue" in value) {
    const bytes = value.bytesValue;
    if (typeof bytes === "string") {
      // Base64 decode
      return Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));
    }
    return bytes;
  }

  if ("referenceValue" in value) {
    return value.referenceValue;
  }

  if ("geoPointValue" in value) {
    return value.geoPointValue;
  }

  if ("arrayValue" in value) {
    return value.arrayValue.values.map(fromFieldValue);
  }

  if ("mapValue" in value) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value.mapValue.fields)) {
      result[key] = fromFieldValue(val);
    }
    return result;
  }

  return null;
}

/**
 * Convert a FieldValueMap to Firestore field format.
 */
export function toFirestoreFields(data: FieldValueMap): Record<string, FieldValue> {
  const fields: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFieldValue(value);
  }
  return fields;
}

/**
 * Convert Firestore fields to a plain object.
 */
export function fromFirestoreFields(fields: Record<string, FieldValue>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = fromFieldValue(value);
  }
  return result;
}

/**
 * Format a document reference as a string path.
 */
function formatDocumentReference(ref: DocumentRef): string {
  const { path } = ref;
  return `projects/${path.project_id}/databases/${path.database_id}/documents/${path.collection_path}/${path.document_id}`;
}

/**
 * Validate a field path.
 */
export function validateFieldPath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new Error("Field path cannot be empty");
  }

  if (path.startsWith(".") || path.endsWith(".")) {
    throw new Error(`Invalid field path: ${path}. Cannot start or end with a dot`);
  }

  if (path.includes("..")) {
    throw new Error(`Invalid field path: ${path}. Cannot contain consecutive dots`);
  }
}

/**
 * Validate document data depth.
 */
export function validateDocumentDepth(data: unknown, maxDepth: number = 20, currentDepth: number = 0): void {
  if (currentDepth > maxDepth) {
    throw new Error(`Document exceeds maximum depth of ${maxDepth} levels`);
  }

  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      for (const item of data) {
        validateDocumentDepth(item, maxDepth, currentDepth + 1);
      }
    } else {
      for (const value of Object.values(data)) {
        validateDocumentDepth(value, maxDepth, currentDepth + 1);
      }
    }
  }
}
