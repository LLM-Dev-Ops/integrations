# Salesforce Limits Service

Production-ready rate limit tracking and monitoring for Salesforce API integrations following SPARC specification.

## Overview

The Limits service provides comprehensive tracking and monitoring of Salesforce org-wide limits including:

- **Daily API Requests** - Track REST API call usage
- **Bulk API Requests** - Monitor bulk operation limits
- **Streaming API Events** - Track event publication and consumption
- **Storage Limits** - Monitor data and file storage usage
- **Concurrent Limits** - Track concurrent operation thresholds

## Features

- ✅ Fetch all org limits via `/limits` REST endpoint
- ✅ Extract rate limit info from response headers (`Sforce-Limit-Info`)
- ✅ Threshold-based monitoring with warning and critical alerts
- ✅ Comprehensive metrics emission for observability
- ✅ Type-safe limit name constants
- ✅ Flexible callback system for custom alerting

## Installation

```typescript
import { createLimitsService, createLimitsTracker } from './services/limits.js';
```

## Quick Start

### Basic Usage

```typescript
import { createSalesforceClient } from './client/index.js';
import { createLimitsService, LimitNames } from './services/limits.js';

// Create client and limits service
const client = createSalesforceClient(config);
const limitsService = createLimitsService(client);

// Fetch all limits
const limits = await limitsService.getLimits();
console.log('Daily API Requests:', limits[LimitNames.DailyApiRequests]);

// Get specific limit
const apiLimit = await limitsService.getLimit(LimitNames.DailyApiRequests);
console.log(`API usage: ${apiLimit.Max - apiLimit.Remaining}/${apiLimit.Max}`);
```

### Header Tracking

```typescript
// After making an API request
const response = await client.request({ method: 'GET', path: '/sobjects/Account' });

// Track limits from response headers
limitsService.trackFromHeaders(response.headers);

// Get tracked values
const tracked = limitsService.getCurrentTracking();
```

### Monitoring with Alerts

```typescript
import { createLimitsTracker } from './services/limits.js';

// Create tracker with custom thresholds
const tracker = createLimitsTracker({
  warningThresholdPercent: 80,   // Warning at 80%
  criticalThresholdPercent: 95,  // Critical at 95%
});

// Register alert handlers
tracker.onWarning((warning) => {
  if (warning.severity === 'critical') {
    pagerDuty.trigger({
      title: `Salesforce Limit Critical: ${warning.limitName}`,
      details: `${warning.usedPercent.toFixed(2)}% used`,
    });
  } else {
    slack.sendMessage({
      text: `Warning: ${warning.limitName} at ${warning.usedPercent.toFixed(2)}%`,
    });
  }
});

// Update and check
const limits = await limitsService.getLimits();
tracker.update(limits);
```

## API Reference

### LimitsService

#### `getLimits(): Promise<SalesforceLimits>`

Fetches all org limits from Salesforce `/limits` endpoint.

```typescript
const limits = await limitsService.getLimits();
// Returns: { DailyApiRequests: { Max: 15000, Remaining: 14850 }, ... }
```

#### `getLimit(limitName: string): Promise<LimitInfo | undefined>`

Fetches a specific limit by name.

```typescript
const apiLimit = await limitsService.getLimit('DailyApiRequests');
// Returns: { Max: 15000, Remaining: 14850 } or undefined
```

#### `trackFromHeaders(headers: Record<string, string>): void`

Extracts and tracks limit information from response headers.

```typescript
limitsService.trackFromHeaders({
  'sforce-limit-info': 'api-usage=150/15000;per-app-api-usage=50/5000'
});
```

**Header Format:**
```
Sforce-Limit-Info: api-usage=<used>/<max>;per-app-api-usage=<used>/<max>
```

#### `getCurrentTracking(): SalesforceLimits`

Returns currently tracked limits from headers.

```typescript
const tracked = limitsService.getCurrentTracking();
```

### LimitsTracker

#### `constructor(options?: LimitsTrackerOptions)`

Creates a new limits tracker with optional configuration.

```typescript
const tracker = createLimitsTracker({
  warningThresholdPercent: 80,
  criticalThresholdPercent: 95,
  logger: customLogger,
  metrics: customMetrics,
});
```

