/**
 * Mock Firestore client for testing and simulation.
 *
 * Provides a complete in-memory Firestore client implementation with
 * configurable behavior, error injection, and operation recording.
 *
 * Following the SPARC specification for Firestore integration.
 */

import type { FieldValueMap } from "../types/field-value.js";
import type {
  DocumentSnapshot,
  DocumentRef,
  Timestamp,
  WriteResult,
  DeleteResult,
  createDocumentRef,
  createTimestamp,
} from "../types/document.js";
import type { Query, QuerySnapshot } from "../types/index.js";
import type { FirestoreError } from "../error/index.js";
import type { ListenTarget, ListenerRegistration, DocumentChange } from "../types/index.js";
import {
  MockDocumentStore,
  StoredDocument,
  createMockDocumentStore,
} from "./mock-store.js";
import { MockQueryEngine, createMockQueryEngine } from "./mock-query.js";
import { MockListenerManager, createMockListenerManager } from "./mock-listener.js";
import { OperationRecorder, RecordedOperation, createOperationRecorder } from "./recorder.js";
import { NotFoundError, AlreadyExistsError } from "../error/index.js";

/**
 * Transaction behavior for simulation.
 */
export type TransactionBehavior = "commit" | "abort";

/**
 * Mock document for pre-populating the store.
 */
export interface MockDocument {
  path: string;
  data: FieldValueMap;
}

/**
 * Mock metrics for tracking operations.
 */
export interface MockMetrics {
  reads: number;
  writes: number;
  queries: number;
  transactions: number;
  transactionAttempts: number;
  listeners: number;
}

/**
 * Configuration for error injection.
 */
interface ErrorConfiguration {
  pathPattern: string;
  error: FirestoreError;
  count?: number; // Number of times to inject error (undefined = always)
}

/**
 * Mock Firestore client builder.
 */
export class MockFirestoreClientBuilder {
  private documents: Map<string, FieldValueMap> = new Map();
  private errors: ErrorConfiguration[] = [];
  private latencyMin = 0;
  private latencyMax = 0;
  private transactionBehaviors: TransactionBehavior[] = [];

  /**
   * Add a document to the initial store.
   *
   * @param path - Document path
   * @param data - Document data
   * @returns This builder for chaining
   */
  withDocument(path: string, data: FieldValueMap): this {
    this.documents.set(path, data);
    return this;
  }

  /**
   * Add multiple documents to a collection.
   *
   * @param path - Collection path
   * @param docs - Array of mock documents
   * @returns This builder for chaining
   */
  withCollection(path: string, docs: MockDocument[]): this {
    for (const doc of docs) {
      this.documents.set(doc.path, doc.data);
    }
    return this;
  }

  /**
   * Configure error injection for a path pattern.
   *
   * @param pathPattern - Path pattern (supports wildcards)
   * @param error - Error to inject
   * @param count - Optional: number of times to inject (default: always)
   * @returns This builder for chaining
   */
  withError(pathPattern: string, error: FirestoreError, count?: number): this {
    this.errors.push({ pathPattern, error, count });
    return this;
  }

  /**
   * Configure simulated latency.
   *
   * @param minMs - Minimum latency in milliseconds
   * @param maxMs - Maximum latency in milliseconds
   * @returns This builder for chaining
   */
  withLatency(minMs: number, maxMs: number): this {
    this.latencyMin = minMs;
    this.latencyMax = maxMs;
    return this;
  }

  /**
   * Configure transaction behaviors.
   *
   * @param behaviors - Array of transaction behaviors
   * @returns This builder for chaining
   */
  withTransactionBehavior(behaviors: TransactionBehavior[]): this {
    this.transactionBehaviors = [...behaviors];
    return this;
  }

  /**
   * Build the mock client.
   *
   * @returns Configured MockFirestoreClient
   */
  build(): MockFirestoreClient {
    const client = new MockFirestoreClient();

    // Pre-populate documents
    for (const [path, data] of this.documents.entries()) {
      client.store.set(path, data);
    }

    // Configure errors
    client.errorConfigurations = [...this.errors];

    // Configure latency
    client.latencyMin = this.latencyMin;
    client.latencyMax = this.latencyMax;

    // Configure transaction behaviors
    client.transactionBehaviors = [...this.transactionBehaviors];

    return client;
  }
}

