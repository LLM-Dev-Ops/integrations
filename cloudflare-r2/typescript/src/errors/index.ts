/**
 * Error system for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/errors
 */

// Base error class
export { R2Error, type R2ErrorParams } from './error.js';

// Error categories
export {
  AuthError,
  BucketError,
  ConfigError,
  MultipartError,
  NetworkError,
  ObjectError,
  ServerError,
  TransferError,
  ValidationError,
} from './categories.js';

// Error mapping utilities
export {
  mapHttpStatusToError,
  mapS3ErrorCode,
  isRetryableError,
  isR2Error,
  mapAwsSdkError,
  wrapError,
} from './mapping.js';
