//! Audio transcription and translation types.

use serde::{Deserialize, Serialize};

use crate::errors::GroqError;

/// Audio transcription request.
#[derive(Debug, Clone)]
pub struct TranscriptionRequest {
    /// Audio file data.
    pub file: Vec<u8>,

    /// Audio file name.
    pub filename: String,

    /// Model ID (required).
    pub model: String,

    /// Language code (ISO 639-1).
    pub language: Option<String>,

    /// Prompt to guide transcription.
    pub prompt: Option<String>,

    /// Response format.
    pub response_format: Option<AudioFormat>,

    /// Temperature (0.0-1.0).
    pub temperature: Option<f32>,

    /// Timestamp granularities.
    pub timestamp_granularities: Option<Vec<Granularity>>,
}

impl TranscriptionRequest {
    /// Creates a new transcription request.
    pub fn new(file: Vec<u8>, filename: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            file,
            filename: filename.into(),
            model: model.into(),
            language: None,
            prompt: None,
            response_format: None,
            temperature: None,
            timestamp_granularities: None,
        }
    }

    /// Creates a new builder.
    pub fn builder() -> TranscriptionRequestBuilder {
        TranscriptionRequestBuilder::new()
    }

    /// Validates the request.
    pub fn validate(&self) -> Result<(), GroqError> {
        if self.file.is_empty() {
            return Err(GroqError::validation_param(
                "Audio file is required",
                "file",
                None,
            ));
        }

        if self.model.is_empty() {
            return Err(GroqError::validation_param(
                "Model is required",
                "model",
                None,
            ));
        }

        if let Some(temp) = self.temperature {
            if !(0.0..=1.0).contains(&temp) {
                return Err(GroqError::validation_param(
                    "Temperature must be between 0.0 and 1.0",
                    "temperature",
                    Some(temp.to_string()),
                ));
            }
        }

        Ok(())
    }
}

/// Transcription request builder.
#[derive(Debug, Default)]
pub struct TranscriptionRequestBuilder {
    file: Option<Vec<u8>>,
    filename: Option<String>,
    model: Option<String>,
    language: Option<String>,
    prompt: Option<String>,
    response_format: Option<AudioFormat>,
    temperature: Option<f32>,
    timestamp_granularities: Option<Vec<Granularity>>,
}

impl TranscriptionRequestBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the audio file.
    pub fn file(mut self, file: Vec<u8>, filename: impl Into<String>) -> Self {
        self.file = Some(file);
        self.filename = Some(filename.into());
        self
    }

    /// Sets the model.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Sets the language.
    pub fn language(mut self, language: impl Into<String>) -> Self {
        self.language = Some(language.into());
        self
    }

    /// Sets the prompt.
    pub fn prompt(mut self, prompt: impl Into<String>) -> Self {
        self.prompt = Some(prompt.into());
        self
    }

    /// Sets the response format.
    pub fn response_format(mut self, format: AudioFormat) -> Self {
        self.response_format = Some(format);
        self
    }

    /// Sets the temperature.
    pub fn temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp);
        self
    }

    /// Sets timestamp granularities.
    pub fn timestamp_granularities(mut self, granularities: Vec<Granularity>) -> Self {
        self.timestamp_granularities = Some(granularities);
        self
    }

    /// Enables word timestamps.
    pub fn word_timestamps(mut self) -> Self {
        self.timestamp_granularities
            .get_or_insert_with(Vec::new)
            .push(Granularity::Word);
        self
    }

    /// Enables segment timestamps.
    pub fn segment_timestamps(mut self) -> Self {
        self.timestamp_granularities
            .get_or_insert_with(Vec::new)
            .push(Granularity::Segment);
        self
    }

    /// Builds the request.
    pub fn build(self) -> Result<TranscriptionRequest, GroqError> {
        let file = self.file.ok_or_else(|| {
            GroqError::validation_param("Audio file is required", "file", None)
        })?;

        let filename = self.filename.ok_or_else(|| {
            GroqError::validation_param("Filename is required", "filename", None)
        })?;

        let model = self.model.ok_or_else(|| {
            GroqError::validation_param("Model is required", "model", None)
        })?;

        let request = TranscriptionRequest {
            file,
            filename,
            model,
            language: self.language,
            prompt: self.prompt,
            response_format: self.response_format,
            temperature: self.temperature,
            timestamp_granularities: self.timestamp_granularities,
        };

        request.validate()?;
        Ok(request)
    }
}

/// Audio translation request.
#[derive(Debug, Clone)]
pub struct TranslationRequest {
    /// Audio file data.
    pub file: Vec<u8>,

    /// Audio file name.
    pub filename: String,

    /// Model ID (required).
    pub model: String,

    /// Prompt to guide translation.
    pub prompt: Option<String>,

    /// Response format.
    pub response_format: Option<AudioFormat>,

    /// Temperature (0.0-1.0).
    pub temperature: Option<f32>,
}

impl TranslationRequest {
    /// Creates a new translation request.
    pub fn new(file: Vec<u8>, filename: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            file,
            filename: filename.into(),
            model: model.into(),
            prompt: None,
            response_format: None,
            temperature: None,
        }
    }

    /// Creates a new builder.
    pub fn builder() -> TranslationRequestBuilder {
        TranslationRequestBuilder::new()
    }

    /// Validates the request.
    pub fn validate(&self) -> Result<(), GroqError> {
        if self.file.is_empty() {
            return Err(GroqError::validation_param(
                "Audio file is required",
                "file",
                None,
            ));
        }

        if self.model.is_empty() {
            return Err(GroqError::validation_param(
                "Model is required",
                "model",
                None,
            ));
        }

        if let Some(temp) = self.temperature {
            if !(0.0..=1.0).contains(&temp) {
                return Err(GroqError::validation_param(
                    "Temperature must be between 0.0 and 1.0",
                    "temperature",
                    Some(temp.to_string()),
                ));
            }
        }

        Ok(())
    }
}

