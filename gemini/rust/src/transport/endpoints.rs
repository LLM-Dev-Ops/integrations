//! Endpoint path constants and builder functions for the Gemini API.
//!
//! This module provides constants and helper functions for constructing
//! API endpoint paths according to the Gemini API specification.

/// Base path for models endpoints.
pub const MODELS: &str = "/models";

/// Base path for files endpoints.
pub const FILES: &str = "/files";

/// Base path for cached contents endpoints.
pub const CACHED_CONTENTS: &str = "/cachedContents";

/// Constructs a path for a specific model.
///
/// # Arguments
///
/// * `name` - The model name (e.g., "gemini-pro", "gemini-pro-vision")
///
/// # Returns
///
/// A string containing the model path (e.g., "/models/gemini-pro")
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::model("gemini-pro");
/// assert_eq!(path, "/models/gemini-pro");
/// ```
pub fn model(name: &str) -> String {
    format!("{}/{}", MODELS, name)
}

/// Constructs a path for the generateContent endpoint.
///
/// # Arguments
///
/// * `model` - The model name (e.g., "gemini-pro")
///
/// # Returns
///
/// A string containing the generateContent endpoint path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::generate_content("gemini-pro");
/// assert_eq!(path, "/models/gemini-pro:generateContent");
/// ```
pub fn generate_content(model: &str) -> String {
    format!("{}/{}:generateContent", MODELS, model)
}

/// Constructs a path for the streamGenerateContent endpoint.
///
/// # Arguments
///
/// * `model` - The model name (e.g., "gemini-pro")
///
/// # Returns
///
/// A string containing the streamGenerateContent endpoint path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::stream_generate_content("gemini-pro");
/// assert_eq!(path, "/models/gemini-pro:streamGenerateContent");
/// ```
pub fn stream_generate_content(model: &str) -> String {
    format!("{}/{}:streamGenerateContent", MODELS, model)
}

/// Constructs a path for the countTokens endpoint.
///
/// # Arguments
///
/// * `model` - The model name (e.g., "gemini-pro")
///
/// # Returns
///
/// A string containing the countTokens endpoint path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::count_tokens("gemini-pro");
/// assert_eq!(path, "/models/gemini-pro:countTokens");
/// ```
pub fn count_tokens(model: &str) -> String {
    format!("{}/{}:countTokens", MODELS, model)
}

/// Constructs a path for the embedContent endpoint.
///
/// # Arguments
///
/// * `model` - The model name (e.g., "embedding-001")
///
/// # Returns
///
/// A string containing the embedContent endpoint path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::embed_content("embedding-001");
/// assert_eq!(path, "/models/embedding-001:embedContent");
/// ```
pub fn embed_content(model: &str) -> String {
    format!("{}/{}:embedContent", MODELS, model)
}

/// Constructs a path for the batchEmbedContents endpoint.
///
/// # Arguments
///
/// * `model` - The model name (e.g., "embedding-001")
///
/// # Returns
///
/// A string containing the batchEmbedContents endpoint path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::batch_embed_contents("embedding-001");
/// assert_eq!(path, "/models/embedding-001:batchEmbedContents");
/// ```
pub fn batch_embed_contents(model: &str) -> String {
    format!("{}/{}:batchEmbedContents", MODELS, model)
}

/// Constructs a path for a specific file.
///
/// # Arguments
///
/// * `name` - The file name or ID
///
/// # Returns
///
/// A string containing the file path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::file("files/abc123");
/// assert_eq!(path, "/files/files/abc123");
/// ```
pub fn file(name: &str) -> String {
    format!("{}/{}", FILES, name)
}

/// Constructs a path for a specific cached content.
///
/// # Arguments
///
/// * `name` - The cached content name or ID
///
/// # Returns
///
/// A string containing the cached content path
///
/// # Example
///
/// ```
/// use integrations_gemini::transport::endpoints;
///
/// let path = endpoints::cached_content("cachedContents/xyz789");
/// assert_eq!(path, "/cachedContents/cachedContents/xyz789");
/// ```
pub fn cached_content(name: &str) -> String {
    format!("{}/{}", CACHED_CONTENTS, name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_path() {
        assert_eq!(model("gemini-pro"), "/models/gemini-pro");
        assert_eq!(model("gemini-pro-vision"), "/models/gemini-pro-vision");
    }

    #[test]
    fn test_generate_content_path() {
        assert_eq!(
            generate_content("gemini-pro"),
            "/models/gemini-pro:generateContent"
        );
    }

    #[test]
    fn test_stream_generate_content_path() {
        assert_eq!(
            stream_generate_content("gemini-pro"),
            "/models/gemini-pro:streamGenerateContent"
        );
    }

    #[test]
    fn test_count_tokens_path() {
        assert_eq!(
            count_tokens("gemini-pro"),
            "/models/gemini-pro:countTokens"
        );
    }

    #[test]
    fn test_embed_content_path() {
        assert_eq!(
            embed_content("embedding-001"),
            "/models/embedding-001:embedContent"
        );
    }

    #[test]
    fn test_batch_embed_contents_path() {
        assert_eq!(
            batch_embed_contents("embedding-001"),
            "/models/embedding-001:batchEmbedContents"
        );
    }

    #[test]
    fn test_file_path() {
        assert_eq!(file("abc123"), "/files/abc123");
        assert_eq!(file("files/abc123"), "/files/files/abc123");
    }

    #[test]
    fn test_cached_content_path() {
        assert_eq!(cached_content("xyz789"), "/cachedContents/xyz789");
        assert_eq!(
            cached_content("cachedContents/xyz789"),
            "/cachedContents/cachedContents/xyz789"
        );
    }
}
