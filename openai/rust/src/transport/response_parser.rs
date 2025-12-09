use crate::errors::{ErrorMapper, OpenAIError, OpenAIErrorResponse, OpenAIResult};
use bytes::Bytes;
use reqwest::Response;
use serde::de::DeserializeOwned;

pub struct ResponseParser;

impl ResponseParser {
    pub async fn parse_response<T: DeserializeOwned>(response: Response) -> OpenAIResult<T> {
        let status = response.status();

        if status.is_success() {
            let body = response.bytes().await?;
            let parsed: T = serde_json::from_slice(&body).map_err(|e| {
                OpenAIError::Deserialization(format!(
                    "Failed to deserialize response: {}. Body: {}",
                    e,
                    String::from_utf8_lossy(&body)
                ))
            })?;
            Ok(parsed)
        } else {
            let headers = response.headers().clone();
            let error_response: Option<OpenAIErrorResponse> = response
                .json()
                .await
                .ok();

            let mut error = ErrorMapper::map_status_code(status.as_u16(), error_response);

            if let Some(retry_after) = ErrorMapper::extract_retry_after(&headers) {
                if let OpenAIError::RateLimit(ref mut rate_limit_error) = error {
                    *rate_limit_error = crate::errors::RateLimitError::TooManyRequests {
                        message: "Too many requests".to_string(),
                        retry_after_secs: Some(retry_after),
                    };
                }
            }

            Err(error)
        }
    }

    pub async fn parse_bytes(response: Response) -> OpenAIResult<Bytes> {
        let status = response.status();

        if status.is_success() {
            Ok(response.bytes().await?)
        } else {
            let error_response: Option<OpenAIErrorResponse> = response.json().await.ok();
            Err(ErrorMapper::map_status_code(
                status.as_u16(),
                error_response,
            ))
        }
    }

    pub fn parse_json<T: DeserializeOwned>(data: &[u8]) -> OpenAIResult<T> {
        serde_json::from_slice(data).map_err(|e| {
            OpenAIError::Deserialization(format!(
                "Failed to deserialize JSON: {}. Data: {}",
                e,
                String::from_utf8_lossy(data)
            ))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_json() {
        #[derive(serde::Deserialize)]
        struct TestStruct {
            message: String,
        }

        let json = br#"{"message": "hello"}"#;
        let result: OpenAIResult<TestStruct> = ResponseParser::parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().message, "hello");
    }

    #[test]
    fn test_parse_json_error() {
        #[derive(serde::Deserialize)]
        struct TestStruct {
            message: String,
        }

        let json = br#"{"invalid": "json"}"#;
        let result: OpenAIResult<TestStruct> = ResponseParser::parse_json(json);
        assert!(result.is_err());
    }
}
