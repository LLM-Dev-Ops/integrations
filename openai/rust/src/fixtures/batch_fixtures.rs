//! Batch API fixtures

use serde_json::json;

/// Sample batch object response (validating)
pub fn batch_response_validating() -> serde_json::Value {
    json!({
        "id": "batch_abc123",
        "object": "batch",
        "endpoint": "/v1/chat/completions",
        "errors": null,
        "input_file_id": "file-abc123",
        "completion_window": "24h",
        "status": "validating",
        "output_file_id": null,
        "error_file_id": null,
        "created_at": 1677610602,
        "in_progress_at": null,
        "expires_at": 1677697002,
        "completed_at": null,
        "failed_at": null,
        "expired_at": null,
        "request_counts": {
            "total": 0,
            "completed": 0,
            "failed": 0
        },
        "metadata": null
    })
}

/// Sample batch object response (completed)
pub fn batch_response_completed() -> serde_json::Value {
    json!({
        "id": "batch_abc123",
        "object": "batch",
        "endpoint": "/v1/chat/completions",
        "errors": null,
        "input_file_id": "file-abc123",
        "completion_window": "24h",
        "status": "completed",
        "output_file_id": "file-output123",
        "error_file_id": null,
        "created_at": 1677610602,
        "in_progress_at": 1677610622,
        "expires_at": 1677697002,
        "completed_at": 1677611202,
        "failed_at": null,
        "expired_at": null,
        "request_counts": {
            "total": 100,
            "completed": 100,
            "failed": 0
        },
        "metadata": {"custom_key": "custom_value"}
    })
}

/// Sample list batches response
pub fn list_batches_response() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [
            {
                "id": "batch_abc123",
                "object": "batch",
                "endpoint": "/v1/chat/completions",
                "status": "completed",
                "created_at": 1677610602
            }
        ],
        "has_more": false
    })
}
