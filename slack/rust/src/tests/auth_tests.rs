//! Authentication tests.

use crate::auth::{detect_token_type, is_valid_token, mask_token, TokenType};
use crate::webhooks::SignatureVerifier;

#[test]
fn test_detect_token_type_bot() {
    assert_eq!(detect_token_type("xoxb-123-456"), Some(TokenType::Bot));
    assert_eq!(detect_token_type("xoxb-"), Some(TokenType::Bot));
}

#[test]
fn test_detect_token_type_user() {
    assert_eq!(detect_token_type("xoxp-123-456"), Some(TokenType::User));
}

#[test]
fn test_detect_token_type_app() {
    assert_eq!(detect_token_type("xapp-123-456"), Some(TokenType::App));
}

#[test]
fn test_detect_token_type_unknown() {
    assert_eq!(detect_token_type("invalid"), None);
    assert_eq!(detect_token_type("xox-123"), None);
    assert_eq!(detect_token_type(""), None);
}

#[test]
fn test_is_valid_token() {
    assert!(is_valid_token("xoxb-123"));
    assert!(is_valid_token("xoxp-456"));
    assert!(is_valid_token("xapp-789"));

    assert!(!is_valid_token("invalid"));
    assert!(!is_valid_token(""));
}

#[test]
fn test_mask_token() {
    let masked = mask_token("xoxb-123456789-abcdefgh");
    assert_eq!(masked, "xoxb-...efgh");
    assert!(!masked.contains("123456789"));
}

#[test]
fn test_mask_token_short() {
    let masked = mask_token("short");
    assert_eq!(masked, "***");
}

#[test]
fn test_signature_verifier_valid() {
    let secret = "test-signing-secret";
    let verifier = SignatureVerifier::new(secret.to_string());

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();

    let body = "test-body";

    // Generate valid signature
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let sig_base = format!("v0:{}:{}", timestamp, body);
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(sig_base.as_bytes());
    let signature = format!("v0={}", hex::encode(mac.finalize().into_bytes()));

    assert!(verifier.verify(&signature, &timestamp, body));
}

#[test]
fn test_signature_verifier_invalid() {
    let verifier = SignatureVerifier::new("secret".to_string());

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();

    assert!(!verifier.verify("v0=invalid", &timestamp, "body"));
}

#[test]
fn test_signature_verifier_old_timestamp() {
    let verifier = SignatureVerifier::new("secret".to_string());

    // 10 minutes ago
    let old_timestamp = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        - 600)
        .to_string();

    // Even with valid signature, old timestamp should fail
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let body = "test-body";
    let sig_base = format!("v0:{}:{}", old_timestamp, body);
    let mut mac = Hmac::<Sha256>::new_from_slice("secret".as_bytes()).unwrap();
    mac.update(sig_base.as_bytes());
    let signature = format!("v0={}", hex::encode(mac.finalize().into_bytes()));

    assert!(!verifier.verify(&signature, &old_timestamp, body));
}
