//! Example: Streaming chat completion
//!
//! This example demonstrates how to use the OpenAI Rust client to create
//! a streaming chat completion request. The response is received in chunks
//! as they become available, allowing for real-time output.
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
//! cargo run --example streaming
//! ```

use futures::StreamExt;
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
        vec![ChatMessage::user(
            "Tell me a short story about a robot learning to paint. Keep it under 200 words.",
        )],
    );

    println!("Streaming response from OpenAI...\n");
    print!("Response: ");

    // Create a streaming request
    let mut stream = client.chat().create_stream(request).await?;

    // Process the stream chunk by chunk
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                // Extract content from the first choice's delta
                if let Some(choice) = chunk.choices.first() {
                    if let Some(content) = &choice.delta.content {
                        // Print each chunk as it arrives
                        print!("{}", content);
                        // Flush stdout to see the output immediately
                        use std::io::Write;
                        std::io::stdout().flush()?;
                    }
                }
            }
            Err(e) => {
                eprintln!("\nError processing chunk: {}", e);
                return Err(e.into());
            }
        }
    }

    println!("\n\nStreaming complete!");

    Ok(())
}
