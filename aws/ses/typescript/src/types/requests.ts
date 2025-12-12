/**
 * AWS SES Request Types
 *
 * This module contains type definitions for all API request types in AWS SES v2.
 */

import type {
  EmailContent,
  Destination,
  MessageTag,
  BulkEmailEntry,
  RawMessage,
  Message
} from './email.js';
import type {
  DkimSigningAttributes,
  Tag,
  IdentityType
} from './identity.js';
import type {
  ConfigurationSet,
  EventDestination,
  DeliveryOptions,
  ReputationOptions,
  SendingOptions,
  SuppressionOptions,
  TrackingOptions,
  VdmOptions
} from './configuration.js';
import type { SuppressionReason } from './suppression.js';
import type {
  Contact,
  Topic,
  TopicPreference,
  ListContactsFilter
} from './contacts.js';

/**
 * Request to send an email.
 */
export interface SendEmailRequest {
  /** The email address to send from */
  fromEmailAddress?: string;
  /** The ARN of the email identity to use */
  fromEmailAddressIdentityArn?: string;
  /** The destination for the email */
  destination?: Destination;
  /** The reply-to addresses */
  replyToAddresses?: string[];
  /** The address to receive feedback notifications */
  feedbackForwardingEmailAddress?: string;
  /** The ARN of the feedback forwarding identity */
  feedbackForwardingEmailAddressIdentityArn?: string;
  /** The email content */
  content: EmailContent;
  /** Message tags for categorization */
  emailTags?: MessageTag[];
  /** The configuration set to use */
  configurationSetName?: string;
  /** List management options */
  listManagementOptions?: ListManagementOptions;
}

/**
 * List management options for emails.
 */
export interface ListManagementOptions {
  /** The name of the contact list */
  contactListName: string;
  /** The name of the topic */
  topicName?: string;
}

/**
 * Request to send a raw email.
 */
export interface SendRawEmailRequest {
  /** The email address to send from */
  fromEmailAddress?: string;
  /** The ARN of the email identity to use */
  fromEmailAddressIdentityArn?: string;
  /** The destination addresses */
  destinations?: string[];
  /** The raw message data */
  rawMessage: RawMessage;
  /** The configuration set to use */
  configurationSetName?: string;
  /** Message tags for categorization */
  emailTags?: MessageTag[];
  /** The address to receive feedback notifications */
  feedbackForwardingEmailAddress?: string;
  /** The ARN of the feedback forwarding identity */
  feedbackForwardingEmailAddressIdentityArn?: string;
}

/**
 * Request to send bulk emails.
 */
export interface SendBulkEmailRequest {
  /** The email address to send from */
  fromEmailAddress?: string;
  /** The ARN of the email identity to use */
  fromEmailAddressIdentityArn?: string;
  /** The reply-to addresses */
  replyToAddresses?: string[];
  /** The address to receive feedback notifications */
  feedbackForwardingEmailAddress?: string;
  /** The ARN of the feedback forwarding identity */
  feedbackForwardingEmailAddressIdentityArn?: string;
  /** Default email tags to apply to all messages */
  defaultEmailTags?: MessageTag[];
  /** The default email content */
  defaultContent: EmailContent;
  /** The bulk email entries */
  bulkEmailEntries: BulkEmailEntry[];
  /** The configuration set to use */
  configurationSetName?: string;
}

/**
 * Request to create an email identity.
 */
export interface CreateEmailIdentityRequest {
  /** The email address or domain to verify */
  emailIdentity: string;
  /** Tags to associate with the identity */
  tags?: Tag[];
  /** DKIM signing attributes */
  dkimSigningAttributes?: DkimSigningAttributes;
  /** The configuration set to associate with the identity */
  configurationSetName?: string;
}

/**
 * Request to delete an email identity.
 */
export interface DeleteEmailIdentityRequest {
  /** The email address or domain to delete */
  emailIdentity: string;
}

