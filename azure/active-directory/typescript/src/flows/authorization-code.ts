/**
 * Authorization Code Flow for Azure AD OAuth2.
 *
 * User authentication with PKCE (required per SPARC spec).
 */

import type { AccessToken, TokenResponse, AuthorizationUrl } from '../types/index.js';
import type { AzureAdConfig } from '../config.js';
import { generatePkce, generateState } from '../crypto/pkce.js';
import { networkError, fromOAuthError } from '../error.js';
import { TokenCache } from '../token/cache.js';

/**
 * Authorization code request parameters.
 */
export interface AuthCodeParams {
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge?: string;
  codeVerifier?: string;
  prompt?: 'login' | 'consent' | 'select_account' | 'none';
  loginHint?: string;
}

/**
 * Token response from Azure AD.
 */
interface TokenResponseRaw {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  correlation_id?: string;
}

/**
 * Generate authorization URL for user login.
 */
export function getAuthorizationUrl(
  config: AzureAdConfig,
  params: AuthCodeParams
): AuthorizationUrl {
  // Generate PKCE if not provided (PKCE is required)
  const pkce = params.codeChallenge
    ? { codeChallenge: params.codeChallenge, codeVerifier: params.codeVerifier! }
    : generatePkce();

  // Generate state if not provided
  const state = params.state ?? generateState();

  // Build URL
  const authorizeEndpoint = `${config.authority}/${config.tenantId}/oauth2/v2.0/authorize`;
  const url = new URL(authorizeEndpoint);

  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', pkce.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  if (params.prompt) {
    url.searchParams.set('prompt', params.prompt);
  }

  if (params.loginHint) {
    url.searchParams.set('login_hint', params.loginHint);
  }

  return {
    url: url.toString(),
    state,
    codeVerifier: pkce.codeVerifier,
  };
}

/**
 * Exchange authorization code for tokens.
 */
export async function acquireTokenByAuthCode(
  config: AzureAdConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string,
  cache: TokenCache,
  httpFetch: typeof fetch = fetch
): Promise<TokenResponse> {
  const tokenEndpoint = `${config.authority}/${config.tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('client_id', config.clientId);
  params.set('code', code);
  params.set('redirect_uri', redirectUri);
  params.set('code_verifier', codeVerifier);

  // Add client secret if configured
  if (config.credential.type === 'secret') {
    params.set('client_secret', config.credential.value);
  }

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
    throw fromOAuthError(data.error, data.error_description ?? 'Unknown error', data.correlation_id);
  }

  const scopes = data.scope ? data.scope.split(' ') : [];

  const accessToken: AccessToken = {
    token: data.access_token,
    tokenType: data.token_type,
    expiresOn: new Date(Date.now() + data.expires_in * 1000),
    scopes,
    tenantId: config.tenantId,
  };

  // Cache tokens
  const cacheKey = TokenCache.buildKey(config.tenantId, config.clientId, 'auth_code', scopes);
  cache.set(cacheKey, accessToken);

  if (data.refresh_token) {
    cache.setRefreshToken(cacheKey, data.refresh_token);
  }

  return {
    accessToken,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
  };
}
