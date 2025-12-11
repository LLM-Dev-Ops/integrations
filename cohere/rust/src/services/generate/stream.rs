//! Streaming support for Generate service.

use super::types::Generation;
use crate::errors::{CohereError, CohereResult};
use crate::transport::sse::{SseEvent, SseParser};
use crate::types::FinishReason;
use bytes::Bytes;
use futures::stream::Stream;
use serde::Deserialize;
use std::pin::Pin;
use std::task::{Context, Poll};

/// Events from a generate stream
#[derive(Debug, Clone)]
pub enum GenerateStreamEvent {
    /// Text generated
    TextGeneration {
        /// Generated text chunk
        text: String,
        /// Index in multi-generation
        index: usize,
    },
    /// Stream ended
    StreamEnd {
        /// Finish reason
        finish_reason: Option<FinishReason>,
        /// Final generation
        generation: Option<Generation>,
    },
}

/// Internal streaming event types from Cohere API
#[derive(Debug, Deserialize)]
struct StreamTextEvent {
    text: String,
    #[serde(default)]
    index: Option<usize>,
    #[serde(default)]
    is_finished: bool,
    #[serde(default)]
    finish_reason: Option<FinishReason>,
}

/// A stream of generate events
pub struct GenerateStream {
    inner: Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>,
    parser: SseParser,
    pending_events: Vec<GenerateStreamEvent>,
    done: bool,
    accumulated_text: String,
}

impl GenerateStream {
    /// Create a new generate stream
    pub fn new(inner: Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>) -> Self {
        Self {
            inner,
            parser: SseParser::new(),
            pending_events: Vec::new(),
            done: false,
            accumulated_text: String::new(),
        }
    }

    /// Get accumulated text so far
    pub fn accumulated_text(&self) -> &str {
        &self.accumulated_text
    }

    /// Parse an SSE event into a generate stream event
    fn parse_event(&mut self, sse: SseEvent) -> CohereResult<Option<GenerateStreamEvent>> {
        // Handle done event
        if sse.is_done() {
            self.done = true;
            return Ok(Some(GenerateStreamEvent::StreamEnd {
                finish_reason: None,
                generation: Some(Generation {
                    text: self.accumulated_text.clone(),
                    id: None,
                    finish_reason: None,
                    token_likelihoods: None,
                }),
            }));
        }

        // Parse the event data
        let event: StreamTextEvent = serde_json::from_str(&sse.data).map_err(|e| {
            CohereError::StreamError {
                message: format!("Failed to parse stream event: {}", e),
            }
        })?;

        if event.is_finished {
            self.done = true;
            return Ok(Some(GenerateStreamEvent::StreamEnd {
                finish_reason: event.finish_reason,
                generation: Some(Generation {
                    text: self.accumulated_text.clone(),
                    id: None,
                    finish_reason: event.finish_reason,
                    token_likelihoods: None,
                }),
            }));
        }

        self.accumulated_text.push_str(&event.text);
        Ok(Some(GenerateStreamEvent::TextGeneration {
            text: event.text,
            index: event.index.unwrap_or(0),
        }))
    }
}

impl Stream for GenerateStream {
    type Item = CohereResult<GenerateStreamEvent>;

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
                for sse in events {
                    match self.parse_event(sse) {
                        Ok(Some(event)) => {
                            self.pending_events.push(event);
                        }
                        Ok(None) => {}
                        Err(e) => {
                            return Poll::Ready(Some(Err(e)));
                        }
                    }
                }

                if !self.pending_events.is_empty() {
                    return Poll::Ready(Some(Ok(self.pending_events.remove(0))));
                }

                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                // Stream ended
                if !self.done {
                    self.done = true;
                    return Poll::Ready(Some(Ok(GenerateStreamEvent::StreamEnd {
                        finish_reason: None,
                        generation: Some(Generation {
                            text: self.accumulated_text.clone(),
                            id: None,
                            finish_reason: None,
                            token_likelihoods: None,
                        }),
                    })));
                }
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Collect all text from a generate stream
pub async fn collect_text(mut stream: GenerateStream) -> CohereResult<String> {
    use futures::StreamExt;

    while let Some(event) = stream.next().await {
        match event? {
            GenerateStreamEvent::TextGeneration { .. } => {}
            GenerateStreamEvent::StreamEnd { .. } => break,
        }
    }

    Ok(stream.accumulated_text.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_stream_event_variants() {
        let text = GenerateStreamEvent::TextGeneration {
            text: "Hello".to_string(),
            index: 0,
        };
        match text {
            GenerateStreamEvent::TextGeneration { text, index } => {
                assert_eq!(text, "Hello");
                assert_eq!(index, 0);
            }
            _ => panic!("Wrong variant"),
        }
    }
}
