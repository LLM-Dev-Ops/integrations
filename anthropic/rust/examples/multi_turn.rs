//! Multi-turn conversation example
//!
//! This example demonstrates how to maintain a conversation with Claude
//! across multiple turns, keeping track of the conversation history.
//!
//! ## Usage
//!
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example multi_turn
//! ```

use integrations_anthropic::{
    create_client_from_env,
    services::messages::{ContentBlock, CreateMessageRequest, MessageParam},
};
use std::io::{self, Write};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("Anthropic Multi-Turn Conversation Example");
    println!("==========================================\n");
    println!("This is an interactive chat with Claude.");
    println!("Type your messages and press Enter. Type 'quit' or 'exit' to end.\n");

    let client = create_client_from_env()?;

    // Conversation history
    let mut messages: Vec<MessageParam> = Vec::new();

    // System prompt to set context
    let system_prompt = "You are a helpful AI assistant. Be concise but friendly. \
                        If asked about yourself, explain that you are Claude, made by Anthropic.";

    loop {
        // Get user input
        print!("\nYou: ");
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let user_message = input.trim();

        // Check for exit commands
        if user_message.eq_ignore_ascii_case("quit") || user_message.eq_ignore_ascii_case("exit")
        {
            println!("\nGoodbye!");
            break;
        }

        // Skip empty messages
        if user_message.is_empty() {
            continue;
        }

        // Add user message to history
        messages.push(MessageParam::user_text(user_message));

        // Create request with conversation history
        let request = CreateMessageRequest {
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_tokens: 1024,
            messages: messages.clone(),
            system: Some(vec![ContentBlock::Text {
                text: system_prompt.to_string(),
                cache_control: None,
            }]),
            ..Default::default()
        };

        // Send request
        print!("\nClaude: ");
        io::stdout().flush()?;

        match client.messages().create(request).await {
            Ok(response) => {
                // Extract and display assistant's response
                let mut assistant_text = String::new();

                for block in &response.content {
                    if let ContentBlock::Text { text, .. } = block {
                        assistant_text.push_str(text);
                    }
                }

                println!("{}", assistant_text);

                // Add assistant's response to history
                messages.push(MessageParam::assistant(response.content));

                // Display token usage
                println!(
                    "\n[Tokens: {} in, {} out]",
                    response.usage.input_tokens, response.usage.output_tokens
                );
            }
            Err(e) => {
                eprintln!("\nError: {}", e);
                eprintln!("The conversation history will be preserved. You can try again.");
                // Remove the failed user message
                messages.pop();
            }
        }
    }

    // Display conversation summary
    println!("\n=== Conversation Summary ===");
    println!("Total turns: {}", messages.len() / 2);
    println!("Messages in history: {}", messages.len());

    Ok(())
}
