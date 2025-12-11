/**
 * OAuth2 Client Implementation
 *
 * Main facade providing access to all OAuth2 flows and services.
 */

import { OAuth2Config } from "../types";
import { HttpTransport } from "../core/transport";
import { StateManager } from "../core/state";
import { PkceGenerator } from "../core/pkce";
import { TokenStorage } from "../token/storage";
import {
  AuthorizationCodeFlow,
  AuthorizationCodeFlowImpl,
} from "../flows/authorization-code";
import {
  AuthorizationCodePkceFlow,
  AuthorizationCodePkceFlowImpl,
} from "../flows/pkce";
import {
  ClientCredentialsFlow,
  ClientCredentialsFlowImpl,
  CachingClientCredentialsFlowImpl,
} from "../flows/client-credentials";
import {
  DeviceAuthorizationFlow,
  DeviceAuthorizationFlowImpl,
} from "../flows/device";
import {
  TokenManager,
  TokenManagerImpl,
} from "../token/manager";
import {
  TokenIntrospection,
  TokenIntrospectionImpl,
} from "../token/introspection";
import {
  TokenRevocation,
  TokenRevocationImpl,
} from "../token/revocation";

/**
 * OAuth2 client interface.
 */
export interface OAuth2Client {
  /**
   * Get authorization code flow handler.
   */
  authorizationCode(): AuthorizationCodeFlow;

  /**
   * Get PKCE-enhanced authorization code flow handler.
   */
  authorizationCodePkce(): AuthorizationCodePkceFlow;

  /**
   * Get client credentials flow handler.
   */
  clientCredentials(): ClientCredentialsFlow;

  /**
   * Get device authorization flow handler.
   */
  deviceAuthorization(): DeviceAuthorizationFlow;

  /**
   * Get token manager.
   */
  tokens(): TokenManager;

  /**
   * Get token introspection handler.
   */
  introspection(): TokenIntrospection;

  /**
   * Get token revocation handler.
   */
  revocation(): TokenRevocation;

  /**
   * Get configuration.
   */
  config(): OAuth2Config;
}

/**
 * OAuth2 client implementation with lazy service initialization.
 */
export class OAuth2ClientImpl implements OAuth2Client {
  private _config: OAuth2Config;
  private _transport: HttpTransport;
  private _stateManager: StateManager;
  private _pkceGenerator: PkceGenerator;
  private _tokenStorage: TokenStorage;

  // Lazy-initialized services
  private _authorizationCodeFlow?: AuthorizationCodeFlow;
  private _authorizationCodePkceFlow?: AuthorizationCodePkceFlow;
  private _clientCredentialsFlow?: ClientCredentialsFlow;
  private _deviceAuthorizationFlow?: DeviceAuthorizationFlow;
  private _tokenManager?: TokenManager;
  private _tokenIntrospection?: TokenIntrospection;
  private _tokenRevocation?: TokenRevocation;

  constructor(
    config: OAuth2Config,
    transport: HttpTransport,
    stateManager: StateManager,
    pkceGenerator: PkceGenerator,
    tokenStorage: TokenStorage
  ) {
    this._config = config;
    this._transport = transport;
    this._stateManager = stateManager;
    this._pkceGenerator = pkceGenerator;
    this._tokenStorage = tokenStorage;
  }

  authorizationCode(): AuthorizationCodeFlow {
    if (!this._authorizationCodeFlow) {
      this._authorizationCodeFlow = new AuthorizationCodeFlowImpl(
        this._config,
        this._transport,
        this._stateManager
      );
    }
    return this._authorizationCodeFlow;
  }

  authorizationCodePkce(): AuthorizationCodePkceFlow {
    if (!this._authorizationCodePkceFlow) {
      this._authorizationCodePkceFlow = new AuthorizationCodePkceFlowImpl(
        this._config,
        this._transport,
        this._stateManager,
        this._pkceGenerator
      );
    }
    return this._authorizationCodePkceFlow;
  }

  clientCredentials(): ClientCredentialsFlow {
    if (!this._clientCredentialsFlow) {
      const baseFlow = new ClientCredentialsFlowImpl(
        this._config,
        this._transport
      );
      this._clientCredentialsFlow = new CachingClientCredentialsFlowImpl(
        baseFlow,
        { refreshThresholdSeconds: this._config.refreshThreshold }
      );
    }
    return this._clientCredentialsFlow;
  }

  deviceAuthorization(): DeviceAuthorizationFlow {
    if (!this._deviceAuthorizationFlow) {
      this._deviceAuthorizationFlow = new DeviceAuthorizationFlowImpl(
        this._config,
        this._transport
      );
    }
    return this._deviceAuthorizationFlow;
  }

