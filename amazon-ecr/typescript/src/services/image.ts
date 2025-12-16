/**
 * Amazon ECR Image Service
 *
 * Provides image management functionality including:
 * - Listing and describing images
 * - Getting image manifests
 * - Tagging images
 * - Deleting images
 *
 * @module services/image
 */

import type {
  ImageIdentifier,
  Image,
  ImageDetail,
} from '../types/index.js';
import type { EcrClientInterface } from '../types/client.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Result of batch get operation.
 */
interface BatchGetResult {
  /** Successfully retrieved images. */
  readonly images: Image[];
  /** Failed image retrievals. */
  readonly failures: ImageFailure[];
}

/**
 * Failed image retrieval.
 */
interface ImageFailure {
  /** Image identifier. */
  readonly imageId: ImageIdentifier;
  /** Failure code. */
  readonly failureCode: string;
  /** Failure reason. */
  readonly failureReason: string;
}

/**
 * Result of batch delete operation.
 */
interface DeleteResult {
  /** Successfully deleted image IDs. */
  readonly deleted: ImageIdentifier[];
  /** Failed deletions. */
  readonly failures: DeleteFailure[];
}

/**
 * Failed image deletion.
 */
interface DeleteFailure {
  /** Image identifier. */
  readonly imageId: ImageIdentifier;
  /** Failure code. */
  readonly failureCode: string;
  /** Failure reason. */
  readonly failureReason: string;
}

/**
 * Options for listing images.
 */
interface ImageListOptions {
  /** Filter by tag status. */
  readonly tagStatus?: 'TAGGED' | 'UNTAGGED' | 'ANY';
  /** Maximum results per page. */
  readonly maxResults?: number;
  /** Pagination token. */
  readonly nextToken?: string;
  /** Maximum total results. */
  readonly limit?: number;
}

/**
 * Image list result.
 */
interface ImageListResult {
  /** List of image identifiers. */
  readonly images: ImageIdentifier[];
  /** Pagination token. */
  readonly nextToken?: string;
}

/**
 * AWS SDK request/response types (minimal interfaces for type safety)
 */
interface AwsImageIdentifier {
  imageDigest?: string;
  imageTag?: string;
}

interface ListImagesRequest {
  repositoryName: string;
  registryId?: string;
  nextToken?: string;
  maxResults?: number;
  filter?: {
    tagStatus?: 'TAGGED' | 'UNTAGGED' | 'ANY';
  };
}

interface ListImagesResponse {
  imageIds: AwsImageIdentifier[];
  nextToken?: string;
}

interface DescribeImagesRequest {
  repositoryName: string;
  registryId?: string;
  imageIds?: AwsImageIdentifier[];
  nextToken?: string;
  maxResults?: number;
}

interface DescribeImagesResponse {
  imageDetails: any[];
  nextToken?: string;
}

interface BatchGetImageRequest {
  repositoryName: string;
  registryId?: string;
  imageIds: AwsImageIdentifier[];
  acceptedMediaTypes?: string[];
}

interface BatchGetImageResponse {
  images: {
    registryId: string;
    repositoryName: string;
    imageId: AwsImageIdentifier;
    imageManifest: string;
    imageManifestMediaType: string;
  }[];
  failures: {
    imageId: AwsImageIdentifier;
    failureCode: string;
    failureReason: string;
  }[];
}

interface PutImageRequest {
  repositoryName: string;
  registryId?: string;
  imageManifest: string;
  imageManifestMediaType: string;
  imageTag: string;
  imageDigest?: string;
}

interface PutImageResponse {
  image: {
    registryId: string;
    repositoryName: string;
    imageId: AwsImageIdentifier;
    imageManifest: string;
    imageManifestMediaType: string;
  };
}

interface BatchDeleteImageRequest {
  repositoryName: string;
  registryId?: string;
  imageIds: AwsImageIdentifier[];
}

interface BatchDeleteImageResponse {
  imageIds: AwsImageIdentifier[];
  failures: {
    imageId: AwsImageIdentifier;
    failureCode: string;
    failureReason: string;
  }[];
}

/**
 * Accepted media types for image manifests
 */
const ACCEPTED_MEDIA_TYPES = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.index.v1+json',
];

/**
 * Image Service for Amazon ECR
 *
 * Handles all image-related operations including listing, describing,
 * retrieving, tagging, and deleting images.
 */
