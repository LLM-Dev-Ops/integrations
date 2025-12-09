//! Example: Basic chat completion
//!
//! This example demonstrates how to use the OpenAI Rust client to create
//! a simple chat completion request with system and user messages.
//!
//! ## Usage
//!
//! Set your API key:
//! ```bash
//! export OPENAI_API_KEY=sk-...
//! ```
//!
//! Run the example:
//! ```bash
//! cargo run --example chat_completion
//! ```

use integrations_openai::{ChatCompletionRequest, ChatMessage, OpenAIClientBuilder, OpenAIConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration from environment variables
    let config = OpenAIConfig::from_env()?;

    // Build the client
    let client = OpenAIClientBuilder::new().with_config(config).build()?;

    // Create a chat completion request
    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![
            ChatMessage::system("You are a helpful assistant that explains complex topics simply."),
            ChatMessage::user("What is Rust programming language and why is it popular?"),
        ],
    )
    .with_temperature(0.7)
    .with_max_tokens(500);

    println!("Sending request to OpenAI...\n");

    // Send the request and await the response
    let response = client.chat().create(request).await?;

    // Print the response
    println!("Response:");
    println!(
        "{}",
        response.choices[0]
            .message
            .content
            .as_ref()
            .unwrap_or(&"No content".to_string())
    );

    // Print usage information
    if let Some(usage) = &response.usage {
        println!("\n---");
        println!("Tokens used:");
        println!("  Prompt: {}", usage.prompt_tokens);
        println!("  Completion: {}", usage.completion_tokens);
        println!("  Total: {}", usage.total_tokens);
    }

    Ok(())
}
