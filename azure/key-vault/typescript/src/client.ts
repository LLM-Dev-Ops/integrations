/**
 * Azure Key Vault Client
 *
 * Main facade for accessing Azure Key Vault services following SPARC specification.
 * Provides unified access to secrets, keys, and certificates with integrated
 * caching, observability, and rotation handling.
 *
 * @example
 * ```typescript
 * import { KeyVaultClient } from './client';
 * import { EnvironmentCredential } from './transport';
 *
 * // Create client with explicit configuration
 * const client = new KeyVaultClient({
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   credential: new EnvironmentCredential(),
 * });
 *
 * // Or create from environment variables
 * const client = await KeyVaultClient.fromEnv();
 *
 * // Access services
 * const secret = await client.secrets().getSecret('my-secret');
 * const key = await client.keys().getKey('my-key');
 * const cert = await client.certificates().getCertificate('my-cert');
 *
 * // Cryptographic operations
 * const encrypted = await client.keys().encrypt('my-key', 'RSA-OAEP', plaintext);
 * const signed = await client.keys().sign('my-key', 'RS256', digest);
 * ```
 */

import {
  type KeyVaultConfig,
  type NormalizedKeyVaultConfig,
  normalizeConfig,
  configFromEnv,
} from './config.js';
import {
  type KeyVaultCredential,
  createDefaultCredential,
  HttpTransport,
} from './transport/index.js';
import { CacheManager } from './cache/index.js';
import { SecretsService, SecretsServiceImpl } from './services/secrets/index.js';
import { KeysService, KeysServiceImpl } from './services/keys/index.js';
import { CertificatesService, CertificatesServiceImpl } from './services/certificates/index.js';
import { ExpiryMonitor, RotationHandler, NoOpRotationHandler } from './rotation/index.js';
import {
  MetricsCollector,
  NoOpMetricsCollector,
  Logger,
  NoOpLogger,
  Tracer,
  NoOpTracer,
} from './observability/index.js';

/**
 * Options for creating a KeyVaultClient
 */
export interface KeyVaultClientOptions extends KeyVaultConfig {
  /** Azure AD credential for authentication */
  credential?: KeyVaultCredential;
  /** Metrics collector for observability */
  metrics?: MetricsCollector;
  /** Logger instance */
  logger?: Logger;
  /** Tracer for distributed tracing */
  tracer?: Tracer;
  /** Rotation handler for secret/key rotation */
  rotationHandler?: RotationHandler;
}

/**
 * Internal dependencies for services
 */
interface ServiceDependencies {
  transport: HttpTransport;
  cache: CacheManager;
  config: NormalizedKeyVaultConfig;
  metrics: MetricsCollector;
  logger: Logger;
  tracer: Tracer;
}

/**
 * Azure Key Vault Client
 *
 * The main entry point for interacting with Azure Key Vault.
 * Provides access to secrets, keys, and certificates services
 * with integrated caching, retry logic, and observability.
 */
export class KeyVaultClient {
  private readonly deps: ServiceDependencies;
  private readonly rotationHandler: RotationHandler;

  // Lazily initialized services
  private _secrets?: SecretsService;
  private _keys?: KeysService;
  private _certificates?: CertificatesService;
  private _expiryMonitor?: ExpiryMonitor;

  /**
   * Create a new KeyVaultClient
   *
   * @param options - Client configuration options
   * @throws {ConfigurationError} If configuration is invalid
   */
  constructor(options: KeyVaultClientOptions) {
    // Normalize configuration
    const config = normalizeConfig(options);

    // Get or create credential
    const credential = options.credential ?? createDefaultCredential();

    // Create transport layer
    const transport = new HttpTransport({
      baseUrl: config.vaultUrl,
      apiVersion: config.apiVersion,
      timeout: config.timeout,
      credential,
    });

    // Create cache manager
    const cache = new CacheManager(config.cache);

    // Get observability dependencies (default to no-ops)
    const metrics = options.metrics ?? new NoOpMetricsCollector();
    const logger = options.logger ?? new NoOpLogger();
    const tracer = options.tracer ?? new NoOpTracer();

    // Store dependencies
    this.deps = {
      transport,
      cache,
      config,
      metrics,
      logger,
      tracer,
    };

    // Rotation handler
    this.rotationHandler = options.rotationHandler ?? new NoOpRotationHandler();
  }

  /**
   * Create a KeyVaultClient from environment variables
   *
   * Required environment variables:
   * - AZURE_KEYVAULT_URL: Vault URL
   *
   * Optional environment variables:
   * - AZURE_KEYVAULT_API_VERSION: API version
   * - AZURE_KEYVAULT_TIMEOUT_MS: Request timeout
   * - AZURE_KEYVAULT_MAX_RETRIES: Max retry attempts
   * - AZURE_KEYVAULT_CACHE_ENABLED: Enable caching
   * - AZURE_KEYVAULT_CACHE_TTL_MS: Cache TTL
   *
   * For authentication, set Azure AD environment variables:
   * - AZURE_TENANT_ID: Azure AD tenant ID
   * - AZURE_CLIENT_ID: Azure AD application ID
   * - AZURE_CLIENT_SECRET: Azure AD application secret
   *
   * @param overrides - Optional overrides for environment config
   * @returns New KeyVaultClient instance
   * @throws {ConfigurationError} If required env vars are missing
   */
  static fromEnv(overrides?: Partial<KeyVaultClientOptions>): KeyVaultClient {
    const envConfig = configFromEnv();
    return new KeyVaultClient({
      ...envConfig,
      ...overrides,
    });
  }

