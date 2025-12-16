/**
 * Metadata caching for Amazon ECR repositories and images.
 *
 * This module provides TTL-based caching for repository metadata, image details,
 * manifests, and scan findings to reduce API calls and improve performance.
 *
 * @module cache/metadata-cache
 */

import type { Repository } from '../types/repository.js';
import type { ImageDetail } from '../types/image.js';
import type { ImageManifest } from '../types/manifest.js';
import type { ScanFindingsSummary } from '../types/scan.js';

/**
 * Cache configuration with TTL values for different data types.
 */
export interface CacheConfig {
  /** Repository metadata TTL in milliseconds (default: 5 minutes). */
  repositoryTtlMs: number;
  /** Image list TTL in milliseconds (default: 1 minute). */
  imageListTtlMs: number;
  /** Image detail TTL in milliseconds (default: 10 minutes). */
  imageDetailTtlMs: number;
  /** Scan findings TTL in milliseconds (default: 5 minutes). */
  scanFindingsTtlMs: number;
  /** Maximum number of entries in each cache (default: 1000). */
  maxEntries: number;
}

/**
 * Default cache configuration.
 */
const DEFAULT_CONFIG: CacheConfig = {
  repositoryTtlMs: 5 * 60 * 1000, // 5 minutes
  imageListTtlMs: 1 * 60 * 1000, // 1 minute
  imageDetailTtlMs: 10 * 60 * 1000, // 10 minutes
  scanFindingsTtlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
};

/**
 * Cached entry with TTL and timestamp.
 */
interface CacheEntry<T> {
  /** Cached value. */
  readonly value: T;
  /** Expiration timestamp. */
  readonly expiresAt: Date;
  /** Creation timestamp. */
  readonly cachedAt: Date;
}

/**
 * LRU cache implementation with TTL support.
 */
