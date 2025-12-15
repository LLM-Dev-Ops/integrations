/**
 * Cost tracking and management service for BigQuery.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import { BigQueryConfig } from "../../config/index.js";
import { QueryError } from "../../error/index.js";
import { CostEstimate, CostMetrics, ByteLimitConfig } from "./types.js";
import { createLimitChecker, formatBytes } from "./limits.js";

/**
 * BigQuery pricing constants (as of 2024).
 *
 * On-demand pricing for US multi-region:
 * - First 1 TB per month: Free
 * - After 1 TB: $6.25 per TB
 * - Minimum billing: 10 MB per query
 * - Cache hits: Free
 */
const PRICE_PER_TB_USD = 6.25;
const FREE_TIER_BYTES = 1024n * 1024n * 1024n * 1024n; // 1 TB
const MINIMUM_BILLING_BYTES = 10n * 1024n * 1024n; // 10 MB
const BYTES_PER_TB = 1024n * 1024n * 1024n * 1024n; // 1 TB

/**
 * Cost tracking service for BigQuery operations.
 *
 * Provides cost estimation, limit enforcement, and metrics tracking.
 */
export class CostService {
  private metrics: CostMetrics;
  private readonly config: BigQueryConfig;

  /**
   * Create a new CostService instance.
   *
   * @param config - BigQuery configuration
   */
  constructor(config: BigQueryConfig) {
    this.config = config;
    this.metrics = {
      queriesExecuted: 0,
      totalBytesProcessed: 0n,
      totalBytesBilled: 0n,
      estimatedTotalCostUsd: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Estimate cost from bytes processed.
   *
   * Applies BigQuery pricing rules:
   * - Minimum 10 MB billing per query
   * - $6.25 per TB (US multi-region)
   * - Cache hits are free
   *
   * @param bytesProcessed - Number of bytes that will be processed
   * @param cacheHit - Whether this is a cache hit (default: false)
   * @returns Cost estimate
   */
  estimateCost(bytesProcessed: bigint, cacheHit: boolean = false): CostEstimate {
    // Cache hits are free
    if (cacheHit) {
      return {
        totalBytesProcessed: bytesProcessed,
        totalBytesBilled: 0n,
        estimatedCostUsd: 0,
        cacheHit: true,
      };
    }

    // Apply minimum 10 MB billing
    const bytesBilled =
      bytesProcessed < MINIMUM_BILLING_BYTES ? MINIMUM_BILLING_BYTES : bytesProcessed;

    // Calculate cost: (bytes / TB) * price_per_TB
    // Convert to number for floating-point division
    const tbProcessed = Number(bytesBilled) / Number(BYTES_PER_TB);
    const estimatedCostUsd = tbProcessed * PRICE_PER_TB_USD;

    return {
      totalBytesProcessed: bytesProcessed,
      totalBytesBilled: bytesBilled,
      estimatedCostUsd,
      cacheHit: false,
    };
  }

  /**
   * Check if bytes processed exceed configured limits.
   *
   * Throws QueryError.BytesExceeded if abortAtBytes or maximumBytesBilled exceeded.
   * Logs warning if warnAtBytes exceeded.
   *
   * @param bytesProcessed - Number of bytes to check
   * @param limit - Limit configuration
   * @throws QueryError if limit exceeded
   */
  checkLimit(bytesProcessed: bigint, limit: ByteLimitConfig): void {
    const checker = createLimitChecker(limit);
    checker(bytesProcessed);
  }

  /**
   * Track query execution metrics.
   *
   * Updates accumulated metrics with query statistics.
   *
   * @param stats - Query statistics
   */
  trackQuery(stats: {
    totalBytesProcessed: bigint;
    totalBytesBilled: bigint;
    cacheHit: boolean;
  }): void {
    this.metrics.queriesExecuted++;
    this.metrics.totalBytesProcessed += stats.totalBytesProcessed;
    this.metrics.totalBytesBilled += stats.totalBytesBilled;

    if (stats.cacheHit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
      // Only add cost for non-cache hits
      const estimate = this.estimateCost(stats.totalBytesProcessed, false);
      this.metrics.estimatedTotalCostUsd += estimate.estimatedCostUsd;
    }
  }

  /**
   * Get accumulated cost metrics.
   *
   * @returns Current metrics
   */
  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset all accumulated metrics.
   *
   * Useful for starting fresh tracking periods.
   */
  resetMetrics(): void {
    this.metrics = {
      queriesExecuted: 0,
      totalBytesProcessed: 0n,
      totalBytesBilled: 0n,
      estimatedTotalCostUsd: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Get the global byte limit from config.
   *
   * @returns Maximum bytes billed from configuration
   */
  getGlobalLimit(): bigint | undefined {
    return this.config.maximumBytesBilled;
  }

  /**
   * Check if bytes would exceed the global limit.
   *
   * @param bytesProcessed - Number of bytes to check
   * @throws QueryError if global limit exceeded
   */
  checkGlobalLimit(bytesProcessed: bigint): void {
    if (this.config.maximumBytesBilled !== undefined) {
      if (bytesProcessed > this.config.maximumBytesBilled) {
        const estimate = this.estimateCost(bytesProcessed, false);
        const limitEstimate = this.estimateCost(this.config.maximumBytesBilled, false);

        throw new QueryError(
          `Query would process ${formatBytes(bytesProcessed)} (est. $${estimate.estimatedCostUsd.toFixed(4)}), ` +
            `exceeding configured limit of ${formatBytes(this.config.maximumBytesBilled)} ` +
            `(est. $${limitEstimate.estimatedCostUsd.toFixed(4)})`,
          "BytesExceeded"
        );
      }
    }
  }
}
