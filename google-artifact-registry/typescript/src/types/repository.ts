/**
 * Repository types for Google Artifact Registry.
 * @module types/repository
 */

import { z } from 'zod';
import type { RepositoryFormat, Timestamp } from './common.js';

/**
 * Cleanup policy action.
 */
export type CleanupPolicyAction = 'DELETE' | 'KEEP';

/**
 * Tag state for cleanup policies.
 */
export type TagState = 'TAGGED' | 'UNTAGGED' | 'ANY';

/**
 * Cleanup policy condition.
 */
export interface CleanupCondition {
  /** Tag state filter */
  tagState?: TagState;
  /** Tag prefix patterns to match */
  tagPrefixes?: string[];
  /** Version name prefix patterns to match */
  versionNamePrefixes?: string[];
  /** Package name prefix patterns to match */
  packageNamePrefixes?: string[];
  /** Minimum age in duration format (e.g., "86400s" for 1 day) */
  olderThan?: string;
  /** Maximum age in duration format */
  newerThan?: string;
}

/**
 * Most recent versions configuration.
 */
export interface MostRecentVersions {
  /** Package name prefixes */
  packageNamePrefixes?: string[];
  /** Number of versions to keep */
  keepCount?: number;
}

/**
 * Cleanup policy configuration.
 */
export interface CleanupPolicy {
  /** Policy ID */
  id: string;
  /** Policy action */
  action: CleanupPolicyAction;
  /** Policy condition */
  condition?: CleanupCondition;
  /** Most recent versions configuration */
  mostRecentVersions?: MostRecentVersions;
}

/**
 * Repository mode.
 */
export type RepositoryMode =
  | 'STANDARD_REPOSITORY'
  | 'VIRTUAL_REPOSITORY'
  | 'REMOTE_REPOSITORY';

/**
 * Virtual repository configuration.
 */
export interface VirtualRepositoryConfig {
  /** Upstream policies */
  upstreamPolicies?: UpstreamPolicy[];
}

/**
 * Upstream policy for virtual repositories.
 */
export interface UpstreamPolicy {
  /** Policy ID */
  id: string;
  /** Repository resource name */
  repository: string;
  /** Priority (lower = higher priority) */
  priority: number;
}

/**
 * Remote repository configuration.
 */
export interface RemoteRepositoryConfig {
  /** Upstream repository URL */
  url: string;
  /** Description */
  description?: string;
}

/**
 * Repository resource from Artifact Registry API.
 */
export interface Repository {
  /** Full resource name: projects/{project}/locations/{location}/repositories/{repository} */
  name: string;
  /** Repository format (DOCKER, MAVEN, NPM, etc.) */
  format: RepositoryFormat;
  /** User-provided description */
  description?: string;
  /** Labels/tags */
  labels?: Record<string, string>;
  /** Creation timestamp */
  createTime: Timestamp;
  /** Last update timestamp */
  updateTime: Timestamp;
  /** KMS key name for CMEK */
  kmsKeyName?: string;
  /** Repository mode */
  mode?: RepositoryMode;
  /** Cleanup policies */
  cleanupPolicies?: Record<string, CleanupPolicy>;
  /** Whether cleanup policy dry run is enabled */
  cleanupPolicyDryRun?: boolean;
  /** Size in bytes */
  sizeBytes?: string;
  /** Satisfies PZS (zone separation) */
  satisfiesPzs?: boolean;
  /** Docker configuration (for DOCKER format) */
  dockerConfig?: DockerRepositoryConfig;
  /** Maven configuration (for MAVEN format) */
  mavenConfig?: MavenRepositoryConfig;
  /** Virtual repository configuration */
  virtualRepositoryConfig?: VirtualRepositoryConfig;
  /** Remote repository configuration */
  remoteRepositoryConfig?: RemoteRepositoryConfig;
}

/**
 * Docker repository configuration.
 */
export interface DockerRepositoryConfig {
  /** Whether immutable tags are enabled */
  immutableTags?: boolean;
}

/**
 * Maven repository configuration.
 */
export interface MavenRepositoryConfig {
  /** Allow snapshot overwrites */
  allowSnapshotOverwrites?: boolean;
  /** Version policy */
  versionPolicy?: 'VERSION_POLICY_UNSPECIFIED' | 'RELEASE' | 'SNAPSHOT';
}

/**
 * List repositories response.
 */
export interface ListRepositoriesResponse {
  /** Repositories in the response */
  repositories: Repository[];
  /** Token for the next page */
  nextPageToken?: string;
}

/**
 * Request to list repositories.
 */
export interface ListRepositoriesRequest {
  /** Parent resource: projects/{project}/locations/{location} */
  parent: string;
  /** Maximum number of repositories to return */
  pageSize?: number;
  /** Page token */
  pageToken?: string;
}

/**
 * Zod schema for Repository validation.
 */
export const RepositorySchema = z.object({
  name: z.string(),
  format: z.enum(['DOCKER', 'MAVEN', 'NPM', 'PYTHON', 'APT', 'YUM', 'GO', 'KFP']),
  description: z.string().optional(),
  labels: z.record(z.string()).optional(),
  createTime: z.string(),
  updateTime: z.string(),
  kmsKeyName: z.string().optional(),
  mode: z.enum(['STANDARD_REPOSITORY', 'VIRTUAL_REPOSITORY', 'REMOTE_REPOSITORY']).optional(),
  cleanupPolicies: z.record(z.any()).optional(),
  cleanupPolicyDryRun: z.boolean().optional(),
  sizeBytes: z.string().optional(),
  satisfiesPzs: z.boolean().optional(),
  dockerConfig: z.object({
    immutableTags: z.boolean().optional(),
  }).optional(),
  mavenConfig: z.object({
    allowSnapshotOverwrites: z.boolean().optional(),
    versionPolicy: z.enum(['VERSION_POLICY_UNSPECIFIED', 'RELEASE', 'SNAPSHOT']).optional(),
  }).optional(),
  virtualRepositoryConfig: z.any().optional(),
  remoteRepositoryConfig: z.any().optional(),
});

/**
 * Extracts the repository ID from a full resource name.
 */
export function getRepositoryId(name: string): string {
  const match = name.match(/repositories\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid repository name format: ${name}`);
  }
  return match[1]!;
}

/**
 * Extracts the location from a repository resource name.
 */
export function getRepositoryLocation(name: string): string {
  const match = name.match(/locations\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid repository name format: ${name}`);
  }
  return match[1]!;
}

/**
 * Extracts the project from a repository resource name.
 */
export function getRepositoryProject(name: string): string {
  const match = name.match(/projects\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid repository name format: ${name}`);
  }
  return match[1]!;
}

/**
 * Builds a repository resource name.
 */
export function buildRepositoryName(
  project: string,
  location: string,
  repository: string
): string {
  return `projects/${project}/locations/${location}/repositories/${repository}`;
}
