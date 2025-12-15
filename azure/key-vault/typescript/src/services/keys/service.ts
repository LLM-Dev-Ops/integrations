/**
 * Azure Key Vault Keys Service
 *
 * Service implementation for key management and cryptographic operations.
 */

import type { HttpTransport } from '../../transport/http.js';
import { CacheManager } from '../../cache/manager.js';
import type {
  Key,
  KeyProperties,
  DeletedKey,
  KeyOperation,
  CurveName,
  JsonWebKey,
} from '../../types/key.js';
import { KeyType } from '../../types/key.js';
import type {
  EncryptionAlgorithm,
  SignatureAlgorithm,
  KeyWrapAlgorithm,
  EncryptResult,
  DecryptResult,
  SignResult,
  VerifyResult,
  WrapResult,
  UnwrapResult,
} from '../../types/crypto.js';
import type { RecoveryLevel } from '../../types/common.js';
import type {
  CreateKeyOptions,
  GetKeyOptions,
  KeyBundle,
  KeyItem,
  KeyListResult,
  DeletedKeyBundle,
  CreateKeyRequest,
  EncryptRequest,
  EncryptResponse,
  DecryptRequest,
  DecryptResponse,
  SignRequest,
  SignResponse,
  VerifyRequest,
  VerifyResponse,
  WrapKeyRequest,
  WrapKeyResponse,
  UnwrapKeyRequest,
  UnwrapKeyResponse,
} from './types.js';
import {
  KeyNotFoundError,
  DecryptionFailedError,
  createErrorFromResponse,
} from '../../error.js';
import { validateKeyName } from '../../validation.js';

/**
 * Keys service interface
 */
export interface KeysService {
  /**
   * Create a new key
   *
   * @param name - Key name
   * @param keyType - Key type (RSA, EC, etc.)
   * @param options - Key creation options
   * @returns Created key
   */
  createKey(name: string, keyType: KeyType, options?: CreateKeyOptions): Promise<Key>;

  /**
   * Get key (latest or specific version)
   *
   * @param name - Key name
   * @param options - Get options
   * @returns Key
   */
  getKey(name: string, options?: GetKeyOptions): Promise<Key>;

  /**
   * List all keys (metadata only)
   *
   * @returns Array of key properties
   */
  listKeys(): Promise<KeyProperties[]>;

  /**
   * List all versions of a key
   *
   * @param name - Key name
   * @returns Array of key properties for each version
   */
  listKeyVersions(name: string): Promise<KeyProperties[]>;

  /**
   * Delete key (soft delete)
   *
   * @param name - Key name
   * @returns Deleted key
   */
  deleteKey(name: string): Promise<DeletedKey>;

  /**
   * Rotate key (create new version)
   *
   * @param name - Key name
   * @returns New key version
   */
  rotateKey(name: string): Promise<Key>;

  /**
   * Encrypt data with key
   *
   * @param name - Key name
   * @param algorithm - Encryption algorithm
   * @param plaintext - Plaintext to encrypt
   * @param version - Key version (default: latest)
   * @returns Encryption result
   */
  encrypt(
    name: string,
    algorithm: EncryptionAlgorithm,
    plaintext: Uint8Array,
    version?: string
  ): Promise<EncryptResult>;

  /**
   * Decrypt data with key
   *
   * @param name - Key name
   * @param algorithm - Decryption algorithm
   * @param ciphertext - Ciphertext to decrypt
   * @param version - Key version (default: latest)
   * @returns Decryption result
   */
  decrypt(
    name: string,
    algorithm: EncryptionAlgorithm,
    ciphertext: Uint8Array,
    version?: string
  ): Promise<DecryptResult>;

  /**
   * Sign data with key
   *
   * @param name - Key name
   * @param algorithm - Signature algorithm
   * @param digest - Pre-hashed digest to sign
   * @param version - Key version (default: latest)
   * @returns Signature result
   */
  sign(
    name: string,
    algorithm: SignatureAlgorithm,
    digest: Uint8Array,
    version?: string
  ): Promise<SignResult>;