/**
 * Request to get email identity details.
 */
export interface GetEmailIdentityRequest {
  /** The email address or domain to retrieve */
  emailIdentity: string;
}

/**
 * Request to list email identities.
 */
export interface ListEmailIdentitiesRequest {
  /** Token for pagination */
  nextToken?: string;
  /** Maximum number of results to return */
  pageSize?: number;
}

/**
 * Request to put email identity DKIM attributes.
 */
export interface PutEmailIdentityDkimAttributesRequest {
  /** The email address or domain */
  emailIdentity: string;
  /** Whether to enable DKIM signing */
  signingEnabled?: boolean;
}

/**
 * Request to put email identity DKIM signing attributes.
 */
export interface PutEmailIdentityDkimSigningAttributesRequest {
  /** The email address or domain */
  emailIdentity: string;
  /** The DKIM signing attributes */
  signingAttributes?: DkimSigningAttributes;
  /** The signing attributes origin */
  signingAttributesOrigin: 'AWS_SES' | 'EXTERNAL';
}

/**
 * Request to put email identity feedback attributes.
 */
export interface PutEmailIdentityFeedbackAttributesRequest {
  /** The email address or domain */
  emailIdentity: string;
  /** Whether email feedback forwarding is enabled */
  emailForwardingEnabled?: boolean;
}

/**
 * Request to put email identity mail from attributes.
 */
export interface PutEmailIdentityMailFromAttributesRequest {
  /** The email address or domain */
  emailIdentity: string;
  /** The custom MAIL FROM domain */
  mailFromDomain?: string;
  /** Behavior when MX record is not found */
  behaviorOnMxFailure?: 'USE_DEFAULT_VALUE' | 'REJECT_MESSAGE';
}

/**
 * Request to put email identity configuration set attributes.
 */
export interface PutEmailIdentityConfigurationSetAttributesRequest {
  /** The email address or domain */
  emailIdentity: string;
  /** The configuration set name */
  configurationSetName?: string;
}

/**
 * Request to create a configuration set.
 */
export interface CreateConfigurationSetRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** Tracking options */
  trackingOptions?: TrackingOptions;
  /** Delivery options */
  deliveryOptions?: DeliveryOptions;
  /** Reputation options */
  reputationOptions?: ReputationOptions;
  /** Sending options */
  sendingOptions?: SendingOptions;
  /** Suppression options */
  suppressionOptions?: SuppressionOptions;
  /** VDM options */
  vdmOptions?: VdmOptions;
  /** Tags to associate with the configuration set */
  tags?: Tag[];
}

/**
 * Request to delete a configuration set.
 */
export interface DeleteConfigurationSetRequest {
  /** The name of the configuration set */
  configurationSetName: string;
}

/**
 * Request to get configuration set details.
 */
export interface GetConfigurationSetRequest {
  /** The name of the configuration set */
  configurationSetName: string;
}

/**
 * Request to list configuration sets.
 */
export interface ListConfigurationSetsRequest {
  /** Token for pagination */
  nextToken?: string;
  /** Maximum number of results to return */
  pageSize?: number;
}

/**
 * Request to put configuration set delivery options.
 */
export interface PutConfigurationSetDeliveryOptionsRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** The TLS policy */
  tlsPolicy?: 'REQUIRE' | 'OPTIONAL';
  /** The sending pool name */
  sendingPoolName?: string;
}

/**
 * Request to put configuration set reputation options.
 */
export interface PutConfigurationSetReputationOptionsRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** Whether reputation metrics are enabled */
  reputationMetricsEnabled?: boolean;
}

/**
 * Request to put configuration set sending options.
 */
export interface PutConfigurationSetSendingOptionsRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** Whether sending is enabled */
  sendingEnabled?: boolean;
}

/**
 * Request to put configuration set suppression options.
 */
export interface PutConfigurationSetSuppressionOptionsRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** List of suppression reasons */
  suppressedReasons?: SuppressionReason[];
}

/**
 * Request to put configuration set tracking options.
 */
export interface PutConfigurationSetTrackingOptionsRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** The custom redirect domain */
  customRedirectDomain?: string;
}

/**
 * Request to create a configuration set event destination.
 */
export interface CreateConfigurationSetEventDestinationRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** The event destination name */
  eventDestinationName: string;
  /** The event destination configuration */
  eventDestination: EventDestination;
}

/**
 * Request to update a configuration set event destination.
 */
export interface UpdateConfigurationSetEventDestinationRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** The event destination name */
  eventDestinationName: string;
  /** The event destination configuration */
  eventDestination: EventDestination;
}

/**
 * Request to delete a configuration set event destination.
 */
export interface DeleteConfigurationSetEventDestinationRequest {
  /** The name of the configuration set */
  configurationSetName: string;
  /** The event destination name */
  eventDestinationName: string;
}

/**
 * Request to get configuration set event destinations.
 */
export interface GetConfigurationSetEventDestinationsRequest {
  /** The name of the configuration set */
  configurationSetName: string;
}

/**
 * Request to put a suppressed destination.
 */
export interface PutSuppressedDestinationRequest {
  /** The email address to suppress */
  emailAddress: string;
  /** The reason for suppression */
  reason: SuppressionReason;
}

/**
 * Request to delete a suppressed destination.
 */
export interface DeleteSuppressedDestinationRequest {
  /** The email address to remove from suppression list */
  emailAddress: string;
}

/**
 * Request to get a suppressed destination.
 */
export interface GetSuppressedDestinationRequest {
  /** The email address to retrieve */
  emailAddress: string;
}

/**
 * Request to list suppressed destinations.
 */
export interface ListSuppressedDestinationsRequest {
  /** Filter by suppression reason */
  reasons?: SuppressionReason[];
  /** Filter by start time */
  startDate?: Date;
  /** Filter by end time */
  endDate?: Date;
  /** Token for pagination */
  nextToken?: string;
  /** Maximum number of results to return */
  pageSize?: number;
}

/**
 * Request to create a contact list.
 */
export interface CreateContactListRequest {
  /** The name of the contact list */
  contactListName: string;
  /** Description of the contact list */
  description?: string;
  /** Topics associated with the contact list */
  topics?: Topic[];
  /** Tags to associate with the contact list */
  tags?: Tag[];
}

/**
 * Request to delete a contact list.
 */
export interface DeleteContactListRequest {
  /** The name of the contact list to delete */
  contactListName: string;
}

/**
 * Request to get a contact list.
 */
export interface GetContactListRequest {
  /** The name of the contact list */
  contactListName: string;
}

/**
 * Request to list contact lists.
 */
export interface ListContactListsRequest {
  /** Maximum number of results to return */
  pageSize?: number;
  /** Token for pagination */
  nextToken?: string;
}

/**
 * Request to update a contact list.
 */
export interface UpdateContactListRequest {
  /** The name of the contact list */
  contactListName: string;
  /** Topics to associate with the contact list */
  topics?: Topic[];
  /** Description of the contact list */
  description?: string;
}

/**
 * Request to create a contact.
 */
export interface CreateContactRequest {
  /** The name of the contact list */
  contactListName: string;
  /** The contact's email address */
  emailAddress: string;
  /** Topic preferences for the contact */
  topicPreferences?: TopicPreference[];
  /** Whether to unsubscribe from all topics */
  unsubscribeAll?: boolean;
  /** Additional attributes as a JSON string */
  attributesData?: string;
}

/**
 * Request to delete a contact.
 */
export interface DeleteContactRequest {
  /** The name of the contact list */
  contactListName: string;
  /** The contact's email address */
  emailAddress: string;
}

/**
 * Request to get a contact.
 */
