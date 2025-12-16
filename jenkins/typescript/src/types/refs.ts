/**
 * Reference types for Jenkins resources.
 *
 * This module provides type-safe references to Jenkins jobs, builds, and queue items.
 * Each ref type includes methods for path construction and URL encoding.
 *
 * @module refs
 */

/**
 * Reference to a Jenkins job.
 *
 * Supports three variants:
 * - Simple: Direct job name
 * - Folder: Nested folder path
 * - Url: Full Jenkins URL
 */
export type JobRef =
  | { type: 'simple'; name: string }
  | { type: 'folder'; path: string[] }
  | { type: 'url'; url: string };

/**
 * Creates a simple job reference.
 *
 * @param name - The job name
 * @returns A simple JobRef
 *
 * @example
 * const ref = simpleJob('my-job');
 * ref.toPath(); // Returns 'job/my-job'
 */
export function simpleJob(name: string): JobRef {
  return { type: 'simple', name };
}

/**
 * Creates a folder job reference.
 *
 * @param path - Array of folder and job names
 * @returns A folder JobRef
 *
 * @example
 * const ref = folderJob(['team', 'project', 'my-job']);
 * ref.toPath(); // Returns 'job/team/job/project/job/my-job'
 */
export function folderJob(path: string[]): JobRef {
  return { type: 'folder', path };
}

/**
 * Creates a URL job reference.
 *
 * @param url - Full Jenkins URL
 * @returns A URL JobRef
 *
 * @example
 * const ref = urlJob('https://jenkins.example.com/job/my-job/');
 */
export function urlJob(url: string): JobRef {
  return { type: 'url', url };
}

/**
 * Converts a JobRef to its API path representation.
 *
 * Each path segment is URL-encoded to handle special characters.
 *
 * @param ref - The job reference
 * @returns URL-encoded path suitable for API requests
 *
 * @example
 * const simple = simpleJob('my-job');
 * jobRefToPath(simple); // Returns 'job/my-job'
 *
 * const folder = folderJob(['team', 'my project', 'my-job']);
 * jobRefToPath(folder); // Returns 'job/team/job/my%20project/job/my-job'
 */
export function jobRefToPath(ref: JobRef): string {
  switch (ref.type) {
    case 'simple':
      return `job/${encodeURIComponent(ref.name)}`;
    case 'folder':
      return ref.path.map((segment) => `job/${encodeURIComponent(segment)}`).join('/');
    case 'url':
      return ref.url;
  }
}

/**
 * Reference to a Jenkins build.
 *
 * Supports specific build numbers and symbolic references like "last", "lastSuccessful", etc.
 */
export type BuildRef =
  | { type: 'number'; number: number }
  | { type: 'last' }
  | { type: 'lastSuccessful' }
  | { type: 'lastFailed' }
  | { type: 'lastStable' }
  | { type: 'lastUnstable' };

/**
 * Creates a numeric build reference.
 *
 * @param number - The build number
 * @returns A numeric BuildRef
 *
 * @example
 * const ref = buildNumber(42);
 * ref.toPath(); // Returns '42'
 */
export function buildNumber(number: number): BuildRef {
  return { type: 'number', number };
}

/**
 * Reference to the last build.
 */
export const lastBuild: BuildRef = { type: 'last' };

/**
 * Reference to the last successful build.
 */
export const lastSuccessfulBuild: BuildRef = { type: 'lastSuccessful' };

/**
 * Reference to the last failed build.
 */
export const lastFailedBuild: BuildRef = { type: 'lastFailed' };

/**
 * Reference to the last stable build.
 */
export const lastStableBuild: BuildRef = { type: 'lastStable' };

/**
 * Reference to the last unstable build.
 */
export const lastUnstableBuild: BuildRef = { type: 'lastUnstable' };

/**
 * Converts a BuildRef to its API path representation.
 *
 * @param ref - The build reference
 * @returns Path segment for API requests
 *
 * @example
 * buildRefToPath(buildNumber(42)); // Returns '42'
 * buildRefToPath(lastBuild); // Returns 'lastBuild'
 * buildRefToPath(lastSuccessfulBuild); // Returns 'lastSuccessfulBuild'
 */
export function buildRefToPath(ref: BuildRef): string {
  switch (ref.type) {
    case 'number':
      return ref.number.toString();
    case 'last':
      return 'lastBuild';
    case 'lastSuccessful':
      return 'lastSuccessfulBuild';
    case 'lastFailed':
      return 'lastFailedBuild';
    case 'lastStable':
      return 'lastStableBuild';
    case 'lastUnstable':
      return 'lastUnstableBuild';
  }
}

/**
 * Reference to a queue item.
 *
 * Queue items are identified by numeric IDs.
 */
export interface QueueRef {
  /** The queue item ID. */
  readonly id: number;
}

/**
 * Creates a queue item reference.
 *
 * @param id - The queue item ID
 * @returns A QueueRef
 *
 * @example
 * const ref = queueItem(123);
 * ref.id; // Returns 123
 */
export function queueItem(id: number): QueueRef {
  return { id };
}
