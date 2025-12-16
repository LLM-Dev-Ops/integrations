/**
 * Document types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents documents, document references, snapshots, and write results.
 */

import { FieldValue } from "./field-value.js";

/**
 * Document path components.
 * Format: projects/{project_id}/databases/{database_id}/documents/{collection_path}/{document_id}
 */
export interface DocumentPath {
  /** GCP project ID */
  project_id: string;
  /** Database ID (default: "(default)") */
  database_id: string;
  /** Collection path (may include subcollections) */
  collection_path: string;
  /** Document ID within the collection */
  document_id: string;
}

/**
 * Reference to a Firestore document.
 * Represents a pointer to a document location without the data.
 */
export interface DocumentRef {
  /** Full document path */
  path: DocumentPath;
  /** Document ID (convenience field) */
  id: string;
  /** Parent collection path */
  parent: string;
}

/**
 * A Firestore document with its data.
 * Maps field names to field values.
 */
export interface Document {
  /** Document fields as key-value pairs */
  fields: Record<string, FieldValue>;
  /** Document name (full path) */
  name: string;
  /** Creation time */
  createTime?: Timestamp;
  /** Last update time */
  updateTime?: Timestamp;
}

/**
 * Timestamp representation in Firestore.
 * RFC 3339 format with nanosecond precision.
 */
export interface Timestamp {
  /** Seconds since Unix epoch */
  seconds: number;
  /** Nanoseconds (0-999,999,999) */
  nanos: number;
}

/**
 * A document snapshot contains data read from a document.
 * Includes the document data, metadata, and whether it exists.
 */
export interface DocumentSnapshot {
  /** Reference to the document */
  reference: DocumentRef;
  /** Whether the document exists */
  exists: boolean;
  /** Document data (null if doesn't exist) */
  data: Record<string, unknown> | null;
  /** Document creation time */
  create_time?: Timestamp;
  /** Document last update time */
  update_time?: Timestamp;
  /** Time this snapshot was read */
  read_time: Timestamp;
}

/**
 * Result of a write operation.
 * Contains the time the write was committed and any transform results.
 */
export interface WriteResult {
  /** Time the write was committed */
  update_time: Timestamp;
  /** Results of field transforms (if any) */
  transform_results?: FieldValue[];
}

/**
 * Result of a document creation.
 * Extends WriteResult with the created document reference.
 */
export interface CreateResult extends WriteResult {
  /** Reference to the created document */
  document_ref: DocumentRef;
}

/**
 * Result of a document update.
 */
export interface UpdateResult extends WriteResult {
  /** Number of fields updated */
  fields_updated?: number;
}

/**
 * Result of a document deletion.
 */
export interface DeleteResult {
  /** Time the deletion was committed */
  commit_time: Timestamp;
  /** Whether the document existed before deletion */
  existed: boolean;
}

/**
 * Document mask - specifies which fields to return.
 */
export interface DocumentMask {
  /** List of field paths to include */
  field_paths: string[];
}

/**
 * Precondition for a write operation.
 */
export interface Precondition {
  /** Document must exist */
  exists?: boolean;
  /** Document must have this update time */
  update_time?: Timestamp;
}

// ============================================================================
// Factory and Helper Functions
// ============================================================================

/**
 * Create a document path from components.
 */
export function createDocumentPath(
  project_id: string,
  collection_path: string,
  document_id: string,
  database_id: string = "(default)"
): DocumentPath {
  return {
    project_id,
    database_id,
    collection_path,
    document_id,
  };
}

/**
 * Create a document reference.
 */
export function createDocumentRef(path: DocumentPath): DocumentRef {
  const fullPath = formatDocumentPath(path);
  const parentPath = path.collection_path;

  return {
    path,
    id: path.document_id,
    parent: parentPath,
  };
}

/**
 * Format a document path as a string.
 * Format: projects/{project_id}/databases/{database_id}/documents/{collection_path}/{document_id}
 */
export function formatDocumentPath(path: DocumentPath): string {
  return `projects/${path.project_id}/databases/${path.database_id}/documents/${path.collection_path}/${path.document_id}`;
}

/**
 * Parse a document path string into components.
 */
export function parseDocumentPath(pathString: string): DocumentPath {
  const pattern = /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)\/([^/]+)$/;
  const match = pathString.match(pattern);

  if (!match) {
    throw new Error(`Invalid document path: ${pathString}`);
  }

  return {
    project_id: match[1],
    database_id: match[2],
    collection_path: match[3],
    document_id: match[4],
  };
}

/**
 * Create a timestamp from a Date object.
 */
export function createTimestamp(date: Date = new Date()): Timestamp {
  const milliseconds = date.getTime();
  const seconds = Math.floor(milliseconds / 1000);
  const nanos = (milliseconds % 1000) * 1_000_000;

  return { seconds, nanos };
}

/**
 * Convert a timestamp to a Date object.
 */
export function timestampToDate(timestamp: Timestamp): Date {
  const milliseconds = timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000);
  return new Date(milliseconds);
}

/**
 * Create a document snapshot.
 */
export function createDocumentSnapshot(
  reference: DocumentRef,
  exists: boolean,
  data: Record<string, unknown> | null,
  create_time?: Timestamp,
  update_time?: Timestamp,
  read_time?: Timestamp
): DocumentSnapshot {
  return {
    reference,
    exists,
    data,
    create_time,
    update_time,
    read_time: read_time ?? createTimestamp(),
  };
}

/**
 * Create a document mask from field paths.
 */
export function createDocumentMask(field_paths: string[]): DocumentMask {
  return { field_paths };
}

/**
 * Create a precondition for document existence.
 */
export function preconditionExists(exists: boolean): Precondition {
  return { exists };
}

/**
 * Create a precondition for update time.
 */
export function preconditionUpdateTime(update_time: Timestamp): Precondition {
  return { update_time };
}
