//! File fixtures

use serde_json::json;

/// Sample file object response
pub fn file_object_response() -> serde_json::Value {
    json!({
        "id": "file-abc123",
        "object": "file",
        "bytes": 120000,
        "created_at": 1677610602,
        "filename": "mydata.jsonl",
        "purpose": "fine-tune",
        "status": "processed",
        "status_details": null
    })
}

/// Sample list files response
pub fn list_files_response() -> serde_json::Value {
    json!({
        "data": [
            {
                "id": "file-abc123",
                "object": "file",
                "bytes": 120000,
                "created_at": 1677610602,
                "filename": "mydata.jsonl",
                "purpose": "fine-tune"
            },
            {
                "id": "file-xyz789",
                "object": "file",
                "bytes": 85000,
                "created_at": 1677610603,
                "filename": "validation.jsonl",
                "purpose": "fine-tune"
            }
        ],
        "object": "list"
    })
}

/// Sample delete file response
pub fn delete_file_response() -> serde_json::Value {
    json!({
        "id": "file-abc123",
        "object": "file",
        "deleted": true
    })
}
