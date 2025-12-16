/**
 * Document path validation for Google Cloud Firestore.
 *
 * Following the SPARC specification and Firestore requirements:
 * - Must be non-empty
 * - Must have even number of segments (collection/doc/collection/doc)
 * - Each segment must be non-empty
 * - Cannot contain only "/" characters
 *
 * Document paths in Firestore follow the pattern:
 * collection/document/[subcollection/subdocument/...]
 */

import { InvalidArgumentError } from "../error/index.js";
import { validateDocumentId } from "./document-id.js";

/**
 * Parsed document path components.
 */
export interface DocumentPath {
  /** Collection path (all segments except the last document ID) */
  collectionPath: string;
  /** Document ID (last segment) */
  documentId: string;
}

/**
 * Validated document path with full details.
 */
export interface ValidatedDocumentPath {
  /** Full document path */
  path: string;
  /** All path segments */
  segments: string[];
  /** Collection path */
  collectionPath: string;
  /** Document ID */
  documentId: string;
  /** Whether this is a nested document (in a subcollection) */
  isNested: boolean;
}

/**
 * Validate a document path according to Firestore rules.
 *
 * A valid document path must:
 * - Be non-empty
 * - Have an even number of segments (collection/doc pairs)
 * - Each segment must be non-empty
 * - Not consist only of "/" characters
 *
 * @param path - Document path to validate
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * validateDocumentPath("users/user123"); // Valid
 * validateDocumentPath("users/user123/posts/post456"); // Valid (subcollection)
 * validateDocumentPath(""); // Throws: Cannot be empty
 * validateDocumentPath("users"); // Throws: Must have even segments
 * validateDocumentPath("users//doc"); // Throws: Empty segment
 * validateDocumentPath("///"); // Throws: Only slashes
 * ```
 */
