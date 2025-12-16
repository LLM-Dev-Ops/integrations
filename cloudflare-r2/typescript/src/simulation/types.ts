/**
 * Type definitions for simulation/testing support
 * @module @studiorack/cloudflare-r2/simulation
 */

/**
 * Recorded HTTP request
 */
export interface RecordedRequest {
  /** HTTP method (GET, PUT, POST, DELETE, HEAD) */
  method: string;
  /** Full URL including query parameters */
  url: string;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Request body (optional) */
  body?: Uint8Array;
  /** Timestamp when request was made */
  timestamp: number;
}

/**
 * Recorded HTTP response
 */
export interface RecordedResponse {
  /** HTTP status code */
  status: number;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Response body */
  body: Uint8Array;
  /** Timestamp when response was received */
  timestamp: number;
}

/**
 * A single request-response recording
 */
export interface Recording {
  /** The recorded request */
  request: RecordedRequest;
  /** The recorded response */
  response: RecordedResponse;
}

/**
 * Collection of recordings for simulation playback
 */
export interface SimulationStore {
  /** Array of recorded request-response pairs */
  recordings: Recording[];
  /** Version of the recording format */
  version: string;
  /** Optional metadata about the recording */
  metadata?: {
    /** When the recording was created */
    createdAt?: string;
    /** Description of the recording */
    description?: string;
    /** Tags for categorizing recordings */
    tags?: string[];
  };
}

/**
 * Options for replaying recordings
 */
export interface ReplayOptions {
  /**
   * Strict mode: fail if no matching recording found
   * @default false
   */
  strict?: boolean;

  /**
   * Add artificial latency in milliseconds
   * @default 0
   */
  addLatency?: number;

  /**
   * Allow partial matches (ignore certain headers)
   * @default false
   */
  allowPartialMatch?: boolean;

  /**
   * Headers to ignore when matching requests
   * @default ['x-amz-date', 'authorization', 'date']
   */
  ignoreHeaders?: string[];
}

/**
 * Options for mock client
 */
export interface MockClientOptions {
  /**
   * Artificial latency in milliseconds for all operations
   * @default 0
   */
  latency?: number;

  /**
   * Error rate (0-1) - probability of random errors
   * @default 0
   */
  errorRate?: number;

  /**
   * Base URL for presigned URLs
   * @default 'https://mock.r2.cloudflarestorage.com'
   */
  baseUrl?: string;
}

/**
 * Internal stored object representation
 */
export interface StoredObject {
  /** Object data */
  data: Uint8Array;
  /** Content type */
  contentType?: string;
  /** Custom metadata */
  metadata: Record<string, string>;
  /** Entity tag */
  eTag: string;
  /** Last modified timestamp */
  lastModified: Date;
  /** Content encoding */
  contentEncoding?: string;
  /** Content language */
  contentLanguage?: string;
  /** Content disposition */
  contentDisposition?: string;
  /** Cache control */
  cacheControl?: string;
}

/**
 * Internal multipart upload state
 */
export interface MultipartUpload {
  /** Upload ID */
  uploadId: string;
  /** Bucket name */
  bucket: string;
  /** Object key */
  key: string;
  /** Uploaded parts */
  parts: Map<number, UploadedPart>;
  /** Object metadata */
  metadata: Record<string, string>;
  /** Content type */
  contentType?: string;
  /** When upload was initiated */
  initiated: Date;
}

/**
 * Single uploaded part in multipart upload
 */
export interface UploadedPart {
  /** Part data */
  data: Uint8Array;
  /** Part ETag */
  eTag: string;
  /** Part number */
  partNumber: number;
}
