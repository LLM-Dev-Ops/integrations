# Resilience Module Usage Guide

This guide shows how to use the resilience patterns in the Gemini TypeScript client.

## Quick Start

### Basic Client with Resilience

```typescript
import { createClient } from '@integrations/gemini';

const client = createClient({
  apiKey: process.env.GEMINI_API_KEY!,

  // Retry configuration
  retryConfig: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 60000,
    multiplier: 2,
    jitter: 0.25,
  },

  // Circuit breaker configuration
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 3,
    openDuration: 30000,
    halfOpenMaxRequests: 1,
  },

  // Rate limiting configuration
  rateLimitConfig: {
    requestsPerMinute: 60,
    tokensPerMinute: 1000000,
  },
});

// All API calls automatically use resilience patterns
const response = await client.content.generate('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'Hello, Gemini!' }] }],
});
```

## Standalone Usage

You can also use resilience components independently without the full client.

### Retry Only

```typescript
import { RetryExecutor, GeminiError } from '@integrations/gemini';

const retry = new RetryExecutor({
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  multiplier: 2,
  jitter: 0.25,
});

const result = await retry.execute(
  async () => {
    // Your API call
    return await fetch('https://api.example.com/data');
  },
  (error) => {
    // Determine if error is retryable
    return error instanceof GeminiError && error.isRetryable;
  },
  (error) => {
    // Extract retry-after value (in seconds)
    return error instanceof GeminiError ? error.retryAfter : undefined;
  }
);
```

### Circuit Breaker Only

```typescript
import { CircuitBreaker, CircuitState } from '@integrations/gemini';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 3,
  openDuration: 30000,
  halfOpenMaxRequests: 1,
});

// Execute operation through circuit breaker
try {
  const result = await circuitBreaker.execute(async () => {
    return await apiCall();
  });

  console.log('Success:', result);
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    console.log('Circuit breaker is open - service degraded');
  } else {
    console.error('Operation failed:', error);
  }
}

// Monitor circuit state
console.log('Circuit state:', circuitBreaker.getState());
console.log('Metrics:', circuitBreaker.getMetrics());
```

### Rate Limiter Only

```typescript
import { RateLimiter } from '@integrations/gemini';

const rateLimiter = new RateLimiter({
  requestsPerMinute: 60,
  tokensPerMinute: 1000000,
});

// Acquire before each request
async function makeApiCall(estimatedTokens: number) {
  await rateLimiter.acquire(estimatedTokens);
  return await apiCall();
}

// Check remaining capacity
const state = rateLimiter.getState();
console.log(`Requests remaining: ${state.requestTokens}`);
console.log(`Tokens remaining: ${state.tokenBudget}`);
```

### Complete Orchestration

```typescript
import { ResilienceOrchestrator } from '@integrations/gemini';

const orchestrator = new ResilienceOrchestrator({
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 60000,
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

// Execute with all resilience patterns
const result = await orchestrator.execute(
  async () => await apiCall(),
  5000 // Estimated tokens
);

// Access underlying components
const circuitBreaker = orchestrator.getCircuitBreaker();
const rateLimiter = orchestrator.getRateLimiter();

console.log('Circuit state:', circuitBreaker?.getState());
console.log('Rate limit state:', rateLimiter?.getState());
```

## Configuration Guide

### Retry Configuration

```typescript
interface RetryConfig {
  maxAttempts: number;      // Maximum retry attempts (default: 3)
  initialDelay: number;     // Initial delay in ms (default: 1000)
  maxDelay: number;         // Maximum delay in ms (default: 60000)
  multiplier: number;       // Backoff multiplier (default: 2.0)
  jitter: number;           // Jitter factor 0-1 (default: 0.25)
}
```

**Recommendations:**
- **maxAttempts**: 3-5 for most use cases
- **initialDelay**: 1000ms (1 second) is a good starting point
- **maxDelay**: 60000ms (60 seconds) prevents excessive waits
- **multiplier**: 2.0 for exponential backoff
- **jitter**: 0.1-0.3 to prevent thundering herd

### Circuit Breaker Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening (default: 5)
  successThreshold: number;      // Successes to close (default: 3)
  openDuration: number;          // Duration open in ms (default: 30000)
  halfOpenMaxRequests: number;   // Max requests in half-open (default: 1)
}
```

**Recommendations:**
- **failureThreshold**: 5-10 for production services
- **successThreshold**: 2-3 to verify recovery
- **openDuration**: 30000-60000ms (30-60 seconds)
- **halfOpenMaxRequests**: 1 for cautious recovery

### Rate Limit Configuration

```typescript
interface RateLimitConfig {
  requestsPerMinute: number;   // Max requests per minute
  tokensPerMinute?: number;    // Max tokens per minute (optional)
}
```

**Recommendations:**
- Set **requestsPerMinute** slightly below API limit
- For Gemini Free tier: 15 requests/minute
- For Gemini Pro tier: 60+ requests/minute
- Configure **tokensPerMinute** based on your tier

## Error Handling

### Retryable Errors

The following errors are automatically retried:

- `TooManyRequestsError` (429) - Rate limit exceeded
- `ServiceUnavailableError` (503) - Service temporarily unavailable
- `InternalServerError` (500) - Server error
- `TimeoutError` - Request timeout
- Any error with `isRetryable: true`

### Non-Retryable Errors

These errors are not retried:

- `InvalidApiKeyError` (401) - Invalid API key
- `ValidationError` (400) - Invalid request
- `PayloadTooLargeError` (413) - Request too large
- `SafetyBlockedError` - Content safety violation
- Any error with `isRetryable: false`

### Retry-After Support

When the API returns a 429 (Too Many Requests) with a `Retry-After` header:

1. The error is automatically detected as retryable
2. The `retryAfter` value is extracted (in seconds)
3. The retry waits for the specified duration
4. Jitter is still applied for safety

Example:
```typescript
// API returns 429 with Retry-After: 60
// Retry will wait ~60 seconds (±jitter) before next attempt
```

## Monitoring and Metrics

### Circuit Breaker Metrics

```typescript
const metrics = circuitBreaker.getMetrics();

