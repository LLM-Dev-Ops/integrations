//! Configuration set types for SES v2.
//!
//! Configuration sets allow you to customize and analyze email sending behavior.

use serde::{Deserialize, Serialize};

/// A configuration set is a set of rules that you can apply to the emails you send.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ConfigurationSet {
    /// The name of the configuration set.
    pub configuration_set_name: String,
    /// Delivery options for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_options: Option<DeliveryOptions>,
    /// Reputation options for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reputation_options: Option<ReputationOptions>,
    /// Sending options for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_options: Option<SendingOptions>,
    /// Tracking options for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking_options: Option<TrackingOptions>,
    /// Suppression options for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppression_options: Option<SuppressionOptions>,
    /// VDM (Virtual Deliverability Manager) options.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vdm_options: Option<VdmOptions>,
}

impl ConfigurationSet {
    /// Create a new configuration set with the given name.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            configuration_set_name: name.into(),
            delivery_options: None,
            reputation_options: None,
            sending_options: None,
            tracking_options: None,
            suppression_options: None,
            vdm_options: None,
        }
    }

    /// Set delivery options.
    pub fn with_delivery_options(mut self, options: DeliveryOptions) -> Self {
        self.delivery_options = Some(options);
        self
    }

    /// Set reputation options.
    pub fn with_reputation_options(mut self, options: ReputationOptions) -> Self {
        self.reputation_options = Some(options);
        self
    }

    /// Set sending options.
    pub fn with_sending_options(mut self, options: SendingOptions) -> Self {
        self.sending_options = Some(options);
        self
    }

    /// Set tracking options.
    pub fn with_tracking_options(mut self, options: TrackingOptions) -> Self {
        self.tracking_options = Some(options);
        self
    }

    /// Set suppression options.
    pub fn with_suppression_options(mut self, options: SuppressionOptions) -> Self {
        self.suppression_options = Some(options);
        self
    }

    /// Set VDM options.
    pub fn with_vdm_options(mut self, options: VdmOptions) -> Self {
        self.vdm_options = Some(options);
        self
    }
}

/// Delivery options for a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeliveryOptions {
    /// Specifies whether messages that use the configuration set are required to use TLS.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls_policy: Option<TlsPolicy>,
    /// The name of the dedicated IP pool to associate with the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_pool_name: Option<String>,
}

impl DeliveryOptions {
    /// Create new delivery options.
    pub fn new() -> Self {
        Self {
            tls_policy: None,
            sending_pool_name: None,
        }
    }

    /// Set TLS policy.
    pub fn with_tls_policy(mut self, policy: TlsPolicy) -> Self {
        self.tls_policy = Some(policy);
        self
    }

    /// Set sending pool name.
    pub fn with_sending_pool(mut self, pool_name: impl Into<String>) -> Self {
        self.sending_pool_name = Some(pool_name.into());
        self
    }
}

impl Default for DeliveryOptions {
    fn default() -> Self {
        Self::new()
    }
}

/// TLS policy for email sending.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TlsPolicy {
    /// Require TLS for all connections.
    Require,
    /// Use TLS if available, but allow unencrypted connections.
    Optional,
}

/// Reputation metrics options for a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ReputationOptions {
    /// If true, reputation metrics are enabled for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reputation_metrics_enabled: Option<bool>,
    /// The date and time when reputation metrics were last reset.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_fresh_start: Option<String>,
}

impl ReputationOptions {
    /// Create new reputation options with metrics enabled.
    pub fn new(enabled: bool) -> Self {
        Self {
            reputation_metrics_enabled: Some(enabled),
            last_fresh_start: None,
        }
    }

    /// Enable reputation metrics.
    pub fn enabled() -> Self {
        Self::new(true)
    }

    /// Disable reputation metrics.
    pub fn disabled() -> Self {
        Self::new(false)
    }
}

/// Sending options for a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SendingOptions {
    /// If true, email sending is enabled for the configuration set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sending_enabled: Option<bool>,
}

impl SendingOptions {
    /// Create new sending options.
    pub fn new(enabled: bool) -> Self {
        Self {
            sending_enabled: Some(enabled),
        }
    }

    /// Create sending options with sending enabled.
    pub fn enabled() -> Self {
        Self::new(true)
    }

    /// Create sending options with sending disabled.
    pub fn disabled() -> Self {
        Self::new(false)
    }
}

