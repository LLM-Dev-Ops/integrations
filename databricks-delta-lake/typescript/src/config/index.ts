/**
 * Configuration management for the Databricks Delta Lake client.
 *
 * Supports multiple authentication methods:
 * - Personal Access Token (PAT)
 * - OAuth 2.0 (client credentials)
 * - Service Principal (Azure)
 * - Azure AD
 */

/**
 * Wrapper for sensitive values to prevent accidental logging
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Expose the secret value - use with caution
   */
  expose(): string {
    return this.value;
  }

  /**
   * Prevent accidental logging of secrets
   */
  toString(): string {
    return '***REDACTED***';
  }

  /**
   * Prevent accidental serialization of secrets
   */
  toJSON(): string {
    return '***REDACTED***';
  }
}

/**
 * Authentication configuration variants
 */
export type AuthConfig =
  | { type: 'personal_access_token'; token: SecretString }
  | {
      type: 'oauth';
      clientId: string;
      clientSecret: SecretString;
      scopes?: string[];
    }
  | {
      type: 'service_principal';
      tenantId: string;
      clientId: string;
      clientSecret: SecretString;
    }
  | {
      type: 'azure_ad';
      tenantId: string;
      clientId: string;
    };

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 500) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Whether to add random jitter to delays (default: true) */
  jitter: boolean;
}

/**
 * Resilience configuration
 */
export interface ResilienceConfig {
  /** Retry configuration */
  retry: RetryConfig;
  /** Circuit breaker failure threshold (default: 5) */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset timeout in seconds (default: 60) */
  circuitBreakerResetTimeout: number;
  /** Rate limit: requests per second (default: 100) */
  rateLimit: number;
}

/**
 * Configuration constants
 */
export const DEFAULTS = {
  /** Default workspace URL (should be overridden) */
  WORKSPACE_URL: '',
  /** Default SQL warehouse ID */
  WAREHOUSE_ID: undefined as string | undefined,
  /** Default catalog name */
  CATALOG: 'main',
  /** Default schema name */
  SCHEMA: 'default',
  /** Default request timeout in seconds */
  TIMEOUT_SECS: 30,
  /** Default rate limit (requests per second) */
  RATE_LIMIT: 100,
  /** Default maximum retry attempts */
  MAX_RETRIES: 3,
  /** Default base delay for retry backoff in milliseconds */
  BASE_DELAY_MS: 500,
  /** Default maximum delay for retry backoff in milliseconds */
  MAX_DELAY_MS: 30000,
  /** Default circuit breaker failure threshold */
  CIRCUIT_BREAKER_THRESHOLD: 5,
  /** Default circuit breaker reset timeout in seconds */
  CIRCUIT_BREAKER_RESET_TIMEOUT: 60,
  /** Default OAuth scopes */
  OAUTH_SCOPES: ['sql', 'offline_access'],
} as const;

/**
 * Configuration options for the Databricks client
 */
export interface DatabricksConfigOptions {
  /** Databricks workspace URL (required) */
  workspaceUrl: string;
  /** Authentication configuration (required) */
  auth: AuthConfig;
  /** Default SQL warehouse ID */
  warehouseId?: string;
  /** Default catalog name */
  catalog?: string;
  /** Default schema name */
  schema?: string;
  /** Request timeout in seconds */
  timeoutSecs?: number;
  /** Rate limit: requests per second */
  rateLimit?: number;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Resilience configuration (overrides individual settings) */
  resilience?: ResilienceConfig;
  /** Custom user agent suffix */
  userAgentSuffix?: string;
}

/**
 * Validated configuration for the Databricks client
 */
export class DatabricksConfig {
  readonly workspaceUrl: string;
  readonly auth: AuthConfig;
  readonly warehouseId?: string;
  readonly catalog: string;
  readonly schema: string;
  readonly timeoutSecs: number;
  readonly resilience: ResilienceConfig;
  readonly userAgentSuffix?: string;

  private constructor(
    options: Required<
      Omit<DatabricksConfigOptions, 'warehouseId' | 'userAgentSuffix'>
    > & Pick<DatabricksConfigOptions, 'warehouseId' | 'userAgentSuffix'>
  ) {
    this.workspaceUrl = options.workspaceUrl;
    this.auth = options.auth;
    this.warehouseId = options.warehouseId;
    this.catalog = options.catalog;
    this.schema = options.schema;
    this.timeoutSecs = options.timeoutSecs;
    this.resilience = options.resilience;
    this.userAgentSuffix = options.userAgentSuffix;
  }

