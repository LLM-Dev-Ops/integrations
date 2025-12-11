# Resilience Module

This module provides comprehensive resilience patterns for robust and fault-tolerant API interactions with the Gemini API.

## Features

- **Retry with Exponential Backoff**: Automatically retry failed requests with configurable backoff strategy
- **Circuit Breaker**: Prevent cascading failures by temporarily blocking requests when service is degraded
- **Rate Limiting**: Ensure API rate limits are respected using token bucket algorithm
- **Retry-After Header Support**: Automatically respect `Retry-After` headers from 429 responses
- **Jitter**: Add randomization to retry delays to prevent thundering herd problem

## Components

### 1. RetryExecutor

Handles retry logic with exponential backoff and jitter.

```typescript
import { RetryExecutor } from '@integrations/gemini';

const retry = new RetryExecutor({
  maxAttempts: 3,
  initialDelay: 1000,    // 1 second
  maxDelay: 60000,       // 60 seconds
  multiplier: 2,         // Double delay each retry
  jitter: 0.25,          // 25% jitter
});

const result = await retry.execute(
  async () => await apiCall(),
  (error) => error instanceof GeminiError && error.isRetryable,
  (error) => error instanceof GeminiError ? error.retryAfter : undefined,
);
```

**Configuration:**
- `maxAttempts`: Maximum number of retry attempts
- `initialDelay`: Initial delay in milliseconds before first retry
- `maxDelay`: Maximum delay between retries
- `multiplier`: Multiplier for exponential backoff
- `jitter`: Jitter factor (0-1) to add randomization

### 2. CircuitBreaker

Implements circuit breaker pattern to prevent cascading failures.

```typescript
import { CircuitBreaker, CircuitState } from '@integrations/gemini';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 3,      // Close after 3 successes
  openDuration: 30000,      // Stay open for 30 seconds
  halfOpenMaxRequests: 1,   // Allow 1 test request in half-open state
});

try {
  const result = await circuitBreaker.execute(async () => await apiCall());
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    console.log('Circuit breaker is open, request blocked');
  }
}

// Check circuit state
const state = circuitBreaker.getState(); // CLOSED, OPEN, or HALF_OPEN
```

**States:**
- `CLOSED`: Normal operation, all requests pass through
- `OPEN`: Circuit is open, requests are immediately rejected
- `HALF_OPEN`: Testing if service has recovered, limited requests allowed

**Configuration:**
- `failureThreshold`: Number of failures before opening circuit
- `successThreshold`: Number of successes to close circuit from half-open
- `openDuration`: Duration (ms) circuit stays open before transitioning to half-open
- `halfOpenMaxRequests`: Maximum concurrent requests in half-open state

### 3. RateLimiter

Token bucket-based rate limiter to prevent exceeding API limits.

```typescript
import { RateLimiter } from '@integrations/gemini';

const rateLimiter = new RateLimiter({
  requestsPerMinute: 60,
  tokensPerMinute: 1000000,
});

// Acquire permission before making request
await rateLimiter.acquire(5000); // Request that uses ~5000 tokens

// Check current state
const state = rateLimiter.getState();
console.log(`Remaining requests: ${state.requestTokens}`);
console.log(`Remaining tokens: ${state.tokenBudget}`);
```

**Configuration:**
- `requestsPerMinute`: Maximum requests per minute
- `tokensPerMinute`: Maximum tokens per minute (optional)

### 4. ResilienceOrchestrator

Combines all resilience patterns for comprehensive protection.

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
  5000, // Estimated tokens for rate limiting
);
```

**Execution Order:**
1. Rate limiting (if configured)
2. Circuit breaker (if configured)
3. Retry with exponential backoff

## Error Handling

The resilience module works seamlessly with `GeminiError`:

- **Automatic Retry Detection**: Errors with `isRetryable: true` are automatically retried
- **Retry-After Respect**: The `retryAfter` property (in seconds) is automatically used for delays
- **Error Propagation**: Non-retryable errors are immediately thrown without retry

## Best Practices

1. **Configure Appropriate Timeouts**: Set reasonable `maxDelay` to avoid excessive wait times
2. **Use Jitter**: Add jitter (0.1-0.3) to prevent thundering herd when many clients retry simultaneously
3. **Monitor Circuit State**: Check circuit breaker state to understand service health
4. **Rate Limit Proactively**: Configure rate limits slightly below API limits to account for variance
5. **Combine Patterns**: Use `ResilienceOrchestrator` for production applications to get all benefits
6. **Token Estimation**: Provide accurate token estimates to rate limiter for better resource management

## Examples

See `/examples/resilience-demo.ts` for comprehensive demonstrations of all resilience patterns.

## Integration with Client

The Gemini client automatically uses resilience patterns when configured:

```typescript
import { createClient } from '@integrations/gemini';

const client = createClient({
  apiKey: 'your-api-key',
  retryConfig: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 60000,
    multiplier: 2,
    jitter: 0.25,
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 3,
    openDuration: 30000,
    halfOpenMaxRequests: 1,
  },
  rateLimitConfig: {
    requestsPerMinute: 60,
    tokensPerMinute: 1000000,
  },
});

// All API calls automatically use resilience patterns
const response = await client.content.generate('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'Hello!' }] }],
});
```

## Performance Considerations

- **Memory**: All components use minimal memory with O(1) space complexity
- **CPU**: Jitter calculations use `Math.random()` which is fast
- **Latency**: Rate limiting and circuit breaker add minimal overhead (<1ms)
- **Retry Delays**: Exponential backoff can add significant time for failed requests

## Thread Safety

All components are **not** thread-safe. Each instance should be used by a single async context. For multi-threaded applications, create separate instances per thread.

## Testing

When testing code that uses resilience patterns:

1. **Mock Time**: Use fake timers (`jest.useFakeTimers()`) to speed up tests
2. **Reset State**: Call `reset()` methods between tests to ensure clean state
3. **Check Metrics**: Use `getMetrics()` and `getState()` to verify behavior
4. **Test Edge Cases**: Verify behavior at boundaries (e.g., exactly at rate limit)

## References

- [Google Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/quota)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
