//! Safety-related types for the Gemini API.
//!
//! This module contains types for configuring and reporting content safety.

use serde::{Deserialize, Serialize};

/// Safety setting for content generation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SafetySetting {
    /// The harm category to configure.
    pub category: HarmCategory,
    /// The blocking threshold for this category.
    pub threshold: HarmBlockThreshold,
}

/// Categories of harmful content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum HarmCategory {
    /// Harassment content.
    #[serde(rename = "HARM_CATEGORY_HARASSMENT")]
    Harassment,
    /// Hate speech content.
    #[serde(rename = "HARM_CATEGORY_HATE_SPEECH")]
    HateSpeech,
    /// Sexually explicit content.
    #[serde(rename = "HARM_CATEGORY_SEXUALLY_EXPLICIT")]
    SexuallyExplicit,
    /// Dangerous content.
    #[serde(rename = "HARM_CATEGORY_DANGEROUS_CONTENT")]
    DangerousContent,
    /// Civic integrity content.
    #[serde(rename = "HARM_CATEGORY_CIVIC_INTEGRITY")]
    CivicIntegrity,
}

/// Thresholds for blocking harmful content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum HarmBlockThreshold {
    /// Block none.
    #[serde(rename = "BLOCK_NONE")]
    BlockNone,
    /// Block low and above.
    #[serde(rename = "BLOCK_LOW_AND_ABOVE")]
    BlockLowAndAbove,
    /// Block medium and above.
    #[serde(rename = "BLOCK_MEDIUM_AND_ABOVE")]
    BlockMediumAndAbove,
    /// Block only high.
    #[serde(rename = "BLOCK_ONLY_HIGH")]
    BlockOnlyHigh,
}

/// Safety rating for a piece of content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SafetyRating {
    /// The harm category.
    pub category: HarmCategory,
    /// The probability of harm.
    pub probability: HarmProbability,
}

/// Probability levels for harmful content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HarmProbability {
    /// Negligible probability.
    Negligible,
    /// Low probability.
    Low,
    /// Medium probability.
    Medium,
    /// High probability.
    High,
}
