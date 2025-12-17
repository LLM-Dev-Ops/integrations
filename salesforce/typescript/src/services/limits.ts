/**
 * Salesforce Limits Service
 *
 * Provides rate limit tracking and monitoring for Salesforce API usage following SPARC specification.
 *
 * Supports:
 * - Fetching org-wide limits via /limits endpoint
 * - Tracking API usage from response headers (Sforce-Limit-Info)
 * - Threshold-based warnings for proactive monitoring
 * - Comprehensive limit types (API, Bulk, Streaming, etc.)
 *
 * @example Basic usage
 * ```typescript
 * const limitsService = createLimitsService(client);
 *
 * // Get all limits
 * const limits = await limitsService.getLimits();
 *
 * // Get specific limit
 * const apiLimit = await limitsService.getLimit('DailyApiRequests');
 *
 * // Track from response headers
 * limitsService.trackFromHeaders({ 'sforce-limit-info': 'api-usage=150/15000' });
 * ```
 *
 * @example Monitoring with tracker
 * ```typescript
 * const tracker = createLimitsTracker({
 *   warningThresholdPercent: 80,
 *   criticalThresholdPercent: 95
 * });
 *
 * tracker.onWarning((warning) => {
 *   console.warn(`Limit warning: ${warning.limitName} at ${warning.usedPercent}%`);
 * });
 *
 * const limits = await limitsService.getLimits();
 * tracker.update(limits);
 * const warnings = tracker.checkThresholds();
 * ```
 */

import type { Logger, MetricsCollector } from '../observability/index.js';
import { NoopLogger } from '../observability/index.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Information about a single limit.
 */
export interface LimitInfo {
  /** Maximum allowed value */
  Max: number;
  /** Remaining available value */
  Remaining: number;
}

/**
 * Collection of all Salesforce limits.
 * Key is the limit name, value contains Max and Remaining.
 */
export interface SalesforceLimits {
  [limitName: string]: LimitInfo;
}

/**
 * Limit warning information.
 */
export interface LimitWarning {
  /** Name of the limit */
  limitName: string;
  /** Maximum allowed value */
  max: number;
  /** Remaining available value */
  remaining: number;
  /** Percentage used (0-100) */
  usedPercent: number;
  /** Severity level */
  severity: 'warning' | 'critical';
  /** Timestamp when warning was generated */
  timestamp: Date;
}

// ============================================================================
// Common Limit Names
// ============================================================================

/**
 * Common Salesforce limit names as constants for type safety.
 *
 * See: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm
 */
export const LimitNames = {
  // Daily API limits
  DailyApiRequests: 'DailyApiRequests',
  DailyAsyncApexExecutions: 'DailyAsyncApexExecutions',
  DailyBulkApiRequests: 'DailyBulkApiRequests',
  DailyBulkV2QueryJobs: 'DailyBulkV2QueryJobs',
  DailyBulkV2QueryFileStorageMB: 'DailyBulkV2QueryFileStorageMB',
  DailyDurableGenericStreamingApiEvents: 'DailyDurableGenericStreamingApiEvents',
  DailyDurableStreamingApiEvents: 'DailyDurableStreamingApiEvents',
  DailyGenericStreamingApiEvents: 'DailyGenericStreamingApiEvents',
  DailyStreamingApiEvents: 'DailyStreamingApiEvents',
  DailyStandardVolumePlatformEvents: 'DailyStandardVolumePlatformEvents',
  DailyWorkflowEmails: 'DailyWorkflowEmails',

  // Hourly limits
  HourlyDashboardRefreshes: 'HourlyDashboardRefreshes',
  HourlyDashboardResults: 'HourlyDashboardResults',
  HourlyDashboardStatuses: 'HourlyDashboardStatuses',
  HourlyODataCallout: 'HourlyODataCallout',
  HourlySyncReportRuns: 'HourlySyncReportRuns',
  HourlyTimeBasedWorkflow: 'HourlyTimeBasedWorkflow',
  HourlyAsyncReportRuns: 'HourlyAsyncReportRuns',

  // Concurrent limits
  ConcurrentAsyncGetReportInstances: 'ConcurrentAsyncGetReportInstances',
  ConcurrentSyncReportRuns: 'ConcurrentSyncReportRuns',
  ConcurrentEinsteinDataInsightsStoryCreation: 'ConcurrentEinsteinDataInsightsStoryCreation',
  ConcurrentEinsteinDiscoveryStoryCreation: 'ConcurrentEinsteinDiscoveryStoryCreation',

  // Data storage
  DataStorageMB: 'DataStorageMB',
  FileStorageMB: 'FileStorageMB',

  // Batch processing
  DailyBatchApexExecutions: 'DailyBatchApexExecutions',

  // Email
  SingleEmail: 'SingleEmail',
  MassEmail: 'MassEmail',

  // Permission sets
  PermissionSets: 'PermissionSets',

  // Package limits
  Package2: 'Package2',
  Package2Versions: 'Package2Versions',
} as const;

