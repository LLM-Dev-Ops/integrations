//! Comprehensive integration tests for the resilience layer

use super::*;
use crate::errors::AnthropicError;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[tokio::test]
async fn test_full_resilience_stack_success() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 3,
            initial_backoff: Duration::from_millis(10),
            max_backoff: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: 0.1,
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 5,
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
            reset_timeout: Duration::from_secs(30),
        },
        rate_limit: RateLimitConfig {
            max_concurrent_requests: 10,
            requests_per_minute: None,
            tokens_per_minute: None,
            auto_adjust: true,
        },
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);

    let result = orchestrator
        .execute("test_operation", || async { Ok("success") })
        .await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "success");
}

#[tokio::test]
async fn test_retry_with_eventual_success() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 5,
            initial_backoff: Duration::from_millis(10),
            max_backoff: Duration::from_secs(1),
            backoff_multiplier: 2.0,
            jitter: 0.0,
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 100,
            ..Default::default()
        },
        rate_limit: RateLimitConfig {
            max_concurrent_requests: 100,
            requests_per_minute: None,
            tokens_per_minute: None,
            auto_adjust: false,
        },
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);
    let attempt_count = Arc::new(AtomicU32::new(0));
    let attempt_count_clone = attempt_count.clone();

    let result = orchestrator
        .execute("retry_test", move || {
            let count = attempt_count_clone.clone();
            async move {
                let current = count.fetch_add(1, Ordering::SeqCst);
                if current < 3 {
                    Err(AnthropicError::Network {
                        message: "Connection failed".to_string(),
                    })
                } else {
                    Ok(42)
                }
            }
        })
        .await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 42);
    assert_eq!(attempt_count.load(Ordering::SeqCst), 4); // 1 initial + 3 retries
}

#[tokio::test]
async fn test_retry_respects_max_retries() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 2,
            initial_backoff: Duration::from_millis(10),
            ..Default::default()
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 100,
            ..Default::default()
        },
        ..Default::default()
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);
    let attempt_count = Arc::new(AtomicU32::new(0));
    let attempt_count_clone = attempt_count.clone();

    let result = orchestrator
        .execute("max_retry_test", move || {
            let count = attempt_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err(AnthropicError::Server {
                    message: "Service unavailable".to_string(),
                    status_code: Some(503),
                })
            }
        })
        .await;

    assert!(result.is_err());
    assert_eq!(attempt_count.load(Ordering::SeqCst), 3); // 1 initial + 2 retries
}

#[tokio::test]
async fn test_non_retryable_error_fails_immediately() {
    let config = ResilienceConfig::default();
    let orchestrator = DefaultResilienceOrchestrator::new(config);
    let attempt_count = Arc::new(AtomicU32::new(0));
    let attempt_count_clone = attempt_count.clone();

    let result = orchestrator
        .execute("non_retryable_test", move || {
            let count = attempt_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err(AnthropicError::Authentication {
                    message: "Invalid API key".to_string(),
                })
            }
        })
        .await;

    assert!(result.is_err());
    assert_eq!(attempt_count.load(Ordering::SeqCst), 1); // No retries
    assert!(matches!(
        result.unwrap_err(),
        AnthropicError::Authentication { .. }
    ));
}

#[tokio::test]
async fn test_circuit_breaker_opens_after_failures() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 0,
            ..Default::default()
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            failure_window: Duration::from_secs(60),
            reset_timeout: Duration::from_secs(30),
        },
        ..Default::default()
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);

    // Fail 3 times to open circuit
    for i in 0..3 {
        let result = orchestrator
            .execute("circuit_test", || async {
                Err(AnthropicError::Server {
                    message: "Error".to_string(),
                    status_code: Some(503),
                })
            })
            .await;
        assert!(result.is_err(), "Attempt {} should fail", i + 1);
    }

    // Circuit should now be open
    let result = orchestrator
        .execute("circuit_test", || async { Ok(42) })
        .await;

    assert!(result.is_err());
    if let Err(AnthropicError::Server { message, .. }) = result {
        assert!(message.contains("Circuit breaker is open"));
    } else {
        panic!("Expected circuit breaker error");
    }
}

