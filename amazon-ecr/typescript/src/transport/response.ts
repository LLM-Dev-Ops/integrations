/**
 * Response parsing utilities for Amazon ECR transport layer.
 *
 * This module provides functions for parsing ECR API responses into typed objects:
 * - Repository parsing
 * - Image and image detail parsing
 * - Manifest parsing (Docker v2, OCI)
 * - Scan findings parsing
 * - Authorization data parsing
 *
 * @module transport/response
 */

import type {
  Repository,
  ScanConfig,
  EncryptionConfig,
} from '../types/repository.js';
import {
  TagMutability,
  ScanType,
  EncryptionType,
} from '../types/repository.js';
import type {
  Image,
  ImageIdentifier,
  ImageDetail,
  ScanStatus,
} from '../types/image.js';
import { ScanState } from '../types/scan.js';
import type {
  ImageManifest,
  ManifestList,
  ManifestConfig,
  ManifestLayer,
  PlatformManifest,
  Platform,
} from '../types/manifest.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Authorization data from GetAuthorizationToken.
 */
export interface AuthorizationData {
  /** Base64-encoded authorization token (username:password). */
  readonly authorizationToken: string;
  /** Token expiration time. */
  readonly expiresAt: string;
  /** Registry endpoint URL. */
  readonly proxyEndpoint: string;
}

/**
 * Scan findings summary.
 */
export interface ScanFindingsSummary {
  /** Scan completion time. */
  readonly imageScanCompletedAt?: string;
  /** Vulnerability source update time. */
  readonly vulnerabilitySourceUpdatedAt?: string;
  /** Finding counts by severity. */
  readonly findingSeverityCounts?: Record<string, number>;
}

/**
 * Vulnerability finding.
 */
export interface Finding {
  /** Vulnerability name/ID. */
  readonly name: string;
  /** Description. */
  readonly description?: string;
  /** Reference URI. */
  readonly uri?: string;
  /** Severity level. */
  readonly severity: string;
  /** Additional attributes. */
  readonly attributes?: Array<{ key: string; value: string }>;
}

/**
 * Scan findings result.
 */
export interface ScanFindings {
  /** Scan completion time. */
  readonly imageScanCompletedAt: string;
  /** Vulnerability source update time. */
  readonly vulnerabilitySourceUpdatedAt?: string;
  /** Finding counts by severity. */
  readonly findingSeverityCounts: Record<string, number>;
  /** List of findings. */
  readonly findings: Finding[];
}

/**
 * Parse Repository from AWS API response.
 */
export function parseRepository(data: any): Repository {
  if (!data) {
    throw new EcrError(
      EcrErrorKind.Unknown,
      'Invalid repository data: null or undefined'
    );
  }

  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    repositoryArn: data.repositoryArn ?? '',
    repositoryUri: data.repositoryUri ?? '',
    createdAt: data.createdAt ?? new Date().toISOString(),
    imageTagMutability:
      (data.imageTagMutability as TagMutability) ?? TagMutability.Mutable,
    imageScanningConfiguration: parseScanConfig(
      data.imageScanningConfiguration
    ),
    encryptionConfiguration: parseEncryptionConfig(
      data.encryptionConfiguration
    ),
  };
}

/**
 * Parse ScanConfig from AWS API response.
 */
function parseScanConfig(data: any): ScanConfig {
  return {
    scanOnPush: data?.scanOnPush ?? false,
    scanType: (data?.scanType as ScanType) ?? ScanType.Basic,
  };
}

/**
 * Parse EncryptionConfig from AWS API response.
 */
function parseEncryptionConfig(data: any): EncryptionConfig {
  return {
    encryptionType:
      (data?.encryptionType as EncryptionType) ?? EncryptionType.Aes256,
    kmsKey: data?.kmsKey,
  };
}

/**
 * Parse Image from AWS API response.
 */
export function parseImage(data: any): Image {
  if (!data) {
    throw new EcrError(EcrErrorKind.Unknown, 'Invalid image data: null or undefined');
  }

  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    imageId: parseImageIdentifier(data.imageId),
    imageManifest: data.imageManifest,
    imageManifestMediaType: data.imageManifestMediaType,
  };
}

/**
 * Parse ImageIdentifier from AWS API response.
 */
function parseImageIdentifier(data: any): ImageIdentifier {
  return {
    imageDigest: data?.imageDigest,
    imageTag: data?.imageTag,
  };
}

/**
 * Parse ImageDetail from AWS API response.
 */
