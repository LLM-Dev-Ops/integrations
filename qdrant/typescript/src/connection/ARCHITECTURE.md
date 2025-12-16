# Qdrant Resilience Layer - Architecture

## Module Structure

```
qdrant/typescript/src/connection/
├── resilience.ts           # Core resilience implementation
├── index.ts                # Public API exports
├── examples.ts             # Usage examples
├── README.md               # User documentation
├── IMPLEMENTATION.md       # Implementation summary
├── ARCHITECTURE.md         # This file
└── __tests__/
    └── resilience.test.ts  # Comprehensive test suite
```

## Class Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      RetryExecutor                          │
├─────────────────────────────────────────────────────────────┤
│ - config: RetryConfig                                       │
├─────────────────────────────────────────────────────────────┤
│ + execute<T>(operation: () => Promise<T>): Promise<T>      │
│ + isRetryable(error: unknown): boolean                      │
│ - calculateDelay(attempt: number): number                   │
│ - sleep(ms: number): Promise<void>                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     CircuitBreaker                          │
├─────────────────────────────────────────────────────────────┤
│ - state: CircuitState                                       │
│ - failureCount: number                                      │
│ - successCount: number                                      │
│ - lastFailureTime: number | undefined                       │
│ - config: CircuitBreakerConfig                              │
├─────────────────────────────────────────────────────────────┤
│ + execute<T>(operation: () => Promise<T>): Promise<T>      │
│ + getState(): CircuitState                                  │
│ + getStats(): CircuitBreakerStats                           │
│ + reset(): void                                             │
│ - checkStateTransition(): void                              │
│ - recordSuccess(): void                                     │
│ - recordFailure(): void                                     │
│ - transitionTo(newState: CircuitState): void                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   CircuitOpenError                          │
├─────────────────────────────────────────────────────────────┤
│ extends Error                                               │
└─────────────────────────────────────────────────────────────┘
```

## Type Hierarchy

```
RetryConfig
├── maxAttempts: number
├── baseDelayMs: number
├── maxDelayMs: number
└── jitterFactor: number

CircuitBreakerConfig
├── failureThreshold: number
├── successThreshold: number
└── openDurationMs: number

CircuitState = 'closed' | 'open' | 'half_open'

CircuitBreakerStats
├── state: CircuitState
├── failureCount: number
├── successCount: number
├── lastFailureTime: number | undefined
├── config: CircuitBreakerConfig
└── timeUntilHalfOpen: number | undefined

QdrantErrorLike
├── isRetryable?: boolean
├── type?: string
└── message: string
```

## Data Flow

### Retry Flow

```
┌──────────────┐
│  Operation   │
│   Request    │
└──────┬───────┘
       │
       v
┌──────────────────────┐
│  RetryExecutor       │
│  .execute()          │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐     Success
│  Execute Operation   │────────────> Return Result
└──────┬───────────────┘
       │
       │ Failure
       v
┌──────────────────────┐     Not Retryable
│  isRetryable(error)  │────────────> Throw Error
└──────┬───────────────┘
       │
       │ Retryable
       v
┌──────────────────────┐     Attempts Exhausted
│  Check Attempt Count │────────────> Throw Error
└──────┬───────────────┘
       │
       │ Retry Available
       v
┌──────────────────────┐
│  Calculate Delay     │
│  (exponential +      │
│   jitter)            │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐
│  Sleep(delay)        │
└──────┬───────────────┘
       │
       │
       └──> Retry Operation
```

### Circuit Breaker Flow

```
┌──────────────┐
│  Operation   │
│   Request    │
└──────┬───────┘
       │
       v
┌──────────────────────┐
│  CircuitBreaker      │
│  .execute()          │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐
│ Check State          │
│ Transition           │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐     State = OPEN
│  Check Circuit       │────────────> Throw CircuitOpenError
│  State               │
└──────┬───────────────┘
       │
       │ State = CLOSED or HALF_OPEN
       v
┌──────────────────────┐     Success
│  Execute Operation   │────────────> Record Success ─> Return Result
└──────┬───────────────┘
       │
       │ Failure
       v
┌──────────────────────┐
│  Record Failure      │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐
│  Check if Should     │
│  Transition to OPEN  │
└──────┬───────────────┘
       │
       v
   Throw Error
```

### Circuit Breaker State Machine

```
                    failureCount >= failureThreshold
            CLOSED ───────────────────────────────────> OPEN
              ↑                                           │
              │                                           │
              │                                           │
  successCount >=                                   Time elapsed >=
  successThreshold                                   openDurationMs
              │                                           │
              │                                           │
              │                                           v
              └────────────────────────────────────── HALF_OPEN
                                                          │
                                                          │
                                                     Any failure
                                                          │
                                                          v
                                                        OPEN
