/**
 * Recording storage implementations
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { RecordedOperation, RecordingStorage } from './recorder.js';

/**
 * File-based recording storage
 */
export class FileRecordingStorage implements RecordingStorage {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Saves recordings to file
   */
  async save(recordings: RecordedOperation[]): Promise<void> {
    const dir = dirname(this.filePath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    const content = JSON.stringify(recordings, null, 2);
    await writeFile(this.filePath, content, 'utf8');
  }

  /**
   * Loads recordings from file
   */
  async load(): Promise<RecordedOperation[]> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      return JSON.parse(content) as RecordedOperation[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

/**
 * In-memory recording storage (for testing)
 */
export class InMemoryRecordingStorage implements RecordingStorage {
  private recordings: RecordedOperation[] = [];

  async save(recordings: RecordedOperation[]): Promise<void> {
    this.recordings = [...recordings];
  }

  async load(): Promise<RecordedOperation[]> {
    return [...this.recordings];
  }

  /**
   * Clears the storage
   */
  clear(): void {
    this.recordings = [];
  }
}
