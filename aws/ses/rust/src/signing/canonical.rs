//! Canonical request building for AWS Signature V4.
//!
//! This module provides utilities for creating canonical requests according to
//! the AWS Signature V4 specification. Canonical requests are a standardized
//! representation of HTTP requests used in the signing process.

use http::HeaderMap;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

/// Characters that should NOT be percent-encoded in URI paths.
///
/// According to RFC 3986, these characters are "unreserved" and should not be encoded:
/// - Alphanumeric: A-Z, a-z, 0-9
/// - Special: - (hyphen), _ (underscore), . (period), ~ (tilde)
/// - Path separator: / (forward slash)
const URI_PATH_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~')
    .remove(b'/');

/// Characters that should NOT be percent-encoded in query strings.
///
/// Query string encoding is more strict than path encoding.
/// The forward slash is encoded in query strings.
const QUERY_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

/// URI-encode a string according to AWS signature requirements.
///
/// This function encodes a string for use in URIs, following AWS's specific
/// encoding rules. All characters except A-Z, a-z, 0-9, '-', '_', '.', and '~'
/// are percent-encoded. The forward slash is encoded only if `encode_slash` is true.
///
/// # Arguments
///
/// * `input` - The string to encode
/// * `encode_slash` - Whether to encode forward slashes (true for query params, false for paths)
///
/// # Returns
///
/// The percent-encoded string with spaces encoded as %20 (not +).
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::uri_encode;
///
/// // Path encoding preserves slashes
/// let encoded = uri_encode("/my-path/file.txt", false);
/// assert_eq!(encoded, "/my-path/file.txt");
///
/// // Space is encoded as %20
/// let encoded = uri_encode("hello world", false);
/// assert_eq!(encoded, "hello%20world");
///
/// // Query encoding encodes slashes
/// let encoded = uri_encode("value/with/slash", true);
/// assert_eq!(encoded, "value%2Fwith%2Fslash");
/// ```
pub fn uri_encode(input: &str, encode_slash: bool) -> String {
    if encode_slash {
        utf8_percent_encode(input, QUERY_SET).to_string()
    } else {
        utf8_percent_encode(input, URI_PATH_SET).to_string()
    }
}

/// Normalize a URI path by removing redundant slashes and resolving relative segments.
///
/// This function:
/// - Removes duplicate consecutive slashes
/// - Resolves `.` (current directory) segments
/// - Resolves `..` (parent directory) segments
/// - Ensures the path starts with `/`
/// - Preserves trailing slashes
///
/// # Arguments
///
/// * `path` - The path to normalize
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::normalize_uri_path;
///
/// let normalized = normalize_uri_path("/foo//bar");
/// assert_eq!(normalized, "/foo/bar");
///
/// let normalized = normalize_uri_path("/foo/./bar");
/// assert_eq!(normalized, "/foo/bar");
///
/// let normalized = normalize_uri_path("/foo/../bar");
/// assert_eq!(normalized, "/bar");
///
/// let normalized = normalize_uri_path("foo/bar");
/// assert_eq!(normalized, "/foo/bar");
/// ```
pub fn normalize_uri_path(path: &str) -> String {
    if path.is_empty() {
        return "/".to_string();
    }

    // Check if path ends with slash
    let has_trailing_slash = path.ends_with('/');

    // Split path into segments and process
    let mut segments = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => continue, // Skip empty and current directory
            ".." => {
                // Go up one directory
                segments.pop();
            }
            s => segments.push(s),
        }
    }

    // Build normalized path
    let mut result = String::from("/");
    result.push_str(&segments.join("/"));

    // Preserve trailing slash if present in original
    if has_trailing_slash && !result.ends_with('/') && result.len() > 1 {
        result.push('/');
    }

    result
}

/// Build a canonical query string from query parameters.
///
/// The canonical query string is built by:
/// 1. URI-encoding each parameter name and value
/// 2. Sorting parameters by name, then by value
/// 3. Joining with `&`
///
/// # Arguments
///
/// * `query_params` - A slice of (name, value) tuples
///
/// # Returns
///
/// The canonical query string, or an empty string if no parameters.
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::canonical_query_string;
///
/// let params = vec![
///     ("Action".to_string(), "SendEmail".to_string()),
///     ("Version".to_string(), "2010-12-01".to_string()),
/// ];
/// let query = canonical_query_string(&params);
/// assert_eq!(query, "Action=SendEmail&Version=2010-12-01");
///
/// // Parameters are sorted
/// let params = vec![
///     ("z".to_string(), "last".to_string()),
///     ("a".to_string(), "first".to_string()),
/// ];
/// let query = canonical_query_string(&params);
/// assert_eq!(query, "a=first&z=last");
/// ```
pub fn canonical_query_string(query_params: &[(String, String)]) -> String {
    if query_params.is_empty() {
        return String::new();
    }

    let mut encoded_params: Vec<(String, String)> = query_params
        .iter()
        .map(|(key, value)| (uri_encode(key, true), uri_encode(value, true)))
        .collect();

    // Sort by key, then by value
    encoded_params.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    encoded_params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&")
}

