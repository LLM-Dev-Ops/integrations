/**
 * AWS Secrets Manager Client
 *
 * High-level client for AWS Secrets Manager operations.
 * Provides secret retrieval, version management, and rotation capabilities
 * following the SPARC hexagonal architecture pattern.
 *
 * @module client
 */

import type {
  AwsCredentials,
  CredentialProvider,
  GetSecretOptions,
  ListSecretsOptions,
  SecretValue,
  SecretMetadata,
  RotationResult,
  ListSecretsResponse,
  GetSecretValueRequest,
  GetSecretValueResponse,
  DescribeSecretRequest,
  DescribeSecretResponse,
  ListSecretsRequest,
  ListSecretsApiResponse,
  RotateSecretRequest,
  RotateSecretResponse,
  VersionStage,
} from '../types/index.js';
import type { SecretsManagerConfig } from '../config/index.js';
import { SecretsManagerConfigBuilder, resolveEndpoint, buildUserAgent } from '../config/index.js';
import {
  SecretsManagerError,
  mapHttpError,
  transportError,
  validationError,
} from '../error/index.js';
import { signRequest } from '../signing/index.js';
import { FetchTransport, type Transport } from '../http/index.js';

/**
 * AWS Secrets Manager Client.
 *
 * Main entry point for interacting with AWS Secrets Manager.
 * Provides methods for retrieving, describing, listing, and rotating secrets.
 *
 * @example
 * ```typescript
 * // Create from environment
 * const client = await SecretsManagerClient.fromEnv();
 *
 * // Get a secret value
 * const secret = await client.getSecretValue('my-secret');
 * console.log('Secret:', secret.secretString);
 *
 * // Get a specific version
 * const oldSecret = await client.getSecretValue('my-secret', {
 *   versionStage: 'AWSPREVIOUS'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create with builder
 * const client = await SecretsManagerClient.builder()
 *   .region('us-east-1')
 *   .credentialsProvider(myProvider)
 *   .build();
 *
 * // List secrets
 * const response = await client.listSecrets({
 *   filters: [{ key: 'name', values: ['prod/'] }]
 * });
 *
 * for (const secret of response.secrets) {
 *   console.log(secret.name);
 * }
 * ```
 */
export class SecretsManagerClient {
  private readonly config: SecretsManagerConfig;
  private readonly transport: Transport;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private credentials: AwsCredentials | null = null;

  /**
   * Create a new Secrets Manager client.
   *
   * Use `SecretsManagerClient.builder()` or `SecretsManagerClient.fromEnv()` instead
   * of calling this constructor directly.
   *
   * @param config - Secrets Manager configuration
   * @param transport - Optional custom HTTP transport
   */
  constructor(config: SecretsManagerConfig, transport?: Transport) {
    this.config = config;
    this.transport = transport ?? new FetchTransport({
      timeout: config.timeout,
      connectTimeout: config.connectTimeout,
    });
    this.baseUrl = resolveEndpoint(config);
    this.userAgent = buildUserAgent(config);
  }

  /**
   * Get the client configuration.
   *
   * @returns Secrets Manager configuration
   */
  getConfig(): SecretsManagerConfig {
    return this.config;
  }

  /**
   * Retrieve a secret value.
   *
   * Fetches the secret value from AWS Secrets Manager. By default, retrieves
   * the version marked as AWSCURRENT. Use options to specify a different
   * version or version stage.
   *
   * @param secretId - Secret name or ARN
   * @param options - Optional retrieval options (version, stage)
   * @returns Promise resolving to the secret value
   * @throws {SecretsManagerError} On API or network errors
   *
   * @example
   * ```typescript
   * // Get current version
   * const secret = await client.getSecretValue('my-secret');
   *
   * // Get specific version
   * const oldSecret = await client.getSecretValue('my-secret', {
   *   versionId: 'abc123'
   * });
   *
   * // Get previous version
   * const prevSecret = await client.getSecretValue('my-secret', {
   *   versionStage: 'AWSPREVIOUS'
   * });
   * ```
   */
  async getSecretValue(secretId: string, options: GetSecretOptions = {}): Promise<SecretValue> {
    this.validateSecretId(secretId);

    // Validate that versionId and versionStage are not both specified
    if (options.versionId && options.versionStage) {
      throw validationError('Cannot specify both versionId and versionStage');
    }

    const request: GetSecretValueRequest = {
      SecretId: secretId,
    };

    if (options.versionId) {
      request.VersionId = options.versionId;
    }

    if (options.versionStage) {
      request.VersionStage = options.versionStage;
    }

    const response = await this.sendRequest<GetSecretValueResponse>(
      'GetSecretValue',
      request
    );

    return this.mapSecretValue(response);
  }

