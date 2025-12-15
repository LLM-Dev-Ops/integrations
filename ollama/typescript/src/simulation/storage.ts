/**
 * Storage implementations for simulation recordings.
 */

import { promises as fs } from 'fs';
import type { Recording, RecordEntry } from './types.js';

/**
 * Interface for recording storage backends.
 */
export interface RecordingStorage {
  /**
   * Save a complete recording.
   */
  save(recording: Recording): Promise<void>;

  /**
   * Load a complete recording.
   */
  load(): Promise<Recording>;

  /**
   * Append a single entry to the recording.
   */
  append(entry: RecordEntry): Promise<void>;
}

/**
 * In-memory storage implementation.
 * Suitable for testing and short-lived recordings.
 */
export class MemoryStorage implements RecordingStorage {
  private entries: RecordEntry[] = [];
  private createdAt: string;

  constructor() {
    this.createdAt = new Date().toISOString();
  }

  async save(recording: Recording): Promise<void> {
    this.entries = [...recording.entries];
    this.createdAt = recording.createdAt;
  }

  async load(): Promise<Recording> {
    return {
      version: '1.0',
      createdAt: this.createdAt,
      entries: [...this.entries],
    };
  }

  async append(entry: RecordEntry): Promise<void> {
    this.entries.push(entry);
  }

  /**
   * Clear all stored entries.
   */
  clear(): void {
    this.entries = [];
    this.createdAt = new Date().toISOString();
  }

  /**
   * Get the number of stored entries.
   */
  size(): number {
    return this.entries.length;
  }
}

/**
 * File-based storage implementation.
 * Persists recordings to disk as JSON files.
 */
export class FileStorage implements RecordingStorage {
  constructor(private readonly path: string) {}

  async save(recording: Recording): Promise<void> {
    const json = JSON.stringify(recording, null, 2);
    await fs.writeFile(this.path, json, 'utf-8');
  }

  async load(): Promise<Recording> {
    const json = await fs.readFile(this.path, 'utf-8');
    const recording = JSON.parse(json) as Recording;

    // Validate recording structure
    if (!recording.version || !recording.createdAt || !Array.isArray(recording.entries)) {
      throw new Error(`Invalid recording format in file: ${this.path}`);
    }

    return recording;
  }

  async append(entry: RecordEntry): Promise<void> {
    let recording: Recording;

    try {
      recording = await this.load();
    } catch (error) {
      // File doesn't exist or is invalid, create new recording
      recording = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        entries: [],
      };
    }

    recording.entries.push(entry);
    await this.save(recording);
  }

  /**
   * Check if the recording file exists.
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete the recording file.
   */
  async delete(): Promise<void> {
    try {
      await fs.unlink(this.path);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
