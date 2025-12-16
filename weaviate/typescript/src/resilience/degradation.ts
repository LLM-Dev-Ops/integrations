/**
 * Degradation manager for graceful service degradation.
 *
 * Automatically adjusts batch sizes and search limits based on error rates
 * and latency to maintain service availability under pressure.
 */

import {
  DegradationMode,
  DegradationConfig,
  DegradationThresholds,
  DegradationLimits,
  DegradationStateInfo,
  DegradationModeChangeHook,
} from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default degradation thresholds
 */
export const DEFAULT_DEGRADATION_THRESHOLDS: DegradationThresholds = {
  throttledErrorThreshold: 3,
  degradedErrorThreshold: 5,
  throttledLatencyMs: 3000,
  degradedLatencyMs: 5000,
  throttledErrorRate: 0.2, // 20%
  degradedErrorRate: 0.5, // 50%
};

/**
 * Default degradation limits
 */
export const DEFAULT_DEGRADATION_LIMITS: DegradationLimits = {
  normal: {
    maxBatchSize: 100,
    maxSearchLimit: 10000,
  },
  throttled: {
    maxBatchSize: 50,
    maxSearchLimit: 100,
  },
  degraded: {
    maxBatchSize: 10,
    maxSearchLimit: 20,
  },
};

/**
 * Default degradation configuration
 */
export const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  thresholds: DEFAULT_DEGRADATION_THRESHOLDS,
  limits: DEFAULT_DEGRADATION_LIMITS,
  errorRateWindowMs: 60000, // 1 minute
};

// ============================================================================
// Degradation Manager
// ============================================================================

/**
 * Manages graceful degradation based on error rates and latency
 */
export class DegradationManager {
  private readonly config: DegradationConfig;
  private mode: DegradationMode = DegradationMode.Normal;
  private consecutiveErrors = 0;
  private consecutiveSuccesses = 0;
  private recentLatencies: number[] = [];
  private recentResults: Array<{ success: boolean; timestamp: number }> = [];
  private readonly hooks: DegradationModeChangeHook[] = [];

  constructor(config?: Partial<DegradationConfig>) {
    this.config = {
      ...DEFAULT_DEGRADATION_CONFIG,
      thresholds: {
        ...DEFAULT_DEGRADATION_CONFIG.thresholds,
        ...config?.thresholds,
      },
      limits: {
        normal: {
          ...DEFAULT_DEGRADATION_CONFIG.limits.normal,
          ...config?.limits?.normal,
        },
        throttled: {
          ...DEFAULT_DEGRADATION_CONFIG.limits.throttled,
          ...config?.limits?.throttled,
        },
        degraded: {
          ...DEFAULT_DEGRADATION_CONFIG.limits.degraded,
          ...config?.limits?.degraded,
        },
      },
      errorRateWindowMs:
        config?.errorRateWindowMs ?? DEFAULT_DEGRADATION_CONFIG.errorRateWindowMs,
    };
  }

  /**
   * Add a mode change hook
   */
  addHook(hook: DegradationModeChangeHook): this {
    this.hooks.push(hook);
    return this;
  }

  /**
   * Record a successful operation
   */
  onSuccess(latencyMs: number): void {
    this.consecutiveErrors = 0;
    this.consecutiveSuccesses++;
    this.recentLatencies.push(latencyMs);

    // Keep only recent latencies (last 10)
    if (this.recentLatencies.length > 10) {
      this.recentLatencies.shift();
    }

    // Record success in results history
    this.recordResult(true);

    // Adjust mode based on current state
    this.adjustMode();
  }

  /**
   * Record a failed operation
   */
  onError(error: unknown): void {
    this.consecutiveErrors++;
    this.consecutiveSuccesses = 0;

    // Record failure in results history
    this.recordResult(false);

    // Adjust mode based on current state
    this.adjustMode();
  }

  /**
   * Get adjusted batch size based on current mode
   */
  adjustBatchSize(requestedSize: number): number {
    const limits = this.getCurrentLimits();
    return Math.min(requestedSize, limits.maxBatchSize);
  }

  /**
   * Get adjusted search limit based on current mode
   */
  adjustSearchLimit(requestedLimit: number): number {
    const limits = this.getCurrentLimits();
    return Math.min(requestedLimit, limits.maxSearchLimit);
  }

