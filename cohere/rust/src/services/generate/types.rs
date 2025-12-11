//! Types for the Generate service.

use crate::types::{ApiMeta, FinishReason, GenerationId};
use serde::{Deserialize, Serialize};

/// Truncation behavior
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Truncate {
    /// Don't truncate
    None,
    /// Truncate from the start
    Start,
    /// Truncate from the end
    End,
}

impl Default for Truncate {
    fn default() -> Self {
        Self::End
    }
}

/// When to return token likelihoods
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ReturnLikelihoods {
    /// Don't return likelihoods
    None,
    /// Return likelihoods for generated tokens only
    Generation,
    /// Return likelihoods for all tokens
    All,
}

impl Default for ReturnLikelihoods {
    fn default() -> Self {
        Self::None
    }
}

/// Token with likelihood information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenLikelihood {
    /// The token text
    pub token: String,
    /// Log likelihood of the token
    pub likelihood: f64,
}

/// Generate request
#[derive(Debug, Clone, Serialize)]
pub struct GenerateRequest {
    /// The prompt to generate from
    pub prompt: String,
    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Number of generations to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_generations: Option<u32>,
    /// Maximum tokens to generate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Whether to stream the response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    /// Temperature (0.0 to 5.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Top-k sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub k: Option<u32>,
    /// Top-p (nucleus) sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p: Option<f32>,
    /// Frequency penalty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    /// Presence penalty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
    /// Stop sequences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    /// Return likelihoods
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_likelihoods: Option<ReturnLikelihoods>,
    /// Truncation behavior
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncate: Option<Truncate>,
    /// Preset (overrides other generation params)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    /// End sequences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_sequences: Option<Vec<String>>,
    /// Logit bias
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logit_bias: Option<serde_json::Value>,
    /// Random seed for reproducibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
}

impl GenerateRequest {
    /// Create a new generate request
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            model: None,
            num_generations: None,
            max_tokens: None,
            stream: None,
            temperature: None,
            k: None,
            p: None,
            frequency_penalty: None,
            presence_penalty: None,
            stop_sequences: None,
            return_likelihoods: None,
            truncate: None,
            preset: None,
            end_sequences: None,
            logit_bias: None,
            seed: None,
        }
    }

    /// Create a builder
    pub fn builder(prompt: impl Into<String>) -> GenerateRequestBuilder {
        GenerateRequestBuilder::new(prompt)
    }
}

/// Builder for GenerateRequest
#[derive(Debug, Clone)]
pub struct GenerateRequestBuilder {
    request: GenerateRequest,
}

impl GenerateRequestBuilder {
    /// Create a new builder
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            request: GenerateRequest::new(prompt),
        }
    }

    /// Set the model
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.request.model = Some(model.into());
        self
    }

    /// Set number of generations
    pub fn num_generations(mut self, num: u32) -> Self {
        self.request.num_generations = Some(num);
        self
    }

    /// Set max tokens
    pub fn max_tokens(mut self, max: u32) -> Self {
        self.request.max_tokens = Some(max);
        self
    }

    /// Enable streaming
    pub fn stream(mut self) -> Self {
        self.request.stream = Some(true);
        self
    }

    /// Set temperature
    pub fn temperature(mut self, temp: f32) -> Self {
        self.request.temperature = Some(temp);
        self
    }

    /// Set top-k
    pub fn k(mut self, k: u32) -> Self {
        self.request.k = Some(k);
        self
    }

    /// Set top-p
    pub fn p(mut self, p: f32) -> Self {
        self.request.p = Some(p);
        self
    }

    /// Set frequency penalty
    pub fn frequency_penalty(mut self, penalty: f32) -> Self {
        self.request.frequency_penalty = Some(penalty);
        self
    }

    /// Set presence penalty
    pub fn presence_penalty(mut self, penalty: f32) -> Self {
        self.request.presence_penalty = Some(penalty);
        self
    }

    /// Set stop sequences
    pub fn stop_sequences(mut self, sequences: Vec<String>) -> Self {
        self.request.stop_sequences = Some(sequences);
        self
    }

    /// Set return likelihoods
    pub fn return_likelihoods(mut self, mode: ReturnLikelihoods) -> Self {
        self.request.return_likelihoods = Some(mode);
        self
    }

    /// Set truncation behavior
    pub fn truncate(mut self, truncate: Truncate) -> Self {
        self.request.truncate = Some(truncate);
        self
    }

    /// Set seed for reproducibility
    pub fn seed(mut self, seed: u64) -> Self {
        self.request.seed = Some(seed);
        self
    }

    /// Build the request
    pub fn build(self) -> GenerateRequest {
        self.request
    }
}

/// A single generation
#[derive(Debug, Clone, Deserialize)]
pub struct Generation {
    /// Generated text
    pub text: String,
    /// Generation ID
    #[serde(default)]
    pub id: Option<String>,
    /// Finish reason
    #[serde(default)]
    pub finish_reason: Option<FinishReason>,
    /// Token likelihoods (if requested)
    #[serde(default)]
    pub token_likelihoods: Option<Vec<TokenLikelihood>>,
}

/// Multiple generations response
#[derive(Debug, Clone, Deserialize)]
pub struct Generations {
    /// List of generations
    pub generations: Vec<Generation>,
    /// Generation ID
    #[serde(default)]
    pub id: Option<GenerationId>,
    /// Prompt used
    #[serde(default)]
    pub prompt: Option<String>,
    /// API metadata
    #[serde(default)]
    pub meta: Option<ApiMeta>,
}

/// Generate response (alias for Generations)
pub type GenerateResponse = Generations;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_request_builder() {
        let request = GenerateRequest::builder("Once upon a time")
            .model("command")
            .max_tokens(100)
            .temperature(0.7)
            .stream()
            .build();

        assert_eq!(request.prompt, "Once upon a time");
        assert_eq!(request.model, Some("command".to_string()));
        assert_eq!(request.max_tokens, Some(100));
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.stream, Some(true));
    }

    #[test]
    fn test_truncate_serialization() {
        let start = Truncate::Start;
        assert_eq!(serde_json::to_string(&start).unwrap(), "\"START\"");

        let end = Truncate::End;
        assert_eq!(serde_json::to_string(&end).unwrap(), "\"END\"");
    }

    #[test]
    fn test_return_likelihoods_serialization() {
        let all = ReturnLikelihoods::All;
        assert_eq!(serde_json::to_string(&all).unwrap(), "\"ALL\"");

        let gen = ReturnLikelihoods::Generation;
        assert_eq!(serde_json::to_string(&gen).unwrap(), "\"GENERATION\"");
    }
}
