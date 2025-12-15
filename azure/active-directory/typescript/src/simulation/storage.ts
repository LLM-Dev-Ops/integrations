/**
 * Storage for simulation recordings.
 */

import { readFile, writeFile } from 'fs/promises';
import type { RecordedAuthInteraction, SerializedTokenRequest } from './types.js';
import { AzureAdError } from '../error.js';

/**
 * Simulation storage for recordings.
 */
export class SimulationStorage {
  private recordings: RecordedAuthInteraction[] = [];

  /**
   * Add a recording.
   */
  add(recording: RecordedAuthInteraction): void {
    this.recordings.push(recording);
  }

  /**
   * Find a matching recording.
   */
  find(request: SerializedTokenRequest): RecordedAuthInteraction | undefined {
    return this.recordings.find(r =>
      r.request.grantType === request.grantType &&
      r.request.clientId === request.clientId &&
      r.request.scopes === request.scopes
    );
  }

  /**
   * Save recordings to file.
   */
  async save(path: string): Promise<void> {
    try {
      const data = JSON.stringify(this.recordings, null, 2);
      await writeFile(path, data, 'utf8');
    } catch (error) {
      throw new AzureAdError('SIMULATION_LOAD_ERROR', `Failed to save recordings: ${error}`, {
        isRetryable: false,
      });
    }
  }

  /**
   * Load recordings from file.
   */
  async load(path: string): Promise<void> {
    try {
      const data = await readFile(path, 'utf8');
      this.recordings = JSON.parse(data) as RecordedAuthInteraction[];
    } catch (error) {
      throw new AzureAdError('SIMULATION_LOAD_ERROR', `Failed to load recordings: ${error}`, {
        isRetryable: false,
      });
    }
  }

  /**
   * Get all recordings.
   */
  getAll(): RecordedAuthInteraction[] {
    return [...this.recordings];
  }

  /**
   * Get count of recordings.
   */
  getCount(): number {
    return this.recordings.length;
  }

  /**
   * Reset storage.
   */
  reset(): void {
    this.recordings = [];
  }
}