/// Tracking options for a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TrackingOptions {
    /// The domain to use for tracking open and click events.
    pub custom_redirect_domain: String,
}

impl TrackingOptions {
    /// Create new tracking options with a custom redirect domain.
    pub fn new(domain: impl Into<String>) -> Self {
        Self {
            custom_redirect_domain: domain.into(),
        }
    }
}

/// Suppression list options for a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SuppressionOptions {
    /// A list of reasons for which email addresses should be suppressed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppressed_reasons: Option<Vec<SuppressionListReason>>,
}

impl SuppressionOptions {
    /// Create new suppression options.
    pub fn new() -> Self {
        Self {
            suppressed_reasons: None,
        }
    }

    /// Add a suppression reason.
    pub fn add_reason(mut self, reason: SuppressionListReason) -> Self {
        self.suppressed_reasons
            .get_or_insert_with(Vec::new)
            .push(reason);
        self
    }

    /// Set suppression reasons.
    pub fn with_reasons(mut self, reasons: Vec<SuppressionListReason>) -> Self {
        self.suppressed_reasons = Some(reasons);
        self
    }
}

impl Default for SuppressionOptions {
    fn default() -> Self {
        Self::new()
    }
}

/// Reasons for suppressing email addresses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SuppressionListReason {
    /// The email bounced.
    Bounce,
    /// The recipient complained.
    Complaint,
}

/// Virtual Deliverability Manager (VDM) options.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct VdmOptions {
    /// Dashboard options for VDM.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dashboard_options: Option<DashboardOptions>,
    /// Guardian options for VDM.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guardian_options: Option<GuardianOptions>,
}

/// Dashboard options for VDM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DashboardOptions {
    /// Whether the VDM dashboard is enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engagement_metrics: Option<FeatureStatus>,
}

/// Guardian options for VDM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GuardianOptions {
    /// Whether optimized shared delivery is enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optimized_shared_delivery: Option<FeatureStatus>,
}

/// Status of a VDM feature.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FeatureStatus {
    /// Feature is enabled.
    Enabled,
    /// Feature is disabled.
    Disabled,
}

/// Event destination for a configuration set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EventDestination {
    /// The name of the event destination.
    pub name: String,
    /// If true, the event destination is enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// The types of events to publish to the event destination.
    pub matching_event_types: Vec<EventType>,
    /// CloudWatch destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_watch_destination: Option<CloudWatchDestination>,
    /// Kinesis Firehose destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kinesis_firehose_destination: Option<KinesisFirehoseDestination>,
    /// Amazon Pinpoint destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinpoint_destination: Option<PinpointDestination>,
    /// SNS destination.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sns_destination: Option<SnsDestination>,
}

impl EventDestination {
    /// Create a new event destination.
    pub fn new(name: impl Into<String>, event_types: Vec<EventType>) -> Self {
        Self {
            name: name.into(),
            enabled: Some(true),
            matching_event_types: event_types,
            cloud_watch_destination: None,
            kinesis_firehose_destination: None,
            pinpoint_destination: None,
            sns_destination: None,
        }
    }

    /// Set enabled status.
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = Some(enabled);
        self
    }

    /// Set CloudWatch destination.
    pub fn with_cloudwatch(mut self, destination: CloudWatchDestination) -> Self {
        self.cloud_watch_destination = Some(destination);
        self
    }

    /// Set Kinesis Firehose destination.
    pub fn with_kinesis_firehose(mut self, destination: KinesisFirehoseDestination) -> Self {
        self.kinesis_firehose_destination = Some(destination);
        self
    }

    /// Set Pinpoint destination.
    pub fn with_pinpoint(mut self, destination: PinpointDestination) -> Self {
        self.pinpoint_destination = Some(destination);
        self
    }

    /// Set SNS destination.
    pub fn with_sns(mut self, destination: SnsDestination) -> Self {
        self.sns_destination = Some(destination);
        self
    }
}

/// Types of email events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventType {
    /// Email was sent successfully.
    Send,
    /// Email was rejected.
    Reject,
    /// Email bounced.
    Bounce,
    /// Recipient complained.
    Complaint,
    /// Email was delivered.
    Delivery,
    /// Email was opened.
    Open,
    /// Link in email was clicked.
    Click,
    /// Email rendering failed.
    RenderingFailure,
    /// Email was delivered with delay.
    DeliveryDelay,
    /// Subscription event.
    Subscription,
}