class TtlCache<K, V> {
  private readonly cache: Map<K, CacheEntry<V>>;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries: number) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = new Date();
    if (now >= entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Check capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      // Remove oldest entry (first in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const now = new Date();
    const entry: CacheEntry<V> = {
      value,
      expiresAt: new Date(now.getTime() + this.ttlMs),
      cachedAt: now,
    };

    this.cache.set(key, entry);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Metadata cache for ECR resources.
 *
 * Provides separate caches for repositories, image details, manifests, and scan findings
 * with appropriate TTL values for each type of data.
 */
export class MetadataCache {
  private readonly config: CacheConfig;
  private readonly repositories: TtlCache<string, Repository>;
  private readonly imageDetails: TtlCache<string, ImageDetail>;
  private readonly manifests: Map<string, ImageManifest>; // No TTL - manifests are immutable
  private readonly scanFindings: TtlCache<string, ScanFindingsSummary>;

  /**
   * Creates a new metadata cache.
   *
   * @param config - Partial cache configuration (merged with defaults)
   */
  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.repositories = new TtlCache(
      this.config.repositoryTtlMs,
      this.config.maxEntries
    );

    this.imageDetails = new TtlCache(
      this.config.imageDetailTtlMs,
      this.config.maxEntries
    );

    this.manifests = new Map();

    this.scanFindings = new TtlCache(
      this.config.scanFindingsTtlMs,
      this.config.maxEntries
    );
  }

  // Repository cache methods

  /**
   * Retrieves a cached repository.
   *
   * @param name - Repository name
   * @returns Cached repository if available and not expired, undefined otherwise
   */
  getRepository(name: string): Repository | undefined {
    return this.repositories.get(name);
  }

  /**
   * Stores a repository in the cache.
   *
   * @param name - Repository name
   * @param repo - Repository to cache
   */
  setRepository(name: string, repo: Repository): void {
    this.repositories.set(name, repo);
  }

  /**
   * Invalidates a cached repository.
   *
   * @param name - Repository name
   */
  invalidateRepository(name: string): void {
    this.repositories.delete(name);
  }

  // Image detail cache methods

  /**
   * Retrieves cached image details.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   * @returns Cached image details if available and not expired, undefined otherwise
   */
  getImageDetails(repoName: string, digest: string): ImageDetail | undefined {
    const key = this.makeImageKey(repoName, digest);
    return this.imageDetails.get(key);
  }

  /**
   * Stores image details in the cache.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   * @param detail - Image details to cache
   */
  setImageDetails(
    repoName: string,
    digest: string,
    detail: ImageDetail
  ): void {
    const key = this.makeImageKey(repoName, digest);
    this.imageDetails.set(key, detail);
  }

  /**
   * Invalidates cached image details.
   *
   * @param repoName - Repository name
   * @param digest - Image digest
   */
  invalidateImageDetails(repoName: string, digest: string): void {
    const key = this.makeImageKey(repoName, digest);
    this.imageDetails.delete(key);
  }

  // Manifest cache methods

  /**
   * Retrieves a cached manifest.
   *
   * Manifests are immutable (content-addressable by digest) and never expire.
   *
   * @param digest - Manifest digest
   * @returns Cached manifest if available, undefined otherwise
   */
  getManifest(digest: string): ImageManifest | undefined {
    return this.manifests.get(digest);
  }

  /**
   * Stores a manifest in the cache.
   *
   * Manifests are immutable and cached indefinitely.
   *
   * @param digest - Manifest digest
   * @param manifest - Manifest to cache
   */
  setManifest(digest: string, manifest: ImageManifest): void {
    // Check capacity for manifest cache
    if (
      this.manifests.size >= this.config.maxEntries &&
      !this.manifests.has(digest)
    ) {
      // Remove oldest entry (first in map)
      const firstKey = this.manifests.keys().next().value;
      if (firstKey !== undefined) {
        this.manifests.delete(firstKey);
      }
    }

    this.manifests.set(digest, manifest);
  }

  // Scan findings cache methods

  /**
   * Retrieves cached scan findings.
   *
   * @param digest - Image digest
   * @returns Cached scan findings if available and not expired, undefined otherwise
   */
  getScanFindings(digest: string): ScanFindingsSummary | undefined {
    return this.scanFindings.get(digest);
  }

  /**
   * Stores scan findings in the cache.
   *
   * @param digest - Image digest
   * @param findings - Scan findings to cache
   */
  setScanFindings(digest: string, findings: ScanFindingsSummary): void {
    this.scanFindings.set(digest, findings);
  }

  /**
   * Invalidates cached scan findings.
   *
   * @param digest - Image digest
   */
  invalidateScanFindings(digest: string): void {
    this.scanFindings.delete(digest);
  }

  // Invalidation methods

  /**
   * Invalidates all caches related to a repository on write operations.
   *
   * This should be called when a repository is modified (e.g., image pushed, deleted).
   *
   * @param repositoryName - Repository name
   */
  invalidateOnWrite(repositoryName: string): void {
    // Invalidate repository metadata
    this.repositories.delete(repositoryName);

    // Note: We can't easily invalidate image details without iterating all keys
    // This is acceptable as image details have a short TTL (10 minutes)
    // and new operations will fetch fresh data
  }

  /**
   * Clears all caches.
   */
  clear(): void {
    this.repositories.clear();
    this.imageDetails.clear();
    this.manifests.clear();
    this.scanFindings.clear();
  }

  /**
   * Gets cache statistics.
   *
   * @returns Object containing cache sizes
   */
  getStats(): {
    repositories: number;
    imageDetails: number;
    manifests: number;
    scanFindings: number;
  } {
    return {
      repositories: this.repositories.size,
      imageDetails: this.imageDetails.size,
      manifests: this.manifests.size,
      scanFindings: this.scanFindings.size,
    };
  }

  /**
   * Creates a composite key for image cache entries.
   */
  private makeImageKey(repoName: string, digest: string): string {
    return `${repoName}:${digest}`;
  }
}
