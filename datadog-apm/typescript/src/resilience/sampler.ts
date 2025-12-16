/**
 * Adaptive sampler for high-volume tracing
 *
 * @module resilience/sampler
 */

/**
 * Sampling decision result
 */
export interface SamplingDecision {
  /** Whether to sample */
  sampled: boolean;
  /** Datadog sampling priority (0=reject, 1=sample, 2=keep) */
  priority: number;
  /** Reason for the decision */
  reason: 'error' | 'llm' | 'agent' | 'parent' | 'rate' | 'forced';
}

/**
 * Context for making sampling decisions
 */
export interface SamplingContext {
  /** Is this an error trace? */
  isError?: boolean;
  /** Is this an LLM call? */
  isLLM?: boolean;
  /** Is this an agent execution? */
  isAgent?: boolean;
  /** Was the parent sampled? */
  parentSampled?: boolean;
  /** Operation name */
  operationName?: string;
  /** Tags to consider */
  tags?: Record<string, unknown>;
}

/**
 * Adaptive sampler options
 */
export interface AdaptiveSamplerOptions {
  /** Base sample rate (0-1) */
  baseSampleRate?: number;
  /** Sample rate for errors (usually 1.0) */
  errorSampleRate?: number;
  /** Sample rate for LLM calls (usually 1.0) */
  llmSampleRate?: number;
  /** Sample rate for agent executions (usually 1.0) */
  agentSampleRate?: number;
  /** Target spans per second */
  targetSpansPerSecond?: number;
  /** Window size for rate adaptation */
  windowSize?: number;
}

/**
 * Adaptive sampler that adjusts rate based on throughput
 */
export class AdaptiveSampler {
  private baseSampleRate: number;
  private errorSampleRate: number;
  private llmSampleRate: number;
  private agentSampleRate: number;
  private currentRate: number;
  private targetSpansPerSecond: number;
  private windowSize: number;

  private spanCount: number = 0;
  private windowStartTime: number = Date.now();

  constructor(options?: AdaptiveSamplerOptions) {
    this.baseSampleRate = options?.baseSampleRate ?? 0.1;
    this.errorSampleRate = options?.errorSampleRate ?? 1.0;
    this.llmSampleRate = options?.llmSampleRate ?? 1.0;
    this.agentSampleRate = options?.agentSampleRate ?? 1.0;
    this.currentRate = this.baseSampleRate;
    this.targetSpansPerSecond = options?.targetSpansPerSecond ?? 100;
    this.windowSize = options?.windowSize ?? 1000;
  }

  /**
   * Make a sampling decision
   */
  shouldSample(context: SamplingContext = {}): SamplingDecision {
    // Always sample errors
    if (context.isError) {
      return { sampled: true, priority: 2, reason: 'error' };
    }

    // Always sample LLM calls
    if (context.isLLM) {
      const sampled = Math.random() < this.llmSampleRate;
      return {
        sampled,
        priority: sampled ? 2 : 0,
        reason: 'llm',
      };
    }

    // Always sample agent executions
    if (context.isAgent) {
      const sampled = Math.random() < this.agentSampleRate;
      return {
        sampled,
        priority: sampled ? 2 : 0,
        reason: 'agent',
      };
    }

    // Respect parent sampling decision
    if (context.parentSampled !== undefined) {
      return {
        sampled: context.parentSampled,
        priority: context.parentSampled ? 1 : 0,
        reason: 'parent',
      };
    }

    // Probabilistic sampling with adaptive rate
    this.spanCount++;
    this.maybeAdjustRate();

    const sampled = Math.random() < this.currentRate;
    return {
      sampled,
      priority: sampled ? 1 : 0,
      reason: 'rate',
    };
  }

  /**
   * Force a sampling decision (bypass rules)
   */
  forceSample(): SamplingDecision {
    return { sampled: true, priority: 2, reason: 'forced' };
  }

  /**
   * Force a drop decision (bypass rules)
   */
  forceDrop(): SamplingDecision {
    return { sampled: false, priority: 0, reason: 'forced' };
  }

  /**
   * Adjust rate based on current throughput
   */
  private maybeAdjustRate(): void {
    const now = Date.now();
    const elapsed = now - this.windowStartTime;

    // Only adjust after window has elapsed
    if (elapsed < this.windowSize) {
      return;
    }

    // Calculate current spans per second
    const spansPerSecond = (this.spanCount / elapsed) * 1000;

    // Adjust rate based on throughput
    if (spansPerSecond > this.targetSpansPerSecond * 2) {
      // Overwhelmed - reduce rate
      this.currentRate = Math.max(0.01, this.currentRate * 0.5);
    } else if (spansPerSecond < this.targetSpansPerSecond * 0.5) {
      // Underutilized - increase rate (up to base rate)
      this.currentRate = Math.min(this.baseSampleRate, this.currentRate * 1.5);
    }

    // Reset window
    this.spanCount = 0;
    this.windowStartTime = now;
  }

  /**
   * Get current sample rate
   */
  getCurrentRate(): number {
    return this.currentRate;
  }

  /**
   * Get base sample rate
   */
  getBaseSampleRate(): number {
    return this.baseSampleRate;
  }

  /**
   * Set base sample rate
   */
  setBaseSampleRate(rate: number): void {
    if (rate < 0 || rate > 1) {
      throw new Error('Sample rate must be between 0 and 1');
    }
    this.baseSampleRate = rate;
    // Reset current rate to new base
    this.currentRate = rate;
  }

  /**
   * Reset sampler state
   */
  reset(): void {
    this.currentRate = this.baseSampleRate;
    this.spanCount = 0;
    this.windowStartTime = Date.now();
  }

  /**
   * Get statistics
   */
  getStats(): {
    baseSampleRate: number;
    currentRate: number;
    spanCount: number;
    windowElapsed: number;
  } {
    return {
      baseSampleRate: this.baseSampleRate,
      currentRate: this.currentRate,
      spanCount: this.spanCount,
      windowElapsed: Date.now() - this.windowStartTime,
    };
  }
}
