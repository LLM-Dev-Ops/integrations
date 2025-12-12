/**
 * Team service for Slack API.
 */

import { SlackClient } from '../client';
import { TeamId, UserId, SlackResponse, IconUrls } from '../types';

/**
 * Team information
 */
export interface TeamInfo {
  id: TeamId;
  name: string;
  domain: string;
  email_domain: string;
  icon: IconUrls;
  enterprise_id?: string;
  enterprise_name?: string;
  avatar_base_url?: string;
  is_verified?: boolean;
}

/**
 * Team info response
 */
export interface TeamInfoResponse extends SlackResponse {
  team: TeamInfo;
}

/**
 * Access log entry
 */
export interface AccessLog {
  user_id: UserId;
  username: string;
  date_first: number;
  date_last: number;
  count: number;
  ip: string;
  user_agent: string;
  isp: string;
  country: string;
  region: string;
}

/**
 * Access logs parameters
 */
export interface AccessLogsParams {
  before?: number;
  count?: number;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Access logs response
 */
export interface AccessLogsResponse extends SlackResponse {
  logins: AccessLog[];
  paging: {
    count: number;
    total: number;
    page: number;
    pages: number;
  };
}

/**
 * Billable info for a user
 */
export interface BillableUserInfo {
  billing_active: boolean;
}

/**
 * Billable info response
 */
export interface BillableInfoResponse extends SlackResponse {
  billable_info: {
    [userId: string]: BillableUserInfo;
  };
}

/**
 * Integration log entry
 */
export interface IntegrationLog {
  service_id: string;
  service_type: string;
  user_id: UserId;
  user_name: string;
  channel: string;
  date: string;
  change_type: string;
  scope?: string;
  reason?: string;
  app_id?: string;
  app_type?: string;
}

/**
 * Integration logs parameters
 */
export interface IntegrationLogsParams {
  service_id?: string;
  app_id?: string;
  user?: UserId;
  change_type?: string;
  count?: number;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Integration logs response
 */
export interface IntegrationLogsResponse extends SlackResponse {
  logs: IntegrationLog[];
  paging: {
    count: number;
    total: number;
    page: number;
    pages: number;
  };
}

/**
 * Team service
 */
export class TeamService {
  constructor(private client: SlackClient) {}

  /**
   * Get team info
   */
  async info(): Promise<TeamInfo> {
    const response = await this.client.get<TeamInfoResponse>('team.info');
    return response.team;
  }

  /**
   * Get access logs
   */
  async accessLogs(params: AccessLogsParams = {}): Promise<AccessLogsResponse> {
    return this.client.get<AccessLogsResponse>('team.accessLogs', params);
  }

  /**
   * Get billable info
   */
  async billableInfo(): Promise<{ [userId: string]: BillableUserInfo }> {
    const response = await this.client.get<BillableInfoResponse>('team.billableInfo');
    return response.billable_info;
  }

  /**
   * Get integration logs
   */
  async integrationLogs(params: IntegrationLogsParams = {}): Promise<IntegrationLogsResponse> {
    return this.client.get<IntegrationLogsResponse>('team.integrationLogs', params);
  }
}