/// Build canonical headers string and signed headers string.
///
/// The canonical headers string contains:
/// - Header names converted to lowercase
/// - Header values trimmed and with multiple spaces collapsed to single space
/// - Headers sorted by name
/// - Each header formatted as `name:value\n`
///
/// The signed headers string is a semicolon-separated list of lowercase header names.
///
/// Only specific headers are included in signing:
/// - `host` (always required)
/// - Headers starting with `x-amz-`
/// - `content-type`, `content-md5`, `content-length`
///
/// # Arguments
///
/// * `headers` - The HTTP headers to process
///
/// # Returns
///
/// A tuple of (canonical_headers_string, signed_headers_string)
///
/// # Examples
///
/// ```
/// use http::HeaderMap;
/// use integrations_aws_ses::signing::canonical_headers;
///
/// let mut headers = HeaderMap::new();
/// headers.insert("host", "email.us-east-1.amazonaws.com".parse().unwrap());
/// headers.insert("x-amz-date", "20231215T103045Z".parse().unwrap());
///
/// let (canonical, signed) = canonical_headers(&headers);
/// assert!(canonical.contains("host:email.us-east-1.amazonaws.com\n"));
/// assert!(canonical.contains("x-amz-date:20231215T103045Z\n"));
/// assert_eq!(signed, "host;x-amz-date");
/// ```
pub fn canonical_headers(headers: &HeaderMap) -> (String, String) {
    use std::collections::BTreeMap;

    let mut header_map: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for (name, value) in headers {
        let name_lower = name.as_str().to_lowercase();

        // Only include headers that should be signed
        if !should_sign_header(&name_lower) {
            continue;
        }

        // Convert header value to string and normalize whitespace
        let value_str = value.to_str().unwrap_or("");
        let trimmed = value_str
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        header_map.entry(name_lower).or_default().push(trimmed);
    }

    // Build canonical headers string
    let canonical_headers_str = header_map
        .iter()
        .map(|(name, values)| format!("{}:{}\n", name, values.join(",")))
        .collect::<String>();

    // Build signed headers string
    let signed_headers_str = header_map
        .keys()
        .map(|s| s.as_str())
        .collect::<Vec<_>>()
        .join(";");

    (canonical_headers_str, signed_headers_str)
}

