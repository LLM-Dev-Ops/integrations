/**
 * Salesforce Limits Service Example
 *
 * Demonstrates how to use the Limits service for rate limit tracking and monitoring.
 */

import {
  createSalesforceClient,
  SalesforceConfigBuilder,
} from '../src/client/index.js';
import {
  createLimitsService,
  createLimitsTracker,
  LimitNames,
  type LimitWarning,
} from '../src/services/limits.js';
import { createConsoleObservability, LogLevel } from '../src/observability/index.js';

/**
 * Example 1: Basic limits fetching
 */
async function basicLimitsFetching() {
  console.log('\n=== Example 1: Basic Limits Fetching ===\n');

  // Create client
  const config = new SalesforceConfigBuilder()
    .withAuth({
      type: 'refresh_token',
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
      refreshToken: process.env.SALESFORCE_REFRESH_TOKEN!,
    })
    .withInstanceUrl(process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com')
    .build();

  const observability = createConsoleObservability(LogLevel.INFO);
  const client = createSalesforceClient(config, observability);

  // Create limits service
  const limitsService = createLimitsService(client);

  try {
    // Fetch all org limits
    const limits = await limitsService.getLimits();

    console.log('Total limits retrieved:', Object.keys(limits).length);

    // Access specific limits
    const apiLimit = limits[LimitNames.DailyApiRequests];
    if (apiLimit) {
      const used = apiLimit.Max - apiLimit.Remaining;
      const usedPercent = ((used / apiLimit.Max) * 100).toFixed(2);

      console.log('\nDaily API Requests:');
      console.log(`  Max: ${apiLimit.Max}`);
      console.log(`  Remaining: ${apiLimit.Remaining}`);
      console.log(`  Used: ${used} (${usedPercent}%)`);
    }

    // Check bulk API limits
    const bulkLimit = limits[LimitNames.DailyBulkApiRequests];
    if (bulkLimit) {
      console.log('\nDaily Bulk API Requests:');
      console.log(`  Max: ${bulkLimit.Max}`);
      console.log(`  Remaining: ${bulkLimit.Remaining}`);
    }
  } catch (error) {
    console.error('Error fetching limits:', error);
  }
}

/**
 * Example 2: Get a specific limit
 */
async function getSpecificLimit() {
  console.log('\n=== Example 2: Get Specific Limit ===\n');

  const config = new SalesforceConfigBuilder()
    .withAuth({
      type: 'refresh_token',
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
      refreshToken: process.env.SALESFORCE_REFRESH_TOKEN!,
    })
    .withInstanceUrl(process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com')
    .build();

  const client = createSalesforceClient(config);
  const limitsService = createLimitsService(client);

  try {
    // Get specific limit
    const apiLimit = await limitsService.getLimit(LimitNames.DailyApiRequests);

    if (apiLimit) {
      console.log('Daily API Requests limit found:');
      console.log(JSON.stringify(apiLimit, null, 2));
    } else {
      console.log('Daily API Requests limit not found');
    }
  } catch (error) {
    console.error('Error fetching limit:', error);
  }
}

/**
 * Example 3: Track limits from response headers
 */
async function trackFromHeaders() {
  console.log('\n=== Example 3: Track from Response Headers ===\n');

  const config = new SalesforceConfigBuilder()
    .withAuth({
      type: 'refresh_token',
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
      refreshToken: process.env.SALESFORCE_REFRESH_TOKEN!,
    })
    .withInstanceUrl(process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com')
    .build();

  const observability = createConsoleObservability(LogLevel.DEBUG);
  const client = createSalesforceClient(config, observability);
  const limitsService = createLimitsService(client);

  // Simulate response headers from an API call
  const mockHeaders = {
    'sforce-limit-info': 'api-usage=1250/15000;per-app-api-usage=450/5000',
  };

  // Track limits from headers
  limitsService.trackFromHeaders(mockHeaders);

  // Get current tracking
  const tracked = limitsService.getCurrentTracking();
  console.log('Tracked limits from headers:');
  console.log(JSON.stringify(tracked, null, 2));
}

/**
 * Example 4: Limits monitoring with tracker
 */
async function limitsMonitoring() {
  console.log('\n=== Example 4: Limits Monitoring with Tracker ===\n');

  const config = new SalesforceConfigBuilder()
    .withAuth({
      type: 'refresh_token',
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
      refreshToken: process.env.SALESFORCE_REFRESH_TOKEN!,
    })
    .withInstanceUrl(process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com')
    .build();

  const observability = createConsoleObservability(LogLevel.INFO);
  const client = createSalesforceClient(config, observability);
  const limitsService = createLimitsService(client);

  // Create tracker with custom thresholds
  const tracker = createLimitsTracker({
    warningThresholdPercent: 75,
    criticalThresholdPercent: 90,
    logger: observability.logger,
    metrics: observability.metrics,
  });

  // Register warning callback
  tracker.onWarning((warning: LimitWarning) => {
    const severity = warning.severity.toUpperCase();
    console.log(
      `[${severity}] ${warning.limitName}: ${warning.usedPercent.toFixed(2)}% used ` +
      `(${warning.max - warning.remaining}/${warning.max})`
    );

    if (warning.severity === 'critical') {
      // In production, you might send alerts to PagerDuty, Slack, etc.
      console.log('  >>> ALERT: Critical threshold exceeded! <<<');
    }
  });

  try {
    // Fetch and update limits
    const limits = await limitsService.getLimits();
    tracker.update(limits);

    // Check specific limit
    const apiUsage = tracker.getUsagePercent(LimitNames.DailyApiRequests);
    console.log(`\nDaily API Requests usage: ${apiUsage.toFixed(2)}%`);

    // Get all warnings
    const warnings = tracker.checkThresholds();
    if (warnings.length === 0) {
      console.log('\nNo limits exceeding thresholds');
    } else {
      console.log(`\n${warnings.length} limit(s) exceeding thresholds`);
    }
  } catch (error) {
    console.error('Error monitoring limits:', error);
  }
}

/**
 * Example 5: Periodic limit monitoring
 */
async function periodicMonitoring() {
  console.log('\n=== Example 5: Periodic Limit Monitoring ===\n');

  const config = new SalesforceConfigBuilder()
    .withAuth({
      type: 'refresh_token',
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
      refreshToken: process.env.SALESFORCE_REFRESH_TOKEN!,
    })
    .withInstanceUrl(process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com')
    .build();

  const observability = createConsoleObservability(LogLevel.INFO);
  const client = createSalesforceClient(config, observability);
  const limitsService = createLimitsService(client);
  const tracker = createLimitsTracker({
    warningThresholdPercent: 80,
    criticalThresholdPercent: 95,
  });

  // Set up warning handler
  tracker.onWarning((warning) => {
    console.log(
      `[${warning.severity.toUpperCase()}] ${warning.limitName} at ${warning.usedPercent.toFixed(2)}%`
    );
  });

  // Monitor limits periodically (every 5 minutes in production)
  const monitoringIntervalMs = 5 * 60 * 1000; // 5 minutes

  console.log(`Starting periodic monitoring (interval: ${monitoringIntervalMs / 1000}s)`);
  console.log('Press Ctrl+C to stop\n');

  let iteration = 0;

  const monitor = async () => {
    iteration++;
    console.log(`\n--- Monitoring iteration ${iteration} ---`);

    try {
      const limits = await limitsService.getLimits();
      tracker.update(limits);

      // Log key metrics
      const apiUsage = tracker.getUsagePercent(LimitNames.DailyApiRequests);
      const bulkUsage = tracker.getUsagePercent(LimitNames.DailyBulkApiRequests);

      console.log(`API Requests: ${apiUsage.toFixed(2)}%`);
      console.log(`Bulk API Requests: ${bulkUsage.toFixed(2)}%`);

      const warnings = tracker.checkThresholds();
      console.log(`Warnings: ${warnings.length}`);
    } catch (error) {
      console.error('Error during monitoring:', error);
    }
  };

  // Run initial check
  await monitor();

  // For demo purposes, we'll just run once
  // In production, you would use setInterval:
  // setInterval(monitor, monitoringIntervalMs);
}

/**
 * Example 6: Advanced usage - combining tracking and monitoring
 */
async function advancedUsage() {
  console.log('\n=== Example 6: Advanced Usage ===\n');

  const config = new SalesforceConfigBuilder()
    .withAuth({
      type: 'refresh_token',
      clientId: process.env.SALESFORCE_CLIENT_ID!,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
      refreshToken: process.env.SALESFORCE_REFRESH_TOKEN!,
    })
    .withInstanceUrl(process.env.SALESFORCE_INSTANCE_URL ?? 'https://login.salesforce.com')
    .build();

  const observability = createConsoleObservability(LogLevel.DEBUG);
  const client = createSalesforceClient(config, observability);
  const limitsService = createLimitsService(client);
  const tracker = createLimitsTracker({
    warningThresholdPercent: 70,
    criticalThresholdPercent: 85,
    logger: observability.logger,
    metrics: observability.metrics,
  });

  // Multi-level warning handlers
  const warningHandlers: Array<(warning: LimitWarning) => void> = [
    // Handler 1: Console logging
    (warning) => {
      console.log(`[Console] ${warning.limitName}: ${warning.usedPercent.toFixed(2)}%`);
    },

    // Handler 2: Metrics (simulated)
    (warning) => {
      console.log(`[Metrics] Recording ${warning.limitName} threshold breach`);
      // In production: metrics.increment('salesforce.limit.threshold_breach', ...)
    },

    // Handler 3: Alerting (simulated)
    (warning) => {
      if (warning.severity === 'critical') {
        console.log(`[Alerting] Critical alert for ${warning.limitName}!`);
        // In production: pagerDuty.trigger(...) or slack.sendMessage(...)
      }
    },
  ];

  // Register all handlers
  warningHandlers.forEach((handler) => tracker.onWarning(handler));

  try {
    // Fetch limits from API
    const limits = await limitsService.getLimits();
    tracker.update(limits);

    // Simulate tracking from headers during operations
    limitsService.trackFromHeaders({
      'sforce-limit-info': 'api-usage=12800/15000',
    });

    // Get comprehensive view
    const currentLimits = tracker.getCurrentLimits();
    const headerTracked = limitsService.getCurrentTracking();

    console.log('\nAPI-fetched limits count:', Object.keys(currentLimits).length);
    console.log('Header-tracked limits count:', Object.keys(headerTracked).length);

    // Analyze specific high-value limits
    const criticalLimits = [
      LimitNames.DailyApiRequests,
      LimitNames.DailyBulkApiRequests,
      LimitNames.DailyStreamingApiEvents,
    ];

    console.log('\nCritical limits status:');
    for (const limitName of criticalLimits) {
      const limit = tracker.getLimit(limitName);
      if (limit) {
        const usage = tracker.getUsagePercent(limitName);
        console.log(`  ${limitName}: ${usage.toFixed(2)}% (${limit.Remaining}/${limit.Max} remaining)`);
      }
    }
  } catch (error) {
    console.error('Error in advanced usage:', error);
  }
}

/**
 * Run all examples
 */
async function main() {
  console.log('Salesforce Limits Service Examples');
  console.log('===================================');

  // Check for required environment variables
  const required = [
    'SALESFORCE_CLIENT_ID',
    'SALESFORCE_CLIENT_SECRET',
    'SALESFORCE_REFRESH_TOKEN',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('\nMissing required environment variables:');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('\nPlease set these variables and try again.');
    process.exit(1);
  }

  try {
    // Run examples (comment out as needed)
    await basicLimitsFetching();
    await getSpecificLimit();
    await trackFromHeaders();
    await limitsMonitoring();
    await periodicMonitoring();
    await advancedUsage();

    console.log('\n=== All examples completed successfully ===\n');
  } catch (error) {
    console.error('\nError running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
