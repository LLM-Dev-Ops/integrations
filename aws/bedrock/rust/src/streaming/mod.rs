//! AWS Event Stream parsing for Bedrock streaming responses.
//!
//! This module implements the binary AWS Event Stream format used by Bedrock
//! for streaming model responses.

use crate::error::{BedrockError, StreamError};
use bytes::{Buf, BytesMut};
use crc32c::crc32c;
use std::collections::HashMap;

/// Minimum message size (prelude + prelude CRC + message CRC).
const MIN_MESSAGE_SIZE: usize = 16;

/// AWS Event Stream message.
#[derive(Debug, Clone)]
pub struct EventStreamMessage {
    /// Message headers.
    pub headers: HashMap<String, HeaderValue>,
    /// Message payload.
    pub payload: Vec<u8>,
}

impl EventStreamMessage {
    /// Get a header value as a string.
    pub fn header_str(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|v| v.as_str())
    }

    /// Get the event type.
    pub fn event_type(&self) -> Option<&str> {
        self.header_str(":event-type")
    }

    /// Get the message type.
    pub fn message_type(&self) -> Option<&str> {
        self.header_str(":message-type")
    }

    /// Get the content type.
    pub fn content_type(&self) -> Option<&str> {
        self.header_str(":content-type")
    }

    /// Check if this is an exception message.
    pub fn is_exception(&self) -> bool {
        self.message_type() == Some("exception")
    }

    /// Get the payload as UTF-8 string.
    pub fn payload_str(&self) -> Result<&str, std::str::Utf8Error> {
        std::str::from_utf8(&self.payload)
    }

    /// Parse the payload as JSON.
    pub fn payload_json<T: serde::de::DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_slice(&self.payload)
    }
}

/// Header value types.
#[derive(Debug, Clone)]
pub enum HeaderValue {
    /// Boolean true.
    BoolTrue,
    /// Boolean false.
    BoolFalse,
    /// Byte value.
    Byte(u8),
    /// Short value.
    Short(i16),
    /// Integer value.
    Int(i32),
    /// Long value.
    Long(i64),
    /// Bytes value.
    Bytes(Vec<u8>),
    /// String value.
    String(String),
    /// Timestamp value.
    Timestamp(i64),
    /// UUID value.
    Uuid([u8; 16]),
}

impl HeaderValue {
    /// Get as string if this is a string value.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            HeaderValue::String(s) => Some(s),
            _ => None,
        }
    }
}

/// Event stream parser.
pub struct EventStreamParser {
    buffer: BytesMut,
}

impl EventStreamParser {
    /// Create a new parser.
    pub fn new() -> Self {
        Self {
            buffer: BytesMut::with_capacity(64 * 1024),
        }
    }

    /// Feed bytes into the parser.
    pub fn feed(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
    }

    /// Try to parse the next message from the buffer.
    pub fn next_message(&mut self) -> Result<Option<EventStreamMessage>, BedrockError> {
        // Need at least prelude (8 bytes) + prelude CRC (4 bytes) = 12 bytes to read length
        if self.buffer.len() < 12 {
            return Ok(None);
        }

        // Read total length from first 4 bytes (big-endian)
        let total_len = u32::from_be_bytes([
            self.buffer[0],
            self.buffer[1],
            self.buffer[2],
            self.buffer[3],
        ]) as usize;

        // Validate minimum size
        if total_len < MIN_MESSAGE_SIZE {
            return Err(BedrockError::Stream(StreamError::ParseError {
                message: format!("Invalid message length: {}", total_len),
            }));
        }

        // Wait for complete message
        if self.buffer.len() < total_len {
            return Ok(None);
        }

        // Extract the complete message
        let message_bytes = self.buffer.split_to(total_len);

        // Parse the message
        self.parse_message(&message_bytes)
    }

    /// Drain all available messages.
    pub fn drain(&mut self) -> Vec<Result<EventStreamMessage, BedrockError>> {
        let mut messages = Vec::new();
        loop {
            match self.next_message() {
                Ok(Some(msg)) => messages.push(Ok(msg)),
                Ok(None) => break,
                Err(e) => {
                    messages.push(Err(e));
                    break;
                }
            }
        }
        messages
    }

    /// Parse a complete message.
    fn parse_message(&self, data: &[u8]) -> Result<Option<EventStreamMessage>, BedrockError> {
        if data.len() < MIN_MESSAGE_SIZE {
            return Err(BedrockError::Stream(StreamError::ParseError {
                message: "Message too short".to_string(),
            }));
        }

        // Parse prelude
        let total_len = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let headers_len = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;

        // Validate prelude CRC
        let prelude_crc = u32::from_be_bytes([data[8], data[9], data[10], data[11]]);
        let computed_prelude_crc = crc32c(&data[0..8]);
        if prelude_crc != computed_prelude_crc {
            return Err(BedrockError::Stream(StreamError::CrcMismatch));
        }

        // Validate message CRC
        let message_crc = u32::from_be_bytes([
            data[total_len - 4],
            data[total_len - 3],
            data[total_len - 2],
            data[total_len - 1],
        ]);
        let computed_message_crc = crc32c(&data[0..total_len - 4]);
        if message_crc != computed_message_crc {
            return Err(BedrockError::Stream(StreamError::CrcMismatch));
        }

        // Parse headers
        let headers_start = 12;
        let headers_end = headers_start + headers_len;
        let headers = self.parse_headers(&data[headers_start..headers_end])?;

        // Extract payload
        let payload_end = total_len - 4; // Exclude message CRC
        let payload = data[headers_end..payload_end].to_vec();

        Ok(Some(EventStreamMessage { headers, payload }))
    }

