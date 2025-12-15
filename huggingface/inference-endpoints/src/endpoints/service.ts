/**
 * Endpoint Management Service
 * CRUD and lifecycle management for dedicated endpoints as specified in SPARC documentation
 */

import {
  EndpointConfig,
  EndpointInfo,
  EndpointStatus,
  HfInferenceConfig,
} from '../types/index.js';
import {
  parseHttpError,
  createValidationError,
  createEndpointPausedError,
  createEndpointFailedError,
} from '../types/errors.js';
import { withRetry } from '../utils/retry.js';

const HF_API_BASE = 'https://api.huggingface.co';

export interface EndpointManagementServiceOptions {
  config: HfInferenceConfig;
}

interface CachedEndpoint {
  info: EndpointInfo;
  expiresAt: number;
}

/**
 * Endpoint Management Service class
 * Provides CRUD operations for dedicated inference endpoints
 */
export class EndpointManagementService {
  private config: HfInferenceConfig;
  private endpointCache: Map<string, CachedEndpoint> = new Map();

  constructor(options: EndpointManagementServiceOptions) {
    this.config = options.config;
  }

  /**
   * List all endpoints in a namespace
   */
  async list(namespace?: string): Promise<EndpointInfo[]> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const response = await this.makeRequest(
      'GET',
      `/v2/endpoint/${ns}`
    );

    const data = await response.json();
    const endpoints = data.items || data;

