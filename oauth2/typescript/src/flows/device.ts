/**
 * Device Authorization Flow
 *
 * RFC 8628 - OAuth 2.0 Device Authorization Grant.
 */

import {
  DeviceCodeParams,
  DeviceAuthorizationResponse,
  DeviceTokenResult,
  TokenResponse,
  OAuth2Config,
} from "../types";
import { OAuth2Error, AuthorizationError, ProviderError, ConfigurationError } from "../error";
import { createErrorFromResponse, parseErrorResponse } from "../error/mapping";
import { HttpTransport } from "../core/transport";

/**
 * Device Authorization Flow interface.
 */
export interface DeviceAuthorizationFlow {
  /**
   * Request device and user codes.
   */
  requestDeviceCode(params?: DeviceCodeParams): Promise<DeviceAuthorizationResponse>;

  /**
   * Poll for token using device code.
   */
  pollToken(deviceCode: string): Promise<DeviceTokenResult>;

  /**
   * Await authorization by polling until success/failure/timeout.
   */
  awaitAuthorization(
    response: DeviceAuthorizationResponse,
    options?: { maxWaitSeconds?: number }
  ): Promise<TokenResponse>;
}

/**
 * Device Authorization Flow implementation.
 */
export class DeviceAuthorizationFlowImpl implements DeviceAuthorizationFlow {
  private config: OAuth2Config;
  private transport: HttpTransport;

  constructor(config: OAuth2Config, transport: HttpTransport) {
    this.config = config;
    this.transport = transport;

    // Validate device authorization endpoint exists
    if (!config.provider.deviceAuthorizationEndpoint) {
      throw new ConfigurationError(
        "Device authorization endpoint not configured",
        "MissingRequired"
      );
    }
  }

  async requestDeviceCode(params?: DeviceCodeParams): Promise<DeviceAuthorizationResponse> {
    const body = new URLSearchParams();
    body.set("client_id", this.config.credentials.clientId);

    // Scopes
    const scopes = params?.scopes ?? this.config.defaultScopes;
    if (scopes && scopes.length > 0) {
      body.set("scope", scopes.join(" "));
    }

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    const response = await this.transport.send({
      method: "POST",
      url: this.config.provider.deviceAuthorizationEndpoint!,
      headers,
      body: body.toString(),
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw createErrorFromResponse(response.status, response.body);
    }

    return this.parseDeviceAuthorizationResponse(response.body);
  }

  async pollToken(deviceCode: string): Promise<DeviceTokenResult> {
    const body = new URLSearchParams();
    body.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
    body.set("device_code", deviceCode);
    body.set("client_id", this.config.credentials.clientId);

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    // Add client secret if confidential client
    if (this.config.credentials.clientSecret) {
      if (this.config.credentials.authMethod === "client_secret_basic") {
        const credentials = Buffer.from(
          `${this.config.credentials.clientId}:${this.config.credentials.clientSecret}`
        ).toString("base64");
        headers["authorization"] = `Basic ${credentials}`;
      } else {
        body.set("client_secret", this.config.credentials.clientSecret);
      }
    }

    const response = await this.transport.send({
      method: "POST",
      url: this.config.provider.tokenEndpoint,
      headers,
      body: body.toString(),
      timeout: this.config.timeout,
    });

    // Success
    if (response.status === 200) {
      const tokens = this.parseTokenResponse(response.body);
      return { status: "success", tokens };
    }

    // Check for error response
    const errorResponse = parseErrorResponse(response.body);
    if (errorResponse) {
      switch (errorResponse.error) {
        case "authorization_pending":
          return { status: "pending" };
        case "slow_down":
          return { status: "slow_down", newInterval: 5 };
        case "expired_token":
          return { status: "expired" };
        case "access_denied":
          return { status: "access_denied" };
        default:
          throw createErrorFromResponse(response.status, response.body);
      }
    }

    throw createErrorFromResponse(response.status, response.body);
  }

  async awaitAuthorization(
    response: DeviceAuthorizationResponse,
    options?: { maxWaitSeconds?: number }
  ): Promise<TokenResponse> {
    const maxWait = (options?.maxWaitSeconds ?? 900) * 1000; // 15 minutes default
    const deadline = Math.min(
      Date.now() + response.expiresIn * 1000,
      Date.now() + maxWait
    );

    let interval = (response.interval ?? 5) * 1000;
    let consecutiveNetworkFailures = 0;
    const maxNetworkFailures = 5;

    while (Date.now() < deadline) {
      // Wait before polling
      await this.sleep(interval);

      try {
        const result = await this.pollToken(response.deviceCode);
        consecutiveNetworkFailures = 0; // Reset on success

        switch (result.status) {
          case "success":
            return result.tokens;

          case "pending":
            continue;

          case "slow_down":
            interval += result.newInterval * 1000;
            continue;

          case "expired":
            throw new AuthorizationError(
              "Device code expired",
              "DeviceCodeExpired"
            );

          case "access_denied":
            throw new AuthorizationError(
              "User denied authorization",
              "AccessDenied"
            );
        }
      } catch (error) {
        if (error instanceof AuthorizationError) {
          throw error;
        }

        // Network error - retry unless too many failures
        consecutiveNetworkFailures++;
        if (consecutiveNetworkFailures >= maxNetworkFailures) {
          throw error;
        }
        continue;
      }
    }

    throw new AuthorizationError("Device code expired", "DeviceCodeExpired");
  }

  private parseDeviceAuthorizationResponse(body: string): DeviceAuthorizationResponse {
    try {
      const data = JSON.parse(body);

      if (!data.device_code || !data.user_code || !data.verification_uri) {
        throw new ProviderError(
          "Invalid device authorization response",
          "InvalidRequest"
        );
      }

      return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        verificationUriComplete: data.verification_uri_complete,
        expiresIn: data.expires_in ?? 1800, // Default 30 minutes
        interval: data.interval ?? 5,
      };
    } catch (error) {
      if (error instanceof OAuth2Error) {
        throw error;
      }
      throw new ProviderError(
        "Invalid device authorization response",
        "InvalidRequest"
      );
    }
  }

