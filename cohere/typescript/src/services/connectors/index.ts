/**
 * Connectors service module.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { ApiMeta } from '../../types';

/**
 * OAuth configuration for connectors
 */
export interface ConnectorOAuth {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  scope?: string;
}

/**
 * Connector authentication type
 */
export type ConnectorAuthType = 'oauth' | 'service_auth' | 'none';

/**
 * Connector information
 */
export interface Connector {
  /** Connector ID */
  id: string;
  /** Connector name */
  name: string;
  /** Description */
  description?: string;
  /** Connector URL */
  url: string;
  /** Organization ID */
  organizationId?: string;
  /** Authentication type */
  authType?: ConnectorAuthType;
  /** OAuth configuration */
  oauth?: ConnectorOAuth;
  /** Whether connector is active */
  active?: boolean;
  /** Continue on failure */
  continueOnFailure?: boolean;
  /** Excluded document fields */
  excludes?: string[];
  /** Creation time */
  createdAt?: string;
  /** Update time */
  updatedAt?: string;
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Create connector request
 */
export interface CreateConnectorRequest {
  /** Connector name */
  name: string;
  /** Connector URL */
  url: string;
  /** Description */
  description?: string;
  /** OAuth configuration */
  oauth?: ConnectorOAuth;
  /** Whether connector is active */
  active?: boolean;
  /** Continue on failure */
  continueOnFailure?: boolean;
  /** Excluded document fields */
  excludes?: string[];
  /** Service authentication token */
  serviceAuth?: string;
}

/**
 * Update connector request
 */
export interface UpdateConnectorRequest {
  /** Connector name */
  name?: string;
  /** Connector URL */
  url?: string;
  /** Description */
  description?: string;
  /** OAuth configuration */
  oauth?: ConnectorOAuth;
  /** Whether connector is active */
  active?: boolean;
  /** Continue on failure */
  continueOnFailure?: boolean;
  /** Excluded document fields */
  excludes?: string[];
}

/**
 * List connectors response
 */
export interface ListConnectorsResponse {
  connectors: Connector[];
}

/**
 * Connectors service interface
 */
export interface ConnectorsService {
  /**
   * Create a new connector
   */
  create(request: CreateConnectorRequest): Promise<Connector>;

  /**
   * Get a connector by ID
   */
  get(connectorId: string): Promise<Connector>;

  /**
   * List all connectors
   */
  list(): Promise<ListConnectorsResponse>;

  /**
   * Update a connector
   */
  update(connectorId: string, request: UpdateConnectorRequest): Promise<Connector>;

  /**
   * Delete a connector
   */
  delete(connectorId: string): Promise<void>;
}

/**
 * Connectors service implementation
 */
export class ConnectorsServiceImpl implements ConnectorsService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Create a new connector
   */
  async create(request: CreateConnectorRequest): Promise<Connector> {
    this.validateCreateRequest(request);

    const url = this.config.buildUrl('/connectors');
    const body: Record<string, unknown> = {
      name: request.name,
      url: request.url,
    };

    if (request.description) body['description'] = request.description;
    if (request.oauth) body['oauth'] = this.buildOAuthBody(request.oauth);
    if (request.active !== undefined) body['active'] = request.active;
    if (request.continueOnFailure !== undefined) body['continue_on_failure'] = request.continueOnFailure;
    if (request.excludes) body['excludes'] = request.excludes;
    if (request.serviceAuth) body['service_auth'] = { token: request.serviceAuth };

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseConnector(response.body as Record<string, unknown>);
  }

