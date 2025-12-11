//! Chunked JSON streaming support for Gemini API.
//!
//! Provides a parser for chunked JSON responses from the Gemini API.
//! The Gemini streaming format returns an array of JSON objects, one per line:
//! ```json
//! [{"candidates":[...],"usageMetadata":...},
//! {"candidates":[...],"usageMetadata":...}]
//! ```

use crate::error::{GeminiError, ResponseError};
use crate::types::GenerateContentResponse;
use bytes::Bytes;
use futures::stream::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};

/// Parser states for tracking JSON structure during chunked parsing.
#[derive(Debug, Clone, PartialEq)]
enum ParserState {
    /// Expecting start of array or object
    ExpectingStart,
    /// Inside array, expecting object or end
    InArray,
    /// Inside object, tracking depth
    InObject { depth: usize },
    /// Stream completed
    Completed,
}

/// Parser for Gemini's chunked JSON streaming format.
///
/// Gemini returns streaming responses as an array of JSON objects:
/// - First chunk: `[{...},`
/// - Middle chunks: `{...},`
/// - Last chunk: `{...}]`
///
/// This parser handles:
/// - Complete JSON objects in a single chunk
/// - JSON objects split across multiple chunks
/// - Array opening/closing brackets
/// - Comma separators between objects
/// - Escaped characters in strings
/// - Nested objects and arrays
/// - Empty streams
/// - Stream interruptions
pub struct GeminiChunkParser {
    /// The underlying byte stream from the HTTP response
    inner: Pin<Box<dyn Stream<Item = Result<Bytes, GeminiError>> + Send>>,
    /// Buffer for incomplete JSON data
    buffer: String,
    /// Parser state for tracking JSON structure
    state: ParserState,
    /// Whether we've finished parsing the stream
    finished: bool,
    /// Any error encountered during parsing
    error: Option<GeminiError>,
}

impl GeminiChunkParser {
    /// Create a new chunk parser from a byte stream.
    pub fn new(inner: Pin<Box<dyn Stream<Item = Result<Bytes, GeminiError>> + Send>>) -> Self {
        Self {
            inner,
            buffer: String::new(),
            state: ParserState::ExpectingStart,
            finished: false,
            error: None,
        }
    }

    /// Feed data to the parser and extract complete JSON objects.
    ///
    /// This method is used internally by the Stream implementation but can also
    /// be used directly for testing or custom streaming scenarios.
    ///
    /// # Arguments
    ///
    /// * `data` - The data chunk to feed to the parser
    ///
    /// # Returns
    ///
    /// A vector of parsing results, which may be empty if no complete objects are available.
    pub fn feed(&mut self, data: &str) -> Vec<Result<GenerateContentResponse, GeminiError>> {
        self.buffer.push_str(data);
        let mut results = Vec::new();

        loop {
            match self.try_extract_object() {
                Some(Ok(obj)) => results.push(Ok(obj)),
                Some(Err(e)) => {
                    results.push(Err(e.clone()));
                    self.error = Some(e);
                    break;
                }
                None => break,
            }
        }

        results
    }

    /// Try to extract a complete JSON object from the buffer.
    ///
    /// Returns None if there's no complete object yet.
    fn try_extract_object(&mut self) -> Option<Result<GenerateContentResponse, GeminiError>> {
        // Skip whitespace and delimiters
        self.skip_whitespace_and_delimiters();

        if self.buffer.is_empty() {
            return None;
        }

        // Handle array brackets
        if self.buffer.starts_with('[') {
            self.buffer.remove(0);
            self.state = ParserState::InArray;
            return self.try_extract_object();
        }

        if self.buffer.starts_with(']') {
            self.buffer.remove(0);
            self.state = ParserState::Completed;
            return None;
        }

        // Try to extract JSON object
        if let Some((json_str, remaining)) = extract_json_object(&self.buffer) {
            self.buffer = remaining.to_string();

            match serde_json::from_str::<GenerateContentResponse>(json_str) {
                Ok(response) => Some(Ok(response)),
                Err(e) => Some(Err(GeminiError::Response(
                    ResponseError::Deserialization {
                        message: format!("Failed to parse chunk: {}", e),
                        body: json_str.to_string(),
                    },
                ))),
            }
        } else {
            None // Incomplete object, wait for more data
        }
    }

    /// Skip whitespace and delimiters (commas) at the beginning of the buffer.
    fn skip_whitespace_and_delimiters(&mut self) {
        while let Some(c) = self.buffer.chars().next() {
            if c.is_whitespace() || c == ',' {
                self.buffer.remove(0);
            } else {
                break;
            }
        }
    }

    /// Flush any remaining buffered data.
    ///
    /// Call this when the stream ends to parse any final remaining data.
    pub fn flush(&mut self) -> Option<Result<GenerateContentResponse, GeminiError>> {
        self.skip_whitespace_and_delimiters();

        if self.buffer.is_empty() || self.buffer == "]" {
            return None;
        }

        // Try to parse remaining buffer as final object
        self.try_extract_object()
    }