console.log({
  state: metrics.state,              // CLOSED, OPEN, or HALF_OPEN
  failureCount: metrics.failureCount,
  successCount: metrics.successCount,
  halfOpenRequests: metrics.halfOpenRequests,
});
```

### Rate Limiter State

```typescript
const state = rateLimiter.getState();

console.log({
  requestTokens: state.requestTokens,          // Remaining requests
  tokenBudget: state.tokenBudget,              // Remaining tokens
  requestsPerMinute: state.requestsPerMinute,  // Config limit
  tokensPerMinute: state.tokensPerMinute,      // Config limit
});
```

### Logging Retries

```typescript
let attemptCount = 0;

const result = await retry.execute(
  async () => {
    attemptCount++;
    console.log(`Attempt ${attemptCount}`);
    return await apiCall();
  },
  (error) => error instanceof GeminiError && error.isRetryable,
  (error) => error instanceof GeminiError ? error.retryAfter : undefined,
);

console.log(`Completed after ${attemptCount} attempts`);
```

## Advanced Usage

### Custom Retry Logic

```typescript
const retry = new RetryExecutor({
  maxAttempts: 5,
  initialDelay: 500,
  maxDelay: 30000,
  multiplier: 1.5,
  jitter: 0.2,
});

const result = await retry.execute(
  async () => {
    // Custom operation
    const response = await customApiCall();

    // Custom validation
    if (!response.ok) {
      throw new Error('Invalid response');
    }

    return response.data;
  },
  (error) => {
    // Custom retry logic
    if (error instanceof CustomError) {
      return error.shouldRetry;
    }
    return false;
  },
  (error) => {
    // Custom retry-after extraction
    if (error instanceof CustomError) {
      return error.retryAfterSeconds;
    }
    return undefined;
  }
);
```

### Circuit Breaker with Health Checks

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  openDuration: 15000,
  halfOpenMaxRequests: 1,
});

// Health check function
async function checkHealth() {
  const state = circuitBreaker.getState();

  if (state === CircuitState.Open) {
    console.warn('Service degraded - circuit breaker is open');
    return false;
  }

  return true;
}

// Use before making requests
if (await checkHealth()) {
  const result = await circuitBreaker.execute(async () => await apiCall());
}
```

### Dynamic Rate Limiting

```typescript
// Different rate limiters for different tiers
const freeTierLimiter = new RateLimiter({
  requestsPerMinute: 15,
  tokensPerMinute: 32000,
});

const proTierLimiter = new RateLimiter({
  requestsPerMinute: 60,
  tokensPerMinute: 1000000,
});

// Select based on user tier
const limiter = userTier === 'pro' ? proTierLimiter : freeTierLimiter;

await limiter.acquire(estimatedTokens);
const result = await apiCall();
```

## Best Practices

1. **Configure Appropriate Timeouts**
   - Set `maxDelay` to prevent excessive waits
   - Consider user experience when setting delays

2. **Use Jitter**
   - Add 10-30% jitter to prevent thundering herd
   - Essential when many clients retry simultaneously

3. **Monitor Circuit State**
   - Log circuit breaker state changes
   - Alert when circuit opens frequently

4. **Estimate Tokens**
   - Provide accurate token estimates to rate limiter
   - Better resource management and smoother operation

5. **Combine Patterns**
   - Use `ResilienceOrchestrator` for production
   - Individual components for specific needs

6. **Test Edge Cases**
   - Verify behavior at rate limits
   - Test circuit breaker transitions
   - Validate retry exhaustion

7. **Reset Between Tests**
   - Call `reset()` methods in test teardown
   - Ensures clean state for each test

## Examples

See the `/examples` directory for complete demonstrations:

- `examples/resilience-demo.ts` - Basic usage of each component
- `examples/resilience-integration-test.ts` - Complete integration tests

## Troubleshooting

### Circuit Breaker Stuck Open

If circuit breaker stays open:
- Check `openDuration` - may be too long
- Verify service has actually recovered
- Manually reset: `circuitBreaker.reset()`

### Rate Limiter Too Restrictive

If rate limiter blocks too aggressively:
- Increase `requestsPerMinute`
- Check token budget if using token limiting
- Verify refill timing (60-second windows)

### Retries Exhausted Too Quickly

If retries give up too fast:
- Increase `maxAttempts`
- Adjust `initialDelay` and `maxDelay`
- Verify errors are marked as retryable

### Excessive Retry Delays

If retries wait too long:
- Reduce `maxDelay`
- Lower `multiplier` (try 1.5 instead of 2.0)
- Reduce `jitter` factor

## Further Reading

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
