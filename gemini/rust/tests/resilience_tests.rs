//! Integration tests for resilience patterns (retry, circuit breaker, rate limiting).

use integrations_gemini::resilience::{
    ResilienceOrchestrator, ResilienceConfig, RetryConfig, CircuitBreakerConfig, CircuitState,
    RateLimiterConfig,
};
use integrations_gemini::error::{GeminiError, NetworkError, ConfigurationError};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[tokio::test]
async fn test_retry_success_after_failures() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: false,
        },
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: true,
        enable_circuit_breaker: false,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();

    // Act - Fail twice, then succeed
    let result = orchestrator
        .execute(|| async {
            let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
            if count < 2 {
                Err(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            } else {
                Ok("success")
            }
        })
        .await;

    // Assert
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "success");
    assert_eq!(attempts.load(Ordering::SeqCst), 3); // 3 total attempts
}

#[tokio::test]
async fn test_retry_exhausted() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 2,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: false,
        },
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: true,
        enable_circuit_breaker: false,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();

    // Act - Always fail
    let result = orchestrator
        .execute(|| async {
            attempts_clone.fetch_add(1, Ordering::SeqCst);
            Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                duration: Duration::from_secs(10),
            }))
        })
        .await;

    // Assert
    assert!(result.is_err());
    assert_eq!(attempts.load(Ordering::SeqCst), 3); // Initial + 2 retries
}

#[tokio::test]
async fn test_retry_non_retryable_error() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: false,
        },
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: true,
        enable_circuit_breaker: false,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();

    // Act - Non-retryable error (configuration error)
    let result = orchestrator
        .execute(|| async {
            attempts_clone.fetch_add(1, Ordering::SeqCst);
            Err::<&str, _>(GeminiError::Configuration(ConfigurationError::MissingApiKey))
        })
        .await;

    // Assert
    assert!(result.is_err());
    assert_eq!(attempts.load(Ordering::SeqCst), 1); // No retries for non-retryable errors
}

#[tokio::test]
async fn test_circuit_breaker_opens_after_failures() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig::no_retry(),
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            timeout: Duration::from_millis(100),
        },
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: false,
        enable_circuit_breaker: true,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);

    // Act - Cause 3 failures to open the circuit
    for _ in 0..3 {
        let _ = orchestrator
            .execute_once(|| async {
                Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            })
            .await;
    }

    // Assert - Circuit should be open
    assert!(matches!(
        orchestrator.circuit_breaker().state(),
        CircuitState::Open { .. }
    ));

    // Next request should fail immediately due to open circuit
    let result = orchestrator
        .execute_once(|| async { Ok::<_, GeminiError>("should not execute") })
        .await;

    assert!(result.is_err());
}

#[tokio::test]
async fn test_circuit_breaker_half_open_to_closed() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig::no_retry(),
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            timeout: Duration::from_millis(50),
        },
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: false,
        enable_circuit_breaker: true,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);

    // Act - Open the circuit
    for _ in 0..2 {
        let _ = orchestrator
            .execute_once(|| async {
                Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            })
            .await;
    }

    // Wait for timeout to transition to half-open
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Make 2 successful requests to close the circuit
    for _ in 0..2 {
        let result = orchestrator
            .execute_once(|| async { Ok::<_, GeminiError>("success") })
            .await;
        assert!(result.is_ok());
    }

    // Assert - Circuit should be closed
    assert_eq!(orchestrator.circuit_breaker().state(), CircuitState::Closed);
}

#[tokio::test]
async fn test_circuit_breaker_reset() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig::no_retry(),
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            timeout: Duration::from_secs(10),
        },
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: false,
        enable_circuit_breaker: true,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);

    // Open the circuit
    for _ in 0..2 {
        let _ = orchestrator
            .execute_once(|| async {
                Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            })
            .await;
    }

    assert!(matches!(
        orchestrator.circuit_breaker().state(),
        CircuitState::Open { .. }
    ));

    // Act - Reset the circuit breaker
    orchestrator.circuit_breaker().reset();

    // Assert - Should be closed
    assert_eq!(orchestrator.circuit_breaker().state(), CircuitState::Closed);
}

#[tokio::test]
async fn test_rate_limiter_allows_burst() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig::no_retry(),
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 3,
            refill_interval: Duration::from_millis(100),
        },
        enable_retry: false,
        enable_circuit_breaker: false,
        enable_rate_limiting: true,
    };

    let orchestrator = ResilienceOrchestrator::new(config);

    // Act - Make burst_size requests quickly
    for _ in 0..3 {
        let result = orchestrator
            .execute_once(|| async { Ok::<_, GeminiError>("ok") })
            .await;
        assert!(result.is_ok());
    }

    // All 3 requests should succeed without delay
}

