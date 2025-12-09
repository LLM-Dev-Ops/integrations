//! Vision (image analysis) example
//!
//! This example demonstrates how to send images to Claude for analysis.
//! Claude can describe images, answer questions about them, and extract information.
//!
//! ## Usage
//!
//! Provide an image file path as an argument:
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example vision -- /path/to/image.jpg
//! ```
//!
//! Or use a sample image URL (requires internet connection):
//! ```bash
//! cargo run --example vision
//! ```

use integrations_anthropic::{
    create_client_from_env,
    services::messages::{ContentBlock, CreateMessageRequest, ImageSource, MessageParam},
};
use base64::{engine::general_purpose, Engine as _};
use std::env;
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("Anthropic Vision Example");
    println!("========================\n");

    let client = create_client_from_env()?;

    // Get image path from command line args or use a demo approach
    let args: Vec<String> = env::args().collect();

    let (base64_image, media_type) = if args.len() > 1 {
        let image_path = &args[1];
        println!("Loading image from: {}\n", image_path);

        // Read image file
        let image_data = fs::read(image_path)?;

        // Determine media type from file extension
        let media_type = if image_path.ends_with(".png") {
            "image/png"
        } else if image_path.ends_with(".jpg") || image_path.ends_with(".jpeg") {
            "image/jpeg"
        } else if image_path.ends_with(".gif") {
            "image/gif"
        } else if image_path.ends_with(".webp") {
            "image/webp"
        } else {
            return Err("Unsupported image format. Use .jpg, .png, .gif, or .webp".into());
        };

        // Encode to base64
        let base64_image = general_purpose::STANDARD.encode(&image_data);

        (base64_image, media_type.to_string())
    } else {
        println!("No image path provided. Here's how to use this example:\n");
        println!("  cargo run --example vision -- /path/to/your/image.jpg\n");
        println!("Supported formats: .jpg, .jpeg, .png, .gif, .webp\n");
        println!("Example questions you can ask about images:");
        println!("  - What's in this image?");
        println!("  - Describe this image in detail");
        println!("  - What colors are prominent in this image?");
        println!("  - Is there any text in this image? If so, what does it say?");
        println!("  - What's the mood or atmosphere of this image?");
        return Ok(());
    };

    // Questions to ask about the image
    let questions = vec![
        "What's in this image? Describe it in detail.",
        "What are the main colors in this image?",
        "Is there any text visible in the image? If so, what does it say?",
    ];

    for (i, question) in questions.iter().enumerate() {
        println!("Question {}: {}\n", i + 1, question);

        // Create request with image and question
        let request = CreateMessageRequest {
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_tokens: 1024,
            messages: vec![MessageParam::user(vec![
                ContentBlock::Image {
                    source: ImageSource {
                        source_type: "base64".to_string(),
                        media_type: media_type.clone(),
                        data: base64_image.clone(),
                    },
                    cache_control: None,
                },
                ContentBlock::Text {
                    text: question.to_string(),
                    cache_control: None,
                },
            ])],
            ..Default::default()
        };

        println!("Analyzing image...\n");

        match client.messages().create(request).await {
            Ok(response) => {
                println!("Claude's response:");
                println!("---");
                for block in &response.content {
                    if let ContentBlock::Text { text, .. } = block {
                        println!("{}", text);
                    }
                }
                println!("---\n");

                if i == 0 {
                    // Show token usage for first request
                    println!("Token usage:");
                    println!("  Input tokens:  {}", response.usage.input_tokens);
                    println!("  Output tokens: {}", response.usage.output_tokens);
                    println!(
                        "Note: Input tokens include the image encoding (images typically use ~700-1500 tokens)\n"
                    );
                }
            }
            Err(e) => {
                eprintln!("Error: {}\n", e);
                return Err(Box::new(e));
            }
        }
    }

    println!("\n=== Tips for Vision ===");
    println!("- Claude can analyze images in various formats (JPG, PNG, GIF, WebP)");
    println!("- Supported image sizes: up to 5MB for images up to 1568px on longest side");
    println!("- Claude can identify objects, read text (OCR), describe scenes, and answer questions");
    println!("- For best results, use clear, high-quality images");
    println!("- You can combine multiple images in a single request");

    Ok(())
}
