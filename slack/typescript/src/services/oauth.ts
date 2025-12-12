/**
 * OAuth service for Slack API.
 */

import { SlackClient } from '../client';
import { TeamId, UserId, SlackResponse } from '../types';

/**
 * OAuth v2 access token
 */
export interface OAuthV2AccessToken {
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: {
    id: TeamId;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
  authed_user: {
    id: UserId;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
}

/**
 * OAuth v2 access response
 */
export interface OAuthV2AccessResponse extends SlackResponse {
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: {
    id: TeamId;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
  authed_user: {
    id: UserId;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
}

/**
 * OAuth v2 exchange response
 */
export interface OAuthV2ExchangeResponse extends SlackResponse {
  access_token: string;
  token_type: string;
  scope: string;
  team: {
    id: TeamId;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
}

/**
 * OpenID Connect token response
 */
export interface OpenIdConnectTokenResponse extends SlackResponse {
  access_token: string;
  token_type: string;
  id_token: string;
}

/**
 * OpenID Connect user info
 */
export interface OpenIdConnectUserInfo extends SlackResponse {
  sub: string;
  'https://slack.com/team_id': string;
  'https://slack.com/user_id': string;
  email?: string;
  email_verified?: boolean;
  date_email_verified?: number;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  'https://slack.com/team_name'?: string;
  'https://slack.com/team_domain'?: string;
  'https://slack.com/user_image_24'?: string;
  'https://slack.com/user_image_32'?: string;
  'https://slack.com/user_image_48'?: string;
  'https://slack.com/user_image_72'?: string;
  'https://slack.com/user_image_192'?: string;
  'https://slack.com/user_image_512'?: string;
}

/**
 * OAuth service
 */
export class OAuthService {
  constructor(private client: SlackClient) {}

  /**
   * Exchange authorization code for access token (OAuth v2)
   */
  async v2Access(code: string, redirectUri?: string): Promise<OAuthV2AccessResponse> {
    const params: Record<string, string> = { code };
    if (redirectUri) {
      params.redirect_uri = redirectUri;
    }
    return this.client.post<OAuthV2AccessResponse>('oauth.v2.access', params);
  }

  /**
   * Exchange a legacy token for a new workspace token (OAuth v2)
   */
  async v2Exchange(clientId: string, clientSecret: string): Promise<OAuthV2ExchangeResponse> {
    return this.client.get<OAuthV2ExchangeResponse>('oauth.v2.exchange', {
      client_id: clientId,
      client_secret: clientSecret,
    });
  }

  /**
   * Get OpenID Connect token
   */
  async openIdConnectToken(code: string): Promise<OpenIdConnectTokenResponse> {
    return this.client.post<OpenIdConnectTokenResponse>('openid.connect.token', {
      code,
    });
  }

  /**
   * Get OpenID Connect user info
   */
  async openIdConnectUserInfo(): Promise<OpenIdConnectUserInfo> {
    return this.client.get<OpenIdConnectUserInfo>('openid.connect.userInfo');
  }
}
