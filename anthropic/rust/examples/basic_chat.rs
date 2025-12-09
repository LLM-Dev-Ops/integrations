//! Basic chat completion example
//!
//! This example demonstrates how to create a simple chat completion request
//! to Claude and display the response with token usage information.
//!
//! ## Usage
//!
//! Set your API key as an environment variable:
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example basic_chat
//! ```

use integrations_anthropic::{
    create_client_from_env,
    services::messages::{CreateMessageRequest, MessageParam},
    AnthropicError,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for observability
    tracing_subscriber::fmt::init();

    println!("Anthropic Basic Chat Example");
    println!("=============================\n");

    // Create client from environment variable ANTHROPIC_API_KEY
    let client = create_client_from_env()?;

    // Create a simple message request
    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user_text("What is the capital of France?")],
        ..Default::default()
    };

    println!("Sending request to Claude...\n");

    // Send the request and handle the response
    match client.messages().create(request).await {
        Ok(response) => {
            println!("Response from Claude:");
            println!("---");

            // Display each content block in the response
            for (i, block) in response.content.iter().enumerate() {
                println!("Content Block {}:", i + 1);
                println!("{}\n", block.text());
            }

            println!("---\n");

            // Display usage statistics
            println!("Token Usage:");
            println!("  Input tokens:  {}", response.usage.input_tokens);
            println!("  Output tokens: {}", response.usage.output_tokens);
            println!(
                "  Total tokens:  {}",
                response.usage.input_tokens + response.usage.output_tokens
            );

            // Display stop reason
            if let Some(stop_reason) = response.stop_reason {
                println!("\nStop reason: {:?}", stop_reason);
            }

            // Display model information
            println!("Model: {}", response.model);
            println!("Message ID: {}", response.id);
        }
        Err(e) => {
            eprintln!("Error: {}", e);

            // Provide specific guidance based on error type
            match e {
                AnthropicError::Authentication { .. } => {
                    eprintln!("\nMake sure your ANTHROPIC_API_KEY environment variable is set correctly.");
                    eprintln!("You can get your API key from: https://console.anthropic.com/");
                }
                AnthropicError::RateLimit { retry_after, .. } => {
                    eprintln!("\nYou've hit the rate limit.");
                    if let Some(duration) = retry_after {
                        eprintln!("Retry after: {:?}", duration);
                    }
                }
                AnthropicError::InvalidRequest { message, .. } => {
                    eprintln!("\nInvalid request: {}", message);
                }
                _ => {}
            }

            return Err(Box::new(e));
        }
    }

    Ok(())
}