    /// Parse headers section.
    fn parse_headers(&self, data: &[u8]) -> Result<HashMap<String, HeaderValue>, BedrockError> {
        let mut headers = HashMap::new();
        let mut pos = 0;

        while pos < data.len() {
            // Read header name length (1 byte)
            if pos >= data.len() {
                break;
            }
            let name_len = data[pos] as usize;
            pos += 1;

            // Read header name
            if pos + name_len > data.len() {
                return Err(BedrockError::Stream(StreamError::ParseError {
                    message: "Header name overflow".to_string(),
                }));
            }
            let name = String::from_utf8_lossy(&data[pos..pos + name_len]).to_string();
            pos += name_len;

            // Read value type (1 byte)
            if pos >= data.len() {
                return Err(BedrockError::Stream(StreamError::ParseError {
                    message: "Missing header value type".to_string(),
                }));
            }
            let value_type = data[pos];
            pos += 1;

            // Parse value based on type
            let value = self.parse_header_value(value_type, data, &mut pos)?;
            headers.insert(name, value);
        }

        Ok(headers)
    }

    /// Parse a header value.
    fn parse_header_value(
        &self,
        value_type: u8,
        data: &[u8],
        pos: &mut usize,
    ) -> Result<HeaderValue, BedrockError> {
        match value_type {
            0 => Ok(HeaderValue::BoolTrue),
            1 => Ok(HeaderValue::BoolFalse),
            2 => {
                if *pos >= data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Byte value overflow".to_string(),
                    }));
                }
                let v = data[*pos];
                *pos += 1;
                Ok(HeaderValue::Byte(v))
            }
            3 => {
                // Short (2 bytes, big-endian)
                if *pos + 2 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Short value overflow".to_string(),
                    }));
                }
                let v = i16::from_be_bytes([data[*pos], data[*pos + 1]]);
                *pos += 2;
                Ok(HeaderValue::Short(v))
            }
            4 => {
                // Int (4 bytes, big-endian)
                if *pos + 4 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Int value overflow".to_string(),
                    }));
                }
                let v = i32::from_be_bytes([data[*pos], data[*pos + 1], data[*pos + 2], data[*pos + 3]]);
                *pos += 4;
                Ok(HeaderValue::Int(v))
            }
            5 => {
                // Long (8 bytes, big-endian)
                if *pos + 8 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Long value overflow".to_string(),
                    }));
                }
                let v = i64::from_be_bytes([
                    data[*pos],
                    data[*pos + 1],
                    data[*pos + 2],
                    data[*pos + 3],
                    data[*pos + 4],
                    data[*pos + 5],
                    data[*pos + 6],
                    data[*pos + 7],
                ]);
                *pos += 8;
                Ok(HeaderValue::Long(v))
            }
            6 => {
                // Bytes (2-byte length + data)
                if *pos + 2 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Bytes length overflow".to_string(),
                    }));
                }
                let len = u16::from_be_bytes([data[*pos], data[*pos + 1]]) as usize;
                *pos += 2;
                if *pos + len > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Bytes value overflow".to_string(),
                    }));
                }
                let v = data[*pos..*pos + len].to_vec();
                *pos += len;
                Ok(HeaderValue::Bytes(v))
            }
            7 => {
                // String (2-byte length + UTF-8 data)
                if *pos + 2 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "String length overflow".to_string(),
                    }));
                }
                let len = u16::from_be_bytes([data[*pos], data[*pos + 1]]) as usize;
                *pos += 2;
                if *pos + len > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "String value overflow".to_string(),
                    }));
                }
                let v = String::from_utf8_lossy(&data[*pos..*pos + len]).to_string();
                *pos += len;
                Ok(HeaderValue::String(v))
            }
            8 => {
                // Timestamp (8 bytes, big-endian)
                if *pos + 8 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "Timestamp value overflow".to_string(),
                    }));
                }
                let v = i64::from_be_bytes([
                    data[*pos],
                    data[*pos + 1],
                    data[*pos + 2],
                    data[*pos + 3],
                    data[*pos + 4],
                    data[*pos + 5],
                    data[*pos + 6],
                    data[*pos + 7],
                ]);
                *pos += 8;
                Ok(HeaderValue::Timestamp(v))
            }
            9 => {
                // UUID (16 bytes)
                if *pos + 16 > data.len() {
                    return Err(BedrockError::Stream(StreamError::ParseError {
                        message: "UUID value overflow".to_string(),
                    }));
                }
                let mut uuid = [0u8; 16];
                uuid.copy_from_slice(&data[*pos..*pos + 16]);
                *pos += 16;
                Ok(HeaderValue::Uuid(uuid))
            }
            _ => Err(BedrockError::Stream(StreamError::ParseError {
                message: format!("Unknown header value type: {}", value_type),
            })),
        }
    }
}

impl Default for EventStreamParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser_new() {
        let parser = EventStreamParser::new();
        assert_eq!(parser.buffer.len(), 0);
    }

    #[test]
    fn test_header_value_as_str() {
        let value = HeaderValue::String("test".to_string());
        assert_eq!(value.as_str(), Some("test"));

        let value = HeaderValue::Int(42);
        assert_eq!(value.as_str(), None);
    }

    #[test]
    fn test_incomplete_message() {
        let mut parser = EventStreamParser::new();
        // Feed incomplete data
        parser.feed(&[0, 0, 0, 100]); // Says message is 100 bytes

        // Should return None as message is incomplete
        let result = parser.next_message();
        assert!(result.unwrap().is_none());
    }
}
