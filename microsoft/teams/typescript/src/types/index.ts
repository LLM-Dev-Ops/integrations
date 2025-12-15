/**
 * Microsoft Teams Integration Types
 *
 * Core type definitions following the SPARC specification.
 */

// ============================================================================
// Common Types
// ============================================================================

/**
 * Resource response from Bot Framework.
 */
export interface ResourceResponse {
  id: string;
}

/**
 * Channel account representing a user or bot.
 */
export interface ChannelAccount {
  id: string;
  name?: string;
  aadObjectId?: string;
  role?: string;
}

/**
 * Conversation account representing a conversation.
 */
export interface ConversationAccount {
  id: string;
  name?: string;
  conversationType?: string;
  isGroup?: boolean;
  tenantId?: string;
}

/**
 * Conversation reference for proactive messaging.
 */
export interface ConversationReference {
  activityId?: string;
  bot: ChannelAccount;
  channelId: string;
  conversation: ConversationAccount;
  serviceUrl: string;
  user?: ChannelAccount;
}

/**
 * Attachment in a message.
 */
export interface Attachment {
  contentType: string;
  contentUrl?: string;
  content?: unknown;
  name?: string;
  thumbnailUrl?: string;
}

/**
 * Mention entity in a message.
 */
export interface Mention {
  mentioned: ChannelAccount;
  text: string;
  type: 'mention';
}

/**
 * Entity in an activity.
 */
