/**
 * Authentication utilities for Slack.
 */

import * as crypto from 'crypto';

/**
 * Token types
 */
export type TokenType = 'bot' | 'user' | 'app';

/**
 * Detect token type from prefix
 */
export function detectTokenType(token: string): TokenType | undefined {
  if (token.startsWith('xoxb-')) return 'bot';
  if (token.startsWith('xoxp-')) return 'user';
  if (token.startsWith('xapp-')) return 'app';
  return undefined;
}

/**
 * Validate token format
 */
export function isValidToken(token: string): boolean {
  return detectTokenType(token) !== undefined;
}

/**
 * Mask token for logging
 */
export function maskToken(token: string): string {
  if (token.length <= 10) {
    return '***';
  }
  return `${token.substring(0, 5)}...${token.substring(token.length - 4)}`;
}

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes?: string[];
}

/**
 * OAuth token response
 */
export interface OAuthTokenResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    id: string;
    name: string;
  };
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
  error?: string;
}

/**
 * Generate OAuth authorization URL
 */
export function getOAuthUrl(config: OAuthConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: (config.scopes ?? []).join(','),
  });

  if (config.redirectUri) {
    params.set('redirect_uri', config.redirectUri);
  }

  if (state) {
    params.set('state', state);
  }

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchange code for token
 */
export async function exchangeCodeForToken(
  code: string,
  config: OAuthConfig
): Promise<OAuthTokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
  });

  if (config.redirectUri) {
    params.set('redirect_uri', config.redirectUri);
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  return response.json() as Promise<OAuthTokenResponse>;
}

/**
 * Verify Slack request signature
 */
export function verifySignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Check timestamp to prevent replay attacks (5 minutes)
  const requestTimestamp = parseInt(timestamp, 10);
  const currentTimestamp = Math.floor(Date.now() / 1000);

  if (Math.abs(currentTimestamp - requestTimestamp) > 300) {
    return false;
  }

  const sigBaseString = `v0:${timestamp}:${body}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBaseString)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Signature verifier class
 */
export class SignatureVerifier {
  private signingSecret: string;
  private maxTimestampAge: number;

  constructor(signingSecret: string, maxTimestampAge = 300) {
    this.signingSecret = signingSecret;
    this.maxTimestampAge = maxTimestampAge;
  }

  /**
   * Verify request signature
   */
  verify(signature: string, timestamp: string, body: string): boolean {
    return verifySignature(this.signingSecret, signature, timestamp, body);
  }

  /**
   * Verify request from headers
   */
  verifyRequest(headers: Record<string, string>, body: string): boolean {
    const signature = headers['x-slack-signature'];
    const timestamp = headers['x-slack-request-timestamp'];

    if (!signature || !timestamp) {
      return false;
    }

    return this.verify(signature, timestamp, body);
  }
}
