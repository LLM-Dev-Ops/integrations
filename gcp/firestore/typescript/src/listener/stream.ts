/**
 * Firestore Listener Stream Handling
 *
 * Handles the gRPC/HTTP streaming for real-time listeners.
 */

import type {
  ListenTarget,
  DocumentSnapshot,
  DocumentChange,
  ChangeType,
} from "../types/index.js";
import type { FirestoreConfig } from "../config/index.js";
import type { FirestoreError } from "../error/index.js";

/**
 * Listen event types from Firestore.
 */
export type ListenEventType =
  | "targetChange"
  | "documentChange"
  | "documentDelete"
  | "documentRemove"
  | "filter";

/**
 * Target change types.
 */
export type TargetChangeType =
  | "NO_CHANGE"
  | "ADD"
  | "REMOVE"
  | "CURRENT"
  | "RESET";

/**
 * Listen response from Firestore.
 */
export interface ListenResponse {
  targetChange?: {
    targetChangeType: TargetChangeType;
    targetIds: number[];
    resumeToken?: Uint8Array;
    cause?: { code: number; message: string };
  };
  documentChange?: {
    document: FirestoreDocumentProto;
    targetIds: number[];
    removedTargetIds: number[];
  };
  documentDelete?: {
    document: string;
    targetIds: number[];
    readTime: string;
  };
  documentRemove?: {
    document: string;
    targetIds: number[];
    readTime: string;
  };
  filter?: {
    targetId: number;
    count: number;
  };
}

/**
 * Firestore document proto from listen response.
 */
interface FirestoreDocumentProto {
  name: string;
  fields: Record<string, unknown>;
  createTime?: string;
  updateTime?: string;
}

/**
 * Stream event emitter for listeners.
 */
export interface ListenerStreamEvents {
  onDocumentChange: (change: DocumentChange) => void;
  onError: (error: FirestoreError) => void;
  onResumeToken: (token: Uint8Array) => void;
  onCurrent: () => void;
  onReset: () => void;
}

/**
 * Options for opening a listener stream.
 */
export interface ListenerStreamOptions {
  target: ListenTarget;
  targetId: number;
  resumeToken?: Uint8Array;
  events: ListenerStreamEvents;
  signal?: AbortSignal;
}

/**
 * Parse a listen response and dispatch events.
 */
export function processListenResponse(
  response: ListenResponse,
  targetId: number,
  events: ListenerStreamEvents
): void {
  // Handle target change
  if (response.targetChange) {
    const tc = response.targetChange;

    // Check if this response is for our target
    if (tc.targetIds.length > 0 && !tc.targetIds.includes(targetId)) {
      return;
    }

    // Store resume token if provided
    if (tc.resumeToken && tc.resumeToken.length > 0) {
      events.onResumeToken(tc.resumeToken);
    }

    // Handle different target change types
    switch (tc.targetChangeType) {
      case "CURRENT":
        events.onCurrent();
        break;
      case "RESET":
        events.onReset();
        break;
      case "REMOVE":
        if (tc.cause) {
          const error = new Error(tc.cause.message) as FirestoreError;
          events.onError(error);
        }
        break;
    }
    return;
  }

  // Handle document change
  if (response.documentChange) {
    const dc = response.documentChange;

    // Determine change type
    let changeType: ChangeType = "added";
    if (dc.removedTargetIds.includes(targetId)) {
      changeType = "removed";
    } else if (dc.targetIds.includes(targetId)) {
      // Could be added or modified - we'd need to track state to know
      // For simplicity, treat all as modifications after initial load
      changeType = "modified";
    }

    const change: DocumentChange = {
      type: changeType,
      document: parseDocumentSnapshot(dc.document),
      oldIndex: undefined,
      newIndex: undefined,
    };

    events.onDocumentChange(change);
    return;
  }

  // Handle document delete
  if (response.documentDelete) {
    const dd = response.documentDelete;
    if (dd.targetIds.includes(targetId)) {
      const change: DocumentChange = {
        type: "removed",
        document: {
          ref: { path: dd.document },
          exists: false,
          data: undefined,
          createTime: undefined,
          updateTime: undefined,
          readTime: parseTimestamp(dd.readTime),
        },
        oldIndex: undefined,
        newIndex: undefined,
      };
      events.onDocumentChange(change);
    }
    return;
  }

  // Handle document remove (removed from query result but not deleted)
  if (response.documentRemove) {
    const dr = response.documentRemove;
    if (dr.targetIds.includes(targetId)) {
      const change: DocumentChange = {
        type: "removed",
        document: {
          ref: { path: dr.document },
          exists: true, // Document exists but removed from query
          data: undefined,
          createTime: undefined,
          updateTime: undefined,
          readTime: parseTimestamp(dr.readTime),
        },
        oldIndex: undefined,
        newIndex: undefined,
      };
      events.onDocumentChange(change);
    }
  }
}

/**
 * Parse Firestore document proto to DocumentSnapshot.
 */
function parseDocumentSnapshot(doc: FirestoreDocumentProto): DocumentSnapshot {
  return {
    ref: { path: doc.name },
    exists: true,
    data: doc.fields as Record<string, unknown>,
    createTime: doc.createTime ? parseTimestamp(doc.createTime) : undefined,
    updateTime: doc.updateTime ? parseTimestamp(doc.updateTime) : undefined,
    readTime: new Date(),
  };
}

/**
 * Parse ISO timestamp string to Date.
 */
function parseTimestamp(ts: string): Date {
  return new Date(ts);
}

/**
 * Build listen request for a target.
 */
export function buildListenRequest(
  databasePath: string,
  target: ListenTarget,
  targetId: number,
  resumeToken?: Uint8Array
): unknown {
  const request: Record<string, unknown> = {
    database: databasePath,
    addTarget: {
      targetId,
    },
  };

  const addTarget = request.addTarget as Record<string, unknown>;

  if (target.type === "document") {
    addTarget.documents = {
      documents: [target.documentPath],
    };
  } else if (target.type === "query") {
    addTarget.query = {
      parent: target.parent,
      structuredQuery: target.query,
    };
  }

  if (resumeToken && resumeToken.length > 0) {
    addTarget.resumeToken = resumeToken;
  }

  return request;
}
