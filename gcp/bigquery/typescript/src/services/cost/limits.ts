/**
 * Limit enforcement utilities for cost control.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import { QueryError } from "../../error/index.js";
import { ByteLimitConfig } from "./types.js";

/**
 * Create a limit checker function from configuration.
 *
 * Returns a function that checks if bytes exceed configured limits
 * and throws or warns appropriately.
 *
 * @param config - Byte limit configuration
 * @returns Limit checker function
 */
export function createLimitChecker(
  config: ByteLimitConfig
): (bytes: bigint) => void {
  return (bytes: bigint) => {
    // Check abort limit first (highest priority)
    if (config.abortAtBytes !== undefined && bytes > config.abortAtBytes) {
      throw new QueryError(
        `Query would process ${formatBytes(bytes)}, exceeding abort limit of ${formatBytes(config.abortAtBytes)}`,
        "BytesExceeded"
      );
    }

    // Check maximum bytes billed
    if (config.maximumBytesBilled !== undefined && bytes > config.maximumBytesBilled) {
      throw new QueryError(
        `Query would process ${formatBytes(bytes)}, exceeding maximum billed limit of ${formatBytes(config.maximumBytesBilled)}`,
        "BytesExceeded"
      );
    }

    // Check warning threshold (log but don't throw)
    if (config.warnAtBytes !== undefined && bytes > config.warnAtBytes) {
      console.warn(
        `[BigQuery Cost Warning] Query will process ${formatBytes(bytes)}, exceeding warning threshold of ${formatBytes(config.warnAtBytes)}`
      );
    }
  };
}

/**
 * Format bytes as a human-readable string.
 *
 * Converts byte count to appropriate units (B, KB, MB, GB, TB, PB).
 *
 * @param bytes - Byte count
 * @returns Human-readable string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = Number(bytes);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  // Format with 2 decimal places for larger units
  if (unitIndex > 0) {
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  return `${size} ${units[unitIndex]}`;
}
