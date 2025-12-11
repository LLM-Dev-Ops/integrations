/**
 * Tests for events handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventDispatcher,
  createEventDispatcher,
  EventCallback,
  MessageEvent,
  ReactionAddedEvent,
  UrlVerification,
} from '../events';

describe('EventDispatcher', () => {
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    dispatcher = createEventDispatcher();
  });

  describe('event registration', () => {
    it('should register event handlers', async () => {
      const handler = vi.fn();
      dispatcher.on('message', handler);

      const callback: EventCallback<MessageEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'message',
          channel: 'C123',
          user: 'U123',
          text: 'Hello',
          ts: '1234.5678',
        },
      };

      await dispatcher.dispatch(callback);

      expect(handler).toHaveBeenCalledWith(callback.event, callback);
    });

    it('should handle wildcard handlers', async () => {
      const handler = vi.fn();
      dispatcher.on('*', handler);

      const callback: EventCallback<MessageEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'message',
          channel: 'C123',
          text: 'Test',
          ts: '1234.5678',
        },
      };

      await dispatcher.dispatch(callback);

      expect(handler).toHaveBeenCalled();
    });

    it('should unregister handlers', async () => {
      const handler = vi.fn();
      dispatcher.on('message', handler);
      dispatcher.off('message', handler);

      const callback: EventCallback<MessageEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'message',
          channel: 'C123',
          text: 'Test',
          ts: '1234.5678',
        },
      };

      await dispatcher.dispatch(callback);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove all handlers for event type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      dispatcher.on('message', handler1);
      dispatcher.on('message', handler2);
      dispatcher.off('message');

      const callback: EventCallback<MessageEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'message',
          channel: 'C123',
          text: 'Test',
          ts: '1234.5678',
        },
      };

      await dispatcher.dispatch(callback);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('handleRequest', () => {
    it('should handle URL verification', async () => {
      const verification: UrlVerification = {
        type: 'url_verification',
        token: 'test-token',
        challenge: 'challenge-string',
      };

      const result = await dispatcher.handleRequest(verification);

      expect(result).toEqual({ challenge: 'challenge-string' });
    });

    it('should dispatch event callbacks', async () => {
      const handler = vi.fn();
      dispatcher.on('reaction_added', handler);

      const callback: EventCallback<ReactionAddedEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'reaction_added',
          user: 'U123',
          reaction: 'thumbsup',
          item: {
            type: 'message',
            channel: 'C123',
            ts: '1234.5678',
          },
        },
      };

      await dispatcher.handleRequest(callback);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle app rate limited events', async () => {
      const handler = vi.fn();
      dispatcher.on('app_rate_limited', handler);

      const rateLimited = {
        type: 'app_rate_limited' as const,
        token: 'test-token',
        team_id: 'T123',
        minute_rate_limited: Date.now(),
        api_app_id: 'A123',
      };

      await dispatcher.handleRequest(rateLimited);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('async handlers', () => {
    it('should await async handlers', async () => {
      let completed = false;
      const handler = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        completed = true;
      });

      dispatcher.on('message', handler);

      const callback: EventCallback<MessageEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'message',
          channel: 'C123',
          text: 'Test',
          ts: '1234.5678',
        },
      };

      await dispatcher.dispatch(callback);

      expect(completed).toBe(true);
    });

    it('should call handlers sequentially', async () => {
      const order: number[] = [];

      dispatcher.on('message', async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
      });

      dispatcher.on('message', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(2);
      });

      const callback: EventCallback<MessageEvent> = {
        type: 'event_callback',
        team_id: 'T123',
        api_app_id: 'A123',
        event_id: 'Ev123',
        event_time: Date.now(),
        event: {
          type: 'message',
          channel: 'C123',
          text: 'Test',
          ts: '1234.5678',
        },
      };

      await dispatcher.dispatch(callback);

      expect(order).toEqual([1, 2]);
    });
  });
});