  /**
   * Create configuration from options
   */
  static create(options: DatabricksConfigOptions): DatabricksConfig {
    // Build resilience config
    const resilience: ResilienceConfig = options.resilience ?? {
      retry: {
        maxRetries: options.maxRetries ?? DEFAULTS.MAX_RETRIES,
        baseDelayMs: DEFAULTS.BASE_DELAY_MS,
        maxDelayMs: DEFAULTS.MAX_DELAY_MS,
        jitter: true,
      },
      circuitBreakerThreshold: DEFAULTS.CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerResetTimeout: DEFAULTS.CIRCUIT_BREAKER_RESET_TIMEOUT,
      rateLimit: options.rateLimit ?? DEFAULTS.RATE_LIMIT,
    };

    const config = new DatabricksConfig({
      workspaceUrl: options.workspaceUrl,
      auth: options.auth,
      warehouseId: options.warehouseId,
      catalog: options.catalog ?? DEFAULTS.CATALOG,
      schema: options.schema ?? DEFAULTS.SCHEMA,
      timeoutSecs: options.timeoutSecs ?? DEFAULTS.TIMEOUT_SECS,
      resilience,
      userAgentSuffix: options.userAgentSuffix,
    });

    config.validate();
    return config;
  }

  /**
   * Create configuration from environment variables
   */
  static fromEnv(): DatabricksConfig {
    const workspaceUrl = process.env['DATABRICKS_HOST'];
    if (!workspaceUrl) {
      throw new Error(
        'DATABRICKS_HOST environment variable is required'
      );
    }

    // Determine authentication method from environment variables
    const auth = DatabricksConfig.detectAuthFromEnv();

    return DatabricksConfig.create({
      workspaceUrl,
      auth,
      warehouseId: process.env['DATABRICKS_WAREHOUSE_ID'],
      catalog: process.env['DATABRICKS_CATALOG'],
      schema: process.env['DATABRICKS_SCHEMA'],
      timeoutSecs: process.env['DATABRICKS_TIMEOUT_SECS']
        ? parseInt(process.env['DATABRICKS_TIMEOUT_SECS'], 10)
        : undefined,
      rateLimit: process.env['DATABRICKS_RATE_LIMIT']
        ? parseInt(process.env['DATABRICKS_RATE_LIMIT'], 10)
        : undefined,
      maxRetries: process.env['DATABRICKS_MAX_RETRIES']
        ? parseInt(process.env['DATABRICKS_MAX_RETRIES'], 10)
        : undefined,
    });
  }

  /**
   * Detect authentication configuration from environment variables
   */
  private static detectAuthFromEnv(): AuthConfig {
    // Priority order:
    // 1. OAuth (DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET)
    // 2. Service Principal (AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET)
    // 3. Azure AD (AZURE_TENANT_ID + AZURE_CLIENT_ID)
    // 4. Personal Access Token (DATABRICKS_TOKEN)

    const databricksClientId = process.env['DATABRICKS_CLIENT_ID'];
    const databricksClientSecret = process.env['DATABRICKS_CLIENT_SECRET'];
    const azureTenantId = process.env['AZURE_TENANT_ID'];
    const azureClientId = process.env['AZURE_CLIENT_ID'];
    const azureClientSecret = process.env['AZURE_CLIENT_SECRET'];
    const databricksToken = process.env['DATABRICKS_TOKEN'];

    // OAuth (Databricks M2M)
    if (databricksClientId && databricksClientSecret) {
      return {
        type: 'oauth',
        clientId: databricksClientId,
        clientSecret: new SecretString(databricksClientSecret),
        scopes: DEFAULTS.OAUTH_SCOPES,
      };
    }

    // Service Principal (Azure)
    if (azureTenantId && azureClientId && azureClientSecret) {
      return {
        type: 'service_principal',
        tenantId: azureTenantId,
        clientId: azureClientId,
        clientSecret: new SecretString(azureClientSecret),
      };
    }

    // Azure AD
    if (azureTenantId && azureClientId) {
      return {
        type: 'azure_ad',
        tenantId: azureTenantId,
        clientId: azureClientId,
      };
    }

    // Personal Access Token
    if (databricksToken) {
      return {
        type: 'personal_access_token',
        token: new SecretString(databricksToken),
      };
    }

    throw new Error(
      'No valid authentication credentials found in environment variables. ' +
        'Please set one of: ' +
        'DATABRICKS_TOKEN, ' +
        'DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET, ' +
        'AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET, ' +
        'or AZURE_TENANT_ID + AZURE_CLIENT_ID'
    );
  }

