/**
 * Types for simulation layer.
 */

/**
 * Serialized token request.
 */
export interface SerializedTokenRequest {
  grantType: string;
  clientId: string;
  scopes: string;
  flowType: string;
}

/**
 * Serialized token response.
 */
export interface SerializedTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  idToken?: string;
  scopes: string;
}

/**
 * Mock token template for replay.
 */
export interface MockTokenTemplate {
  accessToken: string;
  claims: Record<string, unknown>;
  expiresIn: number;
  scopes: string[];
}

/**
 * Recorded authentication interaction.
 */
export interface RecordedAuthInteraction {
  timestamp: string;
  flowType: string;
  request: SerializedTokenRequest;
  response: SerializedTokenResponse;
  mockToken: MockTokenTemplate;
  durationMs: number;
}
