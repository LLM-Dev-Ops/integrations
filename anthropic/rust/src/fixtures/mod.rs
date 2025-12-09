//! Test fixtures and helper data.
//!
//! This module provides common test data and fixtures used across test suites.

use crate::types::{Role, StopReason, Usage};
use serde_json::json;

/// Sample API key for testing
pub const TEST_API_KEY: &str = "sk-ant-test123456789012345";

/// Sample model ID
pub const TEST_MODEL: &str = "claude-3-5-sonnet-20241022";

/// Sample message content
pub const TEST_MESSAGE_CONTENT: &str = "Hello, Claude!";

/// Create a sample Usage struct
pub fn sample_usage() -> Usage {
    Usage {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: None,
        cache_read_input_tokens: None,
    }
}

/// Create a sample message response JSON
pub fn sample_message_response() -> serde_json::Value {
    json!({
        "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
        "type": "message",
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": "Hello! How can I assist you today?"
            }
        ],
        "model": TEST_MODEL,
        "stop_reason": "end_turn",
        "stop_sequence": null,
        "usage": {
            "input_tokens": 10,
            "output_tokens": 20
        }
    })
}

/// Create a sample error response JSON
pub fn sample_error_response(error_type: &str, message: &str) -> serde_json::Value {
    json!({
        "type": "error",
        "error": {
            "type": error_type,
            "message": message
        }
    })
}

/// Create a sample streaming event
pub fn sample_sse_event(event_type: &str, data: serde_json::Value) -> String {
    format!(
        "event: {}\ndata: {}\n\n",
        event_type,
        serde_json::to_string(&data).unwrap()
    )
}

/// Create a sample message start event
pub fn sample_message_start_event() -> String {
    sample_sse_event(
        "message_start",
        json!({
            "type": "message_start",
            "message": {
                "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": TEST_MODEL,
                "stop_reason": null,
                "stop_sequence": null,
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 0
                }
            }
        }),
    )
}

/// Create a sample content block delta event
pub fn sample_content_block_delta_event(text: &str) -> String {
    sample_sse_event(
        "content_block_delta",
        json!({
            "type": "content_block_delta",
            "index": 0,
            "delta": {
                "type": "text_delta",
                "text": text
            }
        }),
    )
}

/// Create a sample message delta event
pub fn sample_message_delta_event() -> String {
    sample_sse_event(
        "message_delta",
        json!({
            "type": "message_delta",
            "delta": {
                "stop_reason": "end_turn",
                "stop_sequence": null
            },
            "usage": {
                "output_tokens": 20
            }
        }),
    )
}

/// Create a sample models list response
pub fn sample_models_response() -> serde_json::Value {
    json!({
        "data": [
            {
                "id": "claude-3-5-sonnet-20241022",
                "type": "model",
                "display_name": "Claude 3.5 Sonnet",
                "created_at": "2024-10-22T00:00:00Z"
            },
            {
                "id": "claude-3-opus-20240229",
                "type": "model",
                "display_name": "Claude 3 Opus",
                "created_at": "2024-02-29T00:00:00Z"
            }
        ]
    })
}

/// Create a sample model info response
pub fn sample_model_info() -> serde_json::Value {
    json!({
        "id": "claude-3-5-sonnet-20241022",
        "type": "model",
        "display_name": "Claude 3.5 Sonnet",
        "created_at": "2024-10-22T00:00:00Z"
    })
}

/// Create a sample batch response
pub fn sample_batch() -> serde_json::Value {
    json!({
        "id": "batch_01ABC123DEF456",
        "type": "message_batch",
        "processing_status": "in_progress",
        "request_counts": {
            "succeeded": 0,
            "errored": 0,
            "expired": 0,
            "canceled": 0
        },
        "created_at": "2024-01-01T00:00:00Z",
        "expires_at": "2024-01-02T00:00:00Z"
    })
}

/// Create a sample completed batch response
pub fn sample_completed_batch() -> serde_json::Value {
    json!({
        "id": "batch_01ABC123DEF456",
        "type": "message_batch",
        "processing_status": "ended",
        "request_counts": {
            "succeeded": 8,
            "errored": 2,
            "expired": 0,
            "canceled": 0
        },
        "created_at": "2024-01-01T00:00:00Z",
        "expires_at": "2024-01-02T00:00:00Z",
        "ended_at": "2024-01-01T01:30:00Z",
        "results_url": "https://api.anthropic.com/v1/messages/batches/batch_01ABC123DEF456/results"
    })
}

/// Create a sample batch list response
pub fn sample_batch_list() -> serde_json::Value {
    json!({
        "data": [
            {
                "id": "batch_01ABC123DEF456",
                "type": "message_batch",
                "processing_status": "in_progress",
                "request_counts": {
                    "succeeded": 0,
                    "errored": 0,
                    "expired": 0,
                    "canceled": 0
                },
                "created_at": "2024-01-01T00:00:00Z",
                "expires_at": "2024-01-02T00:00:00Z"
            },
            {
                "id": "batch_02XYZ789GHI012",
                "type": "message_batch",
                "processing_status": "ended",
                "request_counts": {
                    "succeeded": 10,
                    "errored": 0,
                    "expired": 0,
                    "canceled": 0
                },
                "created_at": "2023-12-31T00:00:00Z",
                "expires_at": "2024-01-01T00:00:00Z",
                "ended_at": "2023-12-31T01:00:00Z",
                "results_url": "https://api.anthropic.com/v1/messages/batches/batch_02XYZ789GHI012/results"
            }
        ],
        "has_more": false,
        "first_id": "batch_01ABC123DEF456",
        "last_id": "batch_02XYZ789GHI012"
    })
}

/// Create a sample batch results JSONL response
pub fn sample_batch_results_jsonl() -> String {
    r#"{"custom_id":"req1","type":"succeeded","message":{"id":"msg_01XFDUDYJgAACzvnptvVoYEL","type":"message","role":"assistant","content":[{"type":"text","text":"Hello! How can I assist you today?"}],"model":"claude-3-5-sonnet-20241022","stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":20}}}
{"custom_id":"req2","type":"succeeded","message":{"id":"msg_02ABCdefGHI123jklMNO456","type":"message","role":"assistant","content":[{"type":"text","text":"Hi there!"}],"model":"claude-3-5-sonnet-20241022","stop_reason":"end_turn","usage":{"input_tokens":8,"output_tokens":5}}}
{"custom_id":"req3","type":"errored","error":{"type":"invalid_request_error","message":"Invalid request parameters"}}"#.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_usage() {
        let usage = sample_usage();
        assert_eq!(usage.input_tokens, 10);
        assert_eq!(usage.output_tokens, 20);
        assert_eq!(usage.total_tokens(), 30);
    }

    #[test]
    fn test_sample_message_response() {
        let response = sample_message_response();
        assert_eq!(response["type"], "message");
        assert_eq!(response["model"], TEST_MODEL);
    }

    #[test]
    fn test_sample_sse_event() {
        let event = sample_sse_event("test", json!({"key": "value"}));
        assert!(event.starts_with("event: test\n"));
        assert!(event.contains("data: "));
    }
}
