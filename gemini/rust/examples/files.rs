//! File operations example for Gemini API.
//!
//! This example demonstrates:
//! - Uploading files to the Gemini Files API
//! - Listing uploaded files with pagination
//! - Getting file metadata by name
//! - Deleting files
//! - Waiting for files to become active (processing)
//! - Using uploaded files in content generation
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
//! cargo run --example files
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{
        UploadFileRequest, ListFilesParams, FileState,
        Content, Part, Role, GenerateContentRequest, FileData,
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

    println!("=== Gemini Files API Example ===\n");

    // Create client
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Example 1: Upload a file
    println!("=== Example 1: Upload a File ===\n");
    let file_name = example_upload_file(&client).await?;

    println!("\n");

    // Example 2: List files
    println!("=== Example 2: List Files ===\n");
    example_list_files(&client).await?;

    println!("\n");

    // Example 3: Get file by name
    println!("=== Example 3: Get File by Name ===\n");
    example_get_file(&client, &file_name).await?;

    println!("\n");

    // Example 4: Wait for file to become active
    println!("=== Example 4: Wait for File Processing ===\n");
    example_wait_for_active(&client, &file_name).await?;

    println!("\n");

    // Example 5: Use file in content generation
    println!("=== Example 5: Use File in Content Generation ===\n");
    example_use_file_in_generation(&client, &file_name).await?;

    println!("\n");

    // Example 6: Delete file
    println!("=== Example 6: Delete File ===\n");
    example_delete_file(&client, &file_name).await?;

    println!("\n=== Examples Complete ===");

    Ok(())
}

/// Example: Upload a file.
async fn example_upload_file(client: &GeminiClientImpl) -> Result<String, Box<dyn std::error::Error>> {
    println!("2. Uploading a sample file...");

    // Create sample file content (a simple text file)
    let file_content = b"This is a sample document for the Gemini Files API.\n\
                         It demonstrates how to upload files for use with multimodal models.\n\
                         Files can be images, documents, audio, or video.";

    let upload_request = UploadFileRequest {
        display_name: Some("sample-document.txt".to_string()),
        file_data: file_content.to_vec(),
        mime_type: "text/plain".to_string(),
    };

    println!("   File name: sample-document.txt");
    println!("   MIME type: text/plain");
    println!("   Size: {} bytes", file_content.len());

    // Note: FilesService not yet implemented
    // Uncomment when available:
    /*
    let file = client.files()
        .upload(upload_request)
        .await?;

    println!("\n   ✓ File uploaded successfully");
    println!("   File URI: {}", file.name);
    println!("   Display name: {}", file.display_name.unwrap_or_default());
    println!("   State: {:?}", file.state);

    if let Some(size) = file.size_bytes {
        println!("   Size: {} bytes", size);
    }

    return Ok(file.name);
    */

    println!("\n   Note: FilesService implementation is pending.");
    Ok("files/sample-file-id".to_string())
}

/// Example: List uploaded files with pagination.
async fn example_list_files(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Listing uploaded files...");

    let params = ListFilesParams {
        page_size: Some(10),
        page_token: None,
    };

    // Note: FilesService not yet implemented
    // Uncomment when available:
    /*
    let response = client.files()
        .list(Some(params))
        .await?;

    println!("\n   ✓ Files retrieved successfully");

    if let Some(files) = &response.files {
        println!("   Found {} file(s):", files.len());

        for (i, file) in files.iter().enumerate() {
            println!("\n   File {}:", i + 1);
            println!("     URI: {}", file.name);
            println!("     Display name: {}", file.display_name.as_deref().unwrap_or("(none)"));
            println!("     MIME type: {}", file.mime_type);
            println!("     State: {:?}", file.state);

            if let Some(size) = file.size_bytes {
                println!("     Size: {} bytes", size);
            }

            if let Some(create_time) = &file.create_time {
                println!("     Created: {}", create_time);
            }
        }
    } else {
        println!("   No files found");
    }

    if let Some(next_page_token) = &response.next_page_token {
        println!("\n   More files available (next page token: {}...)",
                 &next_page_token[..std::cmp::min(20, next_page_token.len())]);
    }
    */

    println!("\n   Note: Lists all uploaded files with pagination support.");

    Ok(())
}

