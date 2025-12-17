/**
 * Configuration types for FFmpeg integration.
 *
 * Defines FFmpeg client configuration including binary paths, resource limits,
 * and observability settings.
 */

// Readable from 'stream' available if needed for future stream configuration

/**
 * Logger interface for integration logging
 */
export interface Logger {
  /** Log debug message */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log info message */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log warning message */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log error message */
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Metrics client interface for emitting metrics
 */
export interface MetricsClient {
  /** Increment a counter metric */
  increment(metric: string, tags?: Record<string, string>): void;
  /** Set a gauge metric */
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  /** Record a histogram value */
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  /** Record a timing metric */
  timing(metric: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Configuration for FFmpeg client
 */
export interface FFmpegConfig {
  // Binary paths
  /** Path to FFmpeg binary (defaults to 'ffmpeg') */
  ffmpegPath?: string;
  /** Path to FFprobe binary (defaults to 'ffprobe') */
  ffprobePath?: string;

  // Timeouts and limits
  /** Default job timeout in milliseconds (defaults to 3600000 = 1 hour) */
  timeout?: number;
  /** Maximum concurrent jobs (defaults to 4) */
  maxConcurrent?: number;

  // Resource management
  /** Temporary directory for intermediate files (defaults to os.tmpdir()) */
  tempDir?: string;
  /** Memory limit per job in MB (defaults to 2048) */
  maxMemoryMB?: number;
  /** CPU threads for FFmpeg (defaults to 0 = auto) */
  cpuThreads?: number;

  // Encoding defaults
  /** Default encoding preset (defaults to 'medium') */
  defaultPreset?: string;

  // Observability
  /** Logger instance for integration logging */
  logger?: Logger;
  /** Metrics client for emitting metrics */
  metrics?: MetricsClient;
}

/**
 * Validated and normalized FFmpeg configuration with all defaults applied
 */
export interface NormalizedFFmpegConfig {
  ffmpegPath: string;
  ffprobePath: string;
  timeout: number;
  maxConcurrent: number;
  tempDir: string;
  maxMemoryMB: number;
  cpuThreads: number;
  defaultPreset: string;
  logger?: Logger;
  metrics?: MetricsClient;
}

/**
 * Resource limits for FFmpeg process execution
 */
export interface ResourceLimits {
  /** Memory limit in MB */
  maxMemoryMB?: number;
  /** CPU threads to use */
  cpuThreads?: number;
  /** Process priority (Unix nice level) */
  niceLevel?: number;
  /** I/O priority class (e.g., 'idle', 'best-effort') */
  ioNice?: string;
}