/// Translation request builder.
#[derive(Debug, Default)]
pub struct TranslationRequestBuilder {
    file: Option<Vec<u8>>,
    filename: Option<String>,
    model: Option<String>,
    prompt: Option<String>,
    response_format: Option<AudioFormat>,
    temperature: Option<f32>,
}

impl TranslationRequestBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the audio file.
    pub fn file(mut self, file: Vec<u8>, filename: impl Into<String>) -> Self {
        self.file = Some(file);
        self.filename = Some(filename.into());
        self
    }

    /// Sets the model.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Sets the prompt.
    pub fn prompt(mut self, prompt: impl Into<String>) -> Self {
        self.prompt = Some(prompt.into());
        self
    }

    /// Sets the response format.
    pub fn response_format(mut self, format: AudioFormat) -> Self {
        self.response_format = Some(format);
        self
    }

    /// Sets the temperature.
    pub fn temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp);
        self
    }

    /// Builds the request.
    pub fn build(self) -> Result<TranslationRequest, GroqError> {
        let file = self.file.ok_or_else(|| {
            GroqError::validation_param("Audio file is required", "file", None)
        })?;

        let filename = self.filename.ok_or_else(|| {
            GroqError::validation_param("Filename is required", "filename", None)
        })?;

        let model = self.model.ok_or_else(|| {
            GroqError::validation_param("Model is required", "model", None)
        })?;

        let request = TranslationRequest {
            file,
            filename,
            model,
            prompt: self.prompt,
            response_format: self.response_format,
            temperature: self.temperature,
        };

        request.validate()?;
        Ok(request)
    }
}

/// Audio response format.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioFormat {
    /// JSON format with full structure.
    Json,
    /// Plain text.
    Text,
    /// SRT subtitles.
    Srt,
    /// Verbose JSON with timestamps.
    VerboseJson,
    /// VTT subtitles.
    Vtt,
}

impl AudioFormat {
    /// Returns the string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Text => "text",
            Self::Srt => "srt",
            Self::VerboseJson => "verbose_json",
            Self::Vtt => "vtt",
        }
    }
}

/// Timestamp granularity.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Granularity {
    /// Word-level timestamps.
    Word,
    /// Segment-level timestamps.
    Segment,
}

impl Granularity {
    /// Returns the string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Word => "word",
            Self::Segment => "segment",
        }
    }
}

/// Transcription/translation response.
#[derive(Debug, Clone, Deserialize)]
pub struct TranscriptionResponse {
    /// Transcribed text.
    pub text: String,

    /// Task type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,

    /// Language code.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,

    /// Duration in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,

    /// Segments with timestamps.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<Segment>>,

    /// Words with timestamps.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<Word>>,
}

/// Translation response (same structure as transcription).
pub type TranslationResponse = TranscriptionResponse;

/// Audio segment with timestamps.
#[derive(Debug, Clone, Deserialize)]
pub struct Segment {
    /// Segment ID.
    pub id: u32,

    /// Seek position.
    pub seek: u32,

    /// Start time in seconds.
    pub start: f64,

    /// End time in seconds.
    pub end: f64,

    /// Segment text.
    pub text: String,

    /// Token IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<Vec<i32>>,

    /// Average log probability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_logprob: Option<f64>,

    /// Compression ratio.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression_ratio: Option<f64>,

    /// No speech probability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_speech_prob: Option<f64>,
}

/// Word with timestamps.
#[derive(Debug, Clone, Deserialize)]
pub struct Word {
    /// Word text.
    pub word: String,

    /// Start time in seconds.
    pub start: f64,

    /// End time in seconds.
    pub end: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transcription_request_builder() {
        let request = TranscriptionRequest::builder()
            .file(vec![1, 2, 3], "audio.mp3")
            .model("whisper-large-v3")
            .language("en")
            .response_format(AudioFormat::Json)
            .build()
            .unwrap();

        assert_eq!(request.filename, "audio.mp3");
        assert_eq!(request.model, "whisper-large-v3");
        assert_eq!(request.language, Some("en".to_string()));
    }

    #[test]
    fn test_transcription_request_validation_no_file() {
        let result = TranscriptionRequest::builder()
            .file(vec![], "audio.mp3")
            .model("whisper-large-v3")
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_transcription_request_validation_invalid_temp() {
        let result = TranscriptionRequest::builder()
            .file(vec![1, 2, 3], "audio.mp3")
            .model("whisper-large-v3")
            .temperature(1.5)
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_translation_request_builder() {
        let request = TranslationRequest::builder()
            .file(vec![1, 2, 3], "audio.mp3")
            .model("whisper-large-v3")
            .build()
            .unwrap();

        assert_eq!(request.filename, "audio.mp3");
        assert_eq!(request.model, "whisper-large-v3");
    }

    #[test]
    fn test_audio_format_as_str() {
        assert_eq!(AudioFormat::Json.as_str(), "json");
        assert_eq!(AudioFormat::VerboseJson.as_str(), "verbose_json");
        assert_eq!(AudioFormat::Srt.as_str(), "srt");
    }

    #[test]
    fn test_transcription_response_parsing() {
        let json = r#"{
            "text": "Hello, world!",
            "task": "transcribe",
            "language": "en",
            "duration": 2.5
        }"#;

        let response: TranscriptionResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.text, "Hello, world!");
        assert_eq!(response.language, Some("en".to_string()));
        assert_eq!(response.duration, Some(2.5));
    }
}