export interface Entity {
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// Activity Types
// ============================================================================

/**
 * Activity types for Bot Framework.
 */
export type ActivityType =
  | 'message'
  | 'contactRelationUpdate'
  | 'conversationUpdate'
  | 'typing'
  | 'endOfConversation'
  | 'event'
  | 'invoke'
  | 'installationUpdate'
  | 'messageReaction'
  | 'messageUpdate'
  | 'messageDelete';

/**
 * Activity represents a Bot Framework activity.
 */
export interface Activity {
  id?: string;
  type: ActivityType;
  timestamp?: string;
  localTimestamp?: string;
  serviceUrl: string;
  channelId: string;
  from: ChannelAccount;
  conversation: ConversationAccount;
  recipient?: ChannelAccount;
  text?: string;
  speak?: string;
  inputHint?: 'acceptingInput' | 'ignoringInput' | 'expectingInput';
  summary?: string;
  suggestedActions?: SuggestedActions;
  attachments?: Attachment[];
  entities?: Entity[];
  channelData?: unknown;
  replyToId?: string;
  value?: unknown;
  name?: string;
  relatesTo?: ConversationReference;
  code?: string;
  membersAdded?: ChannelAccount[];
  membersRemoved?: ChannelAccount[];
  reactionsAdded?: MessageReaction[];
  reactionsRemoved?: MessageReaction[];
  topicName?: string;
  locale?: string;
}

/**
 * Suggested actions for quick replies.
 */
export interface SuggestedActions {
  to?: string[];
  actions: CardAction[];
}

/**
 * Card action for buttons and quick replies.
 */
export interface CardAction {
  type: 'openUrl' | 'imBack' | 'postBack' | 'call' | 'playAudio' | 'playVideo' | 'showImage' | 'downloadFile' | 'signin' | 'messageBack';
  title: string;
  image?: string;
  text?: string;
  displayText?: string;
  value?: unknown;
}

/**
 * Message reaction.
 */
export interface MessageReaction {
  type: string;
}

// ============================================================================
// Teams/Channels/Chats Types
// ============================================================================

/**
 * Team visibility.
 */
export type TeamVisibility = 'private' | 'public';

/**
 * Channel membership type.
 */
export type ChannelMembershipType = 'standard' | 'private' | 'shared';

/**
 * Chat type.
 */
export type ChatType = 'oneOnOne' | 'group' | 'meeting';

/**
 * Message importance.
 */
export type MessageImportance = 'normal' | 'high' | 'urgent';

/**
 * Content type for message body.
 */
export type ContentType = 'text' | 'html';

/**
 * Team information.
 */
export interface Team {
  id: string;
  displayName: string;
  description?: string;
  visibility?: TeamVisibility;
  internalId?: string;
  webUrl?: string;
}

/**
 * Channel information.
 */
export interface Channel {
  id: string;
  displayName: string;
  description?: string;
  membershipType?: ChannelMembershipType;
  webUrl?: string;
  email?: string;
}

/**
 * Chat information.
 */
export interface Chat {
  id: string;
  topic?: string;
  chatType: ChatType;
  createdDateTime?: string;
  lastUpdatedDateTime?: string;
  tenantId?: string;
  webUrl?: string;
}

/**
 * Chat message body.
 */
export interface MessageBody {
  content: string;
  contentType: ContentType;
}

/**
 * Chat message mention.
 */
export interface ChatMessageMention {
  id: number;
  mentionText: string;
  mentioned: {
    user?: { id: string; displayName?: string };
    channel?: { id: string; displayName?: string };
    team?: { id: string; displayName?: string };
  };
}

/**
 * Chat message attachment.
 */
export interface ChatMessageAttachment {
  id: string;
  contentType: string;
  contentUrl?: string;
  content?: string;
  name?: string;
  thumbnailUrl?: string;
}

/**
 * Chat message from Graph API.
 */
export interface ChatMessage {
  id?: string;
  body: MessageBody;
  from?: {
    user?: { id: string; displayName?: string };
    application?: { id: string; displayName?: string };
  };
  createdDateTime?: string;
  importance?: MessageImportance;
  mentions?: ChatMessageMention[];
  attachments?: ChatMessageAttachment[];
  webUrl?: string;
}

/**
 * Conversation member.
 */
export interface ConversationMember {
  id: string;
  displayName?: string;
  userId?: string;
  email?: string;
  roles?: string[];
}

// ============================================================================
// Adaptive Card Types
// ============================================================================

/**
 * Adaptive card schema version.
 */
export type AdaptiveCardVersion = '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5';

/**
 * Text block size.
 */
export type TextSize = 'small' | 'default' | 'medium' | 'large' | 'extraLarge';

/**
 * Text weight.
 */
export type TextWeight = 'lighter' | 'default' | 'bolder';

/**
 * Text color.
 */
export type TextColor = 'default' | 'dark' | 'light' | 'accent' | 'good' | 'warning' | 'attention';

/**
 * Horizontal alignment.
 */
export type HorizontalAlignment = 'left' | 'center' | 'right';

/**
 * Column width.
 */
export type ColumnWidth = 'auto' | 'stretch' | number;

/**
 * Image size.
 */
export type ImageSize = 'auto' | 'stretch' | 'small' | 'medium' | 'large';

/**
 * Base card element interface.
 */
export interface CardElementBase {
  type: string;
  id?: string;
  separator?: boolean;
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'extraLarge' | 'padding';
}

/**
 * TextBlock element.
 */
export interface TextBlockElement extends CardElementBase {
  type: 'TextBlock';
  text: string;
  size?: TextSize;
  weight?: TextWeight;
  color?: TextColor;
  isSubtle?: boolean;
  wrap?: boolean;
  maxLines?: number;
  horizontalAlignment?: HorizontalAlignment;
}

/**
 * Image element.
 */
export interface ImageElement extends CardElementBase {
  type: 'Image';
  url: string;
  altText?: string;
  size?: ImageSize;
  width?: string;
  height?: string;
  horizontalAlignment?: HorizontalAlignment;
}

/**
 * Fact for FactSet.
 */
export interface Fact {
  title: string;
  value: string;
}

/**
 * FactSet element.
 */
export interface FactSetElement extends CardElementBase {
  type: 'FactSet';
  facts: Fact[];
}

/**
 * Column element.
 */
export interface ColumnElement {
  type: 'Column';
  width?: ColumnWidth;
  items: CardElement[];
  separator?: boolean;
  spacing?: string;
  verticalContentAlignment?: 'top' | 'center' | 'bottom';
}

/**
 * ColumnSet element.
 */
export interface ColumnSetElement extends CardElementBase {
  type: 'ColumnSet';
  columns: ColumnElement[];
}

/**
 * Container element.
 */
export interface ContainerElement extends CardElementBase {
  type: 'Container';
  items: CardElement[];
  style?: 'default' | 'emphasis' | 'good' | 'attention' | 'warning' | 'accent';
}

/**
 * ActionSet element.
 */
export interface ActionSetElement extends CardElementBase {
  type: 'ActionSet';
  actions: AdaptiveCardAction[];
}

/**
 * Input.Text element.
 */
export interface InputTextElement extends CardElementBase {
  type: 'Input.Text';
  id: string;
  placeholder?: string;
  value?: string;
  isMultiline?: boolean;
  maxLength?: number;
  isRequired?: boolean;
  errorMessage?: string;
  label?: string;
}

/**
 * Input.ChoiceSet element.
 */
export interface InputChoiceSetElement extends CardElementBase {
  type: 'Input.ChoiceSet';
  id: string;
  choices: Array<{ title: string; value: string }>;
  value?: string;
  isMultiSelect?: boolean;
  style?: 'compact' | 'expanded';
  isRequired?: boolean;
  label?: string;
}

/**
 * Union type for all card elements.
 */
export type CardElement =
  | TextBlockElement
  | ImageElement
  | FactSetElement
  | ColumnSetElement
  | ContainerElement
  | ActionSetElement
  | InputTextElement
  | InputChoiceSetElement;

/**
 * Action.OpenUrl action.
 */
export interface OpenUrlAction {
  type: 'Action.OpenUrl';
  title: string;
  url: string;
  iconUrl?: string;
}

/**
 * Action.Submit action.
 */
export interface SubmitAction {
  type: 'Action.Submit';
  title: string;
  data?: unknown;
  iconUrl?: string;
}

/**
 * Action.ShowCard action.
 */
export interface ShowCardAction {
  type: 'Action.ShowCard';
  title: string;
  card: AdaptiveCard;
  iconUrl?: string;
}

/**
 * Action.Execute action (Teams-specific).
 */
export interface ExecuteAction {
  type: 'Action.Execute';
  title: string;
  verb: string;
  data?: unknown;
  iconUrl?: string;
}

/**
 * Union type for all card actions.
 */
export type AdaptiveCardAction = OpenUrlAction | SubmitAction | ShowCardAction | ExecuteAction;

/**
 * Adaptive card.
 */
export interface AdaptiveCard {
  $schema?: string;
  type: 'AdaptiveCard';
  version: AdaptiveCardVersion;
  body: CardElement[];
  actions?: AdaptiveCardAction[];
  fallbackText?: string;
  speak?: string;
  lang?: string;
  verticalContentAlignment?: 'top' | 'center' | 'bottom';
  backgroundImage?: string | { url: string; fillMode?: 'cover' | 'repeatHorizontally' | 'repeatVertically' | 'repeat' };
  minHeight?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook response.
 */
export interface WebhookResponse {
  success: boolean;
  messageId?: string;
}

/**
 * Section for formatted messages.
 */
export interface MessageSection {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  facts?: Fact[];
  text?: string;
  markdown?: boolean;
}

/**
 * Potential action for Message Card.
 */
export interface PotentialAction {
  '@type': 'OpenUri' | 'ActionCard' | 'HttpPOST';
  name: string;
  targets?: Array<{ os: string; uri: string }>;
  inputs?: unknown[];
  actions?: unknown[];
}

/**
 * Formatted message for webhook.
 */
export interface FormattedMessage {
  title: string;
  summary?: string;
  themeColor?: string;
  sections?: MessageSection[];
  actions?: PotentialAction[];
}

/**
 * Message card payload for webhook.
 */
export interface MessageCardPayload {
  '@type': 'MessageCard';
  '@context': 'http://schema.org/extensions';
  themeColor?: string;
  title?: string;
  summary?: string;
  text?: string;
  sections?: Array<{
    activityTitle?: string;
    activitySubtitle?: string;
    activityImage?: string;
    facts?: Array<{ name: string; value: string }>;
    text?: string;
    markdown?: boolean;
  }>;
  potentialAction?: PotentialAction[];
}

/**
 * Adaptive card payload for webhook.
 */
export interface AdaptiveCardPayload {
  type: 'message';
  attachments: Array<{
    contentType: 'application/vnd.microsoft.card.adaptive';
    contentUrl: null;
    content: AdaptiveCard;
  }>;
}

/**
 * Union type for webhook payloads.
 */
export type WebhookPayload = MessageCardPayload | AdaptiveCardPayload;

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Severity level for routing.
 */
export type Severity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Destination types for routing.
 */
export type Destination =
  | { type: 'channel'; teamId: string; channelId: string }
  | { type: 'chat'; chatId: string }
  | { type: 'user'; userId: string }
  | { type: 'webhook'; url: string };

/**
 * Routing condition types.
 */
export type RoutingCondition =
  | { type: 'tag'; tag: string }
  | { type: 'severity'; severity: Severity }
  | { type: 'source'; source: string }
  | { type: 'custom'; predicate: (message: RoutableMessage) => boolean };

/**
 * Routing rule.
 */
export interface RoutingRule {
  name: string;
  conditions: RoutingCondition[];
  destinations: Destination[];
  priority: number;
  stopOnError?: boolean;
}

/**
 * Routable message.
 */
export interface RoutableMessage {
  id: string;
  content: string;
  contentType?: ContentType;
  tags?: string[];
  severity?: Severity;
  source?: string;
  metadata?: Record<string, unknown>;
  routingDepth?: number;
}

/**
 * Delivery result for routing.
 */
export interface DeliveryResult {
  destination: Destination;
  success: boolean;
  messageId?: string;
  error?: Error;
}

/**
 * Routing result.
 */
export interface RoutingResult {
  messageId: string;
  deliveries: DeliveryResult[];
  status: 'success' | 'partial' | 'failed' | 'no_match';
}

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Paginated response from Graph API.
 */
export interface PaginatedResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
}

/**
 * List options for Graph API operations.
 */
export interface ListOptions {
  top?: number;
  skip?: number;
  filter?: string;
  select?: string[];
  orderBy?: string;
}

// ============================================================================
// Create Conversation Parameters
// ============================================================================

/**
 * Parameters for creating a conversation.
 */
export interface CreateConversationParams {
  botName?: string;
  isGroup?: boolean;
  members?: ChannelAccount[];
  channelData?: unknown;
  initialActivity?: Activity;
  tenantId?: string;
}

/**
 * Parameters for creating a chat via Graph.
 */
export interface CreateChatParams {
  chatType: ChatType;
  topic?: string;
  members: Array<{ userId: string; roles?: string[] }>;
}
