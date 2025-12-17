/**
 * HubSpot Engagement Types
 * Type definitions for notes, emails, calls, meetings, and tasks
 */

import type { Properties } from './objects.js';
import type { AssociationInput } from './associations.js';

/**
 * Engagement object types
 */
export type EngagementType = 'notes' | 'emails' | 'calls' | 'meetings' | 'tasks';

/**
 * Base engagement structure
 */
export interface Engagement {
  /** Unique engagement ID */
  id: string;

  /** Engagement type */
  type: EngagementType;

  /** Engagement properties */
  properties: EngagementProperties;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;

  /** Whether archived */
  archived: boolean;

  /** Associated object IDs */
  associations?: {
    contactIds?: string[];
    companyIds?: string[];
    dealIds?: string[];
    ticketIds?: string[];
  };
}

/**
 * Combined engagement properties for all types
 */
export interface EngagementProperties {
  // Index signature for dynamic properties
  [key: string]: string | number | boolean | null | undefined;
  // Common properties
  /** Timestamp of the engagement */
  hs_timestamp?: number | string;

  /** Owner user ID */
  hubspot_owner_id?: string;

  // Note properties
  /** Note body content */
  hs_note_body?: string;

  // Email properties
  /** Email subject line */
  hs_email_subject?: string;

  /** Email body text */
  hs_email_text?: string;

  /** Email HTML body */
  hs_email_html?: string;

  /** Email direction */
  hs_email_direction?: EmailDirection;

  /** Email status */
  hs_email_status?: EmailStatus;

  /** From email address */
  hs_email_from_email?: string;

  /** From name */
  hs_email_from_firstname?: string;

  /** From last name */
  hs_email_from_lastname?: string;

  /** To email addresses (comma-separated) */
  hs_email_to_email?: string;

  /** To names */
  hs_email_to_firstname?: string;

  /** To last names */
  hs_email_to_lastname?: string;

  /** CC email addresses */
  hs_email_cc_email?: string;

  /** BCC email addresses */
  hs_email_bcc_email?: string;

  /** Number of attachments */
  hs_email_attachment_count?: number | string;

  /** Email headers (JSON) */
  hs_email_headers?: string;

  // Call properties
  /** Call body/notes */
  hs_call_body?: string;

  /** Call duration in milliseconds */
  hs_call_duration?: number | string;

  /** Call status */
  hs_call_status?: CallStatus;

  /** Call outcome/disposition */
  hs_call_disposition?: string;

  /** From phone number */
  hs_call_from_number?: string;

  /** To phone number */
  hs_call_to_number?: string;

  /** Recording URL */
  hs_call_recording_url?: string;

  /** Call direction */
  hs_call_direction?: 'INBOUND' | 'OUTBOUND';

  // Meeting properties
  /** Meeting title */
  hs_meeting_title?: string;

  /** Meeting body/description */
  hs_meeting_body?: string;

  /** Meeting start time (Unix timestamp ms) */
  hs_meeting_start_time?: number | string;

  /** Meeting end time (Unix timestamp ms) */
  hs_meeting_end_time?: number | string;

  /** Meeting outcome */
  hs_meeting_outcome?: string;

  /** Meeting location */
  hs_meeting_location?: string;

  /** Meeting external URL (Zoom, etc.) */
  hs_meeting_external_url?: string;

  /** Meeting source (INTEGRATION, CRM, etc.) */
  hs_meeting_source?: string;

  /** Internal meeting notes */
  hs_internal_meeting_notes?: string;

  // Task properties
  /** Task subject/title */
  hs_task_subject?: string;

  /** Task body/description */
  hs_task_body?: string;

  /** Task status */
  hs_task_status?: TaskStatus;

  /** Task priority */
  hs_task_priority?: TaskPriority;

  /** Task type */
  hs_task_type?: TaskType;

  /** Task due date (Unix timestamp ms) */
  hs_task_due_date?: number | string;

  /** Task completion date */
  hs_task_completion_date?: string;

  /** Task reminder date */
  hs_task_reminders?: string;

  /** Task repeat interval */
  hs_task_repeat_interval?: string;

  /** Is task completed */
  hs_task_is_completed?: boolean | string;

  /** Queue membership IDs */
  hs_queue_membership_ids?: string;
}

/**
 * Email direction
 */
export type EmailDirection =
  | 'EMAIL'
  | 'INCOMING_EMAIL'
  | 'FORWARDED_EMAIL';

/**
 * Email status
 */
export type EmailStatus =
  | 'SENT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'FAILED'
  | 'BOUNCED';

