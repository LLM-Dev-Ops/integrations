//! Multimodal content generation example for Gemini API.
//!
//! This example demonstrates:
//! - Working with multiple content types (text + images)
//! - Using inline data blobs with base64 encoding
//! - Using file URIs from the Files API
//! - Combining different modalities in a single request
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
//! cargo run --example multimodal
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{Content, Part, Role, GenerateContentRequest, Blob, FileData},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Multimodal Content Generation Example ===\n");

    // Create client
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Example 1: Text + Inline Image (base64 encoded)
    println!("=== Example 1: Text + Inline Image Data ===\n");
    example_inline_image(&client).await?;

    println!("\n");

    // Example 2: Text + File URI
    println!("=== Example 2: Text + File URI ===\n");
    example_file_uri(&client).await?;

    println!("\n");

    // Example 3: Multiple images with text
    println!("=== Example 3: Multiple Images with Text ===\n");
    example_multiple_images(&client).await?;

    println!("\n=== Examples Complete ===");

    Ok(())
}

/// Example using inline image data (base64 encoded).
async fn example_inline_image(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Preparing request with inline image data...");

    // Create a small sample image data (1x1 red pixel PNG)
    // In a real application, you would read and encode an actual image file
    let sample_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "What do you see in this image? Describe it in detail.".to_string(),
                    },
                    Part::InlineData {
                        inline_data: Blob {
                            mime_type: "image/png".to_string(),
                            data: sample_image_base64.to_string(),
                        },
                    },
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

    println!("   ✓ Request prepared with inline image data");
    println!("   Image MIME type: image/png");
    println!("   Image size: {} bytes (base64)", sample_image_base64.len());

    // Note: ContentService is not yet implemented
    // Uncomment when available:
    /*
    let response = client.content()
        .generate("gemini-1.5-pro", request)
        .await?;

    if let Some(candidates) = &response.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(content) = &candidate.content {
                for part in &content.parts {
                    if let Part::Text { text } = part {
                        println!("\n   Response: {}", text);
                    }
                }
            }
        }
    }
    */

    println!("\n   Note: This would analyze the inline image and provide a description.");

    Ok(())
}

/// Example using file URI from the Files API.
async fn example_file_uri(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Preparing request with file URI...");

    // In a real application, you would first upload a file using the Files API
    // and get back a URI like "files/abc123def456"
    let file_uri = "files/sample-image-id";

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Analyze this image and tell me what you see.".to_string(),
                    },
                    Part::FileData {
                        file_data: FileData {
                            mime_type: Some("image/jpeg".to_string()),
                            file_uri: file_uri.to_string(),
                        },
                    },
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

    println!("   ✓ Request prepared with file URI");
    println!("   File URI: {}", file_uri);

    println!("\n   Note: This would reference a previously uploaded file.");
    println!("   See the files.rs example for how to upload files.");

    Ok(())
}

/// Example with multiple images and text.
async fn example_multiple_images(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Preparing request with multiple images...");

    // Sample base64 images (1x1 pixels for demonstration)
    let red_pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
    let blue_pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Compare these two images. What are the differences?".to_string(),
                    },
                    Part::InlineData {
                        inline_data: Blob {
                            mime_type: "image/png".to_string(),
                            data: red_pixel.to_string(),
                        },
                    },
                    Part::InlineData {
                        inline_data: Blob {
                            mime_type: "image/png".to_string(),
                            data: blue_pixel.to_string(),
                        },
                    },
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

    println!("   ✓ Request prepared with 2 images");
    println!("   Both images are PNG format");

    println!("\n   Note: Gemini can analyze and compare multiple images in a single request.");
    println!("   Supported formats: PNG, JPEG, WEBP, HEIC, HEIF");

    Ok(())
}

/// Helper function to read and encode an image file (for reference).
#[allow(dead_code)]
async fn load_and_encode_image(path: &str) -> Result<String, Box<dyn std::error::Error>> {
    use tokio::fs;

    println!("Reading image from: {}", path);
    let image_data = fs::read(path).await?;

    // Encode to base64
    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &image_data
    );

    println!("Image encoded: {} bytes -> {} characters", image_data.len(), encoded.len());

    Ok(encoded)
}
