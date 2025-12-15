/**
 * Azure Key Vault Mock Client
 *
 * Mock implementation for testing Key Vault operations without live Azure services.
 * Implements the same interfaces as the real Key Vault client.
 */

import { randomUUID } from 'node:crypto';
import type {
  Secret,
  SecretProperties,
  SetSecretOptions,
  GetSecretOptions,
  UpdateSecretPropertiesOptions,
  DeletedSecret,
  ListSecretsOptions,
} from '../types/secret.js';
import type {
  Key,
  KeyProperties,
  CreateKeyOptions,
  ImportKeyOptions,
  GetKeyOptions,
  UpdateKeyPropertiesOptions,
  DeletedKey,
  ListKeysOptions,
  JsonWebKey,
} from '../types/key.js';
import type {
  Certificate,
  CertificateProperties,
  CreateCertificateOptions,
  ImportCertificateOptions,
  GetCertificateOptions,
  UpdateCertificatePropertiesOptions,
  DeletedCertificate,
  ListCertificatesOptions,
} from '../types/certificate.js';
import { SecretString } from '../types/secret.js';
import type { AccessLogEntry, AccessResult } from './types.js';
import {
  SecretNotFoundError,
  KeyNotFoundError,
  CertificateNotFoundError,
  AccessDeniedError,
  VersionNotFoundError,
} from '../error.js';

/**
 * Secret storage with versions
 */
interface SecretVersion {
  secret: Secret;
  version: string;
  enabled: boolean;
}

/**
 * Key storage with versions
 */
interface KeyVersion {
  key: Key;
  version: string;
  enabled: boolean;
}

/**
 * Certificate storage with versions
 */
interface CertificateVersion {
  certificate: Certificate;
  version: string;
  enabled: boolean;
}

/**
 * Mock Key Vault Client for testing
 *
 * Simulates Key Vault behavior including:
 * - Secret, key, and certificate storage with versioning
 * - Access control (denied resources)
 * - Access logging
 * - Error simulation
 *
 * @example
 * ```typescript
 * const client = new MockKeyVaultClient('https://test-vault.vault.azure.net');
 *
 * // Register test data
 * client.registerSecret('db-password', 'secret123', 'v1');
 *
 * // Use like real client
 * const secret = await client.secrets().get('db-password');
 *
 * // Check access log
 * const log = client.getAccessLog();
 * ```
 */
export class MockKeyVaultClient {
  private vaultUrl: string;
  private secretsStorage: Map<string, SecretVersion[]> = new Map();
  private keysStorage: Map<string, KeyVersion[]> = new Map();
  private certificatesStorage: Map<string, CertificateVersion[]> = new Map();
  private accessLog: AccessLogEntry[] = [];
  private deniedResources: Set<string> = new Set();

  /**
   * Create a new mock Key Vault client
   *
   * @param vaultUrl - Vault URL (e.g., 'https://my-vault.vault.azure.net')
   */
  constructor(vaultUrl: string = 'https://mock-vault.vault.azure.net') {
    this.vaultUrl = vaultUrl;
  }

  /**
   * Register a secret for testing
   *
   * @param name - Secret name
   * @param value - Secret value
   * @param version - Version identifier (optional, auto-generated if not provided)
   * @param options - Additional secret options
   */
  registerSecret(
    name: string,
    value: string,
    version?: string,
    options?: SetSecretOptions
  ): void {
    const ver = version ?? randomUUID().replace(/-/g, '');
    const now = new Date();

    const secret: Secret = {
      id: `${this.vaultUrl}/secrets/${name}/${ver}`,
      name,
      value: new SecretString(value),
      properties: {
        id: `${this.vaultUrl}/secrets/${name}/${ver}`,
        name,
        vaultUrl: this.vaultUrl,
        version: ver,
        enabled: options?.enabled ?? true,
        createdOn: now,
        updatedOn: now,
        contentType: options?.contentType,
        expiresOn: options?.expiresOn,
        notBefore: options?.notBefore,
        tags: options?.tags,
      },
    };

    const versions = this.secretsStorage.get(name) ?? [];
    versions.push({
      secret,
      version: ver,
      enabled: options?.enabled ?? true,
    });
    this.secretsStorage.set(name, versions);
  }

