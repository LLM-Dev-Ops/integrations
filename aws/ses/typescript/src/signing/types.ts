/**
 * AWS Signature V4 Signing Types
 *
 * Type definitions for AWS request signing functionality.
 */

/**
 * AWS credentials for signing requests.
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * Parameters required for signing an AWS request.
 */
export interface SigningParams {
  /** AWS region (e.g., "us-east-1") */
  region: string;
  /** AWS service name (e.g., "ses") */
  service: string;
  /** AWS credentials */
  credentials: AwsCredentials;
  /** Optional date for signing (defaults to current time) */
  date?: Date;
}

/**
 * A signed AWS request ready to be sent.
 */
export interface SignedRequest {
  /** HTTP headers including Authorization header */
  headers: Record<string, string>;
  /** Full request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Optional request body */
  body?: string | undefined;
}

/**
 * Canonical request components.
 */
export interface CanonicalRequest {
  /** HTTP method */
  method: string;
  /** Canonical URI path */
  uri: string;
  /** Canonical query string */
  query: string;
  /** Canonical headers string */
  headers: string;
  /** Signed headers list */
  signedHeaders: string;
  /** Payload hash */
  payloadHash: string;
}

/**
 * Signing key cache entry.
 */
export interface CacheEntry {
  /** Derived signing key */
  key: ArrayBuffer;
  /** Cache entry expiration time */
  expiresAt: number;
}
