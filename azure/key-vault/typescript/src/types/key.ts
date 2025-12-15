/**
 * Azure Key Vault Key Types
 *
 * Type definitions for cryptographic key operations following SPARC specification.
 */

import type { BaseProperties, DeletedObjectProperties } from './common.js';

/**
 * Supported key types
 */
export enum KeyType {
  /** Elliptic Curve */
  Ec = 'EC',
  /** Elliptic Curve with Hardware Security Module */
  EcHsm = 'EC-HSM',
  /** RSA */
  Rsa = 'RSA',
  /** RSA with Hardware Security Module */
  RsaHsm = 'RSA-HSM',
  /** Octet sequence (symmetric key) */
  Oct = 'oct',
  /** Octet sequence with Hardware Security Module */
  OctHsm = 'oct-HSM',
}

/**
 * Key operations
 */
export enum KeyOperation {
  /** Encrypt data */
  Encrypt = 'encrypt',
  /** Decrypt data */
  Decrypt = 'decrypt',
  /** Sign data */
  Sign = 'sign',
  /** Verify signature */
  Verify = 'verify',
  /** Wrap (encrypt) another key */
  WrapKey = 'wrapKey',
  /** Unwrap (decrypt) another key */
  UnwrapKey = 'unwrapKey',
  /** Import key material */
  Import = 'import',
}

/**
 * Elliptic curve names
 */
export type CurveName = 'P-256' | 'P-384' | 'P-521' | 'P-256K';

/**
 * JSON Web Key (JWK) representation
 *
 * Based on RFC 7517 (JSON Web Key)
 */
export interface JsonWebKey {
  /** Key type */
  kty: string;
  /** Key ID */
  kid?: string;
  /** Key operations */
  key_ops?: string[];
  /** RSA modulus (for RSA keys) */
  n?: Uint8Array;
  /** RSA public exponent (for RSA keys) */
  e?: Uint8Array;
  /** RSA private exponent (for RSA keys) */
  d?: Uint8Array;
  /** RSA first prime factor (for RSA keys) */
  dp?: Uint8Array;
  /** RSA second prime factor (for RSA keys) */
  dq?: Uint8Array;
  /** RSA first coefficient (for RSA keys) */
  qi?: Uint8Array;
  /** RSA first prime (for RSA keys) */
  p?: Uint8Array;
  /** RSA second prime (for RSA keys) */
  q?: Uint8Array;
  /** Symmetric key value (for oct keys) */
  k?: Uint8Array;
  /** Elliptic curve name (for EC keys) */
  crv?: string;
  /** EC x coordinate (for EC keys) */
  x?: Uint8Array;
  /** EC y coordinate (for EC keys) */
  y?: Uint8Array;
}

/**
 * Key properties
 */
export interface KeyProperties extends BaseProperties {
  /** Key type */
  keyType?: KeyType;
  /** Key size in bits */
  keySize?: number;
  /** Curve name for EC keys */
  curveName?: CurveName;
  /** Allowed key operations */
  keyOps?: KeyOperation[];
  /** Whether the key is managed by Key Vault */
  managed?: boolean;
  /** Whether the key is exportable */
  exportable?: boolean;
  /** Release policy for key release operations */
  releasePolicy?: KeyReleasePolicy;
}

/**
 * Key release policy
 */
export interface KeyReleasePolicy {
  /** Content type of the policy */
  contentType?: string;
  /** Encoded policy data */
  data?: Uint8Array;
  /** Whether the policy is immutable */
  immutable?: boolean;
}

/**
 * Key object
 */
export interface Key {
  /** Key identifier (URL) */
  id: string;
  /** Key name */
  name: string;
  /** JSON Web Key material */
  keyMaterial: JsonWebKey;
  /** Key properties */
  properties: KeyProperties;
}

/**
 * Options for creating a key
 */
export interface CreateKeyOptions {
  /** Key type */
  keyType: KeyType;
  /** Key size in bits (for RSA keys, typically 2048, 3072, or 4096) */
  keySize?: number;
  /** Curve name (for EC keys) */
  curveName?: CurveName;
  /** Allowed key operations */
  keyOps?: KeyOperation[];
  /** Enable or disable the key */
  enabled?: boolean;
  /** Expiration date */
  expiresOn?: Date;
  /** Not valid before date */
  notBefore?: Date;
  /** Custom tags */
  tags?: Record<string, string>;
  /** Whether the key is exportable */
  exportable?: boolean;
  /** Release policy */
  releasePolicy?: KeyReleasePolicy;
}

/**
 * Options for importing a key
 */
export interface ImportKeyOptions {
  /** JSON Web Key to import */
  key: JsonWebKey;
  /** Whether to import into HSM */
  hardwareProtected?: boolean;
  /** Enable or disable the key */
  enabled?: boolean;
  /** Expiration date */
  expiresOn?: Date;
  /** Not valid before date */
  notBefore?: Date;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Deleted key
 */
export interface DeletedKey {
  /** Key identifier */
  id: string;
  /** Key name */
  name: string;
  /** JSON Web Key material (if available) */
  keyMaterial?: JsonWebKey;
  /** Key properties including deletion metadata */
  properties: DeletedObjectProperties & Omit<KeyProperties, keyof BaseProperties>;
}

/**
 * Key backup blob
 *
 * Opaque blob containing encrypted backup of the key.
 */
export interface KeyBackupBlob {
  /** Backup data as byte array */
  value: Uint8Array;
}

/**
 * List keys options
 */
export interface ListKeysOptions {
  /** Maximum number of results per page */
  maxPageSize?: number;
}

/**
 * Page of key properties
 */
export interface KeysPage {
  /** Array of key properties */
  items: KeyProperties[];
  /** Continuation token for next page */
  continuationToken?: string;
}

/**
 * Get key options
 */
export interface GetKeyOptions {
  /** Specific version to retrieve */
  version?: string;
}

/**
 * Update key properties options
 */
export interface UpdateKeyPropertiesOptions {
  /** Allowed key operations */
  keyOps?: KeyOperation[];
  /** Enable or disable */
  enabled?: boolean;
  /** Expiration date */
  expiresOn?: Date;
  /** Not valid before date */
  notBefore?: Date;
  /** Custom tags */
  tags?: Record<string, string>;
  /** Release policy */
  releasePolicy?: KeyReleasePolicy;
}

/**
 * Key rotation policy
 */
export interface KeyRotationPolicy {
  /** Rotation policy ID */
  id?: string;
  /** Lifetime actions */
  lifetimeActions?: KeyRotationLifetimeAction[];
  /** Expiry time (ISO 8601 duration) */
  expiryTime?: string;
}

/**
 * Key rotation lifetime action
 */
export interface KeyRotationLifetimeAction {
  /** Action to perform */
  action: 'Rotate' | 'Notify';
  /** Trigger (time before expiry or time after creation) */
  trigger: {
    /** Time before expiry (ISO 8601 duration) */
    timeBeforeExpiry?: string;
    /** Time after creation (ISO 8601 duration) */
    timeAfterCreate?: string;
  };
}