export function parseImageDetail(data: any): ImageDetail {
  if (!data) {
    throw new EcrError(
      EcrErrorKind.Unknown,
      'Invalid image detail data: null or undefined'
    );
  }

  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    imageDigest: data.imageDigest ?? '',
    imageTags: data.imageTags ?? [],
    imageSizeInBytes: data.imageSizeInBytes ?? 0,
    imagePushedAt: data.imagePushedAt ?? new Date().toISOString(),
    imageScanStatus: data.imageScanStatus
      ? parseScanStatus(data.imageScanStatus)
      : undefined,
    imageScanFindingsSummary: data.imageScanFindingsSummary
      ? parseScanFindingsSummary(data.imageScanFindingsSummary)
      : undefined,
    imageManifestMediaType: data.imageManifestMediaType ?? '',
    artifactMediaType: data.artifactMediaType,
    lastRecordedPullTime: data.lastRecordedPullTime,
  };
}

/**
 * Parse ScanStatus from AWS API response.
 */
function parseScanStatus(data: any): ScanStatus {
  return {
    status: (data.status as ScanState) ?? 'PENDING',
    description: data.description,
  };
}

/**
 * Parse ScanFindingsSummary from AWS API response.
 */
function parseScanFindingsSummary(data: any): ScanFindingsSummary {
  return {
    imageScanCompletedAt: data.imageScanCompletedAt,
    vulnerabilitySourceUpdatedAt: data.vulnerabilitySourceUpdatedAt,
    findingSeverityCounts: data.findingSeverityCounts ?? {},
  };
}

/**
 * Parse manifest JSON string into ImageManifest or ManifestList.
 *
 * Supports:
 * - Docker Image Manifest V2, Schema 2
 * - OCI Image Manifest
 * - Docker Manifest List
 * - OCI Image Index
 */
