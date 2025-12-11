//! Stream accumulator for combining streaming response chunks.
//!
//! Provides utilities for accumulating and combining GenerateContentResponse chunks
//! from the Gemini streaming API into a single complete response.

use crate::types::{GenerateContentResponse, Candidate, Content, Part, UsageMetadata};

/// Accumulator for combining streaming response chunks.
///
/// The Gemini streaming API returns multiple GenerateContentResponse chunks,
/// each containing partial content. This accumulator combines them into a
/// single complete response by:
/// - Concatenating text parts from candidates
/// - Merging usage metadata (using the final chunk's values)
/// - Preserving the last finish reason and safety ratings
pub struct StreamAccumulator {
    /// Accumulated candidates
    candidates: Vec<Candidate>,
    /// Final usage metadata (from last chunk)
    usage_metadata: Option<UsageMetadata>,
    /// Model version
    model_version: Option<String>,
}

impl StreamAccumulator {
    /// Create a new stream accumulator.
    pub fn new() -> Self {
        Self {
            candidates: Vec::new(),
            usage_metadata: None,
            model_version: None,
        }
    }

    /// Add a chunk to the accumulator.
    ///
    /// This combines the chunk's content with the accumulated state:
    /// - Text parts are concatenated
    /// - Usage metadata is updated (last one wins)
    /// - Safety ratings and finish reasons are updated from each chunk
    pub fn add_chunk(&mut self, chunk: GenerateContentResponse) {
        // Update usage metadata (last chunk wins)
        if chunk.usage_metadata.is_some() {
            self.usage_metadata = chunk.usage_metadata;
        }

        // Update model version
        if chunk.model_version.is_some() {
            self.model_version = chunk.model_version;
        }

        // Process candidates
        if let Some(new_candidates) = chunk.candidates {
            for (idx, new_candidate) in new_candidates.into_iter().enumerate() {
                if idx >= self.candidates.len() {
                    // New candidate, add it
                    self.candidates.push(new_candidate);
                } else {
                    // Merge with existing candidate
                    self.merge_candidate(idx, new_candidate);
                }
            }
        }
    }

    /// Merge a new candidate with an existing one at the given index.
    fn merge_candidate(&mut self, idx: usize, new_candidate: Candidate) {
        let existing = &mut self.candidates[idx];

        // Merge content parts
        if let Some(new_content) = new_candidate.content {
            if let Some(ref mut existing_content) = existing.content {
                self.merge_content(existing_content, new_content);
            } else {
                existing.content = Some(new_content);
            }
        }

        // Update finish reason (last one wins)
        if new_candidate.finish_reason.is_some() {
            existing.finish_reason = new_candidate.finish_reason;
        }

        // Update safety ratings (last one wins)
        if new_candidate.safety_ratings.is_some() {
            existing.safety_ratings = new_candidate.safety_ratings;
        }

        // Update citation metadata (last one wins)
        if new_candidate.citation_metadata.is_some() {
            existing.citation_metadata = new_candidate.citation_metadata;
        }

        // Update grounding metadata (last one wins)
        if new_candidate.grounding_metadata.is_some() {
            existing.grounding_metadata = new_candidate.grounding_metadata;
        }

        // Update token count (last one wins)
        if new_candidate.token_count.is_some() {
            existing.token_count = new_candidate.token_count;
        }

        // Update index
        if new_candidate.index.is_some() {
            existing.index = new_candidate.index;
        }
    }

    /// Merge content parts from a new content into existing content.
    fn merge_content(&mut self, existing: &mut Content, new: Content) {
        // Merge parts
        if let Some(new_parts) = new.parts {
            if let Some(ref mut existing_parts) = existing.parts {
                for (idx, new_part) in new_parts.into_iter().enumerate() {
                    if idx >= existing_parts.len() {
                        // New part, add it
                        existing_parts.push(new_part);
                    } else {
                        // Merge text parts
                        if let Part::Text { text: new_text } = new_part {
                            if let Part::Text { ref mut text } = existing_parts[idx] {
                                text.push_str(&new_text);
                            } else {
                                // Different part type, replace
                                existing_parts[idx] = Part::Text { text: new_text };
                            }
                        } else {
                            // Non-text parts replace the existing part
                            existing_parts[idx] = new_part;
                        }
                    }
                }
            } else {
                existing.parts = Some(new_parts);
            }
        }

        // Update role (last one wins, but should be consistent)
        if new.role.is_some() {
            existing.role = new.role;
        }
    }

