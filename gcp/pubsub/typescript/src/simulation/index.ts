/**
 * Pub/Sub Simulation Layer
 *
 * Record/replay capability for CI/CD testing without GCP dependencies.
 * Following the SPARC specification.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SimulationError, SimulationErrorCause } from "../error/index.js";
import { SimulationMode, RecordStorage } from "../config/index.js";

/**
 * Recorded operation type.
 */
export type OperationType = "publish" | "pull" | "acknowledge" | "modifyAckDeadline";

/**
 * Recorded operation.
 */
export interface RecordedOperation {
  /** Operation type. */
  type: OperationType;
  /** Request details. */
  request: RecordedRequest;
  /** Response details. */
  response: RecordedResponse;
  /** Timestamp. */
  timestamp: Date;
  /** Latency in ms. */
  latencyMs: number;
}

/**
 * Recorded request.
 */
export interface RecordedRequest {
  /** Topic or subscription path. */
  path: string;
  /** Request body (JSON). */
  body: unknown;
}

/**
 * Recorded response.
 */
export interface RecordedResponse {
  /** HTTP status code. */
  status: number;
  /** Response body (JSON). */
  body: unknown;
}

/**
 * Recording file format.
 */
export interface RecordingFile {
  /** Format version. */
  version: string;
  /** Creation timestamp. */
  createdAt: string;
  /** Operations. */
  operations: RecordedOperationSerialized[];
}

/**
 * Serialized operation for JSON.
 */
interface RecordedOperationSerialized {
  type: OperationType;
  request: RecordedRequest;
  response: RecordedResponse;
  timestamp: string;
  latencyMs: number;
}

/**
 * Match mode for replay.
 */
export type MatchMode = "strict" | "relaxed";

/**
 * Simulation layer for recording/replaying Pub/Sub operations.
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private recordings: RecordedOperation[] = [];
  private replayIndex = 0;
  private matchMode: MatchMode = "strict";

  constructor(mode: SimulationMode) {
    this.mode = mode;
  }

  /**
   * Check if simulation is active.
   */
  isActive(): boolean {
    return this.mode.type !== "disabled";
  }

  /**
   * Check if recording.
   */
  isRecording(): boolean {
    return this.mode.type === "recording";
  }

  /**
   * Check if replaying.
   */
  isReplaying(): boolean {
    return this.mode.type === "replay";
  }

  /**
   * Set match mode for replay.
   */
  setMatchMode(mode: MatchMode): void {
    this.matchMode = mode;
  }

  /**
   * Record an operation.
   */
  async record(operation: RecordedOperation): Promise<void> {
    if (!this.isRecording()) {
      throw new SimulationError(
        "Cannot record when not in recording mode",
        "StorageError"
      );
    }

    this.recordings.push(operation);

    // If using file storage, append to file
    if (this.mode.type === "recording" && this.mode.storage.type === "file") {
      await this.appendToFile(this.mode.storage.path, operation);
    }
  }

  /**
   * Get next replay response.
   */
  async replay(
    type: OperationType,
    request: RecordedRequest
  ): Promise<RecordedResponse> {
    if (!this.isReplaying()) {
      throw new SimulationError(
        "Cannot replay when not in replay mode",
        "StorageError"
      );
    }

    // Load recordings if not yet loaded
    if (this.recordings.length === 0 && this.mode.type === "replay") {
      await this.loadRecordings();
    }

    // Find matching recording
    const match = this.findMatch(type, request);

    if (!match) {
      throw new SimulationError(
        `No recording found for ${type} to ${request.path}`,
        "NoRecordingFound"
      );
    }

    return match.response;
  }

  /**
   * Load recordings from storage.
   */
  async loadRecordings(): Promise<void> {
    if (this.mode.type !== "replay") {
      throw new SimulationError("Not in replay mode", "StorageError");
    }

    const source = this.mode.source;

    if (source.type === "memory") {
      // Recordings should already be set via setRecordings
      return;
    }

    if (source.type === "file") {
      const content = await fs.readFile(source.path, "utf-8");
      const file = JSON.parse(content) as RecordingFile;

      // Validate version
      if (file.version !== "1.0") {
        throw new SimulationError(
          `Unsupported recording version: ${file.version}`,
          "CorruptedRecording"
        );
      }

      // Parse operations
      this.recordings = file.operations.map((op) => ({
        ...op,
        timestamp: new Date(op.timestamp),
      }));
    }
  }

  /**
   * Save recordings to storage.
   */
  async saveRecordings(): Promise<void> {
    if (this.mode.type !== "recording") {
      throw new SimulationError("Not in recording mode", "StorageError");
    }

    const storage = this.mode.storage;

    if (storage.type === "memory") {
      // Already in memory
      return;
    }

    if (storage.type === "file") {
      const file: RecordingFile = {
        version: "1.0",
        createdAt: new Date().toISOString(),
        operations: this.recordings.map((op) => ({
          ...op,
          timestamp: op.timestamp.toISOString(),
        })),
      };

      const dir = path.dirname(storage.path);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(storage.path, JSON.stringify(file, null, 2), "utf-8");
    }
  }

  /**
   * Get all recordings.
   */
  getRecordings(): RecordedOperation[] {
    return [...this.recordings];
  }

  /**
   * Set recordings (for memory mode).
   */
  setRecordings(recordings: RecordedOperation[]): void {
    this.recordings = [...recordings];
  }

  /**
   * Clear all recordings.
   */
  clearRecordings(): void {
    this.recordings = [];
    this.replayIndex = 0;
  }

  /**
   * Reset replay index.
   */
  resetReplay(): void {
    this.replayIndex = 0;
  }

  /**
   * Find matching recording.
   */
  private findMatch(
    type: OperationType,
    request: RecordedRequest
  ): RecordedOperation | undefined {
    if (this.matchMode === "strict") {
      // Sequential matching - use next matching operation
      for (let i = this.replayIndex; i < this.recordings.length; i++) {
        const recording = this.recordings[i];
        if (recording && this.isMatch(recording, type, request)) {
          this.replayIndex = i + 1;
          return recording;
        }
      }
    } else {
      // Relaxed matching - find any matching operation
      return this.recordings.find((r) => this.isMatch(r, type, request));
    }

    return undefined;
  }

  /**
   * Check if recording matches request.
   */
  private isMatch(
    recording: RecordedOperation,
    type: OperationType,
    request: RecordedRequest
  ): boolean {
    if (recording.type !== type) {
      return false;
    }

    if (recording.request.path !== request.path) {
      return false;
    }

    if (this.matchMode === "strict") {
      // Deep compare request bodies
      return JSON.stringify(recording.request.body) === JSON.stringify(request.body);
    }

    return true;
  }

  /**
   * Append operation to file.
   */
  private async appendToFile(filePath: string, operation: RecordedOperation): Promise<void> {
    try {
      // Try to read existing file
      const content = await fs.readFile(filePath, "utf-8");
      const file = JSON.parse(content) as RecordingFile;
      file.operations.push({
        ...operation,
        timestamp: operation.timestamp.toISOString(),
      });
      await fs.writeFile(filePath, JSON.stringify(file, null, 2), "utf-8");
    } catch {
      // File doesn't exist, create new
      const file: RecordingFile = {
        version: "1.0",
        createdAt: new Date().toISOString(),
        operations: [{
          ...operation,
          timestamp: operation.timestamp.toISOString(),
        }],
      };
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(file, null, 2), "utf-8");
    }
  }
}