**Options:**
- `warningThresholdPercent` (default: 80) - Warning threshold percentage (0-100)
- `criticalThresholdPercent` (default: 95) - Critical threshold percentage (0-100)
- `logger` - Optional logger instance
- `metrics` - Optional metrics collector

#### `update(limits: SalesforceLimits): void`

Updates tracked limits and automatically checks thresholds.

```typescript
const limits = await limitsService.getLimits();
tracker.update(limits);
```

#### `checkThresholds(): LimitWarning[]`

Manually checks all limits against thresholds.

```typescript
const warnings = tracker.checkThresholds();
warnings.forEach(w => {
  console.log(`${w.limitName}: ${w.usedPercent.toFixed(2)}% (${w.severity})`);
});
```

#### `getUsagePercent(limitName: string): number`

Gets usage percentage for a specific limit.

```typescript
const apiUsage = tracker.getUsagePercent('DailyApiRequests');
console.log(`API usage: ${apiUsage.toFixed(2)}%`);
```

#### `onWarning(callback: LimitWarningCallback): void`

Registers a callback for limit warnings.

```typescript
tracker.onWarning((warning) => {
  console.log(`${warning.limitName} at ${warning.usedPercent}%`);
});
```

#### `offWarning(callback: LimitWarningCallback): void`

Removes a previously registered callback.

```typescript
tracker.offWarning(myCallback);
```

## Types

### LimitInfo

```typescript
interface LimitInfo {
  Max: number;       // Maximum allowed value
  Remaining: number; // Remaining available value
}
```

### SalesforceLimits

```typescript
interface SalesforceLimits {
  [limitName: string]: LimitInfo;
}
```

### LimitWarning

```typescript
interface LimitWarning {
  limitName: string;
  max: number;
  remaining: number;
  usedPercent: number;      // 0-100
  severity: 'warning' | 'critical';
  timestamp: Date;
}
```

### LimitNames Constants

```typescript
export const LimitNames = {
  // Daily limits
  DailyApiRequests: 'DailyApiRequests',
  DailyBulkApiRequests: 'DailyBulkApiRequests',
  DailyBulkV2QueryJobs: 'DailyBulkV2QueryJobs',
  DailyStreamingApiEvents: 'DailyStreamingApiEvents',

  // Hourly limits
  HourlyDashboardRefreshes: 'HourlyDashboardRefreshes',
  HourlyTimeBasedWorkflow: 'HourlyTimeBasedWorkflow',

  // Storage
  DataStorageMB: 'DataStorageMB',
  FileStorageMB: 'FileStorageMB',

  // And many more...
} as const;
```

## Metrics Emitted

The limits service emits the following metrics:

### Gauge Metrics
- `salesforce.limits.max` - Maximum value for each limit
- `salesforce.limits.remaining` - Remaining value for each limit
- `salesforce.limits.used_percent` - Usage percentage (0-100)
- `salesforce.limits.tracked.max` - Max from header tracking
- `salesforce.limits.tracked.remaining` - Remaining from header tracking
- `salesforce.limits.tracked.used_percent` - Usage % from headers

### Counter Metrics
- `salesforce.limits.fetch_success` - Successful limit fetches
- `salesforce.limits.fetch_error` - Failed limit fetches
- `salesforce.limits.header_tracked` - Headers successfully parsed
- `salesforce.limits.header_parse_error` - Header parse failures
- `salesforce.limits.not_found` - Limit not found errors
- `salesforce.limits.threshold_exceeded` - Threshold violations

All metrics include tags for `limit` name and `severity` where applicable.

## Production Patterns

### Periodic Monitoring

```typescript
import { createLimitsService, createLimitsTracker } from './services/limits.js';

const limitsService = createLimitsService(client);
const tracker = createLimitsTracker({
  warningThresholdPercent: 75,
  criticalThresholdPercent: 90,
});

// Monitor every 5 minutes
setInterval(async () => {
  try {
    const limits = await limitsService.getLimits();
    tracker.update(limits);

    // Log key metrics
    const apiUsage = tracker.getUsagePercent('DailyApiRequests');
    logger.info('API usage', { percent: apiUsage });
  } catch (error) {
    logger.error('Failed to monitor limits', { error });
  }
}, 5 * 60 * 1000);
```

### Integrated with Request Pipeline

