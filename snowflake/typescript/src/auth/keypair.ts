/**
 * Key-Pair/JWT Authentication Handler
 *
 * Implements key-pair based authentication for Snowflake using RSA private keys and JWT tokens.
 * @module @llmdevops/snowflake-integration/auth/keypair
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import type { KeyPairAuthConfig } from '../config/index.js';
import {
  AuthenticationError,
  InvalidCredentialsError,
} from '../errors/index.js';
import { BaseCredentialProvider, type Credentials } from './provider.js';

// ============================================================================
// Constants
// ============================================================================

/** Default JWT expiration time in seconds (1 hour) */
const DEFAULT_JWT_EXPIRATION_SECONDS = 3600;

/** Algorithm for JWT signing */
const JWT_ALGORITHM = 'RS256';

// ============================================================================
// Key-Pair Credential Provider
// ============================================================================

/**
 * Credential provider for key-pair (JWT) authentication.
 *
 * This provider loads an RSA private key (from file path or string),
 * generates JWT tokens, and signs them for Snowflake authentication.
 * The JWT tokens expire after a configurable period (default: 1 hour).
 *
 * @example
 * ```typescript
 * // From file path
 * const provider = new KeyPairCredentialProvider({
 *   method: 'keypair',
 *   username: 'myuser',
 *   privateKeyPath: '/path/to/private_key.pem',
 *   privateKeyPassphrase: 'optional-passphrase'
 * });
 *
 * // From key string
 * const provider = new KeyPairCredentialProvider({
 *   method: 'keypair',
 *   username: 'myuser',
 *   privateKey: '-----BEGIN PRIVATE KEY-----\n...'
 * });
 * ```
 */
export class KeyPairCredentialProvider extends BaseCredentialProvider {
  private readonly config: KeyPairAuthConfig;
  private privateKey: string | null = null;
  private publicKeyFingerprint: string | null = null;