  /**
   * Verify signature
   *
   * @param name - Key name
   * @param algorithm - Signature algorithm
   * @param digest - Pre-hashed digest
   * @param signature - Signature to verify
   * @param version - Key version (default: latest)
   * @returns Verification result
   */
  verify(
    name: string,
    algorithm: SignatureAlgorithm,
    digest: Uint8Array,
    signature: Uint8Array,
    version?: string
  ): Promise<VerifyResult>;

  /**
   * Wrap (encrypt) a key
   *
   * @param name - Key name
   * @param algorithm - Key wrap algorithm
   * @param keyToWrap - Key material to wrap
   * @param version - Key version (default: latest)
   * @returns Wrap result
   */
  wrapKey(
    name: string,
    algorithm: KeyWrapAlgorithm,
    keyToWrap: Uint8Array,
    version?: string
  ): Promise<WrapResult>;

  /**
   * Unwrap (decrypt) a key
   *
   * @param name - Key name
   * @param algorithm - Key wrap algorithm
   * @param encryptedKey - Encrypted key to unwrap
   * @param version - Key version (default: latest)
   * @returns Unwrap result
   */
  unwrapKey(
    name: string,
    algorithm: KeyWrapAlgorithm,
    encryptedKey: Uint8Array,
    version?: string
  ): Promise<UnwrapResult>;
}

/**
 * Keys service implementation
 */
