/**
 * Workload Replayer for vLLM
 * Replays recorded workloads for testing and capacity planning
 */

import type {
  ChatRequest,
  ChatResponse,
  InferenceRecord,
  ReplayConfig,
  ReplayResult,
  ReplayReport,
} from '../types/index.js';

export interface ReplayClient {
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
 * Workload replayer for testing and capacity planning
 */
export class WorkloadReplayer {
  private readonly client: ReplayClient;

  constructor(client: ReplayClient) {
    this.client = client;
  }

  /**
   * Replay a workload
   */
  async replay(
    workload: InferenceRecord[],
    config: ReplayConfig
  ): Promise<ReplayReport> {
    if (workload.length === 0) {
      return this.createEmptyReport();
    }

    const results: ReplayResult[] = [];
    const startTime = Date.now();
    const baseTimestamp = workload[0]!.timestamp;

    for (const record of workload) {
      // Calculate wait time based on original timing
      if (!config.skipWaits) {
        const originalWait = record.timestamp - baseTimestamp;
        const scaledWait = originalWait / config.speedMultiplier;
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, scaledWait - elapsed);

        if (waitTime > 0) {
          await this.sleep(waitTime);
        }
      }

      // Execute request
      const requestStart = Date.now();
      try {
        const response = await this.client.chatCompletion(record.request);
        const actualLatency = Date.now() - requestStart;

        results.push({
          success: true,
          expectedLatencyMs: record.latencyMs,
          actualLatencyMs: actualLatency,
          tokensMatch:
            response.usage.prompt_tokens === record.tokensIn &&
            response.usage.completion_tokens === record.tokensOut,
        });
      } catch (error) {
        const actualLatency = Date.now() - requestStart;

        if (config.stopOnError) {
          results.push({
            success: false,
            expectedLatencyMs: record.latencyMs,
            actualLatencyMs: actualLatency,
            tokensMatch: false,
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }

        results.push({
          success: false,
          expectedLatencyMs: record.latencyMs,
          actualLatencyMs: actualLatency,
          tokensMatch: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.analyzeResults(results, startTime);
  }

  /**
   * Replay at a fixed rate (for load testing)
   */
  async replayAtRate(
    workload: InferenceRecord[],
    requestsPerSecond: number,
    durationMs: number
  ): Promise<ReplayReport> {
    const results: ReplayResult[] = [];
    const startTime = Date.now();
    const intervalMs = 1000 / requestsPerSecond;
    let index = 0;

    while (Date.now() - startTime < durationMs) {
      const record = workload[index % workload.length]!;
      index++;

      const requestStart = Date.now();

      // Fire and collect (don't wait for response before sending next)
      this.client
        .chatCompletion(record.request)
        .then((response) => {
          const actualLatency = Date.now() - requestStart;
          results.push({
            success: true,
            expectedLatencyMs: record.latencyMs,
            actualLatencyMs: actualLatency,
            tokensMatch:
              response.usage.prompt_tokens === record.tokensIn &&
              response.usage.completion_tokens === record.tokensOut,
          });
        })
        .catch((error) => {
          const actualLatency = Date.now() - requestStart;
          results.push({
            success: false,
            expectedLatencyMs: record.latencyMs,
            actualLatencyMs: actualLatency,
            tokensMatch: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      await this.sleep(intervalMs);
    }

    // Wait for remaining requests to complete
    await this.sleep(5000);

    return this.analyzeResults(results, startTime);
  }

  private analyzeResults(results: ReplayResult[], startTime: number): ReplayReport {
    const totalTime = Date.now() - startTime;
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Calculate latency percentiles
    const latencies = successful
      .map((r) => r.actualLatencyMs)
      .sort((a, b) => a - b);

    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    return {
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      avgLatencyMs: avgLatency,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      throughputRequestsPerSec: (results.length / totalTime) * 1000,
      results,
    };
  }

  private createEmptyReport(): ReplayReport {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      throughputRequestsPerSec: 0,
      results: [],
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
