//! Safety settings configuration example for Gemini API.
//!
//! This example demonstrates:
//! - Configuring safety settings for different harm categories
//! - Setting block thresholds (BLOCK_NONE, BLOCK_LOW_AND_ABOVE, etc.)
//! - Handling safety-blocked responses
//! - Understanding safety ratings in responses
//! - Testing different safety configurations
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
//! cargo run --example safety_settings
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{
        Content, Part, Role, GenerateContentRequest,
        SafetySetting, HarmCategory, HarmBlockThreshold,
    },
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Safety Settings Example ===\n");

    // Create client
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Example 1: Default safety settings (most restrictive)
    println!("=== Example 1: Default Safety Settings ===\n");
    example_default_safety(&client).await?;

    println!("\n");

    // Example 2: Permissive safety settings
    println!("=== Example 2: Permissive Safety Settings ===\n");
    example_permissive_safety(&client).await?;

    println!("\n");

    // Example 3: Custom safety settings per category
    println!("=== Example 3: Custom Safety Settings Per Category ===\n");
    example_custom_safety(&client).await?;

    println!("\n");

    // Example 4: Handling safety-blocked content
    println!("=== Example 4: Handling Safety Blocks ===\n");
    example_safety_blocked(&client).await?;

    println!("\n=== Examples Complete ===");

    Ok(())
}

/// Example with default safety settings.
async fn example_default_safety(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Using default safety settings (most restrictive)...");

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Write a family-friendly story about a helpful robot.".to_string(),
                    }
                ],
            }
        ],
        generation_config: None,
        safety_settings: None, // Default settings will be used
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: None,
    };

    println!("   ✓ Request prepared with default safety settings");
    println!("   Default behavior: BLOCK_MEDIUM_AND_ABOVE for all categories\n");

    // Note: ContentService not yet implemented
    // Uncomment when available:
    /*
    match client.content().generate("gemini-1.5-pro", request).await {
        Ok(response) => {
            println!("   ✓ Content generated successfully");

            // Display safety ratings
            if let Some(candidates) = &response.candidates {
                if let Some(candidate) = candidates.first() {
                    if let Some(safety_ratings) = &candidate.safety_ratings {
                        println!("\n   Safety Ratings:");
                        for rating in safety_ratings {
                            println!("     {:?}: {:?}", rating.category, rating.probability);
                        }
                    }
                }
            }
        }
        Err(e) => {
            println!("   ✗ Content generation blocked: {}", e);
        }
    }
    */

    println!("   Note: Safe content should pass with default settings.");

    Ok(())
}

/// Example with permissive safety settings.
async fn example_permissive_safety(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Using permissive safety settings...");

    // Create permissive safety settings (only block HIGH probability harmful content)
    let safety_settings = vec![
        SafetySetting {
            category: HarmCategory::HarassmentHate,
            threshold: HarmBlockThreshold::BlockOnlyHigh,
        },
        SafetySetting {
            category: HarmCategory::SexuallyExplicit,
            threshold: HarmBlockThreshold::BlockOnlyHigh,
        },
        SafetySetting {
            category: HarmCategory::DangerousContent,
            threshold: HarmBlockThreshold::BlockOnlyHigh,
        },
        SafetySetting {
            category: HarmCategory::HateSpeech,
            threshold: HarmBlockThreshold::BlockOnlyHigh,
        },
    ];

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Explain the historical context of a sensitive topic.".to_string(),
                    }
                ],
            }
        ],
        generation_config: None,
        safety_settings: Some(safety_settings),
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: None,
    };

    println!("   ✓ Request prepared with BLOCK_ONLY_HIGH threshold");
    println!("   This allows more content but still blocks highly harmful content\n");

    println!("   Note: Use permissive settings only when appropriate for your use case.");

    Ok(())
}

