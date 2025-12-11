//! Resilience patterns example for Gemini API.
//!
//! This example demonstrates:
//! - Configuring retry logic with exponential backoff
//! - Configuring circuit breaker patterns
//! - Configuring rate limiting
//! - Using resilience orchestrator
//! - Handling transient failures
//! - Understanding resilience configurations
//!
//! # Usage
//!
//! Set your API key as an environment variable:
//! ```bash
//! export GEMINI_API_KEY="your-api-key-here"
//! ```
//!
//! Then run:
//! ```bash
//! cargo run --example resilience
//! ```

use integrations_gemini::{
    GeminiConfig, GeminiClientImpl,
    resilience::{
        ResilienceOrchestrator, ResilienceConfig,
        RetryConfig, CircuitBreakerConfig, RateLimiterConfig,
        CircuitState,
    },
    types::{Content, Part, Role, GenerateContentRequest},
};
use secrecy::SecretString;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Resilience Patterns Example ===\n");

    // Example 1: Default resilience configuration
    println!("=== Example 1: Default Resilience Configuration ===\n");
    example_default_resilience().await?;

    println!("\n");

    // Example 2: Custom retry configuration
    println!("=== Example 2: Custom Retry Configuration ===\n");
    example_custom_retry().await?;

    println!("\n");

    // Example 3: Circuit breaker configuration
    println!("=== Example 3: Circuit Breaker Configuration ===\n");
    example_circuit_breaker().await?;

    println!("\n");

    // Example 4: Rate limiting configuration
    println!("=== Example 4: Rate Limiting Configuration ===\n");
    example_rate_limiting().await?;

    println!("\n");

    // Example 5: Combined resilience patterns
    println!("=== Example 5: Combined Resilience Patterns ===\n");
    example_combined_resilience().await?;

    println!("\n");

    // Example 6: Aggressive configuration
    println!("=== Example 6: Aggressive Configuration (High Reliability) ===\n");
    example_aggressive_resilience().await?;

    println!("\n");

    // Example 7: Conservative configuration
    println!("=== Example 7: Conservative Configuration (Controlled) ===\n");
    example_conservative_resilience().await?;

    println!("\n=== Examples Complete ===");

    Ok(())
}

/// Example: Default resilience configuration.
async fn example_default_resilience() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating client with default resilience configuration...");

    let api_key = std::env::var("GEMINI_API_KEY")
        .or_else(|_| std::env::var("GOOGLE_API_KEY"))
        .unwrap_or_else(|_| "demo-key".to_string());

    let config = GeminiConfig::builder()
        .api_key(SecretString::new(api_key.into()))
        .build()?;

    let client = GeminiClientImpl::new(config)?;

    println!("\n   ✓ Client created with default resilience settings");
    println!("\n   Default Configuration:");
    println!("     Retry:");
    println!("       • Max attempts: 3");
    println!("       • Initial delay: 1s");
    println!("       • Max delay: 60s");
    println!("       • Multiplier: 2.0");
    println!("       • Jitter: 0.25");
    println!("\n     Circuit Breaker:");
    println!("       • Failure threshold: 5");
    println!("       • Success threshold: 3");
    println!("       • Open duration: 30s");
    println!("       • Half-open max requests: 1");
    println!("\n     Rate Limiter:");
    println!("       • Requests per minute: 60");
    println!("       • Tokens per minute: 1,000,000");

    Ok(())
}

