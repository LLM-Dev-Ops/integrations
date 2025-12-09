//! Embeddings fixtures

use serde_json::json;

/// Sample successful embeddings response
pub fn embeddings_response() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [{
            "object": "embedding",
            "embedding": vec![0.0023064255; 1536],
            "index": 0
        }],
        "model": "text-embedding-ada-002",
        "usage": {
            "prompt_tokens": 8,
            "total_tokens": 8
        }
    })
}

/// Sample embeddings response with multiple inputs
pub fn embeddings_response_multiple_inputs() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [
            {
                "object": "embedding",
                "embedding": vec![0.0023064255; 1536],
                "index": 0
            },
            {
                "object": "embedding",
                "embedding": vec![0.0019876543; 1536],
                "index": 1
            }
        ],
        "model": "text-embedding-ada-002",
        "usage": {
            "prompt_tokens": 16,
            "total_tokens": 16
        }
    })
}

/// Sample embeddings response with text-embedding-3-small model (1536 dimensions)
pub fn embeddings_response_3_small() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [{
            "object": "embedding",
            "embedding": vec![0.0012345678; 1536],
            "index": 0
        }],
        "model": "text-embedding-3-small",
        "usage": {
            "prompt_tokens": 8,
            "total_tokens": 8
        }
    })
}

/// Sample embeddings response with text-embedding-3-large model (3072 dimensions)
pub fn embeddings_response_3_large() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [{
            "object": "embedding",
            "embedding": vec![0.0009876543; 3072],
            "index": 0
        }],
        "model": "text-embedding-3-large",
        "usage": {
            "prompt_tokens": 8,
            "total_tokens": 8
        }
    })
}

/// Sample embeddings response with custom dimensions (512)
pub fn embeddings_response_custom_dimensions() -> serde_json::Value {
    json!({
        "object": "list",
        "data": [{
            "object": "embedding",
            "embedding": vec![0.0015432198; 512],
            "index": 0
        }],
        "model": "text-embedding-3-small",
        "usage": {
            "prompt_tokens": 8,
            "total_tokens": 8
        }
    })
}

/// Builder for creating custom embeddings responses
pub struct EmbeddingsResponseBuilder {
    model: String,
    dimensions: usize,
    num_inputs: usize,
    prompt_tokens: u32,
}

impl EmbeddingsResponseBuilder {
    pub fn new() -> Self {
        Self {
            model: "text-embedding-ada-002".to_string(),
            dimensions: 1536,
            num_inputs: 1,
            prompt_tokens: 8,
        }
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }

    pub fn with_dimensions(mut self, dimensions: usize) -> Self {
        self.dimensions = dimensions;
        self
    }

    pub fn with_num_inputs(mut self, num_inputs: usize) -> Self {
        self.num_inputs = num_inputs;
        self
    }

    pub fn with_prompt_tokens(mut self, tokens: u32) -> Self {
        self.prompt_tokens = tokens;
        self
    }

    pub fn build(self) -> serde_json::Value {
        let data: Vec<serde_json::Value> = (0..self.num_inputs)
            .map(|i| {
                json!({
                    "object": "embedding",
                    "embedding": vec![0.001 * (i as f64 + 1.0); self.dimensions],
                    "index": i
                })
            })
            .collect();

        json!({
            "object": "list",
            "data": data,
            "model": self.model,
            "usage": {
                "prompt_tokens": self.prompt_tokens,
                "total_tokens": self.prompt_tokens
            }
        })
    }
}

impl Default for EmbeddingsResponseBuilder {
    fn default() -> Self {
        Self::new()
    }
}
