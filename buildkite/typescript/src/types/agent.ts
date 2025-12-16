/**
 * Buildkite agent types.
 *
 * @module types/agent
 */

import type { Creator } from './build.js';

/**
 * Agent connection state.
 */
export enum ConnectionState {
  /** Agent is connected. */
  Connected = 'connected',
  /** Agent is disconnected. */
  Disconnected = 'disconnected',
  /** Agent connection was lost. */
  Lost = 'lost',
  /** Agent never connected. */
  NeverConnected = 'never_connected',
  /** Agent is stopped. */
  Stopped = 'stopped',
  /** Agent is stopping. */
  Stopping = 'stopping',
}

/**
 * Job reference in agent.
 */
export interface JobRef {
  /** Job ID. */
  readonly id: string;
  /** Job type. */
  readonly type: string;
  /** Job state. */
  readonly state: string;
}

/**
 * Buildkite agent.
 */
export interface Agent {
  /** Agent ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Agent name. */
  readonly name: string;
  /** Connection state. */
  readonly connection_state: ConnectionState;
  /** Hostname. */
  readonly hostname: string;
  /** IP address. */
  readonly ip_address: string;
  /** User agent string. */
  readonly user_agent: string;
  /** Agent version. */
  readonly version: string;
  /** Creator information. */
  readonly creator?: Creator;
  /** Creation time. */
  readonly created_at: string;
  /** Last job finish time. */
  readonly last_job_finished_at?: string;
  /** Agent priority. */
  readonly priority: number;
  /** Agent metadata tags. */
  readonly meta_data: string[];
  /** Current job. */
  readonly job?: JobRef;
}

/**
 * Options for listing agents.
 */
export interface ListAgentsOptions {
  /** Filter by agent name. */
  name?: string;
  /** Filter by hostname. */
  hostname?: string;
  /** Filter by version. */
  version?: string;
  /** Results per page. */
  per_page?: number;
  /** Page number. */
  page?: number;
}
