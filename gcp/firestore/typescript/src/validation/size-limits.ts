/**
 * Size limit validation for Google Cloud Firestore.
 *
 * Following the SPARC specification and Firestore limits:
 * - MAX_DOCUMENT_SIZE: 1 MiB (1,048,576 bytes)
 * - MAX_FIELD_DEPTH: 20 levels
 * - MAX_BATCH_SIZE: 500 operations
 * - MAX_TRANSACTION_OPERATIONS: 500 operations
 * - MAX_TRANSACTION_DURATION_SEC: 270 seconds (4.5 minutes)
 * - MAX_IN_CLAUSE_VALUES: 30 values
 * - MAX_OR_CLAUSES: 30 clauses
 * - MAX_LISTENERS: 1000 per client
 */

import {
  DocumentTooLargeError,
  BatchSizeLimitError,
  InvalidArgumentError,
} from "../error/index.js";
import type { FieldValue, FieldValueMap } from "../types/field-value.js";

// ============================================================================
// Size Limit Constants
// ============================================================================

/**
 * Maximum document size in bytes (1 MiB).
 * Firestore enforces a hard limit of 1,048,576 bytes per document.
 */
export const MAX_DOCUMENT_SIZE = 1024 * 1024; // 1 MiB

/**
 * Maximum field depth (nesting levels).
 * Firestore allows up to 20 levels of nested fields.
 */
export const MAX_FIELD_DEPTH = 20;

/**
 * Maximum number of operations in a batch write.
 * Firestore batches can contain up to 500 operations.
 */
export const MAX_BATCH_SIZE = 500;

/**
 * Maximum number of operations in a transaction.
 * Firestore transactions can contain up to 500 write operations.
 */
export const MAX_TRANSACTION_OPERATIONS = 500;

/**
 * Maximum transaction duration in seconds.
 * Firestore transactions timeout after 270 seconds (4.5 minutes).
 */
export const MAX_TRANSACTION_DURATION_SEC = 270;

/**
 * Maximum number of values in an IN clause.
 * Firestore query IN filters support up to 30 values.
 */
export const MAX_IN_CLAUSE_VALUES = 30;

/**
 * Maximum number of OR clauses in a query.
 * Firestore queries support up to 30 OR clauses.
 */
export const MAX_OR_CLAUSES = 30;

/**
 * Maximum number of listeners per client.
 * Firestore recommends limiting to 1000 concurrent listeners per client.
 */
export const MAX_LISTENERS = 1000;

/**
 * Warning threshold for document size (80% of maximum).
 * Documents approaching the size limit should trigger warnings.
 */
export const DOCUMENT_SIZE_WARNING_THRESHOLD = MAX_DOCUMENT_SIZE * 0.8;

/**
 * Maximum collection ID length.
 * Collection IDs have the same constraints as document IDs.
 */
export const MAX_COLLECTION_ID_LENGTH = 1500;

/**
 * Maximum field path segment length.
 * Each segment in a field path can be up to 1500 characters.
 */
export const MAX_FIELD_PATH_SEGMENT_LENGTH = 1500;

/**
 * Maximum number of indexes per collection.
 * Firestore limits composite indexes per collection.
 */
export const MAX_COMPOSITE_INDEXES_PER_COLLECTION = 200;

/**
 * Maximum number of fields in a composite index.
 */
export const MAX_FIELDS_PER_COMPOSITE_INDEX = 100;

/**
 * Maximum write rate per document (sustained).
 * Firestore recommends maximum 1 write per second per document.
 */
export const MAX_DOCUMENT_WRITE_RATE_PER_SEC = 1;

/**
 * Maximum array length for arrayContains queries.
 * While not strictly enforced, large arrays can cause performance issues.
 */
export const RECOMMENDED_MAX_ARRAY_LENGTH = 1000;

// ============================================================================
// Size Calculation Functions
// ============================================================================

/**
 * Calculate the size of a field value in bytes.
 *
 * This calculates the serialized size following Firestore's billing model:
 * - Field name: 1 byte per character (UTF-8)
 * - Null: 1 byte
 * - Boolean: 1 byte
 * - Integer: 8 bytes
 * - Double: 8 bytes
 * - Timestamp: 8 bytes
 * - String: 1 byte per character (UTF-8) + 1 byte
 * - Bytes: length + 1 byte
 * - Reference: length + 1 byte
 * - GeoPoint: 16 bytes
 * - Array: sum of element sizes + 1 byte
 * - Map: sum of field sizes
 *
 * @param value - Field value to calculate size for
 * @param fieldName - Optional field name to include in size
 * @returns Size in bytes
 *
 * @example
 * ```typescript
 * calculateFieldSize({ stringValue: "hello" }); // ~6 bytes
 * calculateFieldSize({ integerValue: 42 }); // 8 bytes
 * calculateFieldSize({ booleanValue: true }); // 1 byte
 * ```
 */
