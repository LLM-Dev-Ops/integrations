/**
 * Microsoft Teams Validation Utilities
 *
 * Input validators following the SPARC specification.
 */

import {
  MAX_CARD_SIZE_BYTES,
  MAX_TEXT_LENGTH,
  MAX_MESSAGE_SIZE_BYTES,
} from './config/index.js';
import {
  ValidationError,
  CardTooLargeError,
  TextTooLongError,
  InvalidWebhookUrlError,
  CardValidationError,
} from './errors.js';
import type { AdaptiveCard, Activity, ConversationReference } from './types/index.js';

// ============================================================================
// Text Validation
// ============================================================================

/**
 * Validates message text length.
 * @throws TextTooLongError if text exceeds maximum length
 */
export function validateTextLength(text: string, maxLength: number = MAX_TEXT_LENGTH): void {
  if (text.length > maxLength) {
    throw new TextTooLongError(text.length, maxLength);
  }
}

/**
 * Sanitizes text by removing potentially dangerous HTML.
 * Teams supports limited HTML, but we strip script tags and other dangerous elements.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Validates and sanitizes message text.
 */
export function validateAndSanitizeText(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  const sanitized = sanitizeText(text);
  validateTextLength(sanitized, maxLength);
  return sanitized;
}

// ============================================================================
// Card Validation
// ============================================================================

/**
 * Validates card size.
 * @throws CardTooLargeError if card exceeds maximum size
 */
export function validateCardSize(card: unknown, maxSize: number = MAX_CARD_SIZE_BYTES): void {
  const serialized = JSON.stringify(card);
  const size = new TextEncoder().encode(serialized).length;

  if (size > maxSize) {
    throw new CardTooLargeError(size, maxSize);
  }
}

/**
 * Validates adaptive card structure.
 * @throws CardValidationError if card structure is invalid
 */
export function validateAdaptiveCard(card: AdaptiveCard): void {
  const errors: string[] = [];

  // Check required fields
  if (card.type !== 'AdaptiveCard') {
    errors.push('Card type must be "AdaptiveCard"');
  }

  if (!card.version) {
    errors.push('Card must have a version');
  } else if (!['1.0', '1.1', '1.2', '1.3', '1.4', '1.5'].includes(card.version)) {
    errors.push(`Invalid card version: ${card.version}`);
  }

  if (!card.body || !Array.isArray(card.body)) {
    errors.push('Card must have a body array');
  } else if (card.body.length === 0) {
    errors.push('Card body cannot be empty');
  } else {
    // Validate each element
    card.body.forEach((element, index) => {
      validateCardElement(element, `body[${index}]`, errors);
    });
  }

  // Validate actions if present
  if (card.actions) {
    if (!Array.isArray(card.actions)) {
      errors.push('Card actions must be an array');
    } else {
      card.actions.forEach((action, index) => {
        validateCardAction(action, `actions[${index}]`, errors);
      });
    }
  }

  // Check size
  try {
    validateCardSize(card);
  } catch (error) {
    if (error instanceof CardTooLargeError) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new CardValidationError(`Card validation failed: ${errors.join('; ')}`);
  }
}

function validateCardElement(element: unknown, path: string, errors: string[]): void {
  if (!element || typeof element !== 'object') {
    errors.push(`${path}: Element must be an object`);
    return;
  }

  const elem = element as Record<string, unknown>;

  if (!elem.type || typeof elem.type !== 'string') {
    errors.push(`${path}: Element must have a type`);
    return;
  }

  switch (elem.type) {
    case 'TextBlock':
      if (typeof elem.text !== 'string' || elem.text.length === 0) {
        errors.push(`${path}: TextBlock must have non-empty text`);
      }
      break;

    case 'Image':
      if (typeof elem.url !== 'string' || elem.url.length === 0) {
        errors.push(`${path}: Image must have a URL`);
      }
      break;

    case 'FactSet':
      if (!Array.isArray(elem.facts)) {
        errors.push(`${path}: FactSet must have facts array`);
      }
      break;

    case 'Container':
      if (!Array.isArray(elem.items)) {
        errors.push(`${path}: Container must have items array`);
      } else {
        (elem.items as unknown[]).forEach((item, index) => {
          validateCardElement(item, `${path}.items[${index}]`, errors);
        });
      }
      break;

    case 'ColumnSet':
      if (!Array.isArray(elem.columns)) {
        errors.push(`${path}: ColumnSet must have columns array`);
      }
      break;

    case 'Input.Text':
      if (typeof elem.id !== 'string' || elem.id.length === 0) {
        errors.push(`${path}: Input.Text must have an id`);
      }
      break;

    case 'Input.ChoiceSet':
      if (typeof elem.id !== 'string' || elem.id.length === 0) {
        errors.push(`${path}: Input.ChoiceSet must have an id`);
      }
      if (!Array.isArray(elem.choices)) {
        errors.push(`${path}: Input.ChoiceSet must have choices array`);
      }
      break;

    case 'ActionSet':
      if (!Array.isArray(elem.actions)) {
        errors.push(`${path}: ActionSet must have actions array`);
      }
      break;

    default:
      // Unknown type - allow it but log a warning
      break;
  }
}

