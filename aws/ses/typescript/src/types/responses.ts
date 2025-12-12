/**
 * AWS SES Response Types
 *
 * This module contains type definitions for all API response types in AWS SES v2.
 */

import type {
  BulkEmailEntryResult
} from './email.js';
import type {
  EmailIdentity,
  IdentityInfo,
  DkimAttributes,
  Tag
} from './identity.js';
import type {
  ConfigurationSet,
  EventDestination,
  ConfigurationSetSummary
} from './configuration.js';
import type {
  SuppressedDestination,
  SuppressedDestinationSummary,
  SuppressionAttributes,
  SuppressionReason
} from './suppression.js';
import type {
  Contact,
  ContactList,
  ContactListSummary
} from './contacts.js';

/**
 * Response from sending an email.
 */
export interface SendEmailResponse {
  /** The unique message identifier */
  messageId?: string;
}

/**
 * Response from sending a raw email.
 */
export interface SendRawEmailResponse {
  /** The unique message identifier */
  messageId?: string;
}

/**
 * Response from sending bulk emails.
 */
export interface SendBulkEmailResponse {
  /** Results for each bulk email entry */
  bulkEmailEntryResults: BulkEmailEntryResult[];
}

/**
 * Response from creating an email identity.
 */
export interface CreateEmailIdentityResponse {
  /** The type of identity created */
  identityType?: 'EMAIL_ADDRESS' | 'DOMAIN' | 'MANAGED_DOMAIN';
  /** Whether the identity is verified */
  verifiedForSendingStatus?: boolean;
  /** DKIM attributes for the identity */
  dkimAttributes?: DkimAttributes;
}

/**
 * Response from deleting an email identity.
 */
export interface DeleteEmailIdentityResponse {
  // Empty response
}

/**
 * Response from getting email identity details.
 */
export interface GetEmailIdentityResponse extends EmailIdentity {
  // Inherits all properties from EmailIdentity
}

/**
 * Response from listing email identities.
 */
export interface ListEmailIdentitiesResponse {
  /** List of email identities */
  emailIdentities?: IdentityInfo[];
  /** Token for retrieving the next page of results */
  nextToken?: string;
}

/**
 * Response from putting email identity DKIM attributes.
 */
export interface PutEmailIdentityDkimAttributesResponse {
  // Empty response
}

/**
 * Response from putting email identity DKIM signing attributes.
 */
export interface PutEmailIdentityDkimSigningAttributesResponse {
  /** DKIM status */
  dkimStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TEMPORARY_FAILURE' | 'NOT_STARTED';
  /** DKIM tokens for DNS verification */
  dkimTokens?: string[];
}

/**
 * Response from putting email identity feedback attributes.
 */
export interface PutEmailIdentityFeedbackAttributesResponse {
  // Empty response
}

/**
 * Response from putting email identity mail from attributes.
 */
export interface PutEmailIdentityMailFromAttributesResponse {
  // Empty response
}

/**
 * Response from putting email identity configuration set attributes.
 */
export interface PutEmailIdentityConfigurationSetAttributesResponse {
  // Empty response
}

/**
 * Response from creating a configuration set.
 */
export interface CreateConfigurationSetResponse {
  // Empty response
}

/**
 * Response from deleting a configuration set.
 */
export interface DeleteConfigurationSetResponse {
  // Empty response
}

/**
 * Response from getting configuration set details.
 */
export interface GetConfigurationSetResponse extends ConfigurationSet {
  // Inherits all properties from ConfigurationSet
}

/**
 * Response from listing configuration sets.
 */
export interface ListConfigurationSetsResponse {
  /** List of configuration sets */
  configurationSets?: ConfigurationSetSummary[];
  /** Token for retrieving the next page of results */
  nextToken?: string;
}

/**
 * Response from putting configuration set delivery options.
 */
export interface PutConfigurationSetDeliveryOptionsResponse {
  // Empty response
}

/**
 * Response from putting configuration set reputation options.
 */
export interface PutConfigurationSetReputationOptionsResponse {
  // Empty response
}

