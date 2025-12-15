/**
 * Azure Key Vault Secrets Service
 *
 * Implementation of secret operations following SPARC specification.
 */

import type { HttpTransport } from '../../transport/index.js';
import { CacheManager } from '../../cache/index.js';
import type { NormalizedKeyVaultConfig } from '../../config.js';
import type {
  Secret,
  SecretProperties,
  DeletedSecret,
  BackupBlob,
  GetSecretOptions,
  SetSecretOptions,
  ListSecretsOptions,
  UpdateSecretPropertiesOptions,
  SecretBundle,
  SecretItem,
  DeletedSecretBundle,
  SecretListResult,
  BackupSecretResult,
} from './types.js';

import { SecretString } from '../../types/index.js';
import { TimestampUtils } from '../../types/common.js';
import { validateSecretName, validateSecretValueSize } from '../../validation.js';
import {
  createErrorFromResponse,
  SecretExpiredError,
  SecretNotYetValidError,
} from '../../error.js';
import {
  MetricsCollector,
  NoOpMetricsCollector,
  METRICS,
  createOperationLabels,
  createCacheLabels,
} from '../../observability/metrics.js';
import {
  Logger,
  NoOpLogger,
  checkExpiryWarning,
} from '../../observability/logging.js';
import {
  Tracer,
  NoOpTracer,
  createSecretSpanAttributes,
  SpanStatus,
} from '../../observability/tracing.js';

/**
 * Secrets Service interface
 */
export interface SecretsService {
  /** Get secret value (latest or specific version) */
  getSecret(name: string, options?: GetSecretOptions): Promise<Secret>;

  /** Set secret value (creates new version) */
  setSecret(name: string, value: string, options?: SetSecretOptions): Promise<Secret>;

  /** List all secrets (metadata only, no values) */
  listSecrets(options?: ListSecretsOptions): Promise<SecretProperties[]>;

  /** List all versions of a secret */
  listSecretVersions(name: string): Promise<SecretProperties[]>;

  /** Update secret properties */
  updateSecretProperties(
    name: string,
    version: string,
    options: UpdateSecretPropertiesOptions
  ): Promise<SecretProperties>;

  /** Delete secret (soft delete if enabled) */
  deleteSecret(name: string): Promise<DeletedSecret>;

  /** Recover soft-deleted secret */
  recoverDeletedSecret(name: string): Promise<Secret>;

  /** Permanently delete secret */
  purgeDeletedSecret(name: string): Promise<void>;

  /** Backup secret */
  backupSecret(name: string): Promise<BackupBlob>;

  /** Restore secret from backup */
  restoreSecret(backup: BackupBlob): Promise<Secret>;
}

/**
 * Secrets Service implementation
 */
export class SecretsServiceImpl implements SecretsService {
  private readonly transport: HttpTransport;
  private readonly cache: CacheManager;
  private readonly config: NormalizedKeyVaultConfig;
  private readonly metrics: MetricsCollector;
  private readonly logger: Logger;
  private readonly tracer: Tracer;

  constructor(
    transport: HttpTransport,
    cache: CacheManager,
    config: NormalizedKeyVaultConfig,
    metrics: MetricsCollector = new NoOpMetricsCollector(),
    logger: Logger = new NoOpLogger(),
    tracer: Tracer = new NoOpTracer()
  ) {
    this.transport = transport;
    this.cache = cache;
    this.config = config;
    this.metrics = metrics;
    this.logger = logger;
    this.tracer = tracer;
  }

  async getSecret(name: string, options?: GetSecretOptions): Promise<Secret> {
    const startTime = Date.now();
    const version = options?.version;

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'getSecret',
      createSecretSpanAttributes(this.config.vaultUrl, name, version)
    );

