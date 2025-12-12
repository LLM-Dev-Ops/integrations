/**
 * Apps service for Slack API.
 */

import { SlackClient } from '../client';
import { SlackResponse } from '../types';

/**
 * Connections open response
 */
export interface ConnectionsOpenResponse extends SlackResponse {
  url: string;
}

/**
 * Event authorization
 */
export interface EventAuthorization {
  enterprise_id?: string;
  team_id: string;
  user_id: string;
  is_bot: boolean;
  is_enterprise_install?: boolean;
}

/**
 * Event authorizations list response
 */
export interface EventAuthorizationsListResponse extends SlackResponse {
  authorizations: EventAuthorization[];
}

/**
 * Uninstall response
 */
export interface UninstallResponse extends SlackResponse {
  // Empty response on success
}

/**
 * Apps service
 */
export class AppsService {
  constructor(private client: SlackClient) {}

  /**
   * Open a connection to receive events
   */
  async connectionsOpen(): Promise<{ url: string }> {
    const response = await this.client.post<ConnectionsOpenResponse>(
      'apps.connections.open'
    );
    return { url: response.url };
  }

  /**
   * List authorizations for an event context
   */
  async eventAuthorizationsList(eventContext: string): Promise<EventAuthorization[]> {
    const response = await this.client.get<EventAuthorizationsListResponse>(
      'apps.event.authorizations.list',
      { event_context: eventContext }
    );
    return response.authorizations;
  }

  /**
   * Uninstall the app
   */
  async uninstall(): Promise<void> {
    await this.client.get<UninstallResponse>('apps.uninstall');
  }
}