#[tokio::test]
async fn test_rate_limiter_blocks_excess_requests() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig::no_retry(),
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 2,
            refill_interval: Duration::from_millis(50),
        },
        enable_retry: false,
        enable_circuit_breaker: false,
        enable_rate_limiting: true,
    };

    let orchestrator = ResilienceOrchestrator::new(config);

    // Use up the burst
    for _ in 0..2 {
        orchestrator
            .execute_once(|| async { Ok::<_, GeminiError>("ok") })
            .await
            .unwrap();
    }

    // Act - Next request should wait for refill
    let start = std::time::Instant::now();
    orchestrator
        .execute_once(|| async { Ok::<_, GeminiError>("ok") })
        .await
        .unwrap();
    let elapsed = start.elapsed();

    // Assert - Should have waited at least for the refill interval
    assert!(elapsed >= Duration::from_millis(40)); // Allow some margin
}

#[tokio::test]
async fn test_combined_retry_and_circuit_breaker() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 2,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: false,
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 5,
            success_threshold: 2,
            timeout: Duration::from_secs(10),
        },
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: true,
        enable_circuit_breaker: true,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();

    // Act - Fail twice then succeed (with retries)
    let result = orchestrator
        .execute(|| async {
            let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
            if count < 2 {
                Err(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            } else {
                Ok("success")
            }
        })
        .await;

    // Assert
    assert!(result.is_ok());
    // Circuit should still be closed (not enough consecutive failures)
    assert_eq!(orchestrator.circuit_breaker().state(), CircuitState::Closed);
}

#[tokio::test]
async fn test_resilience_config_disabled() {
    // Arrange
    let config = ResilienceConfig::disabled();
    let orchestrator = ResilienceOrchestrator::new(config);
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();

    // Act - Should fail immediately without retries
    let result = orchestrator
        .execute(|| async {
            attempts_clone.fetch_add(1, Ordering::SeqCst);
            Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                duration: Duration::from_secs(10),
            }))
        })
        .await;

    // Assert
    assert!(result.is_err());
    assert_eq!(attempts.load(Ordering::SeqCst), 1); // No retries
}

#[tokio::test]
async fn test_resilience_config_aggressive() {
    // Arrange
    let config = ResilienceConfig::aggressive();

    // Assert
    assert_eq!(config.retry.max_retries, 5);
    assert_eq!(config.circuit_breaker.failure_threshold, 3);
    assert!(config.enable_retry);
    assert!(config.enable_circuit_breaker);
    assert!(config.enable_rate_limiting);
}

#[tokio::test]
async fn test_resilience_config_conservative() {
    // Arrange
    let config = ResilienceConfig::conservative();

    // Assert
    assert_eq!(config.circuit_breaker.failure_threshold, 10);
    assert_eq!(config.rate_limiter.requests_per_minute, 30);
}

#[tokio::test]
async fn test_resilience_reset() {
    // Arrange
    let config = ResilienceConfig::default();
    let orchestrator = ResilienceOrchestrator::new(config);

    // Make some failed requests
    for _ in 0..2 {
        let _ = orchestrator
            .execute_once(|| async {
                Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            })
            .await;
    }

    // Act - Reset everything
    orchestrator.reset();

    // Assert - Circuit breaker should be closed
    assert_eq!(orchestrator.circuit_breaker().state(), CircuitState::Closed);
}

#[tokio::test]
async fn test_exponential_backoff_timing() {
    // Arrange
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: false,
        },
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig::unlimited(),
        enable_retry: true,
        enable_circuit_breaker: false,
        enable_rate_limiting: false,
    };

    let orchestrator = ResilienceOrchestrator::new(config);
    let start = std::time::Instant::now();

    // Act - Always fail to trigger all retries
    let _ = orchestrator
        .execute(|| async {
            Err::<&str, _>(GeminiError::Network(NetworkError::Timeout {
                duration: Duration::from_secs(10),
            }))
        })
        .await;

    let elapsed = start.elapsed();

    // Assert - Total delay should be at least: 10ms + 20ms + 40ms = 70ms
    // (exponential backoff: initial_delay * backoff_multiplier^retry_count)
    assert!(elapsed >= Duration::from_millis(60)); // Allow some margin
}