  /**
   * Get current degradation mode
   */
  getMode(): DegradationMode {
    return this.mode;
  }

  /**
   * Get current state information
   */
  getState(): DegradationStateInfo {
    return {
      mode: this.mode,
      consecutiveErrors: this.consecutiveErrors,
      recentLatencyMs: [...this.recentLatencies],
      errorRate: this.calculateErrorRate(),
      currentBatchSize: this.getCurrentLimits().maxBatchSize,
      currentSearchLimit: this.getCurrentLimits().maxSearchLimit,
    };
  }

  /**
   * Record a result in the history
   */
  private recordResult(success: boolean): void {
    const now = Date.now();
    this.recentResults.push({ success, timestamp: now });

    // Clean old results outside the window
    const windowStart = now - this.config.errorRateWindowMs;
    this.recentResults = this.recentResults.filter((r) => r.timestamp > windowStart);
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(): number {
    if (this.recentResults.length === 0) {
      return 0;
    }

    const failures = this.recentResults.filter((r) => !r.success).length;
    return failures / this.recentResults.length;
  }

  /**
   * Calculate average recent latency
   */
  private calculateAverageLatency(): number {
    if (this.recentLatencies.length === 0) {
      return 0;
    }

    const sum = this.recentLatencies.reduce((a, b) => a + b, 0);
    return sum / this.recentLatencies.length;
  }

  /**
   * Adjust degradation mode based on current metrics
   */
  private adjustMode(): void {
    const errorRate = this.calculateErrorRate();
    const avgLatency = this.calculateAverageLatency();
    const thresholds = this.config.thresholds;

    let newMode = this.mode;

    // Determine new mode based on metrics
    if (
      this.consecutiveErrors >= thresholds.degradedErrorThreshold ||
      errorRate >= thresholds.degradedErrorRate ||
      avgLatency >= thresholds.degradedLatencyMs
    ) {
      newMode = DegradationMode.Degraded;
    } else if (
      this.consecutiveErrors >= thresholds.throttledErrorThreshold ||
      errorRate >= thresholds.throttledErrorRate ||
      avgLatency >= thresholds.throttledLatencyMs
    ) {
      newMode = DegradationMode.Throttled;
    } else if (this.consecutiveSuccesses >= 5) {
      // Recover to normal after sustained success
      newMode = DegradationMode.Normal;
    }

    // Update mode if changed
    if (newMode !== this.mode) {
      const oldMode = this.mode;
      this.mode = newMode;
      this.notifyModeChange(oldMode, newMode);
    }
  }

  /**
   * Get current limits based on mode
   */
  private getCurrentLimits(): { maxBatchSize: number; maxSearchLimit: number } {
    switch (this.mode) {
      case DegradationMode.Normal:
        return this.config.limits.normal;
      case DegradationMode.Throttled:
        return this.config.limits.throttled;
      case DegradationMode.Degraded:
        return this.config.limits.degraded;
      default:
        return this.config.limits.normal;
    }
  }

  /**
   * Notify hooks of mode change
   */
  private async notifyModeChange(
    oldMode: DegradationMode,
    newMode: DegradationMode
  ): Promise<void> {
    const info = this.getState();
    for (const hook of this.hooks) {
      try {
        await hook(oldMode, newMode, info);
      } catch (error) {
        // Ignore hook errors to prevent affecting degradation manager operation
        console.error('Degradation manager hook error:', error);
      }
    }
  }

  /**
   * Force reset to normal mode
   */
  reset(): void {
    const oldMode = this.mode;
    this.mode = DegradationMode.Normal;
    this.consecutiveErrors = 0;
    this.consecutiveSuccesses = 0;
    this.recentLatencies = [];
    this.recentResults = [];

    if (oldMode !== this.mode) {
      this.notifyModeChange(oldMode, this.mode);
    }
  }

  /**
   * Check if vector return should be included
   */
  shouldIncludeVector(): boolean {
    // In degraded mode, skip vector return to reduce payload size
    return this.mode !== DegradationMode.Degraded;
  }

  /**
   * Get current configuration
   */
  getConfig(): DegradationConfig {
    return {
      ...this.config,
      thresholds: { ...this.config.thresholds },
      limits: {
        normal: { ...this.config.limits.normal },
        throttled: { ...this.config.limits.throttled },
        degraded: { ...this.config.limits.degraded },
      },
    };
  }
}
