//! Streaming support for the Messages API

use super::types::{
    ContentBlock, ContentDelta, Message, MessageDelta, PartialMessage, Role, StopReason, Usage,
};
use crate::error::{AnthropicError, StreamError};
use bytes::Bytes;
use futures::{Stream, StreamExt};
use pin_project_lite::pin_project;
use serde::Deserialize;
use std::pin::Pin;
use std::task::{Context, Poll};

/// Stream events from the Messages API
#[derive(Debug, Clone, PartialEq)]
pub enum MessageStreamEvent {
    /// Message started
    MessageStart {
        message: PartialMessage,
    },
    /// Content block started
    ContentBlockStart {
        index: usize,
        content_block: ContentBlock,
    },
    /// Content block delta (incremental update)
    ContentBlockDelta {
        index: usize,
        delta: ContentDelta,
    },
    /// Content block stopped
    ContentBlockStop {
        index: usize,
    },
    /// Message delta (metadata update)
    MessageDelta {
        delta: MessageDelta,
        usage: Usage,
    },
    /// Message stopped
    MessageStop,
    /// Ping event (keepalive)
    Ping,
    /// Error event
    Error {
        error: StreamError,
    },
}

/// Internal SSE event structure
#[derive(Debug, Deserialize)]
struct SseEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(flatten)]
    data: serde_json::Value,
}

/// Message start event
#[derive(Debug, Deserialize)]
struct MessageStartEvent {
    message: PartialMessage,
}

/// Content block start event
#[derive(Debug, Deserialize)]
struct ContentBlockStartEvent {
    index: usize,
    content_block: ContentBlock,
}

/// Content block delta event
#[derive(Debug, Deserialize)]
struct ContentBlockDeltaEvent {
    index: usize,
    delta: ContentDelta,
}

/// Content block stop event
#[derive(Debug, Deserialize)]
struct ContentBlockStopEvent {
    index: usize,
}

/// Message delta event
#[derive(Debug, Deserialize)]
struct MessageDeltaEvent {
    delta: MessageDelta,
    usage: Usage,
}

pin_project! {
    /// Stream of message events
    pub struct MessageStream {
        #[pin]
        inner: Box<dyn Stream<Item = Result<Bytes, AnthropicError>> + Send + Unpin>,
        buffer: String,
        is_done: bool,
        // State for accumulating the final message
        current_message: Option<PartialMessage>,
        content_blocks: Vec<ContentBlock>,
        accumulated_text: Vec<String>,
    }
}

impl MessageStream {
    /// Create a new message stream
    pub fn new(
        inner: Box<dyn Stream<Item = Result<Bytes, AnthropicError>> + Send + Unpin>,
    ) -> Self {
        Self {
            inner,
            buffer: String::new(),
            is_done: false,
            current_message: None,
            content_blocks: Vec::new(),
            accumulated_text: Vec::new(),
        }
    }

    /// Collect the stream into a complete message
    pub async fn collect(mut self) -> Result<Message, AnthropicError> {
        let mut message: Option<PartialMessage> = None;
        let mut content_blocks: Vec<ContentBlock> = Vec::new();
        let mut accumulated_text: Vec<String> = Vec::new();
        let mut stop_reason: Option<StopReason> = None;
        let mut stop_sequence: Option<String> = None;
        let mut final_usage: Option<Usage> = None;

        while let Some(event) = self.next().await {
            match event? {
                MessageStreamEvent::MessageStart { message: msg } => {
                    message = Some(msg);
                }
                MessageStreamEvent::ContentBlockStart {
                    index,
                    content_block,
                } => {
                    while content_blocks.len() <= index {
                        content_blocks.push(ContentBlock::Text {
                            text: String::new(),
                            cache_control: None,
                        });
                        accumulated_text.push(String::new());
                    }
                    content_blocks[index] = content_block;
                }
                MessageStreamEvent::ContentBlockDelta { index, delta } => {
                    if let Some(text) = delta.text {
                        while accumulated_text.len() <= index {
                            accumulated_text.push(String::new());
                        }
                        accumulated_text[index].push_str(&text);
                    }
                }
                MessageStreamEvent::MessageDelta { delta, usage } => {
                    stop_reason = delta.stop_reason;
                    stop_sequence = delta.stop_sequence;
                    final_usage = Some(usage);
                }
                MessageStreamEvent::MessageStop => {
                    break;
                }
                MessageStreamEvent::Error { error } => {
                    return Err(AnthropicError::Stream(error.to_string()));
                }
                _ => {}
            }
        }

        // Update content blocks with accumulated text
        for (i, text) in accumulated_text.iter().enumerate() {
            if i < content_blocks.len() {
                if let ContentBlock::Text { cache_control, .. } = &content_blocks[i] {
                    content_blocks[i] = ContentBlock::Text {
                        text: text.clone(),
                        cache_control: cache_control.clone(),
                    };
                }
            }
        }

        let partial_message = message
            .ok_or_else(|| AnthropicError::Stream("No message start event received".to_string()))?;

        let usage = final_usage.unwrap_or(partial_message.usage);

        Ok(Message {
            id: partial_message.id,
            message_type: partial_message.message_type,
            role: partial_message.role,
            content: content_blocks,
            model: partial_message.model,
            stop_reason,
            stop_sequence,
            usage,
        })
    }

