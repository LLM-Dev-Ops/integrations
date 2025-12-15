/**
 * Load Generator for vLLM
 * Generates synthetic load for testing and capacity planning
 */

import type {
  ChatRequest,
  ChatResponse,
  LoadGenConfig,
  LoadGenReport,
} from '../types/index.js';

export interface LoadGenClient {
  chatCompletion(request: ChatRequest): Promise<ChatResponse>;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)]!;
}

/**
 * Load generator for synthetic workloads
 */
export class LoadGenerator {
  private readonly client: LoadGenClient;

  constructor(client: LoadGenClient) {
    this.client = client;
  }

  /**
   * Generate load with configurable parameters
   */
  async generate(config: LoadGenConfig): Promise<LoadGenReport> {
    const results: {
      success: boolean;
      latencyMs: number;
      error?: string;
    }[] = [];
    const errors: Record<string, number> = {};

    const startTime = Date.now();
    const endTime = startTime + config.durationMs;
    const intervalMs = 1000 / config.targetRps;

    // Warmup phase
    if (config.warmupMs > 0) {
      await this.warmup(config);
    }

    // Ramp-up phase
    let currentRps = config.targetRps;
    if (config.rampUpMs > 0) {
      currentRps = config.targetRps * 0.1; // Start at 10%
    }

    const rampUpEndTime = startTime + config.rampUpMs;

    while (Date.now() < endTime) {
      // Adjust RPS during ramp-up
      if (Date.now() < rampUpEndTime) {
        const progress = (Date.now() - startTime) / config.rampUpMs;
        currentRps = config.targetRps * (0.1 + 0.9 * progress);
      } else {
        currentRps = config.targetRps;
      }

      const currentInterval = 1000 / currentRps;

      // Generate request
      const request = this.generateRequest(config);
      const requestStart = Date.now();

      this.client
        .chatCompletion(request)
        .then(() => {
          const latency = Date.now() - requestStart;
          results.push({ success: true, latencyMs: latency });
        })
        .catch((error) => {
          const latency = Date.now() - requestStart;
          const errorType = this.classifyError(error);
          results.push({
            success: false,
            latencyMs: latency,
            error: errorType,
          });
          errors[errorType] = (errors[errorType] ?? 0) + 1;
        });

      await this.sleep(currentInterval);
    }

    // Wait for remaining requests
    await this.sleep(5000);

    return this.analyzeResults(results, errors, startTime, config);
  }

  private async warmup(config: LoadGenConfig): Promise<void> {
    // Send a few requests to warm up connections
    const warmupRequests = Math.min(10, config.targetRps);

    for (let i = 0; i < warmupRequests; i++) {
      const request = this.generateRequest(config);
      try {
        await this.client.chatCompletion(request);
      } catch {
        // Ignore warmup errors
      }
    }
  }

  private generateRequest(config: LoadGenConfig): ChatRequest {
    // Generate a request based on the template
    const prompt = config.promptTemplate
      .replace('{random}', Math.random().toString(36).substring(7))
      .replace('{timestamp}', Date.now().toString());

    return {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: config.maxTokens,
      temperature: 0.7,
    };
  }

  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return 'timeout';
      }
      if (error.message.includes('rate limit')) {
        return 'rate_limit';
      }
      if (error.message.includes('connection')) {
        return 'connection';
      }
      if (error.message.includes('server')) {
        return 'server_error';
      }
      return error.name || 'unknown';
    }
    return 'unknown';
  }

  private analyzeResults(
    results: { success: boolean; latencyMs: number; error?: string }[],
    errors: Record<string, number>,
    startTime: number,
    config: LoadGenConfig
  ): LoadGenReport {
    const totalTime = Date.now() - startTime;
    const successful = results.filter((r) => r.success);

    const latencies = successful
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);

    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    const successRate =
      results.length > 0 ? successful.length / results.length : 0;

    return {
      actualRps: (results.length / totalTime) * 1000,
      totalRequests: results.length,
      successRate,
      avgLatencyMs: avgLatency,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      errors,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
