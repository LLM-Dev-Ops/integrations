/**
 * Azure Key Vault Validation Utilities
 *
 * Validation functions for Key Vault resources following Azure naming
 * and size constraints.
 */

import {
  InvalidSecretNameError,
  SecretTooLargeError,
  UnsupportedAlgorithmError,
  ConfigurationError,
} from './error.js';
import { KeyType, EncryptionAlgorithm, SignatureAlgorithm } from './types/index.js';

/**
 * Maximum secret value size in bytes (25 KB)
 */
export const SECRET_VALUE_MAX_SIZE = 25 * 1024;

/**
 * Maximum name length for secrets, keys, and certificates
 */
export const KEY_VAULT_NAME_MAX_LENGTH = 127;

/**
 * Valid name pattern for Azure Key Vault resources
 * - Only alphanumeric characters and hyphens
 * - Cannot start or end with hyphen
 */
const NAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

/**
 * Valid vault URL pattern
 * - Must use HTTPS
 * - Must end with .vault.azure.net
 * - Vault name must be alphanumeric and hyphens
 */
const VAULT_URL_PATTERN = /^https:\/\/[a-zA-Z0-9-]+\.vault\.azure\.net\/?$/;

/**
 * Validate secret name according to Azure Key Vault naming rules
 *
 * Rules:
 * - Cannot be empty
 * - Maximum 127 characters
 * - Only alphanumeric and hyphens
 * - Cannot start or end with hyphen
 *
 * @param name - Secret name to validate
 * @throws {InvalidSecretNameError} If name is invalid
 *
 * @example
 * ```typescript
 * validateSecretName('my-secret');      // OK
 * validateSecretName('my-secret-123');  // OK
 * validateSecretName('-invalid');       // Throws InvalidSecretNameError
 * validateSecretName('invalid-');       // Throws InvalidSecretNameError
 * validateSecretName('invalid_name');   // Throws InvalidSecretNameError
 * ```
 */
export function validateSecretName(name: string): void {
  // Check if empty
  if (!name || name.length === 0) {
    throw new InvalidSecretNameError({
      message: 'Secret name cannot be empty',
    });
  }

  // Check length
  if (name.length > KEY_VAULT_NAME_MAX_LENGTH) {
    throw new InvalidSecretNameError({
      message: `Secret name cannot exceed ${KEY_VAULT_NAME_MAX_LENGTH} characters (got ${name.length})`,
      resourceName: name,
    });
  }

  // Check pattern
  if (!NAME_PATTERN.test(name)) {
    throw new InvalidSecretNameError({
      message: `Secret name '${name}' is invalid. Must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen`,
      resourceName: name,
    });
  }
}

/**
 * Validate secret value size
 *
 * Azure Key Vault limits secret values to 25 KB.
 *
 * @param value - Secret value to validate
 * @throws {SecretTooLargeError} If value exceeds size limit
 *
 * @example
 * ```typescript
 * validateSecretValueSize('my-value');           // OK
 * validateSecretValueSize('x'.repeat(26000));    // Throws SecretTooLargeError
 * ```
 */
export function validateSecretValueSize(value: string): void {
  // Calculate byte size (UTF-8 encoding)
  const byteSize = new TextEncoder().encode(value).length;

  if (byteSize > SECRET_VALUE_MAX_SIZE) {
    throw new SecretTooLargeError({
      message: `Secret value size (${byteSize} bytes) exceeds maximum allowed size (${SECRET_VALUE_MAX_SIZE} bytes)`,
      size: byteSize,
      maxSize: SECRET_VALUE_MAX_SIZE,
    });
  }
}

/**
 * Validate key name according to Azure Key Vault naming rules
 *
 * Uses the same validation rules as secret names.
 *
 * @param name - Key name to validate
 * @throws {InvalidSecretNameError} If name is invalid
 *
 * @example
 * ```typescript
 * validateKeyName('my-key');       // OK
 * validateKeyName('my-key-123');   // OK
 * validateKeyName('-invalid');     // Throws InvalidSecretNameError
 * ```
 */
export function validateKeyName(name: string): void {
  try {
    validateSecretName(name);
  } catch (error) {
    if (error instanceof InvalidSecretNameError) {
      // Re-throw with updated message for key context
      throw new InvalidSecretNameError({
        message: error.message.replace('Secret', 'Key'),
        resourceName: name,
      });
    }
    throw error;
  }
}

/**
 * Validate certificate name according to Azure Key Vault naming rules
 *
 * Uses the same validation rules as secret names.
 *
 * @param name - Certificate name to validate
 * @throws {InvalidSecretNameError} If name is invalid
 *
 * @example
 * ```typescript
 * validateCertificateName('my-cert');       // OK
 * validateCertificateName('my-cert-123');   // OK
 * validateCertificateName('-invalid');      // Throws InvalidSecretNameError
 * ```
 */
export function validateCertificateName(name: string): void {
  try {
    validateSecretName(name);
  } catch (error) {
    if (error instanceof InvalidSecretNameError) {
      // Re-throw with updated message for certificate context
      throw new InvalidSecretNameError({
        message: error.message.replace('Secret', 'Certificate'),
        resourceName: name,
      });
    }
    throw error;
  }
}

