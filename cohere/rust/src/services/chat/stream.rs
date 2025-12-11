//! Streaming support for Chat service.

use super::types::{ChatResponse, Citation, Document, SearchQuery, SearchResult, ToolCall};
use crate::errors::{CohereError, CohereResult};
use crate::transport::sse::{SseEvent, SseParser};
use crate::types::FinishReason;
use bytes::Bytes;
use futures::stream::Stream;
use serde::Deserialize;
use std::pin::Pin;
use std::task::{Context, Poll};

/// Events from a chat stream
#[derive(Debug, Clone)]
pub enum ChatStreamEvent {
    /// Stream started
    StreamStart {
        /// Generation ID
        generation_id: Option<String>,
    },
    /// Text generated
    TextGeneration {
        /// Generated text chunk
        text: String,
    },
    /// Search queries generated (RAG)
    SearchQueriesGeneration {
        /// Search queries
        search_queries: Vec<SearchQuery>,
    },
    /// Search results received (RAG)
    SearchResults {
        /// Search results
        results: Vec<SearchResult>,
        /// Documents
        documents: Vec<Document>,
    },
    /// Tool calls generated
    ToolCallsGeneration {
        /// Tool calls
        tool_calls: Vec<ToolCall>,
    },
    /// Citation generated
    CitationGeneration {
        /// Citations
        citations: Vec<Citation>,
    },
    /// Stream ended
    StreamEnd {
        /// Finish reason
        finish_reason: Option<FinishReason>,
        /// Final response (if available)
        response: Option<ChatResponse>,
    },
}

/// Internal streaming event types from Cohere API
#[derive(Debug, Deserialize)]
#[serde(tag = "event_type")]
#[serde(rename_all = "kebab-case")]
enum StreamEvent {
    StreamStart {
        generation_id: Option<String>,
    },
    TextGeneration {
        text: String,
    },
    SearchQueriesGeneration {
        search_queries: Vec<SearchQuery>,
    },
    SearchResults {
        search_results: Vec<SearchResult>,
        documents: Vec<Document>,
    },
    ToolCallsGeneration {
        tool_calls: Vec<ToolCall>,
    },
    CitationGeneration {
        citations: Vec<Citation>,
    },
    StreamEnd {
        finish_reason: Option<FinishReason>,
        response: Option<ChatResponse>,
    },
}

/// A stream of chat events
pub struct ChatStream {
    inner: Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>,
    parser: SseParser,
    pending_events: Vec<ChatStreamEvent>,
    done: bool,
    accumulated_text: String,
    generation_id: Option<String>,
}

impl ChatStream {
    /// Create a new chat stream
    pub fn new(inner: Pin<Box<dyn Stream<Item = CohereResult<Bytes>> + Send>>) -> Self {
        Self {
            inner,
            parser: SseParser::new(),
            pending_events: Vec::new(),
            done: false,
            accumulated_text: String::new(),
            generation_id: None,
        }
    }

    /// Get accumulated text so far
    pub fn accumulated_text(&self) -> &str {
        &self.accumulated_text
    }

    /// Get the generation ID if available
    pub fn generation_id(&self) -> Option<&str> {
        self.generation_id.as_deref()
    }

    /// Parse an SSE event into a chat stream event
    fn parse_event(&mut self, sse: SseEvent) -> CohereResult<Option<ChatStreamEvent>> {
        // Handle done event
        if sse.is_done() {
            return Ok(None);
        }

        // Parse the event data
        let event: StreamEvent = serde_json::from_str(&sse.data).map_err(|e| {
            CohereError::StreamError {
                message: format!("Failed to parse stream event: {}", e),
            }
        })?;

        let chat_event = match event {
            StreamEvent::StreamStart { generation_id } => {
                self.generation_id = generation_id.clone();
                ChatStreamEvent::StreamStart { generation_id }
            }
            StreamEvent::TextGeneration { text } => {
                self.accumulated_text.push_str(&text);
                ChatStreamEvent::TextGeneration { text }
            }
            StreamEvent::SearchQueriesGeneration { search_queries } => {
                ChatStreamEvent::SearchQueriesGeneration { search_queries }
            }
            StreamEvent::SearchResults {
                search_results,
                documents,
            } => ChatStreamEvent::SearchResults {
                results: search_results,
                documents,
            },
            StreamEvent::ToolCallsGeneration { tool_calls } => {
                ChatStreamEvent::ToolCallsGeneration { tool_calls }
            }
            StreamEvent::CitationGeneration { citations } => {
                ChatStreamEvent::CitationGeneration { citations }
            }
            StreamEvent::StreamEnd {
                finish_reason,
                response,
            } => {
                self.done = true;
                ChatStreamEvent::StreamEnd {
                    finish_reason,
                    response,
                }
            }
        };

        Ok(Some(chat_event))
    }
}

impl Stream for ChatStream {
    type Item = CohereResult<ChatStreamEvent>;

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
                        Ok(None) => {
                            // Done event, continue
                        }
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
                if let Some(event) = self.parser.flush() {
                    if let Ok(Some(chat_event)) = self.parse_event(event) {
                        return Poll::Ready(Some(Ok(chat_event)));
                    }
                }
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Collect all text from a chat stream
pub async fn collect_text(mut stream: ChatStream) -> CohereResult<String> {
    use futures::StreamExt;

    while let Some(event) = stream.next().await {
        match event? {
            ChatStreamEvent::TextGeneration { .. } => {
                // Text is automatically accumulated
            }
            ChatStreamEvent::StreamEnd { .. } => break,
            _ => {}
        }
    }

    Ok(stream.accumulated_text.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_stream_event_variants() {
        let start = ChatStreamEvent::StreamStart {
            generation_id: Some("gen-123".to_string()),
        };
        match start {
            ChatStreamEvent::StreamStart { generation_id } => {
                assert_eq!(generation_id, Some("gen-123".to_string()));
            }
            _ => panic!("Wrong variant"),
        }

        let text = ChatStreamEvent::TextGeneration {
            text: "Hello".to_string(),
        };
        match text {
            ChatStreamEvent::TextGeneration { text } => {
                assert_eq!(text, "Hello");
            }
            _ => panic!("Wrong variant"),
        }
    }
}
