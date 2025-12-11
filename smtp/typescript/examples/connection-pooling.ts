/**
 * Connection Pooling Example
 *
 * This example demonstrates how to use connection pooling to efficiently
 * send batch emails, monitor pool status, and optimize for high throughput.
 */

import {
  smtpClient,
  EmailBuilder,
  TlsMode,
  PoolStatus,
  SmtpMetrics,
} from '@integrations/smtp';

/**
 * Example 1: Basic connection pooling for batch email sending
 */
async function basicPoolingExample() {
  console.log('=== Basic Connection Pooling Example ===\n');

  // Create client with connection pooling enabled
  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    // Configure connection pool
    .poolConfig({
      maxConnections: 10,        // Maximum concurrent connections
      minIdleConnections: 2,     // Keep at least 2 connections ready
      maxIdleTime: 60000,        // Close idle connections after 60 seconds
      acquireTimeout: 10000,     // Wait up to 10 seconds for a connection
      validationInterval: 30000, // Validate connections every 30 seconds
    })
    .build();

  try {
    // Generate 50 test emails
    const emails = Array.from({ length: 50 }, (_, i) =>
      new EmailBuilder()
        .from('sender@example.com')
        .to(`user${i + 1}@example.com`)
        .subject(`Email #${i + 1}`)
        .text(`This is test email number ${i + 1}`)
        .build()
    );

    console.log(`Sending ${emails.length} emails using connection pool...`);
    const startTime = Date.now();

    // Send batch - the pool will automatically manage connections
    const result = await client.sendBatch(emails);

    const duration = Date.now() - startTime;

    console.log('\nResults:');
    console.log(`  Total: ${emails.length}`);
    console.log(`  Successful: ${result.successful.length}`);
    console.log(`  Failed: ${result.failed.length}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Throughput: ${(emails.length / (duration / 1000)).toFixed(2)} emails/sec`);

    // Report any failures
    if (result.failed.length > 0) {
      console.log('\nFailed emails:');
      result.failed.forEach(({ email, error }) => {
        console.log(`  - ${email.to[0].address}: ${error.message}`);
      });
    }

  } finally {
    await client.close();
  }
}

/**
 * Example 2: Monitoring pool status
 */