    /// Finalize and return the accumulated response.
    ///
    /// This consumes the accumulator and returns the final combined response.
    pub fn finalize(self) -> GenerateContentResponse {
        GenerateContentResponse {
            candidates: if self.candidates.is_empty() {
                None
            } else {
                Some(self.candidates)
            },
            usage_metadata: self.usage_metadata,
            prompt_feedback: None, // Not accumulated from chunks
            model_version: self.model_version,
        }
    }

    /// Get a reference to the accumulated candidates.
    pub fn candidates(&self) -> &[Candidate] {
        &self.candidates
    }

    /// Get a reference to the usage metadata.
    pub fn usage_metadata(&self) -> Option<&UsageMetadata> {
        self.usage_metadata.as_ref()
    }
}

impl Default for StreamAccumulator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Role, FinishReason};

    #[test]
    fn test_accumulator_empty() {
        let accumulator = StreamAccumulator::new();
        let result = accumulator.finalize();
        assert!(result.candidates.is_none());
        assert!(result.usage_metadata.is_none());
    }

    #[test]
    fn test_accumulator_single_chunk() {
        let mut accumulator = StreamAccumulator::new();

        let chunk = GenerateContentResponse {
            candidates: Some(vec![Candidate {
                content: Some(Content {
                    parts: Some(vec![Part::Text {
                        text: "Hello".to_string(),
                    }]),
                    role: Some(Role::Model),
                }),
                finish_reason: Some(FinishReason::Stop),
                safety_ratings: None,
                citation_metadata: None,
                grounding_metadata: None,
                token_count: None,
                index: Some(0),
            }]),
            usage_metadata: Some(UsageMetadata {
                prompt_token_count: 5,
                candidates_token_count: Some(10),
                total_token_count: 15,
                cached_content_token_count: None,
            }),
            prompt_feedback: None,
            model_version: Some("gemini-1.5-pro".to_string()),
        };

        accumulator.add_chunk(chunk);
        let result = accumulator.finalize();

        assert!(result.candidates.is_some());
        let candidates = result.candidates.unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].finish_reason, Some(FinishReason::Stop));
    }

    #[test]
    fn test_accumulator_multiple_chunks() {
        let mut accumulator = StreamAccumulator::new();

        // First chunk
        let chunk1 = GenerateContentResponse {
            candidates: Some(vec![Candidate {
                content: Some(Content {
                    parts: Some(vec![Part::Text {
                        text: "Hello".to_string(),
                    }]),
                    role: Some(Role::Model),
                }),
                finish_reason: None,
                safety_ratings: None,
                citation_metadata: None,
                grounding_metadata: None,
                token_count: None,
                index: Some(0),
            }]),
            usage_metadata: Some(UsageMetadata {
                prompt_token_count: 5,
                candidates_token_count: Some(5),
                total_token_count: 10,
                cached_content_token_count: None,
            }),
            prompt_feedback: None,
            model_version: Some("gemini-1.5-pro".to_string()),
        };

        // Second chunk
        let chunk2 = GenerateContentResponse {
            candidates: Some(vec![Candidate {
                content: Some(Content {
                    parts: Some(vec![Part::Text {
                        text: " World".to_string(),
                    }]),
                    role: Some(Role::Model),
                }),
                finish_reason: Some(FinishReason::Stop),
                safety_ratings: None,
                citation_metadata: None,
                grounding_metadata: None,
                token_count: None,
                index: Some(0),
            }]),
            usage_metadata: Some(UsageMetadata {
                prompt_token_count: 5,
                candidates_token_count: Some(12),
                total_token_count: 17,
                cached_content_token_count: None,
            }),
            prompt_feedback: None,
            model_version: Some("gemini-1.5-pro".to_string()),
        };

        accumulator.add_chunk(chunk1);
        accumulator.add_chunk(chunk2);
        let result = accumulator.finalize();

        assert!(result.candidates.is_some());
        let candidates = result.candidates.unwrap();
        assert_eq!(candidates.len(), 1);

        // Check concatenated text
        if let Some(Content { parts: Some(parts), .. }) = &candidates[0].content {
            if let Part::Text { text } = &parts[0] {
                assert_eq!(text, "Hello World");
            } else {
                panic!("Expected text part");
            }
        } else {
            panic!("Expected content with parts");
        }

        // Check final usage metadata (from last chunk)
        assert!(result.usage_metadata.is_some());
        let usage = result.usage_metadata.unwrap();
        assert_eq!(usage.total_token_count, 17);
        assert_eq!(usage.candidates_token_count, Some(12));
    }
}
