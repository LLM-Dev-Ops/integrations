/**
 * Runtime metrics collector - Tracks Node.js runtime metrics like event loop lag and GC stats.
 *
 * Exposes runtime metrics following Prometheus naming conventions:
 * - nodejs_eventloop_lag_seconds
 * - nodejs_eventloop_lag_min_seconds
 * - nodejs_eventloop_lag_max_seconds
 * - nodejs_eventloop_lag_p50_seconds
 * - nodejs_eventloop_lag_p99_seconds
 * - nodejs_active_handles_total
 * - nodejs_active_requests_total
 * - nodejs_gc_duration_seconds (histogram)
 * - nodejs_gc_runs_total
 */

import { PerformanceObserver, monitorEventLoopDelay } from 'perf_hooks';

/**
 * Event loop delay monitor type (from perf_hooks).
 */
interface EventLoopDelayMonitor {
  enable(): void;
  disable(): void;
  reset(): void;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  percentile(percentile: number): number;
}

/**
 * Minimal MetricsRegistry interface.
 */
interface MetricsRegistry {
  gauge(config: { name: string; help: string }): Gauge;
  counter(config: { name: string; help: string }): Counter;
  histogramVec(config: {
    name: string;
    help: string;
    labelNames: string[];
    buckets?: number[];
  }): HistogramVec;
  counterVec(config: {
    name: string;
    help: string;
    labelNames: string[];
  }): CounterVec;
}

/**
 * Minimal Gauge interface.
 */
interface Gauge {
  set(value: number): void;
}

/**
 * Minimal Counter interface.
 */
interface Counter {
  inc(value?: number): void;
}

/**
 * Minimal HistogramVec interface.
 */
interface HistogramVec {
  labels(labels: Record<string, string>): Histogram;
}

/**
 * Minimal Histogram interface.
 */
interface Histogram {
  observe(value: number): void;
}

/**
 * Minimal CounterVec interface.
 */
interface CounterVec {
  labels(labels: Record<string, string>): Counter;
}

/**
 * Runtime collector configuration.
 */
export interface RuntimeCollectorConfig {
  /** Prefix for metric names (default: 'nodejs') */
  prefix?: string;
  /** Collect event loop metrics (default: true) */
  collectEventLoop?: boolean;
  /** Collect GC metrics (default: true) */
  collectGc?: boolean;
  /** Collect active handles/requests (default: true) */
  collectActiveHandles?: boolean;
  /** Event loop monitoring resolution in milliseconds (default: 10) */
  eventLoopResolution?: number;
}

/**
 * GC duration histogram buckets (in seconds).
 */
export const GC_DURATION_BUCKETS = [
  0.001,  // 1ms
  0.005,  // 5ms
  0.01,   // 10ms
  0.025,  // 25ms
  0.05,   // 50ms
  0.1,    // 100ms
  0.25,   // 250ms
  0.5,    // 500ms
  1.0,    // 1s
];

/**
 * Collector for Node.js runtime metrics.
 * Tracks event loop lag, GC stats, and active handles.
 */
export class RuntimeCollector {
  private readonly eventLoopLag: Gauge;
  private readonly eventLoopLagMin: Gauge;
  private readonly eventLoopLagMax: Gauge;
  private readonly eventLoopLagP50: Gauge;
  private readonly eventLoopLagP99: Gauge;
  private readonly activeHandles: Gauge;
  private readonly activeRequests: Gauge;
  private readonly gcDuration: HistogramVec;
  private readonly gcRunsTotal: CounterVec;

  private readonly config: Required<RuntimeCollectorConfig>;
  private eventLoopMonitor: EventLoopDelayMonitor | null = null;
  private gcObserver: PerformanceObserver | null = null;