/// Example: Custom retry configuration.
async fn example_custom_retry() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating orchestrator with custom retry configuration...");

    let retry_config = RetryConfig {
        max_retries: 5,
        initial_delay: Duration::from_millis(500),
        max_delay: Duration::from_secs(30),
        multiplier: 2.0,
        jitter: 0.2,
    };

    let resilience_config = ResilienceConfig {
        retry: retry_config,
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: RateLimiterConfig::default(),
        enable_retry: true,
        enable_circuit_breaker: true,
        enable_rate_limiting: true,
    };

    let orchestrator = ResilienceOrchestrator::new(resilience_config);

    println!("\n   ✓ Orchestrator created with custom retry settings");
    println!("\n   Custom Retry Configuration:");
    println!("     • Max retries: 5 (instead of default 3)");
    println!("     • Initial delay: 500ms (instead of 1s)");
    println!("     • Max delay: 30s (instead of 60s)");
    println!("     • Multiplier: 2.0 (exponential backoff)");
    println!("     • Jitter: 0.2 (20% randomization to avoid thundering herd)");

    println!("\n   Retry delay progression:");
    let mut delay = 500.0;
    for attempt in 1..=5 {
        println!("     Attempt {}: ~{:.0}ms", attempt + 1, delay);
        delay *= 2.0;
        if delay > 30000.0 {
            delay = 30000.0;
        }
    }

    println!("\n   Use cases:");
    println!("     • More retries for critical operations");
    println!("     • Faster initial retry for transient issues");
    println!("     • Lower max delay for time-sensitive operations");

    Ok(())
}

/// Example: Circuit breaker configuration.
async fn example_circuit_breaker() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating orchestrator with custom circuit breaker...");

    let circuit_breaker_config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        timeout: Duration::from_secs(60),
        half_open_max_requests: 2,
    };

    let resilience_config = ResilienceConfig {
        retry: RetryConfig::default(),
        circuit_breaker: circuit_breaker_config,
        rate_limiter: RateLimiterConfig::default(),
        enable_retry: true,
        enable_circuit_breaker: true,
        enable_rate_limiting: true,
    };

    let orchestrator = ResilienceOrchestrator::new(resilience_config);

    println!("\n   ✓ Orchestrator created with custom circuit breaker");
    println!("\n   Custom Circuit Breaker Configuration:");
    println!("     • Failure threshold: 3 (open after 3 failures)");
    println!("     • Success threshold: 2 (close after 2 successes in half-open)");
    println!("     • Timeout: 60s (stay open for 60s)");
    println!("     • Half-open max requests: 2 (test with 2 requests)");

    println!("\n   Circuit Breaker States:");
    println!("     1. CLOSED (normal operation)");
    println!("        • Requests pass through normally");
    println!("        • Failures are counted");
    println!("        • Opens after {} failures", 3);
    println!("\n     2. OPEN (failing)");
    println!("        • All requests fail fast");
    println!("        • No requests reach the service");
    println!("        • Transitions to HALF_OPEN after {} seconds", 60);
    println!("\n     3. HALF_OPEN (testing)");
    println!("        • Limited requests pass through (max {})", 2);
    println!("        • Closes after {} successes", 2);
    println!("        • Opens again on any failure");

    // Check current state
    println!("\n   Current circuit state: {:?}", orchestrator.circuit_breaker().state());

    println!("\n   Benefits:");
    println!("     • Prevents cascading failures");
    println!("     • Fast-fail during outages");
    println!("     • Automatic recovery testing");
    println!("     • Protects downstream services");

    Ok(())
}

/// Example: Rate limiting configuration.
async fn example_rate_limiting() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating orchestrator with custom rate limiting...");

    let rate_limiter_config = RateLimiterConfig {
        requests_per_minute: 30,
        burst_size: 5,
        refill_interval: Duration::from_secs(2),
    };

    let resilience_config = ResilienceConfig {
        retry: RetryConfig::default(),
        circuit_breaker: CircuitBreakerConfig::default(),
        rate_limiter: rate_limiter_config,
        enable_retry: true,
        enable_circuit_breaker: true,
        enable_rate_limiting: true,
    };

    let orchestrator = ResilienceOrchestrator::new(resilience_config);

    println!("\n   ✓ Orchestrator created with custom rate limiting");
    println!("\n   Custom Rate Limiter Configuration:");
    println!("     • Requests per minute: 30");
    println!("     • Burst size: 5 (allow 5 immediate requests)");
    println!("     • Refill interval: 2s (add tokens every 2s)");

    println!("\n   How it works (Token Bucket Algorithm):");
    println!("     1. Bucket starts with 5 tokens (burst size)");
    println!("     2. Each request consumes 1 token");
    println!("     3. Tokens refill every 2 seconds");
    println!("     4. Refill rate: 30 requests/60s = 0.5 requests/s");
    println!("     5. Requests wait if no tokens available");

    println!("\n   Example scenario:");
    println!("     • Send 5 requests immediately (burst) → all succeed");
    println!("     • 6th request → waits ~2s for token refill");
    println!("     • Sustained rate: ~30 requests per minute");

    println!("\n   Use cases:");
    println!("     • Comply with API rate limits");
    println!("     • Prevent overwhelming the service");
    println!("     • Smooth out traffic spikes");
    println!("     • Fair resource allocation");

    Ok(())
}

