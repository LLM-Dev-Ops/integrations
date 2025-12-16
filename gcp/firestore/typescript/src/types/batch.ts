/**
 * Batch write types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents batch writes, individual write operations, and preconditions.
 */

import { DocumentRef, Precondition, WriteResult, Timestamp } from "./document.js";
import { FieldValue, FieldTransform } from "./field-value.js";

// ============================================================================
// Write Operation Types
// ============================================================================

/**
 * Set options for document writes.
 */
export interface SetOptions {
  /** Merge with existing document instead of overwriting */
  merge?: boolean;
  /** Merge only specific fields (field paths) */
  mergeFields?: string[];
}

/**
 * Set write - creates or overwrites a document.
 */
export interface SetWrite {
  type: "set";
  /** Document reference to write */
  document: DocumentRef;
  /** Document fields */
  fields: Record<string, FieldValue>;
  /** Set options (merge behavior) */
  options?: SetOptions;
}

/**
 * Update write - updates specific fields in a document.
 */
export interface UpdateWrite {
  type: "update";
  /** Document reference to update */
  document: DocumentRef;
  /** Fields to update */
  fields: Record<string, FieldValue>;
  /** Field mask - paths of fields to update */
  updateMask?: string[];
  /** Precondition for the update */
  currentDocument?: Precondition;
}

/**
 * Delete write - deletes a document.
 */
export interface DeleteWrite {
  type: "delete";
  /** Document reference to delete */
  document: DocumentRef;
  /** Precondition for the deletion */
  currentDocument?: Precondition;
}

/**
 * Transform write - applies field transforms.
 */
export interface TransformWrite {
  type: "transform";
  /** Document reference to transform */
  document: DocumentRef;
  /** Field transforms to apply */
  fieldTransforms: FieldTransform[];
  /** Precondition for the transform */
  currentDocument?: Precondition;
}

/**
 * Write operation union type.
 */
export type Write = SetWrite | UpdateWrite | DeleteWrite | TransformWrite;

// ============================================================================
// Batch Write Types
// ============================================================================

/**
 * Write batch for atomic multi-document writes.
 */
export interface WriteBatch {
  /** List of write operations */
  writes: Write[];
  /** Labels for the batch (metadata) */
  labels?: Record<string, string>;
}

/**
 * Result of a batch write operation.
 */
export interface BatchWriteResult {
  /** Results for each write operation */
  writeResults: WriteResult[];
  /** Commit time for the batch */
  commitTime: Timestamp;
  /** Status of each write (for partial failures) */
  status?: WriteStatus[];
}

/**
 * Status of a single write in a batch.
 */
export interface WriteStatus {
  /** Index of the write in the batch */
  index: number;
  /** Success status */
  success: boolean;
  /** Error code (if failed) */
  code?: string;
  /** Error message (if failed) */
  message?: string;
}

// ============================================================================
// Factory Functions for Write Operations
// ============================================================================

/**
 * Create a set write operation.
 */
export function createSetWrite(
  document: DocumentRef,
  fields: Record<string, FieldValue>,
  options?: SetOptions
): SetWrite {
  return { type: "set", document, fields, options };
}

/**
 * Create an update write operation.
 */
export function createUpdateWrite(
  document: DocumentRef,
  fields: Record<string, FieldValue>,
  updateMask?: string[],
  currentDocument?: Precondition
): UpdateWrite {
  return { type: "update", document, fields, updateMask, currentDocument };
}

/**
 * Create a delete write operation.
 */
export function createDeleteWrite(
  document: DocumentRef,
  currentDocument?: Precondition
): DeleteWrite {
  return { type: "delete", document, currentDocument };
}

/**
 * Create a transform write operation.
 */
export function createTransformWrite(
  document: DocumentRef,
  fieldTransforms: FieldTransform[],
  currentDocument?: Precondition
): TransformWrite {
  return { type: "transform", document, fieldTransforms, currentDocument };
}

// ============================================================================
// Factory Functions for Batch
// ============================================================================

/**
 * Create an empty write batch.
 */
export function createWriteBatch(labels?: Record<string, string>): WriteBatch {
  return { writes: [], labels };
}

/**
 * Add a write to a batch.
 */
export function addWrite(batch: WriteBatch, write: Write): WriteBatch {
  return {
    ...batch,
    writes: [...batch.writes, write],
  };
}

/**
 * Add a set operation to a batch.
 */
export function batchSet(
  batch: WriteBatch,
  document: DocumentRef,
  fields: Record<string, FieldValue>,
  options?: SetOptions
): WriteBatch {
  return addWrite(batch, createSetWrite(document, fields, options));
}

/**
 * Add an update operation to a batch.
 */
export function batchUpdate(
  batch: WriteBatch,
  document: DocumentRef,
  fields: Record<string, FieldValue>,
  updateMask?: string[],
  currentDocument?: Precondition
): WriteBatch {
  return addWrite(
    batch,
    createUpdateWrite(document, fields, updateMask, currentDocument)
  );
}

/**
 * Add a delete operation to a batch.
 */
export function batchDelete(
  batch: WriteBatch,
  document: DocumentRef,
  currentDocument?: Precondition
): WriteBatch {
  return addWrite(batch, createDeleteWrite(document, currentDocument));
}

/**
 * Add a transform operation to a batch.
 */
export function batchTransform(
  batch: WriteBatch,
  document: DocumentRef,
  fieldTransforms: FieldTransform[],
  currentDocument?: Precondition
): WriteBatch {
  return addWrite(
    batch,
    createTransformWrite(document, fieldTransforms, currentDocument)
  );
}

/**
 * Get the number of writes in a batch.
 */
export function getBatchSize(batch: WriteBatch): number {
  return batch.writes.length;
}

/**
 * Check if a batch is empty.
 */
export function isBatchEmpty(batch: WriteBatch): boolean {
  return batch.writes.length === 0;
}

/**
 * Create set options for merge behavior.
 */
export function createSetOptions(
  merge: boolean,
  mergeFields?: string[]
): SetOptions {
  return { merge, mergeFields };
}

/**
 * Create set options for full merge.
 */
export function mergeAll(): SetOptions {
  return { merge: true };
}

/**
 * Create set options for selective merge.
 */
export function mergeFields(...fields: string[]): SetOptions {
  return { merge: true, mergeFields: fields };
}

/**
 * Create a write status.
 */
export function createWriteStatus(
  index: number,
  success: boolean,
  code?: string,
  message?: string
): WriteStatus {
  return { index, success, code, message };
}

/**
 * Check if all writes in a batch succeeded.
 */
export function allWritesSucceeded(result: BatchWriteResult): boolean {
  if (!result.status) {
    return true; // No status means all succeeded
  }
  return result.status.every((status) => status.success);
}

/**
 * Get failed writes from a batch result.
 */
export function getFailedWrites(result: BatchWriteResult): WriteStatus[] {
  if (!result.status) {
    return [];
  }
  return result.status.filter((status) => !status.success);
}

/**
 * Get succeeded writes from a batch result.
 */
export function getSucceededWrites(result: BatchWriteResult): WriteStatus[] {
  if (!result.status) {
    return result.writeResults.map((_, index) =>
      createWriteStatus(index, true)
    );
  }
  return result.status.filter((status) => status.success);
}
