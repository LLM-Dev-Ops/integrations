//! Unit tests for audio service

use super::*;
use crate::errors::OpenAIError;
use crate::fixtures::*;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use bytes::Bytes;
use http::Method;
use std::sync::Arc;

fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> AudioServiceImpl {
    AudioServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

#[tokio::test]
async fn test_transcription_success() {
    let mock_transport = MockHttpTransport::new()
        .with_file_upload_response(Ok(transcription_response()));

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = TranscriptionRequest {
        file: Bytes::from("audio data"),
        filename: "audio.mp3".to_string(),
        model: "whisper-1".to_string(),
        language: None,
        prompt: None,
        response_format: None,
        temperature: None,
        timestamp_granularities: None,
    };

    let result = service.transcribe(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert!(response.text.contains("transcription"));
}

#[tokio::test]
async fn test_translation_success() {
    let mock_transport = MockHttpTransport::new()
        .with_file_upload_response(Ok(translation_response()));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = TranslationRequest {
        file: Bytes::from("audio data"),
        filename: "audio.mp3".to_string(),
        model: "whisper-1".to_string(),
        prompt: None,
        response_format: None,
        temperature: None,
    };

    let result = service.translate(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_speech_generation_success() {
    let mock_transport = MockHttpTransport::new()
        .with_file_download_response(Ok(Bytes::from(speech_audio_bytes())));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = SpeechRequest {
        model: "tts-1".to_string(),
        input: "Hello world".to_string(),
        voice: "alloy".to_string(),
        response_format: None,
        speed: None,
    };

    let result = service.create_speech(request).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_transcription_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = TranscriptionRequest {
        file: Bytes::from("test"),
        filename: "test.mp3".to_string(),
        model: "whisper-1".to_string(),
        language: None,
        prompt: None,
        response_format: None,
        temperature: None,
        timestamp_granularities: None,
    };

    let result = service.transcribe(request).await;
    assert!(result.is_err());
}
