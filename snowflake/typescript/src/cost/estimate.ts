/**
 * Query Cost Estimator
 *
 * Estimates query costs before execution.
 * @module @llmdevops/snowflake-integration/cost/estimate
 */

import type { CostEstimate, QueryStatistics, WarehouseSize } from '../types/index.js';
import { QueryError } from '../errors/index.js';

/**
 * Interface for executing queries (to be injected).
 */
export interface QueryExecutor {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Warehouse size to credits per second mapping.
 * Based on Snowflake's credit consumption rates.
 */
const WAREHOUSE_CREDITS_PER_SECOND: Record<WarehouseSize, number> = {
  'X-Small': 1 / 3600, // 1 credit per hour
  'Small': 2 / 3600, // 2 credits per hour
  'Medium': 4 / 3600, // 4 credits per hour
  'Large': 8 / 3600, // 8 credits per hour
  'X-Large': 16 / 3600, // 16 credits per hour
  '2X-Large': 32 / 3600, // 32 credits per hour
  '3X-Large': 64 / 3600, // 64 credits per hour
  '4X-Large': 128 / 3600, // 128 credits per hour
  '5X-Large': 256 / 3600, // 256 credits per hour
  '6X-Large': 512 / 3600, // 512 credits per hour
};

/**
 * Query cost estimator.
 */
export class QueryCostEstimator {
  constructor(private executor: QueryExecutor) {}

  /**
   * Estimates the cost of a query before execution.
   *
   * @param sql - SQL query to estimate
   * @param warehouse - Warehouse name to use for estimation
   * @returns Cost estimate
   */
  async estimate(sql: string, warehouse: string): Promise<CostEstimate> {
    try {
      // Use EXPLAIN to get query plan
      const explainSql = `EXPLAIN ${sql}`;
      const explainRows = await this.executor.execute<{
        step?: string;
        id?: number;
        parent?: number;
        operation?: string;
        objects?: string;
        expressions?: string;
        partitionsTotal?: number;
        partitionsAssigned?: number;
        bytesAssigned?: number;
      }>(explainSql);

      // Parse EXPLAIN output
      const explainData = this.parseExplainOutput(explainRows);

      // Get warehouse size for credit calculation
      const warehouseSize = await this.getWarehouseSize(warehouse);

      // Estimate execution time based on bytes and partitions
      const estimatedTimeSeconds = this.estimateExecutionTime(
        explainData.bytesToScan,
        explainData.partitionsToScan,
        warehouseSize
      );

      // Calculate credits
      const estimatedCredits = this.calculateCredits(
        explainData.bytesToScan,
        estimatedTimeSeconds,
        warehouseSize
      );

      // Determine confidence level
      const confidence = this.determineConfidence(explainData, estimatedTimeSeconds);

      return {
        estimatedCredits,
        partitionsToScan: explainData.partitionsToScan,
        partitionsTotal: explainData.partitionsTotal,
        bytesToScan: explainData.bytesToScan,
        estimatedTimeSeconds,
        confidence,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new QueryError(`Failed to estimate query cost: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Parses EXPLAIN output to extract cost information.
   *
   * @param output - EXPLAIN query results
   * @returns Parsed cost information
   */
  parseExplainOutput(output: unknown[]): {
    partitionsToScan: number;
    partitionsTotal: number;
    bytesToScan: number;
    operations: string[];
  } {
    let partitionsToScan = 0;
    let partitionsTotal = 0;
    let bytesToScan = 0;
    const operations: string[] = [];

    for (const row of output) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }

      const record = row as {
        step?: string;
        operation?: string;
        partitionsTotal?: number;
        partitionsAssigned?: number;
        bytesAssigned?: number;
      };

      // Extract operation
      if (record.operation) {
        operations.push(record.operation);
      }

      // Accumulate partitions and bytes
      if (record.partitionsTotal !== undefined) {
        partitionsTotal = Math.max(partitionsTotal, record.partitionsTotal);
      }
      if (record.partitionsAssigned !== undefined) {
        partitionsToScan += record.partitionsAssigned;
      }
      if (record.bytesAssigned !== undefined) {
        bytesToScan += record.bytesAssigned;
      }
    }

    return {
      partitionsToScan,
      partitionsTotal: partitionsTotal || partitionsToScan,
      bytesToScan,
      operations,
    };
  }

  /**
   * Calculates estimated credits based on query characteristics.
   *
   * @param bytesScanned - Number of bytes to scan
   * @param executionTime - Estimated execution time in seconds
   * @param warehouseSize - Warehouse size
   * @returns Estimated credits
   */
  calculateCredits(
    bytesScanned: number,
    executionTime: number,
    warehouseSize: WarehouseSize
  ): number {
    const creditsPerSecond = WAREHOUSE_CREDITS_PER_SECOND[warehouseSize];

    // Base credit calculation on execution time
    let credits = executionTime * creditsPerSecond;

    // Add overhead for very small queries (minimum billing)
    // Snowflake has a minimum charge of 60 seconds
    const minBillingSeconds = 60;
    if (executionTime < minBillingSeconds) {
      credits = minBillingSeconds * creditsPerSecond;
    }

    // Add factor for data volume (larger scans may require more time)
    const bytesInGB = bytesScanned / (1024 * 1024 * 1024);
    const dataVolumeFactor = Math.log10(Math.max(1, bytesInGB)) * 0.1;
    credits *= 1 + dataVolumeFactor;

    return Math.max(credits, 0.001); // Minimum of 0.001 credits
  }

  /**
   * Gets the warehouse size.
   *
   * @param warehouse - Warehouse name
   * @returns Warehouse size
   */
  private async getWarehouseSize(warehouse: string): Promise<WarehouseSize> {
    try {
      const sql = `SHOW WAREHOUSES LIKE '${warehouse.replace(/'/g, "''")}'`;
      const rows = await this.executor.execute<{
        name?: string;
        size?: string;
      }>(sql);

      if (rows.length === 0 || !rows[0]) {
        // Default to Medium if warehouse not found
        return 'Medium';
      }

      const size = rows[0].size;
      if (this.isValidWarehouseSize(size)) {
        return size;
      }

      return 'Medium';
    } catch (error) {
      // Default to Medium on error
      return 'Medium';
    }
  }

