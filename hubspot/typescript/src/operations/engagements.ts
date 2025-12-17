/**
 * Engagement Operations
 *
 * Create and manage engagements (notes, emails, calls, meetings, tasks)
 */

import type { CrmObject } from '../types/objects.js';
import type {
  EngagementType,
  EngagementProperties,
  Engagement,
  NoteProperties,
  EmailProperties,
  CallProperties,
  MeetingProperties,
  TaskProperties,
} from '../types/engagements.js';
import type { AssociationInput } from '../types/associations.js';
import type { RequestExecutor } from './objects.js';
import { parseObjectResponse } from './objects.js';

/**
 * API response for engagement operations
 */
interface EngagementApiResponse {
  id: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

/**
 * Map engagement type to HubSpot object type
 */
const ENGAGEMENT_TYPE_MAP: Record<EngagementType, string> = {
  notes: 'notes',
  emails: 'emails',
  calls: 'calls',
  meetings: 'meetings',
  tasks: 'tasks',
};

/**
 * Format engagement properties for API request
 */
function formatEngagementProperties(
  type: EngagementType,
  properties: EngagementProperties
): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};

  // Common timestamp
  if (properties.hs_timestamp) {
    formatted.hs_timestamp = properties.hs_timestamp;
  }

  switch (type) {
    case 'notes':
      if ((properties as NoteProperties).hs_note_body) {
        formatted.hs_note_body = (properties as NoteProperties).hs_note_body;
      }
      break;

    case 'emails':
      const emailProps = properties as EmailProperties;
      if (emailProps.hs_email_subject) formatted.hs_email_subject = emailProps.hs_email_subject;
      if (emailProps.hs_email_text) formatted.hs_email_text = emailProps.hs_email_text;
      if (emailProps.hs_email_html) formatted.hs_email_html = emailProps.hs_email_html;
      if (emailProps.hs_email_direction) formatted.hs_email_direction = emailProps.hs_email_direction;
      if (emailProps.hs_email_status) formatted.hs_email_status = emailProps.hs_email_status;
      break;

    case 'calls':
      const callProps = properties as CallProperties;
      if (callProps.hs_call_body) formatted.hs_call_body = callProps.hs_call_body;
      if (callProps.hs_call_title) formatted.hs_call_title = callProps.hs_call_title;
      if (callProps.hs_call_duration) formatted.hs_call_duration = callProps.hs_call_duration;
      if (callProps.hs_call_status) formatted.hs_call_status = callProps.hs_call_status;
      if (callProps.hs_call_direction) formatted.hs_call_direction = callProps.hs_call_direction;
      if (callProps.hs_call_disposition) formatted.hs_call_disposition = callProps.hs_call_disposition;
      break;

    case 'meetings':
      const meetingProps = properties as MeetingProperties;
      if (meetingProps.hs_meeting_title) formatted.hs_meeting_title = meetingProps.hs_meeting_title;
      if (meetingProps.hs_meeting_body) formatted.hs_meeting_body = meetingProps.hs_meeting_body;
      if (meetingProps.hs_meeting_start_time) formatted.hs_meeting_start_time = meetingProps.hs_meeting_start_time;
      if (meetingProps.hs_meeting_end_time) formatted.hs_meeting_end_time = meetingProps.hs_meeting_end_time;
      if (meetingProps.hs_meeting_outcome) formatted.hs_meeting_outcome = meetingProps.hs_meeting_outcome;
      if (meetingProps.hs_meeting_location) formatted.hs_meeting_location = meetingProps.hs_meeting_location;
      break;

    case 'tasks':
      const taskProps = properties as TaskProperties;
      if (taskProps.hs_task_subject) formatted.hs_task_subject = taskProps.hs_task_subject;
      if (taskProps.hs_task_body) formatted.hs_task_body = taskProps.hs_task_body;
      if (taskProps.hs_task_status) formatted.hs_task_status = taskProps.hs_task_status;
      if (taskProps.hs_task_priority) formatted.hs_task_priority = taskProps.hs_task_priority;
      if (taskProps.hs_task_type) formatted.hs_task_type = taskProps.hs_task_type;
      if (taskProps.hs_task_due_date) formatted.hs_task_due_date = taskProps.hs_task_due_date;
      break;
  }

  return formatted;
}

/**
 * Parse engagement response
 */
function parseEngagementResponse(
  response: EngagementApiResponse,
  type: EngagementType
): Engagement {
  return {
    id: response.id,
    type,
    properties: response.properties,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
    archived: response.archived ?? false,
  };
}

/**
 * Create an engagement
 */
