/**
 * FFmpeg Client
 *
 * Main API for FFmpeg integration. Provides high-level operations for media
 * processing including probing, transcoding, audio extraction, thumbnail
 * generation, and video manipulation.
 *
 * @example Basic usage
 * ```typescript
 * const client = createFFmpegClient({
 *   maxConcurrent: 2,
 *   timeout: 300000
 * });
 *
 * // Probe a media file
 * const info = await client.probe({ type: 'file', path: '/input.mp4' });
 *
 * // Transcode to web format
 * const result = await client.transcode({
 *   input: { type: 'file', path: '/input.mp4' },
 *   output: { type: 'file', path: '/output.mp4' },
 *   preset: 'web-hd'
 * });
 *
 * // Cleanup
 * await client.shutdown();
 * ```
 */

import { spawn, execSync } from 'child_process';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type {
  FFmpegConfig,
  NormalizedFFmpegConfig,
  Logger,
  MetricsClient,
} from './types/config.js';
import type { InputSpec, OutputSpec } from './types/index.js';
import type { MediaInfo, VideoStreamInfo, AudioStreamInfo, StreamInfo } from './types/media-info.js';
import type { ProgressListener } from './types/progress.js';
import type { JobStatus, JobResult, JobStats } from './types/job.js';
import type { ProcessExecutor, ExecuteOptions, ProcessResult } from './types/executor.js';
import type { FFmpegCommand } from './types/command.js';
import { FFmpegCommandBuilderImpl, createCommandBuilder } from './command-builder.js';
import { ProcessExecutorImpl, createProcessExecutor } from './process-executor.js';
import { JobManager } from './job-manager.js';
import { FilterGraph } from './filter-graph.js';
import { mergeWithPreset } from './presets.js';
import type { PresetName } from './types/index.js';
import {
  BinaryNotFoundError,
  UnsupportedVersionError,
  ConfigurationError,
  FileNotFoundError,
  NonZeroExitError,
} from './errors/errors.js';
import { parseFFmpegError } from './errors/error-parser.js';

/**
 * Minimum supported FFmpeg version
 */
const MIN_FFMPEG_VERSION = '4.0.0';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: NormalizedFFmpegConfig = {
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  timeout: 3600000, // 1 hour
  maxConcurrent: 4,
  tempDir: os.tmpdir(),
  maxMemoryMB: 2048,
  cpuThreads: 0, // auto
  defaultPreset: 'medium',
};

/**
 * No-op logger implementation
 */
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * No-op metrics implementation
 */
const noopMetrics: MetricsClient = {
  increment: () => {},
  gauge: () => {},
  histogram: () => {},
  timing: () => {},
};

/**
 * Transcode job specification
 */
export interface TranscodeJob {
  id?: string;
  input: InputSpec;
  output: OutputSpec;
  preset?: PresetName;
  twoPass?: boolean;
  onProgress?: ProgressListener;
}

/**
 * Audio extraction job specification
 */
export interface AudioExtractJob {
  id?: string;
  input: InputSpec;
  output: OutputSpec;
  streamIndex?: number;
  normalize?: boolean;
  onProgress?: ProgressListener;
}

/**
 * Thumbnail generation job specification
 */
export interface ThumbnailJob {
  id?: string;
  input: InputSpec;
  output: OutputSpec;
  timestamp?: number;
  width?: number;
  height?: number;
}

/**
 * Resize job specification
 */
export interface ResizeJob {
  id?: string;
  input: InputSpec;
  output: OutputSpec;
  width?: number;
  height?: number;
  maintainAspect?: boolean;
  algorithm?: 'bilinear' | 'bicubic' | 'lanczos';
  onProgress?: ProgressListener;
}

/**
 * Crop job specification
 */
export interface CropJob {
  id?: string;
  input: InputSpec;
  output: OutputSpec;
  width: number;
  height: number;
  x?: number;
  y?: number;
  onProgress?: ProgressListener;
}

/**
 * FFmpeg client interface
 */
export interface FFmpegClient {
  /** Probe a media file to get information */
  probe(input: InputSpec): Promise<MediaInfo>;

