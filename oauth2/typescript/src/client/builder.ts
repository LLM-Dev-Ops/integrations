/**
 * OAuth2 Client Builder
 *
 * Fluent builder for OAuth2 client configuration.
 */

import {
  OAuth2Config,
  ProviderConfig,
  ClientCredentials,
  ClientAuthMethod,
  DEFAULT_CONFIG,
} from "../types";
import { ConfigurationError } from "../error";
import { HttpTransport, FetchHttpTransport } from "../core/transport";
import { StateManager, InMemoryStateManager } from "../core/state";
import { PkceGenerator, DefaultPkceGenerator } from "../core/pkce";
import { DiscoveryClient, DefaultDiscoveryClient } from "../core/discovery";
import { TokenStorage, InMemoryTokenStorage } from "../token/storage";
import { OAuth2Client, OAuth2ClientImpl } from "./oauth2-client";
import { WellKnownProviders } from "./providers";

/**
 * OAuth2 configuration builder.
 */
export class OAuth2ConfigBuilder {
  private _provider?: ProviderConfig;
  private _clientId?: string;
  private _clientSecret?: string;
  private _authMethod?: ClientAuthMethod;
  private _defaultScopes?: string[];
  private _timeout?: number;
  private _refreshThreshold?: number;
  private _stateExpiration?: number;
  private _pkceVerifierLength?: number;

  /**
   * Set provider configuration.
   */
  provider(provider: ProviderConfig): this {
    this._provider = provider;
    return this;
  }

  /**
   * Set client ID.
   */
  clientId(clientId: string): this {
    this._clientId = clientId;
    return this;
  }

  /**
   * Set client secret.
   */
  clientSecret(clientSecret: string): this {
    this._clientSecret = clientSecret;
    return this;
  }

  /**
   * Set authentication method.
   */
  authMethod(method: ClientAuthMethod): this {
    this._authMethod = method;
    return this;
  }

  /**
   * Set default scopes.
   */
  scopes(scopes: string[]): this {
    this._defaultScopes = scopes;
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(timeout: number): this {
    this._timeout = timeout;
    return this;
  }

  /**
   * Set token refresh threshold in seconds.
   */
  refreshThreshold(seconds: number): this {
    this._refreshThreshold = seconds;
    return this;
  }

  /**
   * Set state expiration in seconds.
   */
  stateExpiration(seconds: number): this {
    this._stateExpiration = seconds;
    return this;
  }

  /**
   * Set PKCE verifier length.
   */
  pkceVerifierLength(length: number): this {
    this._pkceVerifierLength = length;
    return this;
  }

  /**
   * Build configuration.
   */
  build(): OAuth2Config {
    if (!this._provider) {
      throw new ConfigurationError(
        "Provider configuration is required",
        "MissingRequired"
      );
    }
    if (!this._clientId) {
      throw new ConfigurationError("Client ID is required", "MissingRequired");
    }

    return {
      provider: this._provider,
      credentials: {
        clientId: this._clientId,
        clientSecret: this._clientSecret,
        authMethod: this._authMethod ?? "client_secret_post",
      },
      defaultScopes: this._defaultScopes,
      timeout: this._timeout ?? DEFAULT_CONFIG.timeout,
      refreshThreshold: this._refreshThreshold ?? DEFAULT_CONFIG.refreshThreshold,
      stateExpiration: this._stateExpiration ?? DEFAULT_CONFIG.stateExpiration,
      pkceVerifierLength:
        this._pkceVerifierLength ?? DEFAULT_CONFIG.pkceVerifierLength,
    };
  }
}

/**
 * OAuth2 client builder with dependency injection.
 */
export class OAuth2ClientBuilder {
  private _config?: OAuth2Config;
  private _transport?: HttpTransport;
  private _stateManager?: StateManager;
  private _pkceGenerator?: PkceGenerator;
  private _tokenStorage?: TokenStorage;

