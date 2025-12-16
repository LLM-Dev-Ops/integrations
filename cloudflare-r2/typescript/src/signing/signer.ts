/**
 * R2Signer - Main signing implementation for S3 Signature V4
 * Based on SPARC specification section 3.1
 */

import { sha256Hex, hmacSha256, toHex } from './crypto.js';
import {
  createCanonicalRequest,
  getSignedHeaders,
} from './canonical.js';
import { formatDateStamp, formatAmzDate } from './format.js';
import { SigningKeyCache } from './key-derivation.js';
import type {
  SigningRequest,
  SignedRequest,
  PresignedUrlOptions,
  PresignedUrlResult,
} from './types.js';

// Constants
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
export const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface R2SignerConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string; // default: "auto"
  service?: string; // default: "s3"
}

export class R2Signer {
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  private service: string;
  private keyCache: SigningKeyCache;

  constructor(config: R2SignerConfig) {
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region || 'auto'; // R2 is regionless, always "auto"
    this.service = config.service || 's3';
    this.keyCache = new SigningKeyCache();
  }

  /**
   * Hash payload and return hex string
   * Empty body returns EMPTY_SHA256 constant
   */
  hashPayload(body?: Uint8Array | string): string {
    if (!body || body.length === 0) {
      return EMPTY_SHA256;
    }
    return sha256Hex(body);
  }

  /**
   * Sign a request with S3 Signature V4
   * Adds Authorization header and x-amz-* headers
   */
  signRequest(
    request: SigningRequest,
    payloadHash: string,
    timestamp?: Date
  ): SignedRequest {
    const now = timestamp || new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = formatDateStamp(now);

    // Clone headers and add required headers
    const headers = { ...request.headers };

    // Add x-amz-date header
    headers['x-amz-date'] = amzDate;

    // Add x-amz-content-sha256 header
    headers['x-amz-content-sha256'] = payloadHash;

    // Ensure host header is present
    if (!headers['host'] && !headers['Host']) {
      headers['host'] = request.url.host;
    }

    // Create canonical request
    const canonicalRequest = createCanonicalRequest(
      request.method,
      request.url.pathname,
      request.url.search.substring(1), // Remove leading ?
      headers,
      payloadHash
    );

    // Create string to sign
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const canonicalRequestHash = sha256Hex(canonicalRequest);
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Calculate signature
    const signingKey = this.keyCache.getSigningKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      this.service
    );
    const signature = toHex(hmacSha256(signingKey, stringToSign));

    // Create authorization header
    const signedHeaders = getSignedHeaders(headers);
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    headers['authorization'] = authorization;

    return {
      ...request,
      headers,
    };
  }

  /**
   * Generate presigned URL for GET or PUT operations
   * Maximum expiration is 7 days (604800 seconds)
   */
  presignUrl(
    options: PresignedUrlOptions,
    endpoint: string
  ): PresignedUrlResult {
    // Validate expiration
    const MAX_EXPIRES = 604800; // 7 days in seconds
    if (options.expiresIn > MAX_EXPIRES) {
      throw new Error(
        `Presigned URL expiration cannot exceed ${MAX_EXPIRES} seconds (7 days)`
      );
    }
    if (options.expiresIn <= 0) {
      throw new Error('Presigned URL expiration must be positive');
    }

    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = formatDateStamp(now);

    // Parse endpoint URL
    const endpointUrl = new URL(endpoint);

    // Build path: /{bucket}/{key}
    const path = `/${options.bucket}/${options.key}`;

    // Build URL
    const url = new URL(path, endpointUrl);

    // Build credential scope
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;

    // Add query parameters for presigned URL
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', credential);
    url.searchParams.set('X-Amz-Date', amzDate);
    url.searchParams.set('X-Amz-Expires', options.expiresIn.toString());
    url.searchParams.set('X-Amz-SignedHeaders', 'host');

    // Add content-type if specified (for PUT)
    if (options.contentType) {
      url.searchParams.set('Content-Type', options.contentType);
    }

    // Create headers for signing (only host for presigned URLs)
    const headers: Record<string, string> = {
      host: url.host,
    };

    // Create canonical request (use UNSIGNED-PAYLOAD for presigned URLs)
    const canonicalRequest = createCanonicalRequest(
      options.method,
      url.pathname,
      url.search.substring(1), // Remove leading ?
      headers,
      UNSIGNED_PAYLOAD
    );

    // Create string to sign
    const canonicalRequestHash = sha256Hex(canonicalRequest);
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Calculate signature
    const signingKey = this.keyCache.getSigningKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      this.service
    );
    const signature = toHex(hmacSha256(signingKey, stringToSign));

    // Add signature to URL
    url.searchParams.set('X-Amz-Signature', signature);

    // Calculate expiration time
    const expiresAt = new Date(now.getTime() + options.expiresIn * 1000);

    return {
      url: url.toString(),
      expiresAt,
      method: options.method,
    };
  }
}