  /** Transcode a media file */
  transcode(job: TranscodeJob): Promise<JobResult>;

  /** Extract audio from a video file */
  extractAudio(job: AudioExtractJob): Promise<JobResult>;

  /** Generate a thumbnail from a video file */
  generateThumbnail(job: ThumbnailJob): Promise<JobResult>;

  /** Resize a video file */
  resize(job: ResizeJob): Promise<JobResult>;

  /** Crop a video file */
  crop(job: CropJob): Promise<JobResult>;

  /** Execute a custom FFmpeg command */
  executeCommand(command: FFmpegCommand, options?: ExecuteOptions): Promise<JobResult>;

  /** Cancel a running job */
  cancelJob(jobId: string): Promise<boolean>;

  /** Get the status of a job */
  getJobStatus(jobId: string): JobStatus | null;

  /** Shut down the client */
  shutdown(): Promise<void>;
}

/**
 * FFmpeg client implementation
 */
export class FFmpegClientImpl implements FFmpegClient {
  private config: NormalizedFFmpegConfig;
  private executor: ProcessExecutor;
  private jobManager: JobManager;
  private logger: Logger;
  private metrics: MetricsClient;
  private shutdownRequested = false;

  constructor(config: FFmpegConfig = {}) {
    this.config = normalizeConfig(config);
    this.logger = config.logger ?? noopLogger;
    this.metrics = config.metrics ?? noopMetrics;

    // Verify binaries exist
    this.verifyBinary(this.config.ffmpegPath, 'ffmpeg');
    this.verifyBinary(this.config.ffprobePath, 'ffprobe');

    // Initialize executor
    this.executor = createProcessExecutor({
      ffmpegPath: this.config.ffmpegPath,
      timeout: this.config.timeout,
      maxMemoryMB: this.config.maxMemoryMB,
      cpuThreads: this.config.cpuThreads,
    });

    // Initialize job manager
    this.jobManager = new JobManager({
      maxConcurrent: this.config.maxConcurrent,
      tempDir: this.config.tempDir,
    });

    this.logger.info('FFmpeg client initialized', {
      ffmpegPath: this.config.ffmpegPath,
      maxConcurrent: this.config.maxConcurrent,
    });
  }

  /**
   * Verify FFmpeg/FFprobe binary exists and meets version requirements
   */
  private verifyBinary(binaryPath: string, _name: string): void {
    try {
      const result = execSync(`${binaryPath} -version`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      const versionMatch = result.match(/version\s+(\d+\.\d+(\.\d+)?)/i);
      if (versionMatch) {
        const version = versionMatch[1];
        if (this.compareVersions(version, MIN_FFMPEG_VERSION) < 0) {
          throw new UnsupportedVersionError(version, MIN_FFMPEG_VERSION);
        }
      }
    } catch (error) {
      if (error instanceof UnsupportedVersionError) {
        throw error;
      }
      throw new BinaryNotFoundError(
        binaryPath,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Compare version strings
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }
    return 0;
  }

  /**
   * Probe a media file
   */
  async probe(input: InputSpec): Promise<MediaInfo> {
    this.checkShutdown();

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
    ];

    // Add input source
    switch (input.type) {
      case 'file':
        args.push(input.path!);
        break;
      case 'url':
        args.push(input.url!);
        break;
      case 'pipe':
        args.push('pipe:0');
        break;
    }

    const startTime = Date.now();

    try {
      const result = await this.executeProbe(args, input.stream);

      if (result.exitCode !== 0) {
        const error = parseFFmpegError(result.stderr, result.exitCode);
        if (error) throw error;
        throw new NonZeroExitError(result.exitCode, result.stderr);
      }

      const data = JSON.parse(result.stdout);
      const mediaInfo = this.parseMediaInfo(data);

      this.metrics.histogram('ffmpeg.probe.duration', Date.now() - startTime);
      this.logger.debug('Probe completed', {
        duration: mediaInfo.duration,
        streams: mediaInfo.streams.length,
      });

      return mediaInfo;
    } catch (error) {
      this.metrics.increment('ffmpeg.errors', { operation: 'probe' });
      throw error;
    }
  }

  /**
   * Execute FFprobe command
   */
  private executeProbe(
    args: string[],
    stdin?: NodeJS.ReadableStream
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.ffprobePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const startTime = Date.now();

      proc.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));

