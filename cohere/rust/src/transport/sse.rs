//! Server-Sent Events (SSE) parsing and streaming.

use crate::errors::{CohereError, CohereResult};
use bytes::Bytes;
use futures::stream::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};

/// A parsed SSE event
#[derive(Debug, Clone, PartialEq)]
pub struct SseEvent {
    /// Event type (from "event:" field)
    pub event: Option<String>,
    /// Event data (from "data:" field)
    pub data: String,
    /// Event ID (from "id:" field)
    pub id: Option<String>,
    /// Retry timeout in milliseconds (from "retry:" field)
    pub retry: Option<u64>,
}

impl SseEvent {
    /// Create a new SSE event with just data
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            event: None,
            data: data.into(),
            id: None,
            retry: None,
        }
    }

    /// Create a new SSE event with event type and data
    pub fn with_event(event: impl Into<String>, data: impl Into<String>) -> Self {
        Self {
            event: Some(event.into()),
            data: data.into(),
            id: None,
            retry: None,
        }
    }

    /// Check if this is an error event
    pub fn is_error(&self) -> bool {
        self.event.as_deref() == Some("error")
    }

    /// Check if this is a done/end event
    pub fn is_done(&self) -> bool {
        matches!(
            self.event.as_deref(),
            Some("done") | Some("end") | Some("stream-end")
        ) || self.data == "[DONE]"
    }

    /// Parse the data as JSON
    pub fn parse_json<T: serde::de::DeserializeOwned>(&self) -> CohereResult<T> {
        serde_json::from_str(&self.data).map_err(|e| CohereError::StreamError {
            message: format!("Failed to parse SSE event data as JSON: {}", e),
        })
    }
}

/// Parser for SSE stream data
pub struct SseParser {
    buffer: String,
    current_event: Option<String>,
    current_data: Vec<String>,
    current_id: Option<String>,
    current_retry: Option<u64>,
}

impl SseParser {
    /// Create a new SSE parser
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            current_event: None,
            current_data: Vec::new(),
            current_id: None,
            current_retry: None,
        }
    }

    /// Feed data into the parser and get any complete events
    pub fn feed(&mut self, data: &[u8]) -> Vec<SseEvent> {
        let text = String::from_utf8_lossy(data);
        self.buffer.push_str(&text);

        let mut events = Vec::new();

        // Process complete lines
        while let Some(pos) = self.buffer.find('\n') {
            let line = self.buffer[..pos].to_string();
            self.buffer = self.buffer[pos + 1..].to_string();

            // Remove carriage return if present
            let line = line.trim_end_matches('\r');

            if line.is_empty() {
                // Empty line signals end of event
                if !self.current_data.is_empty() {
                    let event = SseEvent {
                        event: self.current_event.take(),
                        data: self.current_data.join("\n"),
                        id: self.current_id.take(),
                        retry: self.current_retry.take(),
                    };
                    events.push(event);
                    self.current_data.clear();
                }
            } else if let Some(value) = line.strip_prefix("event:") {
                self.current_event = Some(value.trim().to_string());
            } else if let Some(value) = line.strip_prefix("data:") {
                self.current_data.push(value.trim_start().to_string());
            } else if let Some(value) = line.strip_prefix("id:") {
                self.current_id = Some(value.trim().to_string());
            } else if let Some(value) = line.strip_prefix("retry:") {
                if let Ok(retry) = value.trim().parse() {
                    self.current_retry = Some(retry);
                }
            }
            // Lines starting with ':' are comments and should be ignored
        }

        events
    }

    /// Flush any remaining data as a final event
    pub fn flush(&mut self) -> Option<SseEvent> {
        if !self.current_data.is_empty() {
            let event = SseEvent {
                event: self.current_event.take(),
                data: self.current_data.join("\n"),
                id: self.current_id.take(),
                retry: self.current_retry.take(),
            };
            self.current_data.clear();
            Some(event)
        } else {
            None
        }
    }
}

impl Default for SseParser {
    fn default() -> Self {
        Self::new()
    }
}

