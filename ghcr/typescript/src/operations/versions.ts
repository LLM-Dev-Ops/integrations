/**
 * Package version operations via GitHub Packages API.
 * @module operations/versions
 */

import type { GhcrClient } from '../client.js';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type {
  OwnerType,
  PackageVersion,
  Package,
  CleanupResult,
  CleanupConfig,
  VersionFilter,
} from '../types/mod.js';
import { PackageVersionUtils } from '../types/mod.js';

/**
 * Version operations interface.
 */
export interface VersionOps {
  /**
   * Lists package versions.
   */
  list(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    filter?: VersionFilter
  ): Promise<PackageVersion[]>;

  /**
   * Gets a specific version.
   */
  get(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<PackageVersion>;

  /**
   * Deletes a version.
   */
  delete(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<void>;

  /**
   * Cleans up old versions based on configuration.
   */
  cleanup(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    config: CleanupConfig
  ): Promise<CleanupResult>;

  /**
   * Gets package information.
   */
  getPackage(
    owner: string,
    packageName: string,
    ownerType: OwnerType
  ): Promise<Package>;
}

/**
 * Creates version operations.
 */
export function createVersionOps(client: GhcrClient): VersionOps {
  return new VersionOpsImpl(client);
}

/**
 * Version operations implementation.
 */
class VersionOpsImpl implements VersionOps {
  private readonly client: GhcrClient;

  constructor(client: GhcrClient) {
    this.client = client;
  }

  async list(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    filter?: VersionFilter
  ): Promise<PackageVersion[]> {
    const path = this.buildVersionsPath(owner, packageName, ownerType);

    const params = new URLSearchParams();
    if (filter?.state) {
      params.set('state', filter.state);
    }
    if (filter?.perPage) {
      params.set('per_page', filter.perPage.toString());
    }
    if (filter?.page) {
      params.set('page', filter.page.toString());
    }

    const queryString = params.toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;

    const response = await this.client.apiGet<PackageVersion[]>(fullPath);
    return response.data;
  }

  async get(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<PackageVersion> {
    const path = `${this.buildVersionsPath(owner, packageName, ownerType)}/${versionId}`;

    const response = await this.client.apiGet<PackageVersion>(path);
    return response.data;
  }

  async delete(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<void> {
    const path = `${this.buildVersionsPath(owner, packageName, ownerType)}/${versionId}`;

    await this.client.apiDelete(path);
  }

  async cleanup(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    config: CleanupConfig
  ): Promise<CleanupResult> {
    // Get all versions
    const versions = await this.listAllVersions(owner, packageName, ownerType);

    // Filter versions for cleanup
    const toDelete = PackageVersionUtils.filterForCleanup(versions, config);

    // Track results
    const deleted: number[] = [];
    const kept: number[] = [];
    const errors: Record<number, string> = {};

    // Process deletions
    for (const version of versions) {
      if (toDelete.includes(version)) {
        if (config.dryRun) {
          deleted.push(version.id);
        } else {
          try {
            await this.delete(owner, packageName, version.id, ownerType);
            deleted.push(version.id);
          } catch (error) {
            errors[version.id] = (error as Error).message;
          }
        }
      } else {
        kept.push(version.id);
      }
    }

    return { deleted, kept, errors };
  }

  async getPackage(
    owner: string,
    packageName: string,
    ownerType: OwnerType
  ): Promise<Package> {
    const path = this.buildPackagePath(owner, packageName, ownerType);

    const response = await this.client.apiGet<Package>(path);
    return response.data;
  }

  /**
   * Lists all versions with pagination.
   */
  private async listAllVersions(
    owner: string,
    packageName: string,
    ownerType: OwnerType
  ): Promise<PackageVersion[]> {
    const allVersions: PackageVersion[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const versions = await this.list(owner, packageName, ownerType, {
        page,
        perPage,
        state: 'active',
      });

      if (versions.length === 0) {
        break;
      }

      allVersions.push(...versions);

      if (versions.length < perPage) {
        break;
      }

      page++;
    }

    return allVersions;
  }

  /**
   * Builds the API path for package versions.
   */
  private buildVersionsPath(
    owner: string,
    packageName: string,
    ownerType: OwnerType
  ): string {
    const encodedName = encodeURIComponent(packageName);

    if (ownerType === 'org') {
      return `/orgs/${owner}/packages/container/${encodedName}/versions`;
    }

    return `/users/${owner}/packages/container/${encodedName}/versions`;
  }

  /**
   * Builds the API path for a package.
   */
  private buildPackagePath(
    owner: string,
    packageName: string,
    ownerType: OwnerType
  ): string {
    const encodedName = encodeURIComponent(packageName);

    if (ownerType === 'org') {
      return `/orgs/${owner}/packages/container/${encodedName}`;
    }

    return `/users/${owner}/packages/container/${encodedName}`;
  }
}