/// CloudWatch destination for event publishing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CloudWatchDestination {
    /// The CloudWatch dimensions to publish metrics for.
    pub dimension_configurations: Vec<CloudWatchDimensionConfiguration>,
}

impl CloudWatchDestination {
    /// Create a new CloudWatch destination.
    pub fn new(dimensions: Vec<CloudWatchDimensionConfiguration>) -> Self {
        Self {
            dimension_configurations: dimensions,
        }
    }
}

/// CloudWatch dimension configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CloudWatchDimensionConfiguration {
    /// The name of the CloudWatch dimension.
    pub dimension_name: String,
    /// The default value of the dimension.
    pub default_dimension_value: String,
    /// The source of the dimension value.
    pub dimension_value_source: DimensionValueSource,
}

impl CloudWatchDimensionConfiguration {
    /// Create a new dimension configuration.
    pub fn new(
        name: impl Into<String>,
        default_value: impl Into<String>,
        source: DimensionValueSource,
    ) -> Self {
        Self {
            dimension_name: name.into(),
            default_dimension_value: default_value.into(),
            dimension_value_source: source,
        }
    }
}

/// Source for dimension values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DimensionValueSource {
    /// From message tag.
    MessageTag,
    /// From email header.
    EmailHeader,
    /// From link tag.
    LinkTag,
}

/// Kinesis Firehose destination for event publishing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct KinesisFirehoseDestination {
    /// The ARN of the IAM role that SES uses to publish events to the Kinesis Firehose stream.
    pub iam_role_arn: String,
    /// The ARN of the Kinesis Firehose stream.
    pub delivery_stream_arn: String,
}

impl KinesisFirehoseDestination {
    /// Create a new Kinesis Firehose destination.
    pub fn new(iam_role_arn: impl Into<String>, delivery_stream_arn: impl Into<String>) -> Self {
        Self {
            iam_role_arn: iam_role_arn.into(),
            delivery_stream_arn: delivery_stream_arn.into(),
        }
    }
}

/// Amazon Pinpoint destination for event publishing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PinpointDestination {
    /// The ARN of the Pinpoint application.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub application_arn: Option<String>,
}

impl PinpointDestination {
    /// Create a new Pinpoint destination.
    pub fn new(application_arn: impl Into<String>) -> Self {
        Self {
            application_arn: Some(application_arn.into()),
        }
    }
}

/// SNS destination for event publishing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SnsDestination {
    /// The ARN of the SNS topic.
    pub topic_arn: String,
}

impl SnsDestination {
    /// Create a new SNS destination.
    pub fn new(topic_arn: impl Into<String>) -> Self {
        Self {
            topic_arn: topic_arn.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_configuration_set_creation() {
        let config_set = ConfigurationSet::new("my-config-set")
            .with_sending_options(SendingOptions::enabled())
            .with_reputation_options(ReputationOptions::enabled());

        assert_eq!(config_set.configuration_set_name, "my-config-set");
        assert!(config_set.sending_options.is_some());
        assert!(config_set.reputation_options.is_some());
    }

    #[test]
    fn test_delivery_options() {
        let options = DeliveryOptions::new()
            .with_tls_policy(TlsPolicy::Require)
            .with_sending_pool("my-pool");

        assert_eq!(options.tls_policy, Some(TlsPolicy::Require));
        assert_eq!(options.sending_pool_name, Some("my-pool".to_string()));
    }

    #[test]
    fn test_event_destination() {
        let destination = EventDestination::new(
            "my-destination",
            vec![EventType::Send, EventType::Bounce],
        )
        .with_sns(SnsDestination::new("arn:aws:sns:us-east-1:123456789012:my-topic"));

        assert_eq!(destination.name, "my-destination");
        assert_eq!(destination.matching_event_types.len(), 2);
        assert!(destination.sns_destination.is_some());
    }

    #[test]
    fn test_suppression_options() {
        let options = SuppressionOptions::new()
            .add_reason(SuppressionListReason::Bounce)
            .add_reason(SuppressionListReason::Complaint);

        assert_eq!(options.suppressed_reasons.as_ref().unwrap().len(), 2);
    }
}