  /**
   * Register a key for testing
   *
   * @param name - Key name
   * @param keyMaterial - JSON Web Key material
   * @param version - Version identifier (optional, auto-generated if not provided)
   * @param options - Additional key options
   */
  registerKey(
    name: string,
    keyMaterial: JsonWebKey,
    version?: string,
    options?: CreateKeyOptions
  ): void {
    const ver = version ?? randomUUID().replace(/-/g, '');
    const now = new Date();

    const key: Key = {
      id: `${this.vaultUrl}/keys/${name}/${ver}`,
      name,
      keyMaterial,
      properties: {
        id: `${this.vaultUrl}/keys/${name}/${ver}`,
        name,
        vaultUrl: this.vaultUrl,
        version: ver,
        enabled: options?.enabled ?? true,
        createdOn: now,
        updatedOn: now,
        keyType: options?.keyType,
        keySize: options?.keySize,
        curveName: options?.curveName,
        keyOps: options?.keyOps,
        expiresOn: options?.expiresOn,
        notBefore: options?.notBefore,
        tags: options?.tags,
        exportable: options?.exportable,
        releasePolicy: options?.releasePolicy,
      },
    };

    const versions = this.keysStorage.get(name) ?? [];
    versions.push({
      key,
      version: ver,
      enabled: options?.enabled ?? true,
    });
    this.keysStorage.set(name, versions);
  }

  /**
   * Register a certificate for testing
   *
   * @param name - Certificate name
   * @param cer - CER-encoded certificate
   * @param version - Version identifier (optional, auto-generated if not provided)
   * @param options - Additional certificate options
   */
  registerCertificate(
    name: string,
    cer: Uint8Array,
    version?: string,
    options?: ImportCertificateOptions
  ): void {
    const ver = version ?? randomUUID().replace(/-/g, '');
    const now = new Date();

    const certificate: Certificate = {
      id: `${this.vaultUrl}/certificates/${name}/${ver}`,
      name,
      cer,
      properties: {
        id: `${this.vaultUrl}/certificates/${name}/${ver}`,
        name,
        vaultUrl: this.vaultUrl,
        version: ver,
        enabled: options?.enabled ?? true,
        createdOn: now,
        updatedOn: now,
        tags: options?.tags,
      },
      policy: options?.policy,
    };

    const versions = this.certificatesStorage.get(name) ?? [];
    versions.push({
      certificate,
      version: ver,
      enabled: options?.enabled ?? true,
    });
    this.certificatesStorage.set(name, versions);
  }

  /**
   * Deny access to a resource
   *
   * @param name - Resource name
   */
  denyAccess(name: string): void {
    this.deniedResources.add(name);
  }

  /**
   * Allow access to a resource
   *
   * @param name - Resource name
   */
  allowAccess(name: string): void {
    this.deniedResources.delete(name);
  }

  /**
   * Get the secrets service interface
   */
  secrets(): SecretsService {
    return new MockSecretsService(this);
  }

  /**
   * Get the keys service interface
   */
  keys(): KeysService {
    return new MockKeysService(this);
  }

  /**
   * Get the certificates service interface
   */
  certificates(): CertificatesService {
    return new MockCertificatesService(this);
  }

  /**
   * Get access log
   */
  getAccessLog(): AccessLogEntry[] {
    return [...this.accessLog];
  }

  /**
   * Clear access log
   */
  clearAccessLog(): void {
    this.accessLog = [];
  }

