/**
 * Azure Key Vault Rotation Handler
 *
 * Defines interfaces for handling secret and key rotation events.
 * Following the SPARC specification for Azure Key Vault integration.
 */

import type { SecretProperties, Secret } from '../types/index.js';
import type { Key } from '../types/index.js';

/**
 * Handler interface for rotation events.
 *
 * Implementations of this interface are notified when secrets or keys
 * are near expiry or have been rotated.
 */
export interface RotationHandler {
  /**
   * Called when a secret is near expiry.
   *
   * @param secret - Secret properties including expiration information
   * @param daysUntilExpiry - Number of days until the secret expires
   */
  onNearExpiry(secret: SecretProperties, daysUntilExpiry: number): Promise<void>;

  /**
   * Called when a new secret version is created.
   *
   * @param secret - The new secret version
   * @param previousVersion - Version identifier of the previous secret
   */
  onSecretRotated(secret: Secret, previousVersion: string): Promise<void>;

  /**
   * Called when a key is rotated.
   *
   * @param key - The new key version
   * @param previousVersion - Version identifier of the previous key
   */
  onKeyRotated(key: Key, previousVersion: string): Promise<void>;
}

/**
 * No-op implementation of RotationHandler.
 *
 * This default implementation does nothing when rotation events occur.
 * Useful as a placeholder or when rotation handling is not needed.
 */
export class NoOpRotationHandler implements RotationHandler {
  /**
   * No-op implementation for near expiry events.
   */
  async onNearExpiry(_secret: SecretProperties, _daysUntilExpiry: number): Promise<void> {
    // No-op
  }

  /**
   * No-op implementation for secret rotation events.
   */
  async onSecretRotated(_secret: Secret, _previousVersion: string): Promise<void> {
    // No-op
  }

  /**
   * No-op implementation for key rotation events.
   */
  async onKeyRotated(_key: Key, _previousVersion: string): Promise<void> {
    // No-op
  }
}
