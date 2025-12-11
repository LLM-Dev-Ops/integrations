//! Streaming support for batch results
//!
//! Provides an async stream for efficiently processing batch results
//! line-by-line without loading the entire response into memory.

use super::types::BatchResult;
use crate::error::AnthropicError;
use bytes::Bytes;
use futures::stream::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};

/// An async stream that yields batch results one at a time from JSONL data.
///
/// This is useful for processing large batch results without loading
/// everything into memory at once.
///
/// # Example
///
/// ```rust,ignore
/// use futures::StreamExt;
///
/// let mut stream = service.results_stream("batch_123").await?;
/// while let Some(result) = stream.next().await {
///     match result {
///         Ok(batch_result) => println!("Got result: {}", batch_result.custom_id),
///         Err(e) => eprintln!("Error: {}", e),
///     }
/// }
/// ```
pub struct BatchResultsStream {
    /// The underlying byte stream
    inner: Pin<Box<dyn Stream<Item = Result<Bytes, AnthropicError>> + Send>>,
    /// Buffer for incomplete lines
    buffer: String,
    /// Whether we've reached the end of the stream
    finished: bool,
}

impl BatchResultsStream {
    /// Create a new batch results stream from a byte stream
    pub fn new(inner: Pin<Box<dyn Stream<Item = Result<Bytes, AnthropicError>> + Send>>) -> Self {
        Self {
            inner,
            buffer: String::new(),
            finished: false,
        }
    }

    /// Create a stream from raw JSONL data (useful for testing)
    pub fn from_jsonl(data: &str) -> Self {
        let lines: Vec<_> = data.lines().map(|s| s.to_string()).collect();
        let stream = futures::stream::iter(
            lines
                .into_iter()
                .map(|line| Ok(Bytes::from(format!("{}\n", line)))),
        );
        Self {
            inner: Box::pin(stream),
            buffer: String::new(),
            finished: false,
        }
    }

    /// Try to parse a complete line from the buffer
    fn try_parse_line(&mut self) -> Option<Result<BatchResult, AnthropicError>> {
        if let Some(newline_pos) = self.buffer.find('\n') {
            let line = self.buffer[..newline_pos].trim().to_string();
            self.buffer = self.buffer[newline_pos + 1..].to_string();

            if line.is_empty() {
                return None;
            }

            match serde_json::from_str::<BatchResult>(&line) {
                Ok(result) => Some(Ok(result)),
                Err(e) => Some(Err(AnthropicError::Serialization(e.to_string()))),
            }
        } else {
            None
        }
    }

    /// Process any remaining data in the buffer after stream ends
    fn flush_buffer(&mut self) -> Option<Result<BatchResult, AnthropicError>> {
        let remaining = self.buffer.trim().to_string();
        self.buffer.clear();

        if remaining.is_empty() {
            return None;
        }

        match serde_json::from_str::<BatchResult>(&remaining) {
            Ok(result) => Some(Ok(result)),
            Err(e) => Some(Err(AnthropicError::Serialization(e.to_string()))),
        }
    }

    /// Collect all results into a vector
    pub async fn collect(self) -> Result<Vec<BatchResult>, AnthropicError> {
        use futures::StreamExt;

        let mut results = Vec::new();
        let mut stream = self;

        while let Some(result) = stream.next().await {
            results.push(result?);
        }

        Ok(results)
    }
}

impl Stream for BatchResultsStream {
    type Item = Result<BatchResult, AnthropicError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // First, try to parse any complete lines in the buffer
        if let Some(result) = self.try_parse_line() {
            return Poll::Ready(Some(result));
        }

        // If we've finished reading from the inner stream, flush remaining buffer
        if self.finished {
            return Poll::Ready(self.flush_buffer());
        }

        // Try to read more data from the inner stream
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                // Add to buffer
                if let Ok(text) = std::str::from_utf8(&bytes) {
                    self.buffer.push_str(text);
                }
                // Try to parse a line now
                Poll::Ready(self.try_parse_line().or_else(|| {
                    // No complete line yet, need more data
                    cx.waker().wake_by_ref();
                    None
                }))
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                self.finished = true;
                Poll::Ready(self.flush_buffer())
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    #[tokio::test]
    async fn test_batch_results_stream_from_jsonl() {
        let jsonl = r#"{"custom_id":"req1","type":"succeeded","message":null,"error":null}
{"custom_id":"req2","type":"errored","message":null,"error":{"type":"invalid_request","message":"Bad request"}}
{"custom_id":"req3","type":"succeeded","message":null,"error":null}"#;

        let mut stream = BatchResultsStream::from_jsonl(jsonl);
        let mut results = Vec::new();

        while let Some(result) = stream.next().await {
            results.push(result.unwrap());
        }

        assert_eq!(results.len(), 3);
        assert_eq!(results[0].custom_id, "req1");
        assert_eq!(results[0].result_type, "succeeded");
        assert_eq!(results[1].custom_id, "req2");
        assert_eq!(results[1].result_type, "errored");
        assert!(results[1].error.is_some());
        assert_eq!(results[2].custom_id, "req3");
    }

    #[tokio::test]
    async fn test_batch_results_stream_collect() {
        let jsonl = r#"{"custom_id":"req1","type":"succeeded","message":null,"error":null}
{"custom_id":"req2","type":"succeeded","message":null,"error":null}"#;

        let stream = BatchResultsStream::from_jsonl(jsonl);
        let results = stream.collect().await.unwrap();

        assert_eq!(results.len(), 2);
    }

    #[tokio::test]
    async fn test_batch_results_stream_empty() {
        let stream = BatchResultsStream::from_jsonl("");
        let results = stream.collect().await.unwrap();

        assert_eq!(results.len(), 0);
    }

    #[tokio::test]
    async fn test_batch_results_stream_invalid_json() {
        let jsonl = "not valid json";

        let mut stream = BatchResultsStream::from_jsonl(jsonl);
        let result = stream.next().await;

        assert!(result.is_some());
        assert!(result.unwrap().is_err());
    }
}
