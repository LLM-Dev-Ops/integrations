/**
 * Base error class for all FFmpeg-related errors.
 * Provides structured error information including error code, cause, and context.
 */
export class FFmpegError extends Error {
  /**
   * Unique error code identifying the specific error type
   */
  public readonly code: string;

  /**
   * The underlying error that caused this error, if any
   */
  public readonly cause?: Error;

  /**
   * Additional contextual information about the error
   */
  public readonly context: Record<string, unknown>;

  constructor(options: {
    message: string;
    code: string;
    cause?: Error;
    context?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'FFmpegError';
    this.code = options.code;
    this.cause = options.cause;
    this.context = options.context ?? {};

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
    };
  }
}

// ==================== Configuration Errors ====================

/**
 * Base class for configuration-related errors
 */
export class ConfigurationError extends FFmpegError {
  constructor(options: {
    message: string;
    code: string;
    cause?: Error;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when the FFmpeg binary is not found in the system PATH
 */
export class BinaryNotFoundError extends ConfigurationError {
  constructor(binaryPath: string, cause?: Error) {
    super({
      message: `FFmpeg binary not found at: ${binaryPath}`,
      code: 'BINARY_NOT_FOUND',
      cause,
      context: { binaryPath },
    });
    this.name = 'BinaryNotFoundError';
  }
}

/**
 * Error thrown when a path is invalid or inaccessible
 */
export class InvalidPathError extends ConfigurationError {
  constructor(path: string, reason: string, cause?: Error) {
    super({
      message: `Invalid path: ${path} - ${reason}`,
      code: 'INVALID_PATH',
      cause,
      context: { path, reason },
    });
    this.name = 'InvalidPathError';
  }
}

/**
 * Error thrown when the FFmpeg version is not supported
 */
export class UnsupportedVersionError extends ConfigurationError {
  constructor(version: string, minVersion: string, cause?: Error) {
    super({
      message: `Unsupported FFmpeg version: ${version} (minimum required: ${minVersion})`,
      code: 'UNSUPPORTED_VERSION',
      cause,
      context: { version, minVersion },
    });
    this.name = 'UnsupportedVersionError';
  }
}

// ==================== Input Errors ====================

/**
 * Base class for input-related errors
 */
export class InputError extends FFmpegError {
  constructor(options: {
    message: string;
    code: string;
    cause?: Error;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'InputError';
  }
}

/**
 * Error thrown when an input file is not found
 */
export class FileNotFoundError extends InputError {
  constructor(filePath: string, cause?: Error) {
    super({
      message: `Input file not found: ${filePath}`,
      code: 'FILE_NOT_FOUND',
      cause,
      context: { filePath },
    });
    this.name = 'FileNotFoundError';
  }
}

/**
 * Error thrown when the input file format is invalid or unrecognized
 */
export class InvalidFormatError extends InputError {
  constructor(filePath: string, format?: string, cause?: Error) {
    super({
      message: `Invalid or unrecognized format for file: ${filePath}${format ? ` (detected: ${format})` : ''}`,
      code: 'INVALID_FORMAT',
      cause,
      context: { filePath, format },
    });
    this.name = 'InvalidFormatError';
  }
}

/**
 * Error thrown when the input file is corrupted or malformed
 */
export class CorruptedInputError extends InputError {
  constructor(filePath: string, reason: string, cause?: Error) {
    super({
      message: `Corrupted or malformed input file: ${filePath} - ${reason}`,
      code: 'CORRUPTED_INPUT',
      cause,
      context: { filePath, reason },
    });
    this.name = 'CorruptedInputError';
  }
}

/**
 * Error thrown when a codec is not supported by FFmpeg
 */
export class UnsupportedCodecError extends InputError {
  constructor(codec: string, streamType: 'audio' | 'video' | 'subtitle', cause?: Error) {
    super({
      message: `Unsupported ${streamType} codec: ${codec}`,
      code: 'UNSUPPORTED_CODEC',
      cause,
      context: { codec, streamType },
    });
    this.name = 'UnsupportedCodecError';
  }
}

/**
 * Error thrown when a requested stream is not found in the input file
 */
export class StreamNotFoundError extends InputError {
  constructor(streamIndex: number | string, streamType?: string, cause?: Error) {
    super({
      message: `Stream not found: ${streamType ? `${streamType} stream ` : ''}${streamIndex}`,
      code: 'STREAM_NOT_FOUND',
      cause,
      context: { streamIndex, streamType },
    });
    this.name = 'StreamNotFoundError';
  }
}

// ==================== Process Errors ====================

/**
 * Base class for process execution errors
 */
export class ProcessError extends FFmpegError {
  constructor(options: {
    message: string;
    code: string;
    cause?: Error;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'ProcessError';
  }
}

/**
 * Error thrown when the FFmpeg process fails to spawn
 */
export class SpawnFailedError extends ProcessError {
  constructor(command: string, reason: string, cause?: Error) {
    super({
      message: `Failed to spawn FFmpeg process: ${reason}`,
      code: 'SPAWN_FAILED',
      cause,
      context: { command, reason },
    });
    this.name = 'SpawnFailedError';
  }
}

/**
 * Error thrown when the FFmpeg process exceeds the configured timeout
 */
export class TimeoutExceededError extends ProcessError {
  constructor(timeoutMs: number, cause?: Error) {
    super({
      message: `FFmpeg process exceeded timeout of ${timeoutMs}ms`,
      code: 'TIMEOUT_EXCEEDED',
      cause,
      context: { timeoutMs },
    });
    this.name = 'TimeoutExceededError';
  }
}

/**
 * Error thrown when the FFmpeg process exceeds memory limits
 */
export class MemoryExceededError extends ProcessError {
  constructor(memoryLimitMB: number, cause?: Error) {
    super({
      message: `FFmpeg process exceeded memory limit of ${memoryLimitMB}MB`,
      code: 'MEMORY_EXCEEDED',
      cause,
      context: { memoryLimitMB },
    });
    this.name = 'MemoryExceededError';
  }
}

/**
 * Error thrown when the FFmpeg process is terminated by a signal
 */
export class SignalTerminatedError extends ProcessError {
  constructor(signal: string, cause?: Error) {
    super({
      message: `FFmpeg process terminated by signal: ${signal}`,
      code: 'SIGNAL_TERMINATED',
      cause,
      context: { signal },
    });
    this.name = 'SignalTerminatedError';
  }
}

/**
 * Error thrown when the FFmpeg process exits with a non-zero exit code
 */
export class NonZeroExitError extends ProcessError {
  constructor(exitCode: number, stderr: string, cause?: Error) {
    super({
      message: `FFmpeg process exited with code ${exitCode}`,
      code: 'NON_ZERO_EXIT',
      cause,
      context: { exitCode, stderr },
    });
    this.name = 'NonZeroExitError';
  }
}

// ==================== Output Errors ====================

/**
 * Base class for output-related errors
 */
export class OutputError extends FFmpegError {
  constructor(options: {
    message: string;
    code: string;
    cause?: Error;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'OutputError';
  }
}

/**
 * Error thrown when writing to the output file fails
 */
export class WriteFailureError extends OutputError {
  constructor(outputPath: string, reason: string, cause?: Error) {
    super({
      message: `Failed to write output file: ${outputPath} - ${reason}`,
      code: 'WRITE_FAILURE',
      cause,
      context: { outputPath, reason },
    });
    this.name = 'WriteFailureError';
  }
}

/**
 * Error thrown when the disk is full
 */
export class DiskFullError extends OutputError {
  constructor(outputPath: string, cause?: Error) {
    super({
      message: `Disk full while writing output file: ${outputPath}`,
      code: 'DISK_FULL',
      cause,
      context: { outputPath },
    });
    this.name = 'DiskFullError';
  }
}

/**
 * Error thrown when the output file is invalid or corrupted
 */
export class InvalidOutputError extends OutputError {
  constructor(outputPath: string, reason: string, cause?: Error) {
    super({
      message: `Invalid or corrupted output file: ${outputPath} - ${reason}`,
      code: 'INVALID_OUTPUT',
      cause,
      context: { outputPath, reason },
    });
    this.name = 'InvalidOutputError';
  }
}

/**
 * Error thrown when output verification fails
 */
export class VerificationFailedError extends OutputError {
  constructor(outputPath: string, reason: string, cause?: Error) {
    super({
      message: `Output verification failed: ${outputPath} - ${reason}`,
      code: 'VERIFICATION_FAILED',
      cause,
      context: { outputPath, reason },
    });
    this.name = 'VerificationFailedError';
  }
}

// ==================== Resource Errors ====================

/**
 * Base class for resource-related errors
 */
export class ResourceError extends FFmpegError {
  constructor(options: {
    message: string;
    code: string;
    cause?: Error;
    context?: Record<string, unknown>;
  }) {
    super(options);
    this.name = 'ResourceError';
  }
}

/**
 * Error thrown when the concurrency limit is reached
 */
export class ConcurrencyLimitReachedError extends ResourceError {
  constructor(limit: number, cause?: Error) {
    super({
      message: `Concurrency limit reached: ${limit} concurrent jobs are already running`,
      code: 'CONCURRENCY_LIMIT_REACHED',
      cause,
      context: { limit },
    });
    this.name = 'ConcurrencyLimitReachedError';
  }
}

/**
 * Error thrown when the temporary directory is unavailable or inaccessible
 */
export class TempDirUnavailableError extends ResourceError {
  constructor(tempDir: string, reason: string, cause?: Error) {
    super({
      message: `Temporary directory unavailable: ${tempDir} - ${reason}`,
      code: 'TEMP_DIR_UNAVAILABLE',
      cause,
      context: { tempDir, reason },
    });
    this.name = 'TempDirUnavailableError';
  }
}

/**
 * Error thrown when there are insufficient permissions to perform an operation
 */
export class InsufficientPermissionsError extends ResourceError {
  constructor(resource: string, operation: string, cause?: Error) {
    super({
      message: `Insufficient permissions to ${operation} resource: ${resource}`,
      code: 'INSUFFICIENT_PERMISSIONS',
      cause,
      context: { resource, operation },
    });
    this.name = 'InsufficientPermissionsError';
  }
}