  /**
   * Get a connector by ID
   */
  async get(connectorId: string): Promise<Connector> {
    if (!connectorId || connectorId.trim() === '') {
      throw new ValidationError('Connector ID is required', [
        { field: 'connectorId', message: 'Connector ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/connectors/${connectorId}`);
    const response = await this.transport.send('GET', url, {});
    return this.parseConnector(response.body as Record<string, unknown>);
  }

  /**
   * List all connectors
   */
  async list(): Promise<ListConnectorsResponse> {
    const url = this.config.buildUrl('/connectors');
    const response = await this.transport.send('GET', url, {});
    const data = response.body as Record<string, unknown>;

    const connectors = Array.isArray(data['connectors'])
      ? data['connectors'].map((c: Record<string, unknown>) => this.parseConnector(c))
      : [];

    return { connectors };
  }

  /**
   * Update a connector
   */
  async update(connectorId: string, request: UpdateConnectorRequest): Promise<Connector> {
    if (!connectorId || connectorId.trim() === '') {
      throw new ValidationError('Connector ID is required', [
        { field: 'connectorId', message: 'Connector ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/connectors/${connectorId}`);
    const body: Record<string, unknown> = {};

    if (request.name) body['name'] = request.name;
    if (request.url) body['url'] = request.url;
    if (request.description !== undefined) body['description'] = request.description;
    if (request.oauth) body['oauth'] = this.buildOAuthBody(request.oauth);
    if (request.active !== undefined) body['active'] = request.active;
    if (request.continueOnFailure !== undefined) body['continue_on_failure'] = request.continueOnFailure;
    if (request.excludes !== undefined) body['excludes'] = request.excludes;

    const response = await this.transport.send('PATCH', url, {}, body);
    return this.parseConnector(response.body as Record<string, unknown>);
  }

  /**
   * Delete a connector
   */
  async delete(connectorId: string): Promise<void> {
    if (!connectorId || connectorId.trim() === '') {
      throw new ValidationError('Connector ID is required', [
        { field: 'connectorId', message: 'Connector ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/connectors/${connectorId}`);
    await this.transport.send('DELETE', url, {});
  }

  private validateCreateRequest(request: CreateConnectorRequest): void {
    if (!request.name || request.name.trim() === '') {
      throw new ValidationError('Name is required', [
        { field: 'name', message: 'Connector name is required', code: 'REQUIRED' },
      ]);
    }

    if (!request.url || request.url.trim() === '') {
      throw new ValidationError('URL is required', [
        { field: 'url', message: 'Connector URL is required', code: 'REQUIRED' },
      ]);
    }

    try {
      new URL(request.url);
    } catch {
      throw new ValidationError('Invalid URL', [
        { field: 'url', message: 'URL must be a valid URL', code: 'INVALID_FORMAT' },
      ]);
    }
  }

  private buildOAuthBody(oauth: ConnectorOAuth): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (oauth.clientId) body['client_id'] = oauth.clientId;
    if (oauth.clientSecret) body['client_secret'] = oauth.clientSecret;
    if (oauth.authorizeUrl) body['authorize_url'] = oauth.authorizeUrl;
    if (oauth.tokenUrl) body['token_url'] = oauth.tokenUrl;
    if (oauth.scope) body['scope'] = oauth.scope;
    return body;
  }

  private parseConnector(data: Record<string, unknown>): Connector {
    const connector = data['connector'] ?? data;
    const c = connector as Record<string, unknown>;

    return {
      id: String(c['id'] ?? ''),
      name: String(c['name'] ?? ''),
      description: c['description'] as string | undefined,
      url: String(c['url'] ?? ''),
      organizationId: c['organization_id'] as string | undefined,
      authType: c['auth_type'] as ConnectorAuthType | undefined,
      oauth: c['oauth'] ? this.parseOAuth(c['oauth'] as Record<string, unknown>) : undefined,
      active: c['active'] as boolean | undefined,
      continueOnFailure: c['continue_on_failure'] as boolean | undefined,
      excludes: c['excludes'] as string[] | undefined,
      createdAt: c['created_at'] as string | undefined,
      updatedAt: c['updated_at'] as string | undefined,
      meta: c['meta'] as Connector['meta'],
    };
  }

  private parseOAuth(data: Record<string, unknown>): ConnectorOAuth {
    return {
      clientId: data['client_id'] as string | undefined,
      authorizeUrl: data['authorize_url'] as string | undefined,
      tokenUrl: data['token_url'] as string | undefined,
      scope: data['scope'] as string | undefined,
    };
  }
}
