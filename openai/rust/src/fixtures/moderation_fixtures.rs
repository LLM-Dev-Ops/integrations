//! Moderation fixtures

use serde_json::json;

/// Sample moderation response (safe content)
pub fn moderation_response_safe() -> serde_json::Value {
    json!({
        "id": "modr-5MWoLO",
        "model": "text-moderation-007",
        "results": [{
            "flagged": false,
            "categories": {
                "sexual": false,
                "hate": false,
                "harassment": false,
                "self-harm": false,
                "sexual/minors": false,
                "hate/threatening": false,
                "violence/graphic": false,
                "self-harm/intent": false,
                "self-harm/instructions": false,
                "harassment/threatening": false,
                "violence": false
            },
            "category_scores": {
                "sexual": 0.00001,
                "hate": 0.00001,
                "harassment": 0.00001,
                "self-harm": 0.00001,
                "sexual/minors": 0.00001,
                "hate/threatening": 0.00001,
                "violence/graphic": 0.00001,
                "self-harm/intent": 0.00001,
                "self-harm/instructions": 0.00001,
                "harassment/threatening": 0.00001,
                "violence": 0.00001
            }
        }]
    })
}

/// Sample moderation response (flagged content)
pub fn moderation_response_flagged() -> serde_json::Value {
    json!({
        "id": "modr-5MWoLP",
        "model": "text-moderation-007",
        "results": [{
            "flagged": true,
            "categories": {
                "sexual": false,
                "hate": true,
                "harassment": true,
                "self-harm": false,
                "sexual/minors": false,
                "hate/threatening": true,
                "violence/graphic": false,
                "self-harm/intent": false,
                "self-harm/instructions": false,
                "harassment/threatening": true,
                "violence": false
            },
            "category_scores": {
                "sexual": 0.00001,
                "hate": 0.95,
                "harassment": 0.92,
                "self-harm": 0.00001,
                "sexual/minors": 0.00001,
                "hate/threatening": 0.88,
                "violence/graphic": 0.00001,
                "self-harm/intent": 0.00001,
                "self-harm/instructions": 0.00001,
                "harassment/threatening": 0.90,
                "violence": 0.00001
            }
        }]
    })
}
