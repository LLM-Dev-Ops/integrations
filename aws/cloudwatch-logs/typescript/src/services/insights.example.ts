/**
 * CloudWatch Logs Insights Service - Usage Examples
 *
 * This file demonstrates how to use the InsightsService implementation.
 * These examples are for documentation purposes.
 */

import type { InsightsService } from './insights.js';

/**
 * Example: Start a query and manually poll for results
 */
async function exampleStartAndPoll(insights: InsightsService): Promise<void> {
  // Start a query
  const startResponse = await insights.startQuery({
    logGroupNames: ['/aws/lambda/my-function'],
    startTime: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    endTime: Math.floor(Date.now() / 1000),
    queryString: 'fields @timestamp, @message | filter @message like /ERROR/ | limit 20',
  });

  console.log(`Query started with ID: ${startResponse.queryId}`);

  // Poll for results
  if (startResponse.queryId) {
    let attempts = 0;
    while (attempts < 60) {
      const results = await insights.getResults(startResponse.queryId);

      if (results.status === 'Complete') {
        console.log(`Query complete! Found ${results.results?.length} results`);
        console.log(`Scanned ${results.statistics?.recordsScanned} records`);
        break;
      } else if (results.status === 'Failed') {
        console.error('Query failed');
        break;
      } else {
        console.log(`Query status: ${results.status}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }
    }
  }
}

/**
 * Example: Use the convenience query method
 */
async function exampleConvenienceQuery(insights: InsightsService): Promise<void> {
  try {
    // This method handles polling automatically
    const results = await insights.query(
      {
        logGroupNames: ['/aws/lambda/my-function', '/aws/lambda/another-function'],
        startTime: Math.floor(Date.now() / 1000) - 3600,
        endTime: Math.floor(Date.now() / 1000),
        queryString: `
          fields @timestamp, @message, @logStream
          | filter @message like /ERROR/
          | sort @timestamp desc
          | limit 100
        `,
        limit: 100,
      },
      60000 // 60 second timeout
    );

    console.log(`Query Status: ${results.status}`);
    console.log(`Found ${results.results?.length} log events`);
    console.log(`Statistics:`, results.statistics);

    // Process results
    for (const row of results.results || []) {
      const timestamp = row.find((f) => f.field === '@timestamp')?.value;
      const message = row.find((f) => f.field === '@message')?.value;
      console.log(`[${timestamp}] ${message}`);
    }
  } catch (error) {
    console.error('Query error:', error);
  }
}

/**
 * Example: Query by trace ID for distributed tracing
 */
async function exampleTraceQuery(insights: InsightsService): Promise<void> {
  const traceId = 'trace-abc-123-def-456';

  const events = await insights.queryByTraceId(
    ['/aws/lambda/service-a', '/aws/lambda/service-b', '/aws/lambda/service-c'],
    traceId,
    {
      start: new Date(Date.now() - 3600000), // 1 hour ago
      end: new Date(),
    }
  );

  console.log(`Found ${events.length} log events for trace ${traceId}`);

  // Events are sorted by timestamp and parsed
  for (const event of events) {
    console.log(
      `[${event.service || 'unknown'}] ${event.timestamp.toISOString()}: ${event.message}`
    );
    console.log(`  Log Stream: ${event.logStream}`);
    if (event.requestId) {
      console.log(`  Request ID: ${event.requestId}`);
    }
    if (event.spanId) {
      console.log(`  Span ID: ${event.spanId}`);
    }
  }
}

/**
 * Example: Query by request ID for request-level correlation
 */
async function exampleRequestQuery(insights: InsightsService): Promise<void> {
  const requestId = 'req-xyz-789';

  const events = await insights.queryByRequestId(
    ['/aws/lambda/my-function'],
    requestId,
    {
      start: new Date(Date.now() - 1800000), // 30 minutes ago
      end: new Date(),
    }
  );

  console.log(`Found ${events.length} log events for request ${requestId}`);

  // Group by log level
  const byLevel = new Map<string, number>();
  for (const event of events) {
    const level = event.level || 'unknown';
    byLevel.set(level, (byLevel.get(level) || 0) + 1);
  }

  console.log('Log levels:');
  for (const [level, count] of byLevel.entries()) {
    console.log(`  ${level}: ${count}`);
  }
}

/**
 * Example: Stop a long-running query
 */
async function exampleStopQuery(insights: InsightsService): Promise<void> {
  // Start a potentially long-running query
  const startResponse = await insights.startQuery({
    logGroupNames: ['/aws/lambda/my-function'],
    startTime: Math.floor(Date.now() / 1000) - 86400 * 7, // 7 days ago
    endTime: Math.floor(Date.now() / 1000),
    queryString: 'fields @timestamp, @message | stats count() by bin(5m)',
  });

  if (startResponse.queryId) {
    console.log(`Query started: ${startResponse.queryId}`);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Stop the query
    await insights.stopQuery(startResponse.queryId);
    console.log('Query stopped');
  }
}

/**
 * Example: Complex correlation query with multiple IDs
 */
async function exampleComplexCorrelation(insights: InsightsService): Promise<void> {
  // Find all logs with either a specific trace ID or request ID
  const results = await insights.query(
    {
      logGroupNames: ['/aws/lambda/service-a', '/aws/lambda/service-b'],
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000),
      queryString: `
        fields @timestamp, @message, @logStream, trace_id, request_id, service
        | filter trace_id = "trace-123" or request_id = "req-456"
        | sort @timestamp asc
      `,
    },
    60000
  );

  console.log(`Found ${results.results?.length} correlated log events`);
}

/**
 * Example: Error analysis with CloudWatch Logs Insights
 */
async function exampleErrorAnalysis(insights: InsightsService): Promise<void> {
  const results = await insights.query(
    {
      logGroupNames: ['/aws/lambda/my-function'],
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000),
      queryString: `
        fields @timestamp, @message
        | filter @message like /ERROR|Exception|Failed/
        | parse @message /(?<error_type>\\w+Error|\\w+Exception)/
        | stats count() as error_count by error_type
        | sort error_count desc
      `,
    },
    30000
  );

  console.log('Error Analysis Results:');
  for (const row of results.results || []) {
    const errorType = row.find((f) => f.field === 'error_type')?.value;
    const count = row.find((f) => f.field === 'error_count')?.value;
    console.log(`  ${errorType}: ${count} occurrences`);
  }
}
