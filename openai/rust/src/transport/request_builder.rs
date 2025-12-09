use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use http::{HeaderMap, HeaderName, HeaderValue, Method};
use serde::Serialize;
use std::str::FromStr;

pub struct RequestBuilder {
    method: Method,
    path: String,
    headers: HeaderMap,
    query_params: Vec<(String, String)>,
    body: Option<serde_json::Value>,
}

impl RequestBuilder {
    pub fn new(method: Method, path: impl Into<String>) -> Self {
        Self {
            method,
            path: path.into(),
            headers: HeaderMap::new(),
            query_params: Vec::new(),
            body: None,
        }
    }

    pub fn get(path: impl Into<String>) -> Self {
        Self::new(Method::GET, path)
    }

    pub fn post(path: impl Into<String>) -> Self {
        Self::new(Method::POST, path)
    }

    pub fn delete(path: impl Into<String>) -> Self {
        Self::new(Method::DELETE, path)
    }

    pub fn header(mut self, name: impl AsRef<str>, value: impl AsRef<str>) -> OpenAIResult<Self> {
        let header_name = HeaderName::from_str(name.as_ref()).map_err(|e| {
            OpenAIError::Validation(ValidationError::InvalidParameter {
                parameter: "header_name".to_string(),
                reason: e.to_string(),
            })
        })?;

        let header_value = HeaderValue::from_str(value.as_ref()).map_err(|e| {
            OpenAIError::Validation(ValidationError::InvalidParameter {
                parameter: "header_value".to_string(),
                reason: e.to_string(),
            })
        })?;

        self.headers.insert(header_name, header_value);
        Ok(self)
    }

    pub fn query(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.query_params.push((key.into(), value.into()));
        self
    }

    pub fn content_type(self, content_type: &str) -> OpenAIResult<Self> {
        self.header("Content-Type", content_type)
    }

    pub fn json_content_type(self) -> OpenAIResult<Self> {
        self.content_type("application/json")
    }

    pub fn json<T: Serialize>(mut self, body: &T) -> OpenAIResult<Self> {
        let value = serde_json::to_value(body).map_err(|e| {
            OpenAIError::Validation(ValidationError::InvalidParameter {
                parameter: "body".to_string(),
                reason: format!("Failed to serialize JSON: {}", e),
            })
        })?;
        self.body = Some(value);
        Ok(self)
    }

    pub fn build(self) -> (Method, String, HeaderMap, Option<serde_json::Value>) {
        (self.method, self.build_path(), self.headers, self.body)
    }

    pub fn build_path(&self) -> String {
        if self.query_params.is_empty() {
            self.path.clone()
        } else {
            let query_string = self
                .query_params
                .iter()
                .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
                .collect::<Vec<_>>()
                .join("&");
            format!("{}?{}", self.path, query_string)
        }
    }

    pub fn method(&self) -> &Method {
        &self.method
    }

    pub fn headers(&self) -> &HeaderMap {
        &self.headers
    }
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_path_no_query() {
        let builder = RequestBuilder::get("/models");
        assert_eq!(builder.build_path(), "/models");
    }

    #[test]
    fn test_build_path_with_query() {
        let builder = RequestBuilder::get("/models")
            .query("limit", "10")
            .query("after", "model-123");
        assert!(builder.build_path().contains("limit=10"));
        assert!(builder.build_path().contains("after=model-123"));
    }

    #[test]
    fn test_header() {
        let builder = RequestBuilder::get("/models")
            .header("X-Custom", "value")
            .unwrap();
        assert_eq!(builder.headers().get("X-Custom").unwrap(), "value");
    }
}
