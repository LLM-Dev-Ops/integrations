/**
 * Microsoft Teams Adaptive Card Builder
 *
 * Fluent API for building Adaptive Cards following the SPARC specification.
 */

import type {
  AdaptiveCard,
  AdaptiveCardVersion,
  CardElement,
  AdaptiveCardAction,
  TextBlockElement,
  ImageElement,
  FactSetElement,
  ColumnSetElement,
  ContainerElement,
  ColumnElement,
  Fact,
  TextSize,
  TextWeight,
  TextColor,
  HorizontalAlignment,
  ImageSize,
  ColumnWidth,
  OpenUrlAction,
  SubmitAction,
  ShowCardAction,
  ExecuteAction,
  ActionSetElement,
} from '../types/index.js';
import { validateAdaptiveCard } from '../validation.js';

// ============================================================================
// Card Builder
// ============================================================================

/**
 * Fluent builder for Adaptive Cards.
 */
export class CardBuilder {
  private version: AdaptiveCardVersion = '1.5';
  private body: CardElement[] = [];
  private actions: AdaptiveCardAction[] = [];
  private fallbackText?: string;
  private speak?: string;
  private lang?: string;
  private minHeight?: string;
  private backgroundImage?: string;

  /**
   * Sets the card version.
   */
  setVersion(version: AdaptiveCardVersion): this {
    this.version = version;
    return this;
  }

  /**
   * Adds a title (large, bold text block).
   */
  title(text: string): this {
    return this.addTextBlock(text, {
      size: 'large',
      weight: 'bolder',
      wrap: true,
    });
  }

  /**
   * Adds a subtitle (medium text block).
   */
  subtitle(text: string): this {
    return this.addTextBlock(text, {
      size: 'medium',
      isSubtle: true,
      wrap: true,
    });
  }

  /**
   * Adds a text block.
   */
  text(text: string, options?: Partial<Omit<TextBlockElement, 'type' | 'text'>>): this {
    return this.addTextBlock(text, { wrap: true, ...options });
  }

  /**
   * Adds a text block element.
   */
  addTextBlock(
    text: string,
    options?: Partial<Omit<TextBlockElement, 'type' | 'text'>>
  ): this {
    const element: TextBlockElement = {
      type: 'TextBlock',
      text,
      ...options,
    };
    this.body.push(element);
    return this;
  }

  /**
   * Adds an image.
   */
  image(url: string, options?: Partial<Omit<ImageElement, 'type' | 'url'>>): this {
    return this.addImage(url, options);
  }

  /**
   * Adds an image element.
   */
  addImage(url: string, options?: Partial<Omit<ImageElement, 'type' | 'url'>>): this {
    const element: ImageElement = {
      type: 'Image',
      url,
      ...options,
    };
    this.body.push(element);
    return this;
  }

  /**
   * Adds a single fact (title-value pair).
   */
  addFact(title: string, value: string): this {
    // Find existing FactSet or create new one
    const lastElement = this.body[this.body.length - 1];
    if (lastElement && lastElement.type === 'FactSet') {
      (lastElement as FactSetElement).facts.push({ title, value });
    } else {
      const factSet: FactSetElement = {
        type: 'FactSet',
        facts: [{ title, value }],
      };
      this.body.push(factSet);
    }
    return this;
  }

  /**
   * Adds multiple facts at once.
   */
  addFacts(facts: Fact[]): this {
    const factSet: FactSetElement = {
      type: 'FactSet',
      facts: [...facts],
    };
    this.body.push(factSet);
    return this;
  }

  /**
   * Adds a FactSet element.
   */
  addFactSet(facts: Array<{ title: string; value: string }>): this {
    const element: FactSetElement = {
      type: 'FactSet',
      facts,
    };
    this.body.push(element);
    return this;
  }

  /**
   * Starts a container.
   */
  startContainer(
    style?: 'default' | 'emphasis' | 'good' | 'attention' | 'warning' | 'accent'
  ): ContainerBuilder {
    return new ContainerBuilder(this, style);
  }

  /**
   * Adds a container element.
   */
  addContainer(container: ContainerElement): this {
    this.body.push(container);
    return this;
  }

  /**
   * Starts a column set.
   */
  startColumnSet(): ColumnSetBuilder {
    return new ColumnSetBuilder(this);
  }

  /**
   * Adds a column set element.
   */
  addColumnSet(columnSet: ColumnSetElement): this {
    this.body.push(columnSet);
    return this;
  }

