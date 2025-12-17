/**
 * Security validation module for FFmpeg integration.
 *
 * Provides path sanitization, input validation, and command injection prevention
 * to ensure safe execution of FFmpeg commands.
 */

import * as path from 'path';
import { InvalidPathError } from '../errors/errors.js';

/**
 * Security configuration options
 */
export interface SecurityConfig {
  /** Allowed protocols for URL inputs (default: ['http', 'https', 'file']) */
  allowedProtocols?: string[];

  /** Maximum input file size in bytes (default: no limit) */
  maxInputSize?: number;

  /** Maximum duration in seconds (default: no limit) */
  maxDuration?: number;

  /** Maximum resolution (width * height) (default: no limit) */
  maxResolution?: number;

  /** Allow access to parent directories (default: false) */
  allowParentDirectory?: boolean;

  /** Base directory for file operations (restricts all file access to this dir) */
  baseDirectory?: string;

  /** Dangerous FFmpeg options to disallow */
  disallowedOptions?: string[];
}

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  allowedProtocols: ['http', 'https', 'file'],
  allowParentDirectory: false,
  disallowedOptions: [
    '-protocol_whitelist',
    '-allowed_extensions',
    '-auth_type',
  ],
};

/**
 * Characters that could be used for command injection
 */
const DANGEROUS_CHARS = /[;&|`$(){}[\]<>\\'"!#]/;

/**
 * Path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,  // ../
  /[\/\\]\.\./,  // /..
  /^\.\.$/,      // just ..
];

/**
 * Validates and sanitizes a file path
 *
 * @param filePath - The path to validate
 * @param config - Security configuration
 * @returns Sanitized path
 * @throws InvalidPathError if path is invalid or dangerous
 */
export function sanitizePath(filePath: string, config: SecurityConfig = {}): string {
  const opts = { ...DEFAULT_SECURITY_CONFIG, ...config };

  if (!filePath || typeof filePath !== 'string') {
    throw new InvalidPathError('', 'Path is empty or invalid');
  }

  // Check for null bytes (path traversal attack)
  if (filePath.includes('\0')) {
    throw new InvalidPathError(filePath, 'Path contains null bytes');
  }

  // Check for dangerous characters
  if (DANGEROUS_CHARS.test(filePath)) {
    throw new InvalidPathError(filePath, 'Path contains potentially dangerous characters');
  }

  // Check for path traversal
  if (!opts.allowParentDirectory) {
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(filePath)) {
        throw new InvalidPathError(filePath, 'Path traversal detected');
      }
    }
  }

  // Normalize the path
  const normalizedPath = path.normalize(filePath);

  // If base directory is set, ensure path is within it
  if (opts.baseDirectory) {
    const resolvedBase = path.resolve(opts.baseDirectory);
    const resolvedPath = path.resolve(opts.baseDirectory, normalizedPath);

    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new InvalidPathError(filePath, `Path escapes base directory: ${opts.baseDirectory}`);
    }

    return resolvedPath;
  }

  return normalizedPath;
}

/**
 * Validates a URL for FFmpeg input
 *
 * @param url - The URL to validate
 * @param config - Security configuration
 * @returns Validated URL
 * @throws InvalidPathError if URL is invalid or uses disallowed protocol
 */
export function validateUrl(url: string, config: SecurityConfig = {}): string {
  const opts = { ...DEFAULT_SECURITY_CONFIG, ...config };

  if (!url || typeof url !== 'string') {
    throw new InvalidPathError('', 'URL is empty or invalid');
  }

  try {
    const parsed = new URL(url);

    // Check protocol
    const protocol = parsed.protocol.replace(':', '');
    if (opts.allowedProtocols && !opts.allowedProtocols.includes(protocol)) {
      throw new InvalidPathError(url, `Protocol '${protocol}' is not allowed. Allowed protocols: ${opts.allowedProtocols.join(', ')}`);
    }

    // Check for credentials in URL (security risk)
    if (parsed.username || parsed.password) {
      throw new InvalidPathError(url, 'URLs with embedded credentials are not allowed');
    }

    return url;
  } catch (error) {
    if (error instanceof InvalidPathError) {
      throw error;
    }
    throw new InvalidPathError(url, 'Invalid URL format');
  }
}

/**
 * Validates FFmpeg filter string for command injection
 *
 * @param filter - The filter string to validate
 * @returns Validated filter string
 * @throws Error if filter contains dangerous patterns
 */
export function validateFilter(filter: string): string {
  if (!filter || typeof filter !== 'string') {
    throw new Error('Filter is empty or invalid');
  }

  // Check for shell command injection patterns
  const dangerousPatterns = [
    /`[^`]*`/,        // Backticks
    /\$\([^)]*\)/,    // Command substitution
    /\$\{[^}]*\}/,    // Variable expansion
    /;\s*[a-z]/i,     // Command chaining
    /\|\s*[a-z]/i,    // Pipe to command
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filter)) {
      throw new Error(`Filter contains potentially dangerous pattern: ${filter}`);
    }
  }

  return filter;
}

