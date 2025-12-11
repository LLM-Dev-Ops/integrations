//! Cached content example for Gemini API.
//!
//! This example demonstrates:
//! - Creating cached content with TTL (time-to-live)
//! - Using cached content in generation requests
//! - Listing cached content
//! - Updating cached content expiration
//! - Deleting cached content
//! - Understanding token savings from caching
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
//! cargo run --example cached_content
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{
        CreateCachedContentRequest, UpdateCachedContentRequest, ListCachedContentsParams,
        Content, Part, Role, GenerateContentRequest,
    },
};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Cached Content Example ===\n");

    // Create client
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Example 1: Create cached content
    println!("=== Example 1: Create Cached Content ===\n");
    let cached_name = example_create_cached_content(&client).await?;

    println!("\n");

    // Example 2: List cached content
    println!("=== Example 2: List Cached Content ===\n");
    example_list_cached_content(&client).await?;

    println!("\n");

    // Example 3: Use cached content in generation
    println!("=== Example 3: Use Cached Content in Generation ===\n");
    example_use_cached_content(&client, &cached_name).await?;

    println!("\n");

    // Example 4: Update cached content expiration
    println!("=== Example 4: Update Cached Content Expiration ===\n");
    example_update_cached_content(&client, &cached_name).await?;

    println!("\n");

    // Example 5: Delete cached content
    println!("=== Example 5: Delete Cached Content ===\n");
    example_delete_cached_content(&client, &cached_name).await?;

    println!("\n=== Examples Complete ===");

    Ok(())
}

/// Example: Create cached content with TTL.
async fn example_create_cached_content(client: &GeminiClientImpl) -> Result<String, Box<dyn std::error::Error>> {
    println!("2. Creating cached content...");

    // Create a large system instruction that will be cached
    let system_instruction = Content {
        role: Some(Role::System),
        parts: vec![
            Part::Text {
                text: r#"You are a helpful AI assistant specialized in explaining complex topics.

Your responses should:
1. Be clear and concise
2. Use analogies where appropriate
3. Break down complex concepts into digestible parts
4. Provide examples when helpful
5. Adapt your explanation level to the question

When explaining technical concepts:
- Start with the big picture
- Define key terms
- Explain how components interact
- Use real-world analogies
- Avoid jargon unless necessary

Always maintain a friendly and encouraging tone.
"#.to_string(),
            }
        ],
    };

    let request = CreateCachedContentRequest {
        model: Some("models/gemini-1.5-pro".to_string()),
        contents: vec![system_instruction.clone()],
        system_instruction: None,
        tools: None,
        tool_config: None,
        ttl: Some("3600s".to_string()), // 1 hour TTL
        expire_time: None,
        display_name: Some("helpful-assistant-context".to_string()),
    };

    println!("   Model: gemini-1.5-pro");
    println!("   TTL: 3600s (1 hour)");
    println!("   Display name: helpful-assistant-context");
    println!("   System instruction length: {} characters",
             system_instruction.parts.iter()
                 .filter_map(|p| if let Part::Text { text } = p { Some(text.len()) } else { None })
                 .sum::<usize>());

    // Note: CachedContentService not yet implemented
    // Uncomment when available:
    /*
    let cached_content = client.cached_content()
        .create(request)
        .await?;

    println!("\n   ✓ Cached content created successfully");
    println!("   Name: {}", cached_content.name);
    println!("   Create time: {}", cached_content.create_time.unwrap_or_default());
    println!("   Expire time: {}", cached_content.expire_time.unwrap_or_default());

    if let Some(usage) = &cached_content.usage_metadata {
        println!("\n   Token usage:");
        println!("     Total tokens: {}", usage.total_token_count);
    }

    return Ok(cached_content.name);
    */

    println!("\n   Note: CachedContentService implementation is pending.");
    Ok("cachedContents/sample-cache-id".to_string())
}

/// Example: List cached content.
async fn example_list_cached_content(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Listing cached content...");

    let params = ListCachedContentsParams {
        page_size: Some(10),
        page_token: None,
    };

    // Note: CachedContentService not yet implemented
    // Uncomment when available:
    /*
    let response = client.cached_content()
        .list(Some(params))
        .await?;

    println!("\n   ✓ Cached content retrieved successfully");

    if let Some(cached_contents) = &response.cached_contents {
        println!("   Found {} cached content(s):", cached_contents.len());

        for (i, cached) in cached_contents.iter().enumerate() {
            println!("\n   Cached Content {}:", i + 1);
            println!("     Name: {}", cached.name);
            println!("     Display name: {}", cached.display_name.as_deref().unwrap_or("(none)"));
            println!("     Model: {}", cached.model.as_deref().unwrap_or("(none)"));

            if let Some(create_time) = &cached.create_time {
                println!("     Created: {}", create_time);
            }

            if let Some(expire_time) = &cached.expire_time {
                println!("     Expires: {}", expire_time);
            }

            if let Some(usage) = &cached.usage_metadata {
                println!("     Total tokens: {}", usage.total_token_count);
            }
        }
    } else {
        println!("   No cached content found");
    }

    if let Some(next_page_token) = &response.next_page_token {
        println!("\n   More cached content available");
    }
    */

    println!("\n   Note: Lists all cached content with pagination support.");

    Ok(())
}