async function poolMonitoringExample() {
  console.log('\n=== Pool Monitoring Example ===\n');

  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    .poolConfig({
      maxConnections: 5,
      minIdleConnections: 1,
      maxIdleTime: 30000,
    })
    .build();

  try {
    // Monitor pool status periodically
    const monitorInterval = setInterval(async () => {
      const status: PoolStatus = await client.getPoolStatus();

      console.log('Pool Status:');
      console.log(`  Active: ${status.activeConnections}`);
      console.log(`  Idle: ${status.idleConnections}`);
      console.log(`  Total: ${status.totalConnections}`);
      console.log(`  Pending: ${status.pendingAcquisitions}`);
      console.log(`  Utilization: ${(status.utilization * 100).toFixed(1)}%`);
      console.log('');
    }, 2000);

    // Send emails in waves to see pool dynamics
    for (let wave = 1; wave <= 3; wave++) {
      console.log(`\n--- Wave ${wave} ---`);

      const emails = Array.from({ length: 15 }, (_, i) =>
        new EmailBuilder()
          .from('sender@example.com')
          .to(`user${wave * 15 + i}@example.com`)
          .subject(`Wave ${wave} Email ${i + 1}`)
          .text('Test email')
          .build()
      );

      await client.sendBatch(emails);

      // Wait between waves
      if (wave < 3) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Stop monitoring
    clearInterval(monitorInterval);

  } finally {
    await client.close();
  }
}

/**
 * Example 3: High-performance batch sending with metrics
 */
async function highPerformanceExample() {
  console.log('\n=== High-Performance Batch Sending ===\n');

  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    // Optimize pool for high throughput
    .poolConfig({
      maxConnections: 20,        // More connections for parallel sends
      minIdleConnections: 5,     // Keep connections warm
      maxIdleTime: 120000,       // Keep connections alive longer
      acquireTimeout: 5000,      // Fail fast if pool is saturated
      validationInterval: 60000,
    })
    // Add rate limiting to avoid overwhelming the server
    .rateLimitConfig({
      maxPerSecond: 50,
      maxPerMinute: 2000,
      maxPerHour: 50000,
      onLimitBehavior: 'throttle' as const,
    })
    // Enable retries for transient failures
    .retryConfig({
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2.0,
      retryableErrors: [
        'connection_error',
        'timeout',
        'temporary_error',
      ],
    })
    // Enable circuit breaker to stop trying if server is down
    .circuitBreakerConfig({
      failureThreshold: 10,
      successThreshold: 5,
      timeout: 60000,
      halfOpenMaxAttempts: 3,
    })
    .build();

  try {
    // Generate a large batch of emails
    const batchSize = 1000;
    const emails = Array.from({ length: batchSize }, (_, i) =>
      new EmailBuilder()
        .from('bulk@example.com')
        .to(`customer${i + 1}@example.com`)
        .subject('Monthly Newsletter')
        .html(`
          <h1>Newsletter ${i + 1}</h1>
          <p>Thank you for being our customer!</p>
        `)
        .build()
    );

    console.log(`Sending ${batchSize} emails with optimized settings...`);

    // Monitor progress
    let completed = 0;
    const startTime = Date.now();

    // Send in chunks for better monitoring
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < emails.length; i += chunkSize) {
      chunks.push(emails.slice(i, i + chunkSize));
    }

    console.log(`Split into ${chunks.length} chunks of ${chunkSize} emails each\n`);

    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStart = Date.now();

      const result = await client.sendBatch(chunk);
      results.push(result);

      completed += chunk.length;
      const chunkDuration = Date.now() - chunkStart;
      const overallDuration = Date.now() - startTime;
      const progress = (completed / batchSize) * 100;

      console.log(`Chunk ${i + 1}/${chunks.length}:`);
      console.log(`  Sent: ${result.successful.length}/${chunk.length}`);
      console.log(`  Duration: ${chunkDuration}ms`);
      console.log(`  Progress: ${progress.toFixed(1)}%`);
      console.log(`  Overall rate: ${(completed / (overallDuration / 1000)).toFixed(2)} emails/sec`);

      // Get pool status
      const poolStatus = await client.getPoolStatus();
      console.log(`  Pool: ${poolStatus.activeConnections} active, ${poolStatus.idleConnections} idle`);
      console.log('');
    }

    // Final statistics
    const totalDuration = Date.now() - startTime;
    const totalSuccessful = results.reduce((sum, r) => sum + r.successful.length, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed.length, 0);

    console.log('\n=== Final Results ===');
    console.log(`Total emails: ${batchSize}`);
    console.log(`Successful: ${totalSuccessful}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Total duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`Average throughput: ${(totalSuccessful / (totalDuration / 1000)).toFixed(2)} emails/sec`);

    // Get final metrics
    const metrics: SmtpMetrics = await client.getMetrics();
    console.log('\n=== Connection Metrics ===');
    console.log(`Total connections created: ${metrics.connectionsCreated}`);
    console.log(`Connections reused: ${metrics.connectionsReused}`);
    console.log(`Connection errors: ${metrics.connectionErrors}`);
    console.log(`Average connection time: ${metrics.averageConnectionTime.toFixed(0)}ms`);

    console.log('\n=== Send Metrics ===');
    console.log(`Total sends: ${metrics.totalSends}`);
    console.log(`Successful sends: ${metrics.successfulSends}`);
    console.log(`Failed sends: ${metrics.failedSends}`);
    console.log(`Average send time: ${metrics.averageSendTime.toFixed(0)}ms`);
    console.log(`Retries: ${metrics.retriesAttempted}`);

  } finally {
    await client.close();
  }
}

/**
 * Example 4: Connection pool with graceful shutdown
 */
async function gracefulShutdownExample() {
  console.log('\n=== Graceful Shutdown Example ===\n');

  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    .poolConfig({
      maxConnections: 5,
      minIdleConnections: 1,
    })
    .build();

  // Handle shutdown signals
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nReceived shutdown signal...');
    console.log('Waiting for in-flight emails to complete...');

    // The close() method will wait for active connections to finish
    await client.close();

    console.log('All connections closed gracefully.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Simulate long-running email sending process
    console.log('Starting continuous email sending...');
    console.log('Press Ctrl+C to trigger graceful shutdown\n');

    let emailCount = 0;
    while (!isShuttingDown) {
      const email = new EmailBuilder()
        .from('sender@example.com')
        .to(`user${emailCount}@example.com`)
        .subject('Continuous Send Test')
        .text('Test email')
        .build();

      await client.send(email);
      emailCount++;

      console.log(`Sent email #${emailCount}`);

      // Wait 2 seconds between sends
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

  } catch (error) {
    if (!isShuttingDown) {
      console.error('Error:', error);
    }
  }
}

/**
 * Run all examples
 */
async function main() {
  try {
    await basicPoolingExample();
    await poolMonitoringExample();
    await highPerformanceExample();

    // Uncomment to test graceful shutdown (runs indefinitely)
    // await gracefulShutdownExample();

  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run examples
if (require.main === module) {
  main();
}

export {
  basicPoolingExample,
  poolMonitoringExample,
  highPerformanceExample,
  gracefulShutdownExample,
};
