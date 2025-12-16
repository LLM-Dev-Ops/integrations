/**
 * Public registry types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for ECR Public registry entities,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/public
 */

import { Repository } from './repository.js';
import { ImageIdentifier } from './image.js';

export type { AuthorizationData } from './auth.js';

/**
 * ECR Public repository.
 * Similar to Repository but for public.ecr.aws.
 */
export interface PublicRepository extends Repository {
  /** Public repository alias (if available). */
  readonly repositoryAlias?: string;
  /** Public repository catalog data. */
  readonly catalogData?: PublicCatalogData;
}

/**
 * Public repository catalog data.
 */
export interface PublicCatalogData {
  /** Short description of the repository. */
  readonly description?: string;
  /** About text for the repository. */
  readonly aboutText?: string;
  /** Usage text for the repository. */
  readonly usageText?: string;
  /** Operating systems supported. */
  readonly operatingSystems?: string[];
  /** Architectures supported. */
  readonly architectures?: string[];
  /** Logo image URL. */
  readonly logoUrl?: string;
  /** Markdown content for README. */
  readonly marketplaceCertified?: boolean;
}

/**
 * List of public repositories.
 */
export interface PublicRepositoryList {
  /** Array of public repositories. */
  readonly repositories: PublicRepository[];
}

/**
 * Options for listing public repositories.
 */
export interface ListPublicReposOptions {
  /** Filter by specific repository names. */
  readonly repositoryNames?: string[];
  /** Maximum results per page. */
  readonly maxResults?: number;
  /** Pagination token. */
  readonly nextToken?: string;
}

/**
 * List of images in a repository.
 */
export interface ImageList {
  /** Array of image identifiers. */
  readonly images: ImageIdentifier[];
  /** Pagination token for next page. */
  readonly nextToken?: string;
}

/**
 * Options for listing images.
 */
export interface ListImagesOptions {
  /** Filter by tag status (TAGGED, UNTAGGED, ANY). */
  readonly tagStatus?: 'TAGGED' | 'UNTAGGED' | 'ANY';
  /** Maximum results per page. */
  readonly maxResults?: number;
  /** Pagination token. */
  readonly nextToken?: string;
  /** Maximum total results to return. */
  readonly limit?: number;
}
