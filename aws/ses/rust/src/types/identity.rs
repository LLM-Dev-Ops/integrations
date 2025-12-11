//! Identity management types for SES v2.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Type of email identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IdentityType {
    /// Email address identity.
    EmailAddress,
    /// Domain identity.
    Domain,
    /// AWS managed domain.
    ManagedDomain,
}

impl IdentityType {
    /// Returns the string representation for the SES API.
    pub fn as_str(&self) -> &'static str {
        match self {
            IdentityType::EmailAddress => "EMAIL_ADDRESS",
            IdentityType::Domain => "DOMAIN",
            IdentityType::ManagedDomain => "MANAGED_DOMAIN",
        }
    }
}

/// DKIM (DomainKeys Identified Mail) attributes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DkimAttributes {
    /// DKIM signing status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_enabled: Option<bool>,
    /// DKIM status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<DkimStatus>,
    /// DKIM tokens for DNS verification.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<Vec<String>>,
    /// DKIM signing attributes type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_attributes_origin: Option<DkimSigningAttributesOrigin>,
    /// Next signing key length.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_signing_key_length: Option<DkimSigningKeyLength>,
    /// Current signing key length.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_signing_key_length: Option<DkimSigningKeyLength>,
    /// Last key generation timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_key_generation_timestamp: Option<String>,
}

/// DKIM status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DkimStatus {
    /// DKIM verification pending.
    Pending,
    /// DKIM verification successful.
    Success,
    /// DKIM verification failed.
    Failed,
    /// Temporary failure during verification.
    TemporaryFailure,
    /// DKIM not started.
    NotStarted,
}

/// Origin of DKIM signing attributes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DkimSigningAttributesOrigin {
    /// AWS SES-managed DKIM.
    AwsSes,
    /// External DKIM (bring your own).
    External,
}

/// DKIM signing key length.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DkimSigningKeyLength {
    /// RSA 1024-bit key.
    Rsa1024Bit,
    /// RSA 2048-bit key.
    Rsa2048Bit,
}

impl DkimSigningKeyLength {
    /// Returns the string representation for the SES API.
    pub fn as_str(&self) -> &'static str {
        match self {
            DkimSigningKeyLength::Rsa1024Bit => "RSA_1024_BIT",
            DkimSigningKeyLength::Rsa2048Bit => "RSA_2048_BIT",
        }
    }
}

/// MAIL FROM domain attributes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MailFromAttributes {
    /// MAIL FROM domain.
    pub mail_from_domain: String,
    /// MAIL FROM domain status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_from_domain_status: Option<MailFromDomainStatus>,
    /// Behavior when MX record is not found.
    pub behavior_on_mx_failure: BehaviorOnMxFailure,
}

impl MailFromAttributes {
    /// Create new MAIL FROM attributes.
    pub fn new(
        mail_from_domain: impl Into<String>,
        behavior_on_mx_failure: BehaviorOnMxFailure,
    ) -> Self {
        Self {
            mail_from_domain: mail_from_domain.into(),
            mail_from_domain_status: None,
            behavior_on_mx_failure,
        }
    }
}

/// Status of MAIL FROM domain.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MailFromDomainStatus {
    /// Verification pending.
    Pending,
    /// Verification successful.
    Success,
    /// Verification failed.
    Failed,
    /// Temporary failure.
    TemporaryFailure,
}

/// Behavior when MX record lookup fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BehaviorOnMxFailure {
    /// Use default MAIL FROM domain.
    UseDefaultValue,
    /// Reject the email.
    RejectMessage,
}

/// Verification status for identities.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum VerificationStatus {
    /// Verification pending.
    Pending,
    /// Verification successful.
    Success,
    /// Verification failed.
    Failed,
    /// Temporary failure.
    TemporaryFailure,
    /// Verification not started.
    NotStarted,
}

impl VerificationStatus {
    /// Check if the verification is complete and successful.
    pub fn is_verified(&self) -> bool {
        matches!(self, VerificationStatus::Success)
    }

    /// Check if the verification is in a failed state.
    pub fn is_failed(&self) -> bool {
        matches!(self, VerificationStatus::Failed)
    }

    /// Check if the verification is pending.
    pub fn is_pending(&self) -> bool {
        matches!(
            self,
            VerificationStatus::Pending | VerificationStatus::NotStarted
        )
    }
}

/// Identity information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct IdentityInfo {
    /// Identity type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_type: Option<IdentityType>,
    /// Identity name (email or domain).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_name: Option<String>,
    /// Whether sending is enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_enabled: Option<bool>,
    /// Verification status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_status: Option<VerificationStatus>,
}

/// Policies associated with an identity.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IdentityPolicies {
    /// Map of policy names to policy documents.
    pub policies: HashMap<String, String>,
}

impl IdentityPolicies {
    /// Create a new empty policies map.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a policy.
    pub fn add_policy(mut self, name: impl Into<String>, policy: impl Into<String>) -> Self {
        self.policies.insert(name.into(), policy.into());
        self
    }
}

/// DKIM signing attributes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DkimSigningAttributes {
    /// Domain signing selector.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_signing_selector: Option<String>,
    /// Domain signing private key.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_signing_private_key: Option<String>,
    /// Next signing key length.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_signing_key_length: Option<DkimSigningKeyLength>,
}

/// Email identity details.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmailIdentity {
    /// Identity type.
    pub identity_type: IdentityType,
    /// Identity name.
    pub identity_name: String,
    /// Whether sending is enabled.
    pub sending_enabled: bool,
    /// Verification status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_status: Option<VerificationStatus>,
    /// DKIM attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dkim_attributes: Option<DkimAttributes>,
    /// MAIL FROM attributes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_from_attributes: Option<MailFromAttributes>,
    /// Feedback forwarding status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_forwarding_status: Option<bool>,
    /// Configuration set name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_set_name: Option<String>,
    /// Tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
}

/// Tag for resources.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Tag {
    /// Tag key.
    pub key: String,
    /// Tag value.
    pub value: String,
}

impl Tag {
    /// Create a new tag.
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            value: value.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_type() {
        assert_eq!(IdentityType::EmailAddress.as_str(), "EMAIL_ADDRESS");
        assert_eq!(IdentityType::Domain.as_str(), "DOMAIN");
    }

    #[test]
    fn test_dkim_signing_key_length() {
        assert_eq!(DkimSigningKeyLength::Rsa1024Bit.as_str(), "RSA_1024_BIT");
        assert_eq!(DkimSigningKeyLength::Rsa2048Bit.as_str(), "RSA_2048_BIT");
    }

    #[test]
    fn test_verification_status() {
        assert!(VerificationStatus::Success.is_verified());
        assert!(!VerificationStatus::Pending.is_verified());
        assert!(VerificationStatus::Failed.is_failed());
        assert!(VerificationStatus::Pending.is_pending());
    }

    #[test]
    fn test_mail_from_attributes() {
        let attrs = MailFromAttributes::new(
            "mail.example.com",
            BehaviorOnMxFailure::UseDefaultValue,
        );
        assert_eq!(attrs.mail_from_domain, "mail.example.com");
        assert_eq!(
            attrs.behavior_on_mx_failure,
            BehaviorOnMxFailure::UseDefaultValue
        );
    }

    #[test]
    fn test_tag_creation() {
        let tag = Tag::new("Environment", "Production");
        assert_eq!(tag.key, "Environment");
        assert_eq!(tag.value, "Production");
    }
}
