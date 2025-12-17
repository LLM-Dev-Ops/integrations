/**
 * FFmpeg Integration Module - Type Definitions
 * Based on SPARC pseudocode specification
 */

// ============================================================================
// Job Types
// ============================================================================

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout";

export interface FFmpegJob {
  id?: string;
  operation: string;
  input: InputSpec;
  output: OutputSpec;
  options?: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  job: FFmpegJob;
  status: JobStatus;
  progress: Progress | null;
  pid: number | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: Error | null;
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
  outputPath?: string;
  duration?: number;
  stats?: Record<string, unknown>;
  timestamp?: number;
}

// ============================================================================
// Input/Output Specifications
// ============================================================================

import type { Readable, Writable } from 'stream';

export interface InputSpec {
  type: "file" | "pipe" | "url";
  path?: string;
  url?: string;
  stream?: Readable;
  format?: string;
  seekTo?: number;
  duration?: number;
  options?: Record<string, string>;
}

export interface OutputSpec {
  type: "file" | "pipe";
  path?: string;
  stream?: Writable;
  format?: string;
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  crf?: number;
  resolution?: string;
  fps?: number;
  options?: Record<string, string>;
}

// ============================================================================
// Progress Tracking
// ============================================================================

export interface Progress {
  time: number;
  frame?: number;
  fps?: number;
  bitrate?: number;
  speed?: number;
  percent?: number;
}

// ============================================================================
// Serialization Types
// ============================================================================

export interface SerializedJob {
  version: string;
  id: string;
  operation: string;
  command: string[];
  input: SerializedInput;
  output: SerializedOutput;
  options: Record<string, unknown>;
  createdAt: string;
}

export interface SerializedInput {
  type: "file" | "url";
  path?: string;
  url?: string;
  format?: string;
  seekTo?: number;
  duration?: number;
  options?: Record<string, string>;
}

export interface SerializedOutput {
  type: "file";
  path: string;
  format?: string;
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  crf?: number;
  resolution?: string;
  fps?: number;
  options?: Record<string, string>;
}

// ============================================================================
// Preset Types
// ============================================================================

export type PresetName = "web-hd" | "web-sd" | "mobile" | "archive" | "podcast" | "music" | "voice";

// ============================================================================
// Filter Graph Types
// ============================================================================

export interface FilterNode {
  id: string;
  name: string;
  params: Record<string, unknown>;
  raw?: string;
}

export interface LoudnormParams {
  I?: number;
  TP?: number;
  LRA?: number;
  measured_I?: number;
  measured_TP?: number;
  measured_LRA?: number;
  measured_thresh?: number;
  offset?: number;
  linear?: string;
  print_format?: string;
}

// ============================================================================
// Command Types
// ============================================================================

export interface FFmpegCommand {
  inputs: InputSpec[];
  outputs: OutputSpec[];
  globalOptions: string[];
  filterGraph: FilterGraph | null;
  toArgs(): string[];
  toString(): string;
  toJSON(): object;
}

export interface FilterGraph {
  addFilter(name: string, params?: Record<string, unknown>): FilterGraph;
  chain(...filterNames: string[]): FilterGraph;
  scale(width: number, height: number): FilterGraph;
  crop(width: number, height: number, x?: number, y?: number): FilterGraph;
  fps(rate: number): FilterGraph;
  loudnorm(params: LoudnormParams): FilterGraph;
  overlay(x: number, y: number): FilterGraph;
  raw(filterString: string): FilterGraph;
  toString(): string;
}

// ============================================================================
// Error Types
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class FFmpegError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "FFmpegError";
  }
}

export class SpawnFailedError extends FFmpegError {
  constructor(cause: Error) {
    super(`Failed to spawn FFmpeg process: ${cause.message}`, cause);
    this.name = "SpawnFailedError";
  }
}

export class ProcessError extends FFmpegError {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "ProcessError";
  }
}

export class TimeoutError extends FFmpegError {
  constructor(timeout: number) {
    super(`FFmpeg process timed out after ${timeout}ms`);
    this.name = "TimeoutError";
  }
}

// ============================================================================
// Executor Types
// ============================================================================

export interface ProcessExecutor {
  execute(command: FFmpegCommand, options: ExecuteOptions): Promise<ProcessResult>;
  kill(pid: number, signal?: string): void;
}

export interface ExecuteOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  onProgress?: ProgressListener;
  signal?: AbortSignal;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;
}

export interface ExecutorConfig {
  ffmpegPath?: string;
  timeout?: number;
  maxMemoryMB?: number;
  cpuThreads?: number;
}

export type ProgressListener = (progress: Progress) => void;
