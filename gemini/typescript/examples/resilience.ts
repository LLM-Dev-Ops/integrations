/**
 * Resilience Patterns Example
 *
 * This example demonstrates:
 * - Configuring retry with exponential backoff
 * - Configuring circuit breaker for fault tolerance
 * - Configuring rate limiting
 * - Using ResilienceOrchestrator to combine all patterns
 * - Creating a client with custom resilience configuration
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/resilience.js
 * ```
 */

import {
  createClient,
  RetryExecutor,
  CircuitBreaker,
  RateLimiter,
  ResilienceOrchestrator,
  CircuitBreakerOpenError,
} from '../src/index.js';

/**
 * Example 1: Retry with exponential backoff
 */
async function exampleRetry(): Promise<void> {
  console.log('\n=== Example 1: Retry with Exponential Backoff ===\n');

  const retry = new RetryExecutor({
    maxAttempts: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    multiplier: 2, // Double delay each time
    jitter: 0.25, // 25% random jitter
  });

  console.log('Retry Configuration:');
  console.log('  Max Attempts: 3');
  console.log('  Initial Delay: 1000ms');
  console.log('  Max Delay: 10000ms');
  console.log('  Multiplier: 2x');
  console.log('  Jitter: 25%\n');

  let attemptCount = 0;

  try {
    const result = await retry.execute(async () => {
      attemptCount++;
      console.log(`Attempt ${attemptCount}...`);

      // Simulate an operation that succeeds on the 2nd attempt
      if (attemptCount < 2) {
        throw new Error('Simulated transient failure');
      }

      return 'Success!';
    });

    console.log(`\nResult: ${result}`);
    console.log(`Total attempts: ${attemptCount}`);
  } catch (error) {
    console.error('Failed after all retries:', error);
  }
}

/**
 * Example 2: Circuit breaker pattern
 */
async function exampleCircuitBreaker(): Promise<void> {
  console.log('\n=== Example 2: Circuit Breaker Pattern ===\n');

  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3, // Open after 3 failures
    successThreshold: 2, // Close after 2 successes
    openDuration: 5000, // Stay open for 5 seconds
    halfOpenMaxRequests: 1, // Allow 1 request in half-open state
  });

  console.log('Circuit Breaker Configuration:');
  console.log('  Failure Threshold: 3');
  console.log('  Success Threshold: 2');
  console.log('  Open Duration: 5000ms');
  console.log('  Half-Open Max Requests: 1\n');

  // Simulate multiple calls
  for (let i = 1; i <= 7; i++) {
    try {
      console.log(`Call ${i}:`);

      const result = await circuitBreaker.execute(async () => {
        // Simulate failures for first 3 calls
        if (i <= 3) {
          throw new Error('Service unavailable');
        }

        // After circuit opens, wait to let it transition to half-open
        if (i === 4) {
          console.log('  Waiting for circuit to transition to half-open...');
          await new Promise((resolve) => setTimeout(resolve, 5500));
        }

        return `Success ${i}`;
      });

      console.log(`  Result: ${result}`);
      console.log(`  Circuit State: ${circuitBreaker.getState()}`);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        console.log(`  Circuit is OPEN - request rejected immediately`);
        console.log(`  Circuit State: ${circuitBreaker.getState()}`);
      } else {
        console.log(`  Error: ${(error as Error).message}`);
        console.log(`  Circuit State: ${circuitBreaker.getState()}`);
      }
    }

    console.log();
  }
}

/**
 * Example 3: Rate limiting
 */
async function exampleRateLimit(): Promise<void> {
  console.log('\n=== Example 3: Rate Limiting ===\n');

  const rateLimiter = new RateLimiter({
    requestsPerMinute: 10,
    tokensPerMinute: 100000,
  });

  console.log('Rate Limiter Configuration:');
  console.log('  Requests per minute: 10');
  console.log('  Tokens per minute: 100,000\n');

  console.log('Making requests...\n');

  // Make 5 rapid requests
  for (let i = 1; i <= 5; i++) {
    const start = Date.now();

    await rateLimiter.execute(async () => {
      const elapsed = Date.now() - start;
      console.log(`Request ${i} executed after ${elapsed}ms`);

      // Simulate token consumption
      rateLimiter.consumeTokens(1000);

      return `Result ${i}`;
    });
  }

  console.log('\nAll requests completed within rate limits!');
}

/**
 * Example 4: ResilienceOrchestrator (combining all patterns)
 */
async function exampleOrchestrator(): Promise<void> {
  console.log('\n=== Example 4: Resilience Orchestrator ===\n');

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
      requestsPerMinute: 60,
      tokensPerMinute: 1000000,
    },
  });

  console.log('Orchestrator combines:');
  console.log('  - Retry with exponential backoff');
  console.log('  - Circuit breaker for fault tolerance');
  console.log('  - Rate limiting for API quotas\n');

  let attemptCount = 0;

  try {
    const result = await orchestrator.execute(async () => {
      attemptCount++;
      console.log(`Orchestrated attempt ${attemptCount}...`);

      // Simulate success on 2nd attempt
      if (attemptCount < 2) {
        throw new Error('Transient error');
      }

      return { success: true, data: 'Operation completed' };
    });

    console.log('\nResult:', result);
    console.log(`Completed after ${attemptCount} attempt(s)`);
  } catch (error) {
    console.error('Operation failed:', error);
  }
}

