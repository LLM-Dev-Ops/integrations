/**
 * Model Registry for vLLM
 * Manages model discovery and server routing
 */

import type { ModelInfo, ServerConfig } from '../types/index.js';
import { InvalidModelError } from '../types/errors.js';

export interface ServerModelInfo {
  server: ServerConfig;
  models: ModelInfo[];
  lastUpdated: number;
  healthy: boolean;
}

export interface LoadBalancerStrategy {
  select(servers: ServerConfig[]): ServerConfig;
}

/**
 * Round-robin load balancer
 */
export class RoundRobinLoadBalancer implements LoadBalancerStrategy {
  private index = 0;

  select(servers: ServerConfig[]): ServerConfig {
    if (servers.length === 0) {
      throw new Error('No servers available');
    }
    const server = servers[this.index % servers.length]!;
    this.index++;
    return server;
  }
}

/**
 * Weighted random load balancer
 */
export class WeightedRandomLoadBalancer implements LoadBalancerStrategy {
  select(servers: ServerConfig[]): ServerConfig {
    if (servers.length === 0) {
      throw new Error('No servers available');
    }

    const totalWeight = servers.reduce((sum, s) => sum + (s.weight ?? 1), 0);
    let random = Math.random() * totalWeight;

    for (const server of servers) {
      random -= server.weight ?? 1;
      if (random <= 0) {
        return server;
      }
    }

    return servers[servers.length - 1]!;
  }
}

/**
 * Model Registry with server discovery and load balancing
 */
export class ModelRegistry {
  private serverModels: Map<string, ServerModelInfo> = new Map();
  private modelToServers: Map<string, Set<string>> = new Map();
  private readonly loadBalancer: LoadBalancerStrategy;
  private readonly servers: Map<string, ServerConfig> = new Map();

  constructor(
    servers: ServerConfig[],
    loadBalancer: LoadBalancerStrategy = new RoundRobinLoadBalancer()
  ) {
    this.loadBalancer = loadBalancer;
    for (const server of servers) {
      this.servers.set(server.url, server);
    }
  }

  /**
   * Update models for a server
   */
  updateServerModels(serverUrl: string, models: ModelInfo[]): void {
    const server = this.servers.get(serverUrl);
    if (!server) {
      return;
    }

    // Get existing models for this server
    const existingInfo = this.serverModels.get(serverUrl);
    const oldModelIds = new Set(existingInfo?.models.map((m) => m.id) ?? []);

    // Update model-to-server mappings
    const newModelIds = new Set(models.map((m) => m.id));

    // Remove old mappings
    for (const modelId of oldModelIds) {
      if (!newModelIds.has(modelId)) {
        const servers = this.modelToServers.get(modelId);
        if (servers) {
          servers.delete(serverUrl);
          if (servers.size === 0) {
            this.modelToServers.delete(modelId);
          }
        }
      }
    }

    // Add new mappings
    for (const modelId of newModelIds) {
      if (!this.modelToServers.has(modelId)) {
        this.modelToServers.set(modelId, new Set());
      }
      this.modelToServers.get(modelId)!.add(serverUrl);
    }

    // Update server info
    this.serverModels.set(serverUrl, {
      server,
      models,
      lastUpdated: Date.now(),
      healthy: true,
    });
  }

  /**
   * Mark a server as healthy or unhealthy
   */
  setServerHealth(serverUrl: string, healthy: boolean): void {
    const info = this.serverModels.get(serverUrl);
    if (info) {
      info.healthy = healthy;
    }
  }

  /**
   * List all available models
   */
  listModels(): ModelInfo[] {
    const modelMap = new Map<string, ModelInfo>();

    for (const serverInfo of this.serverModels.values()) {
      for (const model of serverInfo.models) {
        // Keep the first occurrence or merge info
        if (!modelMap.has(model.id)) {
          modelMap.set(model.id, model);
        }
      }
    }

    return Array.from(modelMap.values());
  }

  /**
   * Check if a model is available
   */
  hasModel(modelId: string): boolean {
    const servers = this.modelToServers.get(modelId);
    if (!servers || servers.size === 0) {
      return false;
    }

    // Check if at least one server with this model is healthy
    for (const serverUrl of servers) {
      const info = this.serverModels.get(serverUrl);
      if (info?.healthy) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get servers serving a model
   */
  getServersForModel(modelId: string): ServerConfig[] {
    const serverUrls = this.modelToServers.get(modelId);
    if (!serverUrls) {
      return [];
    }

    const servers: ServerConfig[] = [];
    for (const url of serverUrls) {
      const info = this.serverModels.get(url);
      if (info?.healthy) {
        servers.push(info.server);
      }
    }

    return servers;
  }

  /**
   * Select the best server for a model
   */
  selectServer(modelId: string): ServerConfig {
    const servers = this.getServersForModel(modelId);

    if (servers.length === 0) {
      throw new InvalidModelError(
        modelId,
        Array.from(this.modelToServers.keys())
      );
    }

    return this.loadBalancer.select(servers);
  }

  /**
   * Get all registered servers
   */
  getServers(): ServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get server info
   */
  getServerInfo(serverUrl: string): ServerModelInfo | undefined {
    return this.serverModels.get(serverUrl);
  }

  /**
   * Remove a server from the registry
   */
  removeServer(serverUrl: string): void {
    const info = this.serverModels.get(serverUrl);
    if (!info) {
      return;
    }

    // Remove model mappings
    for (const model of info.models) {
      const servers = this.modelToServers.get(model.id);
      if (servers) {
        servers.delete(serverUrl);
        if (servers.size === 0) {
          this.modelToServers.delete(model.id);
        }
      }
    }

    this.serverModels.delete(serverUrl);
    this.servers.delete(serverUrl);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.serverModels.clear();
    this.modelToServers.clear();
  }
}

/**
 * Model discovery service
 */
export class ModelDiscoveryService {
  private readonly registry: ModelRegistry;
  private readonly discoveryIntervalMs: number;
  private readonly fetchModels: (serverUrl: string) => Promise<ModelInfo[]>;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    registry: ModelRegistry,
    discoveryIntervalMs: number,
    fetchModels: (serverUrl: string) => Promise<ModelInfo[]>
  ) {
    this.registry = registry;
    this.discoveryIntervalMs = discoveryIntervalMs;
    this.fetchModels = fetchModels;
  }

  /**
   * Start the discovery service
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.discover();

    this.intervalId = setInterval(() => {
      this.discover();
    }, this.discoveryIntervalMs);
  }

  /**
   * Stop the discovery service
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Discover models from all servers
   */
  async discover(): Promise<void> {
    const servers = this.registry.getServers();

    await Promise.allSettled(
      servers.map(async (server) => {
        try {
          const models = await this.fetchModels(server.url);
          this.registry.updateServerModels(server.url, models);
          this.registry.setServerHealth(server.url, true);
        } catch (error) {
          this.registry.setServerHealth(server.url, false);
        }
      })
    );
  }

  /**
   * Check if the service is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
