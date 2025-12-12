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
export * from './bookmarks';
export * from './team';
export * from './apps';
export * from './oauth';
export * from './reminders';
export * from './search';
export * from './stars';
export * from './usergroups';

import { SlackClient } from '../client';
import { ConversationsService } from './conversations';
import { MessagesService } from './messages';
import { UsersService } from './users';
import { FilesService } from './files';
import { ReactionsService } from './reactions';
import { PinsService } from './pins';
import { ViewsService } from './views';
import { BookmarksService } from './bookmarks';
import { TeamService } from './team';
import { AppsService } from './apps';
import { OAuthService } from './oauth';
import { RemindersService } from './reminders';
import { SearchService } from './search';
import { StarsService } from './stars';
import { UsergroupsService } from './usergroups';

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
  bookmarks: BookmarksService;
  team: TeamService;
  apps: AppsService;
  oauth: OAuthService;
  reminders: RemindersService;
  search: SearchService;
  stars: StarsService;
  usergroups: UsergroupsService;
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
    bookmarks: new BookmarksService(client),
    team: new TeamService(client),
    apps: new AppsService(client),
    oauth: new OAuthService(client),
    reminders: new RemindersService(client),
    search: new SearchService(client),
    stars: new StarsService(client),
    usergroups: new UsergroupsService(client),
  };
}
