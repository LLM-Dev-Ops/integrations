/**
 * In-memory document store for Firestore simulation.
 *
 * Provides an in-memory storage layer that mimics Firestore's document storage,
 * including support for collections, subcollections, and listener notifications.
 *
 * Following the SPARC specification for Firestore integration.
 */

import type { FieldValueMap } from "../types/field-value.js";
import type { Query } from "../types/query.js";
import { createTimestamp, type Timestamp } from "../types/document.js";
import { DocumentChange, ChangeType } from "../types/index.js";

/**
 * Stored document with metadata.
 */
export interface StoredDocument {
  /** Document fields */
  fields: FieldValueMap;
  /** Creation timestamp */
  createTime: Timestamp;
  /** Last update timestamp */
  updateTime: Timestamp;
}

/**
 * Listener callback for document changes.
 */
export type MockListener = (path: string, change: StoredDocument | null) => void;

/**
 * In-memory document store for mock Firestore client.
 *
 * Stores documents in a hierarchical structure and notifies listeners
 * when documents change.
 */
export class MockDocumentStore {
  private documents: Map<string, StoredDocument> = new Map();
  private listeners: Map<string, Set<MockListener>> = new Map();

  /**
   * Get a document by path.
   *
   * @param path - Document path
   * @returns The stored document, or undefined if not found
   */
  get(path: string): StoredDocument | undefined {
    return this.documents.get(this.normalizePath(path));
  }

  /**
   * Set a document (create or replace).
   *
   * @param path - Document path
   * @param data - Document data
   */
  set(path: string, data: FieldValueMap): void {
    const normalizedPath = this.normalizePath(path);
    const existingDoc = this.documents.get(normalizedPath);
    const now = createTimestamp();

    const doc: StoredDocument = {
      fields: { ...data },
      createTime: existingDoc?.createTime ?? now,
      updateTime: now,
    };

    this.documents.set(normalizedPath, doc);
    this.notifyListeners(normalizedPath, doc);
  }

  /**
   * Update specific fields in a document.
   *
   * @param path - Document path
   * @param updates - Fields to update
   * @throws Error if document doesn't exist
   */
  update(path: string, updates: FieldValueMap): void {
    const normalizedPath = this.normalizePath(path);
    const existingDoc = this.documents.get(normalizedPath);

    if (!existingDoc) {
      throw new Error(`Document not found: ${path}`);
    }

    const doc: StoredDocument = {
      fields: { ...existingDoc.fields, ...updates },
      createTime: existingDoc.createTime,
      updateTime: createTimestamp(),
    };

    this.documents.set(normalizedPath, doc);
    this.notifyListeners(normalizedPath, doc);
  }

  /**
   * Delete a document.
   *
   * @param path - Document path
   * @returns True if the document existed and was deleted
   */
  delete(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const existed = this.documents.has(normalizedPath);

    if (existed) {
      this.documents.delete(normalizedPath);
      this.notifyListeners(normalizedPath, null);
    }

    return existed;
  }

  /**
   * Check if a document exists.
   *
   * @param path - Document path
   * @returns True if the document exists
   */
  exists(path: string): boolean {
    return this.documents.has(this.normalizePath(path));
  }

  /**
   * List all documents in a collection.
   *
   * @param collectionPath - Collection path (e.g., "users" or "users/123/orders")
   * @returns Array of stored documents with their paths
   */
  list(collectionPath: string): Array<{ path: string; doc: StoredDocument }> {
    const normalizedCollectionPath = this.normalizePath(collectionPath);
    const results: Array<{ path: string; doc: StoredDocument }> = [];

    for (const [path, doc] of this.documents.entries()) {
      if (this.isInCollection(path, normalizedCollectionPath)) {
        results.push({ path, doc });
      }
    }

    return results;
  }

  /**
   * Query documents (basic implementation - detailed evaluation in MockQueryEngine).
   *
   * This method returns all documents that could match the query.
   * The actual filter/order/limit logic is in MockQueryEngine.
   *
   * @param query - Query object
   * @returns Array of stored documents with their paths
   */
  query(query: Query): Array<{ path: string; doc: StoredDocument }> {
    const results: Array<{ path: string; doc: StoredDocument }> = [];

    // Get collection ID from query
    if (query.from.length === 0) {
      return results;
    }

    const selector = query.from[0];
    const collectionId = selector.collectionId;

    // Find all documents in collections matching the ID
    for (const [path, doc] of this.documents.entries()) {
      const pathSegments = path.split("/");

      if (selector.allDescendants) {
        // Collection group query - match any collection with this ID
        if (pathSegments[pathSegments.length - 2] === collectionId) {
          results.push({ path, doc });
        }
      } else {
        // Direct collection query
        if (pathSegments.length >= 2 && pathSegments[pathSegments.length - 2] === collectionId) {
          results.push({ path, doc });
        }
      }
    }

    return results;
  }