  /**
   * Adds an Action.OpenUrl action.
   */
  addActionOpenUrl(title: string, url: string, iconUrl?: string): this {
    const action: OpenUrlAction = {
      type: 'Action.OpenUrl',
      title,
      url,
    };
    if (iconUrl) action.iconUrl = iconUrl;
    this.actions.push(action);
    return this;
  }

  /**
   * Adds an Action.Submit action.
   */
  addActionSubmit(title: string, data?: unknown, iconUrl?: string): this {
    const action: SubmitAction = {
      type: 'Action.Submit',
      title,
    };
    if (data !== undefined) action.data = data;
    if (iconUrl) action.iconUrl = iconUrl;
    this.actions.push(action);
    return this;
  }

  /**
   * Adds an Action.Execute action (Teams-specific).
   */
  addActionExecute(title: string, verb: string, data?: unknown, iconUrl?: string): this {
    const action: ExecuteAction = {
      type: 'Action.Execute',
      title,
      verb,
    };
    if (data !== undefined) action.data = data;
    if (iconUrl) action.iconUrl = iconUrl;
    this.actions.push(action);
    return this;
  }

  /**
   * Adds an Action.ShowCard action.
   */
  addActionShowCard(title: string, card: AdaptiveCard, iconUrl?: string): this {
    const action: ShowCardAction = {
      type: 'Action.ShowCard',
      title,
      card,
    };
    if (iconUrl) action.iconUrl = iconUrl;
    this.actions.push(action);
    return this;
  }

  /**
   * Adds an ActionSet element (inline actions).
   */
  addActionSet(actions: AdaptiveCardAction[]): this {
    const element: ActionSetElement = {
      type: 'ActionSet',
      actions,
    };
    this.body.push(element);
    return this;
  }

  /**
   * Sets fallback text for clients that don't support Adaptive Cards.
   */
  setFallbackText(text: string): this {
    this.fallbackText = text;
    return this;
  }

  /**
   * Sets speak text for accessibility.
   */
  setSpeak(text: string): this {
    this.speak = text;
    return this;
  }

  /**
   * Sets the language.
   */
  setLang(lang: string): this {
    this.lang = lang;
    return this;
  }

  /**
   * Sets minimum height.
   */
  setMinHeight(height: string): this {
    this.minHeight = height;
    return this;
  }

  /**
   * Sets background image.
   */
  setBackgroundImage(url: string): this {
    this.backgroundImage = url;
    return this;
  }

  /**
   * Adds any card element directly.
   */
  addElement(element: CardElement): this {
    this.body.push(element);
    return this;
  }

  /**
   * Adds any action directly.
   */
  addAction(action: AdaptiveCardAction): this {
    this.actions.push(action);
    return this;
  }

  /**
   * Builds the Adaptive Card without validation.
   */
  buildUnsafe(): AdaptiveCard {
    const card: AdaptiveCard = {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: this.version,
      body: [...this.body],
    };

    if (this.actions.length > 0) {
      card.actions = [...this.actions];
    }

    if (this.fallbackText) card.fallbackText = this.fallbackText;
    if (this.speak) card.speak = this.speak;
    if (this.lang) card.lang = this.lang;
    if (this.minHeight) card.minHeight = this.minHeight;
    if (this.backgroundImage) card.backgroundImage = this.backgroundImage;

    return card;
  }

  /**
   * Builds and validates the Adaptive Card.
   * @throws CardValidationError if validation fails
   */
  build(): AdaptiveCard {
    const card = this.buildUnsafe();
    validateAdaptiveCard(card);
    return card;
  }
}

// ============================================================================
// Container Builder
// ============================================================================

/**
 * Builder for Container elements.
 */
export class ContainerBuilder {
  private parent: CardBuilder;
  private items: CardElement[] = [];
  private style?: 'default' | 'emphasis' | 'good' | 'attention' | 'warning' | 'accent';
  private separator?: boolean;
  private spacing?: string;

  constructor(
    parent: CardBuilder,
    style?: 'default' | 'emphasis' | 'good' | 'attention' | 'warning' | 'accent'
  ) {
    this.parent = parent;
    this.style = style;
  }

  text(text: string, options?: Partial<Omit<TextBlockElement, 'type' | 'text'>>): this {
    const element: TextBlockElement = {
      type: 'TextBlock',
      text,
      wrap: true,
      ...options,
    };
    this.items.push(element);
    return this;
  }

  image(url: string, options?: Partial<Omit<ImageElement, 'type' | 'url'>>): this {
    const element: ImageElement = {
      type: 'Image',
      url,
      ...options,
    };
    this.items.push(element);
    return this;
  }

