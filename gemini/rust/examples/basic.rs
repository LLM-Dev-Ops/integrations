//! Basic content generation example for Gemini API.
//!
//! This example demonstrates:
//! - Creating a client from environment variables
//! - Simple text generation with a Gemini model
//! - Handling responses and errors
//! - Printing token usage statistics
//!
//! # Usage
//!
//! Set your API key as an environment variable:
//! ```bash
//! export GEMINI_API_KEY="your-api-key-here"
//! # or
//! export GOOGLE_API_KEY="your-api-key-here"
//! ```
//!
//! Then run:
//! ```bash
//! cargo run --example basic
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{Content, Part, Role, GenerateContentRequest},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for better logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Basic Content Generation Example ===\n");

    // Step 1: Create client from environment variables
    // This will read GEMINI_API_KEY or GOOGLE_API_KEY from environment
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Step 2: Prepare the request
    println!("2. Preparing generation request...");
    let prompt = "Explain quantum computing in simple terms, in 2-3 sentences.";
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

    // Step 3: Generate content
    println!("3. Generating content...");
    let model = "gemini-1.5-pro";

    // Note: ContentService is not yet implemented in the client
    // This is a demonstration of the intended usage pattern
    // Uncomment when ContentService is available:
    /*
    let response = client.content()
        .generate(model, request)
        .await?;

    // Step 4: Display the response
    println!("   ✓ Content generated successfully\n");
    println!("=== Response ===\n");

    if let Some(candidates) = &response.candidates {
        for (i, candidate) in candidates.iter().enumerate() {
            println!("Candidate {}:", i + 1);

            if let Some(content) = &candidate.content {
                for part in &content.parts {
                    match part {
                        Part::Text { text } => {
                            println!("{}", text);
                        }
                        _ => {
                            println!("(Non-text content)");
                        }
                    }
                }
            }

            if let Some(finish_reason) = &candidate.finish_reason {
                println!("\nFinish reason: {:?}", finish_reason);
            }

            if let Some(safety_ratings) = &candidate.safety_ratings {
                println!("\nSafety ratings:");
                for rating in safety_ratings {
                    println!("  - {:?}: {:?}", rating.category, rating.probability);
                }
            }

            println!();
        }
    }

    // Step 5: Display usage statistics
    if let Some(usage) = &response.usage_metadata {
        println!("=== Usage Statistics ===");
        println!("Prompt tokens:     {}", usage.prompt_token_count);
        println!("Completion tokens: {}", usage.candidates_token_count.unwrap_or(0));
        println!("Total tokens:      {}", usage.total_token_count);

        if let Some(cached_tokens) = usage.cached_content_token_count {
            if cached_tokens > 0 {
                println!("Cached tokens:     {}", cached_tokens);
            }
        }
    }
    */

    println!("\n=== Example Complete ===");
    println!("Note: ContentService implementation is pending.");
    println!("This example demonstrates the intended API usage pattern.\n");

    Ok(())
}
