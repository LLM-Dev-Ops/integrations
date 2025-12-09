//! Tool use (function calling) example
//!
//! This example demonstrates how to define tools (functions) that Claude can call,
//! handle tool use requests, execute the tools, and return results back to Claude.
//!
//! ## Usage
//!
//! ```bash
//! export ANTHROPIC_API_KEY=sk-ant-api03-...
//! cargo run --example tool_use
//! ```

use integrations_anthropic::{
    create_client_from_env,
    services::messages::{ContentBlock, CreateMessageRequest, MessageParam, Tool, ToolInputSchema},
};
use serde_json::json;

/// Simulated weather API function
fn get_weather(location: &str, unit: &str) -> serde_json::Value {
    // In a real application, this would call an actual weather API
    let temperature = if unit == "celsius" { 22 } else { 72 };

    json!({
        "location": location,
        "temperature": temperature,
        "unit": unit,
        "conditions": "Partly cloudy",
        "humidity": 65,
        "wind_speed": 10
    })
}

/// Simulated calculator function
fn calculate(operation: &str, a: f64, b: f64) -> serde_json::Value {
    let result = match operation {
        "add" => a + b,
        "subtract" => a - b,
        "multiply" => a * b,
        "divide" => {
            if b != 0.0 {
                a / b
            } else {
                return json!({ "error": "Division by zero" });
            }
        }
        _ => return json!({ "error": "Unknown operation" }),
    };

    json!({
        "operation": operation,
        "a": a,
        "b": b,
        "result": result
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    println!("Anthropic Tool Use Example");
    println!("==========================\n");

    let client = create_client_from_env()?;

    // Define available tools
    let weather_tool = Tool {
        name: "get_weather".to_string(),
        description: "Get the current weather for a location".to_string(),
        input_schema: ToolInputSchema {
            schema_type: "object".to_string(),
            properties: Some(json!({
                "location": {
                    "type": "string",
                    "description": "City name, e.g., 'San Francisco, CA' or 'London, UK'"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "Temperature unit",
                    "default": "celsius"
                }
            })),
            required: Some(vec!["location".to_string()]),
        },
        cache_control: None,
    };

    let calculator_tool = Tool {
        name: "calculate".to_string(),
        description: "Perform basic arithmetic operations".to_string(),
        input_schema: ToolInputSchema {
            schema_type: "object".to_string(),
            properties: Some(json!({
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                    "description": "The arithmetic operation to perform"
                },
                "a": {
                    "type": "number",
                    "description": "First number"
                },
                "b": {
                    "type": "number",
                    "description": "Second number"
                }
            })),
            required: Some(vec!["operation".to_string(), "a".to_string(), "b".to_string()]),
        },
        cache_control: None,
    };

    let tools = vec![weather_tool, calculator_tool];

    // Initial user message
    let user_message =
        "What's the weather in San Francisco? Also, what's 42 multiplied by 17?";

    println!("User: {}\n", user_message);

    // First request with tools
    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user_text(user_message)],
        tools: Some(tools.clone()),
        ..Default::default()
    };

    println!("Sending request to Claude...\n");

    let response = client.messages().create(request).await?;

    // Collect tool use blocks and prepare conversation history
    let mut tool_results = Vec::new();
    let mut conversation = vec![MessageParam::user_text(user_message)];

    println!("Claude's response:");
    for block in &response.content {
        match block {
            ContentBlock::Text { text, .. } => {
                println!("Text: {}", text);
            }
            ContentBlock::ToolUse { id, name, input } => {
                println!("\nTool Use: {}", name);
                println!("Input: {}", serde_json::to_string_pretty(input)?);

                // Execute the appropriate tool
                let result = match name.as_str() {
                    "get_weather" => {
                        let location = input["location"].as_str().unwrap_or("Unknown");
                        let unit = input["unit"].as_str().unwrap_or("celsius");
                        println!("\nExecuting get_weather({}, {})...", location, unit);
                        get_weather(location, unit)
                    }
                    "calculate" => {
                        let operation = input["operation"].as_str().unwrap_or("add");
                        let a = input["a"].as_f64().unwrap_or(0.0);
                        let b = input["b"].as_f64().unwrap_or(0.0);
                        println!("\nExecuting calculate({}, {}, {})...", operation, a, b);
                        calculate(operation, a, b)
                    }
                    _ => json!({ "error": "Unknown tool" }),
                };

                println!("Result: {}\n", serde_json::to_string_pretty(&result)?);

                // Store tool result for next request
                tool_results.push(ContentBlock::ToolResult {
                    tool_use_id: id.clone(),
                    content: serde_json::to_string(&result)?,
                    is_error: None,
                    cache_control: None,
                });
            }
            _ => {}
        }
    }

    // If tools were used, send results back to Claude
    if !tool_results.is_empty() {
        conversation.push(MessageParam::assistant(response.content));
        conversation.push(MessageParam::user(tool_results));

        println!("Sending tool results back to Claude...\n");

        // Second request with tool results
        let follow_up_request = CreateMessageRequest {
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_tokens: 1024,
            messages: conversation,
            tools: None, // Don't need tools in the follow-up
            ..Default::default()
        };

        let final_response = client.messages().create(follow_up_request).await?;

        println!("Claude's final response:");
        println!("---");
        for block in &final_response.content {
            if let ContentBlock::Text { text, .. } = block {
                println!("{}", text);
            }
        }
        println!("---\n");

        println!("Token Usage:");
        println!(
            "  Total input tokens:  {}",
            response.usage.input_tokens + final_response.usage.input_tokens
        );
        println!(
            "  Total output tokens: {}",
            response.usage.output_tokens + final_response.usage.output_tokens
        );
    }

    Ok(())
}