  /**
   * Type guard for WarehouseSize.
   */
  private isValidWarehouseSize(size: unknown): size is WarehouseSize {
    const validSizes: WarehouseSize[] = [
      'X-Small',
      'Small',
      'Medium',
      'Large',
      'X-Large',
      '2X-Large',
      '3X-Large',
      '4X-Large',
      '5X-Large',
      '6X-Large',
    ];
    return typeof size === 'string' && validSizes.includes(size as WarehouseSize);
  }

  /**
   * Estimates execution time based on query characteristics.
   *
   * @param bytesToScan - Bytes to scan
   * @param partitionsToScan - Partitions to scan
   * @param warehouseSize - Warehouse size
   * @returns Estimated time in seconds
   */
  private estimateExecutionTime(
    bytesToScan: number,
    partitionsToScan: number,
    warehouseSize: WarehouseSize
  ): number {
    // Base throughput estimates (bytes per second) by warehouse size
    const throughputEstimates: Record<WarehouseSize, number> = {
      'X-Small': 50 * 1024 * 1024, // 50 MB/s
      'Small': 100 * 1024 * 1024, // 100 MB/s
      'Medium': 200 * 1024 * 1024, // 200 MB/s
      'Large': 400 * 1024 * 1024, // 400 MB/s
      'X-Large': 800 * 1024 * 1024, // 800 MB/s
      '2X-Large': 1600 * 1024 * 1024, // 1.6 GB/s
      '3X-Large': 3200 * 1024 * 1024, // 3.2 GB/s
      '4X-Large': 6400 * 1024 * 1024, // 6.4 GB/s
      '5X-Large': 12800 * 1024 * 1024, // 12.8 GB/s
      '6X-Large': 25600 * 1024 * 1024, // 25.6 GB/s
    };

    const throughput = throughputEstimates[warehouseSize];

    // Base time from data volume
    let estimatedSeconds = bytesToScan / throughput;

    // Add overhead for partition processing (each partition has overhead)
    const partitionOverhead = partitionsToScan * 0.1; // 100ms per partition
    estimatedSeconds += partitionOverhead;

    // Add compilation and initialization overhead
    const compilationOverhead = 2; // 2 seconds base overhead
    estimatedSeconds += compilationOverhead;

    return Math.max(1, estimatedSeconds); // Minimum 1 second
  }

  /**
   * Determines confidence level of estimate.
   *
   * @param explainData - Parsed EXPLAIN data
   * @param estimatedTime - Estimated execution time
   * @returns Confidence level
   */
  private determineConfidence(
    explainData: {
      partitionsToScan: number;
      partitionsTotal: number;
      bytesToScan: number;
      operations: string[];
    },
    estimatedTime: number
  ): 'low' | 'medium' | 'high' {
    let confidenceScore = 0;

    // Factor 1: Data availability
    if (explainData.bytesToScan > 0) {
      confidenceScore += 30;
    }

    // Factor 2: Partition info
    if (explainData.partitionsTotal > 0) {
      confidenceScore += 30;
    }

    // Factor 3: Operation complexity
    const complexOps = ['JOIN', 'AGGREGATE', 'WINDOW', 'UNION'];
    const hasComplexOps = explainData.operations.some((op) =>
      complexOps.some((complexOp) => op.toUpperCase().includes(complexOp))
    );
    if (!hasComplexOps) {
      confidenceScore += 20;
    } else {
      confidenceScore += 10;
    }

    // Factor 4: Estimated time reasonableness
    if (estimatedTime > 0 && estimatedTime < 3600) {
      // Less than 1 hour
      confidenceScore += 20;
    } else if (estimatedTime >= 3600) {
      // Very long queries are harder to estimate
      confidenceScore += 5;
    }

    if (confidenceScore >= 70) {
      return 'high';
    } else if (confidenceScore >= 40) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Estimates cost from query statistics (post-execution).
   *
   * @param stats - Query statistics
   * @param warehouseSize - Warehouse size used
   * @returns Estimated credits used
   */
  estimateFromStatistics(
    stats: QueryStatistics,
    warehouseSize: WarehouseSize
  ): number {
    const executionTimeSeconds = stats.executionTimeMs / 1000;
    return this.calculateCredits(stats.bytesScanned, executionTimeSeconds, warehouseSize);
  }
}