    return endpoints.map((item: any) => this.parseEndpointInfo(item));
  }

  /**
   * Get endpoint information
   */
  async get(name: string, namespace?: string): Promise<EndpointInfo> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    // Check cache first
    const cacheKey = `${ns}/${name}`;
    const cached = this.endpointCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.info;
    }

    const response = await this.makeRequest(
      'GET',
      `/v2/endpoint/${ns}/${name}`
    );

    const data = await response.json();
    const info = this.parseEndpointInfo(data);

    // Cache the result
    this.endpointCache.set(cacheKey, {
      info,
      expiresAt: Date.now() + this.config.endpointCacheTtl,
    });

    return info;
  }

  /**
   * Create a new endpoint
   */
  async create(config: EndpointConfig): Promise<EndpointInfo> {
    this.validateEndpointConfig(config);

    const body = this.buildCreateRequest(config);

    const response = await this.makeRequest(
      'POST',
      `/v2/endpoint/${config.namespace}`,
      body
    );

    const data = await response.json();
    return this.parseEndpointInfo(data);
  }

  /**
   * Update an existing endpoint
   */
  async update(
    name: string,
    updates: Partial<EndpointConfig>,
    namespace?: string
  ): Promise<EndpointInfo> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const body = this.buildUpdateRequest(updates);

    const response = await this.makeRequest(
      'PUT',
      `/v2/endpoint/${ns}/${name}`,
      body
    );

    // Invalidate cache
    const cacheKey = `${ns}/${name}`;
    this.endpointCache.delete(cacheKey);

    const data = await response.json();
    return this.parseEndpointInfo(data);
  }

  /**
   * Delete an endpoint
   */
  async delete(name: string, namespace?: string): Promise<void> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    await this.makeRequest(
      'DELETE',
      `/v2/endpoint/${ns}/${name}`
    );

    // Invalidate cache
    const cacheKey = `${ns}/${name}`;
    this.endpointCache.delete(cacheKey);
  }

  /**
   * Pause an endpoint
   */
  async pause(name: string, namespace?: string): Promise<EndpointInfo> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const response = await this.makeRequest(
      'POST',
      `/v2/endpoint/${ns}/${name}/pause`
    );

    // Invalidate cache
    const cacheKey = `${ns}/${name}`;
    this.endpointCache.delete(cacheKey);

    const data = await response.json();
    return this.parseEndpointInfo(data);
  }

  /**
   * Resume a paused endpoint
   */
  async resume(name: string, namespace?: string): Promise<EndpointInfo> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const response = await this.makeRequest(
      'POST',
      `/v2/endpoint/${ns}/${name}/resume`
    );

    // Invalidate cache
    const cacheKey = `${ns}/${name}`;
    this.endpointCache.delete(cacheKey);

    const data = await response.json();
    return this.parseEndpointInfo(data);
  }

  /**
   * Scale endpoint to zero
   */
  async scaleToZero(name: string, namespace?: string): Promise<EndpointInfo> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const response = await this.makeRequest(
      'POST',
      `/v2/endpoint/${ns}/${name}/scale-to-zero`
    );

    // Invalidate cache
    const cacheKey = `${ns}/${name}`;
    this.endpointCache.delete(cacheKey);

    const data = await response.json();
    return this.parseEndpointInfo(data);
  }

  /**
   * Wait for endpoint to reach a specific status
   */
  async waitForStatus(
    name: string,
    targetStatus: EndpointStatus | EndpointStatus[],
    options?: {
      namespace?: string;
      timeout?: number;
      pollInterval?: number;
    }
  ): Promise<EndpointInfo> {
    const ns = options?.namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const timeout = options?.timeout || 600000; // 10 minutes default
    const pollInterval = options?.pollInterval || 10000; // 10 seconds
    const targetStatuses = Array.isArray(targetStatus)
      ? targetStatus
      : [targetStatus];

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Bypass cache for polling
      this.endpointCache.delete(`${ns}/${name}`);

      const info = await this.get(name, ns);

      if (targetStatuses.includes(info.status.state)) {
        return info;
      }

      // Check for failed state
      if (info.status.state === 'failed') {
        throw createEndpointFailedError(
          name,
          info.status.message || 'Endpoint failed'
        );
      }

      await this.sleep(pollInterval);
    }

    throw createValidationError(
      `Endpoint ${name} did not reach status ${targetStatuses.join('/')} within timeout`
    );
  }

  /**
   * Ensure endpoint is running (resume if paused)
   */
  async ensureRunning(name: string, namespace?: string): Promise<EndpointInfo> {
    const ns = namespace || this.config.defaultNamespace;
    if (!ns) {
      throw createValidationError('Namespace is required');
    }

    const info = await this.get(name, ns);

    switch (info.status.state) {
      case 'running':
        return info;

      case 'paused':
        if (!this.config.autoResumePaused) {
          throw createEndpointPausedError(name);
        }
        await this.resume(name, ns);
        return this.waitForStatus(name, 'running', { namespace: ns });

      case 'scaledToZero':
        // Will auto-resume on first request
        return info;

      case 'pending':
      case 'initializing':
      case 'updating':
        return this.waitForStatus(name, 'running', { namespace: ns });

      case 'failed':
        throw createEndpointFailedError(
          name,
          info.status.message || 'Endpoint is in failed state'
        );

      default:
        throw createValidationError(
          `Unexpected endpoint status: ${info.status.state}`
        );
    }
  }

  /**
   * Get endpoint URL
   */
  async getEndpointUrl(name: string, namespace?: string): Promise<string> {
    const info = await this.get(name, namespace);

    if (!info.status.url) {
      throw createValidationError(
        `Endpoint ${name} does not have a URL (status: ${info.status.state})`
      );
    }

    return info.status.url;
  }

  /**
   * Make HTTP request to HF API
   */
  private async makeRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const url = `${HF_API_BASE}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.requestTimeout
    );

    try {
      const requestFn = async (): Promise<Response> => {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw await parseHttpError(response);
        }

        return response;
      };

      return await withRetry(requestFn, {
        maxRetries: this.config.maxRetries,
        baseDelay: this.config.retryBaseDelay,
        maxDelay: this.config.retryMaxDelay,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate endpoint configuration
   */
  private validateEndpointConfig(config: EndpointConfig): void {
    if (!config.name) {
      throw createValidationError('Endpoint name is required');
    }

    if (!config.namespace) {
      throw createValidationError('Namespace is required');
    }

    if (!config.model?.repository) {
      throw createValidationError('Model repository is required');
    }

    if (!config.compute?.instanceType) {
      throw createValidationError('Instance type is required');
    }
  }

  /**
   * Build create endpoint request body
   */
  private buildCreateRequest(config: EndpointConfig): Record<string, unknown> {
    return {
      name: config.name,
      type: config.type,
      model: {
        repository: config.model.repository,
        revision: config.model.revision,
        task: config.model.task,
        framework: config.model.framework,
      },
      compute: {
        accelerator: config.compute.accelerator,
        instanceType: config.compute.instanceType,
        instanceSize: config.compute.instanceSize,
        scaling: {
          minReplicas: config.compute.scaling.minReplicas,
          maxReplicas: config.compute.scaling.maxReplicas,
          scaleToZeroTimeout: config.compute.scaling.scaleToZeroTimeout,
        },
      },
      provider: config.provider
        ? {
            region: config.provider.region,
            vendor: config.provider.vendor,
          }
        : undefined,
    };
  }

  /**
   * Build update endpoint request body
   */
  private buildUpdateRequest(
    updates: Partial<EndpointConfig>
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    if (updates.model) {
      body.model = {
        repository: updates.model.repository,
        revision: updates.model.revision,
        task: updates.model.task,
        framework: updates.model.framework,
      };
    }

    if (updates.compute) {
      body.compute = {
        accelerator: updates.compute.accelerator,
        instanceType: updates.compute.instanceType,
        instanceSize: updates.compute.instanceSize,
        scaling: updates.compute.scaling
          ? {
              minReplicas: updates.compute.scaling.minReplicas,
              maxReplicas: updates.compute.scaling.maxReplicas,
              scaleToZeroTimeout: updates.compute.scaling.scaleToZeroTimeout,
            }
          : undefined,
      };
    }

    return body;
  }

  /**
   * Parse endpoint info from API response
   */
  private parseEndpointInfo(data: any): EndpointInfo {
    return {
      name: data.name,
      namespace: data.accountId || data.namespace,
      status: {
        state: this.parseEndpointStatus(data.status?.state || data.state),
        message: data.status?.message,
        createdAt: new Date(data.status?.createdAt || data.createdAt),
        updatedAt: new Date(data.status?.updatedAt || data.updatedAt),
        url: data.status?.url,
        private: data.status?.private,
      },
      model: {
        repository: data.model?.repository,
        revision: data.model?.revision || 'main',
        task: data.model?.task,
        framework: data.model?.framework,
        image: {
          custom: data.model?.image?.custom,
          huggingface: data.model?.image?.huggingface,
        },
      },
      compute: {
        accelerator: data.compute?.accelerator,
        instanceType: data.compute?.instanceType,
        instanceSize: data.compute?.instanceSize,
        scaling: {
          minReplicas: data.compute?.scaling?.minReplicas || 0,
          maxReplicas: data.compute?.scaling?.maxReplicas || 1,
          scaleToZeroTimeout: data.compute?.scaling?.scaleToZeroTimeout || 15,
        },
      },
      provider: {
        region: data.provider?.region || 'us-east-1',
        vendor: data.provider?.vendor || 'aws',
      },
    };
  }

  /**
   * Parse endpoint status string
   */
  private parseEndpointStatus(status: string): EndpointStatus {
    const statusMap: Record<string, EndpointStatus> = {
      pending: 'pending',
      initializing: 'initializing',
      updating: 'updating',
      running: 'running',
      paused: 'paused',
      failed: 'failed',
      scaledToZero: 'scaledToZero',
      'scaled-to-zero': 'scaledToZero',
    };

    return statusMap[status?.toLowerCase()] || 'pending';
  }

  /**
   * Clear endpoint cache
   */
  clearCache(): void {
    this.endpointCache.clear();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
