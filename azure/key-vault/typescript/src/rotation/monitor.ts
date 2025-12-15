/**
 * Azure Key Vault Expiry Monitor
 *
 * Monitors secrets for expiration and triggers rotation handlers.
 * Following the SPARC specification for Azure Key Vault integration.
 */

import type { SecretProperties } from '../types/index.js';
import type { RotationHandler } from './handler.js';

/**
 * Minimal interface for secrets service operations needed by the monitor.
 * This allows the monitor to work with any service implementation.
 */
export interface SecretsService {
  /**
   * List all secrets (metadata only, no values).
   */
  listSecrets(): Promise<SecretProperties[]>;
}

/**
 * Configuration for the expiry monitor.
 */
export interface ExpiryMonitorConfig {
  /**
   * Interval between expiry checks in milliseconds.
   * Default: 3600000 (1 hour)
   */
  checkIntervalMs: number;

  /**
   * Warning thresholds in days.
   * When a secret is within these thresholds of expiry, handlers are notified.
   * Default: [30, 7, 1] (30 days, 7 days, 1 day)
   */
  warningThresholds: number[];
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: ExpiryMonitorConfig = {
  checkIntervalMs: 3600000, // 1 hour
  warningThresholds: [30, 7, 1], // 30 days, 7 days, 1 day
};

/**
 * Optional dependencies for observability.
 * These can be injected to enable logging and metrics.
 */
export interface ObservabilityDeps {
  logger?: Logger;
  metrics?: MetricsCollector;
}

/**
 * Logger interface (minimal).
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Metrics collector interface (minimal).
 */
export interface MetricsCollector {
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Expiry monitor for Azure Key Vault secrets.
 *
 * This class monitors secrets for expiration and triggers rotation handlers
 * when secrets are near expiry. It runs periodic checks and emits metrics
 * for observability.
 */
export class ExpiryMonitor {
  private intervalId?: NodeJS.Timeout;
  private handlers: RotationHandler[] = [];
  private config: ExpiryMonitorConfig;
  private logger?: Logger;
  private metrics?: MetricsCollector;
  private notifiedSecrets: Map<string, Set<number>> = new Map();

  /**
   * Create a new expiry monitor.
   *
   * @param secretsService - Service for listing secrets
   * @param config - Monitor configuration (optional)
   * @param observability - Optional logger and metrics collector
   */
  constructor(
    private secretsService: SecretsService,
    config?: Partial<ExpiryMonitorConfig>,
    observability?: ObservabilityDeps
  ) {
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? DEFAULT_CONFIG.checkIntervalMs,
      warningThresholds: config?.warningThresholds ?? DEFAULT_CONFIG.warningThresholds,
    };
    this.logger = observability?.logger;
    this.metrics = observability?.metrics;

    // Validate configuration
    if (this.config.checkIntervalMs < 1000) {
      throw new Error('Check interval must be at least 1000ms');
    }

    if (this.config.warningThresholds.length === 0) {
      throw new Error('Warning thresholds cannot be empty');
    }

    // Sort thresholds in descending order for easier processing
    this.config.warningThresholds.sort((a, b) => b - a);
  }

  /**
   * Add a rotation handler.
   *
   * @param handler - Handler to add
   */
  addHandler(handler: RotationHandler): void {
    if (!this.handlers.includes(handler)) {
      this.handlers.push(handler);
      this.logger?.debug('Added rotation handler', { handlerCount: this.handlers.length });
    }
  }

  /**
   * Remove a rotation handler.
   *
   * @param handler - Handler to remove
   */
  removeHandler(handler: RotationHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      this.logger?.debug('Removed rotation handler', { handlerCount: this.handlers.length });
    }
  }

