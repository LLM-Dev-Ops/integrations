/**
 * Reminders service for Slack API.
 */

import { SlackClient } from '../client';
import { UserId, SlackResponse } from '../types';

/**
 * Reminder object
 */
export interface Reminder {
  id: string;
  creator: UserId;
  user: UserId;
  text: string;
  recurring: boolean;
  time?: number;
  complete_ts?: number;
}

/**
 * Add reminder response
 */
export interface AddReminderResponse extends SlackResponse {
  reminder: Reminder;
}

/**
 * Info reminder response
 */
export interface InfoReminderResponse extends SlackResponse {
  reminder: Reminder;
}

/**
 * List reminders response
 */
export interface ListRemindersResponse extends SlackResponse {
  reminders: Reminder[];
}

/**
 * Reminders service
 */
export class RemindersService {
  constructor(private client: SlackClient) {}

  /**
   * Add a reminder
   */
  async add(text: string, time: string | number, user?: UserId): Promise<Reminder> {
    const params: Record<string, string> = {
      text,
      time: typeof time === 'number' ? time.toString() : time,
    };
    if (user) {
      params.user = user;
    }

    const response = await this.client.post<AddReminderResponse>(
      'reminders.add',
      params
    );
    return response.reminder;
  }

  /**
   * Mark a reminder as complete
   */
  async complete(reminder: string): Promise<void> {
    await this.client.post('reminders.complete', { reminder });
  }

  /**
   * Delete a reminder
   */
  async delete(reminder: string): Promise<void> {
    await this.client.post('reminders.delete', { reminder });
  }

  /**
   * Get info about a reminder
   */
  async info(reminder: string): Promise<Reminder> {
    const response = await this.client.get<InfoReminderResponse>(
      'reminders.info',
      { reminder }
    );
    return response.reminder;
  }

  /**
   * List all reminders
   */
  async list(): Promise<Reminder[]> {
    const response = await this.client.get<ListRemindersResponse>('reminders.list');
    return response.reminders;
  }
}