/**
 * Example 5: Client with custom resilience configuration
 */
async function exampleClientWithResilience(): Promise<void> {
  console.log('\n=== Example 5: Client with Custom Resilience ===\n');

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_API_KEY not set. Skipping this example.');
    return;
  }

  // Create client with custom resilience configuration
  const client = createClient({
    apiKey,
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      multiplier: 2,
      jitter: 0.25,
    },
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 3,
      openDuration: 30000,
      halfOpenMaxRequests: 1,
    },
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 1000000,
    },
  });

  console.log('Client created with resilience configuration:');
  console.log('  Retry: 3 attempts with exponential backoff');
  console.log('  Circuit Breaker: Opens after 5 failures');
  console.log('  Rate Limit: 60 requests/min, 1M tokens/min\n');

  console.log('Making a generation request...');

  try {
    const response = await client.content.generate('gemini-2.0-flash-exp', {
      contents: [
        {
          parts: [{ text: 'Say "Hello, World!" in 5 different languages.' }],
        },
      ],
    });

    if (response.candidates && response.candidates.length > 0) {
      const text = response.candidates[0].content?.parts
        .map((part) => ('text' in part ? part.text : ''))
        .join('');

      console.log('\nResponse:');
      console.log(text);
    }

    console.log('\nRequest completed successfully with resilience patterns applied!');
  } catch (error) {
    console.error('Request failed:', error);
  }
}

/**
 * Example 6: Custom retry logic with selective retries
 */
async function exampleSelectiveRetry(): Promise<void> {
  console.log('\n=== Example 6: Selective Retry Logic ===\n');

  const retry = new RetryExecutor({
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    multiplier: 2,
    jitter: 0.1,
  });

  console.log('Demonstrating selective retry based on error type...\n');

  let attemptCount = 0;

  try {
    await retry.execute(async () => {
      attemptCount++;
      console.log(`Attempt ${attemptCount}...`);

      // Simulate different error types
      if (attemptCount === 1) {
        // Retryable: Network error
        const error = new Error('Network timeout');
        (error as any).isRetryable = true;
        throw error;
      } else if (attemptCount === 2) {
        // Not retryable: Validation error
        const error = new Error('Invalid API key');
        (error as any).isRetryable = false;
        throw error;
      }

      return 'Success';
    });
  } catch (error) {
    console.log(`\nFailed with non-retryable error after ${attemptCount} attempts`);
    console.log(`Error: ${(error as Error).message}`);
  }
}

/**
 * Example 7: Monitoring circuit breaker state
 */
async function exampleMonitorCircuitBreaker(): Promise<void> {
  console.log('\n=== Example 7: Monitoring Circuit Breaker State ===\n');

  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 2,
    successThreshold: 2,
    openDuration: 3000,
    halfOpenMaxRequests: 1,
  });

  console.log('Monitoring circuit breaker state transitions...\n');

  // Function to check and display state
  const showState = () => {
    const state = circuitBreaker.getState();
    const stats = circuitBreaker.getStats();
    console.log(`State: ${state}`);
    console.log(`Stats: Successes=${stats.successCount}, Failures=${stats.failureCount}\n`);
  };

  // Initial state
  console.log('Initial state:');
  showState();

  // Cause failures
  console.log('Causing failures...');
  for (let i = 1; i <= 2; i++) {
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('Failure');
      });
    } catch (error) {
      console.log(`Failure ${i} recorded`);
    }
  }
  showState();

  // Try request when open
  console.log('Attempting request when circuit is open...');
  try {
    await circuitBreaker.execute(async () => 'success');
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.log('Request blocked by open circuit');
    }
  }
  showState();

  // Wait for half-open
  console.log('Waiting for circuit to transition to half-open...');
  await new Promise((resolve) => setTimeout(resolve, 3500));
  showState();

  // Successful requests to close circuit
  console.log('Making successful requests...');
  for (let i = 1; i <= 2; i++) {
    await circuitBreaker.execute(async () => {
      console.log(`Success ${i}`);
      return 'success';
    });
  }
  showState();
}

/**
 * Main function running all examples
 */
async function main(): Promise<void> {
  try {
    console.log('=== Resilience Patterns Examples ===');

    await exampleRetry();
    await exampleCircuitBreaker();
    await exampleRateLimit();
    await exampleOrchestrator();
    await exampleClientWithResilience();
    await exampleSelectiveRetry();
    await exampleMonitorCircuitBreaker();

    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('\nError during resilience examples:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the examples
main();
