/**
 * Validation utilities for Amazon ECR.
 *
 * This module exports validation functions for ECR resources including
 * repository names, image tags, digests, and registry IDs.
 *
 * @module validation
 */

// Repository validation
export {
  validateRepositoryName,
  isValidRepositoryName,
} from './repository.js';

// Image tag validation
export { validateImageTag, isValidImageTag } from './image.js';

// Digest validation and verification
export {
  validateDigestFormat,
  isValidDigest,
  computeDigest,
  verifyDigest,
  getDigestAlgorithm,
  getDigestHash,
} from './digest.js';

// Registry ID validation
export { validateRegistryId, isValidRegistryId } from './registry.js';
