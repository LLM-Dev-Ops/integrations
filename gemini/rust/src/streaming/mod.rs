//! Streaming support for Gemini API responses.
//!
//! This module provides utilities for handling streaming responses from the Gemini API:
//! - Chunked JSON parsing for Gemini's array-based streaming format
//! - Stream accumulation for combining partial responses into complete ones
//!
//! ## Chunked JSON Streaming
//!
//! The Gemini API returns streaming responses as a JSON array with one object per line:
//! ```json
//! [{"candidates":[...],"usageMetadata":...},
//! {"candidates":[...],"usageMetadata":...}]
//! ```
//!
//! The `GeminiChunkParser` handles this format by:
//! - Parsing the array brackets and comma separators
//! - Buffering partial JSON objects
//! - Using brace matching to extract complete objects
//! - Deserializing each object into a `GenerateContentResponse`
//!
//! ## Stream Accumulation
//!
//! The `StreamAccumulator` combines multiple streaming chunks into a single response:
//! - Concatenates text parts from candidates
//! - Merges usage metadata (using the final chunk's values)
//! - Preserves the last finish reason and safety ratings
//!
//! ## Example
//!
//! ```rust,no_run
//! use integrations_gemini::streaming::{GeminiChunkParser, StreamAccumulator};
//! use futures::StreamExt;
//!
//! async fn process_stream(byte_stream: impl futures::Stream<Item = Result<bytes::Bytes, integrations_gemini::GeminiError>>) {
//!     // Parse the chunked JSON stream
//!     let mut parser = GeminiChunkParser::new(Box::pin(byte_stream));
//!
//!     // Accumulate chunks into a single response
//!     let mut accumulator = StreamAccumulator::new();
//!
//!     while let Some(result) = parser.next().await {
//!         match result {
//!             Ok(chunk) => accumulator.add_chunk(chunk),
//!             Err(e) => eprintln!("Error: {:?}", e),
//!         }
//!     }
//!
//!     let final_response = accumulator.finalize();
//! }
//! ```

mod accumulator;
mod chunked_json;

pub use accumulator::StreamAccumulator;
pub use chunked_json::GeminiChunkParser;