/**
 * Validate vault URL
 *
 * Requirements:
 * - Must be a valid URL
 * - Must use HTTPS protocol
 * - Must end with .vault.azure.net
 * - Vault name must contain only alphanumeric characters and hyphens
 *
 * @param url - Vault URL to validate
 * @throws {ConfigurationError} If URL is invalid
 *
 * @example
 * ```typescript
 * validateVaultUrl('https://my-vault.vault.azure.net');     // OK
 * validateVaultUrl('https://my-vault.vault.azure.net/');    // OK
 * validateVaultUrl('http://my-vault.vault.azure.net');      // Throws ConfigurationError
 * validateVaultUrl('https://my-vault.other.net');           // Throws ConfigurationError
 * ```
 */
export function validateVaultUrl(url: string): void {
  // Check if empty
  if (!url || url.length === 0) {
    throw new ConfigurationError({
      message: 'Vault URL cannot be empty',
    });
  }

  // Try to parse as URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ConfigurationError({
      message: `Invalid vault URL: '${url}' is not a valid URL`,
    });
  }

  // Check protocol
  if (parsedUrl.protocol !== 'https:') {
    throw new ConfigurationError({
      message: `Vault URL must use HTTPS protocol (got ${parsedUrl.protocol})`,
    });
  }

  // Check pattern
  if (!VAULT_URL_PATTERN.test(url)) {
    throw new ConfigurationError({
      message: `Vault URL '${url}' is invalid. Must match pattern: https://<vault-name>.vault.azure.net`,
    });
  }
}

/**
 * Validate algorithm compatibility with key type
 *
 * Azure Key Vault supports different algorithms based on key type:
 * - RSA keys: RSA-OAEP, RSA-OAEP-256, RSA1_5, RS256, RS384, RS512, PS256, PS384, PS512
 * - EC keys: ES256, ES256K, ES384, ES512
 * - Symmetric keys (OCT): A128GCM, A192GCM, A256GCM, A128CBC, A192CBC, A256CBC
 *
 * @param keyType - Type of the key
 * @param algorithm - Encryption or signature algorithm
 * @throws {UnsupportedAlgorithmError} If algorithm is not compatible with key type
 *
 * @example
 * ```typescript
 * validateAlgorithmForKeyType(KeyType.RSA, EncryptionAlgorithm.RSA_OAEP);     // OK
 * validateAlgorithmForKeyType(KeyType.EC, SignatureAlgorithm.ES256);          // OK
 * validateAlgorithmForKeyType(KeyType.RSA, SignatureAlgorithm.ES256);         // Throws UnsupportedAlgorithmError
 * ```
 */
export function validateAlgorithmForKeyType(
  keyType: KeyType,
  algorithm: EncryptionAlgorithm | SignatureAlgorithm
): void {
  const algorithmStr = algorithm.toString();

  // Determine if this is an RSA key (including HSM variant)
  const isRsaKey = keyType === KeyType.Rsa || keyType === KeyType.RsaHsm;

  // Determine if this is an EC key (including HSM variant)
  const isEcKey = keyType === KeyType.Ec || keyType === KeyType.EcHsm;

  // Determine if this is a symmetric key (including HSM variant)
  const isSymmetricKey = keyType === KeyType.Oct || keyType === KeyType.OctHsm;

  // RSA algorithms (encryption and signing)
  if (
    algorithmStr.startsWith('RSA') ||  // RSA-OAEP, RSA-OAEP-256, RSA1_5
    algorithmStr.startsWith('RS') ||   // RS256, RS384, RS512
    algorithmStr.startsWith('PS')      // PS256, PS384, PS512
  ) {
    if (!isRsaKey) {
      throw new UnsupportedAlgorithmError({
        message: `Algorithm '${algorithm}' is only supported for RSA keys, but key type is ${keyType}`,
      });
    }
    return;
  }

  // EC algorithms (signing only)
  if (algorithmStr.startsWith('ES')) {  // ES256, ES256K, ES384, ES512
    if (!isEcKey) {
      throw new UnsupportedAlgorithmError({
        message: `Algorithm '${algorithm}' is only supported for EC keys, but key type is ${keyType}`,
      });
    }
    return;
  }

  // Symmetric algorithms (encryption only)
  if (
    algorithmStr.endsWith('GCM') ||  // A128GCM, A192GCM, A256GCM
    algorithmStr.endsWith('CBC')     // A128CBC, A192CBC, A256CBC
  ) {
    if (!isSymmetricKey) {
      throw new UnsupportedAlgorithmError({
        message: `Algorithm '${algorithm}' is only supported for symmetric (OCT) keys, but key type is ${keyType}`,
      });
    }
    return;
  }

  // If we get here, the algorithm is not recognized
  throw new UnsupportedAlgorithmError({
    message: `Unknown or unsupported algorithm: '${algorithm}'`,
  });
}