  /**
   * Get the Secrets service
   *
   * @returns SecretsService instance for secret operations
   *
   * @example
   * ```typescript
   * const secret = await client.secrets().getSecret('db-password');
   * await client.secrets().setSecret('api-key', 'secret-value');
   * ```
   */
  secrets(): SecretsService {
    if (!this._secrets) {
      this._secrets = new SecretsServiceImpl(
        this.deps.transport,
        this.deps.cache,
        this.deps.config,
        this.deps.metrics,
        this.deps.logger,
        this.deps.tracer
      );
    }
    return this._secrets;
  }

  /**
   * Get the Keys service
   *
   * @returns KeysService instance for key operations
   *
   * @example
   * ```typescript
   * const key = await client.keys().getKey('encryption-key');
   * const encrypted = await client.keys().encrypt('my-key', 'RSA-OAEP', data);
   * const signature = await client.keys().sign('signing-key', 'RS256', digest);
   * ```
   */
  keys(): KeysService {
    if (!this._keys) {
      this._keys = new KeysServiceImpl(
        this.deps.transport,
        this.deps.cache,
        this.deps.config.vaultUrl
      );
    }
    return this._keys;
  }

  /**
   * Get the Certificates service
   *
   * @returns CertificatesService instance for certificate operations
   *
   * @example
   * ```typescript
   * const cert = await client.certificates().getCertificate('my-cert');
   * const policy = await client.certificates().getCertificatePolicy('my-cert');
   * ```
   */
  certificates(): CertificatesService {
    if (!this._certificates) {
      this._certificates = new CertificatesServiceImpl(
        this.deps.transport,
        this.deps.cache,
        this.deps.config
      );
    }
    return this._certificates;
  }

  /**
   * Get the Expiry Monitor
   *
   * @returns ExpiryMonitor instance for monitoring secret/key expiry
   *
   * @example
   * ```typescript
   * const monitor = client.expiryMonitor();
   * monitor.onExpiringSoon((item) => {
   *   console.log(`${item.name} expires in ${item.daysUntilExpiry} days`);
   * });
   * await monitor.checkAll();
   * ```
   */
  expiryMonitor(): ExpiryMonitor {
    if (!this._expiryMonitor) {
      this._expiryMonitor = new ExpiryMonitor(
        this.secrets() as unknown as import('./rotation/index.js').SecretsService,
        undefined, // Use default config
        {
          metrics: this.deps.metrics as unknown as import('./rotation/index.js').MetricsCollector,
          logger: this.deps.logger as unknown as import('./rotation/index.js').Logger,
        }
      );
    }
    return this._expiryMonitor;
  }

  /**
   * Get the rotation handler
   *
   * @returns RotationHandler instance
   */
  getRotationHandler(): RotationHandler {
    return this.rotationHandler;
  }

  /**
   * Get the vault URL
   *
   * @returns Vault URL
   */
  getVaultUrl(): string {
    return this.deps.config.vaultUrl;
  }

  /**
   * Get the vault hostname
   *
   * @returns Vault hostname (e.g., "my-vault.vault.azure.net")
   */
  getVaultHost(): string {
    return this.deps.config.vaultHost;
  }

  /**
   * Get the normalized configuration
   *
   * @returns Normalized configuration (read-only)
   */
  getConfig(): Readonly<NormalizedKeyVaultConfig> {
    return { ...this.deps.config };
  }

  /**
   * Clear all caches
   *
   * Useful for testing or when you need to force fresh data retrieval.
   */
  clearCache(): void {
    this.deps.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics including size and hit rate
   */
  getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
    return this.deps.cache.getStats();
  }

  /**
   * Invalidate a specific cache entry
   *
   * @param objectType - Object type ('secret', 'key', or 'certificate')
   * @param name - Object name
   * @param version - Optional version (defaults to 'latest')
   */
  invalidateCacheEntry(
    objectType: 'secret' | 'key' | 'certificate',
    name: string,
    version?: string
  ): void {
    const key = CacheManager.buildKey(objectType, name, version ?? 'latest');
    this.deps.cache.invalidate(key);
  }

  /**
   * Invalidate all cache entries for a specific object
   *
   * @param objectType - Object type ('secret', 'key', or 'certificate')
   * @param name - Object name
   */
  invalidateCacheObject(
    objectType: 'secret' | 'key' | 'certificate',
    name: string
  ): void {
    this.deps.cache.invalidatePattern(`${objectType}:${name}:*`);
  }
}
