/**
 * Standalone Limits Service Example
 *
 * Demonstrates the Limits service API without requiring a full Salesforce client.
 * This is useful for testing and understanding the service interface.
 */

import {
  createLimitsService,
  createLimitsTracker,
  LimitNames,
  type LimitInfo,
  type SalesforceLimits,
  type LimitWarning,
  type SalesforceClient,
} from '../src/services/limits.js';
import { NoopLogger } from '../src/observability/index.js';

/**
 * Mock Salesforce client for demonstration
 */
class MockSalesforceClient implements SalesforceClient {
  logger = new NoopLogger();
  metrics = {
    increment: () => {},
    gauge: () => {},
    timing: () => {},
    histogram: () => {},
  };

  async get<T>(path: string): Promise<T> {
    if (path === '/limits') {
      // Simulate Salesforce limits response
      return {
        DailyApiRequests: { Max: 15000, Remaining: 12500 },
        DailyBulkApiRequests: { Max: 5000, Remaining: 4800 },
        DailyBulkV2QueryJobs: { Max: 10000, Remaining: 9950 },
        DailyStreamingApiEvents: { Max: 100000, Remaining: 85000 },
        HourlyTimeBasedWorkflow: { Max: 1000, Remaining: 950 },
        DataStorageMB: { Max: 5120, Remaining: 2048 },
        FileStorageMB: { Max: 10240, Remaining: 8192 },
      } as T;
    }
    throw new Error(`Unknown path: ${path}`);
  }
}

/**
 * Example 1: Basic limits fetching
 */