/// Example: Combined resilience patterns.
async fn example_combined_resilience() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating orchestrator with all resilience patterns...");

    let resilience_config = ResilienceConfig {
        retry: RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(1000),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
            jitter: 0.25,
        },
        circuit_breaker: CircuitBreakerConfig {
            failure_threshold: 5,
            success_threshold: 3,
            timeout: Duration::from_secs(30),
            half_open_max_requests: 1,
        },
        rate_limiter: RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 10,
            refill_interval: Duration::from_secs(1),
        },
        enable_retry: true,
        enable_circuit_breaker: true,
        enable_rate_limiting: true,
    };

    let orchestrator = ResilienceOrchestrator::new(resilience_config);

    println!("\n   ✓ Orchestrator created with combined resilience");
    println!("\n   Request Flow:");
    println!("     1. Rate Limiting Check");
    println!("        → Wait if rate limit exceeded");
    println!("\n     2. Circuit Breaker Check");
    println!("        → Fail fast if circuit is open");
    println!("\n     3. Execute Request with Retry");
    println!("        → Retry on transient failures");
    println!("        → Use exponential backoff + jitter");
    println!("\n     4. Update Circuit Breaker");
    println!("        → Record success/failure");
    println!("        → Update circuit state");

    println!("\n   Benefits of Combined Patterns:");
    println!("     • Defense in depth");
    println!("     • Handles different failure modes");
    println!("     • Rate limiting prevents overwhelming");
    println!("     • Circuit breaker provides fast-fail");
    println!("     • Retry handles transient issues");

    Ok(())
}

/// Example: Aggressive configuration for high reliability.
async fn example_aggressive_resilience() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating orchestrator with aggressive configuration...");

    let resilience_config = ResilienceConfig::aggressive();
    let orchestrator = ResilienceOrchestrator::new(resilience_config);

    println!("\n   ✓ Aggressive configuration applied");
    println!("\n   Aggressive Configuration:");
    println!("     Retry:");
    println!("       • Max retries: 5 (more attempts)");
    println!("       • Initial delay: 500ms (faster retry)");
    println!("       • Max delay: 120s (longer patience)");
    println!("\n     Circuit Breaker:");
    println!("       • Failure threshold: 3 (sensitive)");
    println!("       • Timeout: 60s (longer recovery time)");
    println!("\n     Rate Limiter:");
    println!("       • Requests per minute: 120 (higher throughput)");

    println!("\n   Best for:");
    println!("     • Production systems requiring high availability");
    println!("     • Critical operations that must succeed");
    println!("     • Systems with SLA requirements");
    println!("     • Environments with occasional transient failures");

    Ok(())
}

/// Example: Conservative configuration for controlled environments.
async fn example_conservative_resilience() -> Result<(), Box<dyn std::error::Error>> {
    println!("Creating orchestrator with conservative configuration...");

    let resilience_config = ResilienceConfig::conservative();
    let orchestrator = ResilienceOrchestrator::new(resilience_config);

    println!("\n   ✓ Conservative configuration applied");
    println!("\n   Conservative Configuration:");
    println!("     Retry:");
    println!("       • Max retries: 3 (default)");
    println!("       • Initial delay: 1s (standard)");
    println!("       • Max delay: 60s (reasonable)");
    println!("\n     Circuit Breaker:");
    println!("       • Failure threshold: 10 (lenient)");
    println!("       • Timeout: 30s (standard recovery)");
    println!("\n     Rate Limiter:");
    println!("       • Requests per minute: 30 (controlled)");

    println!("\n   Best for:");
    println!("     • Development and testing");
    println!("     • Systems with strict rate limits");
    println!("     • Environments where failures are rare");
    println!("     • Cost-sensitive applications");

    Ok(())
}