/**
 * Response from putting configuration set sending options.
 */
export interface PutConfigurationSetSendingOptionsResponse {
  // Empty response
}

/**
 * Response from putting configuration set suppression options.
 */
export interface PutConfigurationSetSuppressionOptionsResponse {
  // Empty response
}

/**
 * Response from putting configuration set tracking options.
 */
export interface PutConfigurationSetTrackingOptionsResponse {
  // Empty response
}

/**
 * Response from creating a configuration set event destination.
 */
export interface CreateConfigurationSetEventDestinationResponse {
  // Empty response
}

/**
 * Response from updating a configuration set event destination.
 */
export interface UpdateConfigurationSetEventDestinationResponse {
  // Empty response
}

/**
 * Response from deleting a configuration set event destination.
 */
export interface DeleteConfigurationSetEventDestinationResponse {
  // Empty response
}

/**
 * Response from getting configuration set event destinations.
 */
export interface GetConfigurationSetEventDestinationsResponse {
  /** List of event destinations */
  eventDestinations?: EventDestination[];
}

/**
 * Response from putting a suppressed destination.
 */
export interface PutSuppressedDestinationResponse {
  // Empty response
}

/**
 * Response from deleting a suppressed destination.
 */
export interface DeleteSuppressedDestinationResponse {
  // Empty response
}

/**
 * Response from getting a suppressed destination.
 */
export interface GetSuppressedDestinationResponse extends SuppressedDestination {
  // Inherits all properties from SuppressedDestination
}

/**
 * Response from listing suppressed destinations.
 */
export interface ListSuppressedDestinationsResponse {
  /** List of suppressed destinations */
  suppressedDestinationSummaries?: SuppressedDestinationSummary[];
  /** Token for retrieving the next page of results */
  nextToken?: string;
}

/**
 * Response from creating a contact list.
 */
export interface CreateContactListResponse {
  // Empty response
}

/**
 * Response from deleting a contact list.
 */
export interface DeleteContactListResponse {
  // Empty response
}

/**
 * Response from getting a contact list.
 */
export interface GetContactListResponse extends ContactList {
  // Inherits all properties from ContactList
}

/**
 * Response from listing contact lists.
 */
export interface ListContactListsResponse {
  /** List of contact lists */
  contactLists?: ContactListSummary[];
  /** Token for retrieving the next page of results */
  nextToken?: string;
}

/**
 * Response from updating a contact list.
 */
export interface UpdateContactListResponse {
  // Empty response
}

/**
 * Response from creating a contact.
 */
export interface CreateContactResponse {
  // Empty response
}

/**
 * Response from deleting a contact.
 */
export interface DeleteContactResponse {
  // Empty response
}

/**
 * Response from getting a contact.
 */
export interface GetContactResponse extends Contact {
  // Inherits all properties from Contact
}

/**
 * Response from listing contacts.
 */
export interface ListContactsResponse {
  /** List of contacts */
  contacts?: Contact[];
  /** Token for retrieving the next page of results */
  nextToken?: string;
}

/**
 * Response from updating a contact.
 */
export interface UpdateContactResponse {
  // Empty response
}

/**
 * Response from getting account details.
 */
export interface GetAccountResponse {
  /** Whether the account has production access enabled */
  productionAccessEnabled?: boolean;
  /** The sending quota for the account */
  sendQuota?: SendQuota;
  /** Whether sending is enabled for the account */
  sendingEnabled?: boolean;
  /** Whether the account is in a dedicated IP pool */
  dedicatedIpAutoWarmupEnabled?: boolean;
  /** The enforcement status of the account */
  enforcementStatus?: string;
  /** Details about the account */
  details?: AccountDetails;
  /** VDM attributes for the account */
  vdmAttributes?: VdmAttributes;
}

/**
 * Represents the sending quota for an account.
 */
export interface SendQuota {
  /** Maximum number of emails that can be sent in 24 hours */
  max24HourSend?: number;
  /** Maximum send rate (emails per second) */
  maxSendRate?: number;
  /** Number of emails sent in the last 24 hours */
  sentLast24Hours?: number;
}

