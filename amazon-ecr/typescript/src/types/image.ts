/**
 * Image types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for ECR image entities,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/image
 */

import type { ScanStatus } from './scan.js';

// Re-export scan types used by image types
export type { ScanState, ScanStatus } from './scan.js';

/**
 * Image identifier (tag or digest).
 */
export interface ImageIdentifier {
  /** Image digest (SHA256). */
  readonly imageDigest?: string;
  /** Image tag. */
  readonly imageTag?: string;
}

/**
 * ECR image.
 */
export interface Image {
  /** AWS account ID that owns the repository. */
  readonly registryId: string;
  /** Repository name. */
  readonly repositoryName: string;
  /** Image identifier. */
  readonly imageId: ImageIdentifier;
  /** Image manifest (JSON string). */
  readonly imageManifest?: string;
  /** Image manifest media type. */
  readonly imageManifestMediaType?: string;
}

/**
 * Detailed image information.
 */
export interface ImageDetail {
  /** AWS account ID that owns the repository. */
  readonly registryId: string;
  /** Repository name. */
  readonly repositoryName: string;
  /** Image digest (SHA256). */
  readonly imageDigest: string;
  /** List of tags associated with this image. */
  readonly imageTags: string[];
  /** Image size in bytes. */
  readonly imageSizeInBytes: number;
  /** Time when the image was pushed. */
  readonly imagePushedAt: string;
  /** Image scan status. */
  readonly imageScanStatus?: ScanStatus;
  /** Summary of image scan findings. */
  readonly imageScanFindingsSummary?: {
    readonly imageScanCompletedAt?: string;
    readonly vulnerabilitySourceUpdatedAt?: string;
    readonly findingSeverityCounts?: Record<string, number>;
  };
  /** Image manifest media type. */
  readonly imageManifestMediaType: string;
  /** Artifact media type (for OCI artifacts). */
  readonly artifactMediaType?: string;
  /** Last time the image was pulled. */
  readonly lastRecordedPullTime?: string;
}
