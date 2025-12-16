/**
 * Storage implementations for simulation records
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { SimulationRecord, SimulationStorage } from './types.js';

/**
 * In-memory storage for simulation records
 * Useful for testing and development
 */
export class InMemoryStorage implements SimulationStorage {
  private records: Map<string, SimulationRecord>;

  constructor() {
    this.records = new Map();
  }

  async store(record: SimulationRecord): Promise<void> {
    this.records.set(record.fingerprint, record);
  }

  async get(fingerprint: string): Promise<SimulationRecord | null> {
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
 * File-based storage for simulation records
 * Persists records to disk for replay across sessions
 */
export class FileStorage implements SimulationStorage {
  private directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  /**
   * Ensure the storage directory exists
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.directory, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Get the file path for a given fingerprint
   */
  private getFilePath(fingerprint: string): string {
    return join(this.directory, `${fingerprint}.json`);
  }

  async store(record: SimulationRecord): Promise<void> {
    await this.ensureDirectory();
    const filePath = this.getFilePath(record.fingerprint);
    const data = JSON.stringify(record, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  async get(fingerprint: string): Promise<SimulationRecord | null> {
    const filePath = this.getFilePath(fingerprint);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as SimulationRecord;
    } catch (error) {
      // Return null if file doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<SimulationRecord[]> {
    try {
      await this.ensureDirectory();
      const files = await fs.readdir(this.directory);
      const records: SimulationRecord[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(this.directory, file);
          const data = await fs.readFile(filePath, 'utf-8');
          records.push(JSON.parse(data) as SimulationRecord);
        }
      }

      return records;
    } catch (error) {
      // Return empty array if directory doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.directory);
      await Promise.all(
        files.map(file => fs.unlink(join(this.directory, file)))
      );
    } catch (error) {
      // Ignore if directory doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
