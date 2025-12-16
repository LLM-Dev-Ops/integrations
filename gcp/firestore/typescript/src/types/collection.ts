/**
 * Collection types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents collections, collection references, and collection groups.
 */

import { DocumentRef } from "./document.js";

/**
 * Collection path in Firestore.
 * Format: projects/{project_id}/databases/{database_id}/documents/{collection_path}
 */
export interface CollectionPath {
  /** GCP project ID */
  project_id: string;
  /** Database ID (default: "(default)") */
  database_id: string;
  /** Collection path (may include parent documents for subcollections) */
  collection_path: string;
}

/**
 * Reference to a Firestore collection.
 * Represents a pointer to a collection location.
 */
export interface CollectionRef {
  /** Collection path */
  path: CollectionPath;
  /** Collection ID (last segment of path) */
  id: string;
  /** Parent document reference (for subcollections) */
  parent?: DocumentRef;
}

/**
 * Collection group query.
 * Queries across all collections with the same ID, regardless of parent.
 */
export interface CollectionGroup {
  /** Collection ID to query */
  collection_id: string;
  /** Include all descendants (nested subcollections) */
  all_descendants: boolean;
  /** Project ID */
  project_id: string;
  /** Database ID */
  database_id: string;
}

/**
 * Collection metadata.
 * Additional information about a collection.
 */
export interface CollectionMetadata {
  /** Collection reference */
  collection_ref: CollectionRef;
  /** Estimated document count (if available) */
  estimated_count?: number;
  /** Whether this is a subcollection */
  is_subcollection: boolean;
}

/**
 * List of collection IDs.
 * Result of listing collections under a document or at root.
 */
export interface CollectionIdList {
  /** List of collection IDs */
  collection_ids: string[];
  /** Continuation token for pagination */
  next_page_token?: string;
}

// ============================================================================
// Factory and Helper Functions
// ============================================================================

/**
 * Create a collection path.
 */
export function createCollectionPath(
  project_id: string,
  collection_path: string,
  database_id: string = "(default)"
): CollectionPath {
  return {
    project_id,
    database_id,
    collection_path,
  };
}

/**
 * Create a collection reference.
 */
export function createCollectionRef(
  path: CollectionPath,
  parent?: DocumentRef
): CollectionRef {
  // Extract the collection ID (last segment)
  const segments = path.collection_path.split("/");
  const id = segments[segments.length - 1];

  return {
    path,
    id,
    parent,
  };
}

/**
 * Create a collection group query.
 */
export function createCollectionGroup(
  project_id: string,
  collection_id: string,
  all_descendants: boolean = true,
  database_id: string = "(default)"
): CollectionGroup {
  return {
    collection_id,
    all_descendants,
    project_id,
    database_id,
  };
}

/**
 * Format a collection path as a string.
 * Format: projects/{project_id}/databases/{database_id}/documents/{collection_path}
 */
export function formatCollectionPath(path: CollectionPath): string {
  return `projects/${path.project_id}/databases/${path.database_id}/documents/${path.collection_path}`;
}

/**
 * Parse a collection path string into components.
 */
export function parseCollectionPath(pathString: string): CollectionPath {
  const pattern = /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/;
  const match = pathString.match(pattern);

  if (!match) {
    throw new Error(`Invalid collection path: ${pathString}`);
  }

  return {
    project_id: match[1],
    database_id: match[2],
    collection_path: match[3],
  };
}

/**
 * Get the parent collection path from a subcollection path.
 * Returns null if this is a root collection.
 */
export function getParentCollectionPath(
  collection_path: string
): string | null {
  const segments = collection_path.split("/");

  // Root collection has only one segment
  if (segments.length === 1) {
    return null;
  }

  // Remove the last segment (current collection ID)
  // and the segment before it (parent document ID)
  segments.pop(); // Remove collection ID
  if (segments.length > 0) {
    segments.pop(); // Remove parent document ID
  }

  return segments.length > 0 ? segments.join("/") : null;
}

/**
 * Check if a collection is a subcollection.
 */
export function isSubcollection(collection_path: string): boolean {
  // Subcollections have at least 3 segments: parentCollection/parentDoc/subcollection
  return collection_path.split("/").length >= 3;
}

/**
 * Build a subcollection path.
 */
export function buildSubcollectionPath(
  parent_collection: string,
  parent_document_id: string,
  subcollection_id: string
): string {
  return `${parent_collection}/${parent_document_id}/${subcollection_id}`;
}

/**
 * Extract collection ID from a collection path.
 */
export function extractCollectionId(collection_path: string): string {
  const segments = collection_path.split("/");
  return segments[segments.length - 1];
}