export type LimitName = typeof LimitNames[keyof typeof LimitNames];

// ============================================================================
// Limits Service Interface
// ============================================================================

/**
 * Salesforce client interface (minimal subset needed for limits service).
 */
export interface SalesforceClient {
  get<T>(path: string): Promise<T>;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
}

/**
 * Limits service interface.
 */
export interface LimitsService {
  /**
   * Retrieves all org limits from Salesforce.
   *
   * @returns Promise resolving to all limits
   * @throws {SalesforceError} If the request fails
   */
  getLimits(): Promise<SalesforceLimits>;

  /**
   * Retrieves a specific limit by name.
   *
   * @param limitName - Name of the limit to retrieve
   * @returns Promise resolving to limit info, or undefined if not found
   */
  getLimit(limitName: string): Promise<LimitInfo | undefined>;

  /**
   * Tracks API usage from response headers.
   *
   * Parses the Sforce-Limit-Info header which has format:
   * "api-usage=150/15000" or "api-usage=150/15000;per-app-api-usage=50/5000"
   *
   * @param headers - Response headers to extract limit info from
   */
  trackFromHeaders(headers: Record<string, string>): void;

  /**
   * Gets the currently tracked limits (from headers).
   *
   * @returns Current limit tracking state
   */
  getCurrentTracking(): SalesforceLimits;
}

// ============================================================================
// Limits Service Implementation
// ============================================================================

/**
 * Implementation of the Salesforce Limits service.
 */
export class LimitsServiceImpl implements LimitsService {
  private readonly client: SalesforceClient;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;

  // In-memory tracking of limits from headers
  private trackedLimits: SalesforceLimits = {};

  constructor(client: SalesforceClient) {
    this.client = client;
    this.logger = client.logger ?? new NoopLogger();
    this.metrics = client.metrics ?? {
      increment: () => {},
      gauge: () => {},
      timing: () => {},
      histogram: () => {}
    };
  }

