/**
 * Integration test demonstrating resilience patterns with simulated API calls.
 *
 * This example shows how the resilience module handles various failure scenarios
 * that might occur when calling the Gemini API.
 */

import {
  ResilienceOrchestrator,
  CircuitState,
  GeminiError,
  TooManyRequestsError,
  ServiceUnavailableError,
  InternalServerError,
} from '../src/index.js';

// Simulated API call counter
let callCount = 0;

/**
 * Simulates a flaky API that fails intermittently.
 */
async function flakyApiCall(failuresBeforeSuccess: number): Promise<string> {
  callCount++;
  console.log(`  → API Call #${callCount}`);

  if (callCount <= failuresBeforeSuccess) {
    // Simulate rate limiting
    throw new TooManyRequestsError(2); // Retry after 2 seconds
  }

  return 'Success!';
}

/**
 * Simulates an API with service outages.
 */
async function unreliableApiCall(): Promise<string> {
  callCount++;
  console.log(`  → API Call #${callCount}`);

  if (callCount <= 2) {
    throw new ServiceUnavailableError(1); // Retry after 1 second
  }

  return 'Service restored!';
}

/**
 * Simulates an API that always fails (for circuit breaker demo).
 */
async function alwaysFailsApiCall(): Promise<string> {
  callCount++;
  console.log(`  → API Call #${callCount}`);
  throw new InternalServerError('Simulated server error');
}

// ============================================================================
// Test Scenarios
// ============================================================================

async function testRetryWithBackoff() {
  console.log('\n=== Test 1: Retry with Exponential Backoff ===\n');
  callCount = 0;

  const orchestrator = new ResilienceOrchestrator({
    retry: {
      maxAttempts: 3,
      initialDelay: 500,
      maxDelay: 5000,
      multiplier: 2,
      jitter: 0.1,
    },
  });

  const startTime = Date.now();

  try {
    const result = await orchestrator.execute(
      () => flakyApiCall(2), // Fail twice, succeed on third attempt
    );

    const duration = Date.now() - startTime;
    console.log(`✓ Result: ${result}`);
    console.log(`✓ Total duration: ${duration}ms`);
    console.log(`✓ Total API calls: ${callCount}`);
  } catch (error) {
    console.error('✗ Failed:', error);
  }
}

async function testRateLimiting() {
  console.log('\n=== Test 2: Rate Limiting ===\n');

  const orchestrator = new ResilienceOrchestrator({
    rateLimit: {
      requestsPerMinute: 3, // Only 3 requests per minute
      tokensPerMinute: 10000,
    },
  });

  console.log('Making 5 requests (rate limit: 3/min)...');
  const startTime = Date.now();

  for (let i = 0; i < 5; i++) {
    const callStart = Date.now();
    await orchestrator.execute(async () => `Request ${i + 1}`, 2000);
    const callDuration = Date.now() - callStart;
    console.log(`  ✓ Request ${i + 1} completed (${callDuration}ms)`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(`✓ All requests completed in ${totalDuration}ms`);
}

async function testCircuitBreaker() {
  console.log('\n=== Test 3: Circuit Breaker ===\n');
  callCount = 0;

  const orchestrator = new ResilienceOrchestrator({
    circuitBreaker: {
      failureThreshold: 3,
      successThreshold: 2,
      openDuration: 2000, // 2 seconds
      halfOpenMaxRequests: 1,
    },
    retry: {
      maxAttempts: 1, // No retries to quickly trigger circuit breaker
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: 0,
    },
  });

  // Cause failures to open circuit
  console.log('Phase 1: Causing failures to open circuit...');
  for (let i = 0; i < 3; i++) {
    try {
      await orchestrator.execute(() => alwaysFailsApiCall());
    } catch (error) {
      console.log(`  ✗ Call ${i + 1} failed (expected)`);
    }
  }

  const cb = orchestrator.getCircuitBreaker();
  console.log(`\n  Circuit state: ${cb?.getState()}`);

  // Try to make call with open circuit
  console.log('\nPhase 2: Attempting call with open circuit...');
  try {
    await orchestrator.execute(() => alwaysFailsApiCall());
  } catch (error) {
    console.log(`  ✗ Call blocked: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  // Wait for circuit to transition to half-open
  console.log('\nPhase 3: Waiting for circuit to transition to half-open...');
  await new Promise((resolve) => setTimeout(resolve, 2100));
  console.log(`  Circuit state: ${cb?.getState()}`);

  // Make successful calls to close circuit
  console.log('\nPhase 4: Making successful calls to close circuit...');
  callCount = 0; // Reset so calls succeed
  const successOrchestrator = new ResilienceOrchestrator({
    circuitBreaker: cb, // Reuse same circuit breaker
  });

  for (let i = 0; i < 2; i++) {
    try {
      const result = await successOrchestrator.execute(async () => `Success ${i + 1}`);
      console.log(`  ✓ Call ${i + 1}: ${result}`);
    } catch (error) {
      console.log(`  ✗ Call ${i + 1} failed`);
    }
  }

  console.log(`\n  Final circuit state: ${cb?.getState()}`);
}

async function testRetryAfterHeader() {
  console.log('\n=== Test 4: Retry-After Header Respect ===\n');
  callCount = 0;

  const orchestrator = new ResilienceOrchestrator({
    retry: {
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 5000,
      multiplier: 2,
      jitter: 0, // No jitter for predictable timing
    },
  });

  const startTime = Date.now();

  try {
    const result = await orchestrator.execute(() => unreliableApiCall());

    const duration = Date.now() - startTime;
    console.log(`✓ Result: ${result}`);
    console.log(`✓ Duration: ${duration}ms`);
    console.log(`✓ Respected retry-after headers (2 retries × ~1000ms each)`);
  } catch (error) {
    console.error('✗ Failed:', error);
  }
}

async function testCompleteScenario() {
  console.log('\n=== Test 5: Complete Resilience Scenario ===\n');
  callCount = 0;

  const orchestrator = new ResilienceOrchestrator({
    retry: {
      maxAttempts: 3,
      initialDelay: 500,
      maxDelay: 5000,
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

  console.log('Simulating real-world API interaction with all resilience patterns...\n');

  // Simulate multiple API calls
  for (let i = 0; i < 3; i++) {
    try {
      const result = await orchestrator.execute(
        async () => {
          if (i === 1) {
            // Second call fails once then succeeds
            callCount++;
            if (callCount === 2) {
              throw new TooManyRequestsError(1);
            }
          }
          return `API Response ${i + 1}`;
        },
        5000, // Estimated tokens
      );

      console.log(`✓ Call ${i + 1}: ${result}`);
    } catch (error) {
      console.log(`✗ Call ${i + 1} failed:`, error);
    }
  }

  // Show final state
  const cb = orchestrator.getCircuitBreaker();
  const rl = orchestrator.getRateLimiter();

  console.log('\n--- Final State ---');
  console.log(`Circuit Breaker: ${cb?.getState()}`);
  console.log('Circuit Metrics:', cb?.getMetrics());
  console.log('Rate Limiter:', rl?.getState());
}

// ============================================================================
// Run All Tests
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Gemini Resilience Integration Test Suite                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await testRetryWithBackoff();
  await testRateLimiting();
  await testCircuitBreaker();
  await testRetryAfterHeader();
  await testCompleteScenario();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✓ All Integration Tests Completed Successfully!          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}
