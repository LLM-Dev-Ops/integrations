//! Image generation fixtures

use serde_json::json;

/// Sample image generation response with URLs
pub fn image_generation_response() -> serde_json::Value {
    json!({
        "created": 1677610602,
        "data": [{
            "url": "https://example.com/image1.png"
        }]
    })
}

/// Sample image generation response with base64 data
pub fn image_generation_response_b64() -> serde_json::Value {
    json!({
        "created": 1677610602,
        "data": [{
            "b64_json": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        }]
    })
}

/// Sample image edit response
pub fn image_edit_response() -> serde_json::Value {
    json!({
        "created": 1677610602,
        "data": [{
            "url": "https://example.com/edited_image.png"
        }]
    })
}

/// Sample image variation response
pub fn image_variation_response() -> serde_json::Value {
    json!({
        "created": 1677610602,
        "data": [{
            "url": "https://example.com/variation1.png"
        }]
    })
}
