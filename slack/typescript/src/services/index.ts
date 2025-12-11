/**
 * Slack API Services.
 */

export * from './conversations';
export * from './messages';
export * from './users';
export * from './files';
export * from './reactions';
export * from './pins';
export * from './views';

import { SlackClient } from '../client';
import { ConversationsService } from './conversations';
import { MessagesService } from './messages';
import { UsersService } from './users';
import { FilesService } from './files';
import { ReactionsService } from './reactions';
import { PinsService } from './pins';
import { ViewsService } from './views';

/**
 * All services bundle
 */
export interface SlackServices {
  conversations: ConversationsService;
  messages: MessagesService;
  users: UsersService;
  files: FilesService;
  reactions: ReactionsService;
  pins: PinsService;
  views: ViewsService;
}

/**
 * Create all services from client
 */
export function createServices(client: SlackClient): SlackServices {
  return {
    conversations: new ConversationsService(client),
    messages: new MessagesService(client),
    users: new UsersService(client),
    files: new FilesService(client),
    reactions: new ReactionsService(client),
    pins: new PinsService(client),
    views: new ViewsService(client),
  };
}