  /**
   * Get a specific key from a JSON secret.
   *
   * Convenience method that retrieves a secret and extracts a specific key
   * from the JSON value.
   *
   * @param secretId - Secret name or ARN
   * @param key - JSON key to extract
   * @param options - Optional retrieval options
   * @returns Promise resolving to the key value as a string
   * @throws {SecretsManagerError} If secret is not valid JSON or key not found
   *
   * @example
   * ```typescript
   * // Secret value: {"username": "admin", "password": "secret123"}
   * const password = await client.getSecretKey('db-credentials', 'password');
   * console.log(password); // "secret123"
   * ```
   */
  async getSecretKey(
    secretId: string,
    key: string,
    options: GetSecretOptions = {}
  ): Promise<string> {
    const secret = await this.getSecretValue(secretId, options);

    if (!secret.secretString) {
      throw validationError('Secret does not contain a string value');
    }

    try {
      const parsed = JSON.parse(secret.secretString) as Record<string, unknown>;
      if (!(key in parsed)) {
        throw validationError(`Key '${key}' not found in secret`);
      }

      const value = parsed[key];
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);
    } catch (error) {
      if (error instanceof SecretsManagerError) {
        throw error;
      }
      throw validationError(`Secret is not valid JSON: ${error}`);
    }
  }

  /**
   * Get secret metadata without the value.
   *
   * Retrieves metadata about a secret including rotation configuration,
   * tags, and version information, without retrieving the actual secret value.
   *
   * @param secretId - Secret name or ARN
   * @returns Promise resolving to secret metadata
   * @throws {SecretsManagerError} On API or network errors
   *
   * @example
   * ```typescript
   * const metadata = await client.describeSecret('my-secret');
   * console.log('Rotation enabled:', metadata.rotationEnabled);
   * console.log('Tags:', metadata.tags);
   * ```
   */
  async describeSecret(secretId: string): Promise<SecretMetadata> {
    this.validateSecretId(secretId);

    const request: DescribeSecretRequest = {
      SecretId: secretId,
    };

    const response = await this.sendRequest<DescribeSecretResponse>(
      'DescribeSecret',
      request
    );

    return this.mapSecretMetadata(response);
  }

  /**
   * List secrets matching criteria.
   *
   * Lists secrets in the account, optionally filtered by name, tags, or other criteria.
   * Results are paginated; use nextToken to retrieve additional pages.
   *
   * @param options - List options including filters and pagination
   * @returns Promise resolving to list response with secrets and pagination token
   * @throws {SecretsManagerError} On API or network errors
   *
   * @example
   * ```typescript
   * // List all secrets
   * const response = await client.listSecrets();
   *
   * // List with filters
   * const prodSecrets = await client.listSecrets({
   *   filters: [
   *     { key: 'name', values: ['prod/'] },
   *     { key: 'tag-key', values: ['environment'] }
   *   ],
   *   maxResults: 50
   * });
   *
   * // Paginate through all results
   * let nextToken: string | undefined;
   * do {
   *   const response = await client.listSecrets({ nextToken, maxResults: 100 });
   *   for (const secret of response.secrets) {
   *     console.log(secret.name);
   *   }
   *   nextToken = response.nextToken;
   * } while (nextToken);
   * ```
   */
  async listSecrets(options: ListSecretsOptions = {}): Promise<ListSecretsResponse> {
    const request: ListSecretsRequest = {};

    if (options.maxResults !== undefined) {
      request.MaxResults = options.maxResults;
    }

    if (options.nextToken) {
      request.NextToken = options.nextToken;
    }

    if (options.filters && options.filters.length > 0) {
      request.Filters = options.filters.map((f) => ({
        Key: f.key,
        Values: f.values,
      }));
    }

    if (options.includePlannedDeletion !== undefined) {
      request.IncludePlannedDeletion = options.includePlannedDeletion;
    }

    const response = await this.sendRequest<ListSecretsApiResponse>(
      'ListSecrets',
      request
    );

    return {
      secrets: (response.SecretList || []).map((s) => this.mapSecretMetadata(s)),
      nextToken: response.NextToken,
    };
  }

  /**
   * Trigger secret rotation.
   *
   * Initiates rotation for a secret that has rotation configured.
   * The rotation Lambda function will be invoked to perform the rotation.
   *
   * @param secretId - Secret name or ARN
   * @param rotateImmediately - Whether to rotate immediately or wait for schedule
   * @returns Promise resolving to rotation result
   * @throws {SecretsManagerError} On API or network errors
   *
   * @example
   * ```typescript
   * // Trigger immediate rotation
   * const result = await client.rotateSecret('my-secret');
   * console.log('New version:', result.versionId);
   *
   * // Trigger rotation but let it follow the schedule
   * const result = await client.rotateSecret('my-secret', false);
   * ```
   */
  async rotateSecret(secretId: string, rotateImmediately: boolean = true): Promise<RotationResult> {
    this.validateSecretId(secretId);

    const request: RotateSecretRequest = {
      SecretId: secretId,
      RotateImmediately: rotateImmediately,
    };

    const response = await this.sendRequest<RotateSecretResponse>(
      'RotateSecret',
      request
    );

    return {
      arn: response.ARN,
      name: response.Name,
      versionId: response.VersionId,
    };
  }

  /**
   * Send a request to the Secrets Manager API.
   *
   * @template T - Response type
   * @param action - API action name
   * @param body - Request body
   * @returns Promise resolving to the parsed response
   * @throws {SecretsManagerError} On API or network errors
   */
  private async sendRequest<T>(action: string, body: unknown): Promise<T> {
    // Get fresh credentials
    const credentials = await this.getCredentials();

    const url = this.baseUrl;
    const bodyString = JSON.stringify(body);

    // Prepare headers
    const headers: Record<string, string> = {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `secretsmanager.${action}`,
      'user-agent': this.userAgent,
    };

    // Sign the request
    const signed = await signRequest(
      'POST',
      url,
      headers,
      bodyString,
      {
        region: this.config.region,
        service: 'secretsmanager',
        credentials,
      }
    );

    // Send the request
    let response;
    try {
      response = await this.transport.send({
        method: signed.method,
        url: signed.url,
        headers: signed.headers,
        body: signed.body,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw transportError(error.message, true);
      }
      throw transportError(String(error), true);
    }

    // Extract request ID from headers
    const requestId =
      response.headers['x-amzn-requestid'] || response.headers['x-amz-request-id'];

    // Handle error responses
    if (response.status >= 400) {
      throw mapHttpError(response.status, response.body, requestId);
    }

    // Handle empty responses
    if (!response.body || response.body.trim() === '') {
      return {} as T;
    }

    // Parse JSON response
    try {
      return JSON.parse(response.body) as T;
    } catch (error) {
      throw transportError(`Failed to parse response: ${error}`, false);
    }
  }

  /**
   * Get credentials, refreshing if necessary.
   */
  private async getCredentials(): Promise<AwsCredentials> {
    // Check if we need to refresh
    if (!this.credentials || this.config.credentialsProvider.isExpired()) {
      this.credentials = await this.config.credentialsProvider.getCredentials();
    }
    return this.credentials;
  }

  /**
   * Validate a secret ID.
   */
  private validateSecretId(secretId: string): void {
    if (!secretId || secretId.trim() === '') {
      throw validationError('Secret ID cannot be empty');
    }
  }

  /**
   * Map API response to SecretValue.
   */
  private mapSecretValue(response: GetSecretValueResponse): SecretValue {
    return {
      arn: response.ARN,
      name: response.Name,
      secretString: response.SecretString,
      secretBinary: response.SecretBinary,
      versionId: response.VersionId,
      versionStages: response.VersionStages as VersionStage[],
      createdDate: new Date(response.CreatedDate * 1000),
    };
  }

  /**
   * Map API response to SecretMetadata.
   */
  private mapSecretMetadata(response: DescribeSecretResponse): SecretMetadata {
    const tags: Record<string, string> = {};
    if (response.Tags) {
      for (const tag of response.Tags) {
        tags[tag.Key] = tag.Value;
      }
    }

    const versionIdsToStages: Record<string, VersionStage[]> | undefined =
      response.VersionIdsToStages
        ? Object.fromEntries(
            Object.entries(response.VersionIdsToStages).map(([k, v]) => [
              k,
              v as VersionStage[],
            ])
          )
        : undefined;

    return {
      arn: response.ARN,
      name: response.Name,
      description: response.Description,
      kmsKeyId: response.KmsKeyId,
      rotationEnabled: response.RotationEnabled ?? false,
      rotationLambdaArn: response.RotationLambdaARN,
      rotationRules: response.RotationRules
        ? {
            automaticallyAfterDays: response.RotationRules.AutomaticallyAfterDays,
            duration: response.RotationRules.Duration,
            scheduleExpression: response.RotationRules.ScheduleExpression,
          }
        : undefined,
      lastRotatedDate: response.LastRotatedDate
        ? new Date(response.LastRotatedDate * 1000)
        : undefined,
      lastAccessedDate: response.LastAccessedDate
        ? new Date(response.LastAccessedDate * 1000)
        : undefined,
      lastChangedDate: response.LastChangedDate
        ? new Date(response.LastChangedDate * 1000)
        : undefined,
      deletedDate: response.DeletedDate
        ? new Date(response.DeletedDate * 1000)
        : undefined,
      createdDate: new Date(response.CreatedDate * 1000),
      tags,
      versionIdsToStages,
      primaryRegion: response.PrimaryRegion,
      replicationStatus: response.ReplicationStatus?.map((r) => ({
        region: r.Region,
        kmsKeyId: r.KmsKeyId,
        status: r.Status as 'InSync' | 'Failed' | 'InProgress',
        statusMessage: r.StatusMessage,
        lastAccessedDate: r.LastAccessedDate
          ? new Date(r.LastAccessedDate * 1000)
          : undefined,
      })),
    };
  }

  /**
   * Create a new Secrets Manager client builder.
   *
   * @returns New configuration builder
   *
   * @example
   * ```typescript
   * const client = await SecretsManagerClient.builder()
   *   .region('us-east-1')
   *   .credentialsProvider(myProvider)
   *   .timeout(60000)
   *   .build();
   * ```
   */
  static builder(): SecretsManagerClientBuilder {
    return new SecretsManagerClientBuilder();
  }

  /**
   * Create a client from environment variables.
   *
   * Reads configuration from:
   * - AWS_REGION or AWS_DEFAULT_REGION
   * - AWS_ENDPOINT_URL_SECRETSMANAGER or AWS_ENDPOINT_URL
   * - Credentials from default credential chain
   *
   * @param credentialsProvider - Credentials provider to use
   * @returns New Secrets Manager client instance
   *
   * @example
   * ```typescript
   * const client = SecretsManagerClient.fromEnv(defaultProvider());
   * ```
   */
  static fromEnv(credentialsProvider: CredentialProvider): SecretsManagerClient {
    const configBuilder = new SecretsManagerConfigBuilder()
      .fromEnv()
      .credentialsProvider(credentialsProvider);

    const config = configBuilder.build();
    return new SecretsManagerClient(config);
  }
}

