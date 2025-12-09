//! Computer Use Support
//!
//! This module provides utilities for working with computer use tools,
//! a beta feature that allows Claude to interact with computers through
//! screenshots, mouse/keyboard control, and shell commands.

use super::types::{
    ComputerImageSource, ComputerTool, ComputerToolResult, ComputerToolResultContent,
    ComputerToolType,
};

/// Create a standard set of computer use tools
///
/// This creates the three standard computer use tools:
/// - Computer (for mouse/keyboard control and screenshots)
/// - Text editor (for file editing)
/// - Bash (for shell commands)
///
/// # Arguments
/// * `screen_width` - The width of the screen in pixels
/// * `screen_height` - The height of the screen in pixels
///
/// # Example
/// ```
/// # #[cfg(feature = "beta")]
/// # {
/// use integrations_anthropic::services::beta::create_computer_use_tools;
///
/// let tools = create_computer_use_tools(1920, 1080);
/// assert_eq!(tools.len(), 3);
/// # }
/// ```
pub fn create_computer_use_tools(screen_width: u32, screen_height: u32) -> Vec<ComputerTool> {
    vec![
        ComputerTool::computer(screen_width, screen_height),
        ComputerTool::text_editor(),
        ComputerTool::bash(),
    ]
}

/// Builder for constructing computer tool results
pub struct ComputerToolResultBuilder {
    tool_use_id: String,
    content: Vec<ComputerToolResultContent>,
    is_error: bool,
}

impl ComputerToolResultBuilder {
    /// Create a new builder for a tool result
    ///
    /// # Arguments
    /// * `tool_use_id` - The ID of the tool use being responded to
    pub fn new(tool_use_id: impl Into<String>) -> Self {
        Self {
            tool_use_id: tool_use_id.into(),
            content: Vec::new(),
            is_error: false,
        }
    }

    /// Add text content to the result
    pub fn with_text(mut self, text: impl Into<String>) -> Self {
        self.content.push(ComputerToolResultContent::Text {
            text: text.into(),
        });
        self
    }

    /// Add a screenshot to the result
    ///
    /// # Arguments
    /// * `base64_png` - Base64-encoded PNG image data
    pub fn with_screenshot(mut self, base64_png: impl Into<String>) -> Self {
        self.content.push(ComputerToolResultContent::Image {
            source: ComputerImageSource::base64("image/png", base64_png),
        });
        self
    }

    /// Add an image with custom media type
    ///
    /// # Arguments
    /// * `media_type` - The media type (e.g., "image/png", "image/jpeg")
    /// * `base64_data` - Base64-encoded image data
    pub fn with_image(mut self, media_type: impl Into<String>, base64_data: impl Into<String>) -> Self {
        self.content.push(ComputerToolResultContent::Image {
            source: ComputerImageSource::base64(media_type, base64_data),
        });
        self
    }

    /// Mark this result as an error
    pub fn with_error(mut self) -> Self {
        self.is_error = true;
        self
    }

    /// Build the final tool result
    pub fn build(self) -> ComputerToolResult {
        ComputerToolResult {
            type_: "tool_result".to_string(),
            tool_use_id: self.tool_use_id,
            content: self.content,
            is_error: if self.is_error { Some(true) } else { None },
        }
    }
}

/// Create a simple text tool result
pub fn create_text_result(tool_use_id: impl Into<String>, text: impl Into<String>) -> ComputerToolResult {
    ComputerToolResultBuilder::new(tool_use_id)
        .with_text(text)
        .build()
}

/// Create a tool result with a screenshot
pub fn create_screenshot_result(
    tool_use_id: impl Into<String>,
    base64_png: impl Into<String>,
) -> ComputerToolResult {
    ComputerToolResultBuilder::new(tool_use_id)
        .with_screenshot(base64_png)
        .build()
}

/// Create an error tool result
pub fn create_error_result(tool_use_id: impl Into<String>, error_message: impl Into<String>) -> ComputerToolResult {
    ComputerToolResultBuilder::new(tool_use_id)
        .with_text(error_message)
        .with_error()
        .build()
}

/// Get the beta header value for computer use
pub fn get_computer_use_beta_header() -> &'static str {
    "computer-use-2024-10-22"
}