      if (stdin) {
        stdin.pipe(proc.stdin);
      } else {
        proc.stdin.end();
      }

      proc.on('error', (err) => reject(err));
      proc.on('exit', (code) => {
        resolve({
          exitCode: code ?? 0,
          stdout: Buffer.concat(stdoutChunks).toString(),
          stderr: Buffer.concat(stderrChunks).toString(),
          duration: Date.now() - startTime,
          killed: false,
        });
      });
    });
  }

  /**
   * Parse FFprobe JSON output to MediaInfo
   */
  private parseMediaInfo(data: Record<string, unknown>): MediaInfo {
    const format = data.format as Record<string, unknown>;
    const streams = (data.streams as Record<string, unknown>[]) || [];

    return {
      format: {
        name: String(format.format_name || ''),
        longName: String(format.format_long_name || ''),
        duration: parseFloat(String(format.duration || 0)),
        size: parseInt(String(format.size || 0)),
        bitrate: parseInt(String(format.bit_rate || 0)),
        tags: (format.tags as Record<string, string>) || {},
      },
      streams: streams.map((s) => this.parseStream(s)),
      duration: parseFloat(String(format.duration || 0)),
      size: parseInt(String(format.size || 0)),
      bitrate: parseInt(String(format.bit_rate || 0)),
    };
  }

  /**
   * Parse stream information
   */
  private parseStream(raw: Record<string, unknown>): StreamInfo {
    const type = String(raw.codec_type) as StreamInfo['type'];
    const base = {
      index: Number(raw.index || 0),
      type,
      codec: String(raw.codec_name || ''),
      codecLongName: String(raw.codec_long_name || ''),
      profile: raw.profile ? String(raw.profile) : undefined,
      bitrate: raw.bit_rate ? parseInt(String(raw.bit_rate)) : undefined,
      duration: raw.duration ? parseFloat(String(raw.duration)) : undefined,
      tags: (raw.tags as Record<string, string>) || {},
    };

    switch (type) {
      case 'video':
        return {
          ...base,
          type: 'video',
          width: Number(raw.width || 0),
          height: Number(raw.height || 0),
          fps: this.parseFps(String(raw.r_frame_rate || '0/1')),
          pixelFormat: String(raw.pix_fmt || ''),
          aspectRatio: raw.display_aspect_ratio ? String(raw.display_aspect_ratio) : undefined,
        } as VideoStreamInfo;

      case 'audio':
        return {
          ...base,
          type: 'audio',
          sampleRate: parseInt(String(raw.sample_rate || 0)),
          channels: Number(raw.channels || 0),
          channelLayout: String(raw.channel_layout || ''),
        } as AudioStreamInfo;

      default:
        return base as StreamInfo;
    }
  }

  /**
   * Parse frame rate string (e.g., "30/1" -> 30)
   */
  private parseFps(fpsStr: string): number {
    const parts = fpsStr.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      return den > 0 ? num / den : 0;
    }
    return parseFloat(fpsStr) || 0;
  }

  /**
   * Transcode a media file
   */
  async transcode(job: TranscodeJob): Promise<JobResult> {
    this.checkShutdown();

    const jobId = job.id ?? randomUUID();
    this.logger.info('Starting transcode job', { jobId, preset: job.preset });
    this.metrics.increment('ffmpeg.jobs.total', { operation: 'transcode' });

    // Register job
    this.jobManager.registerJob(jobId, {
      id: jobId,
      operation: 'transcode',
      input: job.input,
      output: job.output,
    });

    try {
      // Apply preset if specified
      let outputSpec = job.output;
      if (job.preset) {
        outputSpec = mergeWithPreset(job.preset, job.output);
      }

      // Build command
      const builder = createCommandBuilder()
        .addInput(job.input)
        .addOutput(outputSpec)
        .overwrite();

      if (this.config.cpuThreads > 0) {
        builder.setThreads(this.config.cpuThreads);
      }

      if (job.twoPass) {
        return await this.executeTwoPass(jobId, builder, job);
      }

      const command = builder.build();
      const result = await this.executeJob(jobId, command, job.onProgress);

      // Validate output
      if (job.output.type === 'file') {
        await this.validateOutput(job.output.path!);
      }

      this.jobManager.completeJob(jobId, 'completed');

      return {
        jobId,
        status: 'completed',
        outputPath: job.output.path,
        duration: result.duration,
        stats: this.parseStats(result.stderr),
      };
    } catch (error) {
      this.jobManager.completeJob(jobId, 'failed', error as Error);
      throw error;
    }
  }

  /**
   * Execute two-pass encoding
   */
  private async executeTwoPass(
    jobId: string,
    builder: FFmpegCommandBuilderImpl,
    job: TranscodeJob
  ): Promise<JobResult> {
    const passLogFile = `${this.config.tempDir}/${jobId}-pass`;

    // First pass - analysis
    this.logger.debug('Starting first pass', { jobId });

    const pass1Builder = builder.clone()
      .setGlobalOption('-pass', '1')
      .setGlobalOption('-passlogfile', passLogFile)
      .clearOutputs()
      .addOutput({ type: 'file', path: '/dev/null', format: 'null' });

    await this.executeJob(jobId, pass1Builder.build());

    // Second pass - encoding
    this.logger.debug('Starting second pass', { jobId });

    const pass2Builder = builder.clone()
      .setGlobalOption('-pass', '2')
      .setGlobalOption('-passlogfile', passLogFile);

    const result = await this.executeJob(jobId, pass2Builder.build(), job.onProgress);

    return {
      jobId,
      status: 'completed',
      outputPath: job.output.path,
      duration: result.duration,
      stats: this.parseStats(result.stderr),
    };
  }

  /**
   * Extract audio from a video file
   */
  async extractAudio(job: AudioExtractJob): Promise<JobResult> {
    this.checkShutdown();

    const jobId = job.id ?? randomUUID();
    this.logger.info('Starting audio extraction', { jobId });
    this.metrics.increment('ffmpeg.jobs.total', { operation: 'extractAudio' });

    this.jobManager.registerJob(jobId, {
      id: jobId,
      operation: 'extractAudio',
      input: job.input,
      output: job.output,
    });

    try {
      const builder = createCommandBuilder()
        .addInput(job.input)
        .setGlobalOption('-vn') // No video
        .overwrite();

      // Select specific stream if specified
      if (job.streamIndex !== undefined) {
        builder.setGlobalOption('-map', `0:a:${job.streamIndex}`);
      }

      // Apply normalization filter
      if (job.normalize) {
        builder.setFilter(new FilterGraph().loudnorm({
          I: -16,
          TP: -1.5,
          LRA: 11,
        }));
      }

      builder.addOutput(job.output);
      const command = builder.build();

      const result = await this.executeJob(jobId, command, job.onProgress);
      this.jobManager.completeJob(jobId, 'completed');

      return {
        jobId,
        status: 'completed',
        outputPath: job.output.path,
        duration: result.duration,
      };
    } catch (error) {
      this.jobManager.completeJob(jobId, 'failed', error as Error);
      throw error;
    }
  }

  /**
   * Generate a thumbnail from a video
   */
  async generateThumbnail(job: ThumbnailJob): Promise<JobResult> {
    this.checkShutdown();

    const jobId = job.id ?? randomUUID();
    this.logger.info('Starting thumbnail generation', { jobId });
    this.metrics.increment('ffmpeg.jobs.total', { operation: 'generateThumbnail' });

    this.jobManager.registerJob(jobId, {
      id: jobId,
      operation: 'generateThumbnail',
      input: job.input,
      output: job.output,
    });

    try {
      // Get timestamp - default to 10% of duration
      let timestamp = job.timestamp;
      if (timestamp === undefined) {
        const info = await this.probe(job.input);
        timestamp = info.duration * 0.1;
      }

      // Calculate dimensions
      const width = job.width ?? 320;
      const height = job.height ?? -1; // Maintain aspect ratio

      const builder = createCommandBuilder()
        .addInput({
          ...job.input,
          seekTo: timestamp,
        })
        .setGlobalOption('-frames:v', '1')
        .setFilter(new FilterGraph().scale(width, height))
        .addOutput({
          ...job.output,
          videoCodec: 'mjpeg',
          options: { 'q:v': '2' },
        })
        .overwrite();

      const command = builder.build();
      const result = await this.executeJob(jobId, command);

      this.jobManager.completeJob(jobId, 'completed');

      return {
        jobId,
        status: 'completed',
        outputPath: job.output.path,
        duration: result.duration,
        stats: { inputMetadata: { timestamp } },
      };
    } catch (error) {
      this.jobManager.completeJob(jobId, 'failed', error as Error);
      throw error;
    }
  }

  /**
   * Resize a video
   */
  async resize(job: ResizeJob): Promise<JobResult> {
    this.checkShutdown();

    const jobId = job.id ?? randomUUID();
    this.logger.info('Starting resize', { jobId });
    this.metrics.increment('ffmpeg.jobs.total', { operation: 'resize' });

    this.jobManager.registerJob(jobId, {
      id: jobId,
      operation: 'resize',
      input: job.input,
      output: job.output,
    });

    try {
      const filter = new FilterGraph();

      // Build scale params based on options
      if (job.width && job.height && job.maintainAspect !== false) {
        // Fit within bounds, maintain aspect
        filter.addFilter('scale', {
          w: `min(${job.width},iw)`,
          h: `min(${job.height},ih)`,
          force_original_aspect_ratio: 'decrease',
        });
      } else if (job.width && !job.height) {
        filter.scale(job.width, -2);
      } else if (job.height && !job.width) {
        filter.scale(-2, job.height);
      } else if (job.width && job.height) {
        filter.scale(job.width, job.height);
      }

      const builder = createCommandBuilder()
        .addInput(job.input)
        .setFilter(filter)
        .addOutput(job.output)
        .overwrite();

      const command = builder.build();
      const result = await this.executeJob(jobId, command, job.onProgress);

      this.jobManager.completeJob(jobId, 'completed');

      return {
        jobId,
        status: 'completed',
        outputPath: job.output.path,
        duration: result.duration,
      };
    } catch (error) {
      this.jobManager.completeJob(jobId, 'failed', error as Error);
      throw error;
    }
  }

  /**
   * Crop a video
   */
  async crop(job: CropJob): Promise<JobResult> {
    this.checkShutdown();

    const jobId = job.id ?? randomUUID();
    this.logger.info('Starting crop', { jobId });
    this.metrics.increment('ffmpeg.jobs.total', { operation: 'crop' });

    this.jobManager.registerJob(jobId, {
      id: jobId,
      operation: 'crop',
      input: job.input,
      output: job.output,
    });

    try {
      const builder = createCommandBuilder()
        .addInput(job.input)
        .setFilter(new FilterGraph().crop(job.width, job.height, job.x, job.y))
        .addOutput(job.output)
        .overwrite();

      const command = builder.build();
      const result = await this.executeJob(jobId, command, job.onProgress);

      this.jobManager.completeJob(jobId, 'completed');

      return {
        jobId,
        status: 'completed',
        outputPath: job.output.path,
        duration: result.duration,
      };
    } catch (error) {
      this.jobManager.completeJob(jobId, 'failed', error as Error);
      throw error;
    }
  }

  /**
   * Execute a custom FFmpeg command
   */
  async executeCommand(command: FFmpegCommand, options?: ExecuteOptions): Promise<JobResult> {
    this.checkShutdown();

    const jobId = options?.jobId ?? randomUUID();
    this.metrics.increment('ffmpeg.jobs.total', { operation: 'custom' });

    try {
      const result = await this.executor.execute(command, {
        timeout: options?.timeout ?? this.config.timeout,
        onProgress: options?.onProgress,
        signal: options?.signal,
        jobId,
      });

      return {
        jobId,
        status: 'completed',
        duration: result.duration,
        stats: this.parseStats(result.stderr),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute a job using the executor
   */
  private async executeJob(
    jobId: string,
    command: FFmpegCommand,
    onProgress?: ProgressListener
  ): Promise<ProcessResult> {
    return this.executor.execute(command, {
      timeout: this.config.timeout,
      onProgress: onProgress ?? ((progress) => {
        this.jobManager.updateProgress(jobId, progress);
      }),
      jobId,
    });
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const cancelled = this.jobManager.cancelJob(jobId);
    if (cancelled) {
      (this.executor as ProcessExecutorImpl).cancelJob?.(jobId);
      this.logger.info('Job cancelled', { jobId });
    }
    return cancelled;
  }

  /**
   * Get the status of a job
   */
  getJobStatus(jobId: string): JobStatus | null {
    return this.jobManager.getJobStatus(jobId);
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    this.logger.info('Shutting down FFmpeg client');

    // Kill all jobs
    await this.jobManager.killAll();

    this.logger.info('FFmpeg client shut down');
  }

  /**
   * Check if shutdown was requested
   */
  private checkShutdown(): void {
    if (this.shutdownRequested) {
      throw new Error('Client has been shut down');
    }
  }

  /**
   * Validate output file exists
   */
  private async validateOutput(outputPath: string): Promise<void> {
    try {
      const { accessSync, constants } = await import('fs');
      accessSync(outputPath, constants.R_OK);
    } catch {
      throw new FileNotFoundError(outputPath);
    }
  }

  /**
   * Parse stats from FFmpeg stderr output
   */
  private parseStats(stderr: string): JobStats | undefined {
    const stats: JobStats = {};

    // Parse frame count
    const frameMatch = stderr.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      stats.frames = parseInt(frameMatch[1]);
    }

    // Parse average FPS
    const fpsMatch = stderr.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      stats.averageFps = parseFloat(fpsMatch[1]);
    }

    // Parse output size
    const sizeMatch = stderr.match(/size=\s*(\d+)kB/);
    if (sizeMatch) {
      stats.outputSize = parseInt(sizeMatch[1]) * 1024;
    }

    // Parse bitrate
    const bitrateMatch = stderr.match(/bitrate=\s*([\d.]+)kbits\/s/);
    if (bitrateMatch) {
      stats.outputBitrate = parseFloat(bitrateMatch[1]);
    }

    // Parse speed
    const speedMatch = stderr.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      stats.speed = parseFloat(speedMatch[1]);
    }

    return Object.keys(stats).length > 0 ? stats : undefined;
  }
}

