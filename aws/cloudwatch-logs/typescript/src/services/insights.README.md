# CloudWatch Logs Insights Service

The `InsightsService` provides a comprehensive interface for executing CloudWatch Logs Insights queries, including convenience methods for correlation and automatic result polling.

## Overview

CloudWatch Logs Insights is a fully integrated log analytics service that enables you to interactively search and analyze your log data. The `InsightsService` provides:

- **Query Execution**: Start and manage Insights queries
- **Automatic Polling**: Convenience methods that wait for query completion
- **Correlation Support**: Built-in methods for querying by trace ID and request ID
- **Result Parsing**: Automatic parsing of query results into structured objects

## Interface

### Core Methods

#### `startQuery(request: StartQueryRequest): Promise<StartQueryResponse>`

Starts a CloudWatch Logs Insights query and returns immediately with a query ID.

**Parameters:**
- `logGroupNames`: Array of log group names to query (max 50)
- `startTime`: Query start time (Unix epoch seconds, not milliseconds)
- `endTime`: Query end time (Unix epoch seconds, not milliseconds)
- `queryString`: CloudWatch Logs Insights query string
- `limit` (optional): Maximum number of results (default 1000, max 10000)

**Returns:** `{ queryId: string }`

**Example:**
```typescript
const response = await insights.startQuery({
  logGroupNames: ['/aws/lambda/my-function'],
  startTime: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  endTime: Math.floor(Date.now() / 1000),
  queryString: 'fields @timestamp, @message | sort @timestamp desc | limit 20'
});
console.log(`Query ID: ${response.queryId}`);
```

---

#### `getResults(queryId: string): Promise<GetQueryResultsResponse>`

Retrieves the current results for a query. The query may still be running.

**Query Statuses:**
- `Scheduled`: Query is queued
- `Running`: Query is executing
- `Complete`: Query finished successfully
- `Failed`: Query failed
- `Cancelled`: Query was cancelled
- `Timeout`: Query timed out
- `Unknown`: Status unknown

**Returns:** Query results including status, results array, and statistics

**Example:**
```typescript
const results = await insights.getResults(queryId);

if (results.status === 'Complete') {
  console.log(`Found ${results.results?.length} results`);
  console.log(`Scanned ${results.statistics?.recordsScanned} records`);
}
```

---

#### `stopQuery(queryId: string): Promise<void>`

Stops a running or scheduled query.

**Example:**
```typescript
await insights.stopQuery(queryId);
console.log('Query stopped');
```

---

#### `query(request: StartQueryRequest, timeoutMs: number): Promise<QueryResults>`

Convenience method that starts a query and automatically polls for completion.

**Features:**
- Automatic polling with exponential backoff
- Configurable timeout
- Automatic query cancellation on timeout
- Returns complete results when finished

**Parameters:**
- `request`: Same as `startQuery`
- `timeoutMs`: Maximum time to wait for results (milliseconds)

**Throws:**
- `CloudWatchLogsError` with code `TIMEOUT` if query exceeds timeout
- `CloudWatchLogsError` with code `QUERY_ERROR` if query fails, is cancelled, or has unknown status

**Example:**
```typescript
const results = await insights.query({
  logGroupNames: ['/aws/lambda/my-function'],
  startTime: Math.floor(Date.now() / 1000) - 3600,
  endTime: Math.floor(Date.now() / 1000),
  queryString: 'fields @timestamp, @message | filter @message like /ERROR/'
}, 60000); // 60 second timeout

for (const row of results.results || []) {
  const timestamp = row.find(f => f.field === '@timestamp')?.value;
  const message = row.find(f => f.field === '@message')?.value;
  console.log(`[${timestamp}] ${message}`);
}
```

---

### Correlation Methods

#### `queryByTraceId(logGroups: string[], traceId: string, timeRange: TimeRange): Promise<CorrelatedLogEvent[]>`

Queries logs across multiple log groups by trace ID for distributed tracing correlation.

**Features:**
- Searches for logs containing the specified trace ID
- Automatically parses results into structured `CorrelatedLogEvent` objects
- Sorts results by timestamp in ascending order
- Extracts correlation IDs (trace_id, request_id, span_id)
- Parses JSON log messages to extract structured fields

**Parameters:**
- `logGroups`: Array of log group names to search
- `traceId`: The trace ID to search for
- `timeRange`: Object with `start` and `end` Date objects

**Returns:** Array of `CorrelatedLogEvent` objects with parsed fields

**Example:**
```typescript
const events = await insights.queryByTraceId(
  ['/aws/lambda/service-a', '/aws/lambda/service-b'],
  'trace-abc-123-def-456',
  {
    start: new Date(Date.now() - 3600000), // 1 hour ago
    end: new Date()
  }
);

for (const event of events) {
  console.log(`[${event.service}] ${event.timestamp.toISOString()}`);
  console.log(`  Message: ${event.message}`);
  console.log(`  Stream: ${event.logStream}`);
  if (event.requestId) console.log(`  Request: ${event.requestId}`);
  if (event.spanId) console.log(`  Span: ${event.spanId}`);
}
```

---

#### `queryByRequestId(logGroups: string[], requestId: string, timeRange: TimeRange): Promise<CorrelatedLogEvent[]>`

Similar to `queryByTraceId`, but searches by request ID instead.

**Example:**
```typescript
const events = await insights.queryByRequestId(
  ['/aws/lambda/my-function'],
  'req-xyz-789',
  {
    start: new Date(Date.now() - 1800000), // 30 minutes ago
    end: new Date()
  }
);

console.log(`Found ${events.length} log events for request`);
```