/**
 * Mock Firestore client implementation.
 *
 * Provides full Firestore operations with in-memory storage,
 * configurable behavior, and operation recording.
 */
export class MockFirestoreClient {
  readonly store: MockDocumentStore;
  readonly queryEngine: MockQueryEngine;
  readonly listenerManager: MockListenerManager;
  readonly recorder: OperationRecorder;

  private metrics: MockMetrics = {
    reads: 0,
    writes: 0,
    queries: 0,
    transactions: 0,
    transactionAttempts: 0,
    listeners: 0,
  };

  errorConfigurations: ErrorConfiguration[] = [];
  latencyMin = 0;
  latencyMax = 0;
  transactionBehaviors: TransactionBehavior[] = [];
  private transactionIndex = 0;

  constructor() {
    this.store = createMockDocumentStore();
    this.queryEngine = createMockQueryEngine();
    this.listenerManager = createMockListenerManager();
    this.recorder = createOperationRecorder();
  }

  // ============================================================================
  // Document Operations
  // ============================================================================

  /**
   * Get a document by path.
   *
   * @param path - Document path
   * @returns Document snapshot or null if not found
   */
  async getDocument(path: string): Promise<DocumentSnapshot | null> {
    await this.simulateLatency();
    await this.checkErrorInjection(path, "get");

    this.metrics.reads++;
    const doc = this.store.get(path);

    this.recorder.recordGet(path, doc);

    if (!doc) {
      return null;
    }

    return this.createDocumentSnapshot(path, doc);
  }

  /**
   * Create a new document (fails if exists).
   *
   * @param path - Document path
   * @param data - Document data
   * @throws AlreadyExistsError if document exists
   */
  async createDocument(path: string, data: FieldValueMap): Promise<WriteResult> {
    await this.simulateLatency();
    await this.checkErrorInjection(path, "create");

    if (this.store.exists(path)) {
      const error = new AlreadyExistsError(`Document already exists: ${path}`);
      this.recorder.recordWrite("create", path, data, error);
      throw error;
    }

    this.store.set(path, data);
    this.metrics.writes++;
    this.recorder.recordWrite("create", path, data);

    const updateTime = this.getCurrentTimestamp();
    return { update_time: updateTime };
  }

  /**
   * Set a document (create or replace).
   *
   * @param path - Document path
   * @param data - Document data
   */
  async setDocument(path: string, data: FieldValueMap): Promise<WriteResult> {
    await this.simulateLatency();
    await this.checkErrorInjection(path, "set");

    this.store.set(path, data);
    this.metrics.writes++;
    this.recorder.recordWrite("set", path, data);

    const updateTime = this.getCurrentTimestamp();
    return { update_time: updateTime };
  }

  /**
   * Update an existing document.
   *
   * @param path - Document path
   * @param updates - Fields to update
   * @throws NotFoundError if document doesn't exist
   */
  async updateDocument(path: string, updates: FieldValueMap): Promise<WriteResult> {
    await this.simulateLatency();
    await this.checkErrorInjection(path, "update");

    if (!this.store.exists(path)) {
      const error = new NotFoundError(`Document not found: ${path}`);
      this.recorder.recordWrite("update", path, updates, error);
      throw error;
    }

    this.store.update(path, updates);
    this.metrics.writes++;
    this.recorder.recordWrite("update", path, updates);

    const updateTime = this.getCurrentTimestamp();
    return { update_time: updateTime };
  }

  /**
   * Delete a document.
   *
   * @param path - Document path
   * @returns Delete result with commit time
   */
  async deleteDocument(path: string): Promise<DeleteResult> {
    await this.simulateLatency();
    await this.checkErrorInjection(path, "delete");

    const existed = this.store.delete(path);
    this.metrics.writes++;
    this.recorder.recordDelete(path, existed);

    const commitTime = this.getCurrentTimestamp();
    return {
      commit_time: commitTime,
      existed,
    };
  }

