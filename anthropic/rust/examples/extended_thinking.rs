//! Extended thinking example
//!
//! This example demonstrates how to use Claude's extended thinking feature
//! for complex reasoning tasks. Extended thinking allows Claude to "think through"
//! problems step by step before providing an answer.
//!
//! ## Usage
//!
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example extended_thinking --features beta
//! ```

use integrations_anthropic::{
    config::{AnthropicConfigBuilder, BetaFeature},
    create_client,
    services::messages::{ContentBlock, CreateMessageRequest, MessageParam},
};
use secrecy::SecretString;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("Anthropic Extended Thinking Example");
    println!("===================================\n");

    // Enable extended thinking beta feature
    let config = AnthropicConfigBuilder::new()
        .api_key(SecretString::new(
            std::env::var("ANTHROPIC_API_KEY")
                .expect("ANTHROPIC_API_KEY environment variable not set"),
        ))
        .beta_feature(BetaFeature::ExtendedThinking)
        .build()?;

    let client = create_client(config)?;

    // A complex problem that benefits from extended thinking
    let problem = "You are designing a distributed caching system for a high-traffic e-commerce platform. \
                   The system needs to handle 100,000 requests per second with sub-10ms latency. \
                   Consider the following requirements:\n\
                   1. Data consistency across multiple regions\n\
                   2. Cache invalidation strategies\n\
                   3. Memory optimization\n\
                   4. Failure recovery\n\n\
                   Design a comprehensive architecture with specific technology recommendations.";

    println!("Problem:");
    println!("{}\n", problem);

    // Create request with extended thinking enabled
    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 16000, // Higher token limit for thinking + response
        messages: vec![MessageParam::user_text(problem)],
        thinking: Some(serde_json::json!({
            "type": "enabled",
            "budget_tokens": 10000  // Allocate tokens for thinking
        })),
        ..Default::default()
    };

    println!("Asking Claude to think through the problem...\n");
    println!("This may take a moment as Claude reasons through the solution.\n");

    let response = client.messages().create(request).await?;

    // Display thinking process and answer
    let mut has_thinking = false;

    for (i, block) in response.content.iter().enumerate() {
        match block {
            ContentBlock::Thinking { thinking } => {
                has_thinking = true;
                println!("=== Thinking Process ===");
                println!("{}\n", thinking);
            }
            ContentBlock::Text { text, .. } => {
                if has_thinking {
                    println!("=== Final Answer ===");
                }
                println!("{}\n", text);
            }
            _ => {
                println!("Content block {}: {:?}", i, block);
            }
        }
    }

    // Display usage statistics
    println!("=== Token Usage ===");
    println!("Input tokens:  {}", response.usage.input_tokens);
    println!("Output tokens: {}", response.usage.output_tokens);
    println!(
        "Total tokens:  {}",
        response.usage.input_tokens + response.usage.output_tokens
    );

    if let Some(stop_reason) = response.stop_reason {
        println!("\nStop reason: {:?}", stop_reason);
    }

    println!("\nNote: Extended thinking allows Claude to reason through complex problems");
    println!("before providing an answer, leading to more thorough and well-reasoned responses.");

    Ok(())
}