/// Validate screen dimensions
///
/// Ensures screen dimensions are within reasonable bounds
pub fn validate_screen_dimensions(width: u32, height: u32) -> bool {
    width > 0 && height > 0 && width <= 10000 && height <= 10000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_computer_use_tools() {
        let tools = create_computer_use_tools(1920, 1080);

        assert_eq!(tools.len(), 3);

        // Check computer tool
        assert_eq!(tools[0].name, "computer");
        assert_eq!(tools[0].display_width_px, Some(1920));
        assert_eq!(tools[0].display_height_px, Some(1080));
        assert!(matches!(tools[0].type_, ComputerToolType::Computer20241022));

        // Check text editor tool
        assert_eq!(tools[1].name, "str_replace_editor");
        assert!(matches!(
            tools[1].type_,
            ComputerToolType::TextEditor20241022
        ));

        // Check bash tool
        assert_eq!(tools[2].name, "bash");
        assert!(matches!(tools[2].type_, ComputerToolType::Bash20241022));
    }

    #[test]
    fn test_computer_tool_builder() {
        let computer = ComputerTool::computer(1024, 768);
        assert_eq!(computer.name, "computer");
        assert_eq!(computer.display_width_px, Some(1024));
        assert_eq!(computer.display_height_px, Some(768));

        let editor = ComputerTool::text_editor();
        assert_eq!(editor.name, "str_replace_editor");
        assert_eq!(editor.display_width_px, None);

        let bash = ComputerTool::bash();
        assert_eq!(bash.name, "bash");
        assert_eq!(bash.display_width_px, None);
    }

    #[test]
    fn test_computer_tool_result_builder() {
        let result = ComputerToolResultBuilder::new("tool_123")
            .with_text("Command executed successfully")
            .build();

        assert_eq!(result.tool_use_id, "tool_123");
        assert_eq!(result.content.len(), 1);
        assert_eq!(result.is_error, None);

        match &result.content[0] {
            ComputerToolResultContent::Text { text } => {
                assert_eq!(text, "Command executed successfully");
            }
            _ => panic!("Expected text content"),
        }
    }

    #[test]
    fn test_computer_tool_result_with_screenshot() {
        let result = ComputerToolResultBuilder::new("tool_456")
            .with_text("Screenshot taken")
            .with_screenshot("iVBORw0KGgoAAAANS...")
            .build();

        assert_eq!(result.content.len(), 2);

        match &result.content[1] {
            ComputerToolResultContent::Image { source } => {
                assert_eq!(source.type_, "base64");
                assert_eq!(source.media_type, "image/png");
                assert_eq!(source.data, "iVBORw0KGgoAAAANS...");
            }
            _ => panic!("Expected image content"),
        }
    }

    #[test]
    fn test_computer_tool_result_with_error() {
        let result = ComputerToolResultBuilder::new("tool_789")
            .with_text("Command failed")
            .with_error()
            .build();

        assert_eq!(result.is_error, Some(true));
    }

    #[test]
    fn test_create_text_result() {
        let result = create_text_result("tool_1", "Success");

        assert_eq!(result.tool_use_id, "tool_1");
        assert_eq!(result.content.len(), 1);
        assert_eq!(result.is_error, None);
    }

    #[test]
    fn test_create_screenshot_result() {
        let result = create_screenshot_result("tool_2", "base64data");

        assert_eq!(result.tool_use_id, "tool_2");
        assert_eq!(result.content.len(), 1);

        match &result.content[0] {
            ComputerToolResultContent::Image { source } => {
                assert_eq!(source.data, "base64data");
            }
            _ => panic!("Expected image content"),
        }
    }

    #[test]
    fn test_create_error_result() {
        let result = create_error_result("tool_3", "Something went wrong");

        assert_eq!(result.tool_use_id, "tool_3");
        assert_eq!(result.is_error, Some(true));

        match &result.content[0] {
            ComputerToolResultContent::Text { text } => {
                assert_eq!(text, "Something went wrong");
            }
            _ => panic!("Expected text content"),
        }
    }

    #[test]
    fn test_with_image_custom_type() {
        let result = ComputerToolResultBuilder::new("tool_4")
            .with_image("image/jpeg", "jpeg_data")
            .build();

        match &result.content[0] {
            ComputerToolResultContent::Image { source } => {
                assert_eq!(source.media_type, "image/jpeg");
                assert_eq!(source.data, "jpeg_data");
            }
            _ => panic!("Expected image content"),
        }
    }

    #[test]
    fn test_beta_header() {
        assert_eq!(get_computer_use_beta_header(), "computer-use-2024-10-22");
    }

    #[test]
    fn test_validate_screen_dimensions() {
        assert!(validate_screen_dimensions(1920, 1080));
        assert!(validate_screen_dimensions(1, 1));
        assert!(validate_screen_dimensions(10000, 10000));

        assert!(!validate_screen_dimensions(0, 1080));
        assert!(!validate_screen_dimensions(1920, 0));
        assert!(!validate_screen_dimensions(10001, 1080));
        assert!(!validate_screen_dimensions(1920, 10001));
    }

    #[test]
    fn test_computer_tool_serialization() {
        let tool = ComputerTool::computer(1920, 1080);
        let json = serde_json::to_string(&tool).unwrap();

        assert!(json.contains("\"type\":\"computer_20241022\""));
        assert!(json.contains("\"name\":\"computer\""));
        assert!(json.contains("\"display_width_px\":1920"));
        assert!(json.contains("\"display_height_px\":1080"));

        let deserialized: ComputerTool = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "computer");
    }

    #[test]
    fn test_computer_tool_result_serialization() {
        let result = ComputerToolResultBuilder::new("tool_123")
            .with_text("Success")
            .build();

        let json = serde_json::to_string(&result).unwrap();

        assert!(json.contains("\"type\":\"tool_result\""));
        assert!(json.contains("\"tool_use_id\":\"tool_123\""));

        let deserialized: ComputerToolResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.tool_use_id, "tool_123");
    }
}
