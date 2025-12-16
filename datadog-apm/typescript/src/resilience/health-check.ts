/**
 * Datadog Agent health check implementation
 *
 * @module resilience/health-check
 */

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Agent host */
  agentHost: string;
  /** Agent port */
  agentPort: number;
  /** Health check interval in ms */
  checkInterval?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Max consecutive failures before marking unhealthy */
  maxConsecutiveFailures?: number;
  /** Optional logger */
  logger?: {
    warn(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
  };
}

/**
 * Health status
 */
export interface AgentHealthStatus {
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  lastError?: string;
  agentInfo?: {
    version?: string;
    endpoints?: string[];
  };
}

/**
 * Agent health checker
 */
export class AgentHealthChecker {
  private config: Required<HealthCheckConfig>;
  private healthy: boolean = true;
  private lastCheck: number = 0;
  private consecutiveFailures: number = 0;
  private lastError?: string;
  private agentInfo?: { version?: string; endpoints?: string[] };
  private checkTimer?: ReturnType<typeof setInterval>;

  constructor(config: HealthCheckConfig) {
    this.config = {
      agentHost: config.agentHost,
      agentPort: config.agentPort,
      checkInterval: config.checkInterval ?? 30000,
      timeout: config.timeout ?? 1000,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      logger: config.logger ?? {
        warn: () => {},
        debug: () => {},
        info: () => {},
      },
    };
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkTimer) {
      return;
    }

    // Run initial check
    this.check().catch(() => {});

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.check().catch(() => {});
    }, this.config.checkInterval);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Perform a health check
   */
  async check(): Promise<boolean> {
    const now = Date.now();

    // Skip if checked recently
    if (now - this.lastCheck < this.config.checkInterval / 2) {
      return this.healthy;
    }

    this.lastCheck = now;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(
          `http://${this.config.agentHost}:${this.config.agentPort}/info`,
          {
            method: 'GET',
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          try {
            const data = await response.json();
            this.agentInfo = {
              version: data.version,
              endpoints: data.endpoints,
            };
          } catch {
            // Ignore JSON parsing errors
          }

          this.onSuccess();
          return true;
        } else {
          this.onFailure(`HTTP ${response.status}`);
          return this.healthy;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.onFailure(message);
      return this.healthy;
    }
  }

  /**
   * Handle successful health check
   */
  private onSuccess(): void {
    if (!this.healthy) {
      this.config.logger.info('Datadog agent recovered', {
        host: this.config.agentHost,
        port: this.config.agentPort,
      });
    }

    this.healthy = true;
    this.consecutiveFailures = 0;
    this.lastError = undefined;
  }

  /**
   * Handle failed health check
   */
  private onFailure(error: string): void {
    this.consecutiveFailures++;
    this.lastError = error;

    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      if (this.healthy) {
        this.config.logger.warn('Datadog agent marked unhealthy', {
          failures: this.consecutiveFailures,
          host: this.config.agentHost,
          port: this.config.agentPort,
          error,
        });
      }
      this.healthy = false;
    }
  }

  /**
   * Get current health status
   */
  getStatus(): AgentHealthStatus {
    return {
      healthy: this.healthy,
      lastCheck: this.lastCheck,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      agentInfo: this.agentInfo,
    };
  }

  /**
   * Check if agent is healthy
   */
  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Force healthy state (for testing)
   */
  forceHealthy(): void {
    this.healthy = true;
    this.consecutiveFailures = 0;
    this.lastError = undefined;
  }

  /**
   * Force unhealthy state (for testing)
   */
  forceUnhealthy(error: string = 'Forced unhealthy'): void {
    this.healthy = false;
    this.lastError = error;
  }
}
