use crate::errors::{OpenAIError, OpenAIResult};
use crate::transport::{BoxStream, ResponseParser};
use bytes::Bytes;
use futures::{Stream, StreamExt};
use pin_project_lite::pin_project;
use reqwest::Response;
use serde::de::DeserializeOwned;
use std::pin::Pin;
use std::task::{Context, Poll};

pub struct StreamHandler;

impl StreamHandler {
    pub async fn handle_stream<T>(response: Response) -> OpenAIResult<BoxStream<T>>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let status = response.status();
        if !status.is_success() {
            let error_response = response.json().await.ok();
            return Err(crate::errors::ErrorMapper::map_status_code(
                status.as_u16(),
                error_response,
            ));
        }

        let stream = response.bytes_stream();
        let sse_stream = SseStream::new(stream);
        let parsed_stream = sse_stream.filter_map(|result| async move {
            match result {
                Ok(event) => match event.parse() {
                    Ok(data) => Some(Ok(data)),
                    Err(e) => Some(Err(e)),
                },
                Err(e) => Some(Err(e)),
            }
        });

        Ok(Box::pin(parsed_stream))
    }
}

pin_project! {
    pub struct SseStream<S> {
        #[pin]
        inner: S,
        buffer: Vec<u8>,
    }
}

impl<S> SseStream<S>
where
    S: Stream<Item = Result<Bytes, reqwest::Error>>,
{
    pub fn new(inner: S) -> Self {
        Self {
            inner,
            buffer: Vec::new(),
        }
    }
}

impl<S> Stream for SseStream<S>
where
    S: Stream<Item = Result<Bytes, reqwest::Error>>,
{
    type Item = OpenAIResult<SseEvent>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut this = self.project();

        loop {
            match this.inner.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(chunk))) => {
                    this.buffer.extend_from_slice(&chunk);

                    if let Some(pos) = this.buffer.windows(2).position(|w| w == b"\n\n") {
                        let event_data = this.buffer.drain(..pos + 2).collect::<Vec<_>>();
                        match SseEvent::from_bytes(&event_data) {
                            Ok(event) => return Poll::Ready(Some(Ok(event))),
                            Err(e) => return Poll::Ready(Some(Err(e))),
                        }
                    }
                }
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Some(Err(OpenAIError::from(e))));
                }
                Poll::Ready(None) => {
                    if !this.buffer.is_empty() {
                        let event_data = this.buffer.drain(..).collect::<Vec<_>>();
                        match SseEvent::from_bytes(&event_data) {
                            Ok(event) => return Poll::Ready(Some(Ok(event))),
                            Err(e) => return Poll::Ready(Some(Err(e))),
                        }
                    }
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct SseEvent {
    pub event_type: Option<String>,
    pub data: String,
    pub id: Option<String>,
}

impl SseEvent {
    pub fn from_bytes(bytes: &[u8]) -> OpenAIResult<Self> {
        let text = String::from_utf8_lossy(bytes);
        let mut event_type = None;
        let mut data_lines = Vec::new();
        let mut id = None;

        for line in text.lines() {
            if line.is_empty() {
                continue;
            }

            if let Some(stripped) = line.strip_prefix("event:") {
                event_type = Some(stripped.trim().to_string());
            } else if let Some(stripped) = line.strip_prefix("data:") {
                data_lines.push(stripped.trim());
            } else if let Some(stripped) = line.strip_prefix("id:") {
                id = Some(stripped.trim().to_string());
            }
        }

        let data = data_lines.join("\n");

        Ok(Self {
            event_type,
            data,
            id,
        })
    }

    pub fn parse<T: DeserializeOwned>(&self) -> OpenAIResult<T> {
        if self.data == "[DONE]" {
            return Err(OpenAIError::Stream("Stream completed".to_string()));
        }

        ResponseParser::parse_json(self.data.as_bytes())
    }
}

pub type StreamResponse<T> = BoxStream<T>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_event_from_bytes() {
        let data = b"event: message\ndata: {\"test\": true}\nid: 123\n\n";
        let event = SseEvent::from_bytes(data).unwrap();
        assert_eq!(event.event_type, Some("message".to_string()));
        assert_eq!(event.data, r#"{"test": true}"#);
        assert_eq!(event.id, Some("123".to_string()));
    }

    #[test]
    fn test_sse_event_done() {
        let event = SseEvent {
            event_type: None,
            data: "[DONE]".to_string(),
            id: None,
        };

        #[derive(serde::Deserialize)]
        struct Test {}

        let result: OpenAIResult<Test> = event.parse();
        assert!(result.is_err());
    }
}