export async function createEngagement(
  executor: RequestExecutor,
  apiVersion: string,
  type: EngagementType,
  properties: EngagementProperties,
  associations: AssociationInput[]
): Promise<Engagement> {
  const objectType = ENGAGEMENT_TYPE_MAP[type];
  const endpoint = `/crm/${apiVersion}/objects/${objectType}`;

  const formattedProperties = formatEngagementProperties(type, properties);

  const body: Record<string, unknown> = {
    properties: formattedProperties,
  };

  if (associations.length > 0) {
    body.associations = associations.map((a) => ({
      to: { id: a.toId },
      types: [
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: a.associationType,
        },
      ],
    }));
  }

  const response = await executor.executeRequest<EngagementApiResponse>({
    method: 'POST',
    endpoint,
    body,
    operation: 'createEngagement',
    objectType,
  });

  return parseEngagementResponse(response, type);
}

/**
 * Get an engagement by ID
 */
export async function getEngagement(
  executor: RequestExecutor,
  apiVersion: string,
  type: EngagementType,
  id: string
): Promise<Engagement | null> {
  const objectType = ENGAGEMENT_TYPE_MAP[type];
  const endpoint = `/crm/${apiVersion}/objects/${objectType}/${id}`;

  try {
    const response = await executor.executeRequest<EngagementApiResponse>({
      method: 'GET',
      endpoint,
      operation: 'getEngagement',
      objectType,
    });

    return parseEngagementResponse(response, type);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Update an engagement
 */
export async function updateEngagement(
  executor: RequestExecutor,
  apiVersion: string,
  type: EngagementType,
  id: string,
  properties: EngagementProperties
): Promise<Engagement> {
  const objectType = ENGAGEMENT_TYPE_MAP[type];
  const endpoint = `/crm/${apiVersion}/objects/${objectType}/${id}`;

  const formattedProperties = formatEngagementProperties(type, properties);

  const response = await executor.executeRequest<EngagementApiResponse>({
    method: 'PATCH',
    endpoint,
    body: { properties: formattedProperties },
    operation: 'updateEngagement',
    objectType,
  });

  return parseEngagementResponse(response, type);
}

/**
 * Delete an engagement
 */
export async function deleteEngagement(
  executor: RequestExecutor,
  apiVersion: string,
  type: EngagementType,
  id: string
): Promise<void> {
  const objectType = ENGAGEMENT_TYPE_MAP[type];
  const endpoint = `/crm/${apiVersion}/objects/${objectType}/${id}`;

  await executor.executeRequest<void>({
    method: 'DELETE',
    endpoint,
    operation: 'deleteEngagement',
    objectType,
  });
}

/**
 * Create a note engagement (convenience function)
 */
export async function createNote(
  executor: RequestExecutor,
  apiVersion: string,
  body: string,
  associations: AssociationInput[],
  timestamp?: number
): Promise<Engagement> {
  return createEngagement(executor, apiVersion, 'notes', {
    hs_note_body: body,
    hs_timestamp: timestamp ?? Date.now(),
  }, associations);
}

/**
 * Create a task engagement (convenience function)
 */
export async function createTask(
  executor: RequestExecutor,
  apiVersion: string,
  subject: string,
  associations: AssociationInput[],
  options?: {
    body?: string;
    dueDate?: number;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED';
  }
): Promise<Engagement> {
  return createEngagement(executor, apiVersion, 'tasks', {
    hs_task_subject: subject,
    hs_task_body: options?.body,
    hs_task_due_date: options?.dueDate,
    hs_task_priority: options?.priority,
    hs_task_status: options?.status ?? 'NOT_STARTED',
    hs_timestamp: Date.now(),
  }, associations);
}

/**
 * Log a call engagement (convenience function)
 */
export async function logCall(
  executor: RequestExecutor,
  apiVersion: string,
  associations: AssociationInput[],
  options: {
    title?: string;
    body?: string;
    duration?: number;
    direction?: 'INBOUND' | 'OUTBOUND';
    status?: 'COMPLETED' | 'BUSY' | 'NO_ANSWER' | 'FAILED' | 'CONNECTING';
    disposition?: string;
    timestamp?: number;
  }
): Promise<Engagement> {
  return createEngagement(executor, apiVersion, 'calls', {
    hs_call_title: options.title,
    hs_call_body: options.body,
    hs_call_duration: options.duration,
    hs_call_direction: options.direction,
    hs_call_status: options.status ?? 'COMPLETED',
    hs_call_disposition: options.disposition,
    hs_timestamp: options.timestamp ?? Date.now(),
  }, associations);
}