export class KeysServiceImpl implements KeysService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly cache: CacheManager,
    private readonly vaultUrl: string
  ) {}

  async createKey(name: string, keyType: KeyType, options?: CreateKeyOptions): Promise<Key> {
    validateKeyName(name);

    const request: CreateKeyRequest = {
      kty: keyType,
    };

    if (options?.keySize) {
      request.key_size = options.keySize;
    }

    if (options?.curve) {
      request.crv = options.curve;
    }

    if (options?.keyOps) {
      request.key_ops = options.keyOps.map((op) => op.toString());
    }

    if (options?.enabled !== undefined || options?.expiresOn || options?.notBefore) {
      request.attributes = {};
      if (options.enabled !== undefined) {
        request.attributes.enabled = options.enabled;
      }
      if (options.expiresOn) {
        request.attributes.exp = Math.floor(options.expiresOn.getTime() / 1000);
      }
      if (options.notBefore) {
        request.attributes.nbf = Math.floor(options.notBefore.getTime() / 1000);
      }
    }

    if (options?.tags) {
      request.tags = options.tags;
    }

    const response = await this.transport.post(`/keys/${name}/create`, request);

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const bundle = response.body as KeyBundle;
    const key = parseKeyBundle(bundle, this.vaultUrl);

    // Cache the key
    const cacheKey = CacheManager.buildKey('key', name, key.properties.version);
    this.cache.set(cacheKey, key);

    // Invalidate list cache
    this.cache.invalidatePattern('key-list:*');

    return key;
  }

  async getKey(name: string, options?: GetKeyOptions): Promise<Key> {
    validateKeyName(name);

    const version = options?.version ?? '';
    const cacheKey = CacheManager.buildKey('key', name, version || 'latest');

    // Check cache first
    const cached = this.cache.get<Key>(cacheKey);
    if (cached) {
      return cached;
    }

    const path = version ? `/keys/${name}/${version}` : `/keys/${name}`;
    const response = await this.transport.get(path);

    if (response.status === 404) {
      this.cache.setNegative(cacheKey);
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const bundle = response.body as KeyBundle;
    const key = parseKeyBundle(bundle, this.vaultUrl);

    // Cache the key
    this.cache.set(cacheKey, key);

    return key;
  }

  async listKeys(): Promise<KeyProperties[]> {
    const cacheKey = 'key-list:all';

    // Check cache first
    const cached = this.cache.get<KeyProperties[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const allKeys: KeyProperties[] = [];
    let nextLink: string | undefined = '/keys';

    while (nextLink) {
      const response = await this.transport.get(nextLink);

      if (response.status !== 200) {
        throw createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.vaultUrl
        );
      }

      const result = response.body as KeyListResult;
      if (result.value) {
        for (const item of result.value) {
          allKeys.push(parseKeyItem(item, this.vaultUrl));
        }
      }

      nextLink = result.nextLink;
    }

    // Cache the list
    this.cache.set(cacheKey, allKeys);

    return allKeys;
  }

  async listKeyVersions(name: string): Promise<KeyProperties[]> {
    validateKeyName(name);

    const cacheKey = `key-list:versions:${name}`;

    // Check cache first
    const cached = this.cache.get<KeyProperties[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const allVersions: KeyProperties[] = [];
    let nextLink: string | undefined = `/keys/${name}/versions`;

    while (nextLink) {
      const response = await this.transport.get(nextLink);

      if (response.status === 404) {
        throw new KeyNotFoundError({
          message: `Key '${name}' not found`,
          statusCode: 404,
          vault: this.vaultUrl,
          resourceName: name,
        });
      }

      if (response.status !== 200) {
        throw createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.vaultUrl,
          name
        );
      }

      const result = response.body as KeyListResult;
      if (result.value) {
        for (const item of result.value) {
          allVersions.push(parseKeyItem(item, this.vaultUrl));
        }
      }

      nextLink = result.nextLink;
    }

    // Cache the list
    this.cache.set(cacheKey, allVersions);

    return allVersions;
  }

  async deleteKey(name: string): Promise<DeletedKey> {
    validateKeyName(name);

    const response = await this.transport.delete(`/keys/${name}`);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const bundle = response.body as DeletedKeyBundle;
    const deletedKey = parseDeletedKeyBundle(bundle, this.vaultUrl);

    // Invalidate cache
    this.cache.invalidatePattern(`key:${name}:*`);
    this.cache.invalidatePattern('key-list:*');

    return deletedKey;
  }

  async rotateKey(name: string): Promise<Key> {
    validateKeyName(name);

    const response = await this.transport.post(`/keys/${name}/rotate`, {});

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const bundle = response.body as KeyBundle;
    const key = parseKeyBundle(bundle, this.vaultUrl);

    // Cache the new version
    const cacheKey = CacheManager.buildKey('key', name, key.properties.version);
    this.cache.set(cacheKey, key);

    // Invalidate latest cache
    this.cache.invalidate(CacheManager.buildKey('key', name, 'latest'));
    this.cache.invalidatePattern('key-list:*');

    return key;
  }

  async encrypt(
    name: string,
    algorithm: EncryptionAlgorithm,
    plaintext: Uint8Array,
    version?: string
  ): Promise<EncryptResult> {
    validateKeyName(name);

    const request: EncryptRequest = {
      alg: algorithm,
      value: base64UrlEncode(plaintext),
    };

    const path = version ? `/keys/${name}/${version}/encrypt` : `/keys/${name}/encrypt`;
    const response = await this.transport.post(path, request);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const result = response.body as EncryptResponse;

    return {
      keyId: result.kid ?? '',
      algorithm,
      ciphertext: base64UrlDecode(result.value ?? ''),
      authenticationTag: result.tag ? base64UrlDecode(result.tag) : undefined,
      iv: result.iv ? base64UrlDecode(result.iv) : undefined,
      additionalAuthenticatedData: result.aad ? base64UrlDecode(result.aad) : undefined,
    };
  }

  async decrypt(
    name: string,
    algorithm: EncryptionAlgorithm,
    ciphertext: Uint8Array,
    version?: string
  ): Promise<DecryptResult> {
    validateKeyName(name);

    const request: DecryptRequest = {
      alg: algorithm,
      value: base64UrlEncode(ciphertext),
    };

    const path = version ? `/keys/${name}/${version}/decrypt` : `/keys/${name}/decrypt`;
    const response = await this.transport.post(path, request);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const result = response.body as DecryptResponse;

    if (!result.value) {
      throw new DecryptionFailedError({
        message: 'Decryption failed: no plaintext returned',
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    return {
      keyId: result.kid ?? '',
      algorithm,
      plaintext: base64UrlDecode(result.value),
    };
  }

  async sign(
    name: string,
    algorithm: SignatureAlgorithm,
    digest: Uint8Array,
    version?: string
  ): Promise<SignResult> {
    validateKeyName(name);

    const request: SignRequest = {
      alg: algorithm,
      value: base64UrlEncode(digest),
    };

    const path = version ? `/keys/${name}/${version}/sign` : `/keys/${name}/sign`;
    const response = await this.transport.post(path, request);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const result = response.body as SignResponse;

    return {
      keyId: result.kid ?? '',
      algorithm,
      signature: base64UrlDecode(result.value ?? ''),
    };
  }

  async verify(
    name: string,
    algorithm: SignatureAlgorithm,
    digest: Uint8Array,
    signature: Uint8Array,
    version?: string
  ): Promise<VerifyResult> {
    validateKeyName(name);

    const request: VerifyRequest = {
      alg: algorithm,
      digest: base64UrlEncode(digest),
      value: base64UrlEncode(signature),
    };

    const path = version ? `/keys/${name}/${version}/verify` : `/keys/${name}/verify`;
    const response = await this.transport.post(path, request);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const result = response.body as VerifyResponse;

    return {
      keyId: result.kid ?? '',
      algorithm,
      isValid: result.value ?? false,
    };
  }

  async wrapKey(
    name: string,
    algorithm: KeyWrapAlgorithm,
    keyToWrap: Uint8Array,
    version?: string
  ): Promise<WrapResult> {
    validateKeyName(name);

    const request: WrapKeyRequest = {
      alg: algorithm,
      value: base64UrlEncode(keyToWrap),
    };

    const path = version ? `/keys/${name}/${version}/wrapkey` : `/keys/${name}/wrapkey`;
    const response = await this.transport.post(path, request);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const result = response.body as WrapKeyResponse;

    return {
      keyId: result.kid ?? '',
      algorithm,
      encryptedKey: base64UrlDecode(result.value ?? ''),
    };
  }

  async unwrapKey(
    name: string,
    algorithm: KeyWrapAlgorithm,
    encryptedKey: Uint8Array,
    version?: string
  ): Promise<UnwrapResult> {
    validateKeyName(name);

    const request: UnwrapKeyRequest = {
      alg: algorithm,
      value: base64UrlEncode(encryptedKey),
    };

    const path = version ? `/keys/${name}/${version}/unwrapkey` : `/keys/${name}/unwrapkey`;
    const response = await this.transport.post(path, request);

    if (response.status === 404) {
      throw new KeyNotFoundError({
        message: `Key '${name}' not found`,
        statusCode: 404,
        vault: this.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.vaultUrl,
        name
      );
    }

    const result = response.body as UnwrapKeyResponse;

    return {
      keyId: result.kid ?? '',
      algorithm,
      key: base64UrlDecode(result.value ?? ''),
    };
  }
}

/**
 * Parse key bundle from Azure API response
 */
function parseKeyBundle(bundle: KeyBundle, vaultUrl: string): Key {
  const kid = bundle.key?.kid ?? '';
  const parts = kid.split('/');
  const name = parts[parts.length - 2] ?? '';
  const version = parts[parts.length - 1] ?? '';

  const keyMaterial: JsonWebKey = {
    kty: bundle.key?.kty ?? '',
    kid: bundle.key?.kid,
    key_ops: bundle.key?.key_ops,
    n: bundle.key?.n ? base64UrlDecode(bundle.key.n) : undefined,
    e: bundle.key?.e ? base64UrlDecode(bundle.key.e) : undefined,
    d: bundle.key?.d ? base64UrlDecode(bundle.key.d) : undefined,
    dp: bundle.key?.dp ? base64UrlDecode(bundle.key.dp) : undefined,
    dq: bundle.key?.dq ? base64UrlDecode(bundle.key.dq) : undefined,
    qi: bundle.key?.qi ? base64UrlDecode(bundle.key.qi) : undefined,
    p: bundle.key?.p ? base64UrlDecode(bundle.key.p) : undefined,
    q: bundle.key?.q ? base64UrlDecode(bundle.key.q) : undefined,
    k: bundle.key?.k ? base64UrlDecode(bundle.key.k) : undefined,
    crv: bundle.key?.crv,
    x: bundle.key?.x ? base64UrlDecode(bundle.key.x) : undefined,
    y: bundle.key?.y ? base64UrlDecode(bundle.key.y) : undefined,
  };

  const properties: KeyProperties = {
    id: kid,
    name,
    vaultUrl,
    version,
    enabled: bundle.attributes?.enabled ?? true,
    createdOn: bundle.attributes?.created
      ? new Date(bundle.attributes.created * 1000)
      : undefined,
    updatedOn: bundle.attributes?.updated
      ? new Date(bundle.attributes.updated * 1000)
      : undefined,
    expiresOn: bundle.attributes?.exp ? new Date(bundle.attributes.exp * 1000) : undefined,
    notBefore: bundle.attributes?.nbf ? new Date(bundle.attributes.nbf * 1000) : undefined,
    recoveryLevel: bundle.attributes?.recoveryLevel as RecoveryLevel | undefined,
    recoverableDays: bundle.attributes?.recoverableDays,
    tags: bundle.tags,
    keyType: parseKeyType(bundle.key?.kty),
    curveName: bundle.key?.crv as CurveName | undefined,
    keyOps: bundle.key?.key_ops?.map((op) => op as KeyOperation),
    managed: bundle.managed,
  };

  return {
    id: kid,
    name,
    keyMaterial,
    properties,
  };
}

/**
 * Parse key item from list response
 */
function parseKeyItem(item: KeyItem, vaultUrl: string): KeyProperties {
  const kid = item.kid ?? '';
  const parts = kid.split('/');
  const name = parts[parts.length - 2] ?? '';
  const version = parts[parts.length - 1] ?? '';

  return {
    id: kid,
    name,
    vaultUrl,
    version,
    enabled: item.attributes?.enabled ?? true,
    createdOn: item.attributes?.created ? new Date(item.attributes.created * 1000) : undefined,
    updatedOn: item.attributes?.updated ? new Date(item.attributes.updated * 1000) : undefined,
    expiresOn: item.attributes?.exp ? new Date(item.attributes.exp * 1000) : undefined,
    notBefore: item.attributes?.nbf ? new Date(item.attributes.nbf * 1000) : undefined,
    recoveryLevel: item.attributes?.recoveryLevel as RecoveryLevel | undefined,
    recoverableDays: item.attributes?.recoverableDays,
    tags: item.tags,
    managed: item.managed,
  };
}

/**
 * Parse deleted key bundle
 */
function parseDeletedKeyBundle(bundle: DeletedKeyBundle, vaultUrl: string): DeletedKey {
  const baseKey = parseKeyBundle(bundle, vaultUrl);

  return {
    id: baseKey.id,
    name: baseKey.name,
    keyMaterial: baseKey.keyMaterial,
    properties: {
      ...baseKey.properties,
      deletedOn: bundle.deletedDate ? new Date(bundle.deletedDate * 1000) : undefined,
      scheduledPurgeDate: bundle.scheduledPurgeDate
        ? new Date(bundle.scheduledPurgeDate * 1000)
        : undefined,
      recoveryId: bundle.recoveryId,
    },
  };
}

/**
 * Parse key type from string
 */
function parseKeyType(kty?: string): KeyType | undefined {
  if (!kty) return undefined;

  const typeMap: Record<string, KeyType> = {
    EC: KeyType.Ec,
    'EC-HSM': KeyType.EcHsm,
    RSA: KeyType.Rsa,
    'RSA-HSM': KeyType.RsaHsm,
    oct: KeyType.Oct,
    'oct-HSM': KeyType.OctHsm,
  };

  return typeMap[kty];
}

/**
 * Base64url encode
 */
function base64UrlEncode(data: Uint8Array): string {
  // Convert Uint8Array to base64
  const base64 = btoa(String.fromCharCode(...data));

  // Convert base64 to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64url decode
 */
function base64UrlDecode(encoded: string): Uint8Array {
  // Convert base64url to base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(padding);

  // Decode base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