async function example1_BasicFetching() {
  console.log('\n=== Example 1: Basic Limits Fetching ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);

  // Fetch all limits
  const limits = await limitsService.getLimits();

  console.log('Total limits:', Object.keys(limits).length);
  console.log('\nLimits breakdown:');

  for (const [name, info] of Object.entries(limits)) {
    const used = info.Max - info.Remaining;
    const usedPercent = ((used / info.Max) * 100).toFixed(2);
    console.log(`  ${name}: ${used}/${info.Max} (${usedPercent}%)`);
  }

  // Get specific limit
  const apiLimit = await limitsService.getLimit(LimitNames.DailyApiRequests);
  if (apiLimit) {
    console.log(`\nDaily API Requests: ${apiLimit.Max - apiLimit.Remaining}/${apiLimit.Max}`);
  }
}

/**
 * Example 2: Header tracking
 */
async function example2_HeaderTracking() {
  console.log('\n=== Example 2: Header Tracking ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);

  // Simulate tracking from multiple API responses
  console.log('Tracking from response headers...\n');

  const headers1 = {
    'sforce-limit-info': 'api-usage=2500/15000',
  };
  limitsService.trackFromHeaders(headers1);
  console.log('After request 1:', limitsService.getCurrentTracking());

  const headers2 = {
    'sforce-limit-info': 'api-usage=2550/15000;per-app-api-usage=850/5000',
  };
  limitsService.trackFromHeaders(headers2);
  console.log('After request 2:', limitsService.getCurrentTracking());

  const headers3 = {
    'sforce-limit-info': 'api-usage=2650/15000',
  };
  limitsService.trackFromHeaders(headers3);
  console.log('After request 3:', limitsService.getCurrentTracking());
}

/**
 * Example 3: Threshold monitoring
 */
async function example3_ThresholdMonitoring() {
  console.log('\n=== Example 3: Threshold Monitoring ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);

  // Create tracker with low thresholds to trigger warnings
  const tracker = createLimitsTracker({
    warningThresholdPercent: 10, // Warning at 10% (for demo)
    criticalThresholdPercent: 20, // Critical at 20% (for demo)
  });

  // Register warning handler
  const warnings: LimitWarning[] = [];
  tracker.onWarning((warning) => {
    warnings.push(warning);
    console.log(
      `[${warning.severity.toUpperCase()}] ${warning.limitName}: ` +
      `${warning.usedPercent.toFixed(2)}% used`
    );
  });

  // Fetch and update
  const limits = await limitsService.getLimits();
  tracker.update(limits);

  console.log(`\nTotal warnings triggered: ${warnings.length}`);
  console.log('\nWarning details:');
  warnings.forEach((w) => {
    console.log(`  - ${w.limitName}: ${w.max - w.remaining}/${w.max} (${w.severity})`);
  });
}

/**
 * Example 4: Realistic threshold monitoring
 */
async function example4_RealisticMonitoring() {
  console.log('\n=== Example 4: Realistic Monitoring ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);

  // Create tracker with production-like thresholds
  const tracker = createLimitsTracker({
    warningThresholdPercent: 80,
    criticalThresholdPercent: 95,
  });

  let warningCount = 0;
  let criticalCount = 0;

  tracker.onWarning((warning) => {
    if (warning.severity === 'critical') {
      criticalCount++;
      console.log(`[CRITICAL] ${warning.limitName} at ${warning.usedPercent.toFixed(2)}%`);
    } else {
      warningCount++;
      console.log(`[WARNING] ${warning.limitName} at ${warning.usedPercent.toFixed(2)}%`);
    }
  });

  const limits = await limitsService.getLimits();
  tracker.update(limits);

  console.log(`\nWarnings: ${warningCount}`);
  console.log(`Critical: ${criticalCount}`);

  // Check individual limit usage
  console.log('\nKey limit usage:');
  const keyLimits = [
    LimitNames.DailyApiRequests,
    LimitNames.DailyBulkApiRequests,
    LimitNames.DailyStreamingApiEvents,
  ];

  for (const limitName of keyLimits) {
    const usage = tracker.getUsagePercent(limitName);
    console.log(`  ${limitName}: ${usage.toFixed(2)}%`);
  }
}

/**
 * Example 5: Advanced usage patterns
 */
async function example5_AdvancedPatterns() {
  console.log('\n=== Example 5: Advanced Usage Patterns ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);
  const tracker = createLimitsTracker({
    warningThresholdPercent: 75,
    criticalThresholdPercent: 90,
  });

  // Multiple warning handlers
  console.log('Setting up multi-level alerting...\n');

  // Handler 1: Logging
  tracker.onWarning((warning) => {
    console.log(`[LOG] ${warning.limitName}: ${warning.usedPercent.toFixed(2)}%`);
  });

  // Handler 2: Metrics (simulated)
  const metricsLog: Array<{ name: string; value: number }> = [];
  tracker.onWarning((warning) => {
    metricsLog.push({
      name: `limit.${warning.limitName}.threshold_exceeded`,
      value: warning.usedPercent,
    });
  });

  // Handler 3: Alerting (simulated)
  const alerts: Array<{ severity: string; message: string }> = [];
  tracker.onWarning((warning) => {
    if (warning.severity === 'critical') {
      alerts.push({
        severity: 'critical',
        message: `${warning.limitName} critically low: ${warning.remaining}/${warning.max} remaining`,
      });
    }
  });

  // Fetch and process
  const limits = await limitsService.getLimits();
  tracker.update(limits);

  // Also track from headers
  limitsService.trackFromHeaders({
    'sforce-limit-info': 'api-usage=12500/15000',
  });

  console.log(`Metrics recorded: ${metricsLog.length}`);
  console.log(`Alerts triggered: ${alerts.length}`);

  if (alerts.length > 0) {
    console.log('\nAlerts:');
    alerts.forEach((alert) => {
      console.log(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
    });
  }

  // Get comprehensive view
  const apiTracked = limitsService.getCurrentTracking();
  const trackedLimits = tracker.getCurrentLimits();

  console.log(`\nAPI-fetched limits: ${Object.keys(trackedLimits).length}`);
  console.log(`Header-tracked limits: ${Object.keys(apiTracked).length}`);
}

/**
 * Example 6: Usage percentage calculation
 */
async function example6_UsageCalculation() {
  console.log('\n=== Example 6: Usage Percentage Calculation ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);
  const tracker = createLimitsTracker();

  const limits = await limitsService.getLimits();
  tracker.update(limits);

  console.log('Usage percentages:\n');

  const sortedLimits = Object.entries(limits)
    .map(([name, info]) => ({
      name,
      usage: tracker.getUsagePercent(name),
      used: info.Max - info.Remaining,
      max: info.Max,
    }))
    .sort((a, b) => b.usage - a.usage);

  sortedLimits.forEach((limit) => {
    const bar = '█'.repeat(Math.floor(limit.usage / 5));
    console.log(
      `  ${limit.name.padEnd(30)} ${limit.usage.toFixed(1).padStart(5)}% [${bar}]`
    );
  });
}

/**
 * Example 7: Limit type categorization
 */
async function example7_LimitCategorization() {
  console.log('\n=== Example 7: Limit Categorization ===\n');

  const client = new MockSalesforceClient();
  const limitsService = createLimitsService(client);
  const limits = await limitsService.getLimits();

  // Categorize limits
  const categories = {
    daily: [] as string[],
    hourly: [] as string[],
    storage: [] as string[],
    other: [] as string[],
  };

  for (const name of Object.keys(limits)) {
    if (name.startsWith('Daily')) {
      categories.daily.push(name);
    } else if (name.startsWith('Hourly')) {
      categories.hourly.push(name);
    } else if (name.includes('Storage')) {
      categories.storage.push(name);
    } else {
      categories.other.push(name);
    }
  }

  console.log('Daily Limits:', categories.daily.length);
  categories.daily.forEach((name) => {
    const info = limits[name];
    console.log(`  - ${name}: ${info.Remaining}/${info.Max}`);
  });

  console.log('\nHourly Limits:', categories.hourly.length);
  categories.hourly.forEach((name) => {
    const info = limits[name];
    console.log(`  - ${name}: ${info.Remaining}/${info.Max}`);
  });

  console.log('\nStorage Limits:', categories.storage.length);
  categories.storage.forEach((name) => {
    const info = limits[name];
    const usedMB = info.Max - info.Remaining;
    const usedGB = (usedMB / 1024).toFixed(2);
    const maxGB = (info.Max / 1024).toFixed(2);
    console.log(`  - ${name}: ${usedGB}GB / ${maxGB}GB`);
  });
}

/**
 * Run all examples
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Salesforce Limits Service - Standalone Examples         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await example1_BasicFetching();
    await example2_HeaderTracking();
    await example3_ThresholdMonitoring();
    await example4_RealisticMonitoring();
    await example5_AdvancedPatterns();
    await example6_UsageCalculation();
    await example7_LimitCategorization();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   All examples completed successfully!                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples
main();
