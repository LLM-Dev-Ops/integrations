/**
 * Process executor types for FFmpeg operations.
 *
 * Defines interfaces for spawning and managing FFmpeg processes with
 * timeout, resource limits, and stream handling.
 */

import type { Readable, Writable } from 'stream';
import type { FFmpegCommand } from './command.js';
import type { ProgressListener } from './progress.js';

/**
 * Process executor interface for running FFmpeg commands
 */
export interface ProcessExecutor {
  /**
   * Execute an FFmpeg command
   * @param command - The FFmpeg command to execute
   * @param options - Execution options
   * @returns Process execution result
   */
  execute(command: FFmpegCommand, options?: ExecuteOptions): Promise<ProcessResult>;

  /**
   * Kill a running process
   * @param pid - Process ID to kill
   * @param signal - Signal to send (defaults to SIGTERM)
   */
  kill(pid: number, signal?: NodeJS.Signals): void;

  /**
   * Cancel a job by its ID
   * @param jobId - Job identifier
   */
  cancelJob?(jobId: string): void;
}

/**
 * Options for process execution
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Working directory for the process */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Input stream to pipe to stdin */
  stdin?: Readable;

  /** Output stream to receive stdout */
  stdout?: Writable;

  /** Progress callback function */
  onProgress?: ProgressListener;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Job identifier for tracking */
  jobId?: string;
}

/**
 * Result of process execution
 */
export interface ProcessResult {
  /** Exit code (0 for success) */
  exitCode: number;

  /** Standard output (usually empty for FFmpeg) */
  stdout: string;

  /** Standard error (contains FFmpeg logs and progress) */
  stderr: string;

  /** Execution duration in milliseconds */
  duration: number;

  /** Whether the process was killed */
  killed: boolean;

  /** Signal that terminated the process */
  signal?: NodeJS.Signals;
}

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Path to FFmpeg binary */
  ffmpegPath: string;

  /** Default timeout in milliseconds */
  timeout?: number;

  /** Maximum memory per process in MB */
  maxMemoryMB?: number;

  /** CPU threads for FFmpeg */
  cpuThreads?: number;
}

/**
 * Captured command for testing/mocking
 */
export interface CapturedCommand {
  /** Command arguments */
  args: string[];

  /** Execution options */
  options: ExecuteOptions;

  /** When the command was executed */
  timestamp: number;
}

/**
 * Mock executor for testing
 */
export interface MockExecutor extends ProcessExecutor {
  /** Captured commands */
  capturedCommands: CapturedCommand[];

  /** Set a mock result for commands matching a pattern */
  setMockResult(pattern: string | RegExp, result: ProcessResult): void;

  /** Set a failure result for commands matching a pattern */
  setFailure(pattern: string | RegExp, error: Error): void;

  /** Assert a command was executed */
  assertCommandExecuted(pattern: string | RegExp): void;

  /** Assert a command contains specific arguments */
  assertCommandContains(args: string[]): void;

  /** Get number of executed commands */
  getCommandCount(): number;

  /** Reset captured commands */
  reset(): void;
}
