/**
 * Configuration types for the Ollama client.
 */

/**
 * Simulation mode configuration.
 */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; storage: RecordStorage }
  | { type: 'replay'; source: RecordStorage; timing: TimingMode };

/**
 * Storage backend for recordings.
 */
export type RecordStorage = { type: 'memory' } | { type: 'file'; path: string };

/**
 * Timing mode for replay.
 */
export type TimingMode = 'instant' | 'realistic' | { type: 'fixed'; delayMs: number };

/**
 * Ollama client configuration.
 */
export interface OllamaConfig {
  /** Base URL for Ollama server. */
  readonly baseUrl: string;
  /** Request timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Maximum retry attempts for transient errors. */
  readonly maxRetries: number;
  /** Optional authentication token (for proxied setups). */
  readonly authToken?: string;
  /** Default model to use. */
  readonly defaultModel?: string;
  /** Default headers for all requests. */
  readonly defaultHeaders: Record<string, string>;
  /** Simulation mode configuration. */
  readonly simulationMode: SimulationMode;
}