/**
 * Create a simulation layer.
 */
export function createSimulationLayer(mode: SimulationMode): SimulationLayer {
  return new SimulationLayer(mode);
}

/**
 * Create a recording for testing.
 */
export function createRecording(
  type: OperationType,
  request: RecordedRequest,
  response: RecordedResponse,
  latencyMs: number = 50
): RecordedOperation {
  return {
    type,
    request,
    response,
    timestamp: new Date(),
    latencyMs,
  };
}

/**
 * Create a publish recording.
 */
export function createPublishRecording(
  topicPath: string,
  messageIds: string[],
  latencyMs: number = 50
): RecordedOperation {
  return {
    type: "publish",
    request: {
      path: topicPath,
      body: { messages: [] }, // Will be matched by path only in relaxed mode
    },
    response: {
      status: 200,
      body: { messageIds },
    },
    timestamp: new Date(),
    latencyMs,
  };
}

/**
 * Create a pull recording.
 */
export function createPullRecording(
  subscriptionPath: string,
  messages: Array<{
    ackId: string;
    messageId: string;
    data: string;
    attributes?: Record<string, string>;
  }>,
  latencyMs: number = 50
): RecordedOperation {
  return {
    type: "pull",
    request: {
      path: subscriptionPath,
      body: { maxMessages: 10 },
    },
    response: {
      status: 200,
      body: {
        receivedMessages: messages.map((m) => ({
          ackId: m.ackId,
          message: {
            data: Buffer.from(m.data).toString("base64"),
            attributes: m.attributes ?? {},
            messageId: m.messageId,
            publishTime: new Date().toISOString(),
          },
        })),
      },
    },
    timestamp: new Date(),
    latencyMs,
  };
}

/**
 * Create an empty pull recording (no messages).
 */
export function createEmptyPullRecording(
  subscriptionPath: string,
  latencyMs: number = 50
): RecordedOperation {
  return {
    type: "pull",
    request: {
      path: subscriptionPath,
      body: { maxMessages: 10 },
    },
    response: {
      status: 200,
      body: {},
    },
    timestamp: new Date(),
    latencyMs,
  };
}

/**
 * Create an ack recording.
 */
export function createAckRecording(
  subscriptionPath: string,
  latencyMs: number = 10
): RecordedOperation {
  return {
    type: "acknowledge",
    request: {
      path: subscriptionPath,
      body: { ackIds: [] },
    },
    response: {
      status: 200,
      body: {},
    },
    timestamp: new Date(),
    latencyMs,
  };
}