  /**
   * Set configuration.
   */
  config(config: OAuth2Config): this {
    this._config = config;
    return this;
  }

  /**
   * Set custom HTTP transport.
   */
  transport(transport: HttpTransport): this {
    this._transport = transport;
    return this;
  }

  /**
   * Set custom state manager.
   */
  stateManager(stateManager: StateManager): this {
    this._stateManager = stateManager;
    return this;
  }

  /**
   * Set custom PKCE generator.
   */
  pkceGenerator(pkceGenerator: PkceGenerator): this {
    this._pkceGenerator = pkceGenerator;
    return this;
  }

  /**
   * Set custom token storage.
   */
  tokenStorage(tokenStorage: TokenStorage): this {
    this._tokenStorage = tokenStorage;
    return this;
  }

  /**
   * Build the OAuth2 client.
   */
  build(): OAuth2Client {
    if (!this._config) {
      throw new ConfigurationError(
        "Configuration is required",
        "MissingRequired"
      );
    }

    const transport =
      this._transport ?? new FetchHttpTransport({ timeout: this._config.timeout });
    const stateManager =
      this._stateManager ??
      new InMemoryStateManager({
        expirationSeconds: this._config.stateExpiration,
      });
    const pkceGenerator =
      this._pkceGenerator ??
      new DefaultPkceGenerator({
        verifierLength: this._config.pkceVerifierLength,
      });
    const tokenStorage = this._tokenStorage ?? new InMemoryTokenStorage();

    return new OAuth2ClientImpl(
      this._config,
      transport,
      stateManager,
      pkceGenerator,
      tokenStorage
    );
  }
}

/**
 * Create a new OAuth2 config builder.
 */
export function configBuilder(): OAuth2ConfigBuilder {
  return new OAuth2ConfigBuilder();
}

/**
 * Create a new OAuth2 client builder.
 */
export function clientBuilder(): OAuth2ClientBuilder {
  return new OAuth2ClientBuilder();
}

/**
 * Quick setup for Google OAuth2.
 */
export function forGoogle(
  clientId: string,
  clientSecret: string
): OAuth2ClientBuilder {
  const config = configBuilder()
    .provider(WellKnownProviders.google)
    .clientId(clientId)
    .clientSecret(clientSecret)
    .scopes(["openid", "profile", "email"])
    .build();

  return clientBuilder().config(config);
}

/**
 * Quick setup for GitHub OAuth2.
 */
export function forGitHub(
  clientId: string,
  clientSecret: string
): OAuth2ClientBuilder {
  const config = configBuilder()
    .provider(WellKnownProviders.github)
    .clientId(clientId)
    .clientSecret(clientSecret)
    .build();

  return clientBuilder().config(config);
}

/**
 * Quick setup for Microsoft OAuth2.
 */
export function forMicrosoft(
  clientId: string,
  clientSecret?: string,
  tenantId?: string
): OAuth2ClientBuilder {
  const provider = tenantId
    ? WellKnownProviders.createMicrosoftForTenant(tenantId)
    : WellKnownProviders.microsoft;

  const builder = configBuilder()
    .provider(provider)
    .clientId(clientId)
    .scopes(["openid", "profile", "email", "offline_access"]);

  if (clientSecret) {
    builder.clientSecret(clientSecret);
  }

  return clientBuilder().config(builder.build());
}

/**
 * Create client from OIDC discovery.
 */
export async function fromDiscovery(
  issuer: string,
  clientId: string,
  clientSecret?: string
): Promise<OAuth2Client> {
  const transport = new FetchHttpTransport();
  const discoveryClient = new DefaultDiscoveryClient(transport);

  const provider = await discoveryClient.getProviderConfig(issuer);

  const configBuilder_ = configBuilder()
    .provider(provider)
    .clientId(clientId);

  if (clientSecret) {
    configBuilder_.clientSecret(clientSecret);
  }

  return clientBuilder().config(configBuilder_.build()).build();
}
