/**
 * Cardinality tracking and enforcement for Prometheus metrics.
 * Prevents metric explosion by limiting the number of unique label combinations.
 */

/**
 * Tracks and enforces cardinality limits per metric.
 */
export class CardinalityTracker {
  private readonly limits: Map<string, number>;
  private readonly counts: Map<string, Set<string>>;
  private overflowCount: number = 0;
  private lastOverflowLogTime: number = 0;
  private readonly defaultLimit: number;
  private readonly overflowLogInterval: number = 60000; // 1 minute in ms

  constructor(limits: Record<string, number> = {}, defaultLimit: number = 1000) {
    this.limits = new Map(Object.entries(limits));
    this.counts = new Map();
    this.defaultLimit = defaultLimit;
  }

  /**
   * Check if a new label combination can be registered.
   * Returns true if allowed, false if cardinality limit exceeded.
   */
  tryRegister(metricName: string, labelKey: string): boolean {
    // Get or create the set of label combinations for this metric
    if (!this.counts.has(metricName)) {
      this.counts.set(metricName, new Set());
    }

    const labelSet = this.counts.get(metricName)!;

    // Check if already tracked
    if (labelSet.has(labelKey)) {
      return true;
    }

    // Get the limit for this metric
    const limit = this.limits.get(metricName) ?? this.defaultLimit;

    // Check against limit
    if (labelSet.size >= limit) {
      // Log warning if exceeded (rate-limited to once per minute)
      const now = Date.now();
      if (now - this.lastOverflowLogTime >= this.overflowLogInterval) {
        console.warn(
          `Cardinality limit exceeded for metric "${metricName}": ` +
          `${labelSet.size}/${limit}. Dropping new label combination: ${labelKey}`
        );
        this.lastOverflowLogTime = now;
      }

      // Track overflow count
      this.overflowCount++;
      return false;
    }

    // Track this label combination
    labelSet.add(labelKey);
    return true;
  }

  /**
   * Get overflow statistics.
   */
  getOverflowCount(): number {
    return this.overflowCount;
  }

  /**
   * Get current cardinality for a metric.
   */
  getCardinality(metricName: string): number {
    const labelSet = this.counts.get(metricName);
    return labelSet ? labelSet.size : 0;
  }

  /**
   * Get all cardinality stats.
   */
  getStats(): Map<string, { current: number; limit: number; utilization: number }> {
    const stats = new Map<string, { current: number; limit: number; utilization: number }>();

    for (const [metricName, labelSet] of this.counts.entries()) {
      const current = labelSet.size;
      const limit = this.limits.get(metricName) ?? this.defaultLimit;
      const utilization = current / limit;

      stats.set(metricName, { current, limit, utilization });
    }

    return stats;
  }

  /**
   * Reset tracking for a metric.
   */
  reset(metricName?: string): void {
    if (metricName) {
      this.counts.delete(metricName);
    } else {
      this.counts.clear();
      this.overflowCount = 0;
      this.lastOverflowLogTime = 0;
    }
  }
}
