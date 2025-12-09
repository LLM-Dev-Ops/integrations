use crate::errors::{OpenAIError, OpenAIResult};
use bytes::Bytes;
use reqwest::multipart::{Form, Part};

/// Builder for multipart/form-data requests
pub struct MultipartBuilder {
    form: Form,
}

impl MultipartBuilder {
    pub fn new() -> Self {
        Self { form: Form::new() }
    }

    /// Adds a file part to the multipart form
    pub fn add_file(mut self, field_name: &str, file_name: &str, data: Bytes) -> Self {
        let part = Part::bytes(data.to_vec())
            .file_name(file_name.to_string())
            .mime_str("application/octet-stream")
            .unwrap_or_else(|_| Part::bytes(data.to_vec()));

        self.form = self.form.part(field_name.to_string(), part);
        self
    }

    /// Adds a text part to the multipart form
    pub fn add_text(mut self, field_name: &str, value: &str) -> Self {
        self.form = self.form.text(field_name.to_string(), value.to_string());
        self
    }

    /// Adds a JSON part to the multipart form
    pub fn add_json<T: serde::Serialize>(
        mut self,
        field_name: &str,
        value: &T,
    ) -> OpenAIResult<Self> {
        let json_string = serde_json::to_string(value).map_err(|e| {
            OpenAIError::Serialization(format!("Failed to serialize JSON: {}", e))
        })?;

        let part = Part::text(json_string)
            .mime_str("application/json")
            .map_err(|e| {
                OpenAIError::Serialization(format!("Failed to set MIME type: {}", e))
            })?;

        self.form = self.form.part(field_name.to_string(), part);
        Ok(self)
    }

    /// Builds the multipart form
    pub fn build(self) -> OpenAIResult<Form> {
        Ok(self.form)
    }
}

impl Default for MultipartBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Custom multipart form implementation for manual construction
/// This is useful if you need to generate the multipart body without reqwest
pub struct MultipartForm {
    boundary: String,
    parts: Vec<MultipartPart>,
}

struct MultipartPart {
    name: String,
    filename: Option<String>,
    content_type: String,
    data: Bytes,
}

impl MultipartForm {
    /// Creates a new MultipartForm with a random boundary
    pub fn new() -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let boundary = format!("----OpenAIBoundary{}", timestamp);

        Self {
            boundary,
            parts: Vec::new(),
        }
    }

    /// Adds a text field to the form
    pub fn text(mut self, name: &str, value: &str) -> Self {
        self.parts.push(MultipartPart {
            name: name.to_string(),
            filename: None,
            content_type: "text/plain".to_string(),
            data: Bytes::from(value.to_string()),
        });
        self
    }

    /// Adds a file field to the form
    pub fn file(mut self, name: &str, filename: &str, content_type: &str, data: Bytes) -> Self {
        self.parts.push(MultipartPart {
            name: name.to_string(),
            filename: Some(filename.to_string()),
            content_type: content_type.to_string(),
            data,
        });
        self
    }

    /// Builds the multipart form, returning the content-type header and body
    pub fn build(self) -> (String, Bytes) {
        let mut body = Vec::new();

        for part in &self.parts {
            // Boundary
            body.extend_from_slice(b"--");
            body.extend_from_slice(self.boundary.as_bytes());
            body.extend_from_slice(b"\r\n");

            // Content-Disposition header
            body.extend_from_slice(b"Content-Disposition: form-data; name=\"");
            body.extend_from_slice(part.name.as_bytes());
            body.extend_from_slice(b"\"");

            if let Some(filename) = &part.filename {
                body.extend_from_slice(b"; filename=\"");
                body.extend_from_slice(filename.as_bytes());
                body.extend_from_slice(b"\"");
            }
            body.extend_from_slice(b"\r\n");

            // Content-Type header
            body.extend_from_slice(b"Content-Type: ");
            body.extend_from_slice(part.content_type.as_bytes());
            body.extend_from_slice(b"\r\n\r\n");

            // Data
            body.extend_from_slice(&part.data);
            body.extend_from_slice(b"\r\n");
        }

        // Final boundary
        body.extend_from_slice(b"--");
        body.extend_from_slice(self.boundary.as_bytes());
        body.extend_from_slice(b"--\r\n");

        let content_type = format!("multipart/form-data; boundary={}", self.boundary);
        (content_type, Bytes::from(body))
    }
}

impl Default for MultipartForm {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multipart_builder() {
        let builder = MultipartBuilder::new()
            .add_text("purpose", "fine-tune")
            .add_file("file", "test.txt", Bytes::from("test data"));

        let form = builder.build();
        assert!(form.is_ok());
    }

    #[test]
    fn test_multipart_with_json() {
        #[derive(serde::Serialize)]
        struct TestData {
            key: String,
        }

        let data = TestData {
            key: "value".to_string(),
        };

        let builder = MultipartBuilder::new().add_json("metadata", &data).unwrap();
        let form = builder.build();
        assert!(form.is_ok());
    }
}
