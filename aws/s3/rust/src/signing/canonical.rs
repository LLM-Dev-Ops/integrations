//! Canonical request building for AWS Signature V4.

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

/// Characters that should NOT be percent-encoded in URI paths.
const URI_PATH_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~')
    .remove(b'/');

/// Characters that should NOT be percent-encoded in query strings.
const QUERY_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

/// URI-encode a path component for canonical requests.
pub fn uri_encode_path(path: &str) -> String {
    utf8_percent_encode(path, URI_PATH_SET).to_string()
}

/// URI-encode a query parameter for canonical requests.
pub fn uri_encode_query(value: &str) -> String {
    utf8_percent_encode(value, QUERY_SET).to_string()
}

/// Build the canonical URI from a path.
///
/// The canonical URI is the URI-encoded version of the absolute path
/// component of the URI, starting with "/" and not including query string.
pub fn build_canonical_uri(path: &str) -> String {
    if path.is_empty() {
        return "/".to_string();
    }

    // Ensure path starts with /
    let normalized = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{}", path)
    };

    // URI-encode the path (but preserve /)
    let segments: Vec<&str> = normalized.split('/').collect();
    let encoded_segments: Vec<String> = segments
        .iter()
        .map(|s| uri_encode_query(s))
        .collect();

    encoded_segments.join("/")
}

/// Build the canonical query string.
///
/// Parameters are sorted by name, then by value. Each parameter is
/// URI-encoded and joined with '&'.
pub fn build_canonical_query_string(query_string: &str) -> String {
    if query_string.is_empty() {
        return String::new();
    }

    let mut params: Vec<(String, String)> = query_string
        .split('&')
        .filter(|s| !s.is_empty())
        .map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or("");
            let value = parts.next().unwrap_or("");
            (uri_encode_query(key), uri_encode_query(value))
        })
        .collect();

    // Sort by key, then by value
    params.sort_by(|a, b| {
        let key_cmp = a.0.cmp(&b.0);
        if key_cmp == std::cmp::Ordering::Equal {
            a.1.cmp(&b.1)
        } else {
            key_cmp
        }
    });

    params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&")
}

/// Build the canonical headers string.
///
/// Headers are lowercased, trimmed, sorted by name, and joined with newlines.
/// Multiple values for the same header are comma-separated.
pub fn build_canonical_headers(headers: &[(String, String)]) -> String {
    let mut header_map: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();

    for (name, value) in headers {
        let name_lower = name.to_lowercase();

        // Only include headers that should be signed
        if !super::should_sign_header(&name_lower) {
            continue;
        }

        // Trim and normalize whitespace in value
        let trimmed = value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        header_map
            .entry(name_lower)
            .or_default()
            .push(trimmed);
    }

    header_map
        .iter()
        .map(|(name, values)| format!("{}:{}\n", name, values.join(",")))
        .collect()
}

/// Build the signed headers string.
///
/// Returns a semicolon-separated list of lowercase header names.
pub fn build_signed_headers(headers: &[(String, String)]) -> String {
    let mut names: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

    for (name, _) in headers {
        let name_lower = name.to_lowercase();
        if super::should_sign_header(&name_lower) {
            names.insert(name_lower);
        }
    }

    names.into_iter().collect::<Vec<_>>().join(";")
}

/// Build the canonical request string.
///
/// Format:
/// ```text
/// HTTPMethod\n
/// CanonicalURI\n
/// CanonicalQueryString\n
/// CanonicalHeaders\n
/// SignedHeaders\n
/// HashedPayload
/// ```
pub fn build_canonical_request(
    method: &str,
    uri: &str,
    query_string: &str,
    headers: &[(String, String)],
    payload_hash: &str,
) -> String {
    let canonical_uri = build_canonical_uri(uri);
    let canonical_query = build_canonical_query_string(query_string);
    let canonical_headers = build_canonical_headers(headers);
    let signed_headers = build_signed_headers(headers);

    format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        canonical_uri,
        canonical_query,
        canonical_headers,
        signed_headers,
        payload_hash
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uri_encode_path() {
        assert_eq!(uri_encode_path("/"), "/");
        assert_eq!(uri_encode_path("/foo/bar"), "/foo/bar");
        assert_eq!(uri_encode_path("/foo bar/baz"), "/foo%20bar/baz");
    }

    #[test]
    fn test_uri_encode_query() {
        assert_eq!(uri_encode_query("foo"), "foo");
        assert_eq!(uri_encode_query("foo bar"), "foo%20bar");
        assert_eq!(uri_encode_query("foo=bar"), "foo%3Dbar");
    }

    #[test]
    fn test_build_canonical_uri() {
        assert_eq!(build_canonical_uri(""), "/");
        assert_eq!(build_canonical_uri("/"), "/");
        assert_eq!(build_canonical_uri("/foo/bar"), "/foo/bar");
        assert_eq!(build_canonical_uri("foo/bar"), "/foo/bar");
    }

    #[test]
    fn test_build_canonical_query_string() {
        assert_eq!(build_canonical_query_string(""), "");
        assert_eq!(build_canonical_query_string("a=1"), "a=1");
        assert_eq!(build_canonical_query_string("b=2&a=1"), "a=1&b=2");
        assert_eq!(
            build_canonical_query_string("a=2&a=1"),
            "a=1&a=2"
        );
    }

    #[test]
    fn test_build_canonical_headers() {
        let headers = vec![
            ("Host".to_string(), "example.com".to_string()),
            ("X-Amz-Date".to_string(), "20231215T103045Z".to_string()),
        ];

        let result = build_canonical_headers(&headers);
        assert!(result.contains("host:example.com\n"));
        assert!(result.contains("x-amz-date:20231215T103045Z\n"));
    }

    #[test]
    fn test_build_signed_headers() {
        let headers = vec![
            ("Host".to_string(), "example.com".to_string()),
            ("X-Amz-Date".to_string(), "20231215T103045Z".to_string()),
            ("Content-Type".to_string(), "application/json".to_string()),
        ];

        let result = build_signed_headers(&headers);
        assert_eq!(result, "content-type;host;x-amz-date");
    }

    #[test]
    fn test_build_canonical_request() {
        let headers = vec![
            ("Host".to_string(), "examplebucket.s3.amazonaws.com".to_string()),
            ("X-Amz-Date".to_string(), "20231215T103045Z".to_string()),
            (
                "X-Amz-Content-Sha256".to_string(),
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            ),
        ];

        let result = build_canonical_request(
            "GET",
            "/test.txt",
            "",
            &headers,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );

        assert!(result.starts_with("GET\n"));
        assert!(result.contains("/test.txt\n"));
    }

    #[test]
    fn test_headers_whitespace_normalization() {
        let headers = vec![
            ("Host".to_string(), "  example.com  ".to_string()),
            ("X-Amz-Meta-Test".to_string(), "value  with   spaces".to_string()),
        ];

        let result = build_canonical_headers(&headers);
        assert!(result.contains("host:example.com\n"));
        assert!(result.contains("x-amz-meta-test:value with spaces\n"));
    }
}