  /**
   * Log an access operation
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private logAccess(
    operation: string,
    objectName: string,
    objectType: 'secret' | 'key' | 'certificate',
    version: string | undefined,
    result: AccessResult,
    error?: string,
    durationMs?: number
  ): void {
    this.accessLog.push({
      timestamp: new Date(),
      operation,
      objectName,
      objectType,
      version,
      result,
      error,
      durationMs,
    });
  }

  /**
   * Check if access is denied
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private isAccessDenied(name: string): boolean {
    return this.deniedResources.has(name);
  }

  /**
   * Get latest version of a secret
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private getLatestSecret(name: string): SecretVersion | undefined {
    const versions = this.secretsStorage.get(name);
    return versions?.[versions.length - 1];
  }

  /**
   * Get specific version of a secret
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private getSecretVersion(name: string, version: string): SecretVersion | undefined {
    const versions = this.secretsStorage.get(name);
    return versions?.find((v) => v.version === version);
  }

  /**
   * Get latest version of a key
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private getLatestKey(name: string): KeyVersion | undefined {
    const versions = this.keysStorage.get(name);
    return versions?.[versions.length - 1];
  }

  /**
   * Get specific version of a key
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private getKeyVersion(name: string, version: string): KeyVersion | undefined {
    const versions = this.keysStorage.get(name);
    return versions?.find((v) => v.version === version);
  }

  /**
   * Get latest version of a certificate
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private getLatestCertificate(name: string): CertificateVersion | undefined {
    const versions = this.certificatesStorage.get(name);
    return versions?.[versions.length - 1];
  }

  /**
   * Get specific version of a certificate
   * @internal
   */
  // @ts-ignore - Used via (this.client as any) in service classes
  private getCertificateVersion(name: string, version: string): CertificateVersion | undefined {
    const versions = this.certificatesStorage.get(name);
    return versions?.find((v) => v.version === version);
  }
}

/**
 * Secrets service interface
 */
export interface SecretsService {
  get(name: string, options?: GetSecretOptions): Promise<Secret>;
  set(name: string, value: string, options?: SetSecretOptions): Promise<Secret>;
  update(name: string, version: string, options: UpdateSecretPropertiesOptions): Promise<SecretProperties>;
  delete(name: string): Promise<DeletedSecret>;
  list(options?: ListSecretsOptions): AsyncIterable<SecretProperties>;
}

/**
 * Keys service interface
 */
export interface KeysService {
  get(name: string, options?: GetKeyOptions): Promise<Key>;
  create(name: string, options: CreateKeyOptions): Promise<Key>;
  importKey(name: string, options: ImportKeyOptions): Promise<Key>;
  update(name: string, version: string, options: UpdateKeyPropertiesOptions): Promise<KeyProperties>;
  delete(name: string): Promise<DeletedKey>;
  list(options?: ListKeysOptions): AsyncIterable<KeyProperties>;
}

/**
 * Certificates service interface
 */
export interface CertificatesService {
  get(name: string, options?: GetCertificateOptions): Promise<Certificate>;
  create(name: string, options: CreateCertificateOptions): Promise<Certificate>;
  importCertificate(name: string, options: ImportCertificateOptions): Promise<Certificate>;
  update(name: string, version: string, options: UpdateCertificatePropertiesOptions): Promise<CertificateProperties>;
  delete(name: string): Promise<DeletedCertificate>;
  list(options?: ListCertificatesOptions): AsyncIterable<CertificateProperties>;
}

/**
 * Mock Secrets Service implementation
 */
class MockSecretsService implements SecretsService {
  constructor(private client: MockKeyVaultClient) {}

