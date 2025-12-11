/**
 * Token Introspection
 *
 * RFC 7662 - OAuth 2.0 Token Introspection.
 */

import {
  IntrospectionParams,
  IntrospectionResponse,
  OAuth2Config,
} from "../types";
import { OAuth2Error, ProviderError, ConfigurationError } from "../error";
import { createErrorFromResponse } from "../error/mapping";
import { HttpTransport } from "../core/transport";

/**
 * Token introspection interface (for dependency injection).
 */
export interface TokenIntrospection {
  /**
   * Introspect a token.
   */
  introspect(params: IntrospectionParams): Promise<IntrospectionResponse>;
}

/**
 * Token introspection implementation.
 */
export class TokenIntrospectionImpl implements TokenIntrospection {
  private config: OAuth2Config;
  private transport: HttpTransport;

  constructor(config: OAuth2Config, transport: HttpTransport) {
    this.config = config;
    this.transport = transport;

    if (!config.provider.introspectionEndpoint) {
      throw new ConfigurationError(
        "Introspection endpoint not configured",
        "MissingRequired"
      );
    }
  }

  async introspect(params: IntrospectionParams): Promise<IntrospectionResponse> {
    const body = new URLSearchParams();
    body.set("token", params.token);

    if (params.tokenTypeHint) {
      body.set("token_type_hint", params.tokenTypeHint);
    }

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    // Authentication (required for introspection)
    if (this.config.credentials.authMethod === "client_secret_basic" &&
        this.config.credentials.clientSecret) {
      const credentials = Buffer.from(
        `${this.config.credentials.clientId}:${this.config.credentials.clientSecret}`
      ).toString("base64");
      headers["authorization"] = `Basic ${credentials}`;
    } else {
      body.set("client_id", this.config.credentials.clientId);
      if (this.config.credentials.clientSecret) {
        body.set("client_secret", this.config.credentials.clientSecret);
      }
    }

    const response = await this.transport.send({
      method: "POST",
      url: this.config.provider.introspectionEndpoint!,
      headers,
      body: body.toString(),
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw createErrorFromResponse(response.status, response.body);
    }

    return this.parseIntrospectionResponse(response.body);
  }

  private parseIntrospectionResponse(body: string): IntrospectionResponse {
    try {
      const data = JSON.parse(body);

      // Extract standard fields
      const standardFields = [
        "active", "scope", "client_id", "username", "token_type",
        "exp", "iat", "nbf", "sub", "aud", "iss", "jti"
      ];

      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (!standardFields.includes(key)) {
          extra[key] = value;
        }
      }

      return {
        active: data.active ?? false,
        scope: data.scope,
        clientId: data.client_id,
        username: data.username,
        tokenType: data.token_type,
        exp: data.exp,
        iat: data.iat,
        nbf: data.nbf,
        sub: data.sub,
        aud: data.aud,
        iss: data.iss,
        jti: data.jti,
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      };
    } catch (error) {
      if (error instanceof OAuth2Error) {
        throw error;
      }
      throw new ProviderError("Invalid introspection response", "InvalidRequest");
    }
  }
}

/**
 * Mock token introspection for testing.
 */
export class MockTokenIntrospection implements TokenIntrospection {
  private introspectHistory: IntrospectionParams[] = [];
  private nextResponse?: IntrospectionResponse;
  private nextError?: OAuth2Error;

  /**
   * Set the next response to return.
   */
  setNextResponse(response: IntrospectionResponse): this {
    this.nextResponse = response;
    return this;
  }

  /**
   * Set the next error to throw.
   */
  setNextError(error: OAuth2Error): this {
    this.nextError = error;
    return this;
  }

  /**
   * Get introspect history.
   */
  getIntrospectHistory(): IntrospectionParams[] {
    return [...this.introspectHistory];
  }

  async introspect(params: IntrospectionParams): Promise<IntrospectionResponse> {
    this.introspectHistory.push(params);

    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }

    if (this.nextResponse) {
      const response = this.nextResponse;
      this.nextResponse = undefined;
      return response;
    }

    // Default mock response - active token
    return {
      active: true,
      scope: "openid profile email",
      clientId: "mock-client",
      username: "mock-user",
      tokenType: "Bearer",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      sub: "mock-subject",
    };
  }
}

/**
 * Create mock token introspection for testing.
 */
export function createMockTokenIntrospection(): MockTokenIntrospection {
  return new MockTokenIntrospection();
}