---

## Query Result Format

CloudWatch Logs Insights returns results as an array of rows, where each row is an array of `{field, value}` objects:

```typescript
{
  status: 'Complete',
  results: [
    [
      { field: '@timestamp', value: '2024-01-15 10:30:00.000' },
      { field: '@message', value: 'Processing request...' },
      { field: '@logStream', value: '2024/01/15/[$LATEST]abc123' }
    ],
    // ... more rows
  ],
  statistics: {
    recordsMatched: 42,
    recordsScanned: 1000,
    bytesScanned: 50000
  }
}
```

## CorrelatedLogEvent Structure

The correlation methods parse query results into structured objects:

```typescript
interface CorrelatedLogEvent {
  timestamp: Date;           // Parsed timestamp
  message: string;           // Log message
  logGroup: string;          // Log group name
  logStream: string;         // Log stream name
  traceId?: string;          // Extracted trace ID
  requestId?: string;        // Extracted request ID
  spanId?: string;           // Extracted span ID
  service?: string;          // Service name
  level?: LogLevel;          // Log level (trace|debug|info|warn|error|fatal)
  fields: Record<string, unknown>;  // Additional parsed fields from JSON
}
```

## CloudWatch Logs Insights Query Language

The query language supports:

### Basic Queries

```
fields @timestamp, @message
| sort @timestamp desc
| limit 20
```

### Filtering

```
fields @timestamp, @message
| filter @message like /ERROR/
| filter statusCode >= 400
```

### Statistics

```
fields @timestamp
| stats count() as request_count by bin(5m)
```

### Parsing

```
fields @timestamp, @message
| parse @message /HTTP (?<method>\w+) (?<path>\S+) (?<status>\d+)/
| filter status >= 400
```

### Correlation Example

```
fields @timestamp, @message, trace_id, request_id
| filter trace_id = "abc-123"
| sort @timestamp asc
```

## Implementation Details

### Polling Strategy

The `query()` method uses an adaptive polling strategy:

1. Initial poll interval: 1 second
2. Exponential backoff: interval × 1.5 after each poll
3. Maximum poll interval: 5 seconds
4. Automatic timeout handling with query cancellation

### Field Extraction

The correlation methods extract fields from multiple sources:

1. Direct query result fields (e.g., `trace_id` field in results)
2. Parsed JSON message fields (if message is JSON)
3. Both snake_case and camelCase variants (e.g., `trace_id` and `traceId`)

### Error Handling

All methods throw `CloudWatchLogsError` with appropriate error codes:

- `VALIDATION`: Invalid parameters
- `QUERY_ERROR`: Query failed, cancelled, or timed out on server
- `TIMEOUT`: Client-side timeout exceeded
- Other codes as mapped from AWS API errors

## Best Practices

### 1. Use Appropriate Timeouts

```typescript
// Short queries: 30 seconds
const recentLogs = await insights.query(request, 30000);

// Long queries: 2-5 minutes
const historicalAnalysis = await insights.query(request, 300000);
```

### 2. Limit Result Sets

```typescript
// Always specify a reasonable limit
const results = await insights.query({
  ...request,
  limit: 1000  // Default is 1000, max is 10000
}, 60000);
```

### 3. Use Time Ranges Efficiently

```typescript
// Narrow time ranges are faster
const timeRange = {
  start: new Date(Date.now() - 3600000),  // 1 hour (fast)
  end: new Date()
};

// vs
const wideTi

meRange = {
  start: new Date(Date.now() - 86400000 * 30),  // 30 days (slow)
  end: new Date()
};
```

### 4. Handle Correlation Data Gracefully

```typescript
const events = await insights.queryByTraceId(logGroups, traceId, timeRange);

// Not all fields are guaranteed to be present
for (const event of events) {
  console.log(`Message: ${event.message}`);

  if (event.service) {
    console.log(`Service: ${event.service}`);
  }

  if (event.level) {
    console.log(`Level: ${event.level}`);
  }
}
```

### 5. Leverage Statistics

```typescript
const results = await insights.query(request, 60000);

console.log(`Matched: ${results.statistics?.recordsMatched}`);
console.log(`Scanned: ${results.statistics?.recordsScanned}`);
console.log(`Bytes: ${results.statistics?.bytesScanned}`);
```

## Performance Considerations

1. **Query Complexity**: Complex queries with multiple filters and aggregations take longer
2. **Time Range**: Wider time ranges scan more data
3. **Log Volume**: Higher volume log groups take longer to query
4. **Number of Log Groups**: Querying multiple log groups increases execution time
5. **Result Limit**: Higher limits may increase query time

## Specification Compliance

This implementation follows the SPARC specification (section 4.2 and 5.1.3):

- ✅ Implements all required methods: `startQuery`, `getResults`, `stopQuery`, `query`
- ✅ Provides correlation methods: `queryByTraceId`, `queryByRequestId`
- ✅ Handles all query statuses: Scheduled, Running, Complete, Failed, Cancelled, Timeout, Unknown
- ✅ Automatic polling with configurable timeout
- ✅ Proper result parsing from CloudWatch Logs Insights format
- ✅ Extraction of correlation IDs from structured logs
- ✅ Comprehensive error handling with appropriate error codes

## Related Documentation

- [AWS CloudWatch Logs Insights Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)
- [Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- [SPARC Specification](/workspaces/integrations/plans/cloudwatch-logs/specification-cloudwatch-logs.md)
