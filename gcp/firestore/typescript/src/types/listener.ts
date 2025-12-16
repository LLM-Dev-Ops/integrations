/**
 * Listener types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents real-time listeners, document changes, and listener state.
 */

import { DocumentSnapshot } from "./document.js";
import { Query, QuerySnapshot } from "./query.js";

/**
 * Type of document change in a snapshot.
 */
export type ChangeType = "Added" | "Modified" | "Removed";

/**
 * Document change event.
 */
export interface DocumentChange {
  /** Type of change */
  type: ChangeType;
  /** Document snapshot after the change */
  document: DocumentSnapshot;
  /** Previous document snapshot (for Modified/Removed) */
  oldDocument?: DocumentSnapshot;
  /** Index of the document in the old snapshot */
  oldIndex?: number;
  /** Index of the document in the new snapshot */
  newIndex?: number;
}

/**
 * Listener state.
 */
export type ListenerState =
  | "Initial"
  | "Listening"
  | "Reconnecting"
  | "Stopped"
  | "Error";

/**
 * Listen target - specifies what to listen to.
 */
export interface ListenTarget {
  /** Target type */
  type: "document" | "query";
  /** Document path (for document listeners) */
  documentPath?: string;
  /** Query (for query listeners) */
  query?: Query;
  /** Target ID assigned by the server */
  targetId?: number;
}

/**
 * Listener registration - handle for an active listener.
 */
export interface ListenerRegistration {
  /** Unique listener ID */
  id: string;
  /** Listen target */
  target: ListenTarget;
  /** Current state */
  state: ListenerState;
  /** Callback for snapshots */
  onSnapshot: SnapshotCallback;
  /** Callback for errors */
  onError?: ErrorCallback;
  /** Time the listener was created */
  createdAt: Date;
  /** Last snapshot time */
  lastSnapshotTime?: Date;
}

/**
 * Snapshot callback for document listeners.
 */
export type DocumentSnapshotCallback = (snapshot: DocumentSnapshot) => void;

/**
 * Snapshot callback for query listeners.
 */
export type QuerySnapshotCallback = (snapshot: QuerySnapshot) => void;

/**
 * Generic snapshot callback.
 */
export type SnapshotCallback = DocumentSnapshotCallback | QuerySnapshotCallback;

/**
 * Error callback for listeners.
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Listener options.
 */
export interface ListenerOptions {
  /** Include metadata changes (default: false) */
  includeMetadataChanges?: boolean;
  /** Retry on errors (default: true) */
  retryOnError?: boolean;
  /** Maximum retry attempts (default: infinite) */
  maxRetries?: number;
  /** Backoff delay in milliseconds (default: 1000) */
  retryDelay?: number;
}

/**
 * Snapshot metadata.
 */
export interface SnapshotMetadata {
  /** Whether this snapshot has pending writes */
  hasPendingWrites: boolean;
  /** Whether this snapshot is from cache */
  fromCache: boolean;
}

/**
 * Document snapshot with metadata.
 */
export interface DocumentSnapshotWithMetadata extends DocumentSnapshot {
  /** Snapshot metadata */
  metadata: SnapshotMetadata;
}

/**
 * Query snapshot with changes.
 */
export interface QuerySnapshotWithChanges extends QuerySnapshot {
  /** Document changes since last snapshot */
  documentChanges: DocumentChange[];
  /** Snapshot metadata */
  metadata: SnapshotMetadata;
}

/**
 * Listener event - emitted by listeners.
 */