#[tokio::test]
async fn test_circuit_breaker_half_open_recovery() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 0,
            ..Default::default()
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            failure_window: Duration::from_secs(60),
            reset_timeout: Duration::from_millis(50),
        },
        ..Default::default()
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);

    // Open the circuit
    for _ in 0..2 {
        let _ = orchestrator
            .execute("recovery_test", || async {
                Err(AnthropicError::Network {
                    message: "Connection failed".to_string(),
                })
            })
            .await;
    }

    assert_eq!(
        orchestrator.circuit_breaker().state(),
        CircuitState::Open
    );

    // Wait for reset timeout
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Should transition to half-open and allow request
    let result1 = orchestrator
        .execute("recovery_test", || async { Ok(1) })
        .await;
    assert!(result1.is_ok());

    let result2 = orchestrator
        .execute("recovery_test", || async { Ok(2) })
        .await;
    assert!(result2.is_ok());

    // Circuit should be closed now
    assert_eq!(
        orchestrator.circuit_breaker().state(),
        CircuitState::Closed
    );
}

#[tokio::test]
async fn test_rate_limiter_concurrent_requests() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 0,
            ..Default::default()
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 100,
            ..Default::default()
        },
        rate_limit: RateLimitConfig {
            max_concurrent_requests: 2,
            requests_per_minute: None,
            tokens_per_minute: None,
            auto_adjust: false,
        },
    };

    let orchestrator = Arc::new(DefaultResilienceOrchestrator::new(config));

    // Start 3 concurrent tasks
    let mut handles = vec![];
    for i in 0..3 {
        let orch = orchestrator.clone();
        let handle = tokio::spawn(async move {
            orch.execute("concurrent_test", || async {
                tokio::time::sleep(Duration::from_millis(50)).await;
                Ok(i)
            })
            .await
        });
        handles.push(handle);
    }

    // Wait for all tasks
    let results: Vec<_> = futures::future::join_all(handles).await;

    // At least one should succeed (the ones that got permits)
    let successes = results.iter().filter(|r| r.as_ref().unwrap().is_ok()).count();
    assert!(successes >= 2, "Expected at least 2 successful requests");
}

#[tokio::test]
async fn test_rate_limiter_request_limit() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 0,
            ..Default::default()
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 100,
            ..Default::default()
        },
        rate_limit: RateLimitConfig {
            max_concurrent_requests: 100,
            requests_per_minute: Some(5),
            tokens_per_minute: None,
            auto_adjust: false,
        },
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);

    // Make 5 requests
    for i in 0..5 {
        let result = orchestrator
            .execute("rate_limit_test", || async { Ok(i) })
            .await;
        assert!(result.is_ok(), "Request {} should succeed", i + 1);
    }

    // 6th request should fail
    let result = orchestrator
        .execute("rate_limit_test", || async { Ok(6) })
        .await;

    assert!(result.is_err());
    assert!(matches!(result, Err(AnthropicError::RateLimit { .. })));
}

#[tokio::test]
async fn test_rate_limiter_respects_retry_after() {
    let result = Err(AnthropicError::RateLimit {
        message: "Rate limit exceeded".to_string(),
        retry_after: Some(Duration::from_secs(1)),
    });

    if let Err(e) = result {
        assert_eq!(e.retry_after(), Some(Duration::from_secs(1)));
    }
}

#[tokio::test]
async fn test_orchestrator_builder_pattern() {
    let orchestrator = ResilienceOrchestratorBuilder::new()
        .retry_config(RetryConfig {
            max_retries: 10,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(30),
            backoff_multiplier: 3.0,
            jitter: 0.2,
        })
        .circuit_breaker_config(CircuitBreakerConfig {
            failure_threshold: 10,
            success_threshold: 5,
            failure_window: Duration::from_secs(120),
            reset_timeout: Duration::from_secs(60),
        })
        .rate_limit_config(RateLimitConfig {
            max_concurrent_requests: 50,
            requests_per_minute: Some(100),
            tokens_per_minute: Some(10000),
            auto_adjust: true,
        })
        .build();

    let result = orchestrator
        .execute("builder_test", || async { Ok("configured") })
        .await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "configured");
}