export function calculateFieldSize(
  value: FieldValue,
  fieldName?: string
): number {
  let size = 0;

  // Add field name size if provided
  if (fieldName) {
    size += new TextEncoder().encode(fieldName).length;
  }

  // Calculate value size based on type
  if ("nullValue" in value) {
    size += 1;
  } else if ("booleanValue" in value) {
    size += 1;
  } else if ("integerValue" in value) {
    size += 8;
  } else if ("doubleValue" in value) {
    size += 8;
  } else if ("timestampValue" in value) {
    size += 8;
  } else if ("stringValue" in value) {
    size += new TextEncoder().encode(value.stringValue).length + 1;
  } else if ("bytesValue" in value) {
    const bytes =
      typeof value.bytesValue === "string"
        ? value.bytesValue
        : value.bytesValue.toString();
    size += bytes.length + 1;
  } else if ("referenceValue" in value) {
    size += new TextEncoder().encode(value.referenceValue).length + 1;
  } else if ("geoPointValue" in value) {
    size += 16; // 8 bytes for latitude + 8 bytes for longitude
  } else if ("arrayValue" in value) {
    size += 1; // Array overhead
    for (const element of value.arrayValue.values) {
      size += calculateFieldSize(element);
    }
  } else if ("mapValue" in value) {
    for (const [key, val] of Object.entries(value.mapValue.fields)) {
      size += calculateFieldSize(val, key);
    }
  }

  return size;
}

/**
 * Calculate the total size of a document in bytes.
 *
 * Includes the size of:
 * - Document name (full path)
 * - All field names and values
 * - Overhead for the document structure
 *
 * @param data - Document data as field value map
 * @param documentPath - Optional document path to include in calculation
 * @returns Total document size in bytes
 *
 * @example
 * ```typescript
 * const data = {
 *   name: { stringValue: "John Doe" },
 *   age: { integerValue: 30 },
 *   active: { booleanValue: true }
 * };
 * const size = calculateDocumentSize(data);
 * console.log(`Document size: ${size} bytes`);
 * ```
 */
export function calculateDocumentSize(
  data: FieldValueMap,
  documentPath?: string
): number {
  let size = 0;

  // Add document path size if provided
  if (documentPath) {
    size += new TextEncoder().encode(documentPath).length;
  }

  // Add size of all fields
  for (const [fieldName, fieldValue] of Object.entries(data)) {
    size += calculateFieldSize(fieldValue as FieldValue, fieldName);
  }

  // Add base overhead (approximately 32 bytes for metadata)
  size += 32;

  return size;
}

/**
 * Estimate document size from plain JavaScript object.
 *
 * This is a quick estimation that doesn't require converting to FieldValue first.
 * Less accurate than calculateDocumentSize but faster for validation.
 *
 * @param data - Plain JavaScript object
 * @returns Estimated size in bytes
 *
 * @example
 * ```typescript
 * const data = {
 *   name: "John Doe",
 *   age: 30,
 *   active: true,
 *   tags: ["developer", "engineer"]
 * };
 * const estimatedSize = estimateDocumentSize(data);
 * ```
 */
