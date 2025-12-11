//! Streaming response handling and SSE parsing.

use bytes::Bytes;
use futures::{Stream, StreamExt};
use pin_project_lite::pin_project;
use std::collections::HashMap;
use std::pin::Pin;
use std::task::{Context, Poll};

use super::TransportError;
use crate::errors::GroqError;
use crate::types::chat::{ChatChunk, ChatResponse};

/// Streaming HTTP response.
pub struct StreamingResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response headers.
    pub headers: HashMap<String, String>,
    /// Byte stream.
    pub stream: Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>>,
}

/// Server-Sent Event.
#[derive(Debug, Clone)]
pub struct SseEvent {
    /// Event type.
    pub event: Option<String>,
    /// Event data.
    pub data: String,
    /// Event ID.
    pub id: Option<String>,
    /// Retry timeout in milliseconds.
    pub retry: Option<u64>,
}

/// SSE event builder for parsing.
#[derive(Debug, Default)]
struct SseEventBuilder {
    event: Option<String>,
    data: Vec<String>,
    id: Option<String>,
    retry: Option<u64>,
}

impl SseEventBuilder {
    fn new() -> Self {
        Self::default()
    }

    fn build(self) -> Option<SseEvent> {
        if self.data.is_empty() {
            return None;
        }

        Some(SseEvent {
            event: self.event,
            data: self.data.join("\n"),
            id: self.id,
            retry: self.retry,
        })
    }

    fn reset(&mut self) {
        self.event = None;
        self.data.clear();
        self.id = None;
        self.retry = None;
    }
}

/// SSE parser that converts byte stream to events.
pub struct SseParser {
    buffer: String,
    current_event: SseEventBuilder,
}

impl SseParser {
    /// Creates a new SSE parser.
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            current_event: SseEventBuilder::new(),
        }
    }

    /// Parses a chunk of data and returns any complete events.
    pub fn parse(&mut self, chunk: &str) -> Vec<SseEvent> {
        self.buffer.push_str(chunk);
        let mut events = Vec::new();

        while let Some(newline_pos) = self.buffer.find('\n') {
            let line = self.buffer[..newline_pos].trim_end_matches('\r').to_string();
            self.buffer = self.buffer[newline_pos + 1..].to_string();

            if let Some(event) = self.parse_line(&line) {
                events.push(event);
            }
        }

        events
    }

    fn parse_line(&mut self, line: &str) -> Option<SseEvent> {
        // Empty line signals end of event
        if line.is_empty() {
            let event = std::mem::take(&mut self.current_event).build();
            self.current_event = SseEventBuilder::new();
            return event;
        }

        // Comment line (starts with ':')
        if line.starts_with(':') {
            return None;
        }

        // Parse field: value
        let (field, value) = if let Some(colon_pos) = line.find(':') {
            let field = &line[..colon_pos];
            let value = line[colon_pos + 1..].trim_start();
            (field, value)
        } else {
            (line, "")
        };

        match field {
            "event" => self.current_event.event = Some(value.to_string()),
            "data" => self.current_event.data.push(value.to_string()),
            "id" => self.current_event.id = Some(value.to_string()),
            "retry" => {
                if let Ok(ms) = value.parse::<u64>() {
                    self.current_event.retry = Some(ms);
                }
            }
            _ => {} // Ignore unknown fields
        }

        None
    }

    /// Flush any remaining event.
    pub fn flush(&mut self) -> Option<SseEvent> {
        if !self.buffer.is_empty() {
            let _ = self.parse_line(&self.buffer.clone());
            self.buffer.clear();
        }
        std::mem::take(&mut self.current_event).build()
    }
}

impl Default for SseParser {
    fn default() -> Self {
        Self::new()
    }
}

pin_project! {
    /// Chat completion stream.
    ///
    /// Wraps an SSE stream and parses chat completion chunks.
    pub struct ChatStream {
        #[pin]
        inner: Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>>,
        parser: SseParser,
        done: bool,
        accumulated_content: String,
    }
}

impl ChatStream {
    /// Creates a new chat stream from a streaming response.
    pub fn new(response: StreamingResponse) -> Result<Self, GroqError> {
        // Verify status code
        if response.status != 200 {
            return Err(GroqError::Server {
                message: format!("Unexpected status code: {}", response.status),
                status_code: response.status,
                request_id: response.headers.get("x-request-id").cloned(),
            });
        }

        Ok(Self {
            inner: response.stream,
            parser: SseParser::new(),
            done: false,
            accumulated_content: String::new(),
        })
    }

