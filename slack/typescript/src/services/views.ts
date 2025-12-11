/**
 * Views service for Slack API (modals and app home).
 */

import { SlackClient } from '../client';
import { Block, SlackResponse } from '../types';

/**
 * View type
 */
export type ViewType = 'modal' | 'home';

/**
 * View structure
 */
export interface View {
  type: ViewType;
  title?: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
  submit?: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
  close?: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
  blocks: Block[];
  private_metadata?: string;
  callback_id?: string;
  clear_on_close?: boolean;
  notify_on_close?: boolean;
  external_id?: string;
  submit_disabled?: boolean;
}

/**
 * View response
 */
export interface ViewResponse extends SlackResponse {
  view: {
    id: string;
    team_id: string;
    type: ViewType;
    title: View['title'];
    submit?: View['submit'];
    close?: View['close'];
    blocks: Block[];
    private_metadata?: string;
    callback_id?: string;
    external_id?: string;
    state?: {
      values: Record<string, Record<string, unknown>>;
    };
    hash: string;
    root_view_id?: string;
    previous_view_id?: string;
    app_id: string;
    bot_id: string;
  };
}

/**
 * Open view parameters
 */
export interface OpenViewParams {
  trigger_id: string;
  view: View;
}

/**
 * Push view parameters
 */
export interface PushViewParams {
  trigger_id: string;
  view: View;
}

/**
 * Update view parameters
 */
export interface UpdateViewParams {
  view: View;
  view_id?: string;
  external_id?: string;
  hash?: string;
}

/**
 * Publish home parameters
 */
export interface PublishHomeParams {
  user_id: string;
  view: View;
  hash?: string;
}

/**
 * Views service
 */
export class ViewsService {
  constructor(private client: SlackClient) {}

  /**
   * Open a modal view
   */
  async open(params: OpenViewParams): Promise<ViewResponse> {
    return this.client.post<ViewResponse>('views.open', {
      trigger_id: params.trigger_id,
      view: JSON.stringify(params.view),
    });
  }

  /**
   * Push a view onto the stack
   */
  async push(params: PushViewParams): Promise<ViewResponse> {
    return this.client.post<ViewResponse>('views.push', {
      trigger_id: params.trigger_id,
      view: JSON.stringify(params.view),
    });
  }

  /**
   * Update an existing view
   */
  async update(params: UpdateViewParams): Promise<ViewResponse> {
    const body: Record<string, string | undefined> = {
      view: JSON.stringify(params.view),
    };
    if (params.view_id) body.view_id = params.view_id;
    if (params.external_id) body.external_id = params.external_id;
    if (params.hash) body.hash = params.hash;

    return this.client.post<ViewResponse>('views.update', body);
  }

  /**
   * Publish a home tab view
   */
  async publish(params: PublishHomeParams): Promise<ViewResponse> {
    const body: Record<string, string | undefined> = {
      user_id: params.user_id,
      view: JSON.stringify(params.view),
    };
    if (params.hash) body.hash = params.hash;

    return this.client.post<ViewResponse>('views.publish', body);
  }

  /**
   * Create a modal view builder
   */
  static createModal(options: {
    title: string;
    callbackId?: string;
    submitText?: string;
    closeText?: string;
    privateMetadata?: string;
    clearOnClose?: boolean;
    notifyOnClose?: boolean;
  }): ViewBuilder {
    return new ViewBuilder('modal', options);
  }

  /**
   * Create a home view builder
   */
  static createHome(options?: { callbackId?: string; privateMetadata?: string }): ViewBuilder {
    return new ViewBuilder('home', options);
  }
}

/**
 * View builder
 */
export class ViewBuilder {
  private view: View;

  constructor(
    type: ViewType,
    options?: {
      title?: string;
      callbackId?: string;
      submitText?: string;
      closeText?: string;
      privateMetadata?: string;
      clearOnClose?: boolean;
      notifyOnClose?: boolean;
      externalId?: string;
    }
  ) {
    this.view = {
      type,
      blocks: [],
    };

    if (options?.title) {
      this.view.title = { type: 'plain_text', text: options.title };
    }
    if (options?.callbackId) {
      this.view.callback_id = options.callbackId;
    }
    if (options?.submitText) {
      this.view.submit = { type: 'plain_text', text: options.submitText };
    }
    if (options?.closeText) {
      this.view.close = { type: 'plain_text', text: options.closeText };
    }
    if (options?.privateMetadata) {
      this.view.private_metadata = options.privateMetadata;
    }
    if (options?.clearOnClose !== undefined) {
      this.view.clear_on_close = options.clearOnClose;
    }
    if (options?.notifyOnClose !== undefined) {
      this.view.notify_on_close = options.notifyOnClose;
    }
    if (options?.externalId) {
      this.view.external_id = options.externalId;
    }
  }

  /**
   * Add a block
   */
  addBlock(block: Block): this {
    this.view.blocks.push(block);
    return this;
  }

  /**
   * Add multiple blocks
   */
  addBlocks(blocks: Block[]): this {
    this.view.blocks.push(...blocks);
    return this;
  }

  /**
   * Add section block
   */
  addSection(text: string, options?: { blockId?: string; accessory?: unknown }): this {
    const block: Block = {
      type: 'section',
      text: { type: 'mrkdwn', text },
    };
    if (options?.blockId) block.block_id = options.blockId;
    if (options?.accessory) (block as Record<string, unknown>).accessory = options.accessory;
    this.view.blocks.push(block);
    return this;
  }

  /**
   * Add divider block
   */
  addDivider(): this {
    this.view.blocks.push({ type: 'divider' });
    return this;
  }

  /**
   * Add input block
   */
  addInput(
    label: string,
    element: unknown,
    options?: { blockId?: string; hint?: string; optional?: boolean; dispatchAction?: boolean }
  ): this {
    const block: Block = {
      type: 'input',
      label: { type: 'plain_text', text: label },
    };
    (block as Record<string, unknown>).element = element;
    if (options?.blockId) block.block_id = options.blockId;
    if (options?.hint) (block as Record<string, unknown>).hint = { type: 'plain_text', text: options.hint };
    if (options?.optional !== undefined) (block as Record<string, unknown>).optional = options.optional;
    if (options?.dispatchAction !== undefined) (block as Record<string, unknown>).dispatch_action = options.dispatchAction;
    this.view.blocks.push(block);
    return this;
  }

  /**
   * Add actions block
   */
  addActions(elements: unknown[], blockId?: string): this {
    const block: Block = {
      type: 'actions',
    };
    (block as Record<string, unknown>).elements = elements;
    if (blockId) block.block_id = blockId;
    this.view.blocks.push(block);
    return this;
  }

  /**
   * Add context block
   */
  addContext(elements: unknown[], blockId?: string): this {
    const block: Block = {
      type: 'context',
    };
    (block as Record<string, unknown>).elements = elements;
    if (blockId) block.block_id = blockId;
    this.view.blocks.push(block);
    return this;
  }

  /**
   * Add header block
   */
  addHeader(text: string, blockId?: string): this {
    const block: Block = {
      type: 'header',
      text: { type: 'plain_text', text },
    };
    if (blockId) block.block_id = blockId;
    this.view.blocks.push(block);
    return this;
  }

  /**
   * Build the view
   */
  build(): View {
    return this.view;
  }
}
