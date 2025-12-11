/**
 * OAuth2 Device Authorization Types
 *
 * Types for device authorization flow (RFC 8628).
 */

/**
 * Device authorization request parameters.
 */
export interface DeviceCodeParams {
  /** Requested scopes */
  scopes?: string[];
}

/**
 * Device authorization response (RFC 8628 Section 3.2).
 */
export interface DeviceAuthorizationResponse {
  /** Device verification code */
  deviceCode: string;
  /** User verification code to display */
  userCode: string;
  /** Verification URI for user to visit */
  verificationUri: string;
  /** Optional complete URI with user_code embedded */
  verificationUriComplete?: string;
  /** Lifetime of device_code in seconds */
  expiresIn: number;
  /** Minimum polling interval in seconds */
  interval?: number;
}

/**
 * Device token polling result.
 */
export type DeviceTokenResult =
  | { status: "success"; tokens: import("./token").TokenResponse }
  | { status: "pending" }
  | { status: "slow_down"; newInterval: number }
  | { status: "expired" }
  | { status: "access_denied" };

/**
 * Check if device polling should continue.
 */
export function shouldContinuePolling(result: DeviceTokenResult): boolean {
  return result.status === "pending" || result.status === "slow_down";
}

/**
 * Check if device authorization succeeded.
 */
export function isDeviceAuthSuccess(
  result: DeviceTokenResult
): result is { status: "success"; tokens: import("./token").TokenResponse } {
  return result.status === "success";
}