export interface ListenerEvent {
  /** Listener ID */
  listenerId: string;
  /** Event type */
  type: "snapshot" | "error" | "state_change";
  /** Timestamp */
  timestamp: Date;
  /** Snapshot data (for snapshot events) */
  snapshot?: DocumentSnapshot | QuerySnapshot;
  /** Error (for error events) */
  error?: Error;
  /** New state (for state change events) */
  state?: ListenerState;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a document listen target.
 */
export function createDocumentTarget(documentPath: string): ListenTarget {
  return {
    type: "document",
    documentPath,
  };
}

/**
 * Create a query listen target.
 */
export function createQueryTarget(query: Query): ListenTarget {
  return {
    type: "query",
    query,
  };
}

/**
 * Create listener options.
 */
export function createListenerOptions(
  includeMetadataChanges: boolean = false,
  retryOnError: boolean = true
): ListenerOptions {
  return {
    includeMetadataChanges,
    retryOnError,
  };
}

/**
 * Create a listener registration.
 */
export function createListenerRegistration(
  id: string,
  target: ListenTarget,
  onSnapshot: SnapshotCallback,
  onError?: ErrorCallback,
  options?: ListenerOptions
): ListenerRegistration {
  return {
    id,
    target,
    state: "Initial",
    onSnapshot,
    onError,
    createdAt: new Date(),
  };
}

/**
 * Create a document change event.
 */
export function createDocumentChange(
  type: ChangeType,
  document: DocumentSnapshot,
  oldDocument?: DocumentSnapshot,
  oldIndex?: number,
  newIndex?: number
): DocumentChange {
  return {
    type,
    document,
    oldDocument,
    oldIndex,
    newIndex,
  };
}

/**
 * Create snapshot metadata.
 */
export function createSnapshotMetadata(
  hasPendingWrites: boolean,
  fromCache: boolean
): SnapshotMetadata {
  return {
    hasPendingWrites,
    fromCache,
  };
}

/**
 * Create a listener event.
 */
export function createListenerEvent(
  listenerId: string,
  type: "snapshot" | "error" | "state_change",
  data?: {
    snapshot?: DocumentSnapshot | QuerySnapshot;
    error?: Error;
    state?: ListenerState;
  }
): ListenerEvent {
  return {
    listenerId,
    type,
    timestamp: new Date(),
    ...data,
  };
}

/**
 * Update listener state.
 */
export function updateListenerState(
  registration: ListenerRegistration,
  state: ListenerState
): ListenerRegistration {
  return {
    ...registration,
    state,
  };
}

/**
 * Update last snapshot time.
 */
export function updateLastSnapshotTime(
  registration: ListenerRegistration,
  time: Date = new Date()
): ListenerRegistration {
  return {
    ...registration,
    lastSnapshotTime: time,
  };
}

/**
 * Check if a listener is active.
 */
export function isListenerActive(registration: ListenerRegistration): boolean {
  return (
    registration.state === "Initial" ||
    registration.state === "Listening" ||
    registration.state === "Reconnecting"
  );
}

/**
 * Check if a listener is stopped.
 */
export function isListenerStopped(registration: ListenerRegistration): boolean {
  return (
    registration.state === "Stopped" || registration.state === "Error"
  );
}

/**
 * Check if a listener should retry.
 */
export function shouldRetryListener(
  registration: ListenerRegistration,
  options?: ListenerOptions
): boolean {
  if (!options?.retryOnError) {
    return false;
  }

  if (registration.state !== "Error") {
    return false;
  }

  return true;
}

/**
 * Filter document changes by type.
 */
export function filterChangesByType(
  changes: DocumentChange[],
  type: ChangeType
): DocumentChange[] {
  return changes.filter((change) => change.type === type);
}

/**
 * Get added documents from changes.
 */
export function getAddedDocuments(changes: DocumentChange[]): DocumentChange[] {
  return filterChangesByType(changes, "Added");
}

/**
 * Get modified documents from changes.
 */
export function getModifiedDocuments(changes: DocumentChange[]): DocumentChange[] {
  return filterChangesByType(changes, "Modified");
}

/**
 * Get removed documents from changes.
 */
export function getRemovedDocuments(changes: DocumentChange[]): DocumentChange[] {
  return filterChangesByType(changes, "Removed");
}

/**
 * Check if snapshot has pending writes.
 */
export function hasPendingWrites(metadata: SnapshotMetadata): boolean {
  return metadata.hasPendingWrites;
}

/**
 * Check if snapshot is from cache.
 */
export function isFromCache(metadata: SnapshotMetadata): boolean {
  return metadata.fromCache;
}

/**
 * Check if snapshot is from server.
 */
export function isFromServer(metadata: SnapshotMetadata): boolean {
  return !metadata.fromCache;
}
