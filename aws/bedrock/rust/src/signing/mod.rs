//! AWS Signature V4 signing for Bedrock requests.
//!
//! This module implements AWS Signature V4 signing specifically for Bedrock API requests.

use crate::credentials::{AwsCredentials, CredentialsProvider};
use crate::error::BedrockError;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use url::Url;

const AWS_ALGORITHM: &str = "AWS4-HMAC-SHA256";
const BEDROCK_SERVICE: &str = "bedrock";
const UNSIGNED_PAYLOAD: &str = "UNSIGNED-PAYLOAD";

/// A signed request ready to be sent.
#[derive(Debug, Clone)]
pub struct SignedRequest {
    /// HTTP method.
    pub method: String,
    /// Full URL including query string.
    pub url: Url,
    /// Headers to include.
    pub headers: HashMap<String, String>,
    /// Request body (if any).
    pub body: Option<bytes::Bytes>,
}

/// Trait for AWS request signers.
#[async_trait]
pub trait AwsSigner: Send + Sync {
    /// Sign a request with AWS Signature V4.
    async fn sign(
        &self,
        method: &str,
        url: &Url,
        headers: &HashMap<String, String>,
        body: Option<&[u8]>,
    ) -> Result<SignedRequest, BedrockError>;
}

/// AWS Signature V4 signer for Bedrock.
pub struct BedrockSigner {
    credentials_provider: Arc<dyn CredentialsProvider>,
    region: String,
    service: String,
}

impl BedrockSigner {
    /// Create a new signer for Bedrock.
    pub fn new(
        credentials_provider: Arc<dyn CredentialsProvider>,
        region: impl Into<String>,
    ) -> Self {
        Self {
            credentials_provider,
            region: region.into(),
            service: BEDROCK_SERVICE.to_string(),
        }
    }

    /// Create a signer for Bedrock Runtime (model invocation).
    pub fn runtime(
        credentials_provider: Arc<dyn CredentialsProvider>,
        region: impl Into<String>,
    ) -> Self {
        Self {
            credentials_provider,
            region: region.into(),
            service: "bedrock-runtime".to_string(),
        }
    }

    /// Get credentials from the provider.
    async fn get_credentials(&self) -> Result<AwsCredentials, BedrockError> {
        self.credentials_provider.get_credentials().await
    }

    /// Build headers for signing.
    fn build_signing_headers(
        &self,
        url: &Url,
        original_headers: &HashMap<String, String>,
        timestamp: &DateTime<Utc>,
        payload_hash: &str,
    ) -> Vec<(String, String)> {
        let mut headers: Vec<(String, String)> = Vec::new();

        // Add host header
        let host = url.host_str().unwrap_or_default();
        let host_value = if let Some(port) = url.port() {
            format!("{}:{}", host, port)
        } else {
            host.to_string()
        };
        headers.push(("host".to_string(), host_value));

        // Add x-amz-date
        headers.push(("x-amz-date".to_string(), format_datetime(timestamp)));

        // Add x-amz-content-sha256
        headers.push(("x-amz-content-sha256".to_string(), payload_hash.to_string()));

        // Add original headers
        for (name, value) in original_headers {
            let name_lower = name.to_lowercase();
            if name_lower != "host"
                && name_lower != "x-amz-date"
                && name_lower != "x-amz-content-sha256"
            {
                headers.push((name.clone(), value.clone()));
            }
        }

        headers
    }

    /// Calculate the payload hash.
    fn calculate_payload_hash(&self, body: Option<&[u8]>) -> String {
        match body {
            Some(data) => sha256_hex(data),
            None => sha256_hex(b""),
        }
    }
}

#[async_trait]
impl AwsSigner for BedrockSigner {
    async fn sign(
        &self,
        method: &str,
        url: &Url,
        headers: &HashMap<String, String>,
        body: Option<&[u8]>,
    ) -> Result<SignedRequest, BedrockError> {
        let credentials = self.get_credentials().await?;
        let timestamp = Utc::now();

        // Calculate payload hash
        let payload_hash = self.calculate_payload_hash(body);

        // Build headers for signing
        let signing_headers = self.build_signing_headers(url, headers, &timestamp, &payload_hash);

        // Get the path and query string
        let path = url.path();
        let query = url.query().unwrap_or("");

        // Sign the request
        let authorization = sign_request(
            method,
            path,
            query,
            &signing_headers,
            &payload_hash,
            &credentials,
            &self.region,
            &self.service,
            &timestamp,
        );

        // Build final headers
        let mut final_headers: HashMap<String, String> = HashMap::new();

        // Add original headers
        for (name, value) in headers {
            final_headers.insert(name.clone(), value.clone());
        }

        // Add signing headers
        for (name, value) in &signing_headers {
            let name_lower = name.to_lowercase();
            if name_lower == "host"
                || name_lower == "x-amz-date"
                || name_lower == "x-amz-content-sha256"
            {
                final_headers.insert(name.clone(), value.clone());
            }
        }

        // Add authorization header
        final_headers.insert("authorization".to_string(), authorization);

        // Add session token if present
        if let Some(token) = credentials.session_token() {
            final_headers.insert("x-amz-security-token".to_string(), token.to_string());
        }

        Ok(SignedRequest {
            method: method.to_string(),
            url: url.clone(),
            headers: final_headers,
            body: body.map(|b| bytes::Bytes::copy_from_slice(b)),
        })
    }
}