/// Determine if a header should be included in the signature.
///
/// Headers that should be signed:
/// - `host` (always required)
/// - Headers starting with `x-amz-`
/// - `content-type`, `content-md5`, `content-length`
///
/// # Arguments
///
/// * `header_name` - The header name (should be lowercase)
///
/// # Examples
///
/// ```
/// use integrations_aws_ses::signing::should_sign_header;
///
/// assert!(should_sign_header("host"));
/// assert!(should_sign_header("x-amz-date"));
/// assert!(should_sign_header("content-type"));
/// assert!(!should_sign_header("user-agent"));
/// ```
pub fn should_sign_header(header_name: &str) -> bool {
    let name_lower = header_name.to_lowercase();

    // Always sign these headers
    if name_lower == "host" || name_lower.starts_with("x-amz-") {
        return true;
    }

    // Sign content-related headers
    if name_lower == "content-type"
        || name_lower == "content-md5"
        || name_lower == "content-length"
    {
        return true;
    }

    // Don't sign other headers by default
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uri_encode_path() {
        assert_eq!(uri_encode("/", false), "/");
        assert_eq!(uri_encode("/foo/bar", false), "/foo/bar");
        assert_eq!(uri_encode("/foo bar/baz", false), "/foo%20bar/baz");
        assert_eq!(uri_encode("/my-path_file.txt~", false), "/my-path_file.txt~");
    }

    #[test]
    fn test_uri_encode_query() {
        assert_eq!(uri_encode("foo", true), "foo");
        assert_eq!(uri_encode("foo bar", true), "foo%20bar");
        assert_eq!(uri_encode("foo=bar", true), "foo%3Dbar");
        assert_eq!(uri_encode("foo/bar", true), "foo%2Fbar");
    }

    #[test]
    fn test_normalize_uri_path() {
        assert_eq!(normalize_uri_path(""), "/");
        assert_eq!(normalize_uri_path("/"), "/");
        assert_eq!(normalize_uri_path("//"), "/");
        assert_eq!(normalize_uri_path("/foo//bar"), "/foo/bar");
        assert_eq!(normalize_uri_path("/foo/./bar"), "/foo/bar");
        assert_eq!(normalize_uri_path("/foo/../bar"), "/bar");
        assert_eq!(normalize_uri_path("/foo/bar/.."), "/foo");
        assert_eq!(normalize_uri_path("foo/bar"), "/foo/bar");
        assert_eq!(normalize_uri_path("/foo/bar/"), "/foo/bar/");
    }

    #[test]
    fn test_canonical_query_string_empty() {
        let params: Vec<(String, String)> = vec![];
        assert_eq!(canonical_query_string(&params), "");
    }

    #[test]
    fn test_canonical_query_string_single() {
        let params = vec![("Action".to_string(), "SendEmail".to_string())];
        assert_eq!(canonical_query_string(&params), "Action=SendEmail");
    }

    #[test]
    fn test_canonical_query_string_multiple_sorted() {
        let params = vec![
            ("Version".to_string(), "2010-12-01".to_string()),
            ("Action".to_string(), "SendEmail".to_string()),
        ];
        assert_eq!(
            canonical_query_string(&params),
            "Action=SendEmail&Version=2010-12-01"
        );
    }

    #[test]
    fn test_canonical_query_string_encoding() {
        let params = vec![("key".to_string(), "value with spaces".to_string())];
        assert_eq!(canonical_query_string(&params), "key=value%20with%20spaces");
    }

    #[test]
    fn test_canonical_query_string_duplicate_keys() {
        let params = vec![
            ("a".to_string(), "2".to_string()),
            ("a".to_string(), "1".to_string()),
        ];
        // Should be sorted by key, then value
        assert_eq!(canonical_query_string(&params), "a=1&a=2");
    }

    #[test]
    fn test_canonical_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("Host", "email.us-east-1.amazonaws.com".parse().unwrap());
        headers.insert("X-Amz-Date", "20231215T103045Z".parse().unwrap());

        let (canonical, signed) = canonical_headers(&headers);

        assert!(canonical.contains("host:email.us-east-1.amazonaws.com\n"));
        assert!(canonical.contains("x-amz-date:20231215T103045Z\n"));
        assert_eq!(signed, "host;x-amz-date");
    }

    #[test]
    fn test_canonical_headers_whitespace_normalization() {
        let mut headers = HeaderMap::new();
        headers.insert("Host", "  example.com  ".parse().unwrap());
        headers.insert("X-Amz-Meta-Test", "value  with   spaces".parse().unwrap());

        let (canonical, _) = canonical_headers(&headers);

        assert!(canonical.contains("host:example.com\n"));
        assert!(canonical.contains("x-amz-meta-test:value with spaces\n"));
    }

    #[test]
    fn test_canonical_headers_filters_unsigned() {
        let mut headers = HeaderMap::new();
        headers.insert("Host", "example.com".parse().unwrap());
        headers.insert("User-Agent", "test-agent".parse().unwrap());
        headers.insert("Accept", "application/json".parse().unwrap());

        let (canonical, signed) = canonical_headers(&headers);

        assert!(canonical.contains("host:example.com\n"));
        assert!(!canonical.contains("user-agent"));
        assert!(!canonical.contains("accept"));
        assert_eq!(signed, "host");
    }

    #[test]
    fn test_canonical_headers_content_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("Host", "example.com".parse().unwrap());
        headers.insert("Content-Type", "application/json".parse().unwrap());
        headers.insert("Content-Length", "42".parse().unwrap());

        let (canonical, signed) = canonical_headers(&headers);

        assert!(canonical.contains("content-length:42\n"));
        assert!(canonical.contains("content-type:application/json\n"));
        assert_eq!(signed, "content-length;content-type;host");
    }

    #[test]
    fn test_should_sign_header() {
        // Should sign
        assert!(should_sign_header("host"));
        assert!(should_sign_header("Host"));
        assert!(should_sign_header("x-amz-date"));
        assert!(should_sign_header("X-Amz-Content-Sha256"));
        assert!(should_sign_header("x-amz-security-token"));
        assert!(should_sign_header("content-type"));
        assert!(should_sign_header("Content-Type"));
        assert!(should_sign_header("content-md5"));
        assert!(should_sign_header("content-length"));

        // Should not sign
        assert!(!should_sign_header("user-agent"));
        assert!(!should_sign_header("accept"));
        assert!(!should_sign_header("authorization"));
        assert!(!should_sign_header("connection"));
    }

    #[test]
    fn test_canonical_headers_sorting() {
        let mut headers = HeaderMap::new();
        headers.insert("X-Amz-Zebra", "last".parse().unwrap());
        headers.insert("Host", "example.com".parse().unwrap());
        headers.insert("X-Amz-Apple", "first".parse().unwrap());

        let (canonical, signed) = canonical_headers(&headers);

        // Should be sorted alphabetically
        let expected_order = vec!["host:", "x-amz-apple:", "x-amz-zebra:"];
        let mut last_pos = 0;
        for expected in expected_order {
            let pos = canonical.find(expected).unwrap();
            assert!(pos > last_pos, "Headers not in correct order");
            last_pos = pos;
        }

        assert_eq!(signed, "host;x-amz-apple;x-amz-zebra");
    }
}
