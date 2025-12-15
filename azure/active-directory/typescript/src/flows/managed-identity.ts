/**
 * Managed Identity Flow for Azure AD.
 *
 * Zero-secret authentication for Azure workloads via IMDS.
 */

import type { AccessToken } from '../types/index.js';
import type { AzureAdConfig } from '../config.js';
import { managedIdentityUnavailable } from '../error.js';
import { TokenCache } from '../token/cache.js';

const IMDS_ENDPOINT = 'http://169.254.169.254/metadata/identity/oauth2/token';
const IMDS_API_VERSION = '2019-08-01';

/**
 * IMDS token response.
 */
interface ImdsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: string;
  expires_on: string;
  resource: string;
  error?: string;
  error_description?: string;
}

/**
 * Acquire token using managed identity.
 */
export async function acquireTokenManagedIdentity(
  config: AzureAdConfig,
  resource: string,
  cache: TokenCache,
  httpFetch: typeof fetch = fetch
): Promise<AccessToken> {
  // Build cache key
  const cacheKey = TokenCache.buildKey(config.tenantId, config.clientId, 'managed_identity', [resource]);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && !cache.needsRefresh(cached)) {
    return cached;
  }

  // Build IMDS request
  const url = new URL(IMDS_ENDPOINT);
  url.searchParams.set('api-version', IMDS_API_VERSION);
  url.searchParams.set('resource', resource);

  // Add client_id for user-assigned identity
  if (config.credential.type === 'managedIdentity' && config.credential.clientId) {
    url.searchParams.set('client_id', config.credential.clientId);
  }

  let response: Response;
  try {
    response = await httpFetch(url.toString(), {
      method: 'GET',
      headers: {
        'Metadata': 'true',
      },
    });
  } catch (error) {
    throw managedIdentityUnavailable(`IMDS not available: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    throw managedIdentityUnavailable(`IMDS returned status ${response.status}`);
  }

  const data = await response.json() as ImdsTokenResponse;

  if (data.error) {
    throw managedIdentityUnavailable(data.error_description ?? data.error);
  }

  const token: AccessToken = {
    token: data.access_token,
    tokenType: data.token_type,
    expiresOn: new Date(parseInt(data.expires_on, 10) * 1000),
    scopes: [resource],
    tenantId: config.tenantId,
  };

  // Cache token
  cache.set(cacheKey, token);

  return token;
}

/**
 * Check if managed identity is available.
 */
export async function isManagedIdentityAvailable(
  timeoutMs: number = 500,
  httpFetch: typeof fetch = fetch
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    await httpFetch(IMDS_ENDPOINT, {
      method: 'GET',
      headers: { 'Metadata': 'true' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}
