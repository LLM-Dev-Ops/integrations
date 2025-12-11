/**
 * Token Revocation
 *
 * RFC 7009 - OAuth 2.0 Token Revocation.
 */

import { RevocationParams, OAuth2Config } from "../types";
import { OAuth2Error, ProviderError, ConfigurationError } from "../error";
import { createErrorFromResponse } from "../error/mapping";
import { HttpTransport } from "../core/transport";

/**
 * Token revocation interface (for dependency injection).
 */
export interface TokenRevocation {
  /**
   * Revoke a token.
   */
  revoke(params: RevocationParams): Promise<void>;
}

/**
 * Token revocation implementation.
 */
export class TokenRevocationImpl implements TokenRevocation {
  private config: OAuth2Config;
  private transport: HttpTransport;

  constructor(config: OAuth2Config, transport: HttpTransport) {
    this.config = config;
    this.transport = transport;

    if (!config.provider.revocationEndpoint) {
      throw new ConfigurationError(
        "Revocation endpoint not configured",
        "MissingRequired"
      );
    }
  }

  async revoke(params: RevocationParams): Promise<void> {
    const body = new URLSearchParams();
    body.set("token", params.token);

    if (params.tokenTypeHint) {
      body.set("token_type_hint", params.tokenTypeHint);
    }

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    // Authentication
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
      url: this.config.provider.revocationEndpoint!,
      headers,
      body: body.toString(),
      timeout: this.config.timeout,
    });

    // RFC 7009: Server returns 200 even if token is invalid or already revoked
    if (response.status !== 200) {
      throw createErrorFromResponse(response.status, response.body);
    }
  }
}

/**
 * Mock token revocation for testing.
 */
export class MockTokenRevocation implements TokenRevocation {
  private revokeHistory: RevocationParams[] = [];
  private nextError?: OAuth2Error;

  /**
   * Set the next error to throw.
   */
  setNextError(error: OAuth2Error): this {
    this.nextError = error;
    return this;
  }

  /**
   * Get revoke history.
   */
  getRevokeHistory(): RevocationParams[] {
    return [...this.revokeHistory];
  }

  /**
   * Assert a token was revoked.
   */
  assertRevoked(token: string): void {
    const found = this.revokeHistory.find((r) => r.token === token);
    if (!found) {
      throw new Error(`Expected token to be revoked: ${token}`);
    }
  }

  async revoke(params: RevocationParams): Promise<void> {
    this.revokeHistory.push(params);

    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
  }
}

/**
 * Create mock token revocation for testing.
 */
export function createMockTokenRevocation(): MockTokenRevocation {
  return new MockTokenRevocation();
}