/// Example with custom safety settings per category.
async fn example_custom_safety(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Using custom safety settings per category...");

    // Different thresholds for different categories
    let safety_settings = vec![
        SafetySetting {
            category: HarmCategory::HarassmentHate,
            threshold: HarmBlockThreshold::BlockMediumAndAbove,
        },
        SafetySetting {
            category: HarmCategory::SexuallyExplicit,
            threshold: HarmBlockThreshold::BlockLowAndAbove,
        },
        SafetySetting {
            category: HarmCategory::DangerousContent,
            threshold: HarmBlockThreshold::BlockMediumAndAbove,
        },
        SafetySetting {
            category: HarmCategory::HateSpeech,
            threshold: HarmBlockThreshold::BlockLowAndAbove,
        },
    ];

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Provide educational content about safety topics.".to_string(),
                    }
                ],
            }
        ],
        generation_config: None,
        safety_settings: Some(safety_settings),
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: None,
    };

    println!("   ✓ Request prepared with custom thresholds:");
    println!("     - Harassment/Hate: BLOCK_MEDIUM_AND_ABOVE");
    println!("     - Sexually Explicit: BLOCK_LOW_AND_ABOVE");
    println!("     - Dangerous Content: BLOCK_MEDIUM_AND_ABOVE");
    println!("     - Hate Speech: BLOCK_LOW_AND_ABOVE\n");

    println!("   Note: Tailor safety settings to your specific application needs.");

    Ok(())
}

/// Example handling safety-blocked content.
async fn example_safety_blocked(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Testing safety block handling...");

    // Use very restrictive settings to demonstrate blocking
    let safety_settings = vec![
        SafetySetting {
            category: HarmCategory::HarassmentHate,
            threshold: HarmBlockThreshold::BlockLowAndAbove,
        },
        SafetySetting {
            category: HarmCategory::SexuallyExplicit,
            threshold: HarmBlockThreshold::BlockLowAndAbove,
        },
        SafetySetting {
            category: HarmCategory::DangerousContent,
            threshold: HarmBlockThreshold::BlockLowAndAbove,
        },
        SafetySetting {
            category: HarmCategory::HateSpeech,
            threshold: HarmBlockThreshold::BlockLowAndAbove,
        },
    ];

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "A safe and friendly prompt.".to_string(),
                    }
                ],
            }
        ],
        generation_config: None,
        safety_settings: Some(safety_settings),
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: None,
    };

    println!("   ✓ Request prepared with very restrictive settings (BLOCK_LOW_AND_ABOVE)\n");

    // Note: ContentService not yet implemented
    // Uncomment when available:
    /*
    match client.content().generate("gemini-1.5-pro", request).await {
        Ok(response) => {
            println!("   ✓ Content generated successfully");
        }
        Err(e) => {
            // Check if it's a safety block error
            use integrations_gemini::error::{GeminiError, ContentError};

            match &e {
                GeminiError::Content(ContentError::SafetyBlocked { reason, safety_ratings }) => {
                    println!("   ✗ Content blocked due to safety concerns");
                    println!("   Reason: {}", reason);
                    println!("\n   Safety Ratings:");
                    for rating in safety_ratings {
                        println!("     {}: {}", rating.category, rating.probability);
                    }
                }
                _ => {
                    println!("   ✗ Other error: {}", e);
                }
            }
        }
    }
    */

    println!("   Note: Safety blocks return detailed information about which");
    println!("   categories triggered the block and their probability levels.");

    println!("\n=== Safety Block Thresholds ===");
    println!("  • BLOCK_NONE: No blocking (use with caution)");
    println!("  • BLOCK_ONLY_HIGH: Block only high-probability harmful content");
    println!("  • BLOCK_MEDIUM_AND_ABOVE: Block medium and high (default)");
    println!("  • BLOCK_LOW_AND_ABOVE: Block low, medium, and high (most restrictive)");

    println!("\n=== Harm Categories ===");
    println!("  • HARM_CATEGORY_HARASSMENT: Harassment or hate speech");
    println!("  • HARM_CATEGORY_HATE_SPEECH: Hateful content");
    println!("  • HARM_CATEGORY_SEXUALLY_EXPLICIT: Sexually explicit content");
    println!("  • HARM_CATEGORY_DANGEROUS_CONTENT: Dangerous or harmful content");

    Ok(())
}