export function validateDocumentPath(path: string): void {
  // Check for empty or whitespace-only paths
  if (!path || path.trim().length === 0) {
    throw new InvalidArgumentError("Document path cannot be empty", {
      argumentName: "documentPath",
    });
  }

  // Check for paths that are only slashes
  if (path.replace(/\//g, "").length === 0) {
    throw new InvalidArgumentError(
      "Document path cannot contain only '/' characters",
      { argumentName: "documentPath" }
    );
  }

  // Remove leading and trailing slashes for parsing
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");

  if (normalizedPath.length === 0) {
    throw new InvalidArgumentError(
      "Document path cannot contain only '/' characters",
      { argumentName: "documentPath" }
    );
  }

  // Split into segments
  const segments = normalizedPath.split("/");

  // Check for empty segments
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i] || segments[i]!.trim().length === 0) {
      throw new InvalidArgumentError(
        `Document path segment at index ${i} is empty`,
        { argumentName: "documentPath" }
      );
    }
  }

  // Document paths must have an even number of segments
  // (collection/doc, collection/doc/subcollection/subdoc, etc.)
  if (segments.length % 2 !== 0) {
    throw new InvalidArgumentError(
      `Document path must have an even number of segments (collection/document pairs). Got ${segments.length} segments in "${path}"`,
      { argumentName: "documentPath" }
    );
  }

  // Validate each document ID (even-indexed segments are collections, odd are documents)
  for (let i = 1; i < segments.length; i += 2) {
    const docId = segments[i]!;
    try {
      validateDocumentId(docId);
    } catch (error) {
      throw new InvalidArgumentError(
        `Invalid document ID "${docId}" at position ${i} in path "${path}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        { argumentName: "documentPath" }
      );
    }
  }

  // Validate collection IDs (even-indexed segments)
  for (let i = 0; i < segments.length; i += 2) {
    const collectionId = segments[i]!;

    // Collection IDs have similar constraints to document IDs
    if (collectionId.startsWith("__")) {
      throw new InvalidArgumentError(
        `Collection ID "${collectionId}" at position ${i} cannot start with "__" (reserved for system use)`,
        { argumentName: "documentPath" }
      );
    }

    if (collectionId.includes("\0")) {
      throw new InvalidArgumentError(
        `Collection ID "${collectionId}" at position ${i} cannot contain null character (\\0)`,
        { argumentName: "documentPath" }
      );
    }
  }
}

/**
 * Check if a document path is valid without throwing.
 *
 * @param path - Document path to check
 * @returns True if the document path is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidDocumentPath("users/user123"); // true
 * isValidDocumentPath("users"); // false
 * isValidDocumentPath(""); // false
 * ```
 */
export function isValidDocumentPath(path: string): boolean {
  try {
    validateDocumentPath(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a document path into collection path and document ID.
 *
 * @param path - Document path to parse
 * @returns Parsed document path components
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * parseDocumentPath("users/user123");
 * // Returns: { collectionPath: "users", documentId: "user123" }
 *
 * parseDocumentPath("users/user123/posts/post456");
 * // Returns: { collectionPath: "users/user123/posts", documentId: "post456" }
 * ```
 */
export function parseDocumentPath(path: string): DocumentPath {
  validateDocumentPath(path);

  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  const segments = normalizedPath.split("/");

  // Last segment is the document ID
  const documentId = segments[segments.length - 1]!;

  // All segments except the last form the collection path
  const collectionPath = segments.slice(0, -1).join("/");

  return {
    collectionPath,
    documentId,
  };
}

/**
 * Build a document path from collection path and document ID.
 *
 * @param collectionPath - Collection path (e.g., "users" or "users/user123/posts")
 * @param documentId - Document ID
 * @returns Complete document path
 * @throws {InvalidArgumentError} If the resulting path is invalid
 *
 * @example
 * ```typescript
 * buildDocumentPath("users", "user123");
 * // Returns: "users/user123"
 *
 * buildDocumentPath("users/user123/posts", "post456");
 * // Returns: "users/user123/posts/post456"
 * ```
 */
export function buildDocumentPath(
  collectionPath: string,
  documentId: string
): string {
  if (!collectionPath || collectionPath.trim().length === 0) {
    throw new InvalidArgumentError("Collection path cannot be empty", {
      argumentName: "collectionPath",
    });
  }

  if (!documentId || documentId.trim().length === 0) {
    throw new InvalidArgumentError("Document ID cannot be empty", {
      argumentName: "documentId",
    });
  }

  // Validate document ID
  validateDocumentId(documentId);

  // Normalize collection path (remove leading/trailing slashes)
  const normalizedCollection = collectionPath.replace(/^\/+|\/+$/g, "");

  // Build and validate the full path
  const fullPath = `${normalizedCollection}/${documentId}`;
  validateDocumentPath(fullPath);

  return fullPath;
}

/**
 * Build a full Firestore document name (resource name).
 *
 * Format: projects/{project}/databases/{database}/documents/{document_path}
 *
 * @param databasePath - Database path (projects/{project}/databases/{database})
 * @param documentPath - Document path relative to the database
 * @returns Full resource name
 *
 * @example
 * ```typescript
 * buildDocumentName(
 *   "projects/my-project/databases/(default)",
 *   "users/user123"
 * );
 * // Returns: "projects/my-project/databases/(default)/documents/users/user123"
 * ```
 */
export function buildDocumentName(
  databasePath: string,
  documentPath: string
): string {
  if (!databasePath || databasePath.trim().length === 0) {
    throw new InvalidArgumentError("Database path cannot be empty", {
      argumentName: "databasePath",
    });
  }

  validateDocumentPath(documentPath);

  // Ensure databasePath doesn't end with /documents
  const normalizedDbPath = databasePath.replace(/\/documents\/?$/, "");

  // Ensure documentPath doesn't start with /
  const normalizedDocPath = documentPath.replace(/^\/+/, "");

  return `${normalizedDbPath}/documents/${normalizedDocPath}`;
}

/**
 * Parse a full Firestore document name into components.
 *
 * @param documentName - Full document resource name
 * @returns Object containing database path and document path
 * @throws {InvalidArgumentError} If the document name is malformed
 *
 * @example
 * ```typescript
 * parseDocumentName(
 *   "projects/my-project/databases/(default)/documents/users/user123"
 * );
 * // Returns: {
 * //   databasePath: "projects/my-project/databases/(default)",
 * //   documentPath: "users/user123"
 * // }
 * ```
 */
export function parseDocumentName(documentName: string): {
  databasePath: string;
  documentPath: string;
} {
  const pattern = /^(projects\/[^/]+\/databases\/[^/]+)\/documents\/(.+)$/;
  const match = documentName.match(pattern);

  if (!match) {
    throw new InvalidArgumentError(
      `Invalid document name format: "${documentName}". Expected: projects/{project}/databases/{database}/documents/{path}`,
      { argumentName: "documentName" }
    );
  }

  const databasePath = match[1]!;
  const documentPath = match[2]!;

  // Validate the document path portion
  validateDocumentPath(documentPath);

  return {
    databasePath,
    documentPath,
  };
}

/**
 * Get the parent collection path from a document path.
 *
 * @param documentPath - Document path
 * @returns Parent collection path
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * getParentCollectionPath("users/user123");
 * // Returns: "users"
 *
 * getParentCollectionPath("users/user123/posts/post456");
 * // Returns: "users/user123/posts"
 * ```
 */
export function getParentCollectionPath(documentPath: string): string {
  const { collectionPath } = parseDocumentPath(documentPath);
  return collectionPath;
}

/**
 * Get the parent document path from a nested document path.
 * Returns null if the document is at the root level.
 *
 * @param documentPath - Document path
 * @returns Parent document path or null
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * getParentDocumentPath("users/user123");
 * // Returns: null (root level)
 *
 * getParentDocumentPath("users/user123/posts/post456");
 * // Returns: "users/user123"
 * ```
 */
export function getParentDocumentPath(documentPath: string): string | null {
  validateDocumentPath(documentPath);

  const segments = documentPath.replace(/^\/+|\/+$/g, "").split("/");

  // Root level documents (2 segments) have no parent document
  if (segments.length === 2) {
    return null;
  }

  // Remove the last two segments (subcollection/subdocument)
  const parentSegments = segments.slice(0, -2);
  return parentSegments.join("/");
}

/**
 * Extract all path segments from a document path.
 *
 * @param documentPath - Document path
 * @returns Array of path segments
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * getPathSegments("users/user123");
 * // Returns: ["users", "user123"]
 *
 * getPathSegments("users/user123/posts/post456");
 * // Returns: ["users", "user123", "posts", "post456"]
 * ```
 */
export function getPathSegments(documentPath: string): string[] {
  validateDocumentPath(documentPath);
  return documentPath.replace(/^\/+|\/+$/g, "").split("/");
}

/**
 * Check if a document path is nested (in a subcollection).
 *
 * @param documentPath - Document path
 * @returns True if the document is in a subcollection
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * isNestedDocument("users/user123");
 * // Returns: false
 *
 * isNestedDocument("users/user123/posts/post456");
 * // Returns: true
 * ```
 */
export function isNestedDocument(documentPath: string): boolean {
  validateDocumentPath(documentPath);
  const segments = documentPath.replace(/^\/+|\/+$/g, "").split("/");
  return segments.length > 2;
}

/**
 * Get the depth of a document path (number of collection/document levels).
 *
 * @param documentPath - Document path
 * @returns Depth of the document path
 * @throws {InvalidArgumentError} If the document path is invalid
 *
 * @example
 * ```typescript
 * getDocumentDepth("users/user123");
 * // Returns: 1 (one collection/document pair)
 *
 * getDocumentDepth("users/user123/posts/post456");
 * // Returns: 2 (two collection/document pairs)
 * ```
 */
export function getDocumentDepth(documentPath: string): number {
  const segments = getPathSegments(documentPath);
  return segments.length / 2;
}

/**
 * Normalize a document path by removing leading/trailing slashes.
 *
 * @param documentPath - Document path to normalize
 * @returns Normalized document path
 *
 * @example
 * ```typescript
 * normalizeDocumentPath("/users/user123/");
 * // Returns: "users/user123"
 * ```
 */
export function normalizeDocumentPath(documentPath: string): string {
  return documentPath.replace(/^\/+|\/+$/g, "");
}