    try {
      // Check cache first
      const cacheKey = CacheManager.buildKey('secret', name, version);
      const cached = this.cache.get<Secret>(cacheKey);

      if (cached) {
        this.metrics.increment(
          METRICS.CACHE_HITS,
          1,
          createCacheLabels('secret', true)
        );
        span.setAttribute('cache_hit', true);
        this.logger.debug(`Cache hit for secret: ${name}`, {
          secret_name: name,
          version,
        });

        // Check expiry warning
        if (cached.properties.expiresOn) {
          checkExpiryWarning(cached.properties.expiresOn, this.logger, name);
        }

        span.end();
        const duration = Date.now() - startTime;
        this.metrics.histogram(
          METRICS.OPERATION_DURATION_MS,
          duration,
          createOperationLabels('getSecret', this.config.vaultUrl, 'secret')
        );

        return cached;
      }

      // Cache miss
      this.metrics.increment(
        METRICS.CACHE_MISSES,
        1,
        createCacheLabels('secret', false)
      );
      span.setAttribute('cache_hit', false);

      // Build path
      const path = version
        ? `/secrets/${name}/${version}`
        : `/secrets/${name}`;

      // Make API call
      this.logger.debug(`Fetching secret from API: ${name}`, {
        secret_name: name,
        version,
      });

      const response = await this.transport.get(path);

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('getSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response
      const bundle = response.body as SecretBundle;
      const secret = this.parseSecretBundle(bundle);

      // Check if secret is expired
      if (secret.properties.expiresOn && TimestampUtils.isExpired(secret.properties.expiresOn)) {
        const error = new SecretExpiredError({
          message: `Secret '${name}' has expired`,
          vault: this.config.vaultUrl,
          resourceName: name,
        });
        span.recordError(error);
        span.end();
        throw error;
      }

      // Check if secret is not yet valid
      if (
        secret.properties.notBefore &&
        TimestampUtils.isNotYetValid(secret.properties.notBefore)
      ) {
        const error = new SecretNotYetValidError({
          message: `Secret '${name}' is not yet valid`,
          validFrom: secret.properties.notBefore,
          vault: this.config.vaultUrl,
          resourceName: name,
        });
        span.recordError(error);
        span.end();
        throw error;
      }

      // Cache the result
      this.cache.set(cacheKey, secret);

      // Check expiry warning
      if (secret.properties.expiresOn) {
        checkExpiryWarning(secret.properties.expiresOn, this.logger, name);
      }

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('getSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('getSecret', this.config.vaultUrl, 'secret')
      );

      return secret;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async setSecret(
    name: string,
    value: string,
    options?: SetSecretOptions
  ): Promise<Secret> {
    const startTime = Date.now();

    // Validate inputs
    validateSecretName(name);
    validateSecretValueSize(value);

    // Create span
    const span = this.tracer.startSpan(
      'setSecret',
      createSecretSpanAttributes(this.config.vaultUrl, name)
    );

    try {
      // Build request body
      const body: Record<string, unknown> = {
        value,
      };

      if (options?.contentType) {
        body.contentType = options.contentType;
      }

      if (options?.tags) {
        body.tags = options.tags;
      }

      const attributes: Record<string, unknown> = {};

      if (options?.enabled !== undefined) {
        attributes.enabled = options.enabled;
      }

      if (options?.expiresOn) {
        attributes.exp = TimestampUtils.toUnixSeconds(options.expiresOn);
      }

      if (options?.notBefore) {
        attributes.nbf = TimestampUtils.toUnixSeconds(options.notBefore);
      }

      if (Object.keys(attributes).length > 0) {
        body.attributes = attributes;
      }

      // Make API call
      this.logger.debug(`Setting secret: ${name}`, { secret_name: name });

      const response = await this.transport.put(`/secrets/${name}`, body);

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('setSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response
      const bundle = response.body as SecretBundle;
      const secret = this.parseSecretBundle(bundle);

      // Invalidate cache for this secret (all versions)
      this.cache.invalidatePattern(`secret:${name}:*`);

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('setSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('setSecret', this.config.vaultUrl, 'secret')
      );

      return secret;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async listSecrets(options?: ListSecretsOptions): Promise<SecretProperties[]> {
    const startTime = Date.now();

    // Create span
    const span = this.tracer.startSpan(
      'listSecrets',
      createSecretSpanAttributes(this.config.vaultUrl, '*')
    );

    try {
      const secrets: SecretProperties[] = [];
      let nextLink: string | undefined;

      // Build query parameters
      const query: Record<string, string> = {};
      if (options?.maxPageSize) {
        query.maxresults = options.maxPageSize.toString();
      }

      do {
        // Make API call
        const path = nextLink ? nextLink : '/secrets';
        const response = await this.transport.get(path, nextLink ? undefined : query);

        // Handle errors
        if (response.status !== 200) {
          const error = createErrorFromResponse(
            response.status,
            response.body as string,
            response.headers,
            this.config.vaultUrl
          );
          span.recordError(error);
          span.end();
          this.metrics.increment(
            METRICS.OPERATION_ERRORS,
            1,
            createOperationLabels('listSecrets', this.config.vaultUrl, 'secret')
          );
          throw error;
        }

        // Parse response
        const result = response.body as SecretListResult;

        if (result.value) {
          for (const item of result.value) {
            secrets.push(this.parseSecretItem(item));
          }
        }

        // Get next link
        nextLink = result.nextLink;
      } while (nextLink);

      span.setStatus(SpanStatus.OK);
      span.setAttribute('count', secrets.length);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('listSecrets', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('listSecrets', this.config.vaultUrl, 'secret')
      );

      return secrets;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async listSecretVersions(name: string): Promise<SecretProperties[]> {
    const startTime = Date.now();

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'listSecretVersions',
      createSecretSpanAttributes(this.config.vaultUrl, name)
    );

    try {
      const versions: SecretProperties[] = [];
      let nextLink: string | undefined;

      do {
        // Make API call
        const path = nextLink ? nextLink : `/secrets/${name}/versions`;
        const response = await this.transport.get(path);

        // Handle errors
        if (response.status !== 200) {
          const error = createErrorFromResponse(
            response.status,
            response.body as string,
            response.headers,
            this.config.vaultUrl,
            name
          );
          span.recordError(error);
          span.end();
          this.metrics.increment(
            METRICS.OPERATION_ERRORS,
            1,
            createOperationLabels('listSecretVersions', this.config.vaultUrl, 'secret')
          );
          throw error;
        }

        // Parse response
        const result = response.body as SecretListResult;

        if (result.value) {
          for (const item of result.value) {
            versions.push(this.parseSecretItem(item));
          }
        }

        // Get next link
        nextLink = result.nextLink;
      } while (nextLink);

      span.setStatus(SpanStatus.OK);
      span.setAttribute('count', versions.length);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('listSecretVersions', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('listSecretVersions', this.config.vaultUrl, 'secret')
      );

      return versions;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async updateSecretProperties(
    name: string,
    version: string,
    options: UpdateSecretPropertiesOptions
  ): Promise<SecretProperties> {
    const startTime = Date.now();

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'updateSecretProperties',
      createSecretSpanAttributes(this.config.vaultUrl, name, version)
    );

    try {
      // Build request body
      const body: Record<string, unknown> = {};

      if (options.contentType !== undefined) {
        body.contentType = options.contentType;
      }

      if (options.tags !== undefined) {
        body.tags = options.tags;
      }

      const attributes: Record<string, unknown> = {};

      if (options.enabled !== undefined) {
        attributes.enabled = options.enabled;
      }

      if (options.expiresOn !== undefined) {
        attributes.exp = TimestampUtils.toUnixSeconds(options.expiresOn);
      }

      if (options.notBefore !== undefined) {
        attributes.nbf = TimestampUtils.toUnixSeconds(options.notBefore);
      }

      if (Object.keys(attributes).length > 0) {
        body.attributes = attributes;
      }

      // Make API call
      const response = await this.transport.put(
        `/secrets/${name}/${version}`,
        body
      );

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('updateSecretProperties', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response (returns a SecretBundle)
      const bundle = response.body as SecretBundle;
      const secret = this.parseSecretBundle(bundle);

      // Invalidate cache for this secret version
      const cacheKey = CacheManager.buildKey('secret', name, version);
      this.cache.invalidate(cacheKey);

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('updateSecretProperties', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('updateSecretProperties', this.config.vaultUrl, 'secret')
      );

      return secret.properties;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async deleteSecret(name: string): Promise<DeletedSecret> {
    const startTime = Date.now();

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'deleteSecret',
      createSecretSpanAttributes(this.config.vaultUrl, name)
    );

    try {
      // Make API call
      this.logger.debug(`Deleting secret: ${name}`, { secret_name: name });

      const response = await this.transport.delete(`/secrets/${name}`);

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('deleteSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response
      const bundle = response.body as DeletedSecretBundle;
      const deletedSecret = this.parseDeletedSecretBundle(bundle);

      // Invalidate cache for this secret (all versions)
      this.cache.invalidatePattern(`secret:${name}:*`);

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('deleteSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('deleteSecret', this.config.vaultUrl, 'secret')
      );

      return deletedSecret;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async recoverDeletedSecret(name: string): Promise<Secret> {
    const startTime = Date.now();

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'recoverDeletedSecret',
      createSecretSpanAttributes(this.config.vaultUrl, name)
    );

    try {
      // Make API call
      this.logger.debug(`Recovering deleted secret: ${name}`, { secret_name: name });

      const response = await this.transport.post(
        `/deletedsecrets/${name}/recover`,
        {}
      );

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('recoverDeletedSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response
      const bundle = response.body as SecretBundle;
      const secret = this.parseSecretBundle(bundle);

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('recoverDeletedSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('recoverDeletedSecret', this.config.vaultUrl, 'secret')
      );

      return secret;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async purgeDeletedSecret(name: string): Promise<void> {
    const startTime = Date.now();

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'purgeDeletedSecret',
      createSecretSpanAttributes(this.config.vaultUrl, name)
    );

    try {
      // Make API call
      this.logger.debug(`Purging deleted secret: ${name}`, { secret_name: name });

      const response = await this.transport.delete(`/deletedsecrets/${name}`);

      // Handle errors (204 No Content is success)
      if (response.status !== 204) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('purgeDeletedSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('purgeDeletedSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('purgeDeletedSecret', this.config.vaultUrl, 'secret')
      );
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async backupSecret(name: string): Promise<BackupBlob> {
    const startTime = Date.now();

    // Validate secret name
    validateSecretName(name);

    // Create span
    const span = this.tracer.startSpan(
      'backupSecret',
      createSecretSpanAttributes(this.config.vaultUrl, name)
    );

    try {
      // Make API call
      this.logger.debug(`Backing up secret: ${name}`, { secret_name: name });

      const response = await this.transport.post(`/secrets/${name}/backup`, {});

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('backupSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response
      const result = response.body as BackupSecretResult;

      // Decode Base64 backup blob
      const backupBlob: BackupBlob = {
        value: Uint8Array.from(Buffer.from(result.value, 'base64')),
      };

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('backupSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('backupSecret', this.config.vaultUrl, 'secret')
      );

      return backupBlob;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  async restoreSecret(backup: BackupBlob): Promise<Secret> {
    const startTime = Date.now();

    // Create span
    const span = this.tracer.startSpan(
      'restoreSecret',
      createSecretSpanAttributes(this.config.vaultUrl, 'backup')
    );

    try {
      // Encode backup blob to Base64
      const encodedBackup = Buffer.from(backup.value).toString('base64');

      // Make API call
      this.logger.debug('Restoring secret from backup');

      const response = await this.transport.post('/secrets/restore', {
        value: encodedBackup,
      });

      // Handle errors
      if (response.status !== 200) {
        const error = createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl
        );
        span.recordError(error);
        span.end();
        this.metrics.increment(
          METRICS.OPERATION_ERRORS,
          1,
          createOperationLabels('restoreSecret', this.config.vaultUrl, 'secret')
        );
        throw error;
      }

      // Parse response
      const bundle = response.body as SecretBundle;
      const secret = this.parseSecretBundle(bundle);

      span.setStatus(SpanStatus.OK);
      span.end();

      const duration = Date.now() - startTime;
      this.metrics.histogram(
        METRICS.OPERATION_DURATION_MS,
        duration,
        createOperationLabels('restoreSecret', this.config.vaultUrl, 'secret')
      );
      this.metrics.increment(
        METRICS.OPERATION_SUCCESS,
        1,
        createOperationLabels('restoreSecret', this.config.vaultUrl, 'secret')
      );

      return secret;
    } catch (error) {
      span.recordError(error as Error);
      span.end();
      throw error;
    }
  }

  /**
   * Parse Azure SecretBundle to Secret
   */
  private parseSecretBundle(bundle: SecretBundle): Secret {
    // Extract name and version from ID
    // ID format: https://{vault}.vault.azure.net/secrets/{name}/{version}
    const idParts = bundle.id.split('/');
    const name = idParts[idParts.length - 2] ?? '';
    const version = idParts[idParts.length - 1] ?? '';

    // Parse attributes
    const attributes = bundle.attributes ?? {};

    const properties: SecretProperties = {
      id: bundle.id,
      name,
      vaultUrl: this.config.vaultUrl,
      version,
      enabled: attributes.enabled ?? true,
      createdOn: TimestampUtils.fromUnixSeconds(attributes.created),
      updatedOn: TimestampUtils.fromUnixSeconds(attributes.updated),
      expiresOn: TimestampUtils.fromUnixSeconds(attributes.exp),
      notBefore: TimestampUtils.fromUnixSeconds(attributes.nbf),
      tags: bundle.tags,
      contentType: bundle.contentType,
      managed: bundle.managed,
    };

    return {
      id: bundle.id,
      name,
      value: new SecretString(bundle.value ?? ''),
      properties,
    };
  }

  /**
   * Parse Azure SecretItem to SecretProperties
   */
  private parseSecretItem(item: SecretItem): SecretProperties {
    // Extract name and version from ID
    const idParts = item.id.split('/');
    const name = idParts[idParts.length - 2] ?? '';
    const version = idParts[idParts.length - 1] ?? '';

    // Parse attributes
    const attributes = item.attributes ?? {};

    return {
      id: item.id,
      name,
      vaultUrl: this.config.vaultUrl,
      version,
      enabled: attributes.enabled ?? true,
      createdOn: TimestampUtils.fromUnixSeconds(attributes.created),
      updatedOn: TimestampUtils.fromUnixSeconds(attributes.updated),
      expiresOn: TimestampUtils.fromUnixSeconds(attributes.exp),
      notBefore: TimestampUtils.fromUnixSeconds(attributes.nbf),
      tags: item.tags,
      contentType: item.contentType,
      managed: item.managed,
    };
  }

  /**
   * Parse Azure DeletedSecretBundle to DeletedSecret
   */
  private parseDeletedSecretBundle(bundle: DeletedSecretBundle): DeletedSecret {
    // Extract name from ID
    const idParts = bundle.id.split('/');
    const name = idParts[idParts.length - 1] ?? '';

    // Parse attributes
    const attributes = bundle.attributes ?? {};

    const properties = {
      id: bundle.id,
      name,
      vaultUrl: this.config.vaultUrl,
      enabled: attributes.enabled ?? true,
      createdOn: TimestampUtils.fromUnixSeconds(attributes.created),
      updatedOn: TimestampUtils.fromUnixSeconds(attributes.updated),
      expiresOn: TimestampUtils.fromUnixSeconds(attributes.exp),
      notBefore: TimestampUtils.fromUnixSeconds(attributes.nbf),
      tags: bundle.tags,
      contentType: bundle.contentType,
      managed: bundle.managed,
      deletedOn: TimestampUtils.fromUnixSeconds(bundle.deletedDate),
      scheduledPurgeDate: TimestampUtils.fromUnixSeconds(bundle.scheduledPurgeDate),
      recoveryId: bundle.recoveryId,
    };

    return {
      id: bundle.id,
      name,
      value: bundle.value ? new SecretString(bundle.value) : undefined,
      properties,
    };
  }
}
