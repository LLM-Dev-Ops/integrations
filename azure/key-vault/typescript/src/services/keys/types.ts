/**
 * Azure Key Vault Keys Service Types
 *
 * Type definitions for the KeysService following SPARC specification.
 */

import type {
  KeyOperation,
  CurveName,
} from '../../types/key.js';

/**
 * Options for creating a key
 */
export interface CreateKeyOptions {
  /** Key size in bits (for RSA keys: 2048, 3072, 4096) */
  keySize?: number;
  /** Curve name (for EC keys: P-256, P-384, P-521, P-256K) */
  curve?: CurveName;
  /** Allowed key operations */
  keyOps?: KeyOperation[];
  /** Enable or disable the key (default: true) */
  enabled?: boolean;
  /** Expiration date */
  expiresOn?: Date;
  /** Not valid before date */
  notBefore?: Date;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Options for getting a key
 */
export interface GetKeyOptions {
  /** Specific version to retrieve (default: latest) */
  version?: string;
}

/**
 * Azure API response shape for key bundle
 */
export interface KeyBundle {
  /** JSON Web Key */
  key?: {
    kid?: string;
    kty?: string;
    key_ops?: string[];
    n?: string;
    e?: string;
    d?: string;
    dp?: string;
    dq?: string;
    qi?: string;
    p?: string;
    q?: string;
    k?: string;
    crv?: string;
    x?: string;
    y?: string;
  };
  /** Key attributes */
  attributes?: {
    enabled?: boolean;
    created?: number;
    updated?: number;
    exp?: number;
    nbf?: number;
    recoveryLevel?: string;
    recoverableDays?: number;
  };
  /** Tags */
  tags?: Record<string, string>;
  /** Managed flag */
  managed?: boolean;
  /** Release policy */
  release_policy?: {
    contentType?: string;
    data?: string;
    immutable?: boolean;
  };
}

/**
 * Azure API response shape for key item (list results)
 */
export interface KeyItem {
  /** Key identifier */
  kid?: string;
  /** Key attributes */
  attributes?: {
    enabled?: boolean;
    created?: number;
    updated?: number;
    exp?: number;
    nbf?: number;
    recoveryLevel?: string;
    recoverableDays?: number;
  };
  /** Tags */
  tags?: Record<string, string>;
  /** Managed flag */
  managed?: boolean;
}

/**
 * Azure API response for list operations
 */
export interface KeyListResult {
  /** Array of key items */
  value?: KeyItem[];
  /** Next page link */
  nextLink?: string;
}

/**
 * Azure API response for deleted key
 */
export interface DeletedKeyBundle extends KeyBundle {
  /** Recovery ID */
  recoveryId?: string;
  /** Scheduled purge date (Unix timestamp) */
  scheduledPurgeDate?: number;
  /** Deleted date (Unix timestamp) */
  deletedDate?: number;
}

/**
 * Azure API request for create key
 */
export interface CreateKeyRequest {
  /** Key type */
  kty: string;
  /** Key size */
  key_size?: number;
  /** Curve name */
  crv?: string;
  /** Key operations */
  key_ops?: string[];
  /** Key attributes */
  attributes?: {
    enabled?: boolean;
    exp?: number;
    nbf?: number;
  };
  /** Tags */
  tags?: Record<string, string>;
}

/**
 * Azure API request for encrypt
 */
export interface EncryptRequest {
  /** Algorithm */
  alg: string;
  /** Base64url-encoded plaintext */
  value: string;
  /** Initialization vector (for AES) */
  iv?: string;
  /** Additional authenticated data (for GCM) */
  aad?: string;
}

/**
 * Azure API response for encrypt
 */
export interface EncryptResponse {
  /** Key ID */
  kid?: string;
  /** Base64url-encoded ciphertext */
  value?: string;
  /** Initialization vector */
  iv?: string;
  /** Authentication tag (for GCM) */
  tag?: string;
  /** Additional authenticated data */
  aad?: string;
}

/**
 * Azure API request for decrypt
 */
export interface DecryptRequest {
  /** Algorithm */
  alg: string;
  /** Base64url-encoded ciphertext */
  value: string;
  /** Initialization vector (for AES) */
  iv?: string;
  /** Authentication tag (for GCM) */
  tag?: string;
  /** Additional authenticated data (for GCM) */
  aad?: string;
}

/**
 * Azure API response for decrypt
 */
export interface DecryptResponse {
  /** Key ID */
  kid?: string;
  /** Base64url-encoded plaintext */
  value?: string;
}

/**
 * Azure API request for sign
 */
export interface SignRequest {
  /** Algorithm */
  alg: string;
  /** Base64url-encoded digest */
  value: string;
}

/**
 * Azure API response for sign
 */
export interface SignResponse {
  /** Key ID */
  kid?: string;
  /** Base64url-encoded signature */
  value?: string;
}

/**
 * Azure API request for verify
 */
export interface VerifyRequest {
  /** Algorithm */
  alg: string;
  /** Base64url-encoded digest */
  digest: string;
  /** Base64url-encoded signature */
  value: string;
}

/**
 * Azure API response for verify
 */
export interface VerifyResponse {
  /** Key ID */
  kid?: string;
  /** Verification result */
  value?: boolean;
}

/**
 * Azure API request for wrap key
 */
export interface WrapKeyRequest {
  /** Algorithm */
  alg: string;
  /** Base64url-encoded key to wrap */
  value: string;
}

/**
 * Azure API response for wrap key
 */
export interface WrapKeyResponse {
  /** Key ID */
  kid?: string;
  /** Base64url-encoded wrapped key */
  value?: string;
}

/**
 * Azure API request for unwrap key
 */
export interface UnwrapKeyRequest {
  /** Algorithm */
  alg: string;
  /** Base64url-encoded encrypted key */
  value: string;
}

/**
 * Azure API response for unwrap key
 */
export interface UnwrapKeyResponse {
  /** Key ID */
  kid?: string;
  /** Base64url-encoded unwrapped key */
  value?: string;
}
