/**
 * Discord message component types (buttons, select menus, etc.).
 */

import { Snowflake } from './snowflake.js';

/**
 * Component types as defined by Discord.
 */
export enum ComponentType {
  /** Container for other components */
  ActionRow = 1,
  /** Clickable button */
  Button = 2,
  /** Select menu for string values */
  StringSelect = 3,
  /** Text input for modals */
  TextInput = 4,
  /** Select menu for users */
  UserSelect = 5,
  /** Select menu for roles */
  RoleSelect = 6,
  /** Select menu for mentionables (users and roles) */
  MentionableSelect = 7,
  /** Select menu for channels */
  ChannelSelect = 8,
}

/**
 * Button styles.
 */
export enum ButtonStyle {
  /** Blurple */
  Primary = 1,
  /** Grey */
  Secondary = 2,
  /** Green */
  Success = 3,
  /** Red */
  Danger = 4,
  /** Grey with link icon - requires url field */
  Link = 5,
}

/**
 * Partial emoji object for components.
 */
export interface PartialEmoji {
  /** Emoji ID for custom emojis */
  id?: Snowflake | null;
  /** Emoji name (unicode character or custom emoji name) */
  name?: string | null;
  /** Whether the emoji is animated */
  animated?: boolean;
}

/**
 * Discord button component.
 */
export interface Button {
  /** Component type (always Button) */
  type: ComponentType.Button;
  /** Button style */
  style: ButtonStyle;
  /** Button label text */
  label?: string;
  /** Emoji to display on the button */
  emoji?: PartialEmoji;
  /** Custom ID for non-link buttons (required for styles 1-4) */
  custom_id?: string;
  /** URL for link buttons (required for style 5) */
  url?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
}

/**
 * Select menu option.
 */
export interface SelectOption {
  /** Option label */
  label: string;
  /** Option value */
  value: string;
  /** Option description */
  description?: string;
  /** Emoji for the option */
  emoji?: PartialEmoji;
  /** Whether this option is selected by default */
  default?: boolean;
}

/**
 * String select menu component.
 */
export interface StringSelectMenu {
  /** Component type */
  type: ComponentType.StringSelect;
  /** Custom ID for this select menu */
  custom_id: string;
  /** Select menu options */
  options: SelectOption[];
  /** Placeholder text */
  placeholder?: string;
  /** Minimum values that must be selected */
  min_values?: number;
  /** Maximum values that can be selected */
  max_values?: number;
  /** Whether the select menu is disabled */
  disabled?: boolean;
}

/**
 * User select menu component.
 */
export interface UserSelectMenu {
  /** Component type */
  type: ComponentType.UserSelect;
  /** Custom ID for this select menu */
  custom_id: string;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum values that must be selected */
  min_values?: number;
  /** Maximum values that can be selected */
  max_values?: number;
  /** Whether the select menu is disabled */
  disabled?: boolean;
}

/**
 * Role select menu component.
 */
export interface RoleSelectMenu {
  /** Component type */
  type: ComponentType.RoleSelect;
  /** Custom ID for this select menu */
  custom_id: string;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum values that must be selected */
  min_values?: number;
  /** Maximum values that can be selected */
  max_values?: number;
  /** Whether the select menu is disabled */
  disabled?: boolean;
}

/**
 * Channel select menu component.
 */
export interface ChannelSelectMenu {
  /** Component type */
  type: ComponentType.ChannelSelect;
  /** Custom ID for this select menu */
  custom_id: string;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum values that must be selected */
  min_values?: number;
  /** Maximum values that can be selected */
  max_values?: number;
  /** Whether the select menu is disabled */
  disabled?: boolean;
  /** Channel types to include */
  channel_types?: number[];
}

/**
 * Text input styles.
 */
export enum TextInputStyle {
  /** Single-line input */
  Short = 1,
  /** Multi-line input */
  Paragraph = 2,
}

/**
 * Text input component (for modals).
 */
export interface TextInput {
  /** Component type */
  type: ComponentType.TextInput;
  /** Custom ID for this input */
  custom_id: string;
  /** Input style */
  style: TextInputStyle;
  /** Label for the input */
  label: string;
  /** Minimum input length */
  min_length?: number;
  /** Maximum input length */
  max_length?: number;
  /** Whether input is required */
  required?: boolean;
  /** Pre-filled value */
  value?: string;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Union type for all interactive components.
 */
export type InteractiveComponent =
  | Button
  | StringSelectMenu
  | UserSelectMenu
  | RoleSelectMenu
  | ChannelSelectMenu
  | TextInput;

/**
 * Action row containing components.
 */
export interface ActionRow {
  /** Component type (always ActionRow) */
  type: ComponentType.ActionRow;
  /** Components in this row */
  components: InteractiveComponent[];
}

/** Maximum number of action rows per message */
export const MAX_ACTION_ROWS = 5;

/** Maximum number of buttons per action row */
export const MAX_BUTTONS_PER_ROW = 5;

/**
 * Creates a button component.
 */
export function createButton(options: {
  style: ButtonStyle;
  label?: string;
  emoji?: PartialEmoji;
  customId?: string;
  url?: string;
  disabled?: boolean;
}): Button {
  const button: Button = {
    type: ComponentType.Button,
    style: options.style,
  };

  if (options.label) button.label = options.label;
  if (options.emoji) button.emoji = options.emoji;
  if (options.customId) button.custom_id = options.customId;
  if (options.url) button.url = options.url;
  if (options.disabled !== undefined) button.disabled = options.disabled;

  return button;
}

/**
 * Creates an action row containing the given components.
 */
export function createActionRow(components: InteractiveComponent[]): ActionRow {
  return {
    type: ComponentType.ActionRow,
    components,
  };
}