  /**
   * Start monitoring for secret expiry.
   *
   * Begins periodic checks according to the configured interval.
   */
  start(): void {
    if (this.intervalId !== undefined) {
      this.logger?.warn('Expiry monitor already started');
      return;
    }

    this.logger?.info('Starting expiry monitor', {
      checkIntervalMs: this.config.checkIntervalMs,
      warningThresholds: this.config.warningThresholds,
      handlerCount: this.handlers.length,
    });

    // Run initial check immediately
    this.checkNow().catch((error) => {
      this.logger?.error('Initial expiry check failed', { error: String(error) });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkNow().catch((error) => {
        this.logger?.error('Expiry check failed', { error: String(error) });
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring.
   *
   * Cancels the periodic check interval.
   */
  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.logger?.info('Stopped expiry monitor');
    }
  }

  /**
   * Perform an immediate expiry check.
   *
   * This is useful for testing or triggering manual checks.
   */
  async checkNow(): Promise<void> {
    this.logger?.debug('Starting expiry check');

    try {
      // List all secrets
      const secrets = await this.secretsService.listSecrets();

      this.logger?.debug('Retrieved secrets for expiry check', { count: secrets.length });

      // Check each secret's expiry
      for (const secret of secrets) {
        try {
          await this.checkSecretExpiry(secret);
        } catch (error) {
          // Log error but continue checking other secrets
          this.logger?.error('Failed to check secret expiry', {
            secretName: secret.name,
            error: String(error),
          });
        }
      }
    } catch (error) {
      // Re-throw to allow caller to handle
      this.logger?.error('Failed to list secrets', { error: String(error) });
      throw error;
    }
  }

  /**
   * Check a single secret's expiry.
   *
   * If the secret is near expiry based on configured thresholds,
   * handlers are notified and metrics are emitted.
   *
   * @param secret - Secret properties to check
   */
  async checkSecretExpiry(secret: SecretProperties): Promise<void> {
    // Skip if secret has no expiry date
    if (!secret.expiresOn) {
      return;
    }

    // Calculate days until expiry
    const now = Date.now();
    const expiresAt = secret.expiresOn.getTime();
    const msUntilExpiry = expiresAt - now;
    const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

    // Emit metric for expiry days
    this.metrics?.setGauge('keyvault_secret_expiry_days', daysUntilExpiry, {
      vault: secret.vaultUrl,
      secret_name: secret.name,
    });

    // Check if we should warn about this expiry
    const shouldWarn = this.shouldWarnAboutExpiry(secret.name, daysUntilExpiry);

    if (shouldWarn) {
      // Log warning
      this.logger?.warn('Secret near expiry', {
        secretName: secret.name,
        daysUntilExpiry,
        expiresOn: secret.expiresOn.toISOString(),
      });

      // Notify all handlers asynchronously (don't block)
      this.notifyHandlers(secret, daysUntilExpiry);
    }
  }

  /**
   * Determine if we should warn about a secret's expiry.
   *
   * We only warn once per threshold to avoid spamming handlers.
   *
   * @param secretName - Name of the secret
   * @param daysUntilExpiry - Days until expiry
   * @returns True if we should warn
   */
  private shouldWarnAboutExpiry(secretName: string, daysUntilExpiry: number): boolean {
    // Find the threshold this falls into
    let matchedThreshold: number | undefined;

    for (const threshold of this.config.warningThresholds) {
      if (daysUntilExpiry <= threshold) {
        matchedThreshold = threshold;
        break;
      }
    }

    // No threshold matched
    if (matchedThreshold === undefined) {
      return false;
    }

    // Check if we've already notified for this threshold
    const notified = this.notifiedSecrets.get(secretName) ?? new Set();

    if (notified.has(matchedThreshold)) {
      return false; // Already notified for this threshold
    }

    // Mark as notified
    notified.add(matchedThreshold);
    this.notifiedSecrets.set(secretName, notified);

    return true;
  }

  /**
   * Notify all handlers about a near-expiry event.
   *
   * Handlers are called asynchronously and errors are caught to prevent
   * one failing handler from affecting others.
   *
   * @param secret - Secret near expiry
   * @param daysUntilExpiry - Days until expiry
   */
  private notifyHandlers(secret: SecretProperties, daysUntilExpiry: number): void {
    for (const handler of this.handlers) {
      // Call handler asynchronously, don't await
      handler.onNearExpiry(secret, daysUntilExpiry).catch((error) => {
        this.logger?.error('Rotation handler failed', {
          secretName: secret.name,
          daysUntilExpiry,
          error: String(error),
        });
      });
    }
  }

  /**
   * Clear notification history.
   *
   * This is useful for testing or resetting the monitor state.
   */
  clearNotificationHistory(): void {
    this.notifiedSecrets.clear();
    this.logger?.debug('Cleared notification history');
  }
}
