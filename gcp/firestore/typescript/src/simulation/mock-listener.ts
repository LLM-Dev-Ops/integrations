/**
 * Listener simulation for mock Firestore client.
 *
 * Simulates real-time listeners with configurable behavior including
 * connection lifecycle, error injection, and synthetic events.
 *
 * Following the SPARC specification for Firestore integration.
 */

import type {
  ListenTarget,
  ListenerRegistration,
  DocumentSnapshot,
  DocumentChange,
  QuerySnapshot,
} from "../types/index.js";
import type { FirestoreError } from "../error/index.js";
import { UnavailableError } from "../error/index.js";

/**
 * Listener callback type - receives snapshots or errors.
 */
export type ListenerCallback = (
  snapshot: DocumentSnapshot | QuerySnapshot,
  error?: FirestoreError
) => void;

/**
 * Listener state for simulation.
 */
type ListenerStatus = "active" | "disconnected" | "error" | "stopped";

/**
 * Internal listener entry.
 */
interface ListenerEntry {
  id: string;
  target: ListenTarget;
  callback: ListenerCallback;
  status: ListenerStatus;
  createdAt: Date;
  errorToEmit?: FirestoreError;
}

/**
 * Mock listener manager for simulating real-time listeners.
 *
 * Manages listener registrations and provides methods to simulate
 * various listener behaviors and events.
 */
export class MockListenerManager {
  private listeners: Map<string, ListenerEntry> = new Map();
  private listenerIdCounter = 0;

  /**
   * Register a new listener.
   *
   * @param target - What to listen to (document, collection, or query)
   * @param callback - Callback function for snapshots/errors
   * @returns Listener registration with unsubscribe function
   */
  register(target: ListenTarget, callback: ListenerCallback): ListenerRegistration {
    const id = this.generateListenerId();
    const entry: ListenerEntry = {
      id,
      target,
      callback,
      status: "active",
      createdAt: new Date(),
    };

    this.listeners.set(id, entry);

    return {
      id,
      target,
      createdAt: entry.createdAt,
      unsubscribe: () => this.unregister(id),
    };
  }

  /**
   * Unregister a listener.
   *
   * @param id - Listener ID
   * @returns True if the listener was found and removed
   */
  unregister(id: string): boolean {
    const entry = this.listeners.get(id);
    if (!entry) {
      return false;
    }

    entry.status = "stopped";
    this.listeners.delete(id);
    return true;
  }

  /**
   * Get a listener by ID.
   *
   * @param id - Listener ID
   * @returns Listener entry or undefined
   */
  get(id: string): ListenerEntry | undefined {
    return this.listeners.get(id);
  }

  /**
   * Get all active listeners.
   *
   * @returns Array of listener entries
   */
  getActive(): ListenerEntry[] {
    return Array.from(this.listeners.values()).filter((l) => l.status === "active");
  }

  /**
   * Emit a document change to matching listeners.
   *
   * @param path - Document path
   * @param change - Document change event
   */
  emitDocumentChange(path: string, change: DocumentChange): void {
    for (const entry of this.listeners.values()) {
      if (entry.status !== "active") {
        continue;
      }

      // Check if this listener should receive this change
      if (this.matchesTarget(path, entry.target)) {
        // For document listeners, emit document snapshot
        if (entry.target.type === "document") {
          entry.callback(change.document);
        }
        // For collection/query listeners, emit query snapshot
        else {
          const querySnapshot: QuerySnapshot = {
            documents: [change.document],
            changes: [change],
            readTime: new Date(),
            size: 1,
            empty: false,
          };
          entry.callback(querySnapshot);
        }
      }
    }
  }

  /**
   * Emit a query snapshot to matching listeners.
   *
   * @param target - Listen target
   * @param snapshot - Query snapshot
   */
  emitQuerySnapshot(target: ListenTarget, snapshot: QuerySnapshot): void {
    for (const entry of this.listeners.values()) {
      if (entry.status !== "active") {
        continue;
      }

      if (this.targetsMatch(entry.target, target)) {
        entry.callback(snapshot);
      }
    }
  }

  /**
   * Emit an error to a specific listener.
   *
   * @param listenerId - Listener ID
   * @param error - Error to emit
   */
  emitError(listenerId: string, error: FirestoreError): void {
    const entry = this.listeners.get(listenerId);
    if (entry) {
      entry.status = "error";
      entry.callback(entry.target.type === "document" ? {} as DocumentSnapshot : {} as QuerySnapshot, error);
    }
  }

