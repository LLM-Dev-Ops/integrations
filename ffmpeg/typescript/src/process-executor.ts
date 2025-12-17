/**
 * Process Executor
 *
 * Manages FFmpeg process execution with timeout handling, resource management,
 * progress parsing, and abort signal support.
 *
 * @example Basic execution
 * ```typescript
 * const executor = new ProcessExecutorImpl({ ffmpegPath: 'ffmpeg' });
 * const command = new FFmpegCommandBuilderImpl()
 *   .addInput({ type: 'file', path: '/input.mp4' })
 *   .addOutput({ type: 'file', path: '/output.mp4', videoCodec: 'libx264' })
 *   .overwrite()
 *   .build();
 *
 * const result = await executor.execute(command, {
 *   timeout: 60000,
 *   onProgress: (progress) => console.log(`Progress: ${progress.percent}%`)
 * });
 * ```
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
  ProcessExecutor,
  ExecuteOptions,
  ProcessResult,
  ExecutorConfig,
  CapturedCommand,
  MockExecutor,
} from './types/executor.js';
import type { FFmpegCommand } from './types/command.js';
import type { Progress, ProgressListener } from './types/progress.js';
import {
  SpawnFailedError,
  TimeoutExceededError,
  SignalTerminatedError,
  NonZeroExitError,
} from './errors/errors.js';
import { parseFFmpegError } from './errors/error-parser.js';

/**
 * Default executor configuration
 */
const DEFAULT_CONFIG: ExecutorConfig = {
  ffmpegPath: 'ffmpeg',
  timeout: 3600000, // 1 hour default
  maxMemoryMB: 2048,
  cpuThreads: 0, // auto
};

/**
 * Grace period before SIGKILL after SIGTERM
 */
const KILL_GRACE_PERIOD_MS = 5000;

/**
 * Implementation of the ProcessExecutor interface
 */
