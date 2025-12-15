/**
 * Azure Key Vault Cryptographic Types
 *
 * Type definitions for cryptographic operations (encrypt, decrypt, sign, verify, wrap, unwrap).
 */

/**
 * Encryption algorithms
 */
export enum EncryptionAlgorithm {
  /** RSA-OAEP with SHA-1 */
  RsaOaep = 'RSA-OAEP',
  /** RSA-OAEP with SHA-256 */
  RsaOaep256 = 'RSA-OAEP-256',
  /** RSA 1.5 (legacy) */
  Rsa15 = 'RSA1_5',
  /** AES-GCM 128-bit */
  A128Gcm = 'A128GCM',
  /** AES-GCM 192-bit */
  A192Gcm = 'A192GCM',
  /** AES-GCM 256-bit */
  A256Gcm = 'A256GCM',
  /** AES-CBC 128-bit */
  A128Cbc = 'A128CBC',
  /** AES-CBC 192-bit */
  A192Cbc = 'A192CBC',
  /** AES-CBC 256-bit */
  A256Cbc = 'A256CBC',
  /** AES-CBC 128-bit with PKCS7 padding */
  A128CbcPad = 'A128CBCPAD',
  /** AES-CBC 192-bit with PKCS7 padding */
  A192CbcPad = 'A192CBCPAD',
  /** AES-CBC 256-bit with PKCS7 padding */
  A256CbcPad = 'A256CBCPAD',
}

/**
 * Signature algorithms
 */
export enum SignatureAlgorithm {
  /** RSASSA-PKCS1-v1_5 with SHA-256 */
  Rs256 = 'RS256',
  /** RSASSA-PKCS1-v1_5 with SHA-384 */
  Rs384 = 'RS384',
  /** RSASSA-PKCS1-v1_5 with SHA-512 */
  Rs512 = 'RS512',
  /** RSASSA-PSS with SHA-256 */
  Ps256 = 'PS256',
  /** RSASSA-PSS with SHA-384 */
  Ps384 = 'PS384',
  /** RSASSA-PSS with SHA-512 */
  Ps512 = 'PS512',
  /** ECDSA with P-256 and SHA-256 */
  Es256 = 'ES256',
  /** ECDSA with P-384 and SHA-384 */
  Es384 = 'ES384',
  /** ECDSA with P-521 and SHA-512 */
  Es512 = 'ES512',
  /** ECDSA with secp256k1 and SHA-256 */
  Es256K = 'ES256K',
}

/**
 * Key wrap algorithms
 */
export enum KeyWrapAlgorithm {
  /** RSA-OAEP with SHA-1 */
  RsaOaep = 'RSA-OAEP',
  /** RSA-OAEP with SHA-256 */
  RsaOaep256 = 'RSA-OAEP-256',
  /** RSA 1.5 (legacy) */
  Rsa15 = 'RSA1_5',
  /** AES Key Wrap 128-bit */
  A128Kw = 'A128KW',
  /** AES Key Wrap 192-bit */
  A192Kw = 'A192KW',
  /** AES Key Wrap 256-bit */
  A256Kw = 'A256KW',
}

/**
 * Encrypt operation options
 */
export interface EncryptOptions {
  /** Encryption algorithm */
  algorithm: EncryptionAlgorithm;
  /** Plaintext to encrypt */
  plaintext: Uint8Array;
  /** Initialization vector (for AES algorithms) */
  iv?: Uint8Array;
  /** Additional authenticated data (for GCM algorithms) */
  additionalAuthenticatedData?: Uint8Array;
}

/**
 * Encrypt operation result
 */
export interface EncryptResult {
  /** Key identifier used for encryption */
  keyId: string;
  /** Encryption algorithm used */
  algorithm: EncryptionAlgorithm;
  /** Encrypted ciphertext */
  ciphertext: Uint8Array;
  /** Authentication tag (for GCM algorithms) */
  authenticationTag?: Uint8Array;
  /** Initialization vector (for AES algorithms) */
  iv?: Uint8Array;
  /** Additional authenticated data (for GCM algorithms) */
  additionalAuthenticatedData?: Uint8Array;
}

/**
 * Decrypt operation options
 */
export interface DecryptOptions {
  /** Decryption algorithm */
  algorithm: EncryptionAlgorithm;
  /** Ciphertext to decrypt */
  ciphertext: Uint8Array;
  /** Initialization vector (for AES algorithms) */
  iv?: Uint8Array;
  /** Authentication tag (for GCM algorithms) */
  authenticationTag?: Uint8Array;
  /** Additional authenticated data (for GCM algorithms) */
  additionalAuthenticatedData?: Uint8Array;
}

/**
 * Decrypt operation result
 */
export interface DecryptResult {
  /** Key identifier used for decryption */
  keyId: string;
  /** Decryption algorithm used */
  algorithm: EncryptionAlgorithm;
  /** Decrypted plaintext */
  plaintext: Uint8Array;
}

/**
 * Sign operation options
 */
export interface SignOptions {
  /** Signature algorithm */
  algorithm: SignatureAlgorithm;
  /** Digest to sign (pre-hashed data) */
  digest: Uint8Array;
}

/**
 * Sign operation result
 */
export interface SignResult {
  /** Key identifier used for signing */
  keyId: string;
  /** Signature algorithm used */
  algorithm: SignatureAlgorithm;
  /** Signature bytes */
  signature: Uint8Array;
}

/**
 * Verify operation options
 */
export interface VerifyOptions {
  /** Signature algorithm */
  algorithm: SignatureAlgorithm;
  /** Digest that was signed (pre-hashed data) */
  digest: Uint8Array;
  /** Signature to verify */
  signature: Uint8Array;
}

/**
 * Verify operation result
 */
export interface VerifyResult {
  /** Key identifier used for verification */
  keyId: string;
  /** Signature algorithm used */
  algorithm: SignatureAlgorithm;
  /** Whether the signature is valid */
  isValid: boolean;
}

/**
 * Wrap key operation options
 */
export interface WrapKeyOptions {
  /** Key wrap algorithm */
  algorithm: KeyWrapAlgorithm;
  /** Key material to wrap */
  key: Uint8Array;
}

/**
 * Wrap key operation result
 */
export interface WrapResult {
  /** Key identifier used for wrapping */
  keyId: string;
  /** Key wrap algorithm used */
  algorithm: KeyWrapAlgorithm;
  /** Wrapped (encrypted) key */
  encryptedKey: Uint8Array;
}

/**
 * Unwrap key operation options
 */
export interface UnwrapKeyOptions {
  /** Key wrap algorithm */
  algorithm: KeyWrapAlgorithm;
  /** Encrypted key to unwrap */
  encryptedKey: Uint8Array;
}

/**
 * Unwrap key operation result
 */
export interface UnwrapResult {
  /** Key identifier used for unwrapping */
  keyId: string;
  /** Key wrap algorithm used */
  algorithm: KeyWrapAlgorithm;
  /** Unwrapped (decrypted) key */
  key: Uint8Array;
}

/**
 * Hashing utilities for pre-hashing data before signing
 */
export interface DigestInfo {
  /** Hash algorithm name */
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  /** Digest bytes */
  digest: Uint8Array;
}

/**
 * Random bytes generation options
 */
export interface GenerateRandomBytesOptions {
  /** Number of random bytes to generate (1-128) */
  count: number;
}

/**
 * Random bytes result
 */
export interface RandomBytesResult {
  /** Random bytes */
  value: Uint8Array;
}