#[tokio::test]
async fn test_backoff_calculation() {
    let config = RetryConfig {
        max_retries: 5,
        initial_backoff: Duration::from_millis(100),
        max_backoff: Duration::from_secs(10),
        backoff_multiplier: 2.0,
        jitter: 0.0,
    };

    let executor = RetryExecutor::new(config);

    let delay1 = executor.calculate_backoff(1, None);
    assert_eq!(delay1, Duration::from_millis(100));

    let delay2 = executor.calculate_backoff(2, None);
    assert_eq!(delay2, Duration::from_millis(200));

    let delay3 = executor.calculate_backoff(3, None);
    assert_eq!(delay3, Duration::from_millis(400));

    // Test max backoff
    let delay_large = executor.calculate_backoff(100, None);
    assert_eq!(delay_large, Duration::from_secs(10));
}

#[tokio::test]
async fn test_server_retry_after_takes_precedence() {
    let config = RetryConfig {
        initial_backoff: Duration::from_millis(100),
        ..Default::default()
    };

    let executor = RetryExecutor::new(config);

    let server_delay = Duration::from_secs(5);
    let delay = executor.calculate_backoff(1, Some(server_delay));

    assert_eq!(delay, server_delay);
}

#[tokio::test]
async fn test_error_categorization() {
    // Retryable errors
    assert!(AnthropicError::RateLimit {
        message: "test".to_string(),
        retry_after: None,
    }
    .is_retryable());

    assert!(AnthropicError::Network {
        message: "test".to_string(),
    }
    .is_retryable());

    assert!(AnthropicError::Server {
        message: "test".to_string(),
        status_code: Some(503),
    }
    .is_retryable());

    // Non-retryable errors
    assert!(!AnthropicError::Authentication {
        message: "test".to_string(),
    }
    .is_retryable());

    assert!(!AnthropicError::Validation {
        message: "test".to_string(),
        details: vec![],
    }
    .is_retryable());

    assert!(!AnthropicError::Configuration {
        message: "test".to_string(),
    }
    .is_retryable());
}

#[tokio::test]
async fn test_complete_failure_scenario() {
    let config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 2,
            initial_backoff: Duration::from_millis(10),
            ..Default::default()
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 100,
            ..Default::default()
        },
        ..Default::default()
    };

    let orchestrator = DefaultResilienceOrchestrator::new(config);
    let attempt_count = Arc::new(AtomicU32::new(0));
    let attempt_count_clone = attempt_count.clone();

    let result = orchestrator
        .execute("failure_test", move || {
            let count = attempt_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err(AnthropicError::RateLimit {
                    message: "Rate limit exceeded".to_string(),
                    retry_after: Some(Duration::from_secs(1)),
                })
            }
        })
        .await;

    assert!(result.is_err());
    assert_eq!(attempt_count.load(Ordering::SeqCst), 3); // 1 initial + 2 retries
    assert!(matches!(result.unwrap_err(), AnthropicError::RateLimit { .. }));
}

#[tokio::test]
async fn test_passthrough_orchestrator() {
    let orchestrator = DefaultResilienceOrchestrator::passthrough();

    // Should execute without any retries or rate limiting
    let attempt_count = Arc::new(AtomicU32::new(0));
    let attempt_count_clone = attempt_count.clone();

    let result = orchestrator
        .execute("passthrough_test", move || {
            let count = attempt_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err(AnthropicError::Server {
                    message: "Error".to_string(),
                    status_code: Some(503),
                })
            }
        })
        .await;

    assert!(result.is_err());
    assert_eq!(attempt_count.load(Ordering::SeqCst), 1); // No retries
}