impl std::fmt::Debug for BedrockSigner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BedrockSigner")
            .field("region", &self.region)
            .field("service", &self.service)
            .finish_non_exhaustive()
    }
}

// ============================================================================
// Signing helpers
// ============================================================================

/// Format datetime for AWS signature.
fn format_datetime(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%dT%H%M%SZ").to_string()
}

/// Format date stamp for credential scope.
fn format_date_stamp(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%d").to_string()
}

/// Calculate SHA-256 hash and return hex string.
fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Calculate HMAC-SHA256.
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Derive the signing key.
fn derive_signing_key(secret_key: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{}", secret_key).as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

/// Build the credential scope.
fn build_credential_scope(date_stamp: &str, region: &str, service: &str) -> String {
    format!("{}/{}/{}/aws4_request", date_stamp, region, service)
}

/// Build signed headers string.
fn build_signed_headers(headers: &[(String, String)]) -> String {
    let mut names: Vec<String> = headers.iter().map(|(n, _)| n.to_lowercase()).collect();
    names.sort();
    names.join(";")
}

/// Build canonical headers string.
fn build_canonical_headers(headers: &[(String, String)]) -> String {
    let mut sorted: Vec<(String, String)> = headers
        .iter()
        .map(|(n, v)| (n.to_lowercase(), v.trim().to_string()))
        .collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));

    sorted
        .iter()
        .map(|(n, v)| format!("{}:{}\n", n, v))
        .collect()
}

/// URI encode for query strings.
fn uri_encode(input: &str, encode_slash: bool) -> String {
    let mut result = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b'/' if !encode_slash => {
                result.push('/');
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

/// Build canonical query string.
fn build_canonical_query_string(query: &str) -> String {
    if query.is_empty() {
        return String::new();
    }

    let mut params: Vec<(String, String)> = query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or("");
            let value = parts.next().unwrap_or("");
            (uri_encode(key, true), uri_encode(value, true))
        })
        .collect();

    params.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&")
}

/// Build canonical request.
fn build_canonical_request(
    method: &str,
    path: &str,
    query: &str,
    headers: &[(String, String)],
    payload_hash: &str,
) -> String {
    let canonical_path = if path.is_empty() { "/" } else { path };
    let canonical_query = build_canonical_query_string(query);
    let canonical_headers = build_canonical_headers(headers);
    let signed_headers = build_signed_headers(headers);

    format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method,
        uri_encode(canonical_path, false),
        canonical_query,
        canonical_headers,
        signed_headers,
        payload_hash
    )
}

/// Sign the request and return the authorization header value.
fn sign_request(
    method: &str,
    path: &str,
    query: &str,
    headers: &[(String, String)],
    payload_hash: &str,
    credentials: &AwsCredentials,
    region: &str,
    service: &str,
    timestamp: &DateTime<Utc>,
) -> String {
    let date_stamp = format_date_stamp(timestamp);
    let amz_date = format_datetime(timestamp);

    // Build canonical request
    let canonical_request = build_canonical_request(method, path, query, headers, payload_hash);
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // Build credential scope
    let credential_scope = build_credential_scope(&date_stamp, region, service);

    // Build string to sign
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        AWS_ALGORITHM, amz_date, credential_scope, canonical_request_hash
    );

    // Derive signing key and calculate signature
    let signing_key = derive_signing_key(credentials.secret_access_key(), &date_stamp, region, service);
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    // Build signed headers
    let signed_headers = build_signed_headers(headers);

    // Build authorization header
    format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        AWS_ALGORITHM,
        credentials.access_key_id(),
        credential_scope,
        signed_headers,
        signature
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::StaticCredentialsProvider;

    fn create_test_signer() -> BedrockSigner {
        let provider = Arc::new(StaticCredentialsProvider::new(AwsCredentials::new(
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        )));
        BedrockSigner::runtime(provider, "us-east-1")
    }

    #[tokio::test]
    async fn test_sign_simple_post() {
        let signer = create_test_signer();
        let url = Url::parse("https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.titan-text-express-v1/invoke").unwrap();
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());
        let body = b"{\"inputText\":\"Hello\"}";

        let result = signer.sign("POST", &url, &headers, Some(body)).await;
        assert!(result.is_ok());

        let signed = result.unwrap();
        assert_eq!(signed.method, "POST");
        assert!(signed.headers.contains_key("authorization"));
        assert!(signed.headers.contains_key("x-amz-date"));
        assert!(signed.headers.contains_key("x-amz-content-sha256"));
    }

    #[test]
    fn test_sha256_hex() {
        let hash = sha256_hex(b"hello");
        assert_eq!(
            hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_uri_encode() {
        assert_eq!(uri_encode("hello", true), "hello");
        assert_eq!(uri_encode("hello world", true), "hello%20world");
        assert_eq!(uri_encode("a/b", true), "a%2Fb");
        assert_eq!(uri_encode("a/b", false), "a/b");
    }

    #[test]
    fn test_build_signed_headers() {
        let headers = vec![
            ("Host".to_string(), "example.com".to_string()),
            ("X-Amz-Date".to_string(), "20231215T120000Z".to_string()),
            ("Content-Type".to_string(), "application/json".to_string()),
        ];
        let signed = build_signed_headers(&headers);
        assert_eq!(signed, "content-type;host;x-amz-date");
    }
}
