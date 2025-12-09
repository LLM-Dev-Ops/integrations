//! Audio fixtures

use serde_json::json;

/// Sample transcription response
pub fn transcription_response() -> serde_json::Value {
    json!({
        "text": "Hello, this is a transcription of the audio file."
    })
}

/// Sample transcription response with verbose JSON
pub fn transcription_response_verbose() -> serde_json::Value {
    json!({
        "task": "transcribe",
        "language": "en",
        "duration": 5.5,
        "text": "Hello, this is a transcription of the audio file.",
        "segments": [{
            "id": 0,
            "seek": 0,
            "start": 0.0,
            "end": 5.5,
            "text": "Hello, this is a transcription of the audio file.",
            "tokens": [1, 2, 3],
            "temperature": 0.0,
            "avg_logprob": -0.5,
            "compression_ratio": 1.2,
            "no_speech_prob": 0.1
        }]
    })
}

/// Sample translation response
pub fn translation_response() -> serde_json::Value {
    json!({
        "text": "Hello, this is a translation of the audio file."
    })
}

/// Sample speech generation would return audio bytes (not JSON)
/// For testing purposes, we'll use a placeholder
pub fn speech_audio_bytes() -> Vec<u8> {
    vec![0xFF, 0xF3, 0x44, 0xC4] // Minimal MP3 header
}
