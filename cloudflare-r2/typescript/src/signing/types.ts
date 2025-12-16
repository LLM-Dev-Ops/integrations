/**
 * Signing types for S3 Signature V4 authentication
 */

export interface SigningRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: Uint8Array | string;
}

export interface SignedRequest extends SigningRequest {
  headers: Record<string, string>;
}

export interface PresignedUrlOptions {
  method: 'GET' | 'PUT';
  bucket: string;
  key: string;
  expiresIn: number; // seconds, max 604800 (7 days)
  contentType?: string;
}

export interface PresignedUrlResult {
  url: string;
  expiresAt: Date;
  method: 'GET' | 'PUT';
}