export class ProcessExecutorImpl implements ProcessExecutor {
  private config: Required<ExecutorConfig>;
  private activeProcesses: Map<number, ChildProcess> = new Map();
  private jobToProcess: Map<string, number> = new Map();

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = {
      ffmpegPath: config.ffmpegPath ?? DEFAULT_CONFIG.ffmpegPath!,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout!,
      maxMemoryMB: config.maxMemoryMB ?? DEFAULT_CONFIG.maxMemoryMB!,
      cpuThreads: config.cpuThreads ?? DEFAULT_CONFIG.cpuThreads!,
    };
  }

  /**
   * Execute an FFmpeg command
   */
  async execute(
    command: FFmpegCommand,
    options: ExecuteOptions = {}
  ): Promise<ProcessResult> {
    const args = command.toArgs();
    const startTime = Date.now();
    const timeout = options.timeout ?? this.config.timeout;

    // Spawn the FFmpeg process
    let proc: ChildProcess;
    try {
      proc = spawn(this.config.ffmpegPath, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new SpawnFailedError(
        this.config.ffmpegPath,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      );
    }

    // Process must have a PID
    if (proc.pid === undefined) {
      throw new SpawnFailedError(this.config.ffmpegPath, 'Process spawned without PID');
    }

    const pid = proc.pid;
    this.activeProcesses.set(pid, proc);

    // Track job ID to PID mapping
    if (options.jobId) {
      this.jobToProcess.set(options.jobId, pid);
    }

    // Set up timeout handling
    let timeoutId: NodeJS.Timeout | undefined;
    let forceKillId: NodeJS.Timeout | undefined;
    let wasTimedOut = false;

    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => {
        wasTimedOut = true;
        this.kill(pid, 'SIGTERM');
        // Force kill after grace period
        forceKillId = setTimeout(() => {
          this.kill(pid, 'SIGKILL');
        }, KILL_GRACE_PERIOD_MS);
      }, timeout);
    }

    // Handle abort signal
    let wasAborted = false;
    if (options.signal) {
      if (options.signal.aborted) {
        // Already aborted
        wasAborted = true;
        this.kill(pid, 'SIGTERM');
      } else {
        options.signal.addEventListener('abort', () => {
          wasAborted = true;
          this.kill(pid, 'SIGTERM');
        });
      }
    }

    // Connect stdin if provided
    if (options.stdin && proc.stdin) {
      options.stdin.pipe(proc.stdin);
      options.stdin.on('error', () => {
        // Ignore stdin errors (process may have exited)
      });
    }

    // Connect stdout if provided
    if (options.stdout && proc.stdout) {
      proc.stdout.pipe(options.stdout);
    }

    // Collect stderr and parse progress
    const stderrChunks: Buffer[] = [];
    let totalDuration: number | undefined;

    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);

        if (options.onProgress) {
          const output = chunk.toString();
          const progress = this.parseProgress(output, totalDuration);
          if (progress) {
            options.onProgress(progress);
          }

          // Try to extract total duration from FFmpeg output
          if (totalDuration === undefined) {
            const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
            if (durationMatch) {
              totalDuration =
                parseInt(durationMatch[1]) * 3600 +
                parseInt(durationMatch[2]) * 60 +
                parseInt(durationMatch[3]) +
                parseInt(durationMatch[4]) / 100;
            }
          }
        }
      });
    }

    // Collect stdout (usually empty for FFmpeg)
    const stdoutChunks: Buffer[] = [];
    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
    }

    // Wait for process to exit
    try {
      const { exitCode, signal } = await this.waitForExit(proc);

      // Clean up timeouts
      if (timeoutId) clearTimeout(timeoutId);
      if (forceKillId) clearTimeout(forceKillId);

      const stderr = Buffer.concat(stderrChunks).toString();
      const stdout = Buffer.concat(stdoutChunks).toString();
      const duration = Date.now() - startTime;
      const wasKilled = signal !== null || wasTimedOut || wasAborted;

      // Handle timeout
      if (wasTimedOut) {
        throw new TimeoutExceededError(timeout!);
      }

      // Handle signals
      if (signal && !wasAborted) {
        throw new SignalTerminatedError(signal);
      }

      // Handle non-zero exit code
      if (exitCode !== null && exitCode !== 0) {
        // Try to parse specific error from stderr
        const parsedError = parseFFmpegError(stderr, exitCode);
        if (parsedError) {
          throw parsedError;
        }
        throw new NonZeroExitError(exitCode, stderr);
      }

      return {
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
        duration,
        killed: wasKilled,
        signal: signal ?? undefined,
      };
    } finally {
      // Cleanup
      this.activeProcesses.delete(pid);
      if (options.jobId) {
        this.jobToProcess.delete(options.jobId);
      }
    }
  }

  /**
   * Kill a process by PID
   */
  kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    const proc = this.activeProcesses.get(pid);
    if (proc) {
      proc.kill(signal);
    }
  }

  /**
   * Cancel a job by its ID
   */
  cancelJob(jobId: string): void {
    const pid = this.jobToProcess.get(jobId);
    if (pid !== undefined) {
      this.kill(pid, 'SIGTERM');
    }
  }

  /**
   * Get count of active processes
   */
  getActiveCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Wait for process to exit
   */
  private waitForExit(proc: ChildProcess): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
      proc.on('exit', (code, signal) => {
        resolve({ exitCode: code, signal: signal as NodeJS.Signals | null });
      });

      proc.on('error', (err) => {
        reject(
          new SpawnFailedError(
            this.config.ffmpegPath,
            err.message,
            err
          )
        );
      });
    });
  }

  /**
   * Parse FFmpeg progress output
   */
  private parseProgress(output: string, totalDuration?: number): Progress | null {
    // FFmpeg progress format:
    // frame=123 fps=30.0 q=28.0 size=1234kB time=00:00:05.00 bitrate=1000kbits/s speed=2.5x

    const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (!timeMatch) {
      return null;
    }

    const time =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 100;

    const progress: Progress = {
      time,
    };

    // Frame
    const frameMatch = output.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      progress.frame = parseInt(frameMatch[1]);
    }

    // FPS
    const fpsMatch = output.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      progress.fps = parseFloat(fpsMatch[1]);
    }

    // Bitrate
    const bitrateMatch = output.match(/bitrate=\s*([\d.]+)kbits/);
    if (bitrateMatch) {
      progress.bitrate = parseFloat(bitrateMatch[1]);
    }

    // Speed
    const speedMatch = output.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      progress.speed = parseFloat(speedMatch[1]);
    }

    // Calculate percentage if duration is known
    if (totalDuration && totalDuration > 0) {
      progress.percent = Math.min(100, (time / totalDuration) * 100);
    }

    return progress;
  }
}