  /**
   * Add a listener for document changes.
   *
   * @param pathPattern - Document or collection path (supports wildcards)
   * @param listener - Callback function
   * @returns Function to remove the listener
   */
  addListener(pathPattern: string, listener: MockListener): () => void {
    const normalizedPattern = this.normalizePath(pathPattern);

    if (!this.listeners.has(normalizedPattern)) {
      this.listeners.set(normalizedPattern, new Set());
    }

    this.listeners.get(normalizedPattern)!.add(listener);

    return () => {
      const listeners = this.listeners.get(normalizedPattern);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(normalizedPattern);
        }
      }
    };
  }

  /**
   * Remove all listeners for a path pattern.
   *
   * @param pathPattern - Document or collection path
   */
  removeListeners(pathPattern: string): void {
    this.listeners.delete(this.normalizePath(pathPattern));
  }

  /**
   * Clear all documents and listeners.
   */
  clear(): void {
    this.documents.clear();
    this.listeners.clear();
  }

  /**
   * Get the total number of documents.
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Get all document paths.
   */
  getAllPaths(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Normalize a document path (remove leading/trailing slashes).
   *
   * @param path - Path to normalize
   * @returns Normalized path
   */
  private normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, "");
  }

  /**
   * Check if a document path is in a collection.
   *
   * @param docPath - Document path
   * @param collectionPath - Collection path
   * @returns True if the document is in the collection
   */
  private isInCollection(docPath: string, collectionPath: string): boolean {
    const docSegments = docPath.split("/");
    const collectionSegments = collectionPath.split("/");

    // Document must have more segments than collection
    if (docSegments.length <= collectionSegments.length) {
      return false;
    }

    // Check if collection path matches
    for (let i = 0; i < collectionSegments.length; i++) {
      if (docSegments[i] !== collectionSegments[i]) {
        return false;
      }
    }

    // Document should be directly in the collection (next segment after collection path)
    return docSegments.length === collectionSegments.length + 1;
  }

  /**
   * Notify listeners of a document change.
   *
   * @param path - Document path
   * @param doc - Updated document (null if deleted)
   */
  private notifyListeners(path: string, doc: StoredDocument | null): void {
    // Notify exact path listeners
    const exactListeners = this.listeners.get(path);
    if (exactListeners) {
      for (const listener of exactListeners) {
        listener(path, doc);
      }
    }

    // Notify collection listeners
    const pathSegments = path.split("/");
    if (pathSegments.length >= 2) {
      const collectionPath = pathSegments.slice(0, -1).join("/");
      const collectionListeners = this.listeners.get(collectionPath);
      if (collectionListeners) {
        for (const listener of collectionListeners) {
          listener(path, doc);
        }
      }
    }
  }

  /**
   * Bulk load documents (useful for testing).
   *
   * @param documents - Map of path to document data
   */
  bulkLoad(documents: Record<string, FieldValueMap>): void {
    for (const [path, data] of Object.entries(documents)) {
      this.set(path, data);
    }
  }

  /**
   * Export all documents to a plain object.
   *
   * @returns Map of path to document
   */
  export(): Record<string, StoredDocument> {
    const result: Record<string, StoredDocument> = {};
    for (const [path, doc] of this.documents.entries()) {
      result[path] = {
        fields: { ...doc.fields },
        createTime: doc.createTime,
        updateTime: doc.updateTime,
      };
    }
    return result;
  }

  /**
   * Get collection statistics.
   *
   * @param collectionPath - Collection path
   * @returns Statistics about the collection
   */
  getCollectionStats(collectionPath: string): {
    documentCount: number;
    paths: string[];
  } {
    const docs = this.list(collectionPath);
    return {
      documentCount: docs.length,
      paths: docs.map((d) => d.path),
    };
  }
}

/**
 * Create a new mock document store.
 *
 * @returns New MockDocumentStore instance
 */
export function createMockDocumentStore(): MockDocumentStore {
  return new MockDocumentStore();
}