  /**
   * Validate the configuration
   */
  validate(): void {
    // Validate workspace URL
    if (!this.workspaceUrl || this.workspaceUrl.trim() === '') {
      throw new Error('Workspace URL is required');
    }

    try {
      const url = new URL(this.workspaceUrl);
      if (!url.protocol.startsWith('https')) {
        throw new Error('Workspace URL must use HTTPS protocol');
      }
    } catch (error) {
      throw new Error(
        `Invalid workspace URL: ${this.workspaceUrl} - ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Validate authentication
    this.validateAuth();

    // Validate catalog and schema
    if (!this.catalog || this.catalog.trim() === '') {
      throw new Error('Catalog name is required');
    }
    if (!this.schema || this.schema.trim() === '') {
      throw new Error('Schema name is required');
    }

    // Validate timeout
    if (this.timeoutSecs <= 0) {
      throw new Error('Timeout must be positive');
    }

    // Validate resilience config
    if (this.resilience.retry.maxRetries < 0) {
      throw new Error('Max retries must be non-negative');
    }
    if (this.resilience.retry.baseDelayMs <= 0) {
      throw new Error('Base delay must be positive');
    }
    if (this.resilience.retry.maxDelayMs <= 0) {
      throw new Error('Max delay must be positive');
    }
    if (this.resilience.circuitBreakerThreshold <= 0) {
      throw new Error('Circuit breaker threshold must be positive');
    }
    if (this.resilience.circuitBreakerResetTimeout <= 0) {
      throw new Error('Circuit breaker reset timeout must be positive');
    }
    if (this.resilience.rateLimit <= 0) {
      throw new Error('Rate limit must be positive');
    }
  }

  /**
   * Validate authentication configuration
   */
  private validateAuth(): void {
    switch (this.auth.type) {
      case 'personal_access_token':
        if (!this.auth.token.expose() || this.auth.token.expose().trim() === '') {
          throw new Error('Personal access token is required');
        }
        if (this.auth.token.expose().length < 10) {
          throw new Error('Personal access token appears to be invalid (too short)');
        }
        break;

      case 'oauth':
        if (!this.auth.clientId || this.auth.clientId.trim() === '') {
          throw new Error('OAuth client ID is required');
        }
        if (!this.auth.clientSecret.expose() || this.auth.clientSecret.expose().trim() === '') {
          throw new Error('OAuth client secret is required');
        }
        if (this.auth.scopes && this.auth.scopes.length === 0) {
          throw new Error('OAuth scopes cannot be empty');
        }
        break;

      case 'service_principal':
        if (!this.auth.tenantId || this.auth.tenantId.trim() === '') {
          throw new Error('Service principal tenant ID is required');
        }
        if (!this.auth.clientId || this.auth.clientId.trim() === '') {
          throw new Error('Service principal client ID is required');
        }
        if (!this.auth.clientSecret.expose() || this.auth.clientSecret.expose().trim() === '') {
          throw new Error('Service principal client secret is required');
        }
        // Validate GUID format for Azure tenant ID
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!guidRegex.test(this.auth.tenantId)) {
          throw new Error('Service principal tenant ID must be a valid GUID');
        }
        break;

      case 'azure_ad':
        if (!this.auth.tenantId || this.auth.tenantId.trim() === '') {
          throw new Error('Azure AD tenant ID is required');
        }
        if (!this.auth.clientId || this.auth.clientId.trim() === '') {
          throw new Error('Azure AD client ID is required');
        }
        break;

      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = this.auth;
        throw new Error(`Unknown authentication type: ${JSON.stringify(_exhaustive)}`);
    }
  }

  /**
   * Build full API endpoint URL
   */
  buildUrl(path: string): string {
    const base = this.workspaceUrl.endsWith('/')
      ? this.workspaceUrl.slice(0, -1)
      : this.workspaceUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}/api/2.1${cleanPath}`;
  }

  /**
   * Get fully qualified table name
   */
  getTableName(table: string, schema?: string, catalog?: string): string {
    const actualCatalog = catalog ?? this.catalog;
    const actualSchema = schema ?? this.schema;
    return `${actualCatalog}.${actualSchema}.${table}`;
  }

  /**
   * Get user agent string
   */
  getUserAgent(): string {
    let ua = 'databricks-delta-lake-typescript/0.1.0';
    if (this.userAgentSuffix) {
      ua += ` ${this.userAgentSuffix}`;
    }
    return ua;
  }

  /**
   * Get timeout in milliseconds
   */
  getTimeoutMs(): number {
    return this.timeoutSecs * 1000;
  }

  /**
   * Create a masked copy of config for logging (secrets redacted)
   */
  toLoggable(): Record<string, unknown> {
    return {
      workspaceUrl: this.workspaceUrl,
      authType: this.auth.type,
      warehouseId: this.warehouseId,
      catalog: this.catalog,
      schema: this.schema,
      timeoutSecs: this.timeoutSecs,
      resilience: this.resilience,
    };
  }
}

/**
 * Builder for creating configuration with fluent API
 */
export class DatabricksConfigBuilder {
  private options: Partial<DatabricksConfigOptions> = {};

  /**
   * Set the workspace URL
   */
  workspaceUrl(url: string): this {
    this.options.workspaceUrl = url;
    return this;
  }

  /**
   * Set authentication to use Personal Access Token
   */
  withPersonalAccessToken(token: string): this {
    this.options.auth = {
      type: 'personal_access_token',
      token: new SecretString(token),
    };
    return this;
  }

  /**
   * Set authentication to use OAuth 2.0
   */
  withOAuth(
    clientId: string,
    clientSecret: string,
    scopes?: string[]
  ): this {
    this.options.auth = {
      type: 'oauth',
      clientId,
      clientSecret: new SecretString(clientSecret),
      scopes: scopes ?? DEFAULTS.OAUTH_SCOPES,
    };
    return this;
  }

  /**
   * Set authentication to use Service Principal
   */
  withServicePrincipal(
    tenantId: string,
    clientId: string,
    clientSecret: string
  ): this {
    this.options.auth = {
      type: 'service_principal',
      tenantId,
      clientId,
      clientSecret: new SecretString(clientSecret),
    };
    return this;
  }

  /**
   * Set authentication to use Azure AD
   */
  withAzureAD(tenantId: string, clientId: string): this {
    this.options.auth = {
      type: 'azure_ad',
      tenantId,
      clientId,
    };
    return this;
  }

  /**
   * Set the default SQL warehouse ID
   */
  warehouseId(id: string): this {
    this.options.warehouseId = id;
    return this;
  }

  /**
   * Set the default catalog
   */
  catalog(name: string): this {
    this.options.catalog = name;
    return this;
  }

  /**
   * Set the default schema
   */
  schema(name: string): this {
    this.options.schema = name;
    return this;
  }

  /**
   * Set the request timeout in seconds
   */
  timeoutSecs(seconds: number): this {
    this.options.timeoutSecs = seconds;
    return this;
  }

  /**
   * Set the rate limit (requests per second)
   */
  rateLimit(rps: number): this {
    this.options.rateLimit = rps;
    return this;
  }

  /**
   * Set the maximum number of retries
   */
  maxRetries(count: number): this {
    this.options.maxRetries = count;
    return this;
  }

  /**
   * Set the resilience configuration
   */
  resilience(config: ResilienceConfig): this {
    this.options.resilience = config;
    return this;
  }

  /**
   * Set a custom user agent suffix
   */
  userAgentSuffix(suffix: string): this {
    this.options.userAgentSuffix = suffix;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): DatabricksConfig {
    if (!this.options.workspaceUrl) {
      throw new Error('Workspace URL is required');
    }
    if (!this.options.auth) {
      throw new Error('Authentication configuration is required');
    }
    return DatabricksConfig.create(this.options as DatabricksConfigOptions);
  }
}
