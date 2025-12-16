/**
 * GitHub Packages types for version and visibility management.
 * @module types/package
 */

/**
 * Owner type for packages.
 */
export type OwnerType = 'org' | 'user';

/**
 * Package visibility.
 */
export type Visibility = 'public' | 'private' | 'internal';

/**
 * Container metadata from GitHub Packages API.
 */
export interface ContainerMetadata {
  /** Tags for this version */
  readonly tags: readonly string[];
}

/**
 * Package metadata from GitHub Packages API.
 */
export interface PackageMetadata {
  /** Package type (always 'container' for GHCR) */
  readonly package_type: 'container';
  /** Container-specific metadata */
  readonly container: ContainerMetadata;
}

/**
 * Package version from GitHub Packages API.
 */
export interface PackageVersion {
  /** Version ID */
  readonly id: number;
  /** Version name (usually digest) */
  readonly name: string;
  /** Package URL */
  readonly url: string;
  /** HTML URL for viewing in browser */
  readonly html_url: string;
  /** Creation timestamp */
  readonly created_at: string;
  /** Last update timestamp */
  readonly updated_at: string;
  /** Package metadata */
  readonly metadata: PackageMetadata;
}

/**
 * Package information from GitHub Packages API.
 */
export interface Package {
  /** Package ID */
  readonly id: number;
  /** Package name */
  readonly name: string;
  /** Package type */
  readonly package_type: 'container';
  /** Package visibility */
  readonly visibility: Visibility;
  /** Package URL */
  readonly url: string;
  /** HTML URL */
  readonly html_url: string;
  /** Version count */
  readonly version_count: number;
  /** Owner information */
  readonly owner: {
    readonly login: string;
    readonly id: number;
    readonly type: string;
  };
  /** Repository (if linked) */
  readonly repository?: {
    readonly id: number;
    readonly name: string;
    readonly full_name: string;
  };
  /** Creation timestamp */
  readonly created_at: string;
  /** Last update timestamp */
  readonly updated_at: string;
}

/**
 * Cleanup result for version management.
 */
export interface CleanupResult {
  /** IDs of deleted versions */
  readonly deleted: readonly number[];
  /** IDs of kept versions */
  readonly kept: readonly number[];
  /** Errors during cleanup (version ID -> error message) */
  readonly errors: Readonly<Record<number, string>>;
}

/**
 * Version filter options for listing.
 */
export interface VersionFilter {
  /** Filter by state ('active', 'deleted') */
  readonly state?: 'active' | 'deleted';
  /** Maximum number of results */
  readonly perPage?: number;
  /** Page number */
  readonly page?: number;
}

/**
 * Cleanup configuration.
 */
export interface CleanupConfig {
  /** Number of recent versions to keep */
  readonly keepCount: number;
  /** Tag patterns to always keep (regex strings) */
  readonly keepPatterns: readonly string[];
  /** Only delete untagged versions */
  readonly untaggedOnly?: boolean;
  /** Dry run mode (don't actually delete) */
  readonly dryRun?: boolean;
}

/**
 * Package version utilities.
 */
export const PackageVersionUtils = {
  /**
   * Gets tags from a package version.
   */
  tags(version: PackageVersion): string[] {
    return [...version.metadata.container.tags];
  },

  /**
   * Checks if a version has any tags.
   */
  hasTag(version: PackageVersion): boolean {
    return version.metadata.container.tags.length > 0;
  },

  /**
   * Checks if a version matches any of the given patterns.
   */
  matchesPattern(version: PackageVersion, patterns: RegExp[]): boolean {
    return version.metadata.container.tags.some(tag =>
      patterns.some(pattern => pattern.test(tag))
    );
  },

  /**
   * Gets the creation date as a Date object.
   */
  createdAt(version: PackageVersion): Date {
    return new Date(version.created_at);
  },

  /**
   * Sorts versions by creation date (newest first).
   */
  sortByDate(versions: PackageVersion[]): PackageVersion[] {
    return [...versions].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  /**
   * Filters versions that should be cleaned up based on config.
   */
  filterForCleanup(
    versions: PackageVersion[],
    config: CleanupConfig
  ): PackageVersion[] {
    const sorted = PackageVersionUtils.sortByDate(versions);
    const patterns = config.keepPatterns.map(p => new RegExp(p));

    return sorted.filter((version, index) => {
      // Keep the most recent versions
      if (index < config.keepCount) {
        return false;
      }

      // Keep versions matching patterns
      if (PackageVersionUtils.matchesPattern(version, patterns)) {
        return false;
      }

      // If untagged only, skip tagged versions
      if (config.untaggedOnly && PackageVersionUtils.hasTag(version)) {
        return false;
      }

      return true;
    });
  },
};
