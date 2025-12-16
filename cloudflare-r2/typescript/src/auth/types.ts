/**
 * Authentication type definitions for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/auth/types
 */

/**
 * R2 access credentials.
 */
export interface R2Credentials {
  /**
   * R2 access key ID.
   */
  accessKeyId: string;

  /**
   * R2 secret access key.
   */
  secretAccessKey: string;
}

/**
 * Provider interface for retrieving R2 credentials.
 */
export interface AuthProvider {
  /**
   * Retrieves R2 credentials.
   *
   * @returns Promise resolving to R2 credentials
   */
  getCredentials(): Promise<R2Credentials>;
}
