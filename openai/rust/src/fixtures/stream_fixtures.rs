//! SSE stream fixtures

use serde_json::json;

/// Sample SSE chat completion chunk
pub fn chat_stream_chunk() -> serde_json::Value {
    json!({
        "id": "chatcmpl-123",
        "object": "chat.completion.chunk",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "delta": {
                "content": "Hello"
            },
            "finish_reason": null
        }]
    })
}

/// Sample SSE chat completion chunk with finish reason
pub fn chat_stream_chunk_final() -> serde_json::Value {
    json!({
        "id": "chatcmpl-123",
        "object": "chat.completion.chunk",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "delta": {},
            "finish_reason": "stop"
        }]
    })
}

/// Sample SSE chat completion chunk with tool call delta
pub fn chat_stream_chunk_tool_call() -> serde_json::Value {
    json!({
        "id": "chatcmpl-123",
        "object": "chat.completion.chunk",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "delta": {
                "tool_calls": [{
                    "index": 0,
                    "id": "call_abc123",
                    "type": "function",
                    "function": {
                        "name": "get_weather",
                        "arguments": "{\"location\":"
                    }
                }]
            },
            "finish_reason": null
        }]
    })
}

/// Generate a sequence of stream chunks for a complete response
pub fn chat_stream_sequence() -> Vec<serde_json::Value> {
    vec![
        json!({
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1677652288,
            "model": "gpt-4-0613",
            "choices": [{
                "index": 0,
                "delta": {"role": "assistant", "content": ""},
                "finish_reason": null
            }]
        }),
        json!({
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1677652288,
            "model": "gpt-4-0613",
            "choices": [{
                "index": 0,
                "delta": {"content": "Hello"},
                "finish_reason": null
            }]
        }),
        json!({
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1677652288,
            "model": "gpt-4-0613",
            "choices": [{
                "index": 0,
                "delta": {"content": " there!"},
                "finish_reason": null
            }]
        }),
        json!({
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1677652288,
            "model": "gpt-4-0613",
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }]
        }),
    ]
}
