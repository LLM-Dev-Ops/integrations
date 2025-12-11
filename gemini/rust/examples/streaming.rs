//! Streaming content generation example for Gemini API.
//!
//! This example demonstrates:
//! - Creating a client from environment variables
//! - Using streaming content generation
//! - Processing chunks as they arrive
//! - Accumulating the final response
//! - Handling streaming errors
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
//! cargo run --example streaming
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{Content, Part, Role, GenerateContentRequest},
    streaming::StreamAccumulator,
};
use futures::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for better logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Streaming Content Generation Example ===\n");

    // Step 1: Create client from environment variables
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Step 2: Prepare the request
    println!("2. Preparing streaming generation request...");
    let prompt = "Write a short story about a robot learning to paint. Make it about 200 words.";
    println!("   Prompt: {}\n", prompt);

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: prompt.to_string(),
                    }
                ],
            }
        ],
        generation_config: None,
        safety_settings: None,
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: None,
    };

    // Step 3: Start streaming generation
    println!("3. Starting streaming generation...");
    println!("   (Content will appear as it's generated)\n");
    println!("=== Streaming Response ===\n");

    let model = "gemini-1.5-pro";

    // Note: ContentService is not yet implemented in the client
    // This is a demonstration of the intended usage pattern
    // Uncomment when ContentService is available:
    /*
    let mut stream = client.content()
        .generate_stream(model, request)
        .await?;

    // Step 4: Process chunks as they arrive
    let mut accumulator = StreamAccumulator::new();
    let mut chunk_count = 0;

    while let Some(result) = stream.next().await {
        match result {
            Ok(chunk) => {
                chunk_count += 1;

                // Print each chunk as it arrives
                if let Some(candidates) = &chunk.candidates {
                    for candidate in candidates {
                        if let Some(content) = &candidate.content {
                            for part in &content.parts {
                                if let Part::Text { text } = part {
                                    print!("{}", text);
                                    std::io::Write::flush(&mut std::io::stdout())?;
                                }
                            }
                        }
                    }
                }

                // Accumulate chunk for final response
                accumulator.add_chunk(chunk);
            }
            Err(e) => {
                eprintln!("\nError receiving chunk: {}", e);
                return Err(e.into());
            }
        }
    }

    println!("\n");

    // Step 5: Get the complete accumulated response
    println!("=== Streaming Complete ===\n");
    println!("Chunks received: {}", chunk_count);

    let final_response = accumulator.finalize();

    // Step 6: Display usage statistics
    if let Some(usage) = &final_response.usage_metadata {
        println!("\n=== Usage Statistics ===");
        println!("Prompt tokens:     {}", usage.prompt_token_count);
        println!("Completion tokens: {}", usage.candidates_token_count.unwrap_or(0));
        println!("Total tokens:      {}", usage.total_token_count);

        if let Some(cached_tokens) = usage.cached_content_token_count {
            if cached_tokens > 0 {
                println!("Cached tokens:     {}", cached_tokens);
            }
        }
    }

    // Display finish reason
    if let Some(candidates) = &final_response.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(finish_reason) = &candidate.finish_reason {
                println!("\nFinish reason: {:?}", finish_reason);
            }
        }
    }
    */

    println!("\n=== Example Complete ===");
    println!("Note: ContentService implementation is pending.");
    println!("This example demonstrates the intended API usage pattern.\n");

    println!("Key features of streaming:");
    println!("  • Chunks arrive progressively as they're generated");
    println!("  • Lower perceived latency for users");
    println!("  • Can process or display content before completion");
    println!("  • StreamAccumulator helps collect the final response");

    Ok(())
}