/// Example: Use cached content in generation.
async fn example_use_cached_content(client: &GeminiClientImpl, cached_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Using cached content in generation...");
    println!("   Cached content: {}", cached_name);

    // Create a request that uses the cached content
    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Explain how neural networks work.".to_string(),
                    }
                ],
            }
        ],
        generation_config: None,
        safety_settings: None,
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: Some(cached_name.to_string()),
    };

    println!("   ✓ Request prepared with cached content reference");

    // Note: ContentService not yet implemented
    // Uncomment when available:
    /*
    let response = client.content()
        .generate("gemini-1.5-pro", request)
        .await?;

    println!("\n   ✓ Content generated successfully");

    if let Some(candidates) = &response.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(content) = &candidate.content {
                println!("\n   Response:");
                for part in &content.parts {
                    if let Part::Text { text } = part {
                        println!("   {}", text);
                    }
                }
            }
        }
    }

    // Display token savings
    if let Some(usage) = &response.usage_metadata {
        println!("\n   Token usage:");
        println!("     Prompt tokens: {}", usage.prompt_token_count);
        println!("     Completion tokens: {}", usage.candidates_token_count.unwrap_or(0));
        println!("     Total tokens: {}", usage.total_token_count);

        if let Some(cached_tokens) = usage.cached_content_token_count {
            println!("     Cached tokens: {} (not charged!)", cached_tokens);

            let savings_pct = if usage.total_token_count > 0 {
                (cached_tokens as f64 / usage.total_token_count as f64) * 100.0
            } else {
                0.0
            };
            println!("     Savings: {:.1}%", savings_pct);
        }
    }
    */

    println!("\n   Benefits of cached content:");
    println!("     • Reduced latency - cached content loads faster");
    println!("     • Lower costs - cached tokens are not charged");
    println!("     • Consistent context - same system instruction across requests");

    Ok(())
}

/// Example: Update cached content expiration.
async fn example_update_cached_content(client: &GeminiClientImpl, cached_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Updating cached content expiration...");
    println!("   Cached content: {}", cached_name);

    let update_request = UpdateCachedContentRequest {
        ttl: Some("7200s".to_string()), // Extend to 2 hours
        expire_time: None,
    };

    println!("   New TTL: 7200s (2 hours)");

    // Note: CachedContentService not yet implemented
    // Uncomment when available:
    /*
    let updated_cached = client.cached_content()
        .update(cached_name, update_request)
        .await?;

    println!("\n   ✓ Cached content updated successfully");
    println!("   Name: {}", updated_cached.name);
    println!("   New expire time: {}", updated_cached.expire_time.unwrap_or_default());
    */

    println!("\n   Note: You can extend the TTL to keep content cached longer.");
    println!("   Maximum TTL varies by model and configuration.");

    Ok(())
}

/// Example: Delete cached content.
async fn example_delete_cached_content(client: &GeminiClientImpl, cached_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Deleting cached content...");
    println!("   Cached content: {}", cached_name);

    // Note: CachedContentService not yet implemented
    // Uncomment when available:
    /*
    client.cached_content()
        .delete(cached_name)
        .await?;

    println!("\n   ✓ Cached content deleted successfully");

    // Verify deletion
    match client.cached_content().get(cached_name).await {
        Ok(_) => {
            println!("   ⚠ Warning: Cached content still exists after deletion");
        }
        Err(_) => {
            println!("   ✓ Confirmed: Cached content no longer exists");
        }
    }
    */

    println!("\n   Note: Deleted cached content cannot be recovered.");
    println!("   Cached content is automatically deleted after expiration.");

    println!("\n=== Best Practices for Cached Content ===");
    println!("  • Cache large, reusable system instructions or context");
    println!("  • Set appropriate TTL based on your use case");
    println!("  • Monitor cached token usage to understand savings");
    println!("  • Delete cached content when no longer needed");
    println!("  • Use descriptive display names for easier management");

    Ok(())
}
