/**
 * AWS SES v2 TypeScript Types
 *
 * This module exports all type definitions for AWS Simple Email Service (SES) v2 API.
 *
 * @module @aws/ses/types
 */

// Email types
export type {
  EmailAddress,
  Destination,
  EmailContent,
  Content,
  Template,
  RawMessage,
  BulkEmailEntry,
  ReplacementEmailContent,
  ReplacementTemplate,
  MessageTag,
  Attachment,
  Body,
  Message,
  BulkEmailEntryResult,
} from './email.js';

export type {
  BulkEmailStatus,
} from './email.js';

// Identity types
export type {
  DkimAttributes,
  MailFromAttributes,
  EmailIdentity,
  IdentityInfo,
  Tag,
  DkimSigningAttributes,
  IdentityPolicy,
  VerificationInfo,
  SOARecord,
} from './identity.js';

export type {
  IdentityType,
  DkimStatus,
  VerificationStatus,
  DkimSigningKeyLength,
  BehaviorOnMxFailure,
  DkimSigningAttributesOrigin,
  MailFromDomainStatus,
  VerificationError,
} from './identity.js';

// Configuration types
export type {
  ConfigurationSet,
  DeliveryOptions,
  ReputationOptions,
  SendingOptions,
  TrackingOptions,
  SuppressionOptions,
  VdmOptions,
  DashboardOptions,
  GuardianOptions,
  EventDestination,
  KinesisFirehoseDestination,
  CloudWatchDestination,
  CloudWatchDimensionConfiguration,
  SnsDestination,
  PinpointDestination,
  EventBridgeDestination,
  ConfigurationSetSummary,
} from './configuration.js';

export type {
  TlsPolicy,
  SuppressionListReason,
  FeatureStatus,
  EventType,
  DimensionValueSource,
} from './configuration.js';

// Suppression types
export type {
  SuppressedDestination,
  SuppressedDestinationSummary,
  SuppressedDestinationAttributes,
  SuppressionAttributes,
  SuppressionListDestination,
} from './suppression.js';

export type {
  SuppressionReason,
  SuppressionListImportAction,
} from './suppression.js';

// Contact types
export type {
  Contact,
  ContactList,
  Topic,
  TopicPreference,
  ContactListSummary,
  ListContactsFilter,
  TopicFilter,
} from './contacts.js';

export type {
  SubscriptionStatus,
} from './contacts.js';

// Request types
export type {
  SendEmailRequest,
  SendRawEmailRequest,
  SendBulkEmailRequest,
  CreateEmailIdentityRequest,
  DeleteEmailIdentityRequest,
  GetEmailIdentityRequest,
  ListEmailIdentitiesRequest,
  PutEmailIdentityDkimAttributesRequest,
  PutEmailIdentityDkimSigningAttributesRequest,
  PutEmailIdentityFeedbackAttributesRequest,
  PutEmailIdentityMailFromAttributesRequest,
  PutEmailIdentityConfigurationSetAttributesRequest,
  CreateConfigurationSetRequest,
  DeleteConfigurationSetRequest,
  GetConfigurationSetRequest,
  ListConfigurationSetsRequest,
  PutConfigurationSetDeliveryOptionsRequest,
  PutConfigurationSetReputationOptionsRequest,
  PutConfigurationSetSendingOptionsRequest,
  PutConfigurationSetSuppressionOptionsRequest,
  PutConfigurationSetTrackingOptionsRequest,
  CreateConfigurationSetEventDestinationRequest,
  UpdateConfigurationSetEventDestinationRequest,
  DeleteConfigurationSetEventDestinationRequest,
  GetConfigurationSetEventDestinationsRequest,
  PutSuppressedDestinationRequest,
  DeleteSuppressedDestinationRequest,
  GetSuppressedDestinationRequest,
  ListSuppressedDestinationsRequest,
  CreateContactListRequest,
  DeleteContactListRequest,
  GetContactListRequest,
  ListContactListsRequest,
  UpdateContactListRequest,
  CreateContactRequest,
  DeleteContactRequest,
  GetContactRequest,
  ListContactsRequest,
  UpdateContactRequest,
  GetAccountRequest,
  PutAccountDetailsRequest,
  PutAccountSuppressionAttributesRequest,
  GetAccountSuppressionAttributesRequest,
  PutAccountSendingAttributesRequest,
  PutAccountVdmAttributesRequest,
  GetAccountVdmAttributesRequest,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  DeleteEmailTemplateRequest,
  GetEmailTemplateRequest,
  ListEmailTemplatesRequest,
  TestRenderEmailTemplateRequest,
  ListManagementOptions,
  EmailTemplateContent,
} from './requests.js';

export type {
  MailType,
  ContactLanguage,
} from './requests.js';

// Response types
export type {
  SendEmailResponse,
  SendRawEmailResponse,
  SendBulkEmailResponse,
  CreateEmailIdentityResponse,
  DeleteEmailIdentityResponse,
  GetEmailIdentityResponse,
  ListEmailIdentitiesResponse,
  PutEmailIdentityDkimAttributesResponse,
  PutEmailIdentityDkimSigningAttributesResponse,
  PutEmailIdentityFeedbackAttributesResponse,
  PutEmailIdentityMailFromAttributesResponse,
  PutEmailIdentityConfigurationSetAttributesResponse,
  CreateConfigurationSetResponse,
  DeleteConfigurationSetResponse,
  GetConfigurationSetResponse,
  ListConfigurationSetsResponse,
  PutConfigurationSetDeliveryOptionsResponse,
  PutConfigurationSetReputationOptionsResponse,
  PutConfigurationSetSendingOptionsResponse,
  PutConfigurationSetSuppressionOptionsResponse,
  PutConfigurationSetTrackingOptionsResponse,
  CreateConfigurationSetEventDestinationResponse,
  UpdateConfigurationSetEventDestinationResponse,
  DeleteConfigurationSetEventDestinationResponse,
  GetConfigurationSetEventDestinationsResponse,
  PutSuppressedDestinationResponse,
  DeleteSuppressedDestinationResponse,
  GetSuppressedDestinationResponse,
  ListSuppressedDestinationsResponse,
  CreateContactListResponse,
  DeleteContactListResponse,
  GetContactListResponse,
  ListContactListsResponse,
  UpdateContactListResponse,
  CreateContactResponse,
  DeleteContactResponse,
  GetContactResponse,
  ListContactsResponse,
  UpdateContactResponse,
  GetAccountResponse,
  PutAccountDetailsResponse,
  PutAccountSuppressionAttributesResponse,
  GetAccountSuppressionAttributesResponse,
  PutAccountSendingAttributesResponse,
  PutAccountVdmAttributesResponse,
  GetAccountVdmAttributesResponse,
  CreateEmailTemplateResponse,
  UpdateEmailTemplateResponse,
  DeleteEmailTemplateResponse,
  GetEmailTemplateResponse,
  ListEmailTemplatesResponse,
  TestRenderEmailTemplateResponse,
  TagResourceResponse,
  UntagResourceResponse,
  ListTagsForResourceResponse,
  SendQuota,
  AccountDetails,
  ReviewDetails,
  VdmAttributes,
  DashboardAttributes,
  GuardianAttributes,
  EmailTemplateMetadata,
} from './responses.js';