  /**
   * Fetches all limits from Salesforce /limits endpoint.
   */
  async getLimits(): Promise<SalesforceLimits> {
    const startTime = Date.now();
    this.logger.debug('Fetching org limits');

    try {
      const limits = await this.client.get<SalesforceLimits>('/limits');

      // Emit metrics for all limits
      for (const [limitName, limitInfo] of Object.entries(limits)) {
        const usedPercent = this.calculateUsedPercent(limitInfo);

        this.metrics.gauge('salesforce.limits.max', limitInfo.Max, { limit: limitName });
        this.metrics.gauge('salesforce.limits.remaining', limitInfo.Remaining, { limit: limitName });
        this.metrics.gauge('salesforce.limits.used_percent', usedPercent, { limit: limitName });
      }

      this.metrics.timing('salesforce.limits.fetch_duration', Date.now() - startTime);
      this.metrics.increment('salesforce.limits.fetch_success', 1);

      this.logger.info('Fetched org limits', { count: Object.keys(limits).length });

      return limits;
    } catch (error) {
      this.metrics.increment('salesforce.limits.fetch_error', 1);
      this.logger.error('Failed to fetch org limits', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Fetches a specific limit by name.
   */
  async getLimit(limitName: string): Promise<LimitInfo | undefined> {
    this.logger.debug('Fetching specific limit', { limitName });

    const limits = await this.getLimits();
    const limit = limits[limitName];

    if (!limit) {
      this.logger.warn('Limit not found', { limitName });
      this.metrics.increment('salesforce.limits.not_found', 1, { limit: limitName });
    }

    return limit;
  }

  /**
   * Extracts and tracks limit information from response headers.
   *
   * The Sforce-Limit-Info header contains semi-colon separated limit entries:
   * "api-usage=150/15000;per-app-api-usage=50/5000"
   */
  trackFromHeaders(headers: Record<string, string>): void {
    // Headers are typically lowercase in fetch API
    const limitInfo = headers['sforce-limit-info'] ?? headers['Sforce-Limit-Info'];

    if (!limitInfo) {
      return;
    }

    this.logger.debug('Tracking limits from header', { limitInfo });

    try {
      // Parse header: "api-usage=150/15000;per-app-api-usage=50/5000"
      const entries = limitInfo.split(';');

      for (const entry of entries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;

        const [name, value] = trimmed.split('=');
        if (!name || !value) continue;

        const [usedStr, maxStr] = value.split('/');
        if (!usedStr || !maxStr) continue;

        const used = parseInt(usedStr, 10);
        const max = parseInt(maxStr, 10);

        if (isNaN(used) || isNaN(max)) {
          this.logger.warn('Invalid limit values in header', { name, value });
          continue;
        }

        const remaining = max - used;

        // Convert header name to standard limit name (e.g., "api-usage" -> "DailyApiRequests")
        const limitName = this.normalizeLimitName(name);

        this.trackedLimits[limitName] = {
          Max: max,
          Remaining: remaining,
        };

        // Emit metrics
        const usedPercent = (used / max) * 100;
        this.metrics.gauge('salesforce.limits.tracked.max', max, { limit: limitName });
        this.metrics.gauge('salesforce.limits.tracked.remaining', remaining, { limit: limitName });
        this.metrics.gauge('salesforce.limits.tracked.used_percent', usedPercent, { limit: limitName });

        this.logger.debug('Tracked limit from header', {
          limitName,
          used,
          max,
          remaining,
          usedPercent: usedPercent.toFixed(2)
        });
      }

      this.metrics.increment('salesforce.limits.header_tracked', 1);
    } catch (error) {
      this.logger.error('Failed to parse limit header', {
        limitInfo,
        error: error instanceof Error ? error.message : String(error)
      });
      this.metrics.increment('salesforce.limits.header_parse_error', 1);
    }
  }

  /**
   * Gets currently tracked limits from headers.
   */
  getCurrentTracking(): SalesforceLimits {
    return { ...this.trackedLimits };
  }

  /**
   * Normalizes header limit names to standard limit names.
   */
  private normalizeLimitName(headerName: string): string {
    const normalizations: Record<string, string> = {
      'api-usage': LimitNames.DailyApiRequests,
      'per-app-api-usage': 'PerAppDailyApiRequests',
    };

    return normalizations[headerName] ?? headerName;
  }

  /**
   * Calculates percentage used for a limit.
   */
  private calculateUsedPercent(limitInfo: LimitInfo): number {
    if (limitInfo.Max === 0) return 0;
    const used = limitInfo.Max - limitInfo.Remaining;
    return (used / limitInfo.Max) * 100;
  }
}

// ============================================================================
// Limits Tracker
// ============================================================================

/**
 * Configuration options for LimitsTracker.
 */
export interface LimitsTrackerOptions {
  /** Warning threshold percentage (0-100). Default: 80 */
  warningThresholdPercent?: number;
  /** Critical threshold percentage (0-100). Default: 95 */
  criticalThresholdPercent?: number;
  /** Logger instance */
  logger?: Logger;
  /** Metrics collector instance */
  metrics?: MetricsCollector;
}

/**
 * Callback for limit warnings.
 */
export type LimitWarningCallback = (warning: LimitWarning) => void;

/**
 * Tracks and monitors Salesforce limits with threshold-based alerting.
 *
 * @example
 * ```typescript
 * const tracker = createLimitsTracker({
 *   warningThresholdPercent: 80,
 *   criticalThresholdPercent: 95
 * });
 *
 * tracker.onWarning((warning) => {
 *   if (warning.severity === 'critical') {
 *     pagerDuty.alert(`Critical: ${warning.limitName} at ${warning.usedPercent}%`);
 *   }
 * });
 *
 * const limits = await limitsService.getLimits();
 * tracker.update(limits);
 * ```
 */
export class LimitsTracker {
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private currentLimits: SalesforceLimits = {};
  private warningCallbacks: LimitWarningCallback[] = [];

  constructor(options: LimitsTrackerOptions = {}) {
    this.warningThreshold = options.warningThresholdPercent ?? 80;
    this.criticalThreshold = options.criticalThresholdPercent ?? 95;
    this.logger = options.logger ?? new NoopLogger();
    this.metrics = options.metrics ?? {
      increment: () => {},
      gauge: () => {},
      timing: () => {},
      histogram: () => {}
    };

    if (this.warningThreshold < 0 || this.warningThreshold > 100) {
      throw new Error('warningThresholdPercent must be between 0 and 100');
    }
    if (this.criticalThreshold < 0 || this.criticalThreshold > 100) {
      throw new Error('criticalThresholdPercent must be between 0 and 100');
    }
    if (this.criticalThreshold < this.warningThreshold) {
      throw new Error('criticalThresholdPercent must be >= warningThresholdPercent');
    }

    this.logger.info('LimitsTracker initialized', {
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold,
    });
  }

  /**
   * Updates tracked limits and checks thresholds.
   *
   * @param limits - New limits to track
   */
  update(limits: SalesforceLimits): void {
    this.currentLimits = { ...limits };
    this.logger.debug('Updated tracked limits', { count: Object.keys(limits).length });

    // Automatically check thresholds and trigger warnings
    const warnings = this.checkThresholds();

    for (const warning of warnings) {
      this.notifyWarning(warning);
    }
  }

  /**
   * Checks all tracked limits against thresholds.
   *
   * @returns Array of warnings for limits exceeding thresholds
   */
  checkThresholds(): LimitWarning[] {
    const warnings: LimitWarning[] = [];

    for (const [limitName, limitInfo] of Object.entries(this.currentLimits)) {
      const usedPercent = this.getUsagePercent(limitName);

      let severity: 'warning' | 'critical' | null = null;

      if (usedPercent >= this.criticalThreshold) {
        severity = 'critical';
      } else if (usedPercent >= this.warningThreshold) {
        severity = 'warning';
      }

      if (severity) {
        const warning: LimitWarning = {
          limitName,
          max: limitInfo.Max,
          remaining: limitInfo.Remaining,
          usedPercent,
          severity,
          timestamp: new Date(),
        };

        warnings.push(warning);

        // Emit metrics
        this.metrics.increment('salesforce.limits.threshold_exceeded', 1, {
          limit: limitName,
          severity,
        });
      }
    }

    if (warnings.length > 0) {
      this.logger.warn('Limit thresholds exceeded', {
        count: warnings.length,
        warnings: warnings.map(w => ({
          name: w.limitName,
          percent: w.usedPercent.toFixed(2),
          severity: w.severity
        }))
      });
    }

    return warnings;
  }

  /**
   * Gets the usage percentage for a specific limit.
   *
   * @param limitName - Name of the limit
   * @returns Percentage used (0-100), or 0 if limit not found
   */
  getUsagePercent(limitName: string): number {
    const limit = this.currentLimits[limitName];
    if (!limit || limit.Max === 0) {
      return 0;
    }

    const used = limit.Max - limit.Remaining;
    return (used / limit.Max) * 100;
  }

  /**
   * Registers a callback to be invoked when warnings are detected.
   *
   * @param callback - Function to call with warning details
   */
  onWarning(callback: LimitWarningCallback): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Removes a previously registered warning callback.
   *
   * @param callback - Callback to remove
   */
  offWarning(callback: LimitWarningCallback): void {
    const index = this.warningCallbacks.indexOf(callback);
    if (index !== -1) {
      this.warningCallbacks.splice(index, 1);
    }
  }

  /**
   * Gets all currently tracked limits.
   *
   * @returns Copy of current limits
   */
  getCurrentLimits(): SalesforceLimits {
    return { ...this.currentLimits };
  }

  /**
   * Gets a specific tracked limit.
   *
   * @param limitName - Name of the limit
   * @returns Limit info or undefined if not found
   */
  getLimit(limitName: string): LimitInfo | undefined {
    return this.currentLimits[limitName];
  }

  /**
   * Clears all tracked limits.
   */
  clear(): void {
    this.currentLimits = {};
    this.logger.debug('Cleared tracked limits');
  }

  /**
   * Notifies all registered callbacks about a warning.
   */
  private notifyWarning(warning: LimitWarning): void {
    for (const callback of this.warningCallbacks) {
      try {
        callback(warning);
      } catch (error) {
        this.logger.error('Error in warning callback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new LimitsService instance.
 *
 * @param client - Salesforce client instance
 * @returns LimitsService instance
 */
export function createLimitsService(client: SalesforceClient): LimitsService {
  return new LimitsServiceImpl(client);
}

/**
 * Creates a new LimitsTracker instance.
 *
 * @param options - Tracker configuration options
 * @returns LimitsTracker instance
 */
export function createLimitsTracker(options?: LimitsTrackerOptions): LimitsTracker {
  return new LimitsTracker(options);
}
