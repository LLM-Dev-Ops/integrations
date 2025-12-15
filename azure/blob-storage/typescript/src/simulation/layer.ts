/**
 * Azure Blob Storage Simulation Layer
 *
 * Handles recording and replay of HTTP interactions for CI/CD testing.
 * Allows testing without live Azure services by recording real interactions
 * and replaying them in subsequent test runs.
 */

import type { SimulationMode } from '../client/config.js';
import type {
  RecordedInteraction,
  SerializedRequest,
  SerializedResponse,
  SimulationConfig,
  MatchingMode,
} from './types.js';
import { SimulationStorage } from './storage.js';

/**
 * Default simulation configuration
 */
const DEFAULT_CONFIG: SimulationConfig = {
  simulateTiming: false,
  matchingMode: 'operation',
};

/**
 * Simulation layer for recording and replaying HTTP interactions
 *
 * @example
 * ```typescript
 * // Recording mode - captures real Azure interactions
 * const layer = new SimulationLayer(
 *   { type: 'recording', path: './recordings.json' }
 * );
 *
 * // Make requests...
 * await layer.record(request, response);
 *
 * // Save recordings
 * await layer.save();
 *
 * // Replay mode - uses recorded interactions
 * const replayLayer = new SimulationLayer(
 *   { type: 'replay', path: './recordings.json' }
 * );
 * await replayLayer.load('./recordings.json');
 * const response = await replayLayer.replay<UploadResponse>(request, 'upload');
 * ```
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private config: SimulationConfig;
  private storage: SimulationStorage;
  private recordings: RecordedInteraction[] = [];
  private loadedPath?: string;

  /**
   * Create a new simulation layer
   *
   * @param mode - Simulation mode (disabled, recording, or replay)
   * @param config - Optional simulation configuration
   */
  constructor(mode: SimulationMode, config?: Partial<SimulationConfig>) {
    this.mode = mode;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = new SimulationStorage(this.config.matchingMode);
  }

  /**
   * Check if layer is in recording mode
   *
   * @returns True if recording
   */
  isRecording(): boolean {
    return this.mode.type === 'recording';
  }

  /**
   * Check if layer is in replay mode
   *
   * @returns True if replaying
   */
  isReplay(): boolean {
    return this.mode.type === 'replay';
  }

  /**
   * Check if simulation is disabled
   *
   * @returns True if disabled
   */
  isDisabled(): boolean {
    return this.mode.type === 'disabled';
  }

  /**
   * Record an HTTP interaction
   *
   * @param request - HTTP request that was made
   * @param response - HTTP response that was received
   * @param operation - Operation name (upload, download, etc.)
   * @param durationMs - How long the operation took
   */
  async record(
    request: SerializedRequest,
    response: SerializedResponse,
    operation: string,
    durationMs: number
  ): Promise<void> {
    if (!this.isRecording()) {
      return;
    }

    const interaction: RecordedInteraction = {
      timestamp: new Date().toISOString(),
      operation,
      request,
      response,
      durationMs,
    };

    this.recordings.push(interaction);
  }

  /**
   * Replay a recorded HTTP interaction
   *
   * @param request - HTTP request to match
   * @param operation - Operation name
   * @returns Recorded response data
   * @throws {SimulationNoMatchError} If no matching recording is found
   */
  async replay<T>(request: SerializedRequest, operation: string): Promise<T> {
    if (!this.isReplay()) {
      throw new Error('Cannot replay in non-replay mode');
    }

    const interaction = this.storage.findMatch(request, operation);

    // Simulate timing if configured
    if (this.config.simulateTiming && interaction.durationMs > 0) {
      await this.delay(interaction.durationMs);
    }

    // Parse response body if present
    let responseData: T;
    if (interaction.response.body) {
      try {
        responseData = JSON.parse(interaction.response.body) as T;
      } catch {
        // If parsing fails, return body as-is
        responseData = interaction.response.body as unknown as T;
      }
    } else {
      responseData = {} as T;
    }

    return responseData;
  }

  /**
   * Get the serialized response for a request (without parsing body)
   *
   * @param request - HTTP request to match
   * @param operation - Operation name
   * @returns Serialized response
   * @throws {SimulationNoMatchError} If no matching recording is found
   */
  async getResponse(
    request: SerializedRequest,
    operation: string
  ): Promise<SerializedResponse> {
    if (!this.isReplay()) {
      throw new Error('Cannot replay in non-replay mode');
    }

    const interaction = this.storage.findMatch(request, operation);

    // Simulate timing if configured
    if (this.config.simulateTiming && interaction.durationMs > 0) {
      await this.delay(interaction.durationMs);
    }

    return interaction.response;
  }

  /**
   * Save recordings to file
   *
   * @throws {SimulationLoadError} If file cannot be written
   */
  async save(): Promise<void> {
    if (!this.isRecording()) {
      return;
    }

    if (this.mode.type !== 'recording') {
      return;
    }

    await this.storage.save(this.mode.path, this.recordings);
  }

  /**
   * Load recordings from file
   *
   * @param path - Path to simulation file
   * @throws {SimulationLoadError} If file cannot be loaded
   */
  async load(path: string): Promise<void> {
    if (!this.isReplay()) {
      return;
    }

    await this.storage.load(path);
    this.loadedPath = path;
  }

  /**
   * Auto-load recordings based on mode configuration
   *
   * @throws {SimulationLoadError} If file cannot be loaded
   */
  async autoLoad(): Promise<void> {
    if (this.mode.type === 'replay') {
      await this.load(this.mode.path);
    }
  }

  /**
   * Get all recorded interactions
   *
   * @returns Array of recorded interactions
   */
  getRecordings(): RecordedInteraction[] {
    return [...this.recordings];
  }

  /**
   * Get count of recorded interactions
   *
   * @returns Number of recordings
   */
  getRecordingCount(): number {
    if (this.isRecording()) {
      return this.recordings.length;
    }
    return this.storage.getCount();
  }

  /**
   * Reset the simulation layer
   */
  reset(): void {
    this.recordings = [];
    this.storage.reset();
  }

  /**
   * Update matching mode
   *
   * @param mode - New matching mode
   */
  setMatchingMode(mode: MatchingMode): void {
    this.config.matchingMode = mode;
    this.storage = new SimulationStorage(mode);

    // Reload if we had loaded recordings
    if (this.loadedPath) {
      void this.load(this.loadedPath);
    }
  }

  /**
   * Enable or disable timing simulation
   *
   * @param enabled - Whether to simulate timing
   */
  setSimulateTiming(enabled: boolean): void {
    this.config.simulateTiming = enabled;
  }

  /**
   * Get current configuration
   *
   * @returns Current simulation config
   */
  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  /**
   * Delay for a specified duration
   *
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a serialized request from request parameters
   *
   * @param method - HTTP method
   * @param url - Request URL
   * @param headers - Request headers
   * @param body - Optional request body
   * @returns Serialized request
   */
  static createSerializedRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string | Uint8Array | ArrayBuffer
  ): SerializedRequest {
    const request: SerializedRequest = {
      method,
      url,
      headers,
    };

    if (body) {
      request.bodyHash = SimulationStorage.hashBody(body);
    }

    return request;
  }

  /**
   * Create a serialized response from response data
   *
   * @param status - HTTP status code
   * @param headers - Response headers
   * @param body - Optional response body (will be JSON stringified if object)
   * @returns Serialized response
   */
  static createSerializedResponse(
    status: number,
    headers: Record<string, string>,
    body?: unknown
  ): SerializedResponse {
    const response: SerializedResponse = {
      status,
      headers,
    };

    if (body !== undefined) {
      if (typeof body === 'string') {
        response.body = body;
      } else if (body instanceof Uint8Array) {
        response.body = Buffer.from(body).toString('base64');
      } else if (body instanceof ArrayBuffer) {
        response.body = Buffer.from(body).toString('base64');
      } else {
        response.body = JSON.stringify(body);
      }
    }

    return response;
  }
}