  factSet(facts: Fact[]): this {
    const element: FactSetElement = {
      type: 'FactSet',
      facts,
    };
    this.items.push(element);
    return this;
  }

  addElement(element: CardElement): this {
    this.items.push(element);
    return this;
  }

  withSeparator(): this {
    this.separator = true;
    return this;
  }

  withSpacing(spacing: string): this {
    this.spacing = spacing;
    return this;
  }

  endContainer(): CardBuilder {
    const container: ContainerElement = {
      type: 'Container',
      items: [...this.items],
    };
    if (this.style) container.style = this.style;
    if (this.separator) container.separator = true;
    if (this.spacing) container.spacing = this.spacing as ContainerElement['spacing'];
    this.parent.addContainer(container);
    return this.parent;
  }
}

// ============================================================================
// Column Set Builder
// ============================================================================

/**
 * Builder for ColumnSet elements.
 */
export class ColumnSetBuilder {
  private parent: CardBuilder;
  private columns: ColumnElement[] = [];
  private separator?: boolean;
  private spacing?: string;

  constructor(parent: CardBuilder) {
    this.parent = parent;
  }

  addColumn(width?: ColumnWidth): ColumnBuilder {
    return new ColumnBuilder(this, width);
  }

  pushColumn(column: ColumnElement): this {
    this.columns.push(column);
    return this;
  }

  withSeparator(): this {
    this.separator = true;
    return this;
  }

  withSpacing(spacing: string): this {
    this.spacing = spacing;
    return this;
  }

  endColumnSet(): CardBuilder {
    const columnSet: ColumnSetElement = {
      type: 'ColumnSet',
      columns: [...this.columns],
    };
    if (this.separator) columnSet.separator = true;
    if (this.spacing) columnSet.spacing = this.spacing as ColumnSetElement['spacing'];
    this.parent.addColumnSet(columnSet);
    return this.parent;
  }
}

/**
 * Builder for Column elements.
 */
export class ColumnBuilder {
  private parent: ColumnSetBuilder;
  private items: CardElement[] = [];
  private width?: ColumnWidth;
  private verticalAlignment?: 'top' | 'center' | 'bottom';

  constructor(parent: ColumnSetBuilder, width?: ColumnWidth) {
    this.parent = parent;
    this.width = width;
  }

  text(text: string, options?: Partial<Omit<TextBlockElement, 'type' | 'text'>>): this {
    const element: TextBlockElement = {
      type: 'TextBlock',
      text,
      wrap: true,
      ...options,
    };
    this.items.push(element);
    return this;
  }

  image(url: string, options?: Partial<Omit<ImageElement, 'type' | 'url'>>): this {
    const element: ImageElement = {
      type: 'Image',
      url,
      ...options,
    };
    this.items.push(element);
    return this;
  }

  addElement(element: CardElement): this {
    this.items.push(element);
    return this;
  }

  setVerticalAlignment(alignment: 'top' | 'center' | 'bottom'): this {
    this.verticalAlignment = alignment;
    return this;
  }

  endColumn(): ColumnSetBuilder {
    const column: ColumnElement = {
      type: 'Column',
      items: [...this.items],
    };
    if (this.width !== undefined) column.width = this.width;
    if (this.verticalAlignment) column.verticalContentAlignment = this.verticalAlignment;
    this.parent.pushColumn(column);
    return this.parent;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new CardBuilder.
 */
export function createCardBuilder(): CardBuilder {
  return new CardBuilder();
}

/**
 * Creates a simple text card.
 */
export function createTextCard(text: string, title?: string): AdaptiveCard {
  const builder = new CardBuilder();
  if (title) builder.title(title);
  builder.text(text);
  return builder.build();
}

/**
 * Creates a notification card with optional action.
 */
export function createNotificationCard(
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): AdaptiveCard {
  const builder = new CardBuilder()
    .title(title)
    .text(message);

  if (actionUrl && actionText) {
    builder.addActionOpenUrl(actionText, actionUrl);
  }

  return builder.build();
}

/**
 * Creates a status card with facts.
 */
export function createStatusCard(
  title: string,
  facts: Fact[],
  status?: {
    text: string;
    color: TextColor;
  }
): AdaptiveCard {
  const builder = new CardBuilder().title(title);

  if (status) {
    builder.addTextBlock(status.text, {
      color: status.color,
      weight: 'bolder',
    });
  }

  builder.addFacts(facts);
  return builder.build();
}