/**
 * Represents account details.
 */
export interface AccountDetails {
  /** The type of email the account sends */
  mailType?: 'MARKETING' | 'TRANSACTIONAL';
  /** The website URL */
  websiteURL?: string;
  /** The contact language */
  contactLanguage?: 'EN' | 'JA';
  /** The use case description */
  useCaseDescription?: string;
  /** Additional contact email addresses */
  additionalContactEmailAddresses?: string[];
  /** The review details */
  reviewDetails?: ReviewDetails;
}

/**
 * Represents review details for an account.
 */
export interface ReviewDetails {
  /** The status of the review */
  status?: 'PENDING' | 'FAILED' | 'GRANTED' | 'DENIED';
  /** The case ID if a case was created */
  caseId?: string;
}

/**
 * Represents VDM attributes.
 */
export interface VdmAttributes {
  /** The VDM status */
  vdmEnabled?: 'ENABLED' | 'DISABLED';
  /** Dashboard attributes */
  dashboardAttributes?: DashboardAttributes;
  /** Guardian attributes */
  guardianAttributes?: GuardianAttributes;
}

/**
 * Represents dashboard attributes.
 */
export interface DashboardAttributes {
  /** The engagement metrics status */
  engagementMetrics?: 'ENABLED' | 'DISABLED';
}

/**
 * Represents guardian attributes.
 */
export interface GuardianAttributes {
  /** The optimized shared delivery status */
  optimizedSharedDelivery?: 'ENABLED' | 'DISABLED';
}

/**
 * Response from putting account details.
 */
export interface PutAccountDetailsResponse {
  // Empty response
}

/**
 * Response from putting account suppression attributes.
 */
export interface PutAccountSuppressionAttributesResponse {
  // Empty response
}

/**
 * Response from getting account suppression attributes.
 */
export interface GetAccountSuppressionAttributesResponse {
  /** The suppression attributes */
  suppressionAttributes?: SuppressionAttributes;
}

/**
 * Response from putting account sending attributes.
 */
export interface PutAccountSendingAttributesResponse {
  // Empty response
}

/**
 * Response from putting account VDM attributes.
 */
export interface PutAccountVdmAttributesResponse {
  // Empty response
}

/**
 * Response from getting account VDM attributes.
 */
export interface GetAccountVdmAttributesResponse {
  /** VDM attributes for the account */
  vdmAttributes?: VdmAttributes;
}

/**
 * Response from creating an email template.
 */
export interface CreateEmailTemplateResponse {
  // Empty response
}

/**
 * Response from updating an email template.
 */
export interface UpdateEmailTemplateResponse {
  // Empty response
}

/**
 * Response from deleting an email template.
 */
export interface DeleteEmailTemplateResponse {
  // Empty response
}

/**
 * Response from getting an email template.
 */
export interface GetEmailTemplateResponse {
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
 * Response from listing email templates.
 */
export interface ListEmailTemplatesResponse {
  /** List of email templates */
  templatesMetadata?: EmailTemplateMetadata[];
  /** Token for retrieving the next page of results */
  nextToken?: string;
}

/**
 * Metadata about an email template.
 */
export interface EmailTemplateMetadata {
  /** The name of the template */
  templateName?: string;
  /** When the template was created */
  createdTimestamp?: Date;
}

/**
 * Response from test rendering an email template.
 */
export interface TestRenderEmailTemplateResponse {
  /** The rendered subject line */
  renderedSubject?: string;
  /** The rendered HTML body */
  renderedHtml?: string;
  /** The rendered text body */
  renderedText?: string;
}

/**
 * Response from tagging a resource.
 */
export interface TagResourceResponse {
  // Empty response
}

/**
 * Response from untagging a resource.
 */
export interface UntagResourceResponse {
  // Empty response
}

/**
 * Response from listing tags for a resource.
 */
export interface ListTagsForResourceResponse {
  /** The tags associated with the resource */
  tags?: Tag[];
}