/**
 * Mock executor for testing
 */
export class MockFFmpegExecutor implements MockExecutor {
  capturedCommands: CapturedCommand[] = [];
  private mockResults: Map<string, ProcessResult> = new Map();
  private defaultResult: ProcessResult = {
    exitCode: 0,
    stdout: '',
    stderr: 'frame=100 fps=30 time=00:00:10.00 speed=2x',
    duration: 1000,
    killed: false,
  };

  /**
   * Set a mock result for commands matching a pattern
   */
  setMockResult(pattern: string | RegExp, result: ProcessResult): void {
    this.mockResults.set(pattern.toString(), result);
  }

  /**
   * Set a failure result for commands matching a pattern
   */
  setFailure(pattern: string | RegExp, error: Error): void {
    this.mockResults.set(pattern.toString(), {
      exitCode: 1,
      stdout: '',
      stderr: error.message,
      duration: 100,
      killed: false,
    });
  }

  /**
   * Execute an FFmpeg command (mocked)
   */
  async execute(
    command: FFmpegCommand,
    options: ExecuteOptions = {}
  ): Promise<ProcessResult> {
    const args = command.toArgs();
    const commandStr = args.join(' ');

    // Capture the command
    this.capturedCommands.push({
      args,
      options,
      timestamp: Date.now(),
    });

    // Check for abort
    if (options.signal?.aborted) {
      return {
        exitCode: 130,
        stdout: '',
        stderr: 'Aborted',
        duration: 0,
        killed: true,
        signal: 'SIGTERM',
      };
    }

    // Check for matching mock result
    for (const [pattern, result] of this.mockResults) {
      const regex = pattern.startsWith('/') ? new RegExp(pattern.slice(1, -1)) : new RegExp(pattern);
      if (commandStr.match(regex)) {
        // Simulate progress events
        if (options.onProgress) {
          await this.simulateProgress(options.onProgress);
        }
        return result;
      }
    }

    // Return default success result
    if (options.onProgress) {
      await this.simulateProgress(options.onProgress);
    }

    return this.defaultResult;
  }

  /**
   * Kill a process (no-op in mock)
   */
  kill(_pid: number, _signal?: NodeJS.Signals): void {
    // No-op
  }

  /**
   * Cancel a job (no-op in mock)
   */
  cancelJob?(_jobId: string): void {
    // No-op
  }

  /**
   * Simulate progress events
   */
  private async simulateProgress(callback: ProgressListener): Promise<void> {
    const percentages = [25, 50, 75, 100];
    for (const percent of percentages) {
      await this.sleep(10);
      callback({
        time: percent / 10,
        percent,
        fps: 30,
        speed: 2.0,
      });
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Assert a command was executed
   */
  assertCommandExecuted(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const found = this.capturedCommands.some((cmd) =>
      cmd.args.join(' ').match(regex)
    );
    if (!found) {
      throw new Error(`No command matching ${pattern} was executed`);
    }
  }

  /**
   * Assert a command contains specific arguments
   */
  assertCommandContains(args: string[]): void {
    for (const expectedArg of args) {
      const found = this.capturedCommands.some((cmd) =>
        cmd.args.includes(expectedArg)
      );
      if (!found) {
        throw new Error(`No command contained argument: ${expectedArg}`);
      }
    }
  }

  /**
   * Get number of executed commands
   */
  getCommandCount(): number {
    return this.capturedCommands.length;
  }

  /**
   * Reset captured commands and mock results
   */
  reset(): void {
    this.capturedCommands = [];
    this.mockResults.clear();
  }
}

/**
 * Create a new process executor
 */
export function createProcessExecutor(config?: Partial<ExecutorConfig>): ProcessExecutorImpl {
  return new ProcessExecutorImpl(config);
}

/**
 * Create a mock executor for testing
 */
export function createMockExecutor(): MockFFmpegExecutor {
  return new MockFFmpegExecutor();
}
