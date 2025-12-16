/**
 * Process metrics collector - Tracks process-level metrics like CPU, memory, and file descriptors.
 *
 * Exposes standard process metrics following Prometheus naming conventions:
 * - process_cpu_user_seconds_total
 * - process_cpu_system_seconds_total
 * - process_resident_memory_bytes
 * - process_heap_bytes
 * - process_open_fds (Unix only)
 * - process_max_fds (Unix only)
 * - process_start_time_seconds
 */

import * as os from 'os';

/**
 * Minimal MetricsRegistry interface.
 */
interface MetricsRegistry {
  counter(config: { name: string; help: string }): Counter;
  gauge(config: { name: string; help: string }): Gauge;
}

/**
 * Minimal Counter interface.
 */
interface Counter {
  inc(value?: number): void;
}

/**
 * Minimal Gauge interface.
 */
interface Gauge {
  set(value: number): void;
}

/**
 * Process collector configuration.
 */
export interface ProcessCollectorConfig {
  /** Prefix for metric names (default: 'process') */
  prefix?: string;
  /** Collect CPU metrics (default: true) */
  collectCpu?: boolean;
  /** Collect memory metrics (default: true) */
  collectMemory?: boolean;
  /** Collect file descriptor metrics (default: true, Unix only) */
  collectFds?: boolean;
}

/**
 * Collector for process-level metrics.
 * Tracks CPU usage, memory usage, and file descriptors.
 */
export class ProcessCollector {
  private readonly cpuUserTotal: Gauge;
  private readonly cpuSystemTotal: Gauge;
  private readonly residentMemoryBytes: Gauge;
  private readonly heapUsedBytes: Gauge;
  private readonly heapTotalBytes: Gauge;
  private readonly externalMemoryBytes: Gauge;
  private readonly openFds: Gauge;
  private readonly maxFds: Gauge;
  private readonly startTimeSeconds: Gauge;
  private readonly uptimeSeconds: Gauge;

  private readonly config: Required<ProcessCollectorConfig>;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;

  constructor(registry: MetricsRegistry, config: ProcessCollectorConfig = {}) {
    this.config = {
      prefix: config.prefix ?? 'process',
      collectCpu: config.collectCpu ?? true,
      collectMemory: config.collectMemory ?? true,
      collectFds: config.collectFds ?? true,
    };

    const prefix = this.config.prefix;

    // CPU metrics
    this.cpuUserTotal = registry.gauge({
      name: `${prefix}_cpu_user_seconds_total`,
      help: 'Total user CPU time spent in seconds',
    });

    this.cpuSystemTotal = registry.gauge({
      name: `${prefix}_cpu_system_seconds_total`,
      help: 'Total system CPU time spent in seconds',
    });

    // Memory metrics
    this.residentMemoryBytes = registry.gauge({
      name: `${prefix}_resident_memory_bytes`,
      help: 'Resident memory size in bytes',
    });

    this.heapUsedBytes = registry.gauge({
      name: `${prefix}_heap_bytes`,
      help: 'Process heap size in bytes',
    });

    this.heapTotalBytes = registry.gauge({
      name: `${prefix}_heap_total_bytes`,
      help: 'Process total heap size in bytes',
    });

    this.externalMemoryBytes = registry.gauge({
      name: `${prefix}_external_memory_bytes`,
      help: 'External memory allocated by V8 in bytes',
    });

    // File descriptor metrics
    this.openFds = registry.gauge({
      name: `${prefix}_open_fds`,
      help: 'Number of open file descriptors',
    });

    this.maxFds = registry.gauge({
      name: `${prefix}_max_fds`,
      help: 'Maximum number of open file descriptors',
    });

    // Process timing metrics
    this.startTimeSeconds = registry.gauge({
      name: `${prefix}_start_time_seconds`,
      help: 'Start time of the process since unix epoch in seconds',
    });

    this.uptimeSeconds = registry.gauge({
      name: `${prefix}_uptime_seconds`,
      help: 'Process uptime in seconds',
    });

    // Set start time (doesn't change)
    const startTime = Date.now() / 1000 - process.uptime();
    this.startTimeSeconds.set(startTime);
  }

  /**
   * Collect all process metrics.
   * Call this periodically to update metric values.
   */
  collect(): void {
    if (this.config.collectCpu) {
      this.collectCpuMetrics();
    }

    if (this.config.collectMemory) {
      this.collectMemoryMetrics();
    }

    if (this.config.collectFds) {
      this.collectFdMetrics();
    }

    // Always collect uptime
    this.uptimeSeconds.set(process.uptime());
  }

  /**
   * Collect CPU usage metrics.
   */
  private collectCpuMetrics(): void {
    const cpuUsage = process.cpuUsage(this.lastCpuUsage ?? undefined);
    this.lastCpuUsage = process.cpuUsage();

    // Convert microseconds to seconds
    this.cpuUserTotal.set(cpuUsage.user / 1e6);
    this.cpuSystemTotal.set(cpuUsage.system / 1e6);
  }

  /**
   * Collect memory usage metrics.
   */
  private collectMemoryMetrics(): void {
    const memUsage = process.memoryUsage();

    this.residentMemoryBytes.set(memUsage.rss);
    this.heapUsedBytes.set(memUsage.heapUsed);
    this.heapTotalBytes.set(memUsage.heapTotal);
    this.externalMemoryBytes.set(memUsage.external);
  }

  /**
   * Collect file descriptor metrics (Unix only).
   */
  private collectFdMetrics(): void {
    // File descriptor metrics are only available on Unix-like systems
    if (os.platform() === 'win32') {
      return;
    }

    try {
      // Try to read from /proc/self/fd (Linux)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const fds = fs.readdirSync('/proc/self/fd');
      this.openFds.set(fds.length);
    } catch {
      // /proc not available, skip FD metrics
    }

    try {
      // Try to get max FDs from ulimit
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const limits = fs.readFileSync('/proc/self/limits', 'utf-8');
      const match = limits.match(/Max open files\s+(\d+)/);
      if (match) {
        this.maxFds.set(parseInt(match[1], 10));
      }
    } catch {
      // Unable to read limits, skip
    }
  }
}