```

## Error Type Configuration Map

```
Error Type             Retry Config
─────────────────────────────────────────────────────
connection_error    -> { attempts: 3,  base: 100ms,  max: 5s,   jitter: 0.1 }
rate_limit_error    -> { attempts: 5,  base: 500ms,  max: 30s,  jitter: 0.1 }
service_unavailable -> { attempts: 3,  base: 1s,     max: 10s,  jitter: 0.1 }
timeout_error       -> { attempts: 2,  base: 1s,     max: 2s,   jitter: 0.0 }
default             -> { attempts: 3,  base: 100ms,  max: 5s,   jitter: 0.1 }
```

## Integration Pattern

### Recommended Usage

```typescript
// 1. Create resilience components
const retryExecutor = createRetryExecutorForError('search_timeout');
const circuitBreaker = createDefaultCircuitBreaker();

// 2. Wrap Qdrant client operations
const result = await circuitBreaker.execute(async () => {
  return await retryExecutor.execute(async () => {
    // Actual Qdrant operation
    return await qdrantClient.search({
      collection: 'my-collection',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    });
  });
});
```

### Call Stack Visualization

```
Application Code
       │
       v
CircuitBreaker.execute()
       │
       ├─> Check circuit state
       │   ├─> OPEN -> throw CircuitOpenError
       │   └─> CLOSED/HALF_OPEN -> continue
       │
       v
RetryExecutor.execute()
       │
       ├─> Attempt 1
       │   └─> Qdrant Operation
       │       ├─> Success -> return result
       │       └─> Failure (retryable)
       │
       ├─> Sleep (exponential backoff)
       │
       ├─> Attempt 2
       │   └─> Qdrant Operation
       │       ├─> Success -> return result
       │       └─> Failure (retryable)
       │
       └─> ... (up to maxAttempts)
```

## Dependencies

### Internal
- None (self-contained module)

### External
- TypeScript standard library
- Testing: vitest

### Future Integration Points
- Error types from `/qdrant/typescript/src/errors/`
- Observability from shared modules
- Metrics and logging

## Performance Characteristics

### Retry Delay Calculation

```
Attempt 1: baseDelay * 2^0 = baseDelay
Attempt 2: baseDelay * 2^1 = baseDelay * 2
Attempt 3: baseDelay * 2^2 = baseDelay * 4
...
Capped at: maxDelay

With jitter (10%):
  finalDelay = cappedDelay ± (cappedDelay * 0.1)
```

### Circuit Breaker Overhead

- State check: O(1)
- Success record: O(1)
- Failure record: O(1)
- State transition: O(1)
- getStats(): O(1)

### Memory Usage

- RetryExecutor: ~200 bytes (config + minimal state)
- CircuitBreaker: ~400 bytes (config + state + counters + timestamp)

## Testing Strategy

### Unit Tests (21 tests)
- RetryExecutor behavior
- CircuitBreaker state transitions
- Error classification
- Configuration lookup

### Integration Tests (Future)
- Real Qdrant client operations
- End-to-end resilience scenarios
- Performance benchmarks

### Coverage Goals
- Code coverage: >90%
- Branch coverage: >85%
- Critical path coverage: 100%

## Extension Points

### Custom Error Detection
Implement custom `isRetryable` logic by extending `QdrantErrorLike`:

```typescript
class CustomQdrantError implements QdrantErrorLike {
  isRetryable: boolean;
  type: string;
  message: string;
  
  // Custom logic...
}
```

### Custom Retry Strategies
Create specialized retry executors:

```typescript
const aggressiveRetry = new RetryExecutor({
  maxAttempts: 10,
  baseDelayMs: 50,
  maxDelayMs: 2000,
  jitterFactor: 0.2,
});
```

### Circuit Breaker Hooks (Future Enhancement)
```typescript
interface CircuitBreakerHook {
  onStateChange(from: CircuitState, to: CircuitState): void;
}
```

## Best Practices

1. **Layer resilience patterns**: Circuit breaker outside, retry inside
2. **Use error-specific configs**: Always prefer `createRetryExecutorForError()`
3. **Monitor circuit state**: Log state transitions for observability
4. **Set appropriate timeouts**: Ensure timeouts < retry delays
5. **Handle CircuitOpenError**: Implement fallback mechanisms
6. **Test failure scenarios**: Verify behavior under degraded conditions

## Future Enhancements

- [ ] Bulkhead pattern for resource isolation
- [ ] Rate limiter integration
- [ ] Adaptive retry strategies
- [ ] Observability hooks
- [ ] Metrics collection
- [ ] Distributed circuit breaker state