  private parseTokenResponse(body: string): TokenResponse {
    try {
      const data = JSON.parse(body);

      if (!data.access_token) {
        throw new ProviderError("Missing access_token in response", "InvalidRequest");
      }

      return {
        accessToken: data.access_token,
        tokenType: data.token_type ?? "Bearer",
        expiresIn: data.expires_in,
        refreshToken: data.refresh_token,
        scope: data.scope,
        idToken: data.id_token,
      };
    } catch (error) {
      if (error instanceof OAuth2Error) {
        throw error;
      }
      throw new ProviderError("Invalid token response", "InvalidRequest");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Mock Device Authorization Flow for testing.
 */
export class MockDeviceAuthorizationFlow implements DeviceAuthorizationFlow {
  private requestDeviceCodeHistory: DeviceCodeParams[] = [];
  private pollHistory: string[] = [];
  private nextDeviceResponse?: DeviceAuthorizationResponse;
  private nextPollResult?: DeviceTokenResult;
  private pollCount: number = 0;
  private pollSuccessAfter: number = 3;

  /**
   * Set the next device authorization response.
   */
  setNextDeviceResponse(response: DeviceAuthorizationResponse): this {
    this.nextDeviceResponse = response;
    return this;
  }

  /**
   * Set the next poll result.
   */
  setNextPollResult(result: DeviceTokenResult): this {
    this.nextPollResult = result;
    return this;
  }

  /**
   * Set number of polls before success.
   */
  setPollSuccessAfter(count: number): this {
    this.pollSuccessAfter = count;
    return this;
  }

  /**
   * Get request device code history.
   */
  getRequestDeviceCodeHistory(): DeviceCodeParams[] {
    return [...this.requestDeviceCodeHistory];
  }

  /**
   * Get poll history.
   */
  getPollHistory(): string[] {
    return [...this.pollHistory];
  }

  async requestDeviceCode(params?: DeviceCodeParams): Promise<DeviceAuthorizationResponse> {
    this.requestDeviceCodeHistory.push(params ?? {});

    if (this.nextDeviceResponse) {
      const response = this.nextDeviceResponse;
      this.nextDeviceResponse = undefined;
      return response;
    }

    return {
      deviceCode: "mock-device-code",
      userCode: "MOCK-CODE",
      verificationUri: "https://mock.example.com/device",
      verificationUriComplete: "https://mock.example.com/device?user_code=MOCK-CODE",
      expiresIn: 1800,
      interval: 5,
    };
  }

  async pollToken(deviceCode: string): Promise<DeviceTokenResult> {
    this.pollHistory.push(deviceCode);
    this.pollCount++;

    if (this.nextPollResult) {
      const result = this.nextPollResult;
      this.nextPollResult = undefined;
      return result;
    }

    // Simulate pending until pollSuccessAfter polls
    if (this.pollCount < this.pollSuccessAfter) {
      return { status: "pending" };
    }

    return {
      status: "success",
      tokens: {
        accessToken: "mock-device-access-token",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshToken: "mock-device-refresh-token",
        scope: "openid profile",
      },
    };
  }

  async awaitAuthorization(
    response: DeviceAuthorizationResponse,
    _options?: { maxWaitSeconds?: number }
  ): Promise<TokenResponse> {
    // Simplified mock - just call pollToken once
    const result = await this.pollToken(response.deviceCode);
    if (result.status === "success") {
      return result.tokens;
    }
    throw new AuthorizationError("Mock authorization failed", "AccessDenied");
  }
}

/**
 * Create mock Device Authorization Flow for testing.
 */
export function createMockDeviceAuthorizationFlow(): MockDeviceAuthorizationFlow {
  return new MockDeviceAuthorizationFlow();
}
