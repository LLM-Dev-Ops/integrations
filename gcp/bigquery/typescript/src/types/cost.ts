/**
 * Cost estimation and billing types for BigQuery.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

/**
 * Cost estimate for a query before execution.
 */
export interface CostEstimate {
  /** Bytes that will be processed. */
  bytesProcessed: bigint;

  /** Bytes that will be billed (rounded up to minimum). */
  bytesBilled: bigint;

  /** Estimated cost in USD. */
  estimatedCostUsd: number;

  /** Slot milliseconds (if available). */
  slotMs?: bigint;

  /** Whether this query would hit the cache. */
  cacheHit: boolean;
}

/**
 * Actual cost for a completed job.
 */
export interface JobCost {
  /** Job ID. */
  jobId: string;

  /** Bytes actually processed. */
  bytesProcessed: bigint;

  /** Bytes actually billed. */
  bytesBilled: bigint;

  /** Actual cost in USD. */
  actualCostUsd: number;

  /** Slot milliseconds used. */
  slotMs: bigint;

  /** Total bytes processed (same as bytesProcessed, for compatibility). */
  totalBytesProcessed: bigint;

  /** Whether the query hit the cache. */
  cacheHit: boolean;
}

/**
 * BigQuery pricing configuration.
 */
export interface BigQueryPricing {
  /** On-demand price per TB (default: $5.00). */
  onDemandPerTb: number;

  /** Streaming insert price per 200MB (default: $0.01). */
  streamingPer200Mb: number;

  /** Active storage price per GB per month (default: $0.02). */
  storageActivePerGb: number;

  /** Long-term storage price per GB per month (default: $0.01). */
  storageLongTermPerGb: number;
}

/**
 * Default BigQuery pricing (as of 2025).
 */
export const DEFAULT_BIGQUERY_PRICING: BigQueryPricing = {
  onDemandPerTb: 5.0,
  streamingPer200Mb: 0.01,
  storageActivePerGb: 0.02,
  storageLongTermPerGb: 0.01,
};

/**
 * Calculate cost in USD for bytes processed.
 *
 * @param bytesProcessed - Bytes processed by the query.
 * @param pricing - Pricing configuration (optional, uses defaults if not provided).
 * @returns Estimated cost in USD.
 */
export function calculateQueryCost(
  bytesProcessed: bigint,
  pricing: BigQueryPricing = DEFAULT_BIGQUERY_PRICING
): number {
  // BigQuery rounds up to minimum 10MB per query
  const minBytes = BigInt(10 * 1024 * 1024); // 10 MB
  const billableBytes = bytesProcessed < minBytes ? minBytes : bytesProcessed;

  // Convert to TB and multiply by price
  const bytesPerTb = BigInt(1024) * BigInt(1024) * BigInt(1024) * BigInt(1024);
  const tbProcessed = Number(billableBytes) / Number(bytesPerTb);

  return tbProcessed * pricing.onDemandPerTb;
}

/**
 * Calculate bytes billed (rounded up to 10MB minimum).
 *
 * @param bytesProcessed - Bytes processed by the query.
 * @returns Bytes that will be billed.
 */
export function calculateBytesBilled(bytesProcessed: bigint): bigint {
  const minBytes = BigInt(10 * 1024 * 1024); // 10 MB
  return bytesProcessed < minBytes ? minBytes : bytesProcessed;
}

/**
 * Calculate streaming insert cost in USD.
 *
 * @param bytes - Bytes streamed.
 * @param pricing - Pricing configuration (optional, uses defaults if not provided).
 * @returns Cost in USD.
 */
export function calculateStreamingCost(
  bytes: bigint,
  pricing: BigQueryPricing = DEFAULT_BIGQUERY_PRICING
): number {
  const bytes200Mb = BigInt(200 * 1024 * 1024);
  const units = Number(bytes) / Number(bytes200Mb);
  return units * pricing.streamingPer200Mb;
}

/**
 * Calculate storage cost in USD per month.
 *
 * @param bytes - Bytes stored.
 * @param isLongTerm - Whether this is long-term storage (>90 days).
 * @param pricing - Pricing configuration (optional, uses defaults if not provided).
 * @returns Cost in USD per month.
 */
export function calculateStorageCost(
  bytes: bigint,
  isLongTerm: boolean = false,
  pricing: BigQueryPricing = DEFAULT_BIGQUERY_PRICING
): number {
  const bytesPerGb = BigInt(1024 * 1024 * 1024);
  const gbStored = Number(bytes) / Number(bytesPerGb);
  const pricePerGb = isLongTerm ? pricing.storageLongTermPerGb : pricing.storageActivePerGb;
  return gbStored * pricePerGb;
}

/**
 * Format bytes as human-readable string (KB, MB, GB, TB).
 */
export function formatBytes(bytes: bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = Number(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format cost as USD currency string.
 */
export function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
}

/**
 * Parse cost estimate from BigQuery dry-run response.
 */
export function parseCostEstimate(
  json: Record<string, unknown>,
  pricing: BigQueryPricing = DEFAULT_BIGQUERY_PRICING
): CostEstimate {
  const bytesProcessed = BigInt(json.totalBytesProcessed as string);
  const bytesBilled = calculateBytesBilled(bytesProcessed);
  const estimatedCostUsd = calculateQueryCost(bytesProcessed, pricing);
  const cacheHit = (json.cacheHit as boolean) ?? false;

  return {
    bytesProcessed,
    bytesBilled,
    estimatedCostUsd,
    slotMs: json.totalSlotMs ? BigInt(json.totalSlotMs as string) : undefined,
    cacheHit,
  };
}

/**
 * Parse job cost from completed BigQuery job statistics.
 */
export function parseJobCost(
  jobId: string,
  statistics: Record<string, unknown>,
  pricing: BigQueryPricing = DEFAULT_BIGQUERY_PRICING
): JobCost {
  const bytesProcessed = BigInt((statistics.totalBytesProcessed as string) ?? "0");
  const bytesBilled = BigInt((statistics.totalBytesBilled as string) ?? "0");
  const actualCostUsd = calculateQueryCost(bytesBilled, pricing);
  const slotMs = BigInt((statistics.totalSlotMs as string) ?? "0");
  const cacheHit = (statistics.cacheHit as boolean) ?? false;

  return {
    jobId,
    bytesProcessed,
    bytesBilled,
    actualCostUsd,
    slotMs,
    totalBytesProcessed: bytesProcessed,
    cacheHit,
  };
}