/**
 * Normalize and validate configuration
 */
function normalizeConfig(config: FFmpegConfig): NormalizedFFmpegConfig {
  const errors: string[] = [];

  if (config.maxConcurrent !== undefined && config.maxConcurrent < 1) {
    errors.push('maxConcurrent must be >= 1');
  }

  if (config.timeout !== undefined && config.timeout < 1000) {
    errors.push('timeout must be >= 1000ms');
  }

  if (config.maxMemoryMB !== undefined && config.maxMemoryMB < 256) {
    errors.push('maxMemoryMB must be >= 256');
  }

  if (errors.length > 0) {
    throw new ConfigurationError({
      message: errors.join('; '),
      code: 'INVALID_CONFIG',
      context: { errors },
    });
  }

  return {
    ffmpegPath: config.ffmpegPath ?? DEFAULT_CONFIG.ffmpegPath,
    ffprobePath: config.ffprobePath ?? DEFAULT_CONFIG.ffprobePath,
    timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    maxConcurrent: config.maxConcurrent ?? DEFAULT_CONFIG.maxConcurrent,
    tempDir: config.tempDir ?? DEFAULT_CONFIG.tempDir,
    maxMemoryMB: config.maxMemoryMB ?? DEFAULT_CONFIG.maxMemoryMB,
    cpuThreads: config.cpuThreads ?? DEFAULT_CONFIG.cpuThreads,
    defaultPreset: config.defaultPreset ?? DEFAULT_CONFIG.defaultPreset,
    logger: config.logger,
    metrics: config.metrics,
  };
}

/**
 * Create a new FFmpeg client
 */
export function createFFmpegClient(config?: FFmpegConfig): FFmpegClient {
  return new FFmpegClientImpl(config);
}
