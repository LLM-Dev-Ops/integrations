/**
 * Cost Alert Manager
 *
 * Manages cost alerts and thresholds.
 * @module @llmdevops/snowflake-integration/cost/alerts
 */

import type { CostEstimate } from '../types/index.js';
import type { CostConfig } from '../config/index.js';

/**
 * Alert severity level.
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Cost alert event.
 */
export interface CostAlert {
  /** Alert timestamp */
  timestamp: Date;
  /** Alert severity */
  severity: AlertSeverity;
  /** Alert message */
  message: string;
  /** Estimated credits */
  estimatedCredits: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Query SQL (if available) */
  sql?: string;
  /** Query ID (if available) */
  queryId?: string;
}

/**
 * Alert callback function type.
 */
export type AlertCallback = (alert: CostAlert) => void | Promise<void>;

/**
 * Cost alert manager.
 */
export class CostAlertManager {
  private thresholdCredits: number | null = null;
  private dailyLimit: number | null = null;
  private monthlyLimit: number | null = null;
  private callbacks: Set<AlertCallback> = new Set();
  private alertHistory: CostAlert[] = [];
  private readonly maxHistorySize = 1000;
  private currentDailyUsage = 0;
  private currentMonthlyUsage = 0;
  private lastResetDate: Date = new Date();

  /**
   * Creates a new cost alert manager.
   *
   * @param config - Optional cost configuration
   */
  constructor(config?: CostConfig) {
    if (config?.alertThresholdCredits) {
      this.thresholdCredits = config.alertThresholdCredits;
    }
    if (config?.queryCostLimit) {
      this.thresholdCredits = config.queryCostLimit;
    }
  }

  /**
   * Sets the alert threshold for individual queries.
   *
   * @param credits - Credit threshold
   */
  setThreshold(credits: number): void {
    if (credits < 0) {
      throw new Error('Threshold must be non-negative');
    }
    this.thresholdCredits = credits;
  }

  /**
   * Gets the current alert threshold.
   *
   * @returns Current threshold or null if not set
   */
  getThreshold(): number | null {
    return this.thresholdCredits;
  }

  /**
   * Sets a daily credit limit.
   *
   * @param credits - Daily credit limit
   */
  setDailyLimit(credits: number): void {
    if (credits < 0) {
      throw new Error('Daily limit must be non-negative');
    }
    this.dailyLimit = credits;
  }

  /**
   * Sets a monthly credit limit.
   *
   * @param credits - Monthly credit limit
   */
  setMonthlyLimit(credits: number): void {
    if (credits < 0) {
      throw new Error('Monthly limit must be non-negative');
    }
    this.monthlyLimit = credits;
  }

  /**
   * Checks if a query cost estimate would exceed the threshold.
   *
   * @param estimate - Cost estimate to check
   * @param sql - Optional SQL query text
   * @param queryId - Optional query ID
   * @returns True if threshold would be exceeded
   */
  checkQueryCost(estimate: CostEstimate, sql?: string, queryId?: string): boolean {
    this.resetIfNeeded();

    let exceeded = false;

    // Check individual query threshold
    if (this.thresholdCredits !== null && estimate.estimatedCredits > this.thresholdCredits) {
      this.triggerAlert({
        timestamp: new Date(),
        severity: 'warning',
        message: `Query estimated to cost ${estimate.estimatedCredits.toFixed(3)} credits, exceeding threshold of ${this.thresholdCredits.toFixed(3)} credits`,
        estimatedCredits: estimate.estimatedCredits,
        threshold: this.thresholdCredits,
        sql,
        queryId,
      });
      exceeded = true;
    }

    // Check daily limit
    if (this.dailyLimit !== null) {
      const projectedDailyUsage = this.currentDailyUsage + estimate.estimatedCredits;
      if (projectedDailyUsage > this.dailyLimit) {
        this.triggerAlert({
          timestamp: new Date(),
          severity: 'critical',
          message: `Query would push daily usage to ${projectedDailyUsage.toFixed(3)} credits, exceeding daily limit of ${this.dailyLimit.toFixed(3)} credits`,
          estimatedCredits: estimate.estimatedCredits,
          threshold: this.dailyLimit,
          sql,
          queryId,
        });
        exceeded = true;
      } else if (projectedDailyUsage > this.dailyLimit * 0.8) {
        // Warning at 80%
        this.triggerAlert({
          timestamp: new Date(),
          severity: 'warning',
          message: `Daily usage approaching limit: ${projectedDailyUsage.toFixed(3)} / ${this.dailyLimit.toFixed(3)} credits (${((projectedDailyUsage / this.dailyLimit) * 100).toFixed(1)}%)`,
          estimatedCredits: estimate.estimatedCredits,
          threshold: this.dailyLimit,
          sql,
          queryId,
        });
      }
    }

    // Check monthly limit
    if (this.monthlyLimit !== null) {
      const projectedMonthlyUsage = this.currentMonthlyUsage + estimate.estimatedCredits;
      if (projectedMonthlyUsage > this.monthlyLimit) {
        this.triggerAlert({
          timestamp: new Date(),
          severity: 'critical',
          message: `Query would push monthly usage to ${projectedMonthlyUsage.toFixed(3)} credits, exceeding monthly limit of ${this.monthlyLimit.toFixed(3)} credits`,
          estimatedCredits: estimate.estimatedCredits,
          threshold: this.monthlyLimit,
          sql,
          queryId,
        });
        exceeded = true;
      } else if (projectedMonthlyUsage > this.monthlyLimit * 0.8) {
        // Warning at 80%
        this.triggerAlert({
          timestamp: new Date(),
          severity: 'warning',
          message: `Monthly usage approaching limit: ${projectedMonthlyUsage.toFixed(3)} / ${this.monthlyLimit.toFixed(3)} credits (${((projectedMonthlyUsage / this.monthlyLimit) * 100).toFixed(1)}%)`,
          estimatedCredits: estimate.estimatedCredits,
          threshold: this.monthlyLimit,
          sql,
          queryId,
        });
      }
    }

    return exceeded;
  }