/// Example: Get a specific file by name.
async fn example_get_file(client: &GeminiClientImpl, file_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Getting file details...");
    println!("   File name: {}", file_name);

    // Note: FilesService not yet implemented
    // Uncomment when available:
    /*
    let file = client.files()
        .get(file_name)
        .await?;

    println!("\n   ✓ File retrieved successfully");
    println!("   URI: {}", file.name);
    println!("   Display name: {}", file.display_name.unwrap_or_default());
    println!("   MIME type: {}", file.mime_type);
    println!("   State: {:?}", file.state);

    if let Some(size) = file.size_bytes {
        println!("   Size: {} bytes", size);
    }

    if let Some(create_time) = &file.create_time {
        println!("   Created: {}", create_time);
    }

    if let Some(update_time) = &file.update_time {
        println!("   Updated: {}", update_time);
    }

    if let Some(expiration_time) = &file.expiration_time {
        println!("   Expires: {}", expiration_time);
    }

    if let Some(sha256_hash) = &file.sha256_hash {
        println!("   SHA256: {}", sha256_hash);
    }
    */

    println!("\n   Note: Retrieves detailed metadata for a specific file.");

    Ok(())
}

/// Example: Wait for file to become active (processing).
async fn example_wait_for_active(client: &GeminiClientImpl, file_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Waiting for file to become active...");
    println!("   File name: {}", file_name);

    // Note: FilesService not yet implemented
    // Uncomment when available:
    /*
    use integrations_gemini::services::files::FilesServiceImpl;

    // Wait up to 2 minutes, polling every 5 seconds
    let timeout = Duration::from_secs(120);
    let poll_interval = Duration::from_secs(5);

    println!("   Timeout: {:?}", timeout);
    println!("   Poll interval: {:?}", poll_interval);
    println!("   Waiting...");

    let start = std::time::Instant::now();

    // If using FilesServiceImpl directly:
    // let file = files_service.wait_for_active(file_name, timeout, poll_interval).await?;

    // Or poll manually:
    loop {
        let file = client.files().get(file_name).await?;

        match file.state {
            Some(FileState::Active) => {
                let elapsed = start.elapsed();
                println!("\n   ✓ File is active (took {:?})", elapsed);
                println!("   File is ready to use in content generation");
                break;
            }
            Some(FileState::Failed) => {
                return Err("File processing failed".into());
            }
            Some(FileState::Processing) | None => {
                // Continue waiting
                if start.elapsed() >= timeout {
                    return Err("Timeout waiting for file to become active".into());
                }
                tokio::time::sleep(poll_interval).await;
            }
        }
    }
    */

    println!("\n   Note: Large files may take time to process.");
    println!("   Files must be in ACTIVE state before use in generation.");

    Ok(())
}

/// Example: Use uploaded file in content generation.
async fn example_use_file_in_generation(client: &GeminiClientImpl, file_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Using uploaded file in content generation...");

    let request = GenerateContentRequest {
        contents: vec![
            Content {
                role: Some(Role::User),
                parts: vec![
                    Part::Text {
                        text: "Summarize the content of this file.".to_string(),
                    },
                    Part::FileData {
                        file_data: FileData {
                            mime_type: Some("text/plain".to_string()),
                            file_uri: file_name.to_string(),
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

    println!("   ✓ Request prepared with file reference");
    println!("   File URI: {}", file_name);

    // Note: ContentService not yet implemented
    // Uncomment when available:
    /*
    let response = client.content()
        .generate("gemini-1.5-pro", request)
        .await?;

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
    */

    println!("\n   Note: Files can be referenced by URI in content generation.");
    println!("   Supported file types: images, audio, video, documents, PDFs, etc.");

    Ok(())
}

/// Example: Delete a file.
async fn example_delete_file(client: &GeminiClientImpl, file_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Deleting file...");
    println!("   File name: {}", file_name);

    // Note: FilesService not yet implemented
    // Uncomment when available:
    /*
    client.files()
        .delete(file_name)
        .await?;

    println!("\n   ✓ File deleted successfully");

    // Verify deletion
    match client.files().get(file_name).await {
        Ok(_) => {
            println!("   ⚠ Warning: File still exists after deletion");
        }
        Err(e) => {
            println!("   ✓ Confirmed: File no longer exists");
        }
    }
    */

    println!("\n   Note: Deleted files cannot be recovered.");
    println!("   Files are automatically deleted after their expiration time.");

    Ok(())
}
