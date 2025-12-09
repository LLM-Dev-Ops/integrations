//! Chat completion fixtures

use serde_json::json;

/// Sample successful chat completion response
pub fn chat_completion_response() -> serde_json::Value {
    json!({
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "Hello! How can I assist you today?"
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 12,
            "total_tokens": 21
        }
    })
}

/// Sample chat completion response with multiple choices
pub fn chat_completion_response_with_multiple_choices() -> serde_json::Value {
    json!({
        "id": "chatcmpl-124",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "First response"
                },
                "finish_reason": "stop"
            },
            {
                "index": 1,
                "message": {
                    "role": "assistant",
                    "content": "Second response"
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 24,
            "total_tokens": 33
        }
    })
}

/// Sample chat completion response with tool calls
pub fn chat_completion_response_with_tool_calls() -> serde_json::Value {
    json!({
        "id": "chatcmpl-125",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": null,
                "tool_calls": [{
                    "id": "call_abc123",
                    "type": "function",
                    "function": {
                        "name": "get_weather",
                        "arguments": "{\"location\": \"San Francisco\", \"unit\": \"celsius\"}"
                    }
                }]
            },
            "finish_reason": "tool_calls"
        }],
        "usage": {
            "prompt_tokens": 82,
            "completion_tokens": 17,
            "total_tokens": 99
        }
    })
}

/// Sample chat completion response with function call (legacy)
pub fn chat_completion_response_with_function_call() -> serde_json::Value {
    json!({
        "id": "chatcmpl-126",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-3.5-turbo-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": null,
                "function_call": {
                    "name": "get_current_weather",
                    "arguments": "{\"location\": \"Boston\", \"unit\": \"fahrenheit\"}"
                }
            },
            "finish_reason": "function_call"
        }],
        "usage": {
            "prompt_tokens": 82,
            "completion_tokens": 18,
            "total_tokens": 100
        }
    })
}

/// Sample chat completion response with length finish reason
pub fn chat_completion_response_with_length_finish() -> serde_json::Value {
    json!({
        "id": "chatcmpl-127",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "This is a truncated response because the max tokens limit was reached"
            },
            "finish_reason": "length"
        }],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 100,
            "total_tokens": 109
        }
    })
}

/// Sample chat completion response with content filter finish reason
pub fn chat_completion_response_with_content_filter() -> serde_json::Value {
    json!({
        "id": "chatcmpl-128",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": ""
            },
            "finish_reason": "content_filter"
        }],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 0,
            "total_tokens": 9
        }
    })
}

/// Sample chat completion response with system fingerprint
pub fn chat_completion_response_with_fingerprint() -> serde_json::Value {
    json!({
        "id": "chatcmpl-129",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "system_fingerprint": "fp_44709d6fcb",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "Hello!"
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 2,
            "total_tokens": 11
        }
    })
}

/// Builder for creating custom chat completion responses
pub struct ChatCompletionResponseBuilder {
    id: String,
    model: String,
    content: String,
    finish_reason: String,
    prompt_tokens: u32,
    completion_tokens: u32,
}

impl ChatCompletionResponseBuilder {
    pub fn new() -> Self {
        Self {
            id: "chatcmpl-test".to_string(),
            model: "gpt-4-0613".to_string(),
            content: "Test response".to_string(),
            finish_reason: "stop".to_string(),
            prompt_tokens: 10,
            completion_tokens: 10,
        }
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = id.into();
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }

    pub fn with_content(mut self, content: impl Into<String>) -> Self {
        self.content = content.into();
        self
    }

    pub fn with_finish_reason(mut self, reason: impl Into<String>) -> Self {
        self.finish_reason = reason.into();
        self
    }

    pub fn with_tokens(mut self, prompt: u32, completion: u32) -> Self {
        self.prompt_tokens = prompt;
        self.completion_tokens = completion;
        self
    }

    pub fn build(self) -> serde_json::Value {
        json!({
            "id": self.id,
            "object": "chat.completion",
            "created": 1677652288,
            "model": self.model,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": self.content
                },
                "finish_reason": self.finish_reason
            }],
            "usage": {
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "total_tokens": self.prompt_tokens + self.completion_tokens
            }
        })
    }
}

impl Default for ChatCompletionResponseBuilder {
    fn default() -> Self {
        Self::new()
    }
}