    /// Parse an SSE event from a line
    fn parse_sse_line(&mut self, line: &str) -> Option<Result<MessageStreamEvent, AnthropicError>> {
        if line.is_empty() {
            return None;
        }

        if !line.starts_with("data: ") {
            return None;
        }

        let data = &line[6..]; // Remove "data: " prefix

        if data == "[DONE]" {
            return Some(Ok(MessageStreamEvent::MessageStop));
        }

        // Parse the JSON event
        match serde_json::from_str::<SseEvent>(data) {
            Ok(event) => self.parse_event(event),
            Err(e) => Some(Err(AnthropicError::Stream(format!(
                "Failed to parse SSE event: {}",
                e
            )))),
        }
    }

    /// Parse a typed event
    fn parse_event(&self, event: SseEvent) -> Option<Result<MessageStreamEvent, AnthropicError>> {
        match event.event_type.as_str() {
            "message_start" => {
                match serde_json::from_value::<MessageStartEvent>(event.data) {
                    Ok(data) => Some(Ok(MessageStreamEvent::MessageStart {
                        message: data.message,
                    })),
                    Err(e) => Some(Err(AnthropicError::Stream(format!(
                        "Failed to parse message_start: {}",
                        e
                    )))),
                }
            }
            "content_block_start" => {
                match serde_json::from_value::<ContentBlockStartEvent>(event.data) {
                    Ok(data) => Some(Ok(MessageStreamEvent::ContentBlockStart {
                        index: data.index,
                        content_block: data.content_block,
                    })),
                    Err(e) => Some(Err(AnthropicError::Stream(format!(
                        "Failed to parse content_block_start: {}",
                        e
                    )))),
                }
            }
            "content_block_delta" => {
                match serde_json::from_value::<ContentBlockDeltaEvent>(event.data) {
                    Ok(data) => Some(Ok(MessageStreamEvent::ContentBlockDelta {
                        index: data.index,
                        delta: data.delta,
                    })),
                    Err(e) => Some(Err(AnthropicError::Stream(format!(
                        "Failed to parse content_block_delta: {}",
                        e
                    )))),
                }
            }
            "content_block_stop" => {
                match serde_json::from_value::<ContentBlockStopEvent>(event.data) {
                    Ok(data) => Some(Ok(MessageStreamEvent::ContentBlockStop {
                        index: data.index,
                    })),
                    Err(e) => Some(Err(AnthropicError::Stream(format!(
                        "Failed to parse content_block_stop: {}",
                        e
                    )))),
                }
            }
            "message_delta" => {
                match serde_json::from_value::<MessageDeltaEvent>(event.data) {
                    Ok(data) => Some(Ok(MessageStreamEvent::MessageDelta {
                        delta: data.delta,
                        usage: data.usage,
                    })),
                    Err(e) => Some(Err(AnthropicError::Stream(format!(
                        "Failed to parse message_delta: {}",
                        e
                    )))),
                }
            }
            "message_stop" => Some(Ok(MessageStreamEvent::MessageStop)),
            "ping" => Some(Ok(MessageStreamEvent::Ping)),
            "error" => Some(Err(AnthropicError::Stream(format!(
                "Error event: {:?}",
                event.data
            )))),
            _ => None, // Ignore unknown events
        }
    }
}

impl Stream for MessageStream {
    type Item = Result<MessageStreamEvent, AnthropicError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut this = self.project();

        if *this.is_done {
            return Poll::Ready(None);
        }

        // Poll the inner stream for more data
        match this.inner.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                // Add bytes to buffer
                let text = String::from_utf8_lossy(&bytes);
                this.buffer.push_str(&text);

                // Process complete lines
                if let Some(newline_pos) = this.buffer.find('\n') {
                    let line = this.buffer[..newline_pos].to_string();
                    *this.buffer = this.buffer[newline_pos + 1..].to_string();

                    if let Some(event) = this.parse_sse_line(&line) {
                        return Poll::Ready(Some(event));
                    }

                    // If we didn't get an event, poll again
                    cx.waker().wake_by_ref();
                    Poll::Pending
                } else {
                    // Need more data
                    cx.waker().wake_by_ref();
                    Poll::Pending
                }
            }
            Poll::Ready(Some(Err(e))) => {
                *this.is_done = true;
                Poll::Ready(Some(Err(e)))
            }
            Poll::Ready(None) => {
                *this.is_done = true;
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}