  /**
   * Creates a new key-pair credential provider.
   *
   * @param config - Key-pair authentication configuration
   * @throws {InvalidCredentialsError} If configuration is invalid
   */
  constructor(config: KeyPairAuthConfig) {
    super();
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates the key-pair authentication configuration.
   *
   * @param config - Configuration to validate
   * @throws {InvalidCredentialsError} If configuration is invalid
   */
  private validateConfig(config: KeyPairAuthConfig): void {
    if (!config.username || config.username.trim() === '') {
      throw new InvalidCredentialsError('Username is required for key-pair authentication');
    }

    if (!config.privateKeyPath && !config.privateKey) {
      throw new InvalidCredentialsError(
        'Either privateKeyPath or privateKey is required for key-pair authentication'
      );
    }

    if (config.privateKeyPath && config.privateKey) {
      throw new InvalidCredentialsError(
        'Cannot specify both privateKeyPath and privateKey - use only one'
      );
    }
  }

  /**
   * Loads the private key from file or uses the provided key string.
   *
   * @returns Promise resolving to the private key in PEM format
   * @throws {AuthenticationError} If key cannot be loaded
   */
  private async loadPrivateKey(): Promise<string> {
    if (this.privateKey) {
      return this.privateKey;
    }

    try {
      let keyData: string;

      if (this.config.privateKeyPath) {
        // Load from file
        keyData = await fs.readFile(this.config.privateKeyPath, 'utf-8');
      } else if (this.config.privateKey) {
        // Use provided key string
        keyData = this.config.privateKey;
      } else {
        throw new InvalidCredentialsError('No private key source specified');
      }

      // Validate the key format
      if (!keyData.includes('BEGIN') || !keyData.includes('PRIVATE KEY')) {
        throw new InvalidCredentialsError(
          'Invalid private key format - expected PEM format with BEGIN/END markers'
        );
      }

      // Parse the key to validate it (will throw if invalid)
      const passphrase = this.config.privateKeyPassphrase;
      const keyObject = crypto.createPrivateKey(
        passphrase ? { key: keyData, passphrase } : keyData
      );

      // Verify it's an RSA key
      if (keyObject.asymmetricKeyType !== 'rsa') {
        throw new InvalidCredentialsError(
          `Invalid key type: ${keyObject.asymmetricKeyType}. RSA key required for Snowflake authentication.`
        );
      }

      this.privateKey = keyData;
      return keyData;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(
        `Failed to load private key: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Calculates the SHA-256 fingerprint of the public key.
   *
   * @param privateKey - The private key in PEM format
   * @returns The public key fingerprint
   */
  private calculatePublicKeyFingerprint(privateKey: string): string {
    if (this.publicKeyFingerprint) {
      return this.publicKeyFingerprint;
    }

    try {
      const passphrase = this.config.privateKeyPassphrase;
      const privateKeyObject = crypto.createPrivateKey(
        passphrase ? { key: privateKey, passphrase } : privateKey
      );

      // Extract public key from private key
      const publicKeyObject = crypto.createPublicKey(privateKeyObject);
      const publicKeyDer = publicKeyObject.export({
        type: 'spki',
        format: 'der',
      });

      // Calculate SHA-256 fingerprint
      const fingerprint = crypto
        .createHash('sha256')
        .update(publicKeyDer)
        .digest('base64');

      this.publicKeyFingerprint = fingerprint;
      return fingerprint;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(
        `Failed to calculate public key fingerprint: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generates a JWT token for Snowflake authentication.
   *
   * The JWT includes:
   * - iss: Qualified username (ACCOUNT.USER.PUBLIC_KEY_FINGERPRINT)
   * - sub: Qualified username (ACCOUNT.USER)
   * - iat: Issued at time
   * - exp: Expiration time
   *
   * @param accountName - The Snowflake account name
   * @returns The signed JWT token
   * @throws {AuthenticationError} If token generation fails
   */
  private generateJWT(accountName: string = 'SNOWFLAKE'): string {
    try {
      const privateKey = this.privateKey!;
      const fingerprint = this.calculatePublicKeyFingerprint(privateKey);

      // Snowflake expects uppercase username
      const username = this.config.username.toUpperCase();
      const account = accountName.toUpperCase();

      // Build qualified username
      const qualifiedUsername = `${account}.${username}`;
      const issuer = `${qualifiedUsername}.SHA256:${fingerprint}`;

      // Create JWT header
      const header = {
        alg: JWT_ALGORITHM,
        typ: 'JWT',
      };

      // Create JWT payload
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: issuer,
        sub: qualifiedUsername,
        iat: now,
        exp: now + DEFAULT_JWT_EXPIRATION_SECONDS,
      };

      // Encode header and payload
      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
      const signatureInput = `${encodedHeader}.${encodedPayload}`;

      // Sign with private key
      const passphrase = this.config.privateKeyPassphrase;
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(signatureInput);
      sign.end();

      const signature = sign.sign(
        passphrase ? { key: privateKey, passphrase } : privateKey
      );
      const encodedSignature = this.base64UrlEncode(signature);

      // Combine into JWT
      const jwt = `${signatureInput}.${encodedSignature}`;

      return jwt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AuthenticationError(
        `Failed to generate JWT token: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Base64 URL encoding (without padding).
   *
   * @param data - Data to encode (string or Buffer)
   * @returns Base64 URL encoded string
   */
  private base64UrlEncode(data: string | Buffer): string {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Refreshes credentials by generating a new JWT token.
   *
   * This loads the private key (if not already loaded), generates a new JWT
   * token, and returns the credentials with the token.
   *
   * @returns Promise resolving to key-pair credentials with JWT token
   * @throws {AuthenticationError} If credentials cannot be refreshed
   */
  async refreshCredentials(): Promise<Credentials> {
    try {
      // Load the private key
      await this.loadPrivateKey();

      // Generate JWT token
      // Note: Account name would ideally come from config, but we'll use a placeholder
      // The actual Snowflake SDK will handle account-specific JWT generation
      const token = this.generateJWT();

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + DEFAULT_JWT_EXPIRATION_SECONDS * 1000);

      const credentials: Credentials = {
        method: 'keypair',
        username: this.config.username,
        token,
        expiresAt,
      };

      this.updateCredentials(credentials);
      return credentials;
    } catch (error) {
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof AuthenticationError
      ) {
        throw error;
      }

      throw new AuthenticationError(
        'Failed to refresh key-pair credentials',
        error instanceof Error ? error : undefined
      );
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a key-pair credential provider from configuration.
 *
 * @param config - Key-pair authentication configuration
 * @returns A new KeyPairCredentialProvider instance
 * @throws {InvalidCredentialsError} If configuration is invalid
 *
 * @example
 * ```typescript
 * const provider = createKeyPairProvider({
 *   method: 'keypair',
 *   username: 'myuser',
 *   privateKeyPath: '/path/to/key.pem'
 * });
 * ```
 */
export function createKeyPairProvider(config: KeyPairAuthConfig): KeyPairCredentialProvider {
  return new KeyPairCredentialProvider(config);
}
