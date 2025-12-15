/**
 * Mock Server for vLLM
 * Returns recorded responses without hitting actual server
 */

import type {
  ChatRequest,
  ChatResponse,
  InferenceRecord,
} from '../types/index.js';
import { InvalidModelError } from '../types/errors.js';

export interface MockConfig {
  latencyMs?: number;
  latencyJitterMs?: number;
  errorRate?: number;
}

/**
 * Mock client that returns recorded responses
 */
export class MockVllmClient {
  private readonly records: Map<string, InferenceRecord[]> = new Map();
  private readonly config: MockConfig;
  private indices: Map<string, number> = new Map();

  constructor(records: InferenceRecord[], config: MockConfig = {}) {
    this.config = config;

    // Index records by model
    for (const record of records) {
      const model = record.model;
      if (!this.records.has(model)) {
        this.records.set(model, []);
      }
      this.records.get(model)!.push(record);
    }
  }

  /**
   * Get a chat completion from recorded data
   */
  async chatCompletion(request: ChatRequest): Promise<ChatResponse> {
    // Simulate error rate
    if (this.config.errorRate && Math.random() < this.config.errorRate) {
      throw new Error('Simulated error');
    }

    // Find matching record
    const modelRecords = this.records.get(request.model);
    if (!modelRecords || modelRecords.length === 0) {
      throw new InvalidModelError(
        request.model,
        Array.from(this.records.keys())
      );
    }

    // Get next record for this model (round-robin)
    const index = this.indices.get(request.model) ?? 0;
    const record = modelRecords[index % modelRecords.length]!;
    this.indices.set(request.model, index + 1);

    // Simulate latency
    await this.simulateLatency(record.latencyMs);

    // Return recorded response with updated timestamp
    return {
      ...record.response,
      created: Math.floor(Date.now() / 1000),
    };
  }

  private async simulateLatency(recordedLatency: number): Promise<void> {
    let latency: number;

    if (this.config.latencyMs !== undefined) {
      latency = this.config.latencyMs;
    } else {
      latency = recordedLatency;
    }

    // Add jitter
    if (this.config.latencyJitterMs) {
      const jitter = (Math.random() * 2 - 1) * this.config.latencyJitterMs;
      latency = Math.max(0, latency + jitter);
    }

    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return Array.from(this.records.keys());
  }

  /**
   * Get record count for a model
   */
  getRecordCount(model: string): number {
    return this.records.get(model)?.length ?? 0;
  }
}
