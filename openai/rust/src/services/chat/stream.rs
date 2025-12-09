use crate::errors::{OpenAIError, OpenAIResult};
use crate::services::chat::{ChatCompletionChunk, ChatMessage, ChatMessageRole};
use bytes::Bytes;
use futures::Stream;
use pin_project_lite::pin_project;
use std::pin::Pin;
use std::task::{Context, Poll};

pin_project! {
    pub struct ChatCompletionStream {
        #[pin]
        inner: Pin<Box<dyn Stream<Item = Result<ChatCompletionChunk, OpenAIError>> + Send>>,
    }
}

impl ChatCompletionStream {
    pub fn new<S>(stream: S) -> Self
    where
        S: Stream<Item = Result<Bytes, OpenAIError>> + Send + 'static,
    {
        let parsed_stream = futures::stream::unfold(
            (stream, String::new()),
            |(mut stream, mut buffer)| async move {
                use futures::StreamExt;

                loop {
                    match stream.next().await {
                        Some(Ok(bytes)) => {
                            buffer.push_str(&String::from_utf8_lossy(&bytes));

                            while let Some(pos) = buffer.find("\n\n") {
                                let event = buffer[..pos].to_string();
                                buffer = buffer[pos + 2..].to_string();

                                if let Some(data) = event.strip_prefix("data: ") {
                                    let data = data.trim();
                                    if data == "[DONE]" {
                                        return None;
                                    }
                                    match serde_json::from_str::<ChatCompletionChunk>(data) {
                                        Ok(chunk) => return Some((Ok(chunk), (stream, buffer))),
                                        Err(e) => return Some((Err(OpenAIError::Deserialization(e.to_string())), (stream, buffer))),
                                    }
                                }
                            }
                        }
                        Some(Err(e)) => return Some((Err(e), (stream, buffer))),
                        None => return None,
                    }
                }
            },
        );

        Self {
            inner: Box::pin(parsed_stream),
        }
    }

    pub async fn collect_content(mut self) -> OpenAIResult<String> {
        use futures::StreamExt;
        let mut content = String::new();
        while let Some(result) = self.next().await {
            let chunk = result?;
            for choice in chunk.choices {
                if let Some(c) = choice.delta.content {
                    content.push_str(&c);
                }
            }
        }
        Ok(content)
    }
}

impl Stream for ChatCompletionStream {
    type Item = Result<ChatCompletionChunk, OpenAIError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.project().inner.poll_next(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<ChatCompletionStream>();
    }
}
