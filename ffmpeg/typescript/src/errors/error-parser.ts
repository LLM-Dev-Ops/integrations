import {
  FFmpegError,
  FileNotFoundError,
  InvalidFormatError,
  CorruptedInputError,
  UnsupportedCodecError,
  StreamNotFoundError,
  WriteFailureError,
  DiskFullError,
  InvalidOutputError,
  NonZeroExitError,
  MemoryExceededError,
  InsufficientPermissionsError,
} from './errors.js';

/**
 * Error pattern matcher for FFmpeg stderr output
 */
interface ErrorPattern {
  pattern: RegExp;
  createError: (stderr: string, exitCode: number, match: RegExpMatchArray) => FFmpegError;
}

/**
 * Collection of error patterns for FFmpeg stderr parsing
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // File not found errors
  {
    pattern: /No such file or directory/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?: No such file or directory/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new FileNotFoundError(filePath);
    },
  },
  {
    pattern: /(?:Input )?file (?:not found|does not exist)/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?:?\s*(?:Input )?file (?:not found|does not exist)/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new FileNotFoundError(filePath);
    },
  },

  // Corrupted input errors
  {
    pattern: /Invalid data found/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new CorruptedInputError(filePath, 'Invalid data found when processing input');
    },
  },
  {
    pattern: /moov atom not found/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new CorruptedInputError(filePath, 'moov atom not found - file may be corrupted or incomplete');
    },
  },
  {
    pattern: /Header missing/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new CorruptedInputError(filePath, 'Header missing from input file');
    },
  },
  {
    pattern: /Truncated/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new CorruptedInputError(filePath, 'File appears to be truncated or incomplete');
    },
  },
  {
    pattern: /End of file/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new CorruptedInputError(filePath, 'Unexpected end of file');
    },
  },

  // Unsupported codec errors
  {
    pattern: /Unknown encoder ['"]?([^'"]+?)['"]?/i,
    createError: (_stderr, _exitCode, match) => {
      const codec = match[1];
      return new UnsupportedCodecError(codec, 'video');
    },
  },
  {
    pattern: /Unknown decoder ['"]?([^'"]+?)['"]?/i,
    createError: (_stderr, _exitCode, match) => {
      const codec = match[1];
      return new UnsupportedCodecError(codec, 'video');
    },
  },
  {
    pattern: /Encoder.*not found/i,
    createError: (stderr) => {
      const codecMatch = stderr.match(/Encoder\s+['"]?([^'"]+?)['"]?\s+not found/i);
      const codec = codecMatch?.[1] ?? 'unknown';
      return new UnsupportedCodecError(codec, 'video');
    },
  },
  {
    pattern: /Decoder.*not found/i,
    createError: (stderr) => {
      const codecMatch = stderr.match(/Decoder\s+['"]?([^'"]+?)['"]?\s+not found/i);
      const codec = codecMatch?.[1] ?? 'unknown';
      return new UnsupportedCodecError(codec, 'video');
    },
  },
  {
    pattern: /Unknown (?:audio|video) codec/i,
    createError: (stderr) => {
      const typeMatch = stderr.match(/Unknown (audio|video) codec/i);
      const streamType = (typeMatch?.[1]?.toLowerCase() ?? 'video') as 'audio' | 'video';
      const codecMatch = stderr.match(/codec\s+['"]?([^'"]+?)['"]?/i);
      const codec = codecMatch?.[1] ?? 'unknown';
      return new UnsupportedCodecError(codec, streamType);
    },
  },

  // Invalid format errors
  {
    pattern: /Invalid (?:file |)format/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new InvalidFormatError(filePath);
    },
  },
  {
    pattern: /Unknown format/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const filePath = pathMatch?.[1] ?? 'unknown';
      return new InvalidFormatError(filePath);
    },
  },

  // Stream not found errors
  {
    pattern: /Stream (?:specifier|map) ['"]?([^'"]+?)['"]? (?:does not )?match(?:es)? any/i,
    createError: (_stderr, _exitCode, match) => {
      const streamSpec = match[1];
      return new StreamNotFoundError(streamSpec);
    },
  },
  {
    pattern: /Output file #\d+ does not contain any stream/i,
    createError: () => {
      return new StreamNotFoundError('output', 'stream');
    },
  },

  // Disk full errors
  {
    pattern: /No space left on device/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const outputPath = pathMatch?.[1] ?? 'unknown';
      return new DiskFullError(outputPath);
    },
  },

  // Permission errors
  {
    pattern: /Permission denied/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?:\s*Permission denied/);
      const resource = pathMatch?.[1] ?? 'unknown';
      return new InsufficientPermissionsError(resource, 'access');
    },
  },

  // Write failure errors
  {
    pattern: /(?:Could not|Cannot|Unable to) (?:open|write)/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const outputPath = pathMatch?.[1] ?? 'unknown';
      const reason = stderr.match(/:\s*(.+?)$/m)?.[1] ?? 'Unknown write error';
      return new WriteFailureError(outputPath, reason);
    },
  },

  // Memory errors
  {
    pattern: /Cannot allocate memory/i,
    createError: () => {
      return new MemoryExceededError(0); // 0 indicates unknown limit
    },
  },
  {
    pattern: /Out of memory/i,
    createError: () => {
      return new MemoryExceededError(0);
    },
  },

  // Invalid output errors
  {
    pattern: /Output file is empty/i,
    createError: (stderr) => {
      const pathMatch = stderr.match(/['"]?([^'":\n]+?)['"]?/);
      const outputPath = pathMatch?.[1] ?? 'unknown';
      return new InvalidOutputError(outputPath, 'Output file is empty');
    },
  },
];

/**
 * Parses FFmpeg stderr output and exit code to create an appropriate error object.
 *
 * This function analyzes the error output from FFmpeg and maps it to specific error
 * types based on known patterns. If no specific pattern matches, it returns a generic
 * NonZeroExitError.
 *
 * @param stderr - The standard error output from FFmpeg
 * @param exitCode - The exit code from the FFmpeg process
 * @returns An appropriate FFmpegError subclass based on the error pattern
 *
 * @example
 * ```typescript
 * const error = parseFFmpegError("No such file or directory", 1);
 * if (error instanceof FileNotFoundError) {
 *   console.log(`File not found: ${error.context.filePath}`);
 * }
 * ```
 */