  /**
   * Check if a document exists.
   *
   * @param path - Document path
   * @returns True if document exists
   */
  async exists(path: string): Promise<boolean> {
    await this.simulateLatency();
    this.metrics.reads++;
    return this.store.exists(path);
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Execute a query.
   *
   * @param query - Query to execute
   * @returns Query results
   */
  async query(query: Query): Promise<DocumentSnapshot[]> {
    await this.simulateLatency();

    this.metrics.queries++;
    const collectionPath = query.from[0]?.collectionId || "";
    const storeResults = this.store.query(query);
    const documents = storeResults.map((r) => r.doc);
    const results = this.queryEngine.evaluate(query, documents);

    this.recorder.recordQuery(collectionPath, query, results.length);

    return results.map((doc, index) =>
      this.createDocumentSnapshot(storeResults[index].path, doc)
    );
  }

  // ============================================================================
  // Listener Operations
  // ============================================================================

  /**
   * Listen to document changes.
   *
   * @param target - What to listen to
   * @param callback - Callback for snapshots/errors
   * @returns Listener registration
   */
  listen(
    target: ListenTarget,
    callback: (snapshot: DocumentSnapshot | QuerySnapshot, error?: FirestoreError) => void
  ): ListenerRegistration {
    this.metrics.listeners++;
    const registration = this.listenerManager.register(target, callback);

    // Record listener registration
    const path =
      target.type === "document" || target.type === "collection" ? target.path : "query";
    this.recorder.recordListen(path, registration.id);

    return registration;
  }

  // ============================================================================
  // Inspection Methods
  // ============================================================================

  /**
   * Get a document from the store (for inspection).
   *
   * @param path - Document path
   * @returns Stored document or undefined
   */
  getDocument_Sync(path: string): StoredDocument | undefined {
    return this.store.get(path);
  }

  /**
   * Get the operation history.
   *
   * @returns Array of recorded operations
   */
  getOperationHistory(): RecordedOperation[] {
    return this.recorder.getHistory();
  }

  /**
   * Get metrics.
   *
   * @returns Current metrics
   */
  getMetrics(): MockMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset the mock client state.
   */
  reset(): void {
    this.store.clear();
    this.listenerManager.clear();
    this.recorder.clear();
    this.metrics = {
      reads: 0,
      writes: 0,
      queries: 0,
      transactions: 0,
      transactionAttempts: 0,
      listeners: 0,
    };
    this.transactionIndex = 0;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create a document snapshot from stored document.
   */
  private createDocumentSnapshot(path: string, doc: StoredDocument): DocumentSnapshot {
    return {
      reference: this.createDocumentRef(path),
      exists: true,
      data: doc.fields,
      create_time: doc.createTime,
      update_time: doc.updateTime,
      read_time: this.getCurrentTimestamp(),
    };
  }

  /**
   * Create a document reference from path.
   */
  private createDocumentRef(path: string): DocumentRef {
    const segments = path.split("/");
    const documentId = segments[segments.length - 1];
    const collectionPath = segments.slice(0, -1).join("/");

    return {
      path: {
        project_id: "mock-project",
        database_id: "(default)",
        collection_path: collectionPath,
        document_id: documentId,
      },
      id: documentId,
      parent: collectionPath,
    };
  }

  /**
   * Get current timestamp.
   */
  private getCurrentTimestamp(): Timestamp {
    const now = new Date();
    return {
      seconds: Math.floor(now.getTime() / 1000),
      nanos: (now.getTime() % 1000) * 1_000_000,
    };
  }

  /**
   * Simulate network latency.
   */
  private async simulateLatency(): Promise<void> {
    if (this.latencyMax === 0) {
      return;
    }

    const latency =
      this.latencyMin + Math.random() * (this.latencyMax - this.latencyMin);
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  /**
   * Check if an error should be injected.
   */
  private async checkErrorInjection(
    path: string,
    operation: string
  ): Promise<void> {
    for (const config of this.errorConfigurations) {
      if (this.pathMatches(path, config.pathPattern)) {
        if (config.count === undefined || config.count > 0) {
          if (config.count !== undefined) {
            config.count--;
          }
          throw config.error;
        }
      }
    }
  }

  /**
   * Check if a path matches a pattern.
   */
  private pathMatches(path: string, pattern: string): boolean {
    // Simple wildcard matching
    const regexPattern = pattern.replace(/\*/g, ".*");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }
}

/**
 * Create a mock Firestore client builder.
 *
 * @returns New builder instance
 */
export function createMockClient(): MockFirestoreClientBuilder {
  return new MockFirestoreClientBuilder();
}
