mod http_transport;
mod multipart;
mod request_builder;
mod response_parser;
mod stream_handler;

pub use http_transport::{HttpTransport, ReqwestTransport};
pub use multipart::{MultipartBuilder, MultipartForm};
pub use request_builder::RequestBuilder;
pub use response_parser::ResponseParser;
pub use stream_handler::{SseEvent, SseStream, StreamHandler, StreamResponse};

use crate::errors::OpenAIResult;
use async_trait::async_trait;
use bytes::Bytes;
use futures::Stream;
use http::{HeaderMap, Method};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::pin::Pin;

pub type BoxStream<T> = Pin<Box<dyn Stream<Item = OpenAIResult<T>> + Send>>;

#[async_trait]
pub trait HttpTransport: Send + Sync {
    async fn request<T, R>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<R>
    where
        T: Serialize + Send + Sync,
        R: DeserializeOwned;

    async fn request_stream<T, R>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<BoxStream<R>>
    where
        T: Serialize + Send + Sync,
        R: DeserializeOwned + Send + 'static;

    async fn upload_file(
        &self,
        path: &str,
        file_data: Bytes,
        file_name: &str,
        purpose: &str,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<serde_json::Value>;

    async fn download_file(&self, path: &str, headers: Option<HeaderMap>) -> OpenAIResult<Bytes>;

    async fn request_raw<R>(
        &self,
        method: Method,
        path: &str,
        body: Bytes,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<R>
    where
        R: DeserializeOwned;

    async fn request_bytes<T>(
        &self,
        method: Method,
        path: &str,
        body: Option<&T>,
        headers: Option<HeaderMap>,
    ) -> OpenAIResult<Bytes>
    where
        T: Serialize + Send + Sync;
}
