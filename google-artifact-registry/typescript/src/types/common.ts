/**
 * Common types for Google Artifact Registry integration.
 * @module types/common
 */

import { z } from 'zod';

/**
 * Tag or digest reference for an image.
 */
export type TagOrDigest =
  | { type: 'tag'; value: string }
  | { type: 'digest'; value: string };

/**
 * Image reference identifying a specific image in Artifact Registry.
 */
export interface ImageReference {
  /** GCP region or multi-region (e.g., "us-central1", "us", "europe") */
  location: string;
  /** GCP project ID */
  project: string;
  /** Repository name */
  repository: string;
  /** Image name */
  image: string;
  /** Tag or digest reference */
  reference: TagOrDigest;
}

/**
 * Creates an ImageReference from components.
 */
export function createImageReference(
  location: string,
  project: string,
  repository: string,
  image: string,
  reference: string
): ImageReference {
  const isDigest = reference.startsWith('sha256:');
  return {
    location,
    project,
    repository,
    image,
    reference: isDigest
      ? { type: 'digest', value: reference }
      : { type: 'tag', value: reference },
  };
}

/**
 * Gets the registry URL for an image reference.
 */
export function getRegistryUrl(ref: ImageReference): string {
  return `${ref.location}-docker.pkg.dev`;
}

/**
 * Gets the full image name (project/repository/image).
 */
export function getFullImageName(ref: ImageReference): string {
  return `${ref.project}/${ref.repository}/${ref.image}`;
}

/**
 * Gets the reference string (tag or digest value).
 */
export function getReferenceString(ref: ImageReference): string {
  return ref.reference.value;
}

/**
 * Parses an image reference string into an ImageReference object.
 * Format: {location}-docker.pkg.dev/{project}/{repository}/{image}:{tag|@sha256:digest}
 */
export function parseImageReference(imageString: string): ImageReference {
  // Handle both tag and digest formats
  const digestMatch = imageString.match(
    /^([^-]+(?:-[^-]+)*)-docker\.pkg\.dev\/([^/]+)\/([^/]+)\/([^@:]+)@(sha256:[a-f0-9]+)$/
  );
  if (digestMatch) {
    const [, location, project, repository, image, digest] = digestMatch;
    return {
      location: location!,
      project: project!,
      repository: repository!,
      image: image!,
      reference: { type: 'digest', value: digest! },
    };
  }

  const tagMatch = imageString.match(
    /^([^-]+(?:-[^-]+)*)-docker\.pkg\.dev\/([^/]+)\/([^/]+)\/([^:]+)(?::(.+))?$/
  );
  if (tagMatch) {
    const [, location, project, repository, image, tag = 'latest'] = tagMatch;
    return {
      location: location!,
      project: project!,
      repository: repository!,
      image: image!,
      reference: { type: 'tag', value: tag },
    };
  }

  throw new Error(`Invalid image reference format: ${imageString}`);
}

/**
 * Formats an ImageReference back to a string.
 */
export function formatImageReference(ref: ImageReference): string {
  const base = `${getRegistryUrl(ref)}/${getFullImageName(ref)}`;
  return ref.reference.type === 'digest'
    ? `${base}@${ref.reference.value}`
    : `${base}:${ref.reference.value}`;
}

/**
 * Repository format types supported by Artifact Registry.
 */
export type RepositoryFormat =
  | 'DOCKER'
  | 'MAVEN'
  | 'NPM'
  | 'PYTHON'
  | 'APT'
  | 'YUM'
  | 'GO'
  | 'KFP';

/**
 * Zod schema for repository format validation.
 */
export const RepositoryFormatSchema = z.enum([
  'DOCKER',
  'MAVEN',
  'NPM',
  'PYTHON',
  'APT',
  'YUM',
  'GO',
  'KFP',
]);

/**
 * Pagination options for list operations.
 */
export interface PaginationOptions {
  /** Maximum number of items to return */
  pageSize?: number;
  /** Token for the next page */
  pageToken?: string;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  /** Items in the current page */
  items: T[];
  /** Token for the next page (undefined if no more pages) */
  nextPageToken?: string;
}

/**
 * GCP resource name pattern.
 */
export interface ResourceName {
  /** Full resource name */
  name: string;
  /** Project ID extracted from name */
  projectId: string;
  /** Location extracted from name */
  location: string;
}

/**
 * Parses a GCP resource name.
 */
export function parseResourceName(name: string): ResourceName {
  const match = name.match(
    /^projects\/([^/]+)\/locations\/([^/]+)/
  );
  if (!match) {
    throw new Error(`Invalid resource name format: ${name}`);
  }
  return {
    name,
    projectId: match[1]!,
    location: match[2]!,
  };
}

/**
 * Timestamp string in RFC3339 format.
 */
export type Timestamp = string;

/**
 * Known GCP locations for Artifact Registry.
 */
export const MULTI_REGIONAL_LOCATIONS = ['us', 'europe', 'asia'] as const;

export const REGIONAL_LOCATIONS = [
  'us-central1',
  'us-east1',
  'us-east4',
  'us-west1',
  'us-west2',
  'us-west3',
  'us-west4',
  'europe-west1',
  'europe-west2',
  'europe-west3',
  'europe-west4',
  'europe-west6',
  'europe-north1',
  'asia-east1',
  'asia-east2',
  'asia-northeast1',
  'asia-northeast2',
  'asia-northeast3',
  'asia-south1',
  'asia-southeast1',
  'asia-southeast2',
  'australia-southeast1',
  'northamerica-northeast1',
  'southamerica-east1',
] as const;

export type MultiRegionalLocation = typeof MULTI_REGIONAL_LOCATIONS[number];
export type RegionalLocation = typeof REGIONAL_LOCATIONS[number];
export type Location = MultiRegionalLocation | RegionalLocation;

/**
 * Validates a location string.
 */
export function isValidLocation(location: string): location is Location {
  return (
    (MULTI_REGIONAL_LOCATIONS as readonly string[]).includes(location) ||
    (REGIONAL_LOCATIONS as readonly string[]).includes(location)
  );
}

/**
 * OAuth2 scopes required for Artifact Registry operations.
 */
export const ARTIFACT_REGISTRY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
] as const;

/**
 * Default API endpoint for Artifact Registry.
 */
export const DEFAULT_API_ENDPOINT = 'https://artifactregistry.googleapis.com';

/**
 * Container Analysis API endpoint.
 */
export const CONTAINER_ANALYSIS_ENDPOINT = 'https://containeranalysis.googleapis.com';