function validateCardAction(action: unknown, path: string, errors: string[]): void {
  if (!action || typeof action !== 'object') {
    errors.push(`${path}: Action must be an object`);
    return;
  }

  const act = action as Record<string, unknown>;

  if (!act.type || typeof act.type !== 'string') {
    errors.push(`${path}: Action must have a type`);
    return;
  }

  if (typeof act.title !== 'string' || act.title.length === 0) {
    errors.push(`${path}: Action must have a title`);
  }

  switch (act.type) {
    case 'Action.OpenUrl':
      if (typeof act.url !== 'string' || act.url.length === 0) {
        errors.push(`${path}: Action.OpenUrl must have a URL`);
      }
      break;

    case 'Action.Execute':
      if (typeof act.verb !== 'string' || act.verb.length === 0) {
        errors.push(`${path}: Action.Execute must have a verb`);
      }
      break;
  }
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validates a Teams webhook URL.
 * @throws InvalidWebhookUrlError if URL is invalid
 */
export function validateWebhookUrl(url: string): void {
  if (!url || url.trim().length === 0) {
    throw new InvalidWebhookUrlError('Webhook URL cannot be empty');
  }

  // Teams webhook URL format
  const webhookRegex =
    /^https:\/\/(?:[\w-]+\.webhook\.office\.com\/webhookb2\/|outlook\.office\.com\/webhook\/)/;

  if (!webhookRegex.test(url)) {
    throw new InvalidWebhookUrlError('Invalid Teams webhook URL format');
  }

  try {
    new URL(url);
  } catch {
    throw new InvalidWebhookUrlError('URL is not a valid URL');
  }
}

/**
 * Validates a URL string.
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Activity Validation
// ============================================================================

/**
 * Validates an activity for sending.
 */
export function validateActivity(activity: Partial<Activity>): void {
  const errors: string[] = [];

  if (!activity.type) {
    errors.push('Activity must have a type');
  }

  if (!activity.channelId) {
    errors.push('Activity must have a channelId');
  }

  if (!activity.serviceUrl) {
    errors.push('Activity must have a serviceUrl');
  }

  if (!activity.from) {
    errors.push('Activity must have a from account');
  } else if (!activity.from.id) {
    errors.push('Activity from account must have an id');
  }

  if (!activity.conversation) {
    errors.push('Activity must have a conversation');
  } else if (!activity.conversation.id) {
    errors.push('Activity conversation must have an id');
  }

  // Validate text length if present
  if (activity.text && activity.text.length > MAX_TEXT_LENGTH) {
    errors.push(`Activity text exceeds maximum length (${MAX_TEXT_LENGTH})`);
  }

  // Validate attachments if present
  if (activity.attachments) {
    activity.attachments.forEach((attachment, index) => {
      if (!attachment.contentType) {
        errors.push(`Attachment ${index} must have a contentType`);
      }
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

/**
 * Validates a conversation reference.
 */
export function validateConversationReference(ref: ConversationReference): void {
  const errors: string[] = [];

  if (!ref.bot || !ref.bot.id) {
    errors.push('ConversationReference must have a bot with id');
  }

  if (!ref.channelId) {
    errors.push('ConversationReference must have a channelId');
  }

  if (!ref.conversation || !ref.conversation.id) {
    errors.push('ConversationReference must have a conversation with id');
  }

  if (!ref.serviceUrl) {
    errors.push('ConversationReference must have a serviceUrl');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

// ============================================================================
// ID Validation
// ============================================================================

/**
 * Validates a UUID format.
 */
export function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validates a Teams team ID.
 */
export function validateTeamId(teamId: string): void {
  if (!teamId || teamId.trim().length === 0) {
    throw new ValidationError(['Team ID cannot be empty']);
  }
}

/**
 * Validates a Teams channel ID.
 */
export function validateChannelId(channelId: string): void {
  if (!channelId || channelId.trim().length === 0) {
    throw new ValidationError(['Channel ID cannot be empty']);
  }
}

/**
 * Validates a chat ID.
 */
export function validateChatId(chatId: string): void {
  if (!chatId || chatId.trim().length === 0) {
    throw new ValidationError(['Chat ID cannot be empty']);
  }
}

/**
 * Validates a user ID.
 */
export function validateUserId(userId: string): void {
  if (!userId || userId.trim().length === 0) {
    throw new ValidationError(['User ID cannot be empty']);
  }
}

// ============================================================================
// Message Validation
// ============================================================================

/**
 * Validates message size.
 */
export function validateMessageSize(message: unknown, maxSize: number = MAX_MESSAGE_SIZE_BYTES): void {
  const serialized = JSON.stringify(message);
  const size = new TextEncoder().encode(serialized).length;

  if (size > maxSize) {
    throw new ValidationError([`Message size ${size} exceeds maximum ${maxSize}`]);
  }
}

/**
 * Validates a payload before sending.
 */
export function validatePayload(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError(['Payload must be an object']);
  }

  validateMessageSize(payload);
}
