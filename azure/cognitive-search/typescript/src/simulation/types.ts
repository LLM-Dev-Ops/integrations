/**
 * Azure Cognitive Search Simulation Types
 *
 * Types for recording and replaying HTTP interactions for CI/CD testing.
 */

/** Serialized HTTP request for recording */
export interface SerializedRequest {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Optional body content hash (for matching) */
  bodyHash?: string;
}

/** Serialized HTTP response for replaying */
export interface SerializedResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Optional response body (JSON string or base64 encoded) */
  body?: string;
}

/** Recorded HTTP interaction */
export interface RecordedInteraction {
  /** Timestamp when interaction was recorded */
  timestamp: string;
  /** Operation name */
  operation: string;
  /** Serialized request */
  request: SerializedRequest;
  /** Serialized response */
  response: SerializedResponse;
  /** Duration of the operation in milliseconds */
  durationMs: number;
}

/** Simulation file format */
export interface SimulationFile {
  /** File format version */
  version: string;
  /** When the recording was created */
  created: string;
  /** List of recorded interactions */
  interactions: RecordedInteraction[];
}

/** Matching mode for finding recorded interactions */
export type MatchingMode = 'exact' | 'operation' | 'relaxed';

/** Simulation configuration */
export interface SimulationConfig {
  /** Whether to simulate timing delays */
  simulateTiming: boolean;
  /** How to match recorded interactions */
  matchingMode: MatchingMode;
}
