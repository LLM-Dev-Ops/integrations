//! Integration tests for streaming JSON parser.

use integrations_gemini::streaming::GeminiChunkParser;
use integrations_gemini::types::GenerateContentResponse;
use integrations_gemini::error::GeminiError;
use bytes::Bytes;
use futures::stream;
use futures::StreamExt;

#[tokio::test]
async fn test_parse_single_complete_chunk() {
    // Arrange
    let chunk = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":1,"totalTokenCount":6}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
    assert!(responses[0].candidates.is_some());
    let candidates = responses[0].candidates.as_ref().unwrap();
    assert_eq!(candidates.len(), 1);
}

#[tokio::test]
async fn test_parse_multiple_chunks_in_array() {
    // Arrange
    let data = r#"[{"candidates":[{"content":{"parts":[{"text":"First"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":1,"totalTokenCount":6}},
{"candidates":[{"content":{"parts":[{"text":"Second"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":1,"totalTokenCount":6}}]"#;

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(Bytes::from(data))];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 2);
}

#[tokio::test]
async fn test_parse_chunk_boundary_in_json() {
    // Arrange - Split a JSON object across multiple chunks
    let chunk1 = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Hel"#);
    let chunk2 = Bytes::from(r#"lo"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":1,"totalTokenCount":6}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk1), Ok(chunk2)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
    let candidates = responses[0].candidates.as_ref().unwrap();
    assert_eq!(candidates[0].content.parts.len(), 1);
}

#[tokio::test]
async fn test_parse_chunk_with_nested_objects() {
    // Arrange
    let chunk = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Result"}],"role":"model"},"safetyRatings":[{"category":"HARM_CATEGORY_HARASSMENT","probability":"NEGLIGIBLE"}],"citationMetadata":{"citationSources":[]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
    let candidates = responses[0].candidates.as_ref().unwrap();
    assert!(candidates[0].safety_ratings.is_some());
    assert!(candidates[0].citation_metadata.is_some());
}

#[tokio::test]
async fn test_parse_chunk_with_escaped_characters() {
    // Arrange
    let chunk = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Quote: \"Hello\" and backslash: \\"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":10}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
}

#[tokio::test]
async fn test_parse_multiple_chunks_streamed_separately() {
    // Arrange - Simulate real streaming where chunks arrive separately
    let chunk1 = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"First"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":6}},"#);
    let chunk2 = Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":"Second"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":7}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk1), Ok(chunk2)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 2);
}

#[tokio::test]
async fn test_parse_empty_stream() {
    // Arrange
    let chunks: Vec<Result<Bytes, GeminiError>> = vec![];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result);
    }

    // Assert
    assert_eq!(responses.len(), 0);
}

#[tokio::test]
async fn test_parse_malformed_json_error() {
    // Arrange - Invalid JSON
    let chunk = Bytes::from(r#"[{"invalid": json"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut has_error = false;
    while let Some(result) = parser.next().await {
        if result.is_err() {
            has_error = true;
            break;
        }
    }

    // Assert
    assert!(has_error, "Expected parsing error for malformed JSON");
}

#[tokio::test]
async fn test_parse_stream_with_whitespace() {
    // Arrange - JSON with extra whitespace
    let chunk = Bytes::from(r#"  [  {"candidates":  [  {"content":{"parts":[{"text":"Hello"}],"role":"model"}}  ]  ,"usageMetadata":{"promptTokenCount":5,"totalTokenCount":6}  }  ]  "#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
}

#[tokio::test]
async fn test_parse_chunk_with_commas() {
    // Arrange - Multiple chunks with comma separators
    let data = r#"[{"candidates":[{"content":{"parts":[{"text":"One"}],"role":"model"}}]},{"candidates":[{"content":{"parts":[{"text":"Two"}],"role":"model"}}]},{"candidates":[{"content":{"parts":[{"text":"Three"}],"role":"model"}}]}]"#;

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(Bytes::from(data))];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 3);
}

#[tokio::test]
async fn test_parse_incremental_chunks() {
    // Arrange - Very small incremental chunks
    let chunk1 = Bytes::from(r#"[{"#);
    let chunk2 = Bytes::from(r#""candidates""#);
    let chunk3 = Bytes::from(r#":[{"content":"#);
    let chunk4 = Bytes::from(r#"{"parts":[{"text":"Hello"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":6}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![
        Ok(chunk1),
        Ok(chunk2),
        Ok(chunk3),
        Ok(chunk4),
    ];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
}

#[tokio::test]
async fn test_parse_chunk_with_nested_arrays() {
    // Arrange
    let chunk = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Test"}],"role":"model"},"safetyRatings":[{"category":"CAT1","probability":"LOW"},{"category":"CAT2","probability":"NEGLIGIBLE"}]}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":8}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
    let candidates = responses[0].candidates.as_ref().unwrap();
    let safety_ratings = candidates[0].safety_ratings.as_ref().unwrap();
    assert_eq!(safety_ratings.len(), 2);
}

#[tokio::test]
async fn test_parse_transport_error() {
    // Arrange - Stream with transport error
    let chunk1 = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Start"}],"role":"model"}}]},"#);
    let error = GeminiError::Network(integrations_gemini::error::NetworkError::ConnectionFailed {
        message: "Connection lost".to_string(),
    });

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk1), Err(error)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut had_error = false;
    while let Some(result) = parser.next().await {
        if result.is_err() {
            had_error = true;
            break;
        }
    }

    // Assert
    assert!(had_error, "Expected error from transport");
}

#[tokio::test]
async fn test_parse_utf8_content() {
    // Arrange - Test with Unicode characters
    let chunk = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Hello 世界 🌍"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"totalTokenCount":8}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![Ok(chunk)];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 1);
}

#[tokio::test]
async fn test_parse_real_world_streaming_pattern() {
    // Arrange - Simulate realistic Gemini streaming response
    let chunk1 = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"The"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":1,"totalTokenCount":11}},"#);
    let chunk2 = Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":" capital"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":3,"totalTokenCount":13}},"#);
    let chunk3 = Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":" of France"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":6,"totalTokenCount":16}},"#);
    let chunk4 = Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":" is Paris."}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":9,"totalTokenCount":19}}]"#);

    let chunks: Vec<Result<Bytes, GeminiError>> = vec![
        Ok(chunk1),
        Ok(chunk2),
        Ok(chunk3),
        Ok(chunk4),
    ];
    let stream = stream::iter(chunks);
    let mut parser = GeminiChunkParser::new(Box::pin(stream));

    // Act
    let mut responses = Vec::new();
    while let Some(result) = parser.next().await {
        responses.push(result.unwrap());
    }

    // Assert
    assert_eq!(responses.len(), 4);

    // Verify last chunk has finish reason
    assert!(responses[3].candidates.is_some());
    let last_candidate = &responses[3].candidates.as_ref().unwrap()[0];
    assert!(last_candidate.finish_reason.is_some());
}