export function parseFFmpegError(stderr: string, exitCode: number): FFmpegError {
  // Try to match against known error patterns
  for (const { pattern, createError } of ERROR_PATTERNS) {
    const match = stderr.match(pattern);
    if (match) {
      try {
        return createError(stderr, exitCode, match);
      } catch (err) {
        // If error creation fails, continue to next pattern
        continue;
      }
    }
  }

  // Default to NonZeroExitError if no specific pattern matches
  return new NonZeroExitError(exitCode, stderr);
}

/**
 * Extracts the file path from FFmpeg stderr output.
 * This is a helper function used by error parsers to identify the file being processed.
 *
 * @param stderr - The standard error output from FFmpeg
 * @returns The extracted file path or 'unknown' if not found
 */
export function extractFilePath(stderr: string): string {
  // Try various patterns to extract file path
  const patterns = [
    /['"]([^'"]+?)['"]/,  // Quoted path
    /^([^\s:]+?):/m,      // Path at start of line followed by colon
    /\s([^\s]+?):/,       // Path preceded by space, followed by colon
  ];

  for (const pattern of patterns) {
    const match = stderr.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return 'unknown';
}

/**
 * Checks if an error is retryable based on its type.
 *
 * @param error - The FFmpeg error to check
 * @returns true if the error is retryable, false otherwise
 *
 * @example
 * ```typescript
 * const error = parseFFmpegError(stderr, exitCode);
 * if (isRetryable(error)) {
 *   // Attempt retry logic
 * }
 * ```
 */
export function isRetryable(error: FFmpegError): boolean {
  // Retryable errors are typically transient resource issues
  const retryableErrorNames = [
    'MemoryExceededError',
    'TimeoutExceededError',
    'ConcurrencyLimitReachedError',
    'TempDirUnavailableError',
    'WriteFailureError', // May be transient
  ];

  return retryableErrorNames.includes(error.name);
}

/**
 * Determines if an error is a user error (e.g., invalid input) vs system error.
 *
 * @param error - The FFmpeg error to check
 * @returns true if the error is caused by user input, false if it's a system error
 */
export function isUserError(error: FFmpegError): boolean {
  // User errors are typically configuration or input issues
  const userErrorNames = [
    'FileNotFoundError',
    'InvalidFormatError',
    'CorruptedInputError',
    'UnsupportedCodecError',
    'StreamNotFoundError',
    'BinaryNotFoundError',
    'InvalidPathError',
    'UnsupportedVersionError',
  ];

  return userErrorNames.includes(error.name);
}