  tokens(): TokenManager {
    if (!this._tokenManager) {
      this._tokenManager = new TokenManagerImpl(
        this._config,
        this._transport,
        this._tokenStorage,
        { refreshThresholdSeconds: this._config.refreshThreshold }
      );
    }
    return this._tokenManager;
  }

  introspection(): TokenIntrospection {
    if (!this._tokenIntrospection) {
      this._tokenIntrospection = new TokenIntrospectionImpl(
        this._config,
        this._transport
      );
    }
    return this._tokenIntrospection;
  }

  revocation(): TokenRevocation {
    if (!this._tokenRevocation) {
      this._tokenRevocation = new TokenRevocationImpl(
        this._config,
        this._transport
      );
    }
    return this._tokenRevocation;
  }

  config(): OAuth2Config {
    return this._config;
  }
}

/**
 * Mock OAuth2 client for testing.
 */
export class MockOAuth2Client implements OAuth2Client {
  private _config: OAuth2Config;
  private _authorizationCodeFlow?: AuthorizationCodeFlow;
  private _authorizationCodePkceFlow?: AuthorizationCodePkceFlow;
  private _clientCredentialsFlow?: ClientCredentialsFlow;
  private _deviceAuthorizationFlow?: DeviceAuthorizationFlow;
  private _tokenManager?: TokenManager;
  private _tokenIntrospection?: TokenIntrospection;
  private _tokenRevocation?: TokenRevocation;

  constructor(config: OAuth2Config) {
    this._config = config;
  }

  /**
   * Set mock authorization code flow.
   */
  setAuthorizationCodeFlow(flow: AuthorizationCodeFlow): this {
    this._authorizationCodeFlow = flow;
    return this;
  }

  /**
   * Set mock authorization code PKCE flow.
   */
  setAuthorizationCodePkceFlow(flow: AuthorizationCodePkceFlow): this {
    this._authorizationCodePkceFlow = flow;
    return this;
  }

  /**
   * Set mock client credentials flow.
   */
  setClientCredentialsFlow(flow: ClientCredentialsFlow): this {
    this._clientCredentialsFlow = flow;
    return this;
  }

  /**
   * Set mock device authorization flow.
   */
  setDeviceAuthorizationFlow(flow: DeviceAuthorizationFlow): this {
    this._deviceAuthorizationFlow = flow;
    return this;
  }

  /**
   * Set mock token manager.
   */
  setTokenManager(manager: TokenManager): this {
    this._tokenManager = manager;
    return this;
  }

  /**
   * Set mock token introspection.
   */
  setTokenIntrospection(introspection: TokenIntrospection): this {
    this._tokenIntrospection = introspection;
    return this;
  }

  /**
   * Set mock token revocation.
   */
  setTokenRevocation(revocation: TokenRevocation): this {
    this._tokenRevocation = revocation;
    return this;
  }

  authorizationCode(): AuthorizationCodeFlow {
    if (!this._authorizationCodeFlow) {
      throw new Error("Mock authorization code flow not set");
    }
    return this._authorizationCodeFlow;
  }

  authorizationCodePkce(): AuthorizationCodePkceFlow {
    if (!this._authorizationCodePkceFlow) {
      throw new Error("Mock authorization code PKCE flow not set");
    }
    return this._authorizationCodePkceFlow;
  }

  clientCredentials(): ClientCredentialsFlow {
    if (!this._clientCredentialsFlow) {
      throw new Error("Mock client credentials flow not set");
    }
    return this._clientCredentialsFlow;
  }

  deviceAuthorization(): DeviceAuthorizationFlow {
    if (!this._deviceAuthorizationFlow) {
      throw new Error("Mock device authorization flow not set");
    }
    return this._deviceAuthorizationFlow;
  }

  tokens(): TokenManager {
    if (!this._tokenManager) {
      throw new Error("Mock token manager not set");
    }
    return this._tokenManager;
  }

  introspection(): TokenIntrospection {
    if (!this._tokenIntrospection) {
      throw new Error("Mock token introspection not set");
    }
    return this._tokenIntrospection;
  }

  revocation(): TokenRevocation {
    if (!this._tokenRevocation) {
      throw new Error("Mock token revocation not set");
    }
    return this._tokenRevocation;
  }

  config(): OAuth2Config {
    return this._config;
  }
}

/**
 * Create mock OAuth2 client for testing.
 */
export function createMockOAuth2Client(config: OAuth2Config): MockOAuth2Client {
  return new MockOAuth2Client(config);
}
