/**
 * Workload Recording for vLLM
 * Records request/response pairs for replay and testing
 */

import type {
  ChatRequest,
  ChatResponse,
  InferenceRecord,
} from '../types/index.js';

export interface RecordingStorage {
  append(record: InferenceRecord): Promise<void>;
  getAll(): Promise<InferenceRecord[]>;
  clear(): Promise<void>;
}

/**
 * In-memory recording storage
 */
export class InMemoryRecordingStorage implements RecordingStorage {
  private records: InferenceRecord[] = [];

  async append(record: InferenceRecord): Promise<void> {
    this.records.push(record);
  }

  async getAll(): Promise<InferenceRecord[]> {
    return [...this.records];
  }

  async clear(): Promise<void> {
    this.records = [];
  }
}

/**
 * Sanitize request to remove PII
 */
function sanitizeRequest(request: ChatRequest): ChatRequest {
  // Create a deep copy
  const sanitized = JSON.parse(JSON.stringify(request)) as ChatRequest;

  // Optionally redact message content or other sensitive data
  // For now, we keep the content for replay purposes
  // In production, you might want to:
  // - Hash or mask user names
  // - Remove email addresses, phone numbers, etc.

  return sanitized;
}

/**
 * Workload recorder for capturing inference requests
 */
export class WorkloadRecorder {
  private readonly storage: RecordingStorage;
  private enabled = false;

  constructor(storage: RecordingStorage = new InMemoryRecordingStorage()) {
    this.storage = storage;
  }

  /**
   * Start recording
   */
  startRecording(): void {
    this.enabled = true;
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.enabled = false;
  }

  /**
   * Check if recording is enabled
   */
  isRecording(): boolean {
    return this.enabled;
  }

  /**
   * Record a request/response pair
   */
  async record(
    request: ChatRequest,
    response: ChatResponse,
    durationMs: number
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const record: InferenceRecord = {
      timestamp: Date.now(),
      request: sanitizeRequest(request),
      response,
      latencyMs: durationMs,
      model: request.model,
      tokensIn: response.usage.prompt_tokens,
      tokensOut: response.usage.completion_tokens,
    };

    await this.storage.append(record);
  }

  /**
   * Get all recorded requests
   */
  async getRecords(): Promise<InferenceRecord[]> {
    return this.storage.getAll();
  }

  /**
   * Clear all recordings
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Export recordings as JSON
   */
  async exportJSON(): Promise<string> {
    const records = await this.storage.getAll();
    return JSON.stringify(records, null, 2);
  }

  /**
   * Import recordings from JSON
   */
  async importJSON(json: string): Promise<number> {
    const records = JSON.parse(json) as InferenceRecord[];
    for (const record of records) {
      await this.storage.append(record);
    }
    return records.length;
  }
}
