//! PDF analysis example
//!
//! This example demonstrates how to send PDF documents to Claude for analysis.
//! Claude can extract information, summarize content, and answer questions about PDFs.
//!
//! ## Usage
//!
//! Provide a PDF file path as an argument:
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example pdf_analysis --features beta -- /path/to/document.pdf
//! ```

use integrations_anthropic::{
    config::{AnthropicConfigBuilder, BetaFeature},
    create_client,
    services::messages::{ContentBlock, CreateMessageRequest, DocumentSource, MessageParam},
};
use base64::{engine::general_purpose, Engine as _};
use secrecy::SecretString;
use std::env;
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("Anthropic PDF Analysis Example");
    println!("==============================\n");

    // Enable PDF support beta feature
    let config = AnthropicConfigBuilder::new()
        .api_key(SecretString::new(
            std::env::var("ANTHROPIC_API_KEY")
                .expect("ANTHROPIC_API_KEY environment variable not set"),
        ))
        .beta_feature(BetaFeature::PdfSupport)
        .build()?;

    let client = create_client(config)?;

    // Get PDF path from command line args
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        println!("No PDF path provided. Here's how to use this example:\n");
        println!("  cargo run --example pdf_analysis --features beta -- /path/to/document.pdf\n");
        println!("What you can do with PDF analysis:");
        println!("  - Summarize documents");
        println!("  - Extract specific information");
        println!("  - Answer questions about content");
        println!("  - Analyze tables and figures");
        println!("  - Compare sections");
        println!("\nSupported: PDFs up to 32MB and 100 pages");
        return Ok(());
    }

    let pdf_path = &args[1];

    // Validate file exists and is a PDF
    if !pdf_path.ends_with(".pdf") {
        return Err("File must have .pdf extension".into());
    }

    println!("Loading PDF from: {}\n", pdf_path);

    // Read PDF file
    let pdf_data = fs::read(pdf_path)?;
    let file_size_mb = pdf_data.len() as f64 / (1024.0 * 1024.0);

    println!("PDF size: {:.2} MB", file_size_mb);

    if file_size_mb > 32.0 {
        return Err("PDF file is too large. Maximum size is 32MB".into());
    }

    // Encode to base64
    let base64_pdf = general_purpose::STANDARD.encode(&pdf_data);

    println!("PDF loaded successfully.\n");

    // Analysis tasks to perform
    let tasks = vec![
        (
            "Summarization",
            "Provide a comprehensive summary of this document, highlighting the main points and key findings.",
        ),
        (
            "Key Information",
            "What are the most important facts, figures, or conclusions in this document?",
        ),
        (
            "Structure",
            "Describe the structure and organization of this document. What are the main sections?",
        ),
    ];

    for (i, (task_name, question)) in tasks.iter().enumerate() {
        println!("=== Task {}: {} ===", i + 1, task_name);
        println!("Question: {}\n", question);

        // Create request with PDF and question
        let request = CreateMessageRequest {
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_tokens: 2048,
            messages: vec![MessageParam::user(vec![
                ContentBlock::Document {
                    source: DocumentSource {
                        source_type: "base64".to_string(),
                        media_type: "application/pdf".to_string(),
                        data: base64_pdf.clone(),
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

        println!("Analyzing PDF...\n");

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
                    println!("Note: Input tokens include the PDF encoding\n");
                }
            }
            Err(e) => {
                eprintln!("Error: {}\n", e);
                return Err(Box::new(e));
            }
        }
    }

    println!("\n=== Tips for PDF Analysis ===");
    println!("- Maximum PDF size: 32MB");
    println!("- Maximum pages: 100");
    println!("- Claude can extract text, tables, and understand document structure");
    println!("- Works with scanned PDFs (OCR) and native PDFs");
    println!("- You can ask specific questions about sections, tables, or figures");
    println!("- Consider using prompt caching for multiple questions about the same PDF");

    println!("\n=== Advanced Usage ===");
    println!("To cache the PDF for multiple queries:");
    println!("  1. Add cache_control to the Document block");
    println!("  2. Enable prompt caching beta feature");
    println!("  3. Subsequent requests will use cached PDF, saving tokens");

    Ok(())
}