  /**
   * Simulate a disconnect for a listener.
   *
   * @param listenerId - Listener ID
   */
  simulateDisconnect(listenerId: string): void {
    const entry = this.listeners.get(listenerId);
    if (entry) {
      entry.status = "disconnected";
      // Emit unavailable error
      const error = new UnavailableError("Simulated disconnect");
      entry.callback(entry.target.type === "document" ? {} as DocumentSnapshot : {} as QuerySnapshot, error);
    }
  }

  /**
   * Simulate a reconnect for a listener.
   *
   * @param listenerId - Listener ID
   */
  simulateReconnect(listenerId: string): void {
    const entry = this.listeners.get(listenerId);
    if (entry && entry.status === "disconnected") {
      entry.status = "active";
    }
  }

  /**
   * Schedule an error to be emitted on the next event.
   *
   * @param listenerId - Listener ID
   * @param error - Error to emit
   */
  scheduleError(listenerId: string, error: FirestoreError): void {
    const entry = this.listeners.get(listenerId);
    if (entry) {
      entry.errorToEmit = error;
    }
  }

  /**
   * Clear all listeners.
   */
  clear(): void {
    for (const id of this.listeners.keys()) {
      this.unregister(id);
    }
  }

  /**
   * Get the number of active listeners.
   */
  get activeCount(): number {
    return this.getActive().length;
  }

  /**
   * Get the total number of listeners (including inactive).
   */
  get totalCount(): number {
    return this.listeners.size;
  }

  /**
   * Check if a document path matches a listen target.
   *
   * @param path - Document path
   * @param target - Listen target
   * @returns True if the path matches the target
   */
  private matchesTarget(path: string, target: ListenTarget): boolean {
    switch (target.type) {
      case "document":
        return path === target.path;
      case "collection":
        // Check if document is in this collection
        return this.isInCollection(path, target.path);
      case "query":
        // For query targets, we'd need to evaluate the query
        // This is simplified - in a real implementation, we'd use MockQueryEngine
        return true;
      default:
        return false;
    }
  }

  /**
   * Check if two listen targets match.
   *
   * @param target1 - First target
   * @param target2 - Second target
   * @returns True if targets match
   */
  private targetsMatch(target1: ListenTarget, target2: ListenTarget): boolean {
    if (target1.type !== target2.type) {
      return false;
    }

    switch (target1.type) {
      case "document":
        return target1.path === (target2 as typeof target1).path;
      case "collection":
        return target1.path === (target2 as typeof target1).path;
      case "query":
        // Simplified query comparison
        return JSON.stringify(target1.query) === JSON.stringify((target2 as typeof target1).query);
      default:
        return false;
    }
  }

  /**
   * Check if a document path is in a collection.
   *
   * @param docPath - Document path
   * @param collectionPath - Collection path
   * @returns True if document is in collection
   */
  private isInCollection(docPath: string, collectionPath: string): boolean {
    const docSegments = docPath.split("/");
    const collectionSegments = collectionPath.split("/");

    // Document must be directly in collection
    if (docSegments.length !== collectionSegments.length + 1) {
      return false;
    }

    // Check collection path matches
    for (let i = 0; i < collectionSegments.length; i++) {
      if (docSegments[i] !== collectionSegments[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate a unique listener ID.
   *
   * @returns Unique listener ID
   */
  private generateListenerId(): string {
    this.listenerIdCounter += 1;
    return `mock_listener_${this.listenerIdCounter}_${Date.now()}`;
  }

  /**
   * Get listeners by target type.
   *
   * @param targetType - Type of target
   * @returns Array of matching listeners
   */
  getByTargetType(targetType: "document" | "collection" | "query"): ListenerEntry[] {
    return Array.from(this.listeners.values()).filter((l) => l.target.type === targetType);
  }

  /**
   * Get listeners for a specific path.
   *
   * @param path - Document or collection path
   * @returns Array of matching listeners
   */
  getByPath(path: string): ListenerEntry[] {
    return Array.from(this.listeners.values()).filter((l) => {
      if (l.target.type === "document" || l.target.type === "collection") {
        return l.target.path === path;
      }
      return false;
    });
  }
}

/**
 * Create a new mock listener manager.
 *
 * @returns New MockListenerManager instance
 */
export function createMockListenerManager(): MockListenerManager {
  return new MockListenerManager();
}
