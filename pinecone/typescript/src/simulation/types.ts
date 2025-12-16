/**
 * Simulation types for Pinecone integration
 * Provides record/replay testing capabilities
 */

/**
 * Simulation mode determines how the simulation layer behaves
 */
export type SimulationMode = 'disabled' | 'record' | 'replay' | 'passthrough';

/**
 * A recorded simulation entry
 */
export interface SimulationRecord {
  /** Unique fingerprint identifying this request/response pair */
  fingerprint: string;
  /** Operation name (e.g., 'query', 'upsert', 'delete') */
  operation: string;
  /** Normalized request data */
  request: unknown;
  /** Recorded response data */
  response: unknown;
  /** Timestamp when the record was created */
  timestamp: number;
}

/**
 * Storage interface for simulation records
 */
export interface SimulationStorage {
  /**
   * Store a simulation record
   */
  store(record: SimulationRecord): Promise<void>;

  /**
   * Retrieve a simulation record by fingerprint
   */
  get(fingerprint: string): Promise<SimulationRecord | null>;

  /**
   * List all stored simulation records
   */
  list(): Promise<SimulationRecord[]>;

  /**
   * Clear all stored simulation records
   */
  clear(): Promise<void>;
}