export function parseManifest(json: string): ImageManifest | ManifestList {
  try {
    const data = JSON.parse(json);

    // Check if it's a manifest list/index
    if (
      data.mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json' ||
      data.mediaType === 'application/vnd.oci.image.index.v1+json' ||
      (data.manifests && Array.isArray(data.manifests))
    ) {
      return parseManifestList(data);
    }

    // Otherwise, it's a single-architecture manifest
    return parseImageManifest(data);
  } catch (error) {
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Failed to parse manifest: ${(error as Error).message}`,
      { cause: error as Error }
    );
  }
}

/**
 * Parse ImageManifest from parsed JSON.
 */
function parseImageManifest(data: any): ImageManifest {
  return {
    schemaVersion: data.schemaVersion ?? 2,
    mediaType:
      data.mediaType ??
      'application/vnd.docker.distribution.manifest.v2+json',
    config: data.config ? parseManifestConfig(data.config) : undefined,
    layers: (data.layers ?? []).map(parseManifestLayer),
  };
}

/**
 * Parse ManifestConfig from parsed JSON.
 */
function parseManifestConfig(data: any): ManifestConfig {
  return {
    mediaType: data.mediaType ?? '',
    size: data.size ?? 0,
    digest: data.digest ?? '',
  };
}

/**
 * Parse ManifestLayer from parsed JSON.
 */
function parseManifestLayer(data: any): ManifestLayer {
  return {
    mediaType: data.mediaType ?? '',
    size: data.size ?? 0,
    digest: data.digest ?? '',
  };
}

/**
 * Parse ManifestList from parsed JSON.
 */
function parseManifestList(data: any): ManifestList {
  return {
    schemaVersion: data.schemaVersion ?? 2,
    mediaType:
      data.mediaType ??
      'application/vnd.docker.distribution.manifest.list.v2+json',
    manifests: (data.manifests ?? []).map(parsePlatformManifest),
  };
}

/**
 * Parse PlatformManifest from parsed JSON.
 */
function parsePlatformManifest(data: any): PlatformManifest {
  return {
    mediaType: data.mediaType ?? '',
    size: data.size ?? 0,
    digest: data.digest ?? '',
    platform: parsePlatform(data.platform ?? {}),
  };
}

/**
 * Parse Platform from parsed JSON.
 */
function parsePlatform(data: any): Platform {
  return {
    architecture: data.architecture ?? 'amd64',
    os: data.os ?? 'linux',
    osVersion: data['os.version'] ?? data.osVersion,
    variant: data.variant,
  };
}

/**
 * Parse ScanFindings from AWS API response.
 */
export function parseScanFindings(data: any): ScanFindings {
  if (!data) {
    throw new EcrError(
      EcrErrorKind.Unknown,
      'Invalid scan findings data: null or undefined'
    );
  }

  return {
    imageScanCompletedAt: data.imageScanCompletedAt ?? new Date().toISOString(),
    vulnerabilitySourceUpdatedAt: data.vulnerabilitySourceUpdatedAt,
    findingSeverityCounts: data.findingSeverityCounts ?? {},
    findings: (data.findings ?? []).map(parseFinding),
  };
}

/**
 * Parse Finding from AWS API response.
 */
function parseFinding(data: any): Finding {
  return {
    name: data.name ?? '',
    description: data.description,
    uri: data.uri,
    severity: data.severity ?? 'UNDEFINED',
    attributes: data.attributes,
  };
}

/**
 * Parse AuthorizationData from AWS API response.
 */
export function parseAuthorizationData(data: any): AuthorizationData {
  if (!data) {
    throw new EcrError(
      EcrErrorKind.Unknown,
      'Invalid authorization data: null or undefined'
    );
  }

  return {
    authorizationToken: data.authorizationToken ?? '',
    expiresAt: data.expiresAt ?? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    proxyEndpoint: data.proxyEndpoint ?? '',
  };
}

/**
 * Parse DescribeRepositories response.
 */
export function parseDescribeRepositoriesResponse(data: any): {
  repositories: Repository[];
  nextToken?: string;
} {
  return {
    repositories: (data.repositories ?? []).map(parseRepository),
    nextToken: data.nextToken,
  };
}

/**
 * Parse ListImages response.
 */
export function parseListImagesResponse(data: any): {
  imageIds: ImageIdentifier[];
  nextToken?: string;
} {
  return {
    imageIds: (data.imageIds ?? []).map(parseImageIdentifier),
    nextToken: data.nextToken,
  };
}

/**
 * Parse DescribeImages response.
 */
export function parseDescribeImagesResponse(data: any): {
  imageDetails: ImageDetail[];
  nextToken?: string;
} {
  return {
    imageDetails: (data.imageDetails ?? []).map(parseImageDetail),
    nextToken: data.nextToken,
  };
}

/**
 * Parse BatchGetImage response.
 */
export function parseBatchGetImageResponse(data: any): {
  images: Image[];
  failures?: Array<{
    imageId: ImageIdentifier;
    failureCode: string;
    failureReason: string;
  }>;
} {
  return {
    images: (data.images ?? []).map(parseImage),
    failures: data.failures
      ? data.failures.map((f: any) => ({
          imageId: parseImageIdentifier(f.imageId),
          failureCode: f.failureCode ?? '',
          failureReason: f.failureReason ?? '',
        }))
      : undefined,
  };
}

/**
 * Parse BatchDeleteImage response.
 */
export function parseBatchDeleteImageResponse(data: any): {
  imageIds: ImageIdentifier[];
  failures?: Array<{
    imageId: ImageIdentifier;
    failureCode: string;
    failureReason: string;
  }>;
} {
  return {
    imageIds: (data.imageIds ?? []).map(parseImageIdentifier),
    failures: data.failures
      ? data.failures.map((f: any) => ({
          imageId: parseImageIdentifier(f.imageId),
          failureCode: f.failureCode ?? '',
          failureReason: f.failureReason ?? '',
        }))
      : undefined,
  };
}

/**
 * Parse GetAuthorizationToken response.
 */
export function parseGetAuthorizationTokenResponse(data: any): {
  authorizationData: AuthorizationData[];
} {
  return {
    authorizationData: (data.authorizationData ?? []).map(
      parseAuthorizationData
    ),
  };
}

/**
 * Parse StartImageScan response.
 */
export function parseStartImageScanResponse(data: any): {
  registryId: string;
  repositoryName: string;
  imageId: ImageIdentifier;
  imageScanStatus: ScanStatus;
} {
  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    imageId: parseImageIdentifier(data.imageId ?? {}),
    imageScanStatus: parseScanStatus(data.imageScanStatus ?? {}),
  };
}

/**
 * Parse DescribeImageScanFindings response.
 */
export function parseDescribeImageScanFindingsResponse(data: any): {
  registryId: string;
  repositoryName: string;
  imageId: ImageIdentifier;
  imageScanStatus: ScanStatus;
  imageScanFindings?: ScanFindings;
  nextToken?: string;
} {
  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    imageId: parseImageIdentifier(data.imageId ?? {}),
    imageScanStatus: parseScanStatus(data.imageScanStatus ?? {}),
    imageScanFindings: data.imageScanFindings
      ? parseScanFindings(data.imageScanFindings)
      : undefined,
    nextToken: data.nextToken,
  };
}

/**
 * Parse GetLifecyclePolicy response.
 */
export function parseGetLifecyclePolicyResponse(data: any): {
  registryId: string;
  repositoryName: string;
  lifecyclePolicyText: string;
  lastEvaluatedAt?: string;
} {
  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    lifecyclePolicyText: data.lifecyclePolicyText ?? '',
    lastEvaluatedAt: data.lastEvaluatedAt,
  };
}

/**
 * Parse GetRepositoryPolicy response.
 */
export function parseGetRepositoryPolicyResponse(data: any): {
  registryId: string;
  repositoryName: string;
  policyText: string;
} {
  return {
    registryId: data.registryId ?? '',
    repositoryName: data.repositoryName ?? '',
    policyText: data.policyText ?? '',
  };
}