  /**
   * Records actual credit usage for tracking against limits.
   *
   * @param credits - Credits used
   */
  recordUsage(credits: number): void {
    this.resetIfNeeded();
    this.currentDailyUsage += credits;
    this.currentMonthlyUsage += credits;
  }

  /**
   * Registers a callback to be invoked when threshold is exceeded.
   *
   * @param callback - Callback function
   */
  onThresholdExceeded(callback: AlertCallback): void {
    this.callbacks.add(callback);
  }

  /**
   * Removes a callback.
   *
   * @param callback - Callback function to remove
   */
  offThresholdExceeded(callback: AlertCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * Removes all callbacks.
   */
  clearCallbacks(): void {
    this.callbacks.clear();
  }

  /**
   * Gets the alert history.
   *
   * @param limit - Optional limit on number of alerts to return
   * @returns Array of alerts, most recent first
   */
  getAlertHistory(limit?: number): CostAlert[] {
    const history = [...this.alertHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Gets alerts filtered by severity.
   *
   * @param severity - Severity level to filter by
   * @param limit - Optional limit on number of alerts
   * @returns Filtered alerts
   */
  getAlertsBySeverity(severity: AlertSeverity, limit?: number): CostAlert[] {
    const filtered = this.alertHistory
      .filter((alert) => alert.severity === severity)
      .reverse();
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Clears the alert history.
   */
  clearHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Gets current usage statistics.
   *
   * @returns Usage statistics
   */
  getUsageStats(): {
    dailyUsage: number;
    dailyLimit: number | null;
    dailyPercentage: number | null;
    monthlyUsage: number;
    monthlyLimit: number | null;
    monthlyPercentage: number | null;
  } {
    this.resetIfNeeded();

    return {
      dailyUsage: this.currentDailyUsage,
      dailyLimit: this.dailyLimit,
      dailyPercentage:
        this.dailyLimit !== null ? (this.currentDailyUsage / this.dailyLimit) * 100 : null,
      monthlyUsage: this.currentMonthlyUsage,
      monthlyLimit: this.monthlyLimit,
      monthlyPercentage:
        this.monthlyLimit !== null
          ? (this.currentMonthlyUsage / this.monthlyLimit) * 100
          : null,
    };
  }

  /**
   * Resets usage counters if needed (daily/monthly rollover).
   */
  private resetIfNeeded(): void {
    const now = new Date();
    const lastReset = this.lastResetDate;

    // Check if we've crossed into a new day
    if (
      now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    ) {
      this.currentDailyUsage = 0;
    }

    // Check if we've crossed into a new month
    if (
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    ) {
      this.currentMonthlyUsage = 0;
    }

    this.lastResetDate = now;
  }

  /**
   * Triggers an alert.
   *
   * @param alert - Alert to trigger
   */
  private triggerAlert(alert: CostAlert): void {
    // Add to history
    this.alertHistory.push(alert);

    // Trim history if needed
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }

    // Notify callbacks
    this.callbacks.forEach((callback) => {
      try {
        const result = callback(alert);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error('Error in alert callback:', error);
          });
        }
      } catch (error) {
        console.error('Error in alert callback:', error);
      }
    });
  }

  /**
   * Checks if cost monitoring is enabled.
   *
   * @returns True if any threshold or limit is set
   */
  isEnabled(): boolean {
    return (
      this.thresholdCredits !== null ||
      this.dailyLimit !== null ||
      this.monthlyLimit !== null
    );
  }

  /**
   * Gets a summary of configured thresholds.
   *
   * @returns Threshold summary
   */
  getThresholds(): {
    queryThreshold: number | null;
    dailyLimit: number | null;
    monthlyLimit: number | null;
  } {
    return {
      queryThreshold: this.thresholdCredits,
      dailyLimit: this.dailyLimit,
      monthlyLimit: this.monthlyLimit,
    };
  }
}
