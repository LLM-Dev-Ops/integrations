/**
 * Credit Usage Tracker
 *
 * Tracks and retrieves Snowflake credit usage.
 * @module @llmdevops/snowflake-integration/cost/usage
 */

import type { CreditUsage } from '../types/index.js';
import { QueryError, ObjectNotFoundError } from '../errors/index.js';

/**
 * Interface for executing queries (to be injected).
 */
export interface QueryExecutor {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Credit usage tracker.
 */
export class CreditUsageTracker {
  constructor(private executor: QueryExecutor) {}

  /**
   * Gets credit usage for a specific time period.
   *
   * @param startDate - Start date for the period
   * @param endDate - End date for the period
   * @param warehouse - Optional warehouse filter
   * @returns Array of credit usage records
   */
  async getUsage(
    startDate: Date,
    endDate: Date,
    warehouse?: string
  ): Promise<CreditUsage[]> {
    try {
      const warehouseFilter = warehouse
        ? `AND WAREHOUSE_NAME = '${warehouse.replace(/'/g, "''")}'`
        : '';

      const sql = `
        SELECT
          USAGE_DATE as date,
          WAREHOUSE_NAME as warehouse,
          CREDITS_USED as creditsUsed,
          CREDITS_USED_COMPUTE as computeCredits,
          CREDITS_USED_CLOUD_SERVICES as cloudServicesCredits
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE USAGE_DATE >= ?
          AND USAGE_DATE <= ?
          ${warehouseFilter}
        ORDER BY USAGE_DATE DESC, WAREHOUSE_NAME
      `;

      const rows = await this.executor.execute<{
        date: string | Date;
        warehouse: string;
        creditsUsed: number;
        computeCredits: number | null;
        cloudServicesCredits: number | null;
      }>(sql, [startDate.toISOString(), endDate.toISOString()]);

      return rows.map((row) => ({
        date: typeof row.date === 'string' ? new Date(row.date) : row.date,
        warehouse: row.warehouse,
        creditsUsed: row.creditsUsed,
        computeCredits: row.computeCredits ?? undefined,
        cloudServicesCredits: row.cloudServicesCredits ?? undefined,
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new QueryError(`Failed to retrieve credit usage: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Gets credit usage for a specific day.
   *
   * @param date - The date to get usage for
   * @param warehouse - Optional warehouse filter
   * @returns Array of credit usage records for that day
   */
  async getDailyUsage(date: Date, warehouse?: string): Promise<CreditUsage[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getUsage(startOfDay, endOfDay, warehouse);
  }

  /**
   * Gets total credits used across all warehouses for a period.
   *
   * @param startDate - Start date for the period
   * @param endDate - End date for the period
   * @returns Total credits used
   */
  async getTotalCredits(startDate: Date, endDate: Date): Promise<number> {
    try {
      const sql = `
        SELECT
          SUM(CREDITS_USED) as totalCredits
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE USAGE_DATE >= ?
          AND USAGE_DATE <= ?
      `;

      const rows = await this.executor.execute<{
        totalCredits: number | null;
      }>(sql, [startDate.toISOString(), endDate.toISOString()]);

      return rows[0]?.totalCredits ?? 0;
    } catch (error) {
      if (error instanceof Error) {
        throw new QueryError(`Failed to retrieve total credits: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Gets credit usage broken down by warehouse.
   *
   * @param startDate - Start date for the period
   * @param endDate - End date for the period
   * @returns Map of warehouse name to total credits used
   */
  async getUsageByWarehouse(
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, number>> {
    try {
      const sql = `
        SELECT
          WAREHOUSE_NAME as warehouse,
          SUM(CREDITS_USED) as totalCredits
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE USAGE_DATE >= ?
          AND USAGE_DATE <= ?
        GROUP BY WAREHOUSE_NAME
        ORDER BY totalCredits DESC
      `;

      const rows = await this.executor.execute<{
        warehouse: string;
        totalCredits: number;
      }>(sql, [startDate.toISOString(), endDate.toISOString()]);

      const usageMap = new Map<string, number>();
      for (const row of rows) {
        usageMap.set(row.warehouse, row.totalCredits);
      }

      return usageMap;
    } catch (error) {
      if (error instanceof Error) {
        throw new QueryError(
          `Failed to retrieve usage by warehouse: ${error.message}`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Gets credit usage with compute and cloud services breakdown.
   *
   * @param startDate - Start date for the period
   * @param endDate - End date for the period
   * @param warehouse - Optional warehouse filter
   * @returns Aggregated credit usage with breakdown
   */
  async getDetailedUsage(
    startDate: Date,
    endDate: Date,
    warehouse?: string
  ): Promise<{
    totalCredits: number;
    computeCredits: number;
    cloudServicesCredits: number;
    byWarehouse: Map<
      string,
      {
        total: number;
        compute: number;
        cloudServices: number;
      }
    >;
  }> {
    try {
      const warehouseFilter = warehouse
        ? `AND WAREHOUSE_NAME = '${warehouse.replace(/'/g, "''")}'`
        : '';

      const sql = `
        SELECT
          WAREHOUSE_NAME as warehouse,
          SUM(CREDITS_USED) as totalCredits,
          SUM(CREDITS_USED_COMPUTE) as computeCredits,
          SUM(CREDITS_USED_CLOUD_SERVICES) as cloudServicesCredits
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE USAGE_DATE >= ?
          AND USAGE_DATE <= ?
          ${warehouseFilter}
        GROUP BY WAREHOUSE_NAME
      `;

      const rows = await this.executor.execute<{
        warehouse: string;
        totalCredits: number;
        computeCredits: number;
        cloudServicesCredits: number;
      }>(sql, [startDate.toISOString(), endDate.toISOString()]);

      let totalCredits = 0;
      let totalCompute = 0;
      let totalCloudServices = 0;
      const byWarehouse = new Map<
        string,
        {
          total: number;
          compute: number;
          cloudServices: number;
        }
      >();

      for (const row of rows) {
        totalCredits += row.totalCredits;
        totalCompute += row.computeCredits;
        totalCloudServices += row.cloudServicesCredits;

        byWarehouse.set(row.warehouse, {
          total: row.totalCredits,
          compute: row.computeCredits,
          cloudServices: row.cloudServicesCredits,
        });
      }

      return {
        totalCredits,
        computeCredits: totalCompute,
        cloudServicesCredits: totalCloudServices,
        byWarehouse,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new QueryError(
          `Failed to retrieve detailed usage: ${error.message}`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Gets credit usage trend over time.
   *
   * @param startDate - Start date for the period
   * @param endDate - End date for the period
   * @param warehouse - Optional warehouse filter
   * @returns Array of daily usage totals
   */
  async getUsageTrend(
    startDate: Date,
    endDate: Date,
    warehouse?: string
  ): Promise<
    Array<{
      date: Date;
      creditsUsed: number;
    }>
  > {
    try {
      const warehouseFilter = warehouse
        ? `AND WAREHOUSE_NAME = '${warehouse.replace(/'/g, "''")}'`
        : '';

      const sql = `
        SELECT
          USAGE_DATE as date,
          SUM(CREDITS_USED) as creditsUsed
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE USAGE_DATE >= ?
          AND USAGE_DATE <= ?
          ${warehouseFilter}
        GROUP BY USAGE_DATE
        ORDER BY USAGE_DATE
      `;

      const rows = await this.executor.execute<{
        date: string | Date;
        creditsUsed: number;
      }>(sql, [startDate.toISOString(), endDate.toISOString()]);

      return rows.map((row) => ({
        date: typeof row.date === 'string' ? new Date(row.date) : row.date,
        creditsUsed: row.creditsUsed,
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new QueryError(`Failed to retrieve usage trend: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
