//! Model fixtures

use serde_json::json;

/// Sample list models response
pub fn list_models_response() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [
            {
                "id": "gpt-4-0613",
                "object": "model",
                "created": 1686935002,
                "owned_by": "openai"
            },
            {
                "id": "gpt-3.5-turbo-0613",
                "object": "model",
                "created": 1677610602,
                "owned_by": "openai"
            }
        ]
    })
}

/// Sample retrieve model response
pub fn retrieve_model_response() -> serde_json::Value {
    json!({
        "id": "gpt-4-0613",
        "object": "model",
        "created": 1686935002,
        "owned_by": "openai"
    })
}
