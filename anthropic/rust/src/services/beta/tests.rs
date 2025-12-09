//! Comprehensive tests for beta features
//!
//! This module contains integration tests that verify the interaction
//! between different beta features.

#[cfg(test)]
mod integration_tests {
    use crate::services::beta::*;
    use crate::services::messages::{
        ContentBlock, CreateMessageRequest, MessageParam, Tool,
    };

    #[test]
    fn test_extended_thinking_with_pdf() {
        // Create a PDF content block
        let pdf_bytes = b"%PDF-1.4\nTest PDF content";
        let pdf_content = create_pdf_content(pdf_bytes);

        // Create a request with extended thinking
        let messages = vec![MessageParam::user_blocks(vec![
            ContentBlock::Text {
                text: "Please analyze this PDF".to_string(),
                cache_control: None,
            },
            pdf_content,
        ])];

        let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 2048, messages)
            .with_extended_thinking(Some(10000));

        assert!(request.thinking.is_some());
        assert_eq!(request.messages.len(), 1);
    }

    #[test]
    fn test_prompt_caching_with_tools() {
        // Create cacheable tools
        let tools = vec![
            Tool::new(
                "get_weather",
                "Get weather information",
                serde_json::json!({
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"}
                    }
                }),
            ),
            Tool::new(
                "get_time",
                "Get current time",
                serde_json::json!({"type": "object"}),
            ),
        ];

        let cached_tools = cache_tools(tools);

        for tool in &cached_tools {
            assert!(tool.cache_control.is_some());
        }
    }

    #[test]
    fn test_computer_use_with_caching() {
        // Create computer use tools
        let tools = create_computer_use_tools(1920, 1080);

        // Create a cacheable system prompt
        let system = CacheableSystemPromptBuilder::new(
            "You are an AI assistant that can interact with computers."
        )
        .with_cache()
        .build_as_system_prompt();

        let messages = vec![MessageParam::user("Take a screenshot")];

        let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages)
            .with_system_blocks(match system {
                crate::services::messages::SystemPrompt::Blocks(blocks) => blocks,
                crate::services::messages::SystemPrompt::Text(text) => vec![ContentBlock::Text {
                    text,
                    cache_control: None,
                }],
            });

        assert_eq!(request.messages.len(), 1);
    }

    #[test]
    fn test_token_counting_request_with_cached_content() {
        // Create messages with cached content
        let cached_text = ContentBlock::Text {
            text: "This is a long system message that should be cached".to_string(),
            cache_control: Some(crate::services::messages::CacheControl::ephemeral()),
        };

        let messages = vec![MessageParam::user_blocks(vec![cached_text])];

        let request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages);

        assert_eq!(request.model, "claude-3-5-sonnet-20241022");
        assert_eq!(request.messages.len(), 1);
    }

    #[test]
    fn test_pdf_validation_and_caching() {
        let valid_pdf = b"%PDF-1.4\nContent";
        let invalid_pdf = b"Not a PDF";

        assert!(validate_pdf_bytes(valid_pdf));
        assert!(!validate_pdf_bytes(invalid_pdf));

        // Create cacheable PDF
        let pdf_content = create_cacheable_pdf_content(valid_pdf);

        match pdf_content {
            ContentBlock::Document { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Document block"),
        }
    }

    #[test]
    fn test_multiple_beta_features_combined() {
        // Test combining extended thinking, PDF, and caching

        // 1. Create a cacheable PDF
        let pdf_bytes = b"%PDF-1.4\nTest document";
        let pdf_content = create_cacheable_pdf_content(pdf_bytes);

        // 2. Create cacheable system prompt
        let system = cacheable_system_prompt(
            "You are an expert document analyzer.",
            true,
        );

        // 3. Create messages with cached content
        let mut blocks = vec![
            ContentBlock::Text {
                text: "First message".to_string(),
                cache_control: None,
            },
            ContentBlock::Text {
                text: "Second message".to_string(),
                cache_control: None,
            },
        ];
        blocks = cache_last_n_blocks(blocks, 1);

        let messages = vec![
            MessageParam::user_blocks(blocks),
            MessageParam::user_blocks(vec![
                ContentBlock::Text {
                    text: "Analyze this document:".to_string(),
                    cache_control: None,
                },
                pdf_content,
            ]),
        ];

        // 4. Create request with extended thinking
        let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 4096, messages)
            .with_system_blocks(match system {
                crate::services::messages::SystemPrompt::Blocks(b) => b,
                crate::services::messages::SystemPrompt::Text(t) => vec![ContentBlock::Text {
                    text: t,
                    cache_control: None,
                }],
            })
            .with_thinking_budget(5000);

        assert!(request.thinking.is_some());
        assert!(request.system.is_some());
        assert_eq!(request.messages.len(), 2);
    }

    #[test]
    fn test_computer_use_result_builder_complex() {
        // Test complex computer tool result with multiple content types
        let result = ComputerToolResultBuilder::new("tool_123")
            .with_text("Command output:\n$ ls -la")
            .with_screenshot("base64_screenshot_data")
            .with_text("Total items: 10")
            .build();

        assert_eq!(result.content.len(), 3);
        assert_eq!(result.tool_use_id, "tool_123");

        // Verify content types
        assert!(matches!(
            result.content[0],
            ComputerToolResultContent::Text { .. }
        ));
        assert!(matches!(
            result.content[1],
            ComputerToolResultContent::Image { .. }
        ));
        assert!(matches!(
            result.content[2],
            ComputerToolResultContent::Text { .. }
        ));
    }

    #[test]
    fn test_thinking_extraction_from_response() {
        let content = vec![
            ContentBlock::Thinking {
                thinking: "First, I need to understand the problem...".to_string(),
            },
            ContentBlock::Text {
                text: "The answer is 42.".to_string(),
                cache_control: None,
            },
            ContentBlock::Thinking {
                thinking: "Let me verify this calculation...".to_string(),
            },
            ContentBlock::Text {
                text: "Yes, that's correct.".to_string(),
                cache_control: None,
            },
        ];

        let thinking = extract_thinking_blocks(&content);
        assert_eq!(thinking.len(), 2);
        assert_eq!(thinking[0], "First, I need to understand the problem...");
        assert_eq!(thinking[1], "Let me verify this calculation...");

        let text = extract_text_without_thinking(&content);
        assert_eq!(text.len(), 2);
        assert_eq!(text[0], "The answer is 42.");
        assert_eq!(text[1], "Yes, that's correct.");
    }

    #[test]
    fn test_beta_headers() {
        assert_eq!(get_extended_thinking_beta_header(), "extended-thinking-2024-12-01");
        assert_eq!(get_pdf_support_beta_header(), "pdfs-2024-09-25");
        assert_eq!(get_prompt_caching_beta_header(), "prompt-caching-2024-07-31");
        assert_eq!(get_token_counting_beta_header(), "token-counting-2024-11-01");
        assert_eq!(get_computer_use_beta_header(), "computer-use-2024-10-22");
    }

    #[test]
    fn test_screen_dimension_validation() {
        // Valid dimensions
        assert!(validate_screen_dimensions(1920, 1080));
        assert!(validate_screen_dimensions(1024, 768));
        assert!(validate_screen_dimensions(3840, 2160)); // 4K

        // Invalid dimensions
        assert!(!validate_screen_dimensions(0, 1080));
        assert!(!validate_screen_dimensions(1920, 0));
        assert!(!validate_screen_dimensions(20000, 1080)); // Too large
    }

    #[test]
    fn test_cacheable_content_trait() {
        // Test Text
        let text = ContentBlock::Text {
            text: "Test".to_string(),
            cache_control: None,
        };
        let cached_text = text.with_cache_control();
        match cached_text {
            ContentBlock::Text { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Text block"),
        }

        // Test Image
        let image = ContentBlock::Image {
            source: crate::services::messages::ImageSource::base64("image/png", "data"),
            cache_control: None,
        };
        let cached_image = image.with_cache_control();
        match cached_image {
            ContentBlock::Image { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Image block"),
        }

        // Test Document
        let doc = ContentBlock::Document {
            source: crate::services::messages::DocumentSource::base64("application/pdf", "data"),
            cache_control: None,
        };
        let cached_doc = doc.with_cache_control();
        match cached_doc {
            ContentBlock::Document { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Document block"),
        }
    }

    #[test]
    fn test_pdf_extraction() {
        let pdf1 = create_pdf_content(b"%PDF-1.4");
        let pdf2 = create_pdf_content(b"%PDF-1.7");
        let text = ContentBlock::Text {
            text: "Not a PDF".to_string(),
            cache_control: None,
        };
        let image = ContentBlock::Image {
            source: crate::services::messages::ImageSource::base64("image/png", "data"),
            cache_control: None,
        };

        let content = vec![text, pdf1, image, pdf2];
        let pdfs = extract_pdf_blocks(&content);

        assert_eq!(pdfs.len(), 2);
    }

    #[test]
    fn test_system_prompt_with_cache_builder() {
        // Without cache
        let prompt1 = SystemPromptWithCache::new("Test");
        assert!(prompt1.cache_control.is_none());

        // With cache
        let prompt2 = SystemPromptWithCache::new("Test").with_cache();
        assert!(prompt2.cache_control.is_some());

        // Using builder
        let prompt3 = CacheableSystemPromptBuilder::new("Test")
            .with_cache()
            .build();
        assert!(prompt3.cache_control.is_some());
    }

    #[test]
    fn test_computer_image_source() {
        let source = ComputerImageSource::base64("image/png", "base64data");

        assert_eq!(source.type_, "base64");
        assert_eq!(source.media_type, "image/png");
        assert_eq!(source.data, "base64data");
    }

    #[test]
    fn test_error_result_creation() {
        let error = create_error_result("tool_1", "Command failed: file not found");

        assert_eq!(error.tool_use_id, "tool_1");
        assert_eq!(error.is_error, Some(true));
        assert_eq!(error.content.len(), 1);
    }

    #[test]
    fn test_cache_last_n_with_edge_cases() {
        // Empty list
        let empty: Vec<ContentBlock> = vec![];
        let result = cache_last_n_blocks(empty, 5);
        assert_eq!(result.len(), 0);

        // n = 0
        let blocks = vec![
            ContentBlock::Text {
                text: "Test".to_string(),
                cache_control: None,
            },
        ];
        let result = cache_last_n_blocks(blocks, 0);
        match &result[0] {
            ContentBlock::Text { cache_control, .. } => {
                assert!(cache_control.is_none());
            }
            _ => panic!("Expected Text block"),
        }

        // n > length
        let blocks = vec![
            ContentBlock::Text {
                text: "Test".to_string(),
                cache_control: None,
            },
        ];
        let result = cache_last_n_blocks(blocks, 10);
        match &result[0] {
            ContentBlock::Text { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Text block"),
        }
    }
}