```typescript
import { createLimitsService } from './services/limits.js';

const limitsService = createLimitsService(client);

// In your request wrapper
async function makeRequest(options: RequestOptions) {
  const response = await client.request(options);

  // Track limits from every response
  limitsService.trackFromHeaders(response.headers);

  return response;
}
```

### Multi-level Alerting

```typescript
const tracker = createLimitsTracker({
  warningThresholdPercent: 70,
  criticalThresholdPercent: 85,
});

// Level 1: Logging
tracker.onWarning((warning) => {
  logger.warn('Limit threshold exceeded', {
    limit: warning.limitName,
    percent: warning.usedPercent,
    severity: warning.severity,
  });
});

// Level 2: Metrics
tracker.onWarning((warning) => {
  metrics.increment('salesforce.limit.warning', 1, {
    limit: warning.limitName,
    severity: warning.severity,
  });
});

// Level 3: External alerting
tracker.onWarning(async (warning) => {
  if (warning.severity === 'critical') {
    await pagerDuty.trigger({
      title: `Salesforce ${warning.limitName} at ${warning.usedPercent}%`,
      severity: 'critical',
      details: {
        remaining: warning.remaining,
        max: warning.max,
      },
    });
  }
});
```

### Rate Limiting Based on Limits

```typescript
const limitsService = createLimitsService(client);

async function beforeRequest() {
  const apiLimit = await limitsService.getLimit('DailyApiRequests');

  if (apiLimit && apiLimit.Remaining < 100) {
    throw new Error('API limit critically low, throttling requests');
  }
}
```

## Best Practices

1. **Monitor Regularly**: Check limits every 5-15 minutes in production
2. **Set Conservative Thresholds**: Use 80% warning, 95% critical
3. **Track from Headers**: Always extract limit info from response headers
4. **Combine Sources**: Use both API fetching and header tracking
5. **Alert Appropriately**: Critical → PagerDuty, Warning → Slack/Email
6. **Cache Results**: Limits don't change frequently, cache for 1-5 minutes
7. **Handle Errors**: Gracefully handle API failures when fetching limits
8. **Log Context**: Include limit names and percentages in all logs

## Common Limits

| Limit Name | Description | Typical Max |
|------------|-------------|-------------|
| DailyApiRequests | REST API calls per day | 15,000 - 100,000+ |
| DailyBulkApiRequests | Bulk API requests per day | 5,000 - 10,000 |
| DailyBulkV2QueryJobs | Bulk Query jobs per day | 10,000 |
| DailyStreamingApiEvents | Streaming events per day | 25,000 - 100,000+ |
| HourlyTimeBasedWorkflow | Time-based workflows per hour | 1,000 |
| DataStorageMB | Data storage in MB | Varies by org |
| FileStorageMB | File storage in MB | Varies by org |

## Error Handling

```typescript
try {
  const limits = await limitsService.getLimits();
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Handle authentication failure
    logger.error('Auth failed, limits unavailable');
  } else if (error instanceof NetworkError) {
    // Handle network issues
    logger.warn('Network error fetching limits, using cached values');
  } else {
    // Handle other errors
    logger.error('Unexpected error', { error });
  }
}
```

## Testing

```typescript
import { createLimitsService, createLimitsTracker } from './services/limits.js';
import { createInMemoryObservability } from './observability/index.js';

// Create mock client for testing
const mockClient = {
  get: async (path: string) => ({
    DailyApiRequests: { Max: 15000, Remaining: 14850 },
  }),
  logger: new NoopLogger(),
  metrics: new NoopMetricsCollector(),
};

const limitsService = createLimitsService(mockClient);
const limits = await limitsService.getLimits();

assert.equal(limits.DailyApiRequests.Max, 15000);
```

## Troubleshooting

### No limits in response

**Problem**: `getLimits()` returns empty object

**Solution**: Check API version compatibility. Limits endpoint requires API v29.0+

### Header tracking not working

**Problem**: `trackFromHeaders()` not extracting values

**Solution**: Check header casing. Try both `sforce-limit-info` and `Sforce-Limit-Info`

### False warnings

**Problem**: Getting warnings despite low usage

**Solution**: Verify threshold configuration. Default thresholds may be too conservative for your use case

## Related Documentation

- [Salesforce Limits REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm)
- [API Request Limits](https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/salesforce_app_limits_platform_api.htm)
- [SPARC Specification](../../docs/SPARC.md)

## License

See LICENSE file in repository root.
