use bytes::Bytes;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioResponseFormat {
    Json,
    Text,
    Srt,
    #[serde(rename = "verbose_json")]
    VerboseJson,
    Vtt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpeechVoice {
    Alloy,
    Echo,
    Fable,
    Onyx,
    Nova,
    Shimmer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpeechResponseFormat {
    Mp3,
    Opus,
    Aac,
    Flac,
    Wav,
    Pcm,
}

#[derive(Debug, Clone)]
pub struct TranscriptionRequest {
    pub file: Bytes,
    pub filename: String,
    pub model: String,
    pub language: Option<String>,
    pub prompt: Option<String>,
    pub response_format: Option<AudioResponseFormat>,
    pub temperature: Option<f32>,
    pub timestamp_granularities: Option<Vec<String>>,
}

impl TranscriptionRequest {
    pub fn new(file: Bytes, filename: impl Into<String>) -> Self {
        Self {
            file,
            filename: filename.into(),
            model: "whisper-1".to_string(),
            language: None,
            prompt: None,
            response_format: None,
            temperature: None,
            timestamp_granularities: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TranslationRequest {
    pub file: Bytes,
    pub filename: String,
    pub model: String,
    pub prompt: Option<String>,
    pub response_format: Option<AudioResponseFormat>,
    pub temperature: Option<f32>,
}

impl TranslationRequest {
    pub fn new(file: Bytes, filename: impl Into<String>) -> Self {
        Self {
            file,
            filename: filename.into(),
            model: "whisper-1".to_string(),
            prompt: None,
            response_format: None,
            temperature: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SpeechRequest {
    pub model: String,
    pub input: String,
    pub voice: SpeechVoice,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<SpeechResponseFormat>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
}

impl SpeechRequest {
    pub fn new(input: impl Into<String>, voice: SpeechVoice) -> Self {
        Self {
            model: "tts-1".to_string(),
            input: input.into(),
            voice,
            response_format: None,
            speed: None,
        }
    }

    pub fn with_hd(mut self) -> Self {
        self.model = "tts-1-hd".to_string();
        self
    }

    pub fn with_speed(mut self, speed: f32) -> Self {
        self.speed = Some(speed);
        self
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TranscriptionResponse {
    pub text: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<Word>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<Segment>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Word {
    pub word: String,
    pub start: f32,
    pub end: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Segment {
    pub id: u32,
    pub seek: u32,
    pub start: f32,
    pub end: f32,
    pub text: String,
    pub tokens: Vec<u32>,
    pub temperature: f32,
    pub avg_logprob: f32,
    pub compression_ratio: f32,
    pub no_speech_prob: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speech_request() {
        let request = SpeechRequest::new("Hello world", SpeechVoice::Alloy)
            .with_speed(1.0);

        assert_eq!(request.model, "tts-1");
        assert_eq!(request.voice, SpeechVoice::Alloy);
    }

    #[test]
    fn test_transcription_request() {
        let request = TranscriptionRequest::new(Bytes::from("test"), "audio.mp3");
        assert_eq!(request.model, "whisper-1");
        assert_eq!(request.filename, "audio.mp3");
    }
}