  async get(name: string, options?: GetSecretOptions): Promise<Secret> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('getSecret', name, 'secret', options?.version, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to secret: ${name}`,
        resourceName: name,
      });
    }

    const version = options?.version
      ? client.getSecretVersion(name, options.version)
      : client.getLatestSecret(name);

    if (!version) {
      const errorMsg = options?.version
        ? `Secret version not found: ${name}/${options.version}`
        : `Secret not found: ${name}`;
      client.logAccess('getSecret', name, 'secret', options?.version, 'not_found', errorMsg, Date.now() - startTime);

      if (options?.version) {
        throw new VersionNotFoundError({
          message: errorMsg,
          resourceName: name,
          name,
          version: options.version,
        });
      }
      throw new SecretNotFoundError({
        message: errorMsg,
        resourceName: name,
      });
    }

    client.logAccess('getSecret', name, 'secret', version.version, 'success', undefined, Date.now() - startTime);
    return version.secret;
  }

  async set(name: string, value: string, options?: SetSecretOptions): Promise<Secret> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('setSecret', name, 'secret', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to secret: ${name}`,
        resourceName: name,
      });
    }

    client.registerSecret(name, value, undefined, options);
    const version = client.getLatestSecret(name);

    client.logAccess('setSecret', name, 'secret', version?.version, 'success', undefined, Date.now() - startTime);
    return version!.secret;
  }

  async update(name: string, version: string, options: UpdateSecretPropertiesOptions): Promise<SecretProperties> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('updateSecret', name, 'secret', version, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to secret: ${name}`,
        resourceName: name,
      });
    }

    const secretVersion = client.getSecretVersion(name, version);
    if (!secretVersion) {
      const errorMsg = `Secret version not found: ${name}/${version}`;
      client.logAccess('updateSecret', name, 'secret', version, 'not_found', errorMsg, Date.now() - startTime);
      throw new VersionNotFoundError({
        message: errorMsg,
        resourceName: name,
        name,
        version,
      });
    }

    // Update properties
    if (options.enabled !== undefined) {
      secretVersion.secret.properties.enabled = options.enabled;
      secretVersion.enabled = options.enabled;
    }
    if (options.contentType !== undefined) {
      secretVersion.secret.properties.contentType = options.contentType;
    }
    if (options.expiresOn !== undefined) {
      secretVersion.secret.properties.expiresOn = options.expiresOn;
    }
    if (options.notBefore !== undefined) {
      secretVersion.secret.properties.notBefore = options.notBefore;
    }
    if (options.tags !== undefined) {
      secretVersion.secret.properties.tags = options.tags;
    }
    secretVersion.secret.properties.updatedOn = new Date();

    client.logAccess('updateSecret', name, 'secret', version, 'success', undefined, Date.now() - startTime);
    return secretVersion.secret.properties;
  }

  async delete(name: string): Promise<DeletedSecret> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('deleteSecret', name, 'secret', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to secret: ${name}`,
        resourceName: name,
      });
    }

    const version = client.getLatestSecret(name);
    if (!version) {
      const errorMsg = `Secret not found: ${name}`;
      client.logAccess('deleteSecret', name, 'secret', undefined, 'not_found', errorMsg, Date.now() - startTime);
      throw new SecretNotFoundError({
        message: errorMsg,
        resourceName: name,
      });
    }

    // Remove from storage
    client.secretsStorage.delete(name);

    const deletedSecret: DeletedSecret = {
      id: version.secret.id,
      name,
      value: version.secret.value,
      properties: {
        ...version.secret.properties,
        deletedOn: new Date(),
        scheduledPurgeDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    };

    client.logAccess('deleteSecret', name, 'secret', version.version, 'success', undefined, Date.now() - startTime);
    return deletedSecret;
  }

  async *list(_options?: ListSecretsOptions): AsyncIterable<SecretProperties> {
    const secrets = (this.client as any).secretsStorage as Map<string, SecretVersion[]>;

    for (const [_name, versions] of secrets.entries()) {
      const latest = versions[versions.length - 1];
      if (latest) {
        yield latest.secret.properties;
      }
    }
  }
}

/**
 * Mock Keys Service implementation
 */
class MockKeysService implements KeysService {
  constructor(private client: MockKeyVaultClient) {}

