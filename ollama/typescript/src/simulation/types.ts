/**
 * Recording types for the Ollama simulation layer.
 */

/**
 * A single recorded interaction with the Ollama API.
 */
export interface RecordEntry {
  /** Unique identifier for this recording. */
  id: string;
  /** ISO 8601 timestamp when the recording was made. */
  timestamp: string;
  /** Operation type (e.g., 'chat', 'generate', 'embeddings'). */
  operation: string;
  /** Model used for this request. */
  model: string;
  /** Serialized request data. */
  request: unknown;
  /** Recorded response. */
  response: RecordedResponse;
  /** Timing information. */
  timing: TimingInfo;
}

/**
 * Recorded response types.
 */
export type RecordedResponse =
  | { type: 'success'; body: unknown }
  | { type: 'stream'; chunks: unknown[] }
  | { type: 'error'; error: unknown };

/**
 * Timing information for a recorded interaction.
 */
export interface TimingInfo {
  /** Total duration in milliseconds. */
  totalDurationMs: number;
  /** Time to first token in milliseconds (for streaming responses). */
  firstTokenMs?: number;
  /** Timing for each chunk in milliseconds (for streaming responses). */
  chunkTimings?: number[];
}

/**
 * Complete recording containing multiple entries.
 */
export interface Recording {
  /** Recording format version. */
  version: string;
  /** ISO 8601 timestamp when the recording was created. */
  createdAt: string;
  /** List of recorded entries. */
  entries: RecordEntry[];
}
