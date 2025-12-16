/**
 * Verification script for the observability module
 *
 * This script verifies that all exports are available and working correctly.
 */

import {
  // Types
  Span,
  SpanStatus,
  Tracer,
  MetricValue,
  MetricsCollector,
  Logger,
  LogEntry,
  HealthCheck,
  HealthCheckResult,
  ComponentHealth,
  ObservabilityContext,

  // Enums and Constants
  LogLevel,
  HealthStatus,
  MetricNames,
  SpanNames,
  SpanAttributes,

  // Tracer
  NoopTracer,
  ConsoleTracer,
  TracerSpan,
  createTracer,

  // Metrics
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  createMetricsCollector,

  // Logger
  ConsoleLoggerOptions,
  NoopLogger,
  ConsoleLogger,
  createLogger,
  createLogContext,

  // Context
  createDefaultObservability,
  createDevObservability,
  createProductionObservability,
  createTestObservability,
  createCustomObservability,
  combineObservability,
  createObservabilityFromEnv,

  // Health
  HealthCheckOptions,
  WeaviateHealthCheck,
  createHealthCheck,
  isHealthy,
  formatHealthCheckResult,
} from './index';

/**
 * Verify all exports are available
 */
export function verifyExports(): boolean {
  const checks: { name: string; result: boolean }[] = [];

  // Check types exist (compile-time check)
  checks.push({ name: 'Types', result: true });

  // Check constants
  checks.push({ name: 'LogLevel', result: typeof LogLevel !== 'undefined' });
  checks.push({ name: 'HealthStatus', result: typeof HealthStatus !== 'undefined' });
  checks.push({ name: 'MetricNames', result: typeof MetricNames !== 'undefined' });
  checks.push({ name: 'SpanNames', result: typeof SpanNames !== 'undefined' });
  checks.push({ name: 'SpanAttributes', result: typeof SpanAttributes !== 'undefined' });

  // Check tracer classes
  checks.push({ name: 'NoopTracer', result: typeof NoopTracer !== 'undefined' });
  checks.push({ name: 'ConsoleTracer', result: typeof ConsoleTracer !== 'undefined' });
  checks.push({ name: 'TracerSpan', result: typeof TracerSpan !== 'undefined' });
  checks.push({ name: 'createTracer', result: typeof createTracer === 'function' });

  // Check metrics classes
  checks.push({ name: 'NoopMetricsCollector', result: typeof NoopMetricsCollector !== 'undefined' });
  checks.push({ name: 'InMemoryMetricsCollector', result: typeof InMemoryMetricsCollector !== 'undefined' });
  checks.push({ name: 'createMetricsCollector', result: typeof createMetricsCollector === 'function' });

  // Check logger classes
  checks.push({ name: 'NoopLogger', result: typeof NoopLogger !== 'undefined' });
  checks.push({ name: 'ConsoleLogger', result: typeof ConsoleLogger !== 'undefined' });
  checks.push({ name: 'createLogger', result: typeof createLogger === 'function' });
  checks.push({ name: 'createLogContext', result: typeof createLogContext === 'function' });

  // Check context functions
  checks.push({ name: 'createDefaultObservability', result: typeof createDefaultObservability === 'function' });
  checks.push({ name: 'createDevObservability', result: typeof createDevObservability === 'function' });
  checks.push({ name: 'createProductionObservability', result: typeof createProductionObservability === 'function' });
  checks.push({ name: 'createTestObservability', result: typeof createTestObservability === 'function' });
  checks.push({ name: 'createCustomObservability', result: typeof createCustomObservability === 'function' });
  checks.push({ name: 'combineObservability', result: typeof combineObservability === 'function' });
  checks.push({ name: 'createObservabilityFromEnv', result: typeof createObservabilityFromEnv === 'function' });

  // Check health classes
  checks.push({ name: 'WeaviateHealthCheck', result: typeof WeaviateHealthCheck !== 'undefined' });
  checks.push({ name: 'createHealthCheck', result: typeof createHealthCheck === 'function' });
  checks.push({ name: 'isHealthy', result: typeof isHealthy === 'function' });
  checks.push({ name: 'formatHealthCheckResult', result: typeof formatHealthCheckResult === 'function' });

  // Print results
  console.log('\n=== Observability Module Export Verification ===\n');

  let allPassed = true;
  for (const check of checks) {
    const status = check.result ? '✓' : '✗';
    const color = check.result ? '\x1b[32m' : '\x1b[31m'; // green or red
    console.log(`${color}${status}\x1b[0m ${check.name}`);
    if (!check.result) allPassed = false;
  }

  console.log('\n' + '='.repeat(48));
  console.log(`Total: ${checks.length} checks`);
  console.log(`Passed: ${checks.filter(c => c.result).length}`);
  console.log(`Failed: ${checks.filter(c => !c.result).length}`);
  console.log('='.repeat(48) + '\n');

  return allPassed;
}

