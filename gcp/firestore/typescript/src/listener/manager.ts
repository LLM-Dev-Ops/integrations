/**
 * Firestore Listener Manager
 *
 * Manages active document and query listeners with lifecycle tracking,
 * reconnection handling, and resume token management.
 */

import type {
  ListenerRegistration,
  ListenTarget,
  ListenerState,
  DocumentSnapshot,
  QuerySnapshot,
  DocumentChange,
} from "../types/index.js";
import type { FirestoreConfig } from "../config/index.js";
import type { FirestoreError } from "../error/index.js";

/**
 * Callback for document listeners.
 */
export type DocumentListenerCallback = (
  snapshot: DocumentSnapshot,
  error?: FirestoreError
) => void;

/**
 * Callback for query listeners.
 */
export type QueryListenerCallback = (
  snapshot: QuerySnapshot,
  error?: FirestoreError
) => void;

/**
 * Internal listener entry tracking.
 */
interface ListenerEntry {
  id: string;
  target: ListenTarget;
  state: ListenerState;
  callback: DocumentListenerCallback | QueryListenerCallback;
  resumeToken?: Uint8Array;
  reconnectAttempts: number;
  createdAt: Date;
  lastEventAt?: Date;
  abortController?: AbortController;
}

/**
 * Listener Manager for tracking and managing real-time listeners.
 */
export class ListenerManager {
  private readonly _config: FirestoreConfig;
  private readonly _listeners: Map<string, ListenerEntry> = new Map();
  private _listenerIdCounter = 0;

  constructor(config: FirestoreConfig) {
    this._config = config;
  }

  /**
   * Get the number of active listeners.
   */
  get activeCount(): number {
    return this._listeners.size;
  }

  /**
   * Get the maximum number of allowed listeners.
   */
  get maxListeners(): number {
    return this._config.maxListeners;
  }

  /**
   * Check if a new listener can be registered.
   */
  canRegister(): boolean {
    return this._listeners.size < this._config.maxListeners;
  }

  /**
   * Register a new listener.
   */
  register(
    target: ListenTarget,
    callback: DocumentListenerCallback | QueryListenerCallback
  ): ListenerRegistration {
    if (!this.canRegister()) {
      throw new Error(
        `Maximum listener limit (${this._config.maxListeners}) reached`
      );
    }

    const id = this.generateListenerId();
    const entry: ListenerEntry = {
      id,
      target,
      state: "initial",
      callback,
      reconnectAttempts: 0,
      createdAt: new Date(),
    };

    this._listeners.set(id, entry);

    return {
      id,
      target,
      createdAt: entry.createdAt,
      unsubscribe: () => this.unregister(id),
    };
  }

  /**
   * Unregister a listener.
   */
  unregister(id: string): boolean {
    const entry = this._listeners.get(id);
    if (!entry) {
      return false;
    }

    // Abort any active connection
    entry.abortController?.abort();
    entry.state = "stopped";

    this._listeners.delete(id);
    return true;
  }

  /**
   * Get a listener entry by ID.
   */
  get(id: string): ListenerEntry | undefined {
    return this._listeners.get(id);
  }

  /**
   * Update listener state.
   */
  updateState(id: string, state: ListenerState): void {
    const entry = this._listeners.get(id);
    if (entry) {
      entry.state = state;
    }
  }

  /**
   * Update resume token for a listener.
   */
  updateResumeToken(id: string, token: Uint8Array): void {
    const entry = this._listeners.get(id);
    if (entry) {
      entry.resumeToken = token;
      entry.lastEventAt = new Date();
    }
  }

  /**
   * Increment reconnect attempts.
   */
  incrementReconnectAttempts(id: string): number {
    const entry = this._listeners.get(id);
    if (entry) {
      entry.reconnectAttempts += 1;
      return entry.reconnectAttempts;
    }
    return 0;
  }

  /**
   * Reset reconnect attempts on successful connection.
   */
  resetReconnectAttempts(id: string): void {
    const entry = this._listeners.get(id);
    if (entry) {
      entry.reconnectAttempts = 0;
    }
  }

  /**
   * Set abort controller for a listener.
   */
  setAbortController(id: string, controller: AbortController): void {
    const entry = this._listeners.get(id);
    if (entry) {
      entry.abortController = controller;
    }
  }

  /**
   * Get all active listener IDs.
   */
  getActiveIds(): string[] {
    return Array.from(this._listeners.keys());
  }

  /**
   * Get listeners by state.
   */
  getByState(state: ListenerState): ListenerEntry[] {
    return Array.from(this._listeners.values()).filter((e) => e.state === state);
  }

  /**
   * Unregister all listeners.
   */
  unregisterAll(): void {
    for (const id of this._listeners.keys()) {
      this.unregister(id);
    }
  }

  /**
   * Generate a unique listener ID.
   */
  private generateListenerId(): string {
    this._listenerIdCounter += 1;
    return `listener_${this._listenerIdCounter}_${Date.now()}`;
  }
}

/**
 * Create a new listener manager.
 */
export function createListenerManager(config: FirestoreConfig): ListenerManager {
  return new ListenerManager(config);
}