/**
 * Validates FFmpeg command options
 *
 * @param options - Array of command options
 * @param config - Security configuration
 * @returns Validated options
 * @throws Error if options contain disallowed values
 */
export function validateOptions(options: string[], config: SecurityConfig = {}): string[] {
  const opts = { ...DEFAULT_SECURITY_CONFIG, ...config };

  for (const option of options) {
    // Check for disallowed options
    if (opts.disallowedOptions) {
      for (const disallowed of opts.disallowedOptions) {
        if (option.toLowerCase().startsWith(disallowed.toLowerCase())) {
          throw new Error(`Option '${option}' is not allowed for security reasons`);
        }
      }
    }

    // Check for dangerous characters in values
    if (DANGEROUS_CHARS.test(option) && !option.startsWith('-')) {
      // Allow dangerous chars in option names (like -filter:v)
      // but not in values that don't start with -
      throw new Error(`Option value contains potentially dangerous characters: ${option}`);
    }
  }

  return options;
}

/**
 * Input validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Media constraints for validation
 */
export interface MediaConstraints {
  maxDuration?: number;
  maxFileSize?: number;
  maxResolution?: number;
  allowedFormats?: string[];
  allowedCodecs?: string[];
}

/**
 * Validates media info against constraints
 *
 * @param mediaInfo - Media information from probe
 * @param constraints - Validation constraints
 * @returns Validation result
 */
export function validateMediaConstraints(
  mediaInfo: {
    duration?: number;
    size?: number;
    streams?: Array<{
      type: string;
      width?: number;
      height?: number;
      codec?: string;
    }>;
    format?: { name?: string };
  },
  constraints: MediaConstraints
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Check duration
  if (constraints.maxDuration !== undefined && mediaInfo.duration !== undefined) {
    if (mediaInfo.duration > constraints.maxDuration) {
      result.valid = false;
      result.errors.push(
        `Duration ${mediaInfo.duration}s exceeds maximum allowed ${constraints.maxDuration}s`
      );
    }
  }

  // Check file size
  if (constraints.maxFileSize !== undefined && mediaInfo.size !== undefined) {
    if (mediaInfo.size > constraints.maxFileSize) {
      result.valid = false;
      result.errors.push(
        `File size ${mediaInfo.size} bytes exceeds maximum allowed ${constraints.maxFileSize} bytes`
      );
    }
  }

  // Check resolution
  if (constraints.maxResolution !== undefined && mediaInfo.streams) {
    for (const stream of mediaInfo.streams) {
      if (stream.type === 'video' && stream.width && stream.height) {
        const resolution = stream.width * stream.height;
        if (resolution > constraints.maxResolution) {
          result.valid = false;
          result.errors.push(
            `Resolution ${stream.width}x${stream.height} (${resolution} pixels) exceeds maximum allowed ${constraints.maxResolution} pixels`
          );
        }
      }
    }
  }

  // Check format
  if (constraints.allowedFormats !== undefined && mediaInfo.format?.name) {
    const formats = mediaInfo.format.name.split(',');
    const allowed = formats.some((f) =>
      constraints.allowedFormats!.some((af) => f.toLowerCase().includes(af.toLowerCase()))
    );
    if (!allowed) {
      result.valid = false;
      result.errors.push(
        `Format '${mediaInfo.format.name}' is not in allowed formats: ${constraints.allowedFormats.join(', ')}`
      );
    }
  }

  // Check codecs
  if (constraints.allowedCodecs !== undefined && mediaInfo.streams) {
    for (const stream of mediaInfo.streams) {
      if (stream.codec && !constraints.allowedCodecs.includes(stream.codec.toLowerCase())) {
        result.warnings.push(
          `Codec '${stream.codec}' is not in preferred codecs: ${constraints.allowedCodecs.join(', ')}`
        );
      }
    }
  }

  return result;
}

/**
 * Escapes a string for safe use in FFmpeg arguments
 * Note: This is for display/logging purposes only - always use array-based
 * command execution rather than shell strings
 *
 * @param value - The value to escape
 * @returns Escaped value
 */
export function escapeForDisplay(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}
