//! PKCE Generator
//!
//! RFC 7636 Proof Key for Code Exchange implementation.

use base64::Engine;
use rand::Rng;
use sha2::{Digest, Sha256};

use crate::types::{PkceMethod, PkceParams};

/// PKCE generator interface (for dependency injection).
pub trait PkceGenerator: Send + Sync {
    /// Generate PKCE parameters.
    fn generate(&self, method: PkceMethod) -> PkceParams;

    /// Compute challenge from verifier.
    fn compute_challenge(&self, verifier: &str, method: PkceMethod) -> String;
}

/// Default PKCE generator implementation.
pub struct DefaultPkceGenerator {
    verifier_length: usize,
}

impl DefaultPkceGenerator {
    /// Create new PKCE generator with default verifier length (64).
    pub fn new() -> Self {
        Self::with_length(64)
    }

    /// Create PKCE generator with custom verifier length.
    ///
    /// # Panics
    /// Panics if length is not between 43 and 128 (RFC 7636 requirement).
    pub fn with_length(length: usize) -> Self {
        assert!(
            (43..=128).contains(&length),
            "PKCE verifier length must be between 43 and 128"
        );
        Self {
            verifier_length: length,
        }
    }

    fn generate_verifier(&self) -> String {
        let mut rng = rand::thread_rng();
        // Generate enough random bytes for base64url encoding
        let bytes_needed = (self.verifier_length * 3 + 3) / 4;
        let random_bytes: Vec<u8> = (0..bytes_needed).map(|_| rng.gen()).collect();

        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&random_bytes);
        // Trim to exact length
        encoded[..self.verifier_length].to_string()
    }
}

impl Default for DefaultPkceGenerator {
    fn default() -> Self {
        Self::new()
    }
}

impl PkceGenerator for DefaultPkceGenerator {
    fn generate(&self, method: PkceMethod) -> PkceParams {
        let code_verifier = self.generate_verifier();
        let code_challenge = self.compute_challenge(&code_verifier, method);

        PkceParams {
            code_verifier,
            code_challenge,
            code_challenge_method: method,
        }
    }

    fn compute_challenge(&self, verifier: &str, method: PkceMethod) -> String {
        match method {
            PkceMethod::Plain => verifier.to_string(),
            PkceMethod::S256 => {
                // S256: BASE64URL(SHA256(code_verifier))
                let hash = Sha256::digest(verifier.as_bytes());
                base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
            }
        }
    }
}

/// Mock PKCE generator for testing.
#[derive(Default)]
pub struct MockPkceGenerator {
    next_verifier: std::sync::Mutex<Option<String>>,
    generate_history: std::sync::Mutex<Vec<PkceParams>>,
}

impl MockPkceGenerator {
    /// Create new mock PKCE generator.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the next verifier to generate.
    pub fn set_next_verifier(&self, verifier: String) -> &Self {
        *self.next_verifier.lock().unwrap() = Some(verifier);
        self
    }

    /// Get generate history.
    pub fn get_generate_history(&self) -> Vec<PkceParams> {
        self.generate_history.lock().unwrap().clone()
    }
}

impl PkceGenerator for MockPkceGenerator {
    fn generate(&self, method: PkceMethod) -> PkceParams {
        let code_verifier = self
            .next_verifier
            .lock()
            .unwrap()
            .take()
            .unwrap_or_else(|| format!("mock-verifier-{}", rand::random::<u32>()));

        let code_challenge = self.compute_challenge(&code_verifier, method);

        let params = PkceParams {
            code_verifier,
            code_challenge,
            code_challenge_method: method,
        };

        self.generate_history.lock().unwrap().push(params.clone());
        params
    }

    fn compute_challenge(&self, verifier: &str, method: PkceMethod) -> String {
        match method {
            PkceMethod::Plain => verifier.to_string(),
            PkceMethod::S256 => {
                let hash = Sha256::digest(verifier.as_bytes());
                base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
            }
        }
    }
}

/// Validate PKCE verifier format.
pub fn is_valid_verifier(verifier: &str) -> bool {
    // RFC 7636: verifier must be 43-128 characters
    let len = verifier.len();
    if !(43..=128).contains(&len) {
        return false;
    }

    // Must only contain unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
    verifier
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_' || c == '~')
}

/// Create production PKCE generator.
pub fn create_pkce_generator() -> impl PkceGenerator {
    DefaultPkceGenerator::new()
}

/// Create mock PKCE generator for testing.
pub fn create_mock_pkce_generator() -> MockPkceGenerator {
    MockPkceGenerator::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_generation() {
        let generator = DefaultPkceGenerator::new();
        let params = generator.generate(PkceMethod::S256);

        assert_eq!(params.code_verifier.len(), 64);
        assert!(is_valid_verifier(&params.code_verifier));
        assert!(!params.code_challenge.is_empty());
        assert_eq!(params.code_challenge_method, PkceMethod::S256);
    }

    #[test]
    fn test_pkce_s256_challenge() {
        let generator = DefaultPkceGenerator::new();
        // Known test vector
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let challenge = generator.compute_challenge(verifier, PkceMethod::S256);
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn test_pkce_plain_challenge() {
        let generator = DefaultPkceGenerator::new();
        let verifier = "test-verifier";
        let challenge = generator.compute_challenge(verifier, PkceMethod::Plain);
        assert_eq!(challenge, verifier);
    }

    #[test]
    fn test_verifier_validation() {
        // Valid verifier (43 chars)
        assert!(is_valid_verifier(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        ));

        // Too short
        assert!(!is_valid_verifier("short"));

        // Invalid characters
        assert!(!is_valid_verifier(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOE!@#"
        ));
    }

    #[test]
    fn test_mock_pkce_generator() {
        let generator = MockPkceGenerator::new();
        generator.set_next_verifier("test-verifier-12345678901234567890123456".to_string());

        let params = generator.generate(PkceMethod::S256);
        assert_eq!(params.code_verifier, "test-verifier-12345678901234567890123456");

        let history = generator.get_generate_history();
        assert_eq!(history.len(), 1);
    }

    #[test]
    #[should_panic(expected = "PKCE verifier length must be between 43 and 128")]
    fn test_invalid_verifier_length() {
        DefaultPkceGenerator::with_length(42); // Too short
    }
}
