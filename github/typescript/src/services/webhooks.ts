/**
 * GitHub Webhooks Service
 *
 * Provides CRUD operations for GitHub webhooks
 */

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  url: string;
  content_type?: 'json' | 'form';
  secret?: string;
  insecure_ssl?: '0' | '1';
}

/**
 * Webhook events
 */
export type WebhookEvent =
  | '*'
  | 'push'
  | 'pull_request'
  | 'issues'
  | 'issue_comment'
  | 'commit_comment'
  | 'create'
  | 'delete'
  | 'deployment'
  | 'deployment_status'
  | 'fork'
  | 'gollum'
  | 'member'
  | 'public'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'release'
  | 'status'
  | 'watch'
  | 'workflow_run'
  | 'workflow_job';

/**
 * Webhook representation
 */
export interface Webhook {
  id: number;
  name: string;
  type: string;
  active: boolean;
  events: WebhookEvent[];
  config: WebhookConfig;
  updated_at: string;
  created_at: string;
  url: string;
  test_url: string;
  ping_url: string;
  deliveries_url?: string;
  last_response?: {
    code: number | null;
    status: string;
    message: string | null;
  };
}

/**
 * Request to create a webhook
 */
export interface CreateWebhookRequest {
  name?: string;
  config: WebhookConfig;
  events?: WebhookEvent[];
  active?: boolean;
}

/**
 * Request to update a webhook
 */
export interface UpdateWebhookRequest {
  config?: WebhookConfig;
  events?: WebhookEvent[];
  add_events?: WebhookEvent[];
  remove_events?: WebhookEvent[];
  active?: boolean;
}

/**
 * Webhook delivery
 */
export interface WebhookDelivery {
  id: number;
  guid: string;
  delivered_at: string;
  redelivery: boolean;
  duration: number;
  status: string;
  status_code: number;
  event: string;
  action: string | null;
  installation_id: number | null;
  repository_id: number | null;
}

/**
 * Webhook ping response
 */
export interface WebhookPingResponse {
  zen: string;
  hook_id: number;
  hook: Webhook;
}

/**
 * GitHub Webhooks Service
 */
export class WebhooksService {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  /**
   * List repository webhooks
   */
  async list(options?: RequestOptions): Promise<Webhook[]> {
    return this.request<Webhook[]>(
      'GET',
      `/repos/${this.owner}/${this.repo}/hooks`,
      undefined,
      options
    );
  }

  /**
   * Get a webhook by ID
   */
  async get(hookId: number, options?: RequestOptions): Promise<Webhook> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }

    return this.request<Webhook>(
      'GET',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}`,
      undefined,
      options
    );
  }

  /**
   * Create a new webhook
   */
  async create(request: CreateWebhookRequest, options?: RequestOptions): Promise<Webhook> {
    this.validateCreateRequest(request);

    const body = {
      name: request.name || 'web',
      active: request.active !== undefined ? request.active : true,
      events: request.events || ['push'],
      config: request.config,
    };

    return this.request<Webhook>(
      'POST',
      `/repos/${this.owner}/${this.repo}/hooks`,
      body,
      options
    );
  }

  /**
   * Update a webhook
   */
  async update(
    hookId: number,
    request: UpdateWebhookRequest,
    options?: RequestOptions
  ): Promise<Webhook> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }

    return this.request<Webhook>(
      'PATCH',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}`,
      request,
      options
    );
  }

  /**
   * Delete a webhook
   */
  async delete(hookId: number, options?: RequestOptions): Promise<void> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }

    await this.request<void>(
      'DELETE',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}`,
      undefined,
      options
    );
  }

  /**
   * Ping a webhook
   */
  async ping(hookId: number, options?: RequestOptions): Promise<void> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }

    await this.request<void>(
      'POST',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}/pings`,
      undefined,
      options
    );
  }

  /**
   * Test a webhook with a push event
   */
  async testPush(hookId: number, options?: RequestOptions): Promise<void> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }

    await this.request<void>(
      'POST',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}/tests`,
      undefined,
      options
    );
  }

  /**
   * List webhook deliveries
   */
  async listDeliveries(
    hookId: number,
    perPage?: number,
    cursor?: string,
    options?: RequestOptions
  ): Promise<WebhookDelivery[]> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }

    const params = new URLSearchParams();
    if (perPage) params.set('per_page', perPage.toString());
    if (cursor) params.set('cursor', cursor);

    const queryString = params.toString();
    const path = `/repos/${this.owner}/${this.repo}/hooks/${hookId}/deliveries${
      queryString ? `?${queryString}` : ''
    }`;

    return this.request<WebhookDelivery[]>('GET', path, undefined, options);
  }

  /**
   * Get a webhook delivery
   */
  async getDelivery(
    hookId: number,
    deliveryId: number,
    options?: RequestOptions
  ): Promise<WebhookDelivery> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }
    if (!deliveryId || deliveryId <= 0) {
      throw new Error('Delivery ID must be a positive number');
    }

    return this.request<WebhookDelivery>(
      'GET',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}/deliveries/${deliveryId}`,
      undefined,
      options
    );
  }

  /**
   * Redeliver a webhook delivery
   */
  async redeliverDelivery(
    hookId: number,
    deliveryId: number,
    options?: RequestOptions
  ): Promise<void> {
    if (!hookId || hookId <= 0) {
      throw new Error('Hook ID must be a positive number');
    }
    if (!deliveryId || deliveryId <= 0) {
      throw new Error('Delivery ID must be a positive number');
    }

    await this.request<void>(
      'POST',
      `/repos/${this.owner}/${this.repo}/hooks/${hookId}/deliveries/${deliveryId}/attempts`,
      undefined,
      options
    );
  }

  /**
   * Validate create webhook request
   */
  private validateCreateRequest(request: CreateWebhookRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }

    if (!request.config) {
      throw new Error('Webhook config is required');
    }

    if (!request.config.url) {
      throw new Error('Webhook URL is required');
    }

    if (!/^https?:\/\/.+/.test(request.config.url)) {
      throw new Error('Webhook URL must be a valid HTTP(S) URL');
    }

    if (request.config.content_type && !['json', 'form'].includes(request.config.content_type)) {
      throw new Error('Content type must be "json" or "form"');
    }

    if (request.config.insecure_ssl && !['0', '1'].includes(request.config.insecure_ssl)) {
      throw new Error('insecure_ssl must be "0" or "1"');
    }
  }

  /**
   * Make an HTTP request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;

    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.message || `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      // DELETE requests may return 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
