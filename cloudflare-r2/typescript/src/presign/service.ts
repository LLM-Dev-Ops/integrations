/**
 * Presign service implementation for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/presign
 */

import type { R2PresignService } from './interface.js';
import type { R2Signer } from '../signing/index.js';
import type { NormalizedR2Config } from '../config/index.js';
import type {
  PresignGetRequest,
  PresignPutRequest,
  PresignedUrl,
} from '../types/index.js';
import { ValidationError } from '../errors/index.js';

/**
 * Default expiration time for presigned URLs (1 hour)
 */
const DEFAULT_EXPIRES_IN = 3600;

/**
 * Implementation of R2PresignService using S3 Signature V4
 *
 * This service generates presigned URLs that allow temporary access to R2 objects
 * without requiring AWS credentials. URLs are signed using the S3 Signature V4
 * algorithm and are valid for a specified duration.
 *
 * Expiration limits:
 * - Minimum: 1 second
 * - Maximum: 604800 seconds (7 days)
 * - Default: 3600 seconds (1 hour)
 */
export class R2PresignServiceImpl implements R2PresignService {
  private readonly maxExpiration = 604800; // 7 days in seconds
  private readonly minExpiration = 1; // 1 second minimum

  constructor(
    private readonly config: NormalizedR2Config,
    private readonly signer: R2Signer
  ) {}

  /**
   * Generate a presigned URL for downloading an object
   */
  getObject(request: PresignGetRequest): PresignedUrl {
    const expiresIn = request.expiresIn ?? DEFAULT_EXPIRES_IN;
    this.validateExpiration(expiresIn);

    // Build presigned URL options
    const options = {
      method: 'GET' as const,
      bucket: request.bucket,
      key: request.key,
      expiresIn,
    };

    // Generate presigned URL using signer
    const result = this.signer.presignUrl(options, this.config.endpointUrl);

    // Note: Response overrides (responseContentType, etc.) would need to be
    // added to the URL query parameters manually if the signer doesn't support them.
    // For now, we return the basic presigned URL.

    return {
      url: result.url,
      expiresAt: result.expiresAt,
      method: 'GET',
    };
  }

  /**
   * Generate a presigned URL for uploading an object
   */
  putObject(request: PresignPutRequest): PresignedUrl {
    const expiresIn = request.expiresIn ?? DEFAULT_EXPIRES_IN;
    this.validateExpiration(expiresIn);

    // Build presigned URL options
    const options = {
      method: 'PUT' as const,
      bucket: request.bucket,
      key: request.key,
      expiresIn,
      contentType: request.contentType,
    };

    // Generate presigned URL using signer
    const result = this.signer.presignUrl(options, this.config.endpointUrl);

    // Build required headers for PUT
    const requiredHeaders: Record<string, string> = {};
    if (request.contentType) {
      requiredHeaders['Content-Type'] = request.contentType;
    }
    if (request.serverSideEncryption) {
      requiredHeaders['x-amz-server-side-encryption'] =
        request.serverSideEncryption;
    }

    // Add metadata headers
    if (request.metadata) {
      for (const [key, value] of Object.entries(request.metadata)) {
        requiredHeaders[`x-amz-meta-${key}`] = value;
      }
    }

    return {
      url: result.url,
      expiresAt: result.expiresAt,
      method: 'PUT',
      requiredHeaders: Object.keys(requiredHeaders).length > 0
        ? requiredHeaders
        : undefined,
    };
  }

  /**
   * Validate expiration time is within acceptable bounds
   *
   * @param expiresIn - Expiration time in seconds
   * @throws {ValidationError} If expiration is out of bounds
   */
  private validateExpiration(expiresIn: number): void {
    if (!Number.isInteger(expiresIn) || expiresIn < this.minExpiration) {
      throw new ValidationError({
        message: `Presigned URL expiration must be at least ${this.minExpiration} second`,
        isRetryable: false,
        details: {
          expiresIn,
          minExpiration: this.minExpiration,
        },
      });
    }

    if (expiresIn > this.maxExpiration) {
      throw new ValidationError({
        message: `Presigned URL expiration cannot exceed ${this.maxExpiration} seconds (7 days)`,
        isRetryable: false,
        details: {
          expiresIn,
          maxExpiration: this.maxExpiration,
        },
      });
    }
  }
}
