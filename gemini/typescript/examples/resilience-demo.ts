/**
 * Demonstration of resilience patterns for Gemini API.
 *
 * This example shows how to use RetryExecutor, CircuitBreaker, RateLimiter,
 * and ResilienceOrchestrator for robust API interactions.
 */

import {
  RetryExecutor,
  CircuitBreaker,
  CircuitState,
  RateLimiter,
  ResilienceOrchestrator,
  GeminiError,
  TooManyRequestsError,
} from '../src/index.js';

// ============================================================================
// 1. Retry Executor Example
// ============================================================================

async function demoRetryExecutor() {
  console.log('\n=== Retry Executor Demo ===\n');

  const retry = new RetryExecutor({
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    multiplier: 2,
    jitter: 0.1,
  });

  let attemptCount = 0;

  try {
    const result = await retry.execute(
      async () => {
        attemptCount++;
        console.log(`Attempt ${attemptCount}`);

        // Simulate failure on first 2 attempts
        if (attemptCount < 3) {
          throw new TooManyRequestsError(2); // Retry after 2 seconds
        }

        return 'Success!';
      },
      (error) => error instanceof GeminiError && error.isRetryable,
      (error) => (error instanceof GeminiError ? error.retryAfter : undefined),
    );

    console.log(`Result: ${result}`);
  } catch (error) {
    console.error('Failed after retries:', error);
  }
}

// ============================================================================
// 2. Circuit Breaker Example
// ============================================================================

async function demoCircuitBreaker() {
  console.log('\n=== Circuit Breaker Demo ===\n');

  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    openDuration: 5000,
    halfOpenMaxRequests: 1,
  });

  // Simulate multiple failures
  console.log('Simulating failures to open circuit...');
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Simulated failure');
      });
    } catch (error) {
      console.log(`Failure ${i + 1}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  console.log(`Circuit state: ${circuitBreaker.getState()}`);

  // Try to execute when circuit is open
  console.log('\nTrying to execute with open circuit...');
  try {
    await circuitBreaker.execute(async () => 'This should not execute');
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  // Wait for circuit to transition to half-open
  console.log('\nWaiting for circuit to transition to half-open...');
  await new Promise((resolve) => setTimeout(resolve, 5100));
  console.log(`Circuit state: ${circuitBreaker.getState()}`);

  // Successful requests to close circuit
  console.log('\nExecuting successful requests to close circuit...');
  for (let i = 0; i < 2; i++) {
    try {
      const result = await circuitBreaker.execute(async () => `Success ${i + 1}`);
      console.log(result);
    } catch (error) {
      console.error('Unexpected error:', error);
    }
  }

  console.log(`Circuit state: ${circuitBreaker.getState()}`);
}

// ============================================================================
// 3. Rate Limiter Example
// ============================================================================

async function demoRateLimiter() {
  console.log('\n=== Rate Limiter Demo ===\n');

  const rateLimiter = new RateLimiter({
    requestsPerMinute: 5,
    tokensPerMinute: 10000,
  });

  console.log('Making 5 rapid requests (within limit)...');
  const start = Date.now();

  for (let i = 0; i < 5; i++) {
    await rateLimiter.acquire(2000); // Each request uses 2000 tokens
    console.log(`Request ${i + 1} executed at ${Date.now() - start}ms`);
  }

  console.log('\nRate limiter state:');
  console.log(rateLimiter.getState());
}

// ============================================================================
// 4. Resilience Orchestrator Example
// ============================================================================

async function demoResilienceOrchestrator() {
  console.log('\n=== Resilience Orchestrator Demo ===\n');

  const orchestrator = new ResilienceOrchestrator({
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      multiplier: 2,
      jitter: 0.1,
    },
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 2,
      openDuration: 10000,
      halfOpenMaxRequests: 1,
    },
    rateLimit: {
      requestsPerMinute: 10,
      tokensPerMinute: 50000,
    },
  });

  console.log('Executing operation with full resilience patterns...');

  let attemptCount = 0;

  try {
    const result = await orchestrator.execute(async () => {
      attemptCount++;
      console.log(`Attempt ${attemptCount}`);

      // Succeed on second attempt
      if (attemptCount < 2) {
        throw new TooManyRequestsError(1);
      }

      return 'Operation completed successfully!';
    }, 5000); // Estimated 5000 tokens

    console.log(`Result: ${result}`);
  } catch (error) {
    console.error('Operation failed:', error);
  }

  // Show circuit breaker state
  const cb = orchestrator.getCircuitBreaker();
  if (cb) {
    console.log(`\nCircuit breaker state: ${cb.getState()}`);
    console.log('Circuit breaker metrics:', cb.getMetrics());
  }

  // Show rate limiter state
  const rl = orchestrator.getRateLimiter();
  if (rl) {
    console.log('\nRate limiter state:', rl.getState());
  }
}

// ============================================================================
// Run All Demos
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Gemini TypeScript Resilience Patterns Demonstration      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await demoRetryExecutor();
  await demoCircuitBreaker();
  await demoRateLimiter();
  await demoResilienceOrchestrator();

  console.log('\n✓ All demonstrations completed!\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
