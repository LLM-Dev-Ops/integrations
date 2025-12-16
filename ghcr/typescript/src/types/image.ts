/**
 * Image reference types for GitHub Container Registry.
 * @module types/image
 */

import { GhcrError, GhcrErrorKind } from '../errors.js';

/**
 * Reference type - either a tag or a digest.
 */
export type Reference =
  | { readonly type: 'tag'; readonly value: string }
  | { readonly type: 'digest'; readonly value: string };

/**
 * Reference factory functions.
 */
export const Reference = {
  /**
   * Creates a tag reference.
   */
  tag(value: string): Reference {
    return { type: 'tag', value };
  },

  /**
   * Creates a digest reference.
   */
  digest(value: string): Reference {
    return { type: 'digest', value };
  },

  /**
   * Converts reference to string format.
   */
  toString(ref: Reference): string {
    return ref.type === 'tag' ? ref.value : ref.value;
  },

  /**
   * Gets the URL-safe reference string.
   */
  toUrlString(ref: Reference): string {
    return ref.value;
  },
};

/**
 * Image reference structure for ghcr.io.
 */
export interface ImageRef {
  /** Registry hostname (ghcr.io) */
  readonly registry: string;
  /** Image name (owner/repo) */
  readonly name: string;
  /** Reference (tag or digest) */
  readonly reference: Reference;
}

/**
 * Image reference validation regex patterns.
 */
const PATTERNS = {
  // Image name: [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*
  imageName: /^[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*$/,
  // Tag: [a-zA-Z0-9_][a-zA-Z0-9._-]*
  tag: /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/,
  // Digest: sha256:[a-f0-9]{64}
  digest: /^sha256:[a-f0-9]{64}$/,
};

/**
 * Maximum lengths for validation.
 */
const MAX_LENGTHS = {
  imageName: 256,
  tag: 128,
};

/**
 * Validates an image name.
 */
function validateImageName(name: string): void {
  if (!name || name.length === 0) {
    throw new GhcrError(
      GhcrErrorKind.InvalidImageName,
      'Image name cannot be empty'
    );
  }

  if (name.length > MAX_LENGTHS.imageName) {
    throw new GhcrError(
      GhcrErrorKind.InvalidImageName,
      `Image name must be ${MAX_LENGTHS.imageName} characters or less`
    );
  }

  if (!PATTERNS.imageName.test(name)) {
    throw new GhcrError(
      GhcrErrorKind.InvalidImageName,
      `Invalid image name: ${name}. Must contain only lowercase letters, numbers, and separators (. _ -)`
    );
  }
}

/**
 * Validates a tag.
 */
function validateTag(tag: string): void {
  if (!tag || tag.length === 0) {
    throw new GhcrError(
      GhcrErrorKind.InvalidTag,
      'Tag cannot be empty'
    );
  }

  if (tag.length > MAX_LENGTHS.tag) {
    throw new GhcrError(
      GhcrErrorKind.InvalidTag,
      `Tag must be ${MAX_LENGTHS.tag} characters or less`
    );
  }

  if (!PATTERNS.tag.test(tag)) {
    throw new GhcrError(
      GhcrErrorKind.InvalidTag,
      `Invalid tag: ${tag}. Must start with alphanumeric or underscore`
    );
  }
}

/**
 * Validates a digest.
 */
function validateDigest(digest: string): void {
  if (!PATTERNS.digest.test(digest)) {
    throw new GhcrError(
      GhcrErrorKind.InvalidDigest,
      `Invalid digest: ${digest}. Must be sha256:<64 hex chars>`
    );
  }
}

/**
 * ImageRef factory and utility functions.
 */
export const ImageRef = {
  /**
   * Default registry for GHCR.
   */
  DEFAULT_REGISTRY: 'ghcr.io',

  /**
   * Parses an image reference string.
   * Supports formats:
   * - ghcr.io/owner/image:tag
   * - ghcr.io/owner/image@sha256:digest
   * - owner/image:tag (assumes ghcr.io)
   * - owner/image (assumes ghcr.io and :latest)
   */
  parse(input: string): ImageRef {
    let registry = ImageRef.DEFAULT_REGISTRY;
    let remainder = input;

    // Check if registry is specified
    if (input.includes('/')) {
      const firstSlashIndex = input.indexOf('/');
      const possibleRegistry = input.substring(0, firstSlashIndex);

      // If it contains a dot or colon, it's a registry
      if (possibleRegistry.includes('.') || possibleRegistry.includes(':')) {
        registry = possibleRegistry;
        remainder = input.substring(firstSlashIndex + 1);
      }
    } else {
      throw new GhcrError(
        GhcrErrorKind.InvalidImageRef,
        `Invalid image reference: ${input}. Must include owner/image`
      );
    }

    // Parse name and reference
    let name: string;
    let reference: Reference;

    if (remainder.includes('@sha256:')) {
      const [namePart, digestPart] = remainder.split('@');
      name = namePart ?? '';
      validateImageName(name);
      validateDigest(digestPart ?? '');
      reference = Reference.digest(digestPart ?? '');
    } else if (remainder.includes(':')) {
      const lastColonIndex = remainder.lastIndexOf(':');
      name = remainder.substring(0, lastColonIndex);
      const tag = remainder.substring(lastColonIndex + 1);
      validateImageName(name);
      validateTag(tag);
      reference = Reference.tag(tag);
    } else {
      name = remainder;
      validateImageName(name);
      reference = Reference.tag('latest');
    }

    return { registry, name, reference };
  },

  /**
   * Creates a new ImageRef with validation.
   */
  create(registry: string, name: string, reference: Reference): ImageRef {
    validateImageName(name);
    if (reference.type === 'tag') {
      validateTag(reference.value);
    } else {
      validateDigest(reference.value);
    }
    return { registry, name, reference };
  },

  /**
   * Gets the manifest URL path for this image.
   */
  manifestUrl(ref: ImageRef): string {
    return `/v2/${ref.name}/manifests/${Reference.toUrlString(ref.reference)}`;
  },

  /**
   * Gets the full image name with registry.
   */
  fullName(ref: ImageRef): string {
    return `${ref.registry}/${ref.name}`;
  },

  /**
   * Gets the full image reference as a string.
   */
  toString(ref: ImageRef): string {
    const separator = ref.reference.type === 'digest' ? '@' : ':';
    return `${ref.registry}/${ref.name}${separator}${ref.reference.value}`;
  },

  /**
   * Creates a copy with a new reference.
   */
  withReference(ref: ImageRef, newRef: Reference): ImageRef {
    return { ...ref, reference: newRef };
  },

  /**
   * Creates a copy with a new tag.
   */
  withTag(ref: ImageRef, tag: string): ImageRef {
    validateTag(tag);
    return { ...ref, reference: Reference.tag(tag) };
  },

  /**
   * Creates a copy with a new digest.
   */
  withDigest(ref: ImageRef, digest: string): ImageRef {
    validateDigest(digest);
    return { ...ref, reference: Reference.digest(digest) };
  },
};
