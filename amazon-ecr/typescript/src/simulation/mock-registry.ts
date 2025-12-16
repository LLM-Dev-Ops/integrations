/**
 * In-memory registry state for ECR simulation.
 *
 * This module provides an in-memory data structure that simulates ECR repository
 * and image storage, supporting testing and development without AWS credentials.
 *
 * @module simulation/mock-registry
 */

import {
  Repository,
  TagMutability,
  ScanConfig,
  ScanType,
  EncryptionConfig,
  EncryptionType,
} from '../types/repository.js';
import { ImageDetail, ScanStatus } from '../types/image.js';
import { ScanState, Severity } from '../types/scan.js';

/**
 * Mock repository structure.
 */
export interface MockRepository {
  /** Repository name. */
  readonly name: string;
  /** Repository URI for docker operations. */
  readonly uri: string;
  /** Repository ARN. */
  readonly arn: string;
  /** Registry ID (AWS account ID). */
  readonly registryId: string;
  /** Creation timestamp. */
  readonly createdAt: Date;
  /** Tag mutability setting. */
  readonly imageTagMutability: TagMutability;
  /** Image scanning configuration. */
  readonly imageScanningConfiguration?: ScanConfig;
  /** Encryption configuration. */
  readonly encryptionConfiguration?: EncryptionConfig;
}

/**
 * Mock image structure.
 */
export interface MockImage {
  /** Image digest (SHA256). */
  readonly digest: string;
  /** List of tags for this image. */
  readonly tags: string[];
  /** Image manifest JSON. */
  readonly manifest: string;
  /** Manifest media type. */
  readonly manifestMediaType: string;
  /** Image size in bytes. */
  readonly sizeBytes: number;
  /** Push timestamp. */
  readonly pushedAt: Date;
  /** Scan status. */
  readonly scanStatus?: ScanStatus;
  /** Scan findings. */
  readonly scanFindings?: ScanFindings;
}

/**
 * Scan findings structure.
 */
export interface ScanFindings {
  /** Scan completion timestamp. */
  readonly scanCompletedAt: Date;
  /** Vulnerability source update timestamp. */
  readonly vulnerabilitySourceUpdatedAt?: Date;
  /** Count of findings by severity. */
  readonly findingSeverityCounts: Record<string, number>;
  /** List of individual findings. */
  readonly findings: Finding[];
}

/**
 * Individual vulnerability finding.
 */
export interface Finding {
  /** CVE or vulnerability ID. */
  readonly name: string;
  /** Description of the vulnerability. */
  readonly description?: string;
  /** Reference URI. */
  readonly uri?: string;
  /** Severity level. */
  readonly severity: Severity;
  /** Additional attributes. */
  readonly attributes?: Record<string, string>;
}

/**
 * In-memory ECR registry simulation.
 *
 * This class maintains repository and image state for testing purposes,
 * providing CRUD operations that mirror ECR behavior without AWS calls.
 */
export class MockRegistry {
  private repositories: Map<string, MockRepository>;
  private images: Map<string, Map<string, MockImage>>; // repo -> digest -> image
  private tagIndex: Map<string, Map<string, string>>; // repo -> tag -> digest

  constructor() {
    this.repositories = new Map();
    this.images = new Map();
    this.tagIndex = new Map();
  }

  // Repository operations

  /**
   * Adds a repository to the registry.
   *
   * @param repo - Repository to add
   * @throws {Error} If repository already exists
   */
  addRepository(repo: MockRepository): void {
    if (this.repositories.has(repo.name)) {
      throw new Error(`Repository ${repo.name} already exists`);
    }
    this.repositories.set(repo.name, repo);
    this.images.set(repo.name, new Map());
    this.tagIndex.set(repo.name, new Map());
  }

  /**
   * Gets a repository by name.
   *
   * @param name - Repository name
   * @returns Repository if found, undefined otherwise
   */
  getRepository(name: string): MockRepository | undefined {
    return this.repositories.get(name);
  }

  /**
   * Lists all repositories.
   *
   * @returns Array of all repositories
   */
  listRepositories(): MockRepository[] {
    return Array.from(this.repositories.values());
  }