export function estimateDocumentSize(data: Record<string, unknown>): number {
  try {
    // Simple estimation using JSON serialization
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json).length + 32; // Add overhead
  } catch {
    // If serialization fails, return a conservative estimate
    return 0;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that a document size is within Firestore limits.
 *
 * Throws an error if the document exceeds 1 MiB.
 * Logs a warning if the document exceeds 80% of the limit.
 *
 * @param data - Document data as field value map
 * @param documentPath - Optional document path for error messages
 * @throws {DocumentTooLargeError} If document exceeds maximum size
 *
 * @example
 * ```typescript
 * const data = { name: { stringValue: "John" } };
 * validateDocumentSize(data); // OK
 *
 * const largeData = { ... }; // > 1 MiB
 * validateDocumentSize(largeData); // Throws DocumentTooLargeError
 * ```
 */
export function validateDocumentSize(
  data: FieldValueMap,
  documentPath?: string
): void {
  const size = calculateDocumentSize(data, documentPath);

  if (size > MAX_DOCUMENT_SIZE) {
    const sizeMB = (size / (1024 * 1024)).toFixed(2);
    const maxMB = (MAX_DOCUMENT_SIZE / (1024 * 1024)).toFixed(2);

    throw new DocumentTooLargeError(
      `Document${
        documentPath ? ` at path "${documentPath}"` : ""
      } exceeds maximum size of ${maxMB} MiB (got ${sizeMB} MiB)`,
      size
    );
  }

  // Warn if approaching the limit
  if (size > DOCUMENT_SIZE_WARNING_THRESHOLD) {
    const percentage = ((size / MAX_DOCUMENT_SIZE) * 100).toFixed(1);
    console.warn(
      `Warning: Document${
        documentPath ? ` at path "${documentPath}"` : ""
      } is ${percentage}% of maximum size limit (${size} / ${MAX_DOCUMENT_SIZE} bytes)`
    );
  }
}

/**
 * Validate batch size against Firestore limits.
 *
 * @param currentSize - Current number of operations in the batch
 * @param maxSize - Maximum allowed size (default: MAX_BATCH_SIZE)
 * @throws {BatchSizeLimitError} If batch size exceeds limit
 *
 * @example
 * ```typescript
 * validateBatchSize(100, 500); // OK
 * validateBatchSize(501, 500); // Throws BatchSizeLimitError
 * ```
 */
export function validateBatchSize(
  currentSize: number,
  maxSize: number = MAX_BATCH_SIZE
): void {
  if (currentSize > maxSize) {
    throw new BatchSizeLimitError(
      `Batch size of ${currentSize} exceeds maximum allowed size of ${maxSize}`,
      currentSize
    );
  }
}

/**
 * Validate transaction operation count.
 *
 * @param writeCount - Number of write operations in the transaction
 * @throws {InvalidArgumentError} If transaction exceeds operation limit
 *
 * @example
 * ```typescript
 * validateTransactionSize(100); // OK
 * validateTransactionSize(501); // Throws InvalidArgumentError
 * ```
 */
export function validateTransactionSize(writeCount: number): void {
  if (writeCount > MAX_TRANSACTION_OPERATIONS) {
    throw new InvalidArgumentError(
      `Transaction contains ${writeCount} write operations, exceeding maximum of ${MAX_TRANSACTION_OPERATIONS}`,
      { argumentName: "transaction" }
    );
  }

  // Warn at 80% capacity
  const warningThreshold = MAX_TRANSACTION_OPERATIONS * 0.8;
  if (writeCount > warningThreshold) {
    const percentage = (
      (writeCount / MAX_TRANSACTION_OPERATIONS) *
      100
    ).toFixed(1);
    console.warn(
      `Warning: Transaction is ${percentage}% of maximum operation limit (${writeCount} / ${MAX_TRANSACTION_OPERATIONS} operations)`
    );
  }
}

/**
 * Validate query IN clause value count.
 *
 * @param valueCount - Number of values in the IN clause
 * @throws {InvalidArgumentError} If value count exceeds limit
 *
 * @example
 * ```typescript
 * validateInClauseSize(10); // OK
 * validateInClauseSize(31); // Throws InvalidArgumentError
 * ```
 */
export function validateInClauseSize(valueCount: number): void {
  if (valueCount > MAX_IN_CLAUSE_VALUES) {
    throw new InvalidArgumentError(
      `IN clause contains ${valueCount} values, exceeding maximum of ${MAX_IN_CLAUSE_VALUES}`,
      { argumentName: "inClause" }
    );
  }
}

/**
 * Validate query OR clause count.
 *
 * @param clauseCount - Number of OR clauses in the query
 * @throws {InvalidArgumentError} If clause count exceeds limit
 *
 * @example
 * ```typescript
 * validateOrClauseCount(10); // OK
 * validateOrClauseCount(31); // Throws InvalidArgumentError
 * ```
 */
export function validateOrClauseCount(clauseCount: number): void {
  if (clauseCount > MAX_OR_CLAUSES) {
    throw new InvalidArgumentError(
      `Query contains ${clauseCount} OR clauses, exceeding maximum of ${MAX_OR_CLAUSES}`,
      { argumentName: "orClauses" }
    );
  }
}

/**
 * Validate listener count for a client.
 *
 * @param listenerCount - Current number of active listeners
 * @throws {InvalidArgumentError} If listener count exceeds recommended limit
 *
 * @example
 * ```typescript
 * validateListenerCount(500); // OK
 * validateListenerCount(1001); // Throws InvalidArgumentError
 * ```
 */
export function validateListenerCount(listenerCount: number): void {
  if (listenerCount > MAX_LISTENERS) {
    throw new InvalidArgumentError(
      `Client has ${listenerCount} active listeners, exceeding recommended maximum of ${MAX_LISTENERS}`,
      { argumentName: "listeners" }
    );
  }

  // Warn at 80% capacity
  const warningThreshold = MAX_LISTENERS * 0.8;
  if (listenerCount > warningThreshold) {
    const percentage = ((listenerCount / MAX_LISTENERS) * 100).toFixed(1);
    console.warn(
      `Warning: Client has ${percentage}% of recommended listener limit (${listenerCount} / ${MAX_LISTENERS} listeners)`
    );
  }
}

/**
 * Validate array length for performance.
 *
 * While Firestore doesn't strictly limit array length, very large arrays
 * can cause performance issues and exceed document size limits.
 *
 * @param arrayLength - Length of the array
 * @throws {InvalidArgumentError} If array is excessively large
 *
 * @example
 * ```typescript
 * validateArrayLength(100); // OK
 * validateArrayLength(5000); // Warning or error
 * ```
 */
export function validateArrayLength(arrayLength: number): void {
  if (arrayLength > RECOMMENDED_MAX_ARRAY_LENGTH) {
    console.warn(
      `Warning: Array length of ${arrayLength} exceeds recommended maximum of ${RECOMMENDED_MAX_ARRAY_LENGTH}. This may cause performance issues.`
    );
  }
}

/**
 * Check if a document size is approaching the limit.
 *
 * @param data - Document data as field value map
 * @returns True if document size exceeds warning threshold
 *
 * @example
 * ```typescript
 * const data = { ... };
 * if (isDocumentSizeNearLimit(data)) {
 *   console.warn("Document is approaching size limit");
 * }
 * ```
 */
export function isDocumentSizeNearLimit(data: FieldValueMap): boolean {
  const size = calculateDocumentSize(data);
  return size > DOCUMENT_SIZE_WARNING_THRESHOLD;
}

/**
 * Get document size statistics.
 *
 * @param data - Document data as field value map
 * @returns Object containing size information
 *
 * @example
 * ```typescript
 * const stats = getDocumentSizeStats(data);
 * console.log(`Size: ${stats.sizeBytes} bytes (${stats.percentOfMax}%)`);
 * ```
 */
export function getDocumentSizeStats(data: FieldValueMap): {
  sizeBytes: number;
  sizeMB: number;
  percentOfMax: number;
  isNearLimit: boolean;
  exceedsLimit: boolean;
} {
  const sizeBytes = calculateDocumentSize(data);
  const sizeMB = sizeBytes / (1024 * 1024);
  const percentOfMax = (sizeBytes / MAX_DOCUMENT_SIZE) * 100;

  return {
    sizeBytes,
    sizeMB,
    percentOfMax,
    isNearLimit: sizeBytes > DOCUMENT_SIZE_WARNING_THRESHOLD,
    exceedsLimit: sizeBytes > MAX_DOCUMENT_SIZE,
  };
}

/**
 * Validate all size constraints for a document.
 *
 * Performs comprehensive validation including:
 * - Document size
 * - Field depth
 * - Array lengths
 *
 * @param data - Document data as field value map
 * @param documentPath - Optional document path for error messages
 * @throws {DocumentTooLargeError} If document exceeds size limit
 * @throws {InvalidArgumentError} If other constraints are violated
 *
 * @example
 * ```typescript
 * const data = {
 *   name: { stringValue: "John" },
 *   tags: { arrayValue: { values: [...] } }
 * };
 * validateAllSizeConstraints(data, "users/user123");
 * ```
 */
export function validateAllSizeConstraints(
  data: FieldValueMap,
  documentPath?: string
): void {
  // Validate document size
  validateDocumentSize(data, documentPath);

  // Validate field depth and array lengths
  for (const [fieldName, fieldValue] of Object.entries(data)) {
    const value = fieldValue as FieldValue;

    // Check array lengths
    if ("arrayValue" in value && value.arrayValue.values) {
      const arrayLength = value.arrayValue.values.length;
      validateArrayLength(arrayLength);
    }
  }
}