/**
 * Secrets Manager client builder.
 *
 * Provides a fluent API for constructing Secrets Manager clients.
 */
export class SecretsManagerClientBuilder {
  private configBuilder: SecretsManagerConfigBuilder;

  /**
   * Create a new client builder.
   */
  constructor() {
    this.configBuilder = new SecretsManagerConfigBuilder();
  }

  /**
   * Set the AWS region.
   *
   * @param region - AWS region code
   * @returns This builder for chaining
   */
  region(region: string): this {
    this.configBuilder.region(region);
    return this;
  }

  /**
   * Set a custom endpoint URL.
   *
   * @param endpoint - Endpoint URL
   * @returns This builder for chaining
   */
  endpoint(endpoint: string): this {
    this.configBuilder.endpoint(endpoint);
    return this;
  }

  /**
   * Set a custom credentials provider.
   *
   * @param provider - Credentials provider
   * @returns This builder for chaining
   */
  credentialsProvider(provider: CredentialProvider): this {
    this.configBuilder.credentialsProvider(provider);
    return this;
  }

  /**
   * Set request timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this.configBuilder.timeout(ms);
    return this;
  }

  /**
   * Set maximum retry attempts.
   *
   * @param n - Maximum retries
   * @returns This builder for chaining
   */
  maxRetries(n: number): this {
    this.configBuilder.maxRetries(n);
    return this;
  }

  /**
   * Load configuration from environment.
   *
   * @returns This builder for chaining
   */
  fromEnv(): this {
    this.configBuilder.fromEnv();
    return this;
  }

  /**
   * Build the Secrets Manager client.
   *
   * @returns New Secrets Manager client instance
   */
  build(): SecretsManagerClient {
    const config = this.configBuilder.build();
    return new SecretsManagerClient(config);
  }
}

/**
 * Create a new Secrets Manager client builder.
 *
 * @returns New client builder
 */
export function clientBuilder(): SecretsManagerClientBuilder {
  return new SecretsManagerClientBuilder();
}

/**
 * Create a Secrets Manager client from environment variables.
 *
 * @param credentialsProvider - Credentials provider to use
 * @returns New Secrets Manager client instance
 */
export function createClientFromEnv(credentialsProvider: CredentialProvider): SecretsManagerClient {
  return SecretsManagerClient.fromEnv(credentialsProvider);
}

/**
 * Create a Secrets Manager client with explicit configuration.
 *
 * @param config - Secrets Manager configuration
 * @returns New Secrets Manager client instance
 */
export function createClient(config: SecretsManagerConfig): SecretsManagerClient {
  return new SecretsManagerClient(config);
}