  async get(name: string, options?: GetKeyOptions): Promise<Key> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('getKey', name, 'key', options?.version, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to key: ${name}`,
        resourceName: name,
      });
    }

    const version = options?.version
      ? client.getKeyVersion(name, options.version)
      : client.getLatestKey(name);

    if (!version) {
      const errorMsg = options?.version
        ? `Key version not found: ${name}/${options.version}`
        : `Key not found: ${name}`;
      client.logAccess('getKey', name, 'key', options?.version, 'not_found', errorMsg, Date.now() - startTime);

      if (options?.version) {
        throw new VersionNotFoundError({
          message: errorMsg,
          resourceName: name,
          name,
          version: options.version,
        });
      }
      throw new KeyNotFoundError({
        message: errorMsg,
        resourceName: name,
      });
    }

    client.logAccess('getKey', name, 'key', version.version, 'success', undefined, Date.now() - startTime);
    return version.key;
  }

  async create(name: string, options: CreateKeyOptions): Promise<Key> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('createKey', name, 'key', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to key: ${name}`,
        resourceName: name,
      });
    }

    // Create mock JWK
    const jwk: JsonWebKey = {
      kty: options.keyType.toString(),
      kid: `${client.vaultUrl}/keys/${name}`,
    };

    client.registerKey(name, jwk, undefined, options);
    const version = client.getLatestKey(name);

    client.logAccess('createKey', name, 'key', version?.version, 'success', undefined, Date.now() - startTime);
    return version!.key;
  }

  async importKey(name: string, options: ImportKeyOptions): Promise<Key> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('importKey', name, 'key', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to key: ${name}`,
        resourceName: name,
      });
    }

    client.registerKey(name, options.key, undefined, options);
    const version = client.getLatestKey(name);

    client.logAccess('importKey', name, 'key', version?.version, 'success', undefined, Date.now() - startTime);
    return version!.key;
  }

  async update(name: string, version: string, options: UpdateKeyPropertiesOptions): Promise<KeyProperties> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('updateKey', name, 'key', version, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to key: ${name}`,
        resourceName: name,
      });
    }

    const keyVersion = client.getKeyVersion(name, version);
    if (!keyVersion) {
      const errorMsg = `Key version not found: ${name}/${version}`;
      client.logAccess('updateKey', name, 'key', version, 'not_found', errorMsg, Date.now() - startTime);
      throw new VersionNotFoundError({
        message: errorMsg,
        resourceName: name,
        name,
        version,
      });
    }

    // Update properties
    if (options.enabled !== undefined) {
      keyVersion.key.properties.enabled = options.enabled;
      keyVersion.enabled = options.enabled;
    }
    if (options.keyOps !== undefined) {
      keyVersion.key.properties.keyOps = options.keyOps;
    }
    if (options.expiresOn !== undefined) {
      keyVersion.key.properties.expiresOn = options.expiresOn;
    }
    if (options.notBefore !== undefined) {
      keyVersion.key.properties.notBefore = options.notBefore;
    }
    if (options.tags !== undefined) {
      keyVersion.key.properties.tags = options.tags;
    }
    if (options.releasePolicy !== undefined) {
      keyVersion.key.properties.releasePolicy = options.releasePolicy;
    }
    keyVersion.key.properties.updatedOn = new Date();

    client.logAccess('updateKey', name, 'key', version, 'success', undefined, Date.now() - startTime);
    return keyVersion.key.properties;
  }

  async delete(name: string): Promise<DeletedKey> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('deleteKey', name, 'key', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to key: ${name}`,
        resourceName: name,
      });
    }

    const version = client.getLatestKey(name);
    if (!version) {
      const errorMsg = `Key not found: ${name}`;
      client.logAccess('deleteKey', name, 'key', undefined, 'not_found', errorMsg, Date.now() - startTime);
      throw new KeyNotFoundError({
        message: errorMsg,
        resourceName: name,
      });
    }

    // Remove from storage
    client.keysStorage.delete(name);

    const deletedKey: DeletedKey = {
      id: version.key.id,
      name,
      keyMaterial: version.key.keyMaterial,
      properties: {
        ...version.key.properties,
        deletedOn: new Date(),
        scheduledPurgeDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    };

    client.logAccess('deleteKey', name, 'key', version.version, 'success', undefined, Date.now() - startTime);
    return deletedKey;
  }

  async *list(_options?: ListKeysOptions): AsyncIterable<KeyProperties> {
    const keys = (this.client as any).keysStorage as Map<string, KeyVersion[]>;

    for (const [_name, versions] of keys.entries()) {
      const latest = versions[versions.length - 1];
      if (latest) {
        yield latest.key.properties;
      }
    }
  }
}

/**
 * Mock Certificates Service implementation
 */
class MockCertificatesService implements CertificatesService {
  constructor(private client: MockKeyVaultClient) {}

  async get(name: string, options?: GetCertificateOptions): Promise<Certificate> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('getCertificate', name, 'certificate', options?.version, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to certificate: ${name}`,
        resourceName: name,
      });
    }

    const version = options?.version
      ? client.getCertificateVersion(name, options.version)
      : client.getLatestCertificate(name);

    if (!version) {
      const errorMsg = options?.version
        ? `Certificate version not found: ${name}/${options.version}`
        : `Certificate not found: ${name}`;
      client.logAccess('getCertificate', name, 'certificate', options?.version, 'not_found', errorMsg, Date.now() - startTime);

      if (options?.version) {
        throw new VersionNotFoundError({
          message: errorMsg,
          resourceName: name,
          name,
          version: options.version,
        });
      }
      throw new CertificateNotFoundError({
        message: errorMsg,
        resourceName: name,
      });
    }

    client.logAccess('getCertificate', name, 'certificate', version.version, 'success', undefined, Date.now() - startTime);
    return version.certificate;
  }

  async create(name: string, options: CreateCertificateOptions): Promise<Certificate> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('createCertificate', name, 'certificate', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to certificate: ${name}`,
        resourceName: name,
      });
    }

    // Create mock certificate
    const mockCer = new Uint8Array([0x30, 0x82, 0x01, 0x00]); // Mock DER-encoded cert
    client.registerCertificate(name, mockCer, undefined, {
      ...options,
      certificate: mockCer,
    });
    const version = client.getLatestCertificate(name);

    client.logAccess('createCertificate', name, 'certificate', version?.version, 'success', undefined, Date.now() - startTime);
    return version!.certificate;
  }

  async importCertificate(name: string, options: ImportCertificateOptions): Promise<Certificate> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('importCertificate', name, 'certificate', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to certificate: ${name}`,
        resourceName: name,
      });
    }

    const cer = typeof options.certificate === 'string'
      ? new TextEncoder().encode(options.certificate)
      : options.certificate;

    client.registerCertificate(name, cer, undefined, options);
    const version = client.getLatestCertificate(name);

    client.logAccess('importCertificate', name, 'certificate', version?.version, 'success', undefined, Date.now() - startTime);
    return version!.certificate;
  }

  async update(name: string, version: string, options: UpdateCertificatePropertiesOptions): Promise<CertificateProperties> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('updateCertificate', name, 'certificate', version, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to certificate: ${name}`,
        resourceName: name,
      });
    }

    const certVersion = client.getCertificateVersion(name, version);
    if (!certVersion) {
      const errorMsg = `Certificate version not found: ${name}/${version}`;
      client.logAccess('updateCertificate', name, 'certificate', version, 'not_found', errorMsg, Date.now() - startTime);
      throw new VersionNotFoundError({
        message: errorMsg,
        resourceName: name,
        name,
        version,
      });
    }

    // Update properties
    if (options.enabled !== undefined) {
      certVersion.certificate.properties.enabled = options.enabled;
      certVersion.enabled = options.enabled;
    }
    if (options.tags !== undefined) {
      certVersion.certificate.properties.tags = options.tags;
    }
    certVersion.certificate.properties.updatedOn = new Date();

    client.logAccess('updateCertificate', name, 'certificate', version, 'success', undefined, Date.now() - startTime);
    return certVersion.certificate.properties;
  }

  async delete(name: string): Promise<DeletedCertificate> {
    const startTime = Date.now();
    const client = this.client as any;

    if (client.isAccessDenied(name)) {
      client.logAccess('deleteCertificate', name, 'certificate', undefined, 'access_denied', 'Access denied', Date.now() - startTime);
      throw new AccessDeniedError({
        message: `Access denied to certificate: ${name}`,
        resourceName: name,
      });
    }

    const version = client.getLatestCertificate(name);
    if (!version) {
      const errorMsg = `Certificate not found: ${name}`;
      client.logAccess('deleteCertificate', name, 'certificate', undefined, 'not_found', errorMsg, Date.now() - startTime);
      throw new CertificateNotFoundError({
        message: errorMsg,
        resourceName: name,
      });
    }

    // Remove from storage
    client.certificatesStorage.delete(name);

    const deletedCertificate: DeletedCertificate = {
      id: version.certificate.id,
      name,
      cer: version.certificate.cer,
      properties: {
        ...version.certificate.properties,
        deletedOn: new Date(),
        scheduledPurgeDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
      policy: version.certificate.policy,
    };

    client.logAccess('deleteCertificate', name, 'certificate', version.version, 'success', undefined, Date.now() - startTime);
    return deletedCertificate;
  }

  async *list(_options?: ListCertificatesOptions): AsyncIterable<CertificateProperties> {
    const certificates = (this.client as any).certificatesStorage as Map<string, CertificateVersion[]>;

    for (const [_name, versions] of certificates.entries()) {
      const latest = versions[versions.length - 1];
      if (latest) {
        yield latest.certificate.properties;
      }
    }
  }
}