    /// Check if the parser has encountered any errors.
    pub fn has_error(&self) -> bool {
        self.error.is_some()
    }
}

/// Extract a complete JSON object from the beginning of the string.
///
/// Handles nested objects, arrays, and escaped strings correctly.
/// This function properly tracks:
/// - Brace and bracket depth for nested structures
/// - String boundaries to ignore JSON syntax within strings
/// - Escape sequences within strings
///
/// # Arguments
///
/// * `input` - The input string that may contain a JSON object at the beginning
///
/// # Returns
///
/// A tuple of (object_string, remaining_string) if a complete object is found,
/// or None if the object is incomplete.
fn extract_json_object(input: &str) -> Option<(&str, &str)> {
    if !input.starts_with('{') {
        return None;
    }

    let mut depth = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let bytes = input.as_bytes();

    for (i, &byte) in bytes.iter().enumerate() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match byte {
            b'\\' if in_string => escape_next = true,
            b'"' => in_string = !in_string,
            b'{' | b'[' if !in_string => depth += 1,
            b'}' | b']' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    return Some((&input[..=i], &input[i + 1..]));
                }
            }
            _ => {}
        }
    }

    None // Incomplete object
}

impl Stream for GeminiChunkParser {
    type Item = Result<GenerateContentResponse, GeminiError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // If we've already encountered an error, stop streaming
        if self.has_error() {
            return Poll::Ready(None);
        }

        // First, try to extract any complete objects from the buffer
        if let Some(result) = self.try_extract_object() {
            return Poll::Ready(Some(result));
        }

        // If we've finished reading from the inner stream, flush remaining buffer
        if self.finished {
            return Poll::Ready(self.flush());
        }

        // Try to read more data from the inner stream
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                // Add to buffer
                if let Ok(text) = std::str::from_utf8(&bytes) {
                    self.buffer.push_str(text);
                } else {
                    let error = GeminiError::Response(ResponseError::MalformedChunk {
                        message: "Invalid UTF-8 in stream".to_string(),
                    });
                    self.error = Some(error.clone());
                    return Poll::Ready(Some(Err(error)));
                }

                // Try to extract an object now
                if let Some(result) = self.try_extract_object() {
                    Poll::Ready(Some(result))
                } else {
                    // No complete object yet, need more data
                    cx.waker().wake_by_ref();
                    Poll::Pending
                }
            }
            Poll::Ready(Some(Err(e))) => {
                self.error = Some(e.clone());
                Poll::Ready(Some(Err(e)))
            }
            Poll::Ready(None) => {
                self.finished = true;
                Poll::Ready(self.flush())
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_object_simple() {
        let buffer = r#"{"key": "value"}"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, Some((r#"{"key": "value"}"#, "")));
    }

    #[test]
    fn test_extract_json_object_nested() {
        let buffer = r#"{"outer": {"inner": "value"}}, {"next": "object"}"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, Some((r#"{"outer": {"inner": "value"}}"#, r#", {"next": "object"}"#)));
    }

    #[test]
    fn test_extract_json_object_with_string_braces() {
        let buffer = r#"{"key": "value with } brace"}"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, Some((r#"{"key": "value with } brace"}"#, "")));
    }

    #[test]
    fn test_extract_json_object_incomplete() {
        let buffer = r#"{"key": "value"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_json_object_with_escaped_quote() {
        let buffer = r#"{"key": "value with \" quote"}"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, Some((r#"{"key": "value with \" quote"}"#, "")));
    }

    #[test]
    fn test_extract_json_object_not_starting_with_brace() {
        let buffer = r#"  some text  "#;
        let result = extract_json_object(buffer);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_json_object_with_nested_arrays() {
        let buffer = r#"{"array": [{"nested": "value"}]}"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, Some((r#"{"array": [{"nested": "value"}]}"#, "")));
    }

    #[test]
    fn test_extract_json_object_with_escaped_backslash() {
        let buffer = r#"{"key": "value with \\ backslash"}"#;
        let result = extract_json_object(buffer);
        assert_eq!(result, Some((r#"{"key": "value with \\ backslash"}"#, "")));
    }

    #[tokio::test]
    async fn test_gemini_chunk_parser() {
        use futures::StreamExt;

        // Simulate Gemini's streaming format
        let data = r#"[{"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":10,"totalTokenCount":15}},
{"candidates":[{"content":{"parts":[{"text":" World"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":12,"totalTokenCount":17}}]"#;

        let chunks: Vec<Result<Bytes, GeminiError>> = vec![
            Ok(Bytes::from(data)),
        ];

        let stream = futures::stream::iter(chunks);
        let mut parser = GeminiChunkParser::new(Box::pin(stream));

        let mut responses = Vec::new();
        while let Some(result) = parser.next().await {
            responses.push(result.unwrap());
        }

        assert_eq!(responses.len(), 2);
    }
}
