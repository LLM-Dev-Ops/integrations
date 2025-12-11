/**
 * Tests for Slack services.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlackClient } from '../client';
import { MockHttpTransport, MockSlackClient } from '../mocks';
import { ConversationsService } from '../services/conversations';
import { MessagesService } from '../services/messages';
import { UsersService } from '../services/users';
import { ReactionsService } from '../services/reactions';
import { PinsService } from '../services/pins';
import { channelFixtures, messageFixtures, userFixtures } from '../fixtures';

describe('ConversationsService', () => {
  let mockClient: MockSlackClient;
  let mockTransport: MockHttpTransport;
  let client: SlackClient;
  let service: ConversationsService;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    client = new SlackClient({
      config: { token: 'xoxb-test', baseUrl: 'https://slack.com/api' },
      transport: mockTransport,
    });
    service = new ConversationsService(client);
  });

  describe('list', () => {
    it('should list conversations', async () => {
      const channels = [channelFixtures.publicChannel(), channelFixtures.privateChannel()];
      mockTransport.mock('conversations.list', {
        data: { ok: true, channels, response_metadata: { next_cursor: '' } },
      });

      const response = await service.list();

      expect(response.ok).toBe(true);
      expect(response.channels).toHaveLength(2);
    });

    it('should list all conversations with pagination', async () => {
      const channel1 = channelFixtures.publicChannel({ name: 'general' });
      const channel2 = channelFixtures.publicChannel({ name: 'random' });

      mockTransport
        .mock('conversations.list', {
          data: {
            ok: true,
            channels: [channel1],
            response_metadata: { next_cursor: 'cursor1' },
          },
        })
        .mock('conversations.list', {
          data: {
            ok: true,
            channels: [channel2],
            response_metadata: { next_cursor: '' },
          },
        });

      const channels = await service.listAll();

      expect(channels).toHaveLength(2);
    });
  });

  describe('info', () => {
    it('should get channel info', async () => {
      const channel = channelFixtures.publicChannel();
      mockTransport.mock('conversations.info', {
        data: { ok: true, channel },
      });

      const result = await service.info({ channel: channel.id });

      expect(result.id).toBe(channel.id);
    });
  });

  describe('history', () => {
    it('should get conversation history', async () => {
      const messages = [
        messageFixtures.simple('Hello'),
        messageFixtures.simple('World'),
      ];
      mockTransport.mock('conversations.history', {
        data: { ok: true, messages, has_more: false },
      });

      const response = await service.history({ channel: 'C123' });

      expect(response.messages).toHaveLength(2);
      expect(response.has_more).toBe(false);
    });
  });

  describe('create', () => {
    it('should create a channel', async () => {
      const channel = channelFixtures.publicChannel({ name: 'new-channel' });
      mockTransport.mock('conversations.create', {
        data: { ok: true, channel },
      });

      const result = await service.create({ name: 'new-channel' });

      expect(result.name).toBe('new-channel');
    });
  });

  describe('archive/unarchive', () => {
    it('should archive a channel', async () => {
      mockTransport.mock('conversations.archive', {
        data: { ok: true },
      });

      await expect(service.archive('C123')).resolves.not.toThrow();
    });

    it('should unarchive a channel', async () => {
      mockTransport.mock('conversations.unarchive', {
        data: { ok: true },
      });

      await expect(service.unarchive('C123')).resolves.not.toThrow();
    });
  });
});

describe('MessagesService', () => {
  let mockTransport: MockHttpTransport;
  let client: SlackClient;
  let service: MessagesService;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    client = new SlackClient({
      config: { token: 'xoxb-test', baseUrl: 'https://slack.com/api' },
      transport: mockTransport,
    });
    service = new MessagesService(client);
  });

  describe('post', () => {
    it('should post a message', async () => {
      mockTransport.mock('chat.postMessage', {
        data: {
          ok: true,
          channel: 'C123',
          ts: '1234.5678',
          message: { type: 'message', ts: '1234.5678' },
        },
      });

      const response = await service.post({
        channel: 'C123',
        text: 'Hello, World!',
      });

      expect(response.ok).toBe(true);
      expect(response.ts).toBe('1234.5678');
    });

    it('should post a message with blocks', async () => {
      mockTransport.mock('chat.postMessage', {
        data: {
          ok: true,
          channel: 'C123',
          ts: '1234.5678',
          message: { type: 'message', ts: '1234.5678' },
        },
      });

      const response = await service.post({
        channel: 'C123',
        text: 'Fallback',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
      });

      expect(response.ok).toBe(true);
      const calls = mockTransport.getCalls();
      expect(calls[0].options.body).toHaveProperty('blocks');
    });
  });

  describe('update', () => {
    it('should update a message', async () => {
      mockTransport.mock('chat.update', {
        data: {
          ok: true,
          channel: 'C123',
          ts: '1234.5678',
          text: 'Updated text',
          message: { type: 'message', ts: '1234.5678' },
        },
      });

      const response = await service.update({
        channel: 'C123',
        ts: '1234.5678',
        text: 'Updated text',
      });

      expect(response.ok).toBe(true);
      expect(response.text).toBe('Updated text');
    });
  });

  describe('delete', () => {
    it('should delete a message', async () => {
      mockTransport.mock('chat.delete', {
        data: { ok: true, channel: 'C123', ts: '1234.5678' },
      });

      const response = await service.delete({ channel: 'C123', ts: '1234.5678' });

      expect(response.ok).toBe(true);
    });
  });

  describe('schedule', () => {
    it('should schedule a message', async () => {
      const postAt = Math.floor(Date.now() / 1000) + 3600;
      mockTransport.mock('chat.scheduleMessage', {
        data: {
          ok: true,
          channel: 'C123',
          scheduled_message_id: 'Q123',
          post_at: postAt,
          message: { type: 'message', ts: '1234.5678' },
        },
      });

      const response = await service.schedule({
        channel: 'C123',
        text: 'Scheduled message',
        post_at: postAt,
      });

      expect(response.ok).toBe(true);
      expect(response.scheduled_message_id).toBe('Q123');
    });
  });
});

describe('UsersService', () => {
  let mockTransport: MockHttpTransport;
  let client: SlackClient;
  let service: UsersService;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    client = new SlackClient({
      config: { token: 'xoxb-test', baseUrl: 'https://slack.com/api' },
      transport: mockTransport,
    });
    service = new UsersService(client);
  });

  describe('list', () => {
    it('should list users', async () => {
      const members = [userFixtures.regular(), userFixtures.admin()];
      mockTransport.mock('users.list', {
        data: {
          ok: true,
          members,
          cache_ts: Date.now(),
          response_metadata: { next_cursor: '' },
        },
      });

      const response = await service.list();

      expect(response.ok).toBe(true);
      expect(response.members).toHaveLength(2);
    });
  });

  describe('info', () => {
    it('should get user info', async () => {
      const user = userFixtures.regular();
      mockTransport.mock('users.info', {
        data: { ok: true, user },
      });

      const result = await service.info({ user: user.id });

      expect(result.id).toBe(user.id);
    });
  });

  describe('lookupByEmail', () => {
    it('should find user by email', async () => {
      const user = userFixtures.regular();
      user.profile = { email: 'test@example.com' };
      mockTransport.mock('users.lookupByEmail', {
        data: { ok: true, user },
      });

      const result = await service.lookupByEmail('test@example.com');

      expect(result.profile?.email).toBe('test@example.com');
    });
  });

  describe('presence', () => {
    it('should get user presence', async () => {
      mockTransport.mock('users.getPresence', {
        data: {
          ok: true,
          presence: 'active',
          online: true,
          auto_away: false,
          manual_away: false,
        },
      });

      const presence = await service.getPresence('U123');

      expect(presence.presence).toBe('active');
      expect(presence.online).toBe(true);
    });

    it('should set user presence', async () => {
      mockTransport.mock('users.setPresence', {
        data: { ok: true },
      });

      await expect(service.setPresence('away')).resolves.not.toThrow();
    });
  });
});

describe('ReactionsService', () => {
  let mockTransport: MockHttpTransport;
  let client: SlackClient;
  let service: ReactionsService;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    client = new SlackClient({
      config: { token: 'xoxb-test', baseUrl: 'https://slack.com/api' },
      transport: mockTransport,
    });
    service = new ReactionsService(client);
  });

  describe('add', () => {
    it('should add a reaction', async () => {
      mockTransport.mock('reactions.add', {
        data: { ok: true },
      });

      await expect(
        service.add({ channel: 'C123', timestamp: '1234.5678', name: 'thumbsup' })
      ).resolves.not.toThrow();
    });
  });

  describe('remove', () => {
    it('should remove a reaction', async () => {
      mockTransport.mock('reactions.remove', {
        data: { ok: true },
      });

      await expect(
        service.remove({ channel: 'C123', timestamp: '1234.5678', name: 'thumbsup' })
      ).resolves.not.toThrow();
    });
  });
});

describe('PinsService', () => {
  let mockTransport: MockHttpTransport;
  let client: SlackClient;
  let service: PinsService;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    client = new SlackClient({
      config: { token: 'xoxb-test', baseUrl: 'https://slack.com/api' },
      transport: mockTransport,
    });
    service = new PinsService(client);
  });

  describe('add/remove', () => {
    it('should add a pin', async () => {
      mockTransport.mock('pins.add', {
        data: { ok: true },
      });

      await expect(service.add('C123', '1234.5678')).resolves.not.toThrow();
    });

    it('should remove a pin', async () => {
      mockTransport.mock('pins.remove', {
        data: { ok: true },
      });

      await expect(service.remove('C123', '1234.5678')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should list pins', async () => {
      const message = messageFixtures.simple('Pinned message');
      mockTransport.mock('pins.list', {
        data: {
          ok: true,
          items: [{ type: 'message', message }],
        },
      });

      const items = await service.list('C123');

      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('message');
    });
  });
});
