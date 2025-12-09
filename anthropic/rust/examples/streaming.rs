//! Streaming chat completion example
//!
//! This example demonstrates how to stream responses from Claude in real-time,
//! displaying the text as it's generated token by token.
//!
//! ## Usage
//!
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example streaming
//! ```

use integrations_anthropic::{
    create_client_from_env,
    services::messages::{CreateMessageRequest, MessageParam, StreamEvent},
};
use futures::StreamExt;
use std::io::{self, Write};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("Anthropic Streaming Example");
    println!("===========================\n");

    let client = create_client_from_env()?;

    // Create a request that will stream the response
    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 2048,
        messages: vec![MessageParam::user_text(
            "Write a short story about a robot learning to paint. Keep it under 200 words.",
        )],
        stream: Some(true),
        ..Default::default()
    };

    println!("Asking Claude to write a story (streaming)...\n");
    println!("Response:");
    println!("---");

    // Create the stream
    let mut stream = client.messages().create_stream(request).await?;

    let mut total_input_tokens = 0;
    let mut total_output_tokens = 0;
    let mut message_id = String::new();

    // Process stream events as they arrive
    while let Some(event) = stream.next().await {
        match event? {
            StreamEvent::MessageStart { message } => {
                message_id = message.id.clone();
                total_input_tokens = message.usage.input_tokens;
                tracing::debug!("Message started: {}", message_id);
            }
            StreamEvent::ContentBlockStart { index, .. } => {
                tracing::debug!("Content block {} started", index);
            }
            StreamEvent::ContentBlockDelta { delta, .. } => {
                // Print text deltas as they arrive
                if let Some(text) = delta.text {
                    print!("{}", text);
                    io::stdout().flush()?;
                }
            }
            StreamEvent::ContentBlockStop { .. } => {
                tracing::debug!("Content block stopped");
            }
            StreamEvent::MessageDelta { delta, usage } => {
                total_output_tokens = usage.output_tokens;
                if let Some(stop_reason) = delta.stop_reason {
                    tracing::debug!("Stop reason: {:?}", stop_reason);
                }
            }
            StreamEvent::MessageStop => {
                println!("\n---\n");
                println!("[Stream completed]");
                break;
            }
            StreamEvent::Ping => {
                tracing::debug!("Ping received");
            }
            StreamEvent::Error { error } => {
                eprintln!("\nStream error: {:?}", error);
                return Err(format!("Stream error: {:?}", error).into());
            }
        }
    }

    // Display usage statistics
    println!("\nToken Usage:");
    println!("  Input tokens:  {}", total_input_tokens);
    println!("  Output tokens: {}", total_output_tokens);
    println!("  Total tokens:  {}", total_input_tokens + total_output_tokens);
    println!("\nMessage ID: {}", message_id);

    Ok(())
}