    /// Collects all chunks into a complete response.
    pub async fn collect(self) -> Result<ChatResponse, GroqError> {
        use futures::TryStreamExt;

        let chunks: Vec<ChatChunk> = self.try_collect().await?;
        ChatResponse::from_chunks(chunks)
    }

    /// Returns the accumulated content so far.
    pub fn accumulated_content(&self) -> &str {
        &self.accumulated_content
    }
}

impl Stream for ChatStream {
    type Item = Result<ChatChunk, GroqError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();

        if *this.done {
            return Poll::Ready(None);
        }

        // Try to get more data from the stream
        match this.inner.poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                // Parse the chunk as UTF-8
                let text = match String::from_utf8(bytes.to_vec()) {
                    Ok(text) => text,
                    Err(e) => {
                        return Poll::Ready(Some(Err(GroqError::Stream {
                            message: format!("Invalid UTF-8 in stream: {}", e),
                            partial_content: Some(this.accumulated_content.clone()),
                        })));
                    }
                };

                // Parse SSE events
                let events = this.parser.parse(&text);

                for event in events {
                    // Check for done marker
                    if event.data == "[DONE]" {
                        *this.done = true;
                        return Poll::Ready(None);
                    }

                    // Parse chunk
                    match serde_json::from_str::<ChatChunk>(&event.data) {
                        Ok(chunk) => {
                            // Accumulate content
                            if let Some(content) = chunk
                                .choices
                                .first()
                                .and_then(|c| c.delta.content.as_ref())
                            {
                                this.accumulated_content.push_str(content);
                            }
                            return Poll::Ready(Some(Ok(chunk)));
                        }
                        Err(e) => {
                            // Skip empty or invalid chunks
                            if !event.data.is_empty() && event.data != "[DONE]" {
                                tracing::debug!(
                                    error = %e,
                                    data = %event.data,
                                    "Failed to parse SSE chunk"
                                );
                            }
                        }
                    }
                }

                // Need more data, wake and poll again
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Poll::Ready(Some(Err(e))) => {
                Poll::Ready(Some(Err(GroqError::Network {
                    message: e.to_string(),
                    cause: None,
                })))
            }
            Poll::Ready(None) => {
                *this.done = true;
                // Flush any remaining event
                if let Some(event) = this.parser.flush() {
                    if event.data != "[DONE]" && !event.data.is_empty() {
                        if let Ok(chunk) = serde_json::from_str::<ChatChunk>(&event.data) {
                            return Poll::Ready(Some(Ok(chunk)));
                        }
                    }
                }
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_parser_single_event() {
        let mut parser = SseParser::new();

        let events = parser.parse("data: test\n\n");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "test");
    }

    #[test]
    fn test_sse_parser_multiple_events() {
        let mut parser = SseParser::new();

        let events = parser.parse("data: first\n\ndata: second\n\n");

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].data, "first");
        assert_eq!(events[1].data, "second");
    }

    #[test]
    fn test_sse_parser_with_event_type() {
        let mut parser = SseParser::new();

        let events = parser.parse("event: message\ndata: hello\n\n");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, Some("message".to_string()));
        assert_eq!(events[0].data, "hello");
    }

    #[test]
    fn test_sse_parser_multiline_data() {
        let mut parser = SseParser::new();

        let events = parser.parse("data: line1\ndata: line2\n\n");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "line1\nline2");
    }

    #[test]
    fn test_sse_parser_comment() {
        let mut parser = SseParser::new();

        let events = parser.parse(": this is a comment\ndata: hello\n\n");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "hello");
    }

    #[test]
    fn test_sse_parser_incomplete() {
        let mut parser = SseParser::new();

        // First chunk doesn't complete the event
        let events = parser.parse("data: hello");
        assert!(events.is_empty());

        // Complete the event
        let events = parser.parse("\n\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "hello");
    }

    #[test]
    fn test_sse_parser_done_marker() {
        let mut parser = SseParser::new();

        let events = parser.parse("data: [DONE]\n\n");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "[DONE]");
    }
}
