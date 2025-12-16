/**
 * Tag operations for GitHub Container Registry.
 * @module operations/tags
 */

import type { GhcrClient } from '../client.js';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type { ImageRef } from '../types/mod.js';
import { ReferenceNs as Reference } from '../types/mod.js';
import type { ManifestOps } from './manifests.js';

/**
 * Tag operations interface.
 */
export interface TagOps {
  /**
   * Lists all tags for an image.
   */
  list(imageName: string): Promise<string[]>;

  /**
   * Lists tags with pagination.
   */
  listPaginated(imageName: string, limit: number): Promise<TagListResult>;

  /**
   * Checks if a tag exists.
   */
  exists(imageName: string, tag: string): Promise<boolean>;

  /**
   * Creates or updates a tag.
   */
  tag(image: ImageRef, newTag: string): Promise<void>;

  /**
   * Deletes a tag.
   */
  delete(imageName: string, tag: string): Promise<void>;

  /**
   * Retags an image atomically.
   */
  retagAtomic(imageName: string, oldTag: string, newTag: string): Promise<void>;
}

/**
 * Result of paginated tag listing.
 */
export interface TagListResult {
  readonly tags: string[];
  readonly nextLink?: string;
}

/**
 * Creates tag operations.
 */
export function createTagOps(
  client: GhcrClient,
  manifestOps: ManifestOps
): TagOps {
  return new TagOpsImpl(client, manifestOps);
}

/**
 * Tag operations implementation.
 */
class TagOpsImpl implements TagOps {
  private readonly client: GhcrClient;
  private readonly manifestOps: ManifestOps;

  constructor(client: GhcrClient, manifestOps: ManifestOps) {
    this.client = client;
    this.manifestOps = manifestOps;
  }

  async list(imageName: string): Promise<string[]> {
    const allTags: string[] = [];
    let result = await this.listPaginated(imageName, 100);

    allTags.push(...result.tags);

    while (result.nextLink) {
      result = await this.fetchNextPage(result.nextLink);
      allTags.push(...result.tags);
    }

    return allTags;
  }

  async listPaginated(imageName: string, limit: number): Promise<TagListResult> {
    const path = `/v2/${imageName}/tags/list?n=${limit}`;

    const response = await this.client.registryGet<TagListResponse>(path);

    const nextLink = this.parseNextLink(response.headers);

    return {
      tags: response.data.tags ?? [],
      nextLink,
    };
  }

  async exists(imageName: string, tag: string): Promise<boolean> {
    const image: ImageRef = {
      registry: this.client.getConfig().registry,
      name: imageName,
      reference: Reference.tag(tag),
    };

    return this.manifestOps.exists(image);
  }

  async tag(image: ImageRef, newTag: string): Promise<void> {
    // Get the current manifest
    const result = await this.manifestOps.get(image);

    // Put it with the new tag
    const targetImage: ImageRef = {
      ...image,
      reference: Reference.tag(newTag),
    };

    await this.manifestOps.put(targetImage, result.manifest);
  }

  async delete(imageName: string, tag: string): Promise<void> {
    const image: ImageRef = {
      registry: this.client.getConfig().registry,
      name: imageName,
      reference: Reference.tag(tag),
    };

    // Get the digest first
    const result = await this.manifestOps.head(image);

    if (!result.exists || !result.digest) {
      throw new GhcrError(
        GhcrErrorKind.TagNotFound,
        `Tag not found: ${tag}`
      );
    }

    // Delete by digest
    const digestImage: ImageRef = {
      ...image,
      reference: Reference.digest(result.digest),
    };

    await this.manifestOps.delete(digestImage);
  }

  async retagAtomic(imageName: string, oldTag: string, newTag: string): Promise<void> {
    const image: ImageRef = {
      registry: this.client.getConfig().registry,
      name: imageName,
      reference: Reference.tag(oldTag),
    };

    // First, create the new tag
    await this.tag(image, newTag);

    // Then delete the old tag
    // Note: This is not truly atomic, but it's the best we can do with OCI
    try {
      await this.delete(imageName, oldTag);
    } catch (error) {
      // Log warning but don't fail
      console.warn(`Failed to delete old tag ${oldTag}: ${error}`);
    }
  }

  /**
   * Fetches the next page of tags.
   */
  private async fetchNextPage(nextLink: string): Promise<TagListResult> {
    const response = await this.client.registryGet<TagListResponse>(nextLink);

    const newNextLink = this.parseNextLink(response.headers);

    return {
      tags: response.data.tags ?? [],
      nextLink: newNextLink,
    };
  }

  /**
   * Parses the Link header for pagination.
   */
  private parseNextLink(headers: Headers): string | undefined {
    const linkHeader = headers.get('Link');
    if (!linkHeader) {
      return undefined;
    }

    // Parse Link header: <url>; rel="next"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) {
      return undefined;
    }

    return match[1];
  }
}

/**
 * Response from tag list endpoint.
 */
interface TagListResponse {
  name: string;
  tags: string[] | null;
}
