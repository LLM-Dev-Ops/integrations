/**
 * Client Credentials Flow for Azure AD OAuth2.
 *
 * Service-to-service authentication using client secret or certificate.
 */

import type { AccessToken } from '../types/index.js';
import type { AzureAdConfig } from '../config.js';
import { invalidCredentials, networkError, fromOAuthError } from '../error.js';
import { TokenCache } from '../token/cache.js';
import { createClientAssertion } from '../crypto/jwt.js';

/**
 * Token response from Azure AD.
 */
interface TokenResponseRaw {
  access_token: string;
  token_type: string;
  expires_in: number;
  ext_expires_in?: number;
  error?: string;
  error_description?: string;
  correlation_id?: string;
}

/**
 * Execute client credentials flow.
 */
export async function acquireTokenClientCredentials(
  config: AzureAdConfig,
  scopes: string[],
  cache: TokenCache,
  httpFetch: typeof fetch = fetch
): Promise<AccessToken> {
  // Build cache key
  const cacheKey = TokenCache.buildKey(config.tenantId, config.clientId, 'client_credentials', scopes);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && !cache.needsRefresh(cached)) {
    return cached;
  }

  // Build token request
  const tokenEndpoint = `${config.authority}/${config.tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', config.clientId);
  params.set('scope', scopes.join(' '));

  // Add credentials based on type
  if (config.credential.type === 'secret') {
    params.set('client_secret', config.credential.value);
  } else if (config.credential.type === 'certificate') {
    // TODO: Implement certificate loading and assertion creation
    const assertion = createClientAssertionFromCert(config, tokenEndpoint);
    params.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    params.set('client_assertion', assertion);
  } else {
    throw invalidCredentials('Client credentials require secret or certificate');
  }

  // Execute request
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

  // Handle error response
  if (data.error) {
    throw fromOAuthError(data.error, data.error_description ?? 'Unknown error', data.correlation_id);
  }

  // Parse token
  const token: AccessToken = {
    token: data.access_token,
    tokenType: data.token_type,
    expiresOn: new Date(Date.now() + data.expires_in * 1000),
    scopes,
    tenantId: config.tenantId,
  };

  // Cache token
  cache.set(cacheKey, token);

  return token;
}

/**
 * Create client assertion from certificate.
 */
function createClientAssertionFromCert(config: AzureAdConfig, tokenEndpoint: string): string {
  if (config.credential.type !== 'certificate') {
    throw invalidCredentials('Certificate required');
  }

  // Parse certificate to extract private key and thumbprint
  // This is a simplified implementation - real implementation would parse PFX/PEM
  const certData = config.credential.certData;
  const privateKey = extractPrivateKey(certData, config.credential.password);
  const thumbprint = calculateThumbprint(certData);

  return createClientAssertion(tokenEndpoint, config.clientId, privateKey, thumbprint);
}

/**
 * Extract private key from certificate data.
 * Simplified - real implementation would handle PFX/PEM parsing.
 */
function extractPrivateKey(certData: Uint8Array, _password?: string): string {
  // Convert to string and check format
  const certStr = new TextDecoder().decode(certData);

  if (certStr.includes('-----BEGIN PRIVATE KEY-----')) {
    const match = certStr.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
    return match ? match[0] : '';
  }

  if (certStr.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    const match = certStr.match(/-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/);
    return match ? match[0] : '';
  }

  throw invalidCredentials('Unable to extract private key from certificate');
}

/**
 * Calculate certificate thumbprint.
 */
function calculateThumbprint(certData: Uint8Array): string {
  const { createHash } = require('crypto');
  return createHash('sha1').update(certData).digest('hex');
}