  constructor(registry: MetricsRegistry, config: RuntimeCollectorConfig = {}) {
    this.config = {
      prefix: config.prefix ?? 'nodejs',
      collectEventLoop: config.collectEventLoop ?? true,
      collectGc: config.collectGc ?? true,
      collectActiveHandles: config.collectActiveHandles ?? true,
      eventLoopResolution: config.eventLoopResolution ?? 10,
    };

    const prefix = this.config.prefix;

    // Event loop metrics
    this.eventLoopLag = registry.gauge({
      name: `${prefix}_eventloop_lag_seconds`,
      help: 'Event loop lag in seconds',
    });

    this.eventLoopLagMin = registry.gauge({
      name: `${prefix}_eventloop_lag_min_seconds`,
      help: 'Minimum event loop lag in seconds',
    });

    this.eventLoopLagMax = registry.gauge({
      name: `${prefix}_eventloop_lag_max_seconds`,
      help: 'Maximum event loop lag in seconds',
    });

    this.eventLoopLagP50 = registry.gauge({
      name: `${prefix}_eventloop_lag_p50_seconds`,
      help: '50th percentile event loop lag in seconds',
    });

    this.eventLoopLagP99 = registry.gauge({
      name: `${prefix}_eventloop_lag_p99_seconds`,
      help: '99th percentile event loop lag in seconds',
    });

    // Active handles/requests
    this.activeHandles = registry.gauge({
      name: `${prefix}_active_handles_total`,
      help: 'Number of active handles',
    });

    this.activeRequests = registry.gauge({
      name: `${prefix}_active_requests_total`,
      help: 'Number of active requests',
    });

    // GC metrics
    this.gcDuration = registry.histogramVec({
      name: `${prefix}_gc_duration_seconds`,
      help: 'Garbage collection duration in seconds',
      labelNames: ['gc_type'],
      buckets: GC_DURATION_BUCKETS,
    });

    this.gcRunsTotal = registry.counterVec({
      name: `${prefix}_gc_runs_total`,
      help: 'Total number of garbage collection runs',
      labelNames: ['gc_type'],
    });

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Start event loop and GC monitoring.
   */
  private startMonitoring(): void {
    if (this.config.collectEventLoop) {
      this.startEventLoopMonitoring();
    }

    if (this.config.collectGc) {
      this.startGcMonitoring();
    }
  }

  /**
   * Start event loop delay monitoring.
   */
  private startEventLoopMonitoring(): void {
    try {
      this.eventLoopMonitor = monitorEventLoopDelay({
        resolution: this.config.eventLoopResolution,
      });
      this.eventLoopMonitor.enable();
    } catch {
      // Event loop monitoring not available
    }
  }

  /**
   * Start GC performance monitoring.
   */
  private startGcMonitoring(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            const gcEntry = entry as PerformanceEntry & { detail?: { kind?: number } };
            const gcType = this.getGcTypeName(gcEntry.detail?.kind);
            const durationSeconds = entry.duration / 1000;

            this.gcDuration.labels({ gc_type: gcType }).observe(durationSeconds);
            this.gcRunsTotal.labels({ gc_type: gcType }).inc();
          }
        }
      });

      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch {
      // GC monitoring not available (requires --expose-gc flag)
    }
  }

  /**
   * Get GC type name from kind code.
   */
  private getGcTypeName(kind?: number): string {
    switch (kind) {
      case 1:
        return 'scavenge';
      case 2:
        return 'mark_sweep_compact';
      case 4:
        return 'incremental_marking';
      case 8:
        return 'weak_callbacks';
      case 15:
        return 'all';
      default:
        return 'unknown';
    }
  }

  /**
   * Collect all runtime metrics.
   * Call this periodically to update metric values.
   */
  collect(): void {
    if (this.config.collectEventLoop) {
      this.collectEventLoopMetrics();
    }

    if (this.config.collectActiveHandles) {
      this.collectActiveHandlesMetrics();
    }
  }

  /**
   * Collect event loop delay metrics.
   */
  private collectEventLoopMetrics(): void {
    if (!this.eventLoopMonitor) {
      return;
    }

    // Convert nanoseconds to seconds
    const toSeconds = (ns: number) => ns / 1e9;

    this.eventLoopLag.set(toSeconds(this.eventLoopMonitor.mean));
    this.eventLoopLagMin.set(toSeconds(this.eventLoopMonitor.min));
    this.eventLoopLagMax.set(toSeconds(this.eventLoopMonitor.max));
    this.eventLoopLagP50.set(toSeconds(this.eventLoopMonitor.percentile(50)));
    this.eventLoopLagP99.set(toSeconds(this.eventLoopMonitor.percentile(99)));

    // Reset for next collection period
    this.eventLoopMonitor.reset();
  }

  /**
   * Collect active handles and requests metrics.
   */
  private collectActiveHandlesMetrics(): void {
    // These are internal Node.js APIs and may not be available
    const proc = process as NodeJS.Process & {
      _getActiveHandles?: () => unknown[];
      _getActiveRequests?: () => unknown[];
    };

    if (typeof proc._getActiveHandles === 'function') {
      try {
        this.activeHandles.set(proc._getActiveHandles().length);
      } catch {
        // Ignore errors
      }
    }

    if (typeof proc._getActiveRequests === 'function') {
      try {
        this.activeRequests.set(proc._getActiveRequests().length);
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Stop monitoring and clean up resources.
   */
  stop(): void {
    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable();
      this.eventLoopMonitor = null;
    }

    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = null;
    }
  }
}