  /**
   * Removes a repository and all its images.
   *
   * @param name - Repository name
   * @returns true if repository was removed, false if it didn't exist
   */
  deleteRepository(name: string): boolean {
    const deleted = this.repositories.delete(name);
    if (deleted) {
      this.images.delete(name);
      this.tagIndex.delete(name);
    }
    return deleted;
  }

  // Image operations

  /**
   * Adds an image to a repository.
   *
   * @param repoName - Repository name
   * @param image - Image to add
   * @throws {Error} If repository doesn't exist or image already exists
   */
  addImage(repoName: string, image: MockImage): void {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      throw new Error(`Repository ${repoName} does not exist`);
    }

    if (repoImages.has(image.digest)) {
      throw new Error(`Image ${image.digest} already exists in ${repoName}`);
    }

    repoImages.set(image.digest, image);

    // Update tag index
    const tagIdx = this.tagIndex.get(repoName)!;
    for (const tag of image.tags) {
      // Check tag mutability
      const repo = this.repositories.get(repoName)!;
      if (
        repo.imageTagMutability === TagMutability.Immutable &&
        tagIdx.has(tag)
      ) {
        throw new Error(
          `Tag ${tag} already exists in immutable repository ${repoName}`
        );
      }
      tagIdx.set(tag, image.digest);
    }
  }

  /**
   * Gets an image by digest or tag.
   *
   * @param repoName - Repository name
   * @param digestOrTag - Image digest or tag
   * @returns Image if found, undefined otherwise
   */
  getImage(repoName: string, digestOrTag: string): MockImage | undefined {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      return undefined;
    }

    // Try as digest first
    let image = repoImages.get(digestOrTag);
    if (image) {
      return image;
    }

    // Try as tag
    const tagIdx = this.tagIndex.get(repoName);
    if (tagIdx) {
      const digest = tagIdx.get(digestOrTag);
      if (digest) {
        return repoImages.get(digest);
      }
    }

    return undefined;
  }

  /**
   * Lists all images in a repository.
   *
   * @param repoName - Repository name
   * @returns Array of images, or empty array if repository doesn't exist
   */
  listImages(repoName: string): MockImage[] {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      return [];
    }
    return Array.from(repoImages.values());
  }

  /**
   * Deletes an image by digest or tag.
   *
   * @param repoName - Repository name
   * @param digestOrTag - Image digest or tag
   * @returns true if image was deleted, false otherwise
   */
  deleteImage(repoName: string, digestOrTag: string): boolean {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      return false;
    }

    // Get the image to determine digest
    const image = this.getImage(repoName, digestOrTag);
    if (!image) {
      return false;
    }

    // If deleting by tag, only remove the tag
    if (!digestOrTag.startsWith('sha256:')) {
      const tagIdx = this.tagIndex.get(repoName)!;
      tagIdx.delete(digestOrTag);

      // Update image tags
      const newTags = image.tags.filter((t) => t !== digestOrTag);
      const newImage: MockImage = {
        ...image,
        tags: newTags,
      };

      // If no more tags, delete the image entirely
      if (newTags.length === 0) {
        repoImages.delete(image.digest);
      } else {
        repoImages.set(image.digest, newImage);
      }

      return true;
    }

    // Deleting by digest - remove all tags and image
    const tagIdx = this.tagIndex.get(repoName)!;
    for (const tag of image.tags) {
      tagIdx.delete(tag);
    }
    return repoImages.delete(image.digest);
  }

  /**
   * Adds a tag to an existing image.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   * @param tag - Tag to add
   * @throws {Error} If repository or image doesn't exist, or tag already exists in immutable repo
   */
  addTag(repoName: string, digest: string, tag: string): void {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      throw new Error(`Repository ${repoName} does not exist`);
    }

    const image = repoImages.get(digest);
    if (!image) {
      throw new Error(`Image ${digest} does not exist in ${repoName}`);
    }

    // Check tag mutability
    const repo = this.repositories.get(repoName)!;
    const tagIdx = this.tagIndex.get(repoName)!;
    if (
      repo.imageTagMutability === TagMutability.Immutable &&
      tagIdx.has(tag)
    ) {
      throw new Error(
        `Tag ${tag} already exists in immutable repository ${repoName}`
      );
    }

    // Add tag to image
    if (!image.tags.includes(tag)) {
      const newImage: MockImage = {
        ...image,
        tags: [...image.tags, tag],
      };
      repoImages.set(digest, newImage);
    }

    // Update tag index
    tagIdx.set(tag, digest);
  }

  // Scan operations

  /**
   * Sets scan results for an image.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   * @param findings - Scan findings to set
   * @throws {Error} If repository or image doesn't exist
   */
  setScanResult(
    repoName: string,
    digest: string,
    findings: ScanFindings
  ): void {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      throw new Error(`Repository ${repoName} does not exist`);
    }

    const image = repoImages.get(digest);
    if (!image) {
      throw new Error(`Image ${digest} does not exist in ${repoName}`);
    }

    const updatedImage: MockImage = {
      ...image,
      scanStatus: {
        status: ScanState.Complete,
        description: 'Scan completed successfully',
      },
      scanFindings: findings,
    };

    repoImages.set(digest, updatedImage);
  }

  /**
   * Sets scan status for an image.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   * @param status - Scan status to set
   * @throws {Error} If repository or image doesn't exist
   */
  setScanStatus(
    repoName: string,
    digest: string,
    status: ScanStatus
  ): void {
    const repoImages = this.images.get(repoName);
    if (!repoImages) {
      throw new Error(`Repository ${repoName} does not exist`);
    }

    const image = repoImages.get(digest);
    if (!image) {
      throw new Error(`Image ${digest} does not exist in ${repoName}`);
    }

    const updatedImage: MockImage = {
      ...image,
      scanStatus: status,
    };

    repoImages.set(digest, updatedImage);
  }

  /**
   * Clears all data from the registry.
   */
  clear(): void {
    this.repositories.clear();
    this.images.clear();
    this.tagIndex.clear();
  }

  /**
   * Converts a MockRepository to ECR Repository format.
   *
   * @param mockRepo - Mock repository to convert
   * @returns ECR Repository object
   */
  static toRepository(mockRepo: MockRepository): Repository {
    return {
      registryId: mockRepo.registryId,
      repositoryName: mockRepo.name,
      repositoryArn: mockRepo.arn,
      repositoryUri: mockRepo.uri,
      createdAt: mockRepo.createdAt.toISOString(),
      imageTagMutability: mockRepo.imageTagMutability,
      imageScanningConfiguration:
        mockRepo.imageScanningConfiguration || {
          scanOnPush: false,
          scanType: ScanType.Basic,
        },
      encryptionConfiguration:
        mockRepo.encryptionConfiguration || {
          encryptionType: EncryptionType.Aes256,
        },
    };
  }

  /**
   * Converts a MockImage to ECR ImageDetail format.
   *
   * @param repoName - Repository name
   * @param registryId - Registry ID
   * @param mockImage - Mock image to convert
   * @returns ECR ImageDetail object
   */
  static toImageDetail(
    repoName: string,
    registryId: string,
    mockImage: MockImage
  ): ImageDetail {
    return {
      registryId,
      repositoryName: repoName,
      imageDigest: mockImage.digest,
      imageTags: mockImage.tags,
      imageSizeInBytes: mockImage.sizeBytes,
      imagePushedAt: mockImage.pushedAt.toISOString(),
      imageScanStatus: mockImage.scanStatus,
      imageScanFindingsSummary: mockImage.scanFindings
        ? {
            imageScanCompletedAt:
              mockImage.scanFindings.scanCompletedAt.toISOString(),
            vulnerabilitySourceUpdatedAt:
              mockImage.scanFindings.vulnerabilitySourceUpdatedAt?.toISOString(),
            findingSeverityCounts:
              mockImage.scanFindings.findingSeverityCounts,
          }
        : undefined,
      imageManifestMediaType: mockImage.manifestMediaType,
    };
  }
}
