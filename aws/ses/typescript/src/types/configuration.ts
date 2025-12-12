/**
 * AWS SES Configuration Types
 *
 * This module contains type definitions for configuration sets and event destinations in AWS SES v2.
 */

/**
 * Represents a configuration set.
 */
export interface ConfigurationSet {
  /** The name of the configuration set */
  configurationSetName?: string;
  /** Delivery options for the configuration set */
  deliveryOptions?: DeliveryOptions;
  /** Reputation options for the configuration set */
  reputationOptions?: ReputationOptions;
  /** Sending options for the configuration set */
  sendingOptions?: SendingOptions;
  /** Tracking options for the configuration set */
  trackingOptions?: TrackingOptions;
  /** Suppression options for the configuration set */
  suppressionOptions?: SuppressionOptions;
  /** VDM (Virtual Deliverability Manager) options */
  vdmOptions?: VdmOptions;
  /** Tags associated with the configuration set */
  tags?: Tag[];
}

/**
 * Represents delivery options for a configuration set.
 */
export interface DeliveryOptions {
  /** The TLS policy to use */
  tlsPolicy?: TlsPolicy;
  /** The name of the dedicated IP pool to use */
  sendingPoolName?: string;
}

/**
 * The TLS policy for email delivery.
 */
export type TlsPolicy = 'REQUIRE' | 'OPTIONAL';

/**
 * Represents reputation options for a configuration set.
 */
export interface ReputationOptions {
  /** Whether reputation metrics are enabled */
  reputationMetricsEnabled?: boolean;
  /** The date when reputation metrics were last reset */
  lastFreshStart?: Date;
}

/**
 * Represents sending options for a configuration set.
 */
export interface SendingOptions {
  /** Whether sending is enabled */
  sendingEnabled?: boolean;
}

/**
 * Represents tracking options for a configuration set.
 */
export interface TrackingOptions {
  /** The custom redirect domain for tracking opens and clicks */
  customRedirectDomain?: string;
}

/**
 * Represents suppression options for a configuration set.
 */
export interface SuppressionOptions {
  /** List of suppression reasons to apply */
  suppressedReasons?: SuppressionListReason[];
}

/**
 * Suppression list reasons.
 */
export type SuppressionListReason = 'BOUNCE' | 'COMPLAINT';

/**
 * Represents VDM (Virtual Deliverability Manager) options.
 */
export interface VdmOptions {
  /** Dashboard options */
  dashboardOptions?: DashboardOptions;
  /** Guardian options */
  guardianOptions?: GuardianOptions;
}

/**
 * Represents dashboard options for VDM.
 */
export interface DashboardOptions {
  /** The engagement metrics status */
  engagementMetrics?: FeatureStatus;
}

/**
 * Represents guardian options for VDM.
 */
export interface GuardianOptions {
  /** The optimized shared delivery status */
  optimizedSharedDelivery?: FeatureStatus;
}

/**
 * Feature status.
 */
export type FeatureStatus = 'ENABLED' | 'DISABLED';

/**
 * Represents a tag for resource tagging.
 */
export interface Tag {
  /** The key of the tag */
  key: string;
  /** The value of the tag */
  value: string;
}

/**
 * Represents an event destination.
 */
export interface EventDestination {
  /** The name of the event destination */
  name: string;
  /** Whether the event destination is enabled */
  enabled?: boolean;
  /** The types of events to publish to the destination */
  matchingEventTypes: EventType[];
  /** Kinesis Firehose destination settings */
  kinesisFirehoseDestination?: KinesisFirehoseDestination;
  /** CloudWatch destination settings */
  cloudWatchDestination?: CloudWatchDestination;
  /** SNS destination settings */
  snsDestination?: SnsDestination;
  /** Pinpoint destination settings */
  pinpointDestination?: PinpointDestination;
  /** EventBridge destination settings */
  eventBridgeDestination?: EventBridgeDestination;
}

/**
 * Email event types.
 */
export type EventType = 'SEND' | 'REJECT' | 'BOUNCE' | 'COMPLAINT' | 'DELIVERY' |
  'OPEN' | 'CLICK' | 'RENDERING_FAILURE' | 'DELIVERY_DELAY' | 'SUBSCRIPTION';

/**
 * Represents a Kinesis Firehose destination.
 */
export interface KinesisFirehoseDestination {
  /** The ARN of the IAM role for Firehose */
  iamRoleArn: string;
  /** The ARN of the Kinesis Firehose delivery stream */
  deliveryStreamArn: string;
}

/**
 * Represents a CloudWatch destination.
 */
export interface CloudWatchDestination {
  /** CloudWatch dimension configurations */
  dimensionConfigurations: CloudWatchDimensionConfiguration[];
}

/**
 * Represents a CloudWatch dimension configuration.
 */
export interface CloudWatchDimensionConfiguration {
  /** The name of the CloudWatch dimension */
  dimensionName: string;
  /** The source of the dimension value */
  dimensionValueSource: DimensionValueSource;
  /** The default value of the dimension */
  defaultDimensionValue: string;
}

/**
 * The source of a dimension value.
 */
export type DimensionValueSource = 'MESSAGE_TAG' | 'EMAIL_HEADER' | 'LINK_TAG';

/**
 * Represents an SNS destination.
 */
export interface SnsDestination {
  /** The ARN of the SNS topic */
  topicArn: string;
}

/**
 * Represents a Pinpoint destination.
 */
export interface PinpointDestination {
  /** The Amazon Pinpoint application ARN */
  applicationArn?: string;
}

/**
 * Represents an EventBridge destination.
 */
export interface EventBridgeDestination {
  /** The ARN of the EventBridge event bus */
  eventBusArn: string;
}

/**
 * Represents a summary of a configuration set.
 */
export interface ConfigurationSetSummary {
  /** The name of the configuration set */
  configurationSetName?: string;
}
