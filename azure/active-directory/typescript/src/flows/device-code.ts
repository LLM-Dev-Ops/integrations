/**
 * Device Code Flow for Azure AD OAuth2.
 *
 * CLI and headless device authentication.
 */

import type { AccessToken, DeviceCodeResponse } from '../types/index.js';
import type { AzureAdConfig } from '../config.js';
import { networkError, fromOAuthError } from '../error.js';
import { TokenCache } from '../token/cache.js';

/**
 * Device code response from Azure AD.
 */
interface DeviceCodeResponseRaw {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
  error?: string;
  error_description?: string;
}

/**
 * Token response from Azure AD.
 */
interface TokenResponseRaw {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  correlation_id?: string;
}

/**
 * Initiate device code flow.
 */
export async function initiateDeviceCode(
  config: AzureAdConfig,
  scopes: string[],
  httpFetch: typeof fetch = fetch
): Promise<DeviceCodeResponse> {
  const deviceCodeEndpoint = `${config.authority}/${config.tenantId}/oauth2/v2.0/devicecode`;

  const params = new URLSearchParams();
  params.set('client_id', config.clientId);
  params.set('scope', scopes.join(' '));

  let response: Response;
  try {
    response = await httpFetch(deviceCodeEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (error) {
    throw networkError(error instanceof Error ? error : new Error(String(error)));
  }

  const data = await response.json() as DeviceCodeResponseRaw;

  if (data.error) {
    throw fromOAuthError(data.error, data.error_description ?? 'Unknown error');
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
    message: data.message,
  };
}

/**
 * Poll for device code token.
 */
export async function acquireTokenByDeviceCode(
  config: AzureAdConfig,
  deviceCode: string,
  interval: number,
  cache: TokenCache,
  httpFetch: typeof fetch = fetch
): Promise<AccessToken> {
  const tokenEndpoint = `${config.authority}/${config.tenantId}/oauth2/v2.0/token`;
  let pollInterval = interval * 1000; // Convert to ms

  const params = new URLSearchParams();
  params.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  params.set('client_id', config.clientId);
  params.set('device_code', deviceCode);

  while (true) {
    await sleep(pollInterval);

    let response: Response;
    try {
      response = await httpFetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
    } catch (error) {
      throw networkError(error instanceof Error ? error : new Error(String(error)));
    }

    const data = await response.json() as TokenResponseRaw;

    if (data.error) {
      if (data.error === 'authorization_pending') {
        // User hasn't completed login yet, keep polling
        continue;
      }
      if (data.error === 'slow_down') {
        // Increase polling interval
        pollInterval += 5000;
        continue;
      }
      // Other errors are fatal
      throw fromOAuthError(data.error, data.error_description ?? 'Unknown error', data.correlation_id);
    }

    // Success
    const scopes = data.scope ? data.scope.split(' ') : [];

    const token: AccessToken = {
      token: data.access_token,
      tokenType: data.token_type,
      expiresOn: new Date(Date.now() + data.expires_in * 1000),
      scopes,
      tenantId: config.tenantId,
    };

    // Cache token
    const cacheKey = TokenCache.buildKey(config.tenantId, config.clientId, 'device_code', scopes);
    cache.set(cacheKey, token);

    if (data.refresh_token) {
      cache.setRefreshToken(cacheKey, data.refresh_token);
    }

    return token;
  }
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
