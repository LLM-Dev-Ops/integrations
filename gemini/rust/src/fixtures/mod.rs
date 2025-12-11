//! Test fixtures for the Gemini API client.
//!
//! This module provides utilities for loading test fixtures from JSON and text files.
//! All fixtures are located in the `fixtures/` subdirectory.

use std::path::PathBuf;

/// Get the path to a fixture file.
pub fn fixture_path(relative_path: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("fixtures")
        .join(relative_path)
}

/// Load a fixture file as a string.
pub fn load_fixture(relative_path: &str) -> String {
    std::fs::read_to_string(fixture_path(relative_path))
        .unwrap_or_else(|e| panic!("Failed to load fixture {}: {}", relative_path, e))
}

/// Load a JSON fixture and parse it.
pub fn load_json_fixture<T: serde::de::DeserializeOwned>(relative_path: &str) -> T {
    let content = load_fixture(relative_path);
    serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("Failed to parse JSON fixture {}: {}", relative_path, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixture_path() {
        let path = fixture_path("content/success_response.json");
        assert!(path.to_string_lossy().contains("fixtures"));
        assert!(path.to_string_lossy().contains("content"));
    }

    #[test]
    fn test_load_fixture() {
        let content = load_fixture("content/success_response.json");
        assert!(!content.is_empty());
        assert!(content.contains("candidates"));
    }

    #[test]
    fn test_load_json_fixture() {
        let json: serde_json::Value = load_json_fixture("content/success_response.json");
        assert!(json.get("candidates").is_some());
        assert!(json.get("usageMetadata").is_some());
    }
}
