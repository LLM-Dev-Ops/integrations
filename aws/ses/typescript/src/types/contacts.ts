/**
 * AWS SES Contact Types
 *
 * This module contains type definitions for contact list and contact management in AWS SES v2.
 */

/**
 * The subscription status of a contact.
 */
export type SubscriptionStatus = 'OPT_IN' | 'OPT_OUT';

/**
 * Represents a contact in a contact list.
 */
export interface Contact {
  /** The contact's email address */
  emailAddress?: string;
  /** The contact list to which the contact belongs */
  contactListName?: string;
  /** The contact's preference for a topic */
  topicPreferences?: TopicPreference[];
  /** The default topic preferences for the contact */
  topicDefaultPreferences?: TopicPreference[];
  /** Whether the contact has unsubscribed from all topics */
  unsubscribeAll?: boolean;
  /** Additional attributes associated with the contact */
  attributesData?: string;
  /** The timestamp when the contact was created */
  createdTimestamp?: Date;
  /** The timestamp when the contact was last updated */
  lastUpdatedTimestamp?: Date;
}

/**
 * Represents a contact's preference for a topic.
 */
export interface TopicPreference {
  /** The name of the topic */
  topicName: string;
  /** The contact's subscription status for the topic */
  subscriptionStatus: SubscriptionStatus;
}

/**
 * Represents a contact list.
 */
export interface ContactList {
  /** The name of the contact list */
  contactListName?: string;
  /** The description of the contact list */
  description?: string;
  /** The topics associated with the contact list */
  topics?: Topic[];
  /** The timestamp when the contact list was created */
  createdTimestamp?: Date;
  /** The timestamp when the contact list was last updated */
  lastUpdatedTimestamp?: Date;
  /** Tags associated with the contact list */
  tags?: Tag[];
}

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
 * Represents a topic in a contact list.
 */
export interface Topic {
  /** The name of the topic */
  topicName: string;
  /** The display name of the topic */
  displayName: string;
  /** A description of the topic */
  description?: string;
  /** The default subscription status for the topic */
  defaultSubscriptionStatus: SubscriptionStatus;
}

/**
 * Represents a summary of a contact list.
 */
export interface ContactListSummary {
  /** The name of the contact list */
  contactListName?: string;
  /** The timestamp when the contact list was last updated */
  lastUpdatedTimestamp?: Date;
}

/**
 * Filter for listing contacts.
 */
export interface ListContactsFilter {
  /** Filter by subscription status */
  filteredStatus?: SubscriptionStatus;
  /** Filter by topic preferences */
  topicFilter?: TopicFilter;
}

/**
 * Filter for topics.
 */
export interface TopicFilter {
  /** The name of the topic */
  topicName?: string;
  /** Whether to use default topic preferences if not explicitly set */
  useDefaultIfPreferenceUnavailable?: boolean;
}
