// Base error class
export { FFmpegError } from './errors.js';

// Configuration errors
export {
  ConfigurationError,
  BinaryNotFoundError,
  InvalidPathError,
  UnsupportedVersionError,
} from './errors.js';

// Input errors
export {
  InputError,
  FileNotFoundError,
  InvalidFormatError,
  CorruptedInputError,
  UnsupportedCodecError,
  StreamNotFoundError,
} from './errors.js';

// Process errors
export {
  ProcessError,
  SpawnFailedError,
  TimeoutExceededError,
  MemoryExceededError,
  SignalTerminatedError,
  NonZeroExitError,
} from './errors.js';

// Output errors
export {
  OutputError,
  WriteFailureError,
  DiskFullError,
  InvalidOutputError,
  VerificationFailedError,
} from './errors.js';

// Resource errors
export {
  ResourceError,
  ConcurrencyLimitReachedError,
  TempDirUnavailableError,
  InsufficientPermissionsError,
} from './errors.js';

// Error parser utilities
export {
  parseFFmpegError,
  extractFilePath,
  isRetryable,
  isUserError,
} from './error-parser.js';
