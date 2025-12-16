/**
 * Package and version types for Google Artifact Registry.
 * @module types/package
 */

import { z } from 'zod';
import type { Timestamp } from './common.js';

/**
 * Package resource from Artifact Registry API.
 */
export interface Package {
  /** Full resource name */
  name: string;
  /** Display name */
  displayName?: string;
  /** Creation timestamp */
  createTime?: Timestamp;
  /** Last update timestamp */
  updateTime?: Timestamp;
}

/**
 * Version resource from Artifact Registry API.
 */
export interface Version {
  /** Full resource name */
  name: string;
  /** Description */
  description?: string;
  /** Creation timestamp */
  createTime: Timestamp;
  /** Last update timestamp */
  updateTime: Timestamp;
  /** Related tags */
  relatedTags?: Tag[];
  /** Version metadata (format-specific) */
  metadata?: Record<string, unknown>;
}

/**
 * Tag resource from Artifact Registry API.
 */
export interface Tag {
  /** Full resource name */
  name: string;
  /** Version the tag points to */
  version: string;
}

/**
 * File resource from Artifact Registry API.
 */
export interface File {
  /** Full resource name */
  name: string;
  /** Size in bytes */
  sizeBytes?: string;
  /** File hashes */
  hashes?: Hash[];
  /** Creation timestamp */
  createTime?: Timestamp;
  /** Last update timestamp */
  updateTime?: Timestamp;
  /** Owner (for certain formats) */
  owner?: string;
  /** Fetch time */
  fetchTime?: Timestamp;
}

/**
 * Hash information.
 */
export interface Hash {
  /** Hash type (e.g., SHA256) */
  type: 'SHA256' | 'MD5';
  /** Hash value (base64 encoded) */
  value: string;
}

/**
 * List packages response.
 */
export interface ListPackagesResponse {
  /** Packages in the response */
  packages: Package[];
  /** Token for the next page */
  nextPageToken?: string;
}

/**
 * List versions response.
 */
export interface ListVersionsResponse {
  /** Versions in the response */
  versions: Version[];
  /** Token for the next page */
  nextPageToken?: string;
}

/**
 * List tags response.
 */
export interface ListTagsResponse {
  /** Tags in the response */
  tags: Tag[];
  /** Token for the next page */
  nextPageToken?: string;
}

/**
 * List files response.
 */
export interface ListFilesResponse {
  /** Files in the response */
  files: File[];
  /** Token for the next page */
  nextPageToken?: string;
}

/**
 * Create tag request.
 */
export interface CreateTagRequest {
  /** Tag ID (e.g., "latest", "v1.0.0") */
  tagId: string;
  /** Version resource name the tag should point to */
  version: string;
}

/**
 * Update tag request.
 */
export interface UpdateTagRequest {
  /** Tag resource to update */
  tag: Tag;
  /** Fields to update */
  updateMask?: string;
}

/**
 * Zod schema for Package validation.
 */
export const PackageSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  createTime: z.string().optional(),
  updateTime: z.string().optional(),
});

/**
 * Zod schema for Version validation.
 */
export const VersionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  createTime: z.string(),
  updateTime: z.string(),
  relatedTags: z.array(z.object({
    name: z.string(),
    version: z.string(),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for Tag validation.
 */
export const TagSchema = z.object({
  name: z.string(),
  version: z.string(),
});

/**
 * Extracts the package ID from a full resource name.
 * Package names may contain slashes (e.g., Docker images).
 */
export function getPackageId(name: string): string {
  const match = name.match(/packages\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid package name format: ${name}`);
  }
  return match[1]!;
}

/**
 * Extracts the version ID from a full resource name.
 */
export function getVersionId(name: string): string {
  const match = name.match(/versions\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid version name format: ${name}`);
  }
  return match[1]!;
}

/**
 * Extracts the tag ID from a full resource name.
 */
export function getTagId(name: string): string {
  const match = name.match(/tags\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid tag name format: ${name}`);
  }
  return match[1]!;
}

/**
 * Builds a package resource name.
 */
export function buildPackageName(
  project: string,
  location: string,
  repository: string,
  packageName: string
): string {
  return `projects/${project}/locations/${location}/repositories/${repository}/packages/${packageName}`;
}

/**
 * Builds a version resource name.
 */
export function buildVersionName(
  project: string,
  location: string,
  repository: string,
  packageName: string,
  version: string
): string {
  return `projects/${project}/locations/${location}/repositories/${repository}/packages/${packageName}/versions/${version}`;
}

/**
 * Builds a tag resource name.
 */
export function buildTagName(
  project: string,
  location: string,
  repository: string,
  packageName: string,
  tag: string
): string {
  return `projects/${project}/locations/${location}/repositories/${repository}/packages/${packageName}/tags/${tag}`;
}

/**
 * URL-encodes a package name for API requests.
 * Package names may contain slashes which need encoding.
 */
export function encodePackageName(packageName: string): string {
  return encodeURIComponent(packageName).replace(/%2F/g, '%2F');
}
