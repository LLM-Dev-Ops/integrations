use bytes::Bytes;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageSize {
    #[serde(rename = "256x256")]
    Size256,
    #[serde(rename = "512x512")]
    Size512,
    #[serde(rename = "1024x1024")]
    Size1024,
    #[serde(rename = "1792x1024")]
    Size1792x1024,
    #[serde(rename = "1024x1792")]
    Size1024x1792,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageQuality {
    Standard,
    Hd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageStyle {
    Vivid,
    Natural,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageResponseFormat {
    Url,
    B64Json,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<ImageQuality>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ImageResponseFormat>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<ImageSize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<ImageStyle>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ImageEditRequest {
    pub image: Bytes,
    pub prompt: String,
    pub mask: Option<Bytes>,
    pub model: Option<String>,
    pub n: Option<u32>,
    pub size: Option<ImageSize>,
    pub response_format: Option<ImageResponseFormat>,
    pub user: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ImageVariationRequest {
    pub image: Bytes,
    pub model: Option<String>,
    pub n: Option<u32>,
    pub size: Option<ImageSize>,
    pub response_format: Option<ImageResponseFormat>,
    pub user: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImageResponse {
    pub created: i64,
    pub data: Vec<ImageData>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImageData {
    pub url: Option<String>,
    pub b64_json: Option<String>,
    pub revised_prompt: Option<String>,
}

impl ImageGenerationRequest {
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            model: Some("dall-e-3".to_string()),
            n: None,
            quality: None,
            response_format: None,
            size: None,
            style: None,
            user: None,
        }
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    pub fn with_size(mut self, size: ImageSize) -> Self {
        self.size = Some(size);
        self
    }

    pub fn with_quality(mut self, quality: ImageQuality) -> Self {
        self.quality = Some(quality);
        self
    }

    pub fn with_style(mut self, style: ImageStyle) -> Self {
        self.style = Some(style);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_generation_request() {
        let request = ImageGenerationRequest::new("A cat")
            .with_model("dall-e-3")
            .with_quality(ImageQuality::Hd);

        assert_eq!(request.prompt, "A cat");
        assert_eq!(request.model, Some("dall-e-3".to_string()));
        assert_eq!(request.quality, Some(ImageQuality::Hd));
    }
}
