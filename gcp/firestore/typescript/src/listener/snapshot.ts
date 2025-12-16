/**
 * Firestore Snapshot Accumulation
 *
 * Handles accumulation of document changes into query snapshots
 * for real-time query listeners.
 */

import type {
  DocumentSnapshot,
  DocumentChange,
  QuerySnapshot,
  ChangeType,
} from "../types/index.js";

/**
 * Snapshot accumulator for query listeners.
 *
 * Tracks document state and accumulates changes to build
 * complete query snapshots.
 */
export class SnapshotAccumulator {
  private readonly _documents: Map<string, DocumentSnapshot> = new Map();
  private readonly _pendingChanges: DocumentChange[] = [];
  private _hasCurrent = false;

  /**
   * Get all current documents.
   */
  get documents(): DocumentSnapshot[] {
    return Array.from(this._documents.values());
  }

  /**
   * Get the current document count.
   */
  get size(): number {
    return this._documents.size;
  }

  /**
   * Check if initial load is complete.
   */
  get hasCurrent(): boolean {
    return this._hasCurrent;
  }

  /**
   * Apply a document change.
   */
  applyChange(change: DocumentChange): void {
    const docPath = this.getDocumentPath(change.document);

    switch (change.type) {
      case "added":
        this._documents.set(docPath, change.document);
        break;
      case "modified":
        this._documents.set(docPath, change.document);
        break;
      case "removed":
        this._documents.delete(docPath);
        break;
    }

    this._pendingChanges.push(change);
  }

  /**
   * Mark initial load as complete.
   */
  markCurrent(): void {
    this._hasCurrent = true;
  }

  /**
   * Reset accumulator state (for RESET events).
   */
  reset(): void {
    this._documents.clear();
    this._pendingChanges.length = 0;
    this._hasCurrent = false;
  }

  /**
   * Build and consume a query snapshot.
   */
  buildSnapshot(): QuerySnapshot {
    const snapshot: QuerySnapshot = {
      documents: Array.from(this._documents.values()),
      changes: [...this._pendingChanges],
      size: this._documents.size,
      empty: this._documents.size === 0,
      readTime: new Date(),
    };

    // Clear pending changes
    this._pendingChanges.length = 0;

    return snapshot;
  }

  /**
   * Check if there are pending changes.
   */
  hasPendingChanges(): boolean {
    return this._pendingChanges.length > 0;
  }

  /**
   * Get document by path.
   */
  getDocument(path: string): DocumentSnapshot | undefined {
    return this._documents.get(path);
  }

  /**
   * Extract document path from snapshot.
   */
  private getDocumentPath(doc: DocumentSnapshot): string {
    if (typeof doc.ref === "string") {
      return doc.ref;
    }
    return doc.ref.path;
  }
}

/**
 * Create document change with computed indices.
 */
export function createDocumentChange(
  type: ChangeType,
  document: DocumentSnapshot,
  oldIndex?: number,
  newIndex?: number
): DocumentChange {
  return {
    type,
    document,
    oldIndex,
    newIndex,
  };
}

/**
 * Compute document changes between two snapshots.
 */
export function computeChanges(
  oldDocs: DocumentSnapshot[],
  newDocs: DocumentSnapshot[]
): DocumentChange[] {
  const changes: DocumentChange[] = [];
  const oldMap = new Map(oldDocs.map((d, i) => [getPath(d), { doc: d, index: i }]));
  const newMap = new Map(newDocs.map((d, i) => [getPath(d), { doc: d, index: i }]));

  // Find removed documents
  for (const [path, { doc, index }] of oldMap) {
    if (!newMap.has(path)) {
      changes.push(createDocumentChange("removed", doc, index, undefined));
    }
  }

  // Find added and modified documents
  for (const [path, { doc, index }] of newMap) {
    const old = oldMap.get(path);
    if (!old) {
      changes.push(createDocumentChange("added", doc, undefined, index));
    } else if (hasChanged(old.doc, doc)) {
      changes.push(createDocumentChange("modified", doc, old.index, index));
    }
  }

  return changes;
}

/**
 * Get document path.
 */
function getPath(doc: DocumentSnapshot): string {
  if (typeof doc.ref === "string") {
    return doc.ref;
  }
  return doc.ref.path;
}

/**
 * Check if document has changed (simple comparison).
 */
function hasChanged(oldDoc: DocumentSnapshot, newDoc: DocumentSnapshot): boolean {
  // Compare update times if available
  if (oldDoc.updateTime && newDoc.updateTime) {
    return oldDoc.updateTime.getTime() !== newDoc.updateTime.getTime();
  }

  // Fall back to data comparison
  return JSON.stringify(oldDoc.data) !== JSON.stringify(newDoc.data);
}

/**
 * Debounce snapshot emissions to batch rapid changes.
 */
export function createSnapshotDebouncer(
  delayMs: number,
  onSnapshot: (snapshot: QuerySnapshot) => void
): SnapshotDebouncer {
  return new SnapshotDebouncer(delayMs, onSnapshot);
}

/**
 * Debouncer for batching snapshot emissions.
 */
export class SnapshotDebouncer {
  private readonly _delayMs: number;
  private readonly _onSnapshot: (snapshot: QuerySnapshot) => void;
  private readonly _accumulator: SnapshotAccumulator = new SnapshotAccumulator();
  private _timeoutId?: ReturnType<typeof setTimeout>;

  constructor(delayMs: number, onSnapshot: (snapshot: QuerySnapshot) => void) {
    this._delayMs = delayMs;
    this._onSnapshot = onSnapshot;
  }

  /**
   * Add a change and schedule emission.
   */
  addChange(change: DocumentChange): void {
    this._accumulator.applyChange(change);
    this.scheduleEmission();
  }

  /**
   * Mark current and emit.
   */
  markCurrent(): void {
    this._accumulator.markCurrent();
    this.flush();
  }

  /**
   * Reset state.
   */
  reset(): void {
    this.cancel();
    this._accumulator.reset();
  }

  /**
   * Flush pending changes immediately.
   */
  flush(): void {
    this.cancel();
    if (this._accumulator.hasPendingChanges() || this._accumulator.hasCurrent) {
      this._onSnapshot(this._accumulator.buildSnapshot());
    }
  }

  /**
   * Cancel pending emission.
   */
  cancel(): void {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }
  }

  private scheduleEmission(): void {
    if (this._timeoutId) {
      return; // Already scheduled
    }

    this._timeoutId = setTimeout(() => {
      this._timeoutId = undefined;
      if (this._accumulator.hasPendingChanges()) {
        this._onSnapshot(this._accumulator.buildSnapshot());
      }
    }, this._delayMs);
  }
}