export class ImageService {
  /**
   * Creates a new ImageService instance
   *
   * @param client - ECR client interface for making API calls
   */
  constructor(private readonly client: EcrClientInterface) {}

  /**
   * List images in a repository
   *
   * @param repositoryName - Repository name
   * @param options - Optional parameters for filtering and pagination
   * @returns Paginated list of image identifiers
   *
   * @example
   * ```typescript
   * const images = await imageService.listImages('my-repo', {
   *   tagStatus: 'TAGGED',
   *   maxResults: 50
   * });
   * ```
   */
  async listImages(
    repositoryName: string,
    options?: ImageListOptions
  ): Promise<ImageListResult> {
    const images: ImageIdentifier[] = [];
    let nextToken = options?.nextToken;
    const limit = options?.limit;

    try {
      while (true) {
        const request: ListImagesRequest = {
          repositoryName,
          nextToken,
          maxResults: options?.maxResults || 100,
        };

        if (options?.tagStatus) {
          request.filter = { tagStatus: options.tagStatus };
        }

        const response = await this.client.send<ListImagesRequest, ListImagesResponse>(
          'ListImages',
          request
        );

        for (const imageId of response.imageIds) {
          images.push({
            imageDigest: imageId.imageDigest,
            imageTag: imageId.imageTag,
          });
        }

        nextToken = response.nextToken;

        // Break if no more pages or reached limit
        if (!nextToken || (limit && images.length >= limit)) {
          break;
        }
      }

      return {
        images,
        nextToken,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Describe images in detail
   *
   * @param repositoryName - Repository name
   * @param imageIds - Image identifiers to describe
   * @returns Array of detailed image information
   *
   * @example
   * ```typescript
   * const details = await imageService.describeImages('my-repo', [
   *   { imageTag: 'latest' },
   *   { imageDigest: 'sha256:...' }
   * ]);
   * ```
   */
  async describeImages(
    repositoryName: string,
    imageIds: ImageIdentifier[]
  ): Promise<ImageDetail[]> {
    const allDetails: ImageDetail[] = [];

    try {
      // Batch into groups of 100 (API limit)
      const batches = this.chunk(imageIds, 100);

      for (const batch of batches) {
        const request: DescribeImagesRequest = {
          repositoryName,
          imageIds: batch.map((id) => ({
            imageDigest: id.imageDigest,
            imageTag: id.imageTag,
          })),
        };

        const response = await this.client.send<DescribeImagesRequest, DescribeImagesResponse>(
          'DescribeImages',
          request
        );

        for (const detail of response.imageDetails) {
          allDetails.push(this.parseImageDetail(detail));
        }
      }

      return allDetails;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Get a single image with manifest
   *
   * @param repositoryName - Repository name
   * @param imageId - Image identifier
   * @returns Image with manifest
   *
   * @example
   * ```typescript
   * const image = await imageService.getImage('my-repo', {
   *   imageTag: 'latest'
   * });
   * console.log(image.imageManifest);
   * ```
   */
  async getImage(repositoryName: string, imageId: ImageIdentifier): Promise<Image> {
    try {
      const request: BatchGetImageRequest = {
        repositoryName,
        imageIds: [
          {
            imageDigest: imageId.imageDigest,
            imageTag: imageId.imageTag,
          },
        ],
        acceptedMediaTypes: ACCEPTED_MEDIA_TYPES,
      };

      const response = await this.client.send<BatchGetImageRequest, BatchGetImageResponse>(
        'BatchGetImage',
        request
      );

      if (response.images.length === 0) {
        if (response.failures.length > 0) {
          const failure = response.failures[0];
          throw EcrError.imageNotFound(
            `${this.formatImageId(failure.imageId)}: ${failure.failureReason}`
          );
        }
        throw EcrError.imageNotFound(this.formatImageId(imageId));
      }

      const image = response.images[0];
      return {
        registryId: image.registryId,
        repositoryName: image.repositoryName,
        imageId: {
          imageDigest: image.imageId.imageDigest,
          imageTag: image.imageId.imageTag,
        },
        imageManifest: image.imageManifest,
        imageManifestMediaType: image.imageManifestMediaType,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Batch get multiple images
   *
   * @param repositoryName - Repository name
   * @param imageIds - Image identifiers to retrieve
   * @returns Images and failures
   *
   * @example
   * ```typescript
   * const result = await imageService.batchGetImages('my-repo', [
   *   { imageTag: 'v1.0' },
   *   { imageTag: 'v2.0' }
   * ]);
   * console.log(`Retrieved ${result.images.length} images`);
   * ```
   */
  async batchGetImages(
    repositoryName: string,
    imageIds: ImageIdentifier[]
  ): Promise<BatchGetResult> {
    try {
      const request: BatchGetImageRequest = {
        repositoryName,
        imageIds: imageIds.map((id) => ({
          imageDigest: id.imageDigest,
          imageTag: id.imageTag,
        })),
        acceptedMediaTypes: ACCEPTED_MEDIA_TYPES,
      };

      const response = await this.client.send<BatchGetImageRequest, BatchGetImageResponse>(
        'BatchGetImage',
        request
      );

      return {
        images: response.images.map((img: { registryId: string; repositoryName: string; imageId: { imageDigest?: string; imageTag?: string }; imageManifest: string; imageManifestMediaType: string }) => ({
          registryId: img.registryId,
          repositoryName: img.repositoryName,
          imageId: {
            imageDigest: img.imageId.imageDigest,
            imageTag: img.imageId.imageTag,
          },
          imageManifest: img.imageManifest,
          imageManifestMediaType: img.imageManifestMediaType,
        })),
        failures: response.failures.map((failure: { imageId: { imageDigest?: string; imageTag?: string }; failureCode: string; failureReason: string }) => ({
          imageId: {
            imageDigest: failure.imageId.imageDigest,
            imageTag: failure.imageId.imageTag,
          },
          failureCode: failure.failureCode,
          failureReason: failure.failureReason,
        })),
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Put a tag on an existing image
   *
   * @param repositoryName - Repository name
   * @param sourceDigest - Source image digest
   * @param targetTag - Tag to add
   * @returns Tagged image
   *
   * @example
   * ```typescript
   * const image = await imageService.putImageTag(
   *   'my-repo',
   *   'sha256:abcdef...',
   *   'production'
   * );
   * ```
   */
  async putImageTag(
    repositoryName: string,
    sourceDigest: string,
    targetTag: string
  ): Promise<Image> {
    try {
      // First get the source image manifest
      const sourceImage = await this.getImage(repositoryName, {
        imageDigest: sourceDigest,
      });

      if (!sourceImage.imageManifest || !sourceImage.imageManifestMediaType) {
        throw new EcrError(
          EcrErrorKind.InvalidParameter,
          'Source image has no manifest'
        );
      }

      // Put the image with the new tag
      const request: PutImageRequest = {
        repositoryName,
        imageManifest: sourceImage.imageManifest,
        imageManifestMediaType: sourceImage.imageManifestMediaType,
        imageTag: targetTag,
        imageDigest: sourceDigest,
      };

      const response = await this.client.send<PutImageRequest, PutImageResponse>(
        'PutImage',
        request
      );

      // Emit metric (would be handled by observability layer)
      // shared/observability.emit_counter("ecr.images.tagged", 1, { repository: repositoryName })

      return {
        registryId: response.image.registryId,
        repositoryName: response.image.repositoryName,
        imageId: {
          imageDigest: response.image.imageId.imageDigest,
          imageTag: response.image.imageId.imageTag,
        },
        imageManifest: response.image.imageManifest,
        imageManifestMediaType: response.image.imageManifestMediaType,
      };
    } catch (error) {
      if (this.isImageTagAlreadyExistsError(error)) {
        throw EcrError.imageTagAlreadyExists(targetTag);
      }
      throw this.mapError(error);
    }
  }

  /**
   * Batch delete images
   *
   * @param repositoryName - Repository name
   * @param imageIds - Image identifiers to delete
   * @returns Deleted images and failures
   *
   * @example
   * ```typescript
   * const result = await imageService.batchDeleteImages('my-repo', [
   *   { imageTag: 'old-version' },
   *   { imageDigest: 'sha256:...' }
   * ]);
   * console.log(`Deleted ${result.deleted.length} images`);
   * ```
   */
  async batchDeleteImages(
    repositoryName: string,
    imageIds: ImageIdentifier[]
  ): Promise<DeleteResult> {
    const allDeleted: ImageIdentifier[] = [];
    const allFailures: DeleteFailure[] = [];

    try {
      // Batch into groups of 100
      const batches = this.chunk(imageIds, 100);

      for (const batch of batches) {
        const request: BatchDeleteImageRequest = {
          repositoryName,
          imageIds: batch.map((id) => ({
            imageDigest: id.imageDigest,
            imageTag: id.imageTag,
          })),
        };

        const response = await this.client.send<
          BatchDeleteImageRequest,
          BatchDeleteImageResponse
        >('BatchDeleteImage', request);

        for (const deleted of response.imageIds) {
          allDeleted.push({
            imageDigest: deleted.imageDigest,
            imageTag: deleted.imageTag,
          });
        }

        for (const failure of response.failures) {
          allFailures.push({
            imageId: {
              imageDigest: failure.imageId.imageDigest,
              imageTag: failure.imageId.imageTag,
            },
            failureCode: failure.failureCode,
            failureReason: failure.failureReason,
          });
        }
      }

      // Emit metric (would be handled by observability layer)
      // shared/observability.emit_counter("ecr.images.deleted", allDeleted.length, { repository: repositoryName })

      return {
        deleted: allDeleted,
        failures: allFailures,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Helper: Parse image detail from AWS response
   */
  private parseImageDetail(detail: any): ImageDetail {
    return {
      registryId: detail.registryId,
      repositoryName: detail.repositoryName,
      imageDigest: detail.imageDigest,
      imageTags: detail.imageTags || [],
      imageSizeInBytes: detail.imageSizeInBytes,
      imagePushedAt: detail.imagePushedAt,
      imageScanStatus: detail.imageScanStatus,
      imageScanFindingsSummary: detail.imageScanFindingsSummary,
      imageManifestMediaType: detail.imageManifestMediaType,
      artifactMediaType: detail.artifactMediaType,
      lastRecordedPullTime: detail.lastRecordedPullTime,
    };
  }

  /**
   * Helper: Chunk array into smaller arrays
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Helper: Format image ID for error messages
   */
  private formatImageId(imageId: ImageIdentifier | AwsImageIdentifier): string {
    if (imageId.imageTag) {
      return imageId.imageTag;
    }
    if (imageId.imageDigest) {
      return imageId.imageDigest;
    }
    return 'unknown';
  }

  /**
   * Helper: Check if error is ImageTagAlreadyExistsException
   */
  private isImageTagAlreadyExistsError(error: any): boolean {
    return (
      error &&
      (error.name === 'ImageTagAlreadyExistsException' ||
        error.code === 'ImageTagAlreadyExistsException' ||
        (error.message && error.message.includes('ImageTagAlreadyExists')))
    );
  }

  /**
   * Helper: Map AWS SDK errors to EcrError
   */
  private mapError(error: any): Error {
    if (error instanceof EcrError) {
      return error;
    }

    const errorName = error?.name || error?.code || '';
    const message = error?.message || 'Unknown error';

    switch (errorName) {
      case 'RepositoryNotFoundException':
        return new EcrError(EcrErrorKind.RepositoryNotFound, message);
      case 'ImageNotFoundException':
        return new EcrError(EcrErrorKind.ImageNotFound, message);
      case 'LayersNotFoundException':
        return new EcrError(EcrErrorKind.LayersNotFound, message);
      case 'LifecyclePolicyNotFoundException':
        return new EcrError(EcrErrorKind.LifecyclePolicyNotFound, message);
      case 'RepositoryPolicyNotFoundException':
        return new EcrError(EcrErrorKind.RepositoryPolicyNotFound, message);
      case 'ScanNotFoundException':
        return new EcrError(EcrErrorKind.ScanNotFound, message);
      case 'InvalidParameterException':
        return new EcrError(EcrErrorKind.InvalidParameter, message);
      case 'InvalidLayerPartException':
        return new EcrError(EcrErrorKind.InvalidLayerPart, message);
      case 'LimitExceededException':
        return new EcrError(EcrErrorKind.LimitExceeded, message);
      case 'TooManyTagsException':
        return new EcrError(EcrErrorKind.TooManyTags, message);
      case 'ImageTagAlreadyExistsException':
        return new EcrError(EcrErrorKind.ImageTagAlreadyExists, message);
      case 'ImageDigestDoesNotMatchException':
        return new EcrError(EcrErrorKind.ImageDigestMismatch, message);
      case 'AccessDeniedException':
        return new EcrError(EcrErrorKind.AccessDenied, message);
      case 'KmsException':
        return new EcrError(EcrErrorKind.KmsError, message);
      case 'ServerException':
        return new EcrError(EcrErrorKind.ServiceUnavailable, message);
      case 'ThrottlingException':
        return new EcrError(EcrErrorKind.ThrottlingException, message);
      default:
        return new EcrError(EcrErrorKind.Unknown, message);
    }
  }
}
