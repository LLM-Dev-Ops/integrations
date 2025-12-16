import { createHash } from 'crypto';
import { MilvusSimulationError } from '../errors/index.js';

/**
 * Simulation modes.
 */
export enum SimulationMode {
  /** Simulation disabled - all operations go to real Milvus */
  Disabled = 'disabled',
  /** Record mode - execute and save responses */
  Record = 'record',
  /** Replay mode - return saved responses without network */
  Replay = 'replay',
  /** Pass-through mode - execute and optionally record */
  PassThrough = 'passthrough',
}

/**
 * Recorded operation data.
 */
export interface SimulationRecord {
  /** Operation fingerprint for matching */
  fingerprint: string;
  /** Operation name */
  operation: string;
  /** Serialized request */
  request: string;
  /** Serialized response */
  response: string;
  /** Recording timestamp */
  timestamp: number;
}

/**
 * Storage interface for simulation records.
 */
export interface SimulationStorage {
  /** Store a record */
  store(record: SimulationRecord): Promise<void>;
  /** Retrieve a record by fingerprint */
  retrieve(fingerprint: string): Promise<SimulationRecord | null>;
  /** List all records */
  list(): Promise<SimulationRecord[]>;
  /** Clear all records */
  clear(): Promise<void>;
}

/**
 * In-memory simulation storage.
 */
export class InMemorySimulationStorage implements SimulationStorage {
  private records: Map<string, SimulationRecord> = new Map();

  async store(record: SimulationRecord): Promise<void> {
    this.records.set(record.fingerprint, record);
  }

  async retrieve(fingerprint: string): Promise<SimulationRecord | null> {
    return this.records.get(fingerprint) ?? null;
  }

  async list(): Promise<SimulationRecord[]> {
    return Array.from(this.records.values());
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

/**
 * Simulation layer for recording and replaying operations.
 */
export class SimulationLayer {
  private mode: SimulationMode;
  private readonly storage: SimulationStorage;

  constructor(
    mode: SimulationMode = SimulationMode.Disabled,
    storage: SimulationStorage = new InMemorySimulationStorage()
  ) {
    this.mode = mode;
    this.storage = storage;
  }

  /**
   * Check if in replay mode.
   */
  isReplayMode(): boolean {
    return this.mode === SimulationMode.Replay;
  }

  /**
   * Check if in record mode.
   */
  isRecordMode(): boolean {
    return (
      this.mode === SimulationMode.Record ||
      this.mode === SimulationMode.PassThrough
    );
  }

  /**
   * Set simulation mode.
   */
  setMode(mode: SimulationMode): void {
    this.mode = mode;
  }

  /**
   * Get current mode.
   */
  getMode(): SimulationMode {
    return this.mode;
  }

  /**
   * Generate fingerprint for an operation.
   */
  generateFingerprint(operation: string, request: unknown): string {
    const normalized = normalizeRequest(request);
    const data = `${operation}:${JSON.stringify(normalized)}`;
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Record an operation response if in record mode.
   */
  async recordIfEnabled<T>(
    operation: string,
    request: unknown,
    response: T
  ): Promise<void> {
    if (!this.isRecordMode()) {
      return;
    }

    const fingerprint = this.generateFingerprint(operation, request);
    const record: SimulationRecord = {
      fingerprint,
      operation,
      request: JSON.stringify(request),
      response: JSON.stringify(response),
      timestamp: Date.now(),
    };

    await this.storage.store(record);
  }

  /**
   * Get recorded response if in replay mode.
   */
  async getRecordedResponse<T>(
    operation: string,
    request: unknown
  ): Promise<T> {
    if (!this.isReplayMode()) {
      throw new MilvusSimulationError('Not in replay mode');
    }

    const fingerprint = this.generateFingerprint(operation, request);
    const record = await this.storage.retrieve(fingerprint);

    if (!record) {
      throw new MilvusSimulationError(
        `No recorded response for operation: ${operation}`,
        { fingerprint, operation }
      );
    }

    return JSON.parse(record.response) as T;
  }

  /**
   * Wrap an operation for simulation support.
   */
  async wrap<T>(
    operation: string,
    request: unknown,
    execute: () => Promise<T>
  ): Promise<T> {
    // In replay mode, return recorded response
    if (this.isReplayMode()) {
      return this.getRecordedResponse<T>(operation, request);
    }

    // Execute the operation
    const response = await execute();

    // Record if enabled
    await this.recordIfEnabled(operation, request, response);

    return response;
  }

  /**
   * Get storage for external access.
   */
  getStorage(): SimulationStorage {
    return this.storage;
  }
}

/**
 * Normalize request for fingerprinting.
 * Removes timestamps, random IDs, etc. for consistent fingerprinting.
 */
function normalizeRequest(request: unknown): unknown {
  if (request === null || request === undefined) {
    return request;
  }

  if (typeof request !== 'object') {
    return request;
  }

  if (Array.isArray(request)) {
    return request.map(normalizeRequest);
  }

  const normalized: Record<string, unknown> = {};
  const obj = request as Record<string, unknown>;

  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(obj).sort();

  for (const key of sortedKeys) {
    // Skip non-deterministic fields
    if (
      key === 'timestamp' ||
      key === 'requestId' ||
      key === 'correlationId'
    ) {
      continue;
    }
    normalized[key] = normalizeRequest(obj[key]);
  }

  return normalized;
}

/**
 * Create a simulation layer.
 */
export function createSimulationLayer(
  mode: SimulationMode = SimulationMode.Disabled,
  storage?: SimulationStorage
): SimulationLayer {
  return new SimulationLayer(mode, storage);
}

/**
 * Create simulation mode from environment variable.
 */
export function getSimulationModeFromEnv(): SimulationMode {
  const mode = process.env['MILVUS_SIMULATION_MODE']?.toLowerCase();
  switch (mode) {
    case 'record':
      return SimulationMode.Record;
    case 'replay':
      return SimulationMode.Replay;
    case 'passthrough':
      return SimulationMode.PassThrough;
    default:
      return SimulationMode.Disabled;
  }
}
