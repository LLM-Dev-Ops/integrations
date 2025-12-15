/**
 * Ollama Integration - Message Types
 *
 * Message and role types for chat completions.
 * Based on SPARC specification for Ollama chat API.
 */

/**
 * Message role in conversation
 */
export type Role = 'system' | 'user' | 'assistant';

/**
 * Chat message
 *
 * Represents a single message in a conversation.
 * Supports both text and multimodal (image) content.
 */
export interface Message {
  /**
   * Role of the message sender
   */
  role: Role;

  /**
   * Message text content
   */
  content: string;

  /**
   * Optional base64-encoded images
   *
   * For multimodal models that support vision capabilities.
   * Each string should be a base64-encoded image.
   */
  images?: string[];
}
