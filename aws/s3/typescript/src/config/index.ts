/**
 * S3 Configuration Module
 */

import { AwsCredentials } from "../credentials";
import { ConfigurationError } from "../error";

/**
 * Addressing style for S3 bucket URLs.
 */
export enum AddressingStyle {
  /** Path-style: s3.region.amazonaws.com/bucket */
  Path = "path",
  /** Virtual-hosted: bucket.s3.region.amazonaws.com */
  Virtual = "virtual",
  /** Auto-detect based on bucket name and settings */
  Auto = "auto",
}

/**
 * S3 client configuration.
 */
export interface S3Config {
  /** AWS region. */
  region: string;
  /** AWS credentials (optional, will use provider chain if not set). */
  credentials?: AwsCredentials;
  /** Custom endpoint URL (for S3-compatible services). */
  endpoint?: string;
  /** Force path-style addressing. */
  forcePathStyle?: boolean;
  /** Disable HTTPS (for local testing only). */
  disableSsl?: boolean;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Maximum retry attempts. */
  maxRetries?: number;
  /** Part size for multipart uploads (minimum 5MB). */
  multipartPartSize?: number;
  /** Threshold for using multipart uploads. */
  multipartThreshold?: number;
  /** Enable request/response logging. */
  enableLogging?: boolean;
  /** User agent suffix. */
  userAgentSuffix?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Required<Omit<S3Config, "credentials" | "endpoint">> & {
  credentials?: AwsCredentials;
  endpoint?: string;
} = {
  region: "us-east-1",
  credentials: undefined,
  endpoint: undefined,
  forcePathStyle: false,
  disableSsl: false,
  timeout: 30000,
  maxRetries: 3,
  multipartPartSize: 8 * 1024 * 1024, // 8MB
  multipartThreshold: 8 * 1024 * 1024, // 8MB
  enableLogging: false,
  userAgentSuffix: "",
};

/**
 * S3 configuration builder.
 */
export class S3ConfigBuilder {
  private config: Partial<S3Config> = {};

  /**
   * Set the AWS region.
   */
  region(region: string): this {
    this.config.region = region;
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: AwsCredentials): this {
    this.config.credentials = credentials;
    return this;
  }

  /**
   * Set a custom endpoint (for S3-compatible services).
   */
  endpoint(endpoint: string): this {
    this.config.endpoint = endpoint;
    return this;
  }

  /**
   * Force path-style addressing.
   */
  forcePathStyle(force: boolean = true): this {
    this.config.forcePathStyle = force;
    return this;
  }

  /**
   * Disable SSL (for local testing only).
   */
  disableSsl(disable: boolean = true): this {
    this.config.disableSsl = disable;
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set maximum retry attempts.
   */
  maxRetries(retries: number): this {
    this.config.maxRetries = retries;
    return this;
  }

  /**
   * Set multipart upload part size.
   */
  multipartPartSize(size: number): this {
    // Enforce minimum 5MB
    this.config.multipartPartSize = Math.max(size, 5 * 1024 * 1024);
    return this;
  }

  /**
   * Set multipart upload threshold.
   */
  multipartThreshold(threshold: number): this {
    this.config.multipartThreshold = threshold;
    return this;
  }

  /**
   * Enable logging.
   */
  enableLogging(enable: boolean = true): this {
    this.config.enableLogging = enable;
    return this;
  }

  /**
   * Set user agent suffix.
   */
  userAgentSuffix(suffix: string): this {
    this.config.userAgentSuffix = suffix;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    // Region
    const region =
      process.env.AWS_REGION ??
      process.env.AWS_DEFAULT_REGION;
    if (region) {
      this.config.region = region;
    }

    // Endpoint
    const endpoint =
      process.env.AWS_ENDPOINT_URL_S3 ??
      process.env.AWS_ENDPOINT_URL;
    if (endpoint) {
      this.config.endpoint = endpoint;
    }

    return this;
  }

  /**
   * Build the configuration.
   */
  build(): S3Config {
    const merged = { ...DEFAULT_CONFIG, ...this.config };

    // Validate required fields
    if (!merged.region) {
      throw new ConfigurationError("Region must be specified");
    }

    // Validate endpoint if provided
    if (merged.endpoint) {
      try {
        new URL(merged.endpoint);
      } catch {
        throw new ConfigurationError(`Invalid endpoint URL: ${merged.endpoint}`);
      }
    }

    return merged;
  }
}

/**
 * Create a new S3 config builder.
 */
export function configBuilder(): S3ConfigBuilder {
  return new S3ConfigBuilder();
}

/**
 * Resolve the S3 endpoint URL for a bucket.
 */
export function resolveEndpoint(config: S3Config, bucket?: string): string {
  // Custom endpoint
  if (config.endpoint) {
    return config.endpoint;
  }

  // Standard S3 endpoint
  const protocol = config.disableSsl ? "http" : "https";

  // Virtual-hosted style
  if (!config.forcePathStyle && bucket && isValidVirtualHostBucket(bucket)) {
    return `${protocol}://${bucket}.s3.${config.region}.amazonaws.com`;
  }

  // Path-style
  return `${protocol}://s3.${config.region}.amazonaws.com`;
}

/**
 * Build the URL path for an S3 request.
 */
export function buildPath(
  config: S3Config,
  bucket?: string,
  key?: string
): string {
  const parts: string[] = [];

  // Add bucket for path-style addressing
  if (bucket && (config.forcePathStyle || config.endpoint)) {
    parts.push(bucket);
  }

  // Add key
  if (key) {
    parts.push(key);
  }

  return "/" + parts.join("/");
}

/**
 * Check if a bucket name is valid for virtual-hosted style.
 */
export function isValidVirtualHostBucket(bucket: string): boolean {
  // Must be 3-63 characters
  if (bucket.length < 3 || bucket.length > 63) {
    return false;
  }

  // Must be lowercase alphanumeric, hyphens, and dots
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)) {
    return false;
  }

  // Cannot have consecutive dots
  if (bucket.includes("..")) {
    return false;
  }

  // Cannot look like an IP address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bucket)) {
    return false;
  }

  return true;
}

/**
 * Validate bucket name.
 */
export function validateBucketName(bucket: string): void {
  if (!bucket) {
    throw new ConfigurationError("Bucket name cannot be empty");
  }

  if (bucket.length < 3 || bucket.length > 63) {
    throw new ConfigurationError("Bucket name must be 3-63 characters");
  }

  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)) {
    throw new ConfigurationError("Invalid bucket name format");
  }
}

/**
 * Validate object key.
 */
export function validateObjectKey(key: string): void {
  if (!key) {
    throw new ConfigurationError("Object key cannot be empty");
  }

  if (key.length > 1024) {
    throw new ConfigurationError("Object key cannot exceed 1024 characters");
  }
}