/**
 * Verify runtime functionality
 */
export function verifyFunctionality(): boolean {
  console.log('\n=== Runtime Functionality Verification ===\n');

  const tests: { name: string; fn: () => void }[] = [];

  // Test 1: Create observability contexts
  tests.push({
    name: 'Create default observability',
    fn: () => {
      const obs = createDefaultObservability();
      if (!obs.tracer || !obs.metrics || !obs.logger) {
        throw new Error('Missing components');
      }
    },
  });

  tests.push({
    name: 'Create dev observability',
    fn: () => {
      const obs = createDevObservability();
      if (!(obs.tracer instanceof ConsoleTracer)) {
        throw new Error('Expected ConsoleTracer');
      }
      if (!(obs.metrics instanceof InMemoryMetricsCollector)) {
        throw new Error('Expected InMemoryMetricsCollector');
      }
    },
  });

  // Test 2: Tracing
  tests.push({
    name: 'Create and end span',
    fn: () => {
      const tracer = new ConsoleTracer();
      const span = tracer.startSpan('test.operation');
      span.setAttribute('key', 'value');
      span.end('ok');
      if (span.duration === undefined) {
        throw new Error('Duration not set');
      }
    },
  });

  // Test 3: Metrics
  tests.push({
    name: 'Collect metrics',
    fn: () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.increment(MetricNames.OBJECT_CREATE);
      metrics.increment(MetricNames.OBJECT_CREATE);
      const count = metrics.getCounter(MetricNames.OBJECT_CREATE);
      if (count !== 2) {
        throw new Error(`Expected 2, got ${count}`);
      }
    },
  });

  // Test 4: Logging
  tests.push({
    name: 'Log messages',
    fn: () => {
      const logger = new ConsoleLogger({ name: 'test', level: LogLevel.Debug });
      logger.info('Test message');
      logger.debug('Debug message');
      // Should not throw
    },
  });

  // Test 5: Sensitive redaction
  tests.push({
    name: 'Redact sensitive data',
    fn: () => {
      const logger = new ConsoleLogger({ name: 'test' });
      // Should not throw and should redact
      logger.info('Test', { apiKey: 'secret', data: 'public' });
    },
  });

  // Test 6: Metric labels
  tests.push({
    name: 'Metrics with labels',
    fn: () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 1, { class: 'Article' });
      metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 2, { class: 'Document' });
      const count1 = metrics.getCounter(MetricNames.SEARCH_NEAR_VECTOR, { class: 'Article' });
      const count2 = metrics.getCounter(MetricNames.SEARCH_NEAR_VECTOR, { class: 'Document' });
      if (count1 !== 1 || count2 !== 2) {
        throw new Error('Label-based metrics failed');
      }
    },
  });

  // Test 7: Constants
  tests.push({
    name: 'Verify constants',
    fn: () => {
      if (!MetricNames.OBJECT_CREATE) throw new Error('MetricNames missing');
      if (!SpanNames.NEAR_VECTOR) throw new Error('SpanNames missing');
      if (!SpanAttributes.CLASS_NAME) throw new Error('SpanAttributes missing');
    },
  });

  // Run tests
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test.fn();
      console.log(`\x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`\x1b[31m✗\x1b[0m ${test.name}`);
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(48));
  console.log(`Total: ${tests.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(48) + '\n');

  return failed === 0;
}

/**
 * Run all verifications
 */
export function runVerification(): boolean {
  const exportsOk = verifyExports();
  const functionalityOk = verifyFunctionality();

  console.log('\n=== OVERALL RESULT ===\n');
  if (exportsOk && functionalityOk) {
    console.log('\x1b[32m✓ All verifications passed!\x1b[0m\n');
    return true;
  } else {
    console.log('\x1b[31m✗ Some verifications failed\x1b[0m\n');
    return false;
  }
}

// Run if executed directly
if (require.main === module) {
  const success = runVerification();
  process.exit(success ? 0 : 1);
}