/**
 * Call status
 */
export type CallStatus =
  | 'BUSY'
  | 'CALLING_CRM_USER'
  | 'CANCELED'
  | 'COMPLETED'
  | 'CONNECTING'
  | 'FAILED'
  | 'IN_PROGRESS'
  | 'NO_ANSWER'
  | 'QUEUED'
  | 'RINGING';

/**
 * Task status
 */
export type TaskStatus =
  | 'NOT_STARTED'
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'DEFERRED';

/**
 * Task priority
 */
export type TaskPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Task type
 */
export type TaskType = 'TODO' | 'EMAIL' | 'CALL';

/**
 * Input for creating a note
 */
export interface CreateNoteInput {
  /** Note body content */
  hs_note_body: string;

  /** Timestamp (default: now) */
  hs_timestamp?: number;

  /** Owner user ID */
  hubspot_owner_id?: string;

  /** Objects to associate with */
  associations?: AssociationInput[];
}

/**
 * Input for creating an email engagement
 */
export interface CreateEmailInput {
  /** Email subject */
  hs_email_subject: string;

  /** Email body text */
  hs_email_text?: string;

  /** Email HTML body */
  hs_email_html?: string;

  /** Email direction */
  hs_email_direction?: EmailDirection;

  /** Email status */
  hs_email_status?: EmailStatus;

  /** From email */
  hs_email_from_email?: string;

  /** To email */
  hs_email_to_email?: string;

  /** Timestamp */
  hs_timestamp?: number;

  /** Owner user ID */
  hubspot_owner_id?: string;

  /** Associations */
  associations?: AssociationInput[];
}

/**
 * Input for creating a call engagement
 */
export interface CreateCallInput {
  /** Call duration in milliseconds */
  hs_call_duration?: number;

  /** Call body/notes */
  hs_call_body?: string;

  /** Call status */
  hs_call_status?: CallStatus;

  /** Call disposition */
  hs_call_disposition?: string;

  /** From phone number */
  hs_call_from_number?: string;

  /** To phone number */
  hs_call_to_number?: string;

  /** Call direction */
  hs_call_direction?: 'INBOUND' | 'OUTBOUND';

  /** Timestamp */
  hs_timestamp?: number;

  /** Owner user ID */
  hubspot_owner_id?: string;

  /** Associations */
  associations?: AssociationInput[];
}

/**
 * Input for creating a meeting engagement
 */
export interface CreateMeetingInput {
  /** Meeting title */
  hs_meeting_title: string;

  /** Meeting body/description */
  hs_meeting_body?: string;

  /** Start time (Unix timestamp ms) */
  hs_meeting_start_time: number;

  /** End time (Unix timestamp ms) */
  hs_meeting_end_time: number;

  /** Meeting outcome */
  hs_meeting_outcome?: string;

  /** Meeting location */
  hs_meeting_location?: string;

  /** External URL */
  hs_meeting_external_url?: string;

  /** Internal notes */
  hs_internal_meeting_notes?: string;

  /** Owner user ID */
  hubspot_owner_id?: string;

  /** Associations */
  associations?: AssociationInput[];
}

/**
 * Input for creating a task
 */
export interface CreateTaskInput {
  /** Task subject */
  hs_task_subject: string;

  /** Task body */
  hs_task_body?: string;

  /** Task status */
  hs_task_status: TaskStatus;

  /** Task priority */
  hs_task_priority?: TaskPriority;

  /** Task type */
  hs_task_type?: TaskType;

  /** Due date (Unix timestamp ms) */
  hs_task_due_date?: number;

  /** Timestamp */
  hs_timestamp?: number;

  /** Owner user ID */
  hubspot_owner_id?: string;

  /** Associations */
  associations?: AssociationInput[];
}

/**
 * Engagement metadata
 */
export interface EngagementMetadata {
  /** Engagement ID */
  id: string;

  /** Engagement type */
  type: EngagementType;

  /** Creation source */
  source?: string;

  /** Source ID (integration, etc.) */
  sourceId?: string;

  /** Created by user ID */
  createdBy?: string;

  /** Modified by user ID */
  modifiedBy?: string;

  /** Owner user ID */
  ownerId?: string;

  /** Team ID */
  teamId?: string;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Engagement attachment
 */
export interface EngagementAttachment {
  /** Attachment ID */
  id: string;

  /** File name */
  name: string;

  /** File size in bytes */
  size: number;

  /** MIME type */
  type: string;

  /** Download URL */
  url?: string;
}