export interface GetContactRequest {
  /** The name of the contact list */
  contactListName: string;
  /** The contact's email address */
  emailAddress: string;
}

/**
 * Request to list contacts.
 */
export interface ListContactsRequest {
  /** The name of the contact list */
  contactListName: string;
  /** Filter criteria */
  filter?: ListContactsFilter;
  /** Maximum number of results to return */
  pageSize?: number;
  /** Token for pagination */
  nextToken?: string;
}

/**
 * Request to update a contact.
 */
export interface UpdateContactRequest {
  /** The name of the contact list */
  contactListName: string;
  /** The contact's email address */
  emailAddress: string;
  /** Topic preferences for the contact */
  topicPreferences?: TopicPreference[];
  /** Whether to unsubscribe from all topics */
  unsubscribeAll?: boolean;
  /** Additional attributes as a JSON string */
  attributesData?: string;
}

/**
 * Request to get account details.
 */
export interface GetAccountRequest {
  // No parameters needed
}

/**
 * Request to put account details.
 */
export interface PutAccountDetailsRequest {
  /** The type of email your account will send */
  mailType?: MailType;
  /** The URL of your website */
  websiteURL?: string;
  /** The language you want to use for contacting AWS */
  contactLanguage?: ContactLanguage;
  /** The use case description */
  useCaseDescription?: string;
  /** Additional email addresses to contact */
  additionalContactEmailAddresses?: string[];
  /** Whether to review the latest decision */
  productionAccessEnabled?: boolean;
}

/**
 * The type of email being sent.
 */
export type MailType = 'MARKETING' | 'TRANSACTIONAL';

/**
 * The language for AWS contact.
 */
export type ContactLanguage = 'EN' | 'JA';

/**
 * Request to put account suppression attributes.
 */
export interface PutAccountSuppressionAttributesRequest {
  /** List of suppression reasons to enable at account level */
  suppressedReasons?: SuppressionReason[];
}

/**
 * Request to get account suppression attributes.
 */
export interface GetAccountSuppressionAttributesRequest {
  // No parameters needed
}

/**
 * Request to put account sending attributes.
 */
export interface PutAccountSendingAttributesRequest {
  /** Whether sending is enabled for the account */
  sendingEnabled?: boolean;
}

/**
 * Request to put account VDM attributes.
 */
export interface PutAccountVdmAttributesRequest {
  /** VDM attributes for the account */
  vdmAttributes: VdmOptions;
}

/**
 * Request to get account VDM attributes.
 */
export interface GetAccountVdmAttributesRequest {
  // No parameters needed
}

/**
 * Request to create an email template.
 */
export interface CreateEmailTemplateRequest {
  /** The name of the template */
  templateName: string;
  /** The content of the template */
  templateContent: EmailTemplateContent;
}

/**
 * Email template content.
 */
export interface EmailTemplateContent {
  /** The subject line of the template */
  subject?: string;
  /** The HTML body of the template */
  html?: string;
  /** The plain text body of the template */
  text?: string;
}

/**
 * Request to update an email template.
 */
export interface UpdateEmailTemplateRequest {
  /** The name of the template */
  templateName: string;
  /** The content of the template */
  templateContent: EmailTemplateContent;
}

/**
 * Request to delete an email template.
 */
export interface DeleteEmailTemplateRequest {
  /** The name of the template to delete */
  templateName: string;
}

/**
 * Request to get an email template.
 */
export interface GetEmailTemplateRequest {
  /** The name of the template */
  templateName: string;
}

/**
 * Request to list email templates.
 */
export interface ListEmailTemplatesRequest {
  /** Token for pagination */
  nextToken?: string;
  /** Maximum number of results to return */
  pageSize?: number;
}

/**
 * Request to test render an email template.
 */
export interface TestRenderEmailTemplateRequest {
  /** The name of the template */
  templateName: string;
  /** The template data as a JSON string */
  templateData: string;
}
