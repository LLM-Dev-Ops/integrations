//! PDF Support
//!
//! This module provides utilities for working with PDF documents,
//! a beta feature that allows sending PDF files to Claude.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::services::messages::{ContentBlock, DocumentSource};

/// Create a PDF document content block from raw bytes
///
/// # Arguments
/// * `pdf_bytes` - The raw PDF file bytes
///
/// # Returns
/// A `ContentBlock::Document` containing the base64-encoded PDF
///
/// # Example
/// ```
/// # #[cfg(feature = "beta")]
/// # {
/// use integrations_anthropic::services::beta::create_pdf_content;
///
/// let pdf_data = b"%PDF-1.4..."; // PDF file bytes
/// let content = create_pdf_content(pdf_data);
/// # }
/// ```
pub fn create_pdf_content(pdf_bytes: &[u8]) -> ContentBlock {
    let base64_data = STANDARD.encode(pdf_bytes);
    ContentBlock::Document {
        source: DocumentSource::base64("application/pdf", base64_data),
        cache_control: None,
    }
}

/// Create a PDF document content block from base64-encoded data
///
/// # Arguments
/// * `base64_data` - The base64-encoded PDF data
///
/// # Returns
/// A `ContentBlock::Document` containing the PDF
pub fn create_pdf_content_from_base64(base64_data: String) -> ContentBlock {
    ContentBlock::Document {
        source: DocumentSource::base64("application/pdf", base64_data),
        cache_control: None,
    }
}

/// Create a cacheable PDF document content block from raw bytes
///
/// This marks the PDF for prompt caching, which can improve performance
/// for repeated requests with the same document.
pub fn create_cacheable_pdf_content(pdf_bytes: &[u8]) -> ContentBlock {
    let base64_data = STANDARD.encode(pdf_bytes);
    ContentBlock::Document {
        source: DocumentSource::base64("application/pdf", base64_data),
        cache_control: Some(crate::services::messages::CacheControl::ephemeral()),
    }
}

/// Validate PDF content by checking the magic bytes
///
/// # Arguments
/// * `bytes` - The bytes to validate
///
/// # Returns
/// `true` if the bytes start with the PDF magic number "%PDF-"
pub fn validate_pdf_bytes(bytes: &[u8]) -> bool {
    bytes.len() >= 5 && &bytes[0..5] == b"%PDF-"
}

/// Validate base64-encoded PDF data
///
/// # Arguments
/// * `base64_data` - The base64-encoded data to validate
///
/// # Returns
/// `true` if the data can be decoded and starts with PDF magic bytes
pub fn validate_pdf_base64(base64_data: &str) -> bool {
    if let Ok(bytes) = STANDARD.decode(base64_data) {
        validate_pdf_bytes(&bytes)
    } else {
        false
    }
}

/// Extract PDF content blocks from a list of content blocks
pub fn extract_pdf_blocks(content: &[ContentBlock]) -> Vec<&ContentBlock> {
    content
        .iter()
        .filter(|block| {
            matches!(block, ContentBlock::Document { source, .. }
                if source.media_type == "application/pdf")
        })
        .collect()
}

/// Get the beta header value for PDF support
pub fn get_pdf_support_beta_header() -> &'static str {
    "pdfs-2024-09-25"
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_PDF_HEADER: &[u8] = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const INVALID_PDF: &[u8] = b"Not a PDF file";

    #[test]
    fn test_validate_pdf_bytes_valid() {
        assert!(validate_pdf_bytes(VALID_PDF_HEADER));
    }

    #[test]
    fn test_validate_pdf_bytes_invalid() {
        assert!(!validate_pdf_bytes(INVALID_PDF));
    }

    #[test]
    fn test_validate_pdf_bytes_too_short() {
        assert!(!validate_pdf_bytes(b"PDF"));
    }

    #[test]
    fn test_create_pdf_content() {
        let content = create_pdf_content(VALID_PDF_HEADER);

        match content {
            ContentBlock::Document { source, cache_control } => {
                assert_eq!(source.source_type, "base64");
                assert_eq!(source.media_type, "application/pdf");
                assert!(!source.data.is_empty());
                assert!(cache_control.is_none());
            }
            _ => panic!("Expected Document content block"),
        }
    }

    #[test]
    fn test_create_pdf_content_from_base64() {
        let base64_data = STANDARD.encode(VALID_PDF_HEADER);
        let content = create_pdf_content_from_base64(base64_data.clone());

        match content {
            ContentBlock::Document { source, .. } => {
                assert_eq!(source.data, base64_data);
                assert_eq!(source.media_type, "application/pdf");
            }
            _ => panic!("Expected Document content block"),
        }
    }

    #[test]
    fn test_create_cacheable_pdf_content() {
        let content = create_cacheable_pdf_content(VALID_PDF_HEADER);

        match content {
            ContentBlock::Document { cache_control, .. } => {
                assert!(cache_control.is_some());
            }
            _ => panic!("Expected Document content block"),
        }
    }

    #[test]
    fn test_validate_pdf_base64_valid() {
        let base64_data = STANDARD.encode(VALID_PDF_HEADER);
        assert!(validate_pdf_base64(&base64_data));
    }

    #[test]
    fn test_validate_pdf_base64_invalid_content() {
        let base64_data = STANDARD.encode(INVALID_PDF);
        assert!(!validate_pdf_base64(&base64_data));
    }

    #[test]
    fn test_validate_pdf_base64_invalid_encoding() {
        assert!(!validate_pdf_base64("not valid base64!!!"));
    }

    #[test]
    fn test_extract_pdf_blocks() {
        let content = vec![
            ContentBlock::Text {
                text: "Hello".to_string(),
                cache_control: None,
            },
            create_pdf_content(VALID_PDF_HEADER),
            create_pdf_content(VALID_PDF_HEADER),
            ContentBlock::Image {
                source: crate::services::messages::ImageSource::base64(
                    "image/png",
                    "base64data"
                ),
                cache_control: None,
            },
        ];

        let pdfs = extract_pdf_blocks(&content);
        assert_eq!(pdfs.len(), 2);
    }

    #[test]
    fn test_beta_header() {
        assert_eq!(get_pdf_support_beta_header(), "pdfs-2024-09-25");
    }
}