/// A stream of SSE events
pub struct SseStream {
    inner: Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>,
    parser: SseParser,
    pending_events: Vec<SseEvent>,
    done: bool,
}

impl SseStream {
    /// Create a new SSE stream from a byte stream
    pub fn new(inner: Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>) -> Self {
        Self {
            inner,
            parser: SseParser::new(),
            pending_events: Vec::new(),
            done: false,
        }
    }
}

impl Stream for SseStream {
    type Item = CohereResult<SseEvent>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // Return pending events first
        if !self.pending_events.is_empty() {
            return Poll::Ready(Some(Ok(self.pending_events.remove(0))));
        }

        if self.done {
            return Poll::Ready(None);
        }

        // Poll the inner stream
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                let events = self.parser.feed(&bytes);
                if !events.is_empty() {
                    // Check if any event is a done event
                    for event in &events {
                        if event.is_done() {
                            self.done = true;
                        }
                    }

                    self.pending_events.extend(events.into_iter().skip(1));
                    if let Some(first) = events.into_iter().next() {
                        return Poll::Ready(Some(Ok(first)));
                    }
                }
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                // Stream ended, flush any remaining data
                if let Some(event) = self.parser.flush() {
                    Poll::Ready(Some(Ok(event)))
                } else {
                    Poll::Ready(None)
                }
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_event_creation() {
        let event = SseEvent::new("test data");
        assert_eq!(event.data, "test data");
        assert!(event.event.is_none());

        let typed_event = SseEvent::with_event("message", "hello");
        assert_eq!(typed_event.event, Some("message".to_string()));
        assert_eq!(typed_event.data, "hello");
    }

    #[test]
    fn test_sse_event_is_done() {
        let done_event = SseEvent::with_event("done", "");
        assert!(done_event.is_done());

        let end_event = SseEvent::with_event("stream-end", "");
        assert!(end_event.is_done());

        let done_data = SseEvent::new("[DONE]");
        assert!(done_data.is_done());

        let regular_event = SseEvent::with_event("message", "hello");
        assert!(!regular_event.is_done());
    }

    #[test]
    fn test_sse_parser_basic() {
        let mut parser = SseParser::new();

        let events = parser.feed(b"data: hello\n\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "hello");
    }

    #[test]
    fn test_sse_parser_with_event_type() {
        let mut parser = SseParser::new();

        let events = parser.feed(b"event: message\ndata: hello world\n\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, Some("message".to_string()));
        assert_eq!(events[0].data, "hello world");
    }

    #[test]
    fn test_sse_parser_multiline_data() {
        let mut parser = SseParser::new();

        let events = parser.feed(b"data: line1\ndata: line2\ndata: line3\n\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "line1\nline2\nline3");
    }

    #[test]
    fn test_sse_parser_multiple_events() {
        let mut parser = SseParser::new();

        let events = parser.feed(b"data: first\n\ndata: second\n\n");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].data, "first");
        assert_eq!(events[1].data, "second");
    }

    #[test]
    fn test_sse_parser_with_id_and_retry() {
        let mut parser = SseParser::new();

        let events = parser.feed(b"id: 123\nretry: 5000\ndata: test\n\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, Some("123".to_string()));
        assert_eq!(events[0].retry, Some(5000));
        assert_eq!(events[0].data, "test");
    }

    #[test]
    fn test_sse_parser_partial_data() {
        let mut parser = SseParser::new();

        // Feed partial data
        let events1 = parser.feed(b"data: hel");
        assert!(events1.is_empty());

        // Feed more data
        let events2 = parser.feed(b"lo\n\n");
        assert_eq!(events2.len(), 1);
        assert_eq!(events2[0].data, "hello");
    }

    #[test]
    fn test_sse_parser_json_data() {
        let mut parser = SseParser::new();

        let events = parser.feed(b"data: {\"text\": \"hello\"}\n\n");
        assert_eq!(events.len(), 1);

        #[derive(serde::Deserialize)]
        struct TestData {
            text: String,
        }

        let parsed: TestData = events[0].parse_json().unwrap();
        assert_eq!(parsed.text, "hello");
    }
}
