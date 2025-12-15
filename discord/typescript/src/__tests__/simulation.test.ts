/**
 * Tests for simulation layer.
 */

import {
  SimulationRecorder,
  SimulationReplayer,
  SimulationLayer,
  generateMockSnowflake,
  SimulationNoMatchError,
} from '../index.js';

describe('SimulationRecorder', () => {
  describe('record', () => {
    it('should record an interaction', () => {
      const recorder = new SimulationRecorder();

      recorder.record(
        'webhook:execute',
        {
          method: 'POST',
          url: 'https://discord.com/api/v10/webhooks/123/token',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: { content: 'Hello' },
        },
        {
          status: 200,
          statusText: 'OK',
          headers: new Headers({
            'X-RateLimit-Remaining': '29',
            'X-RateLimit-Bucket': 'bucket123',
          }),
          body: { id: '999', content: 'Hello' },
        },
        150
      );

      const interactions = recorder.getInteractions();
      expect(interactions).toHaveLength(1);
      expect(interactions[0].operation).toBe('webhook:execute');
      expect(interactions[0].durationMs).toBe(150);
    });

    it('should normalize request headers', () => {
      const recorder = new SimulationRecorder();

      recorder.record(
        'test',
        {
          method: 'POST',
          url: 'https://discord.com/api/v10/test',
          headers: new Headers({
            'Content-Type': 'application/json',
            'Authorization': 'Bot secret-token', // Should be skipped
            'X-Custom': 'value',
          }),
          body: null,
        },
        { status: 200, statusText: 'OK', headers: new Headers(), body: null },
        100
      );

      const interactions = recorder.getInteractions();
      expect(interactions[0].request.headers['content-type']).toBe('application/json');
      expect(interactions[0].request.headers['x-custom']).toBe('value');
      expect(interactions[0].request.headers['authorization']).toBeUndefined();
    });

    it('should hash request body', () => {
      const recorder = new SimulationRecorder();

      recorder.record(
        'test',
        {
          method: 'POST',
          url: 'https://discord.com/api/v10/test',
          headers: new Headers(),
          body: { content: 'test' },
        },
        { status: 200, statusText: 'OK', headers: new Headers(), body: null },
        100
      );

      const interactions = recorder.getInteractions();
      expect(interactions[0].request.bodyHash).toBeDefined();
      expect(interactions[0].request.bodyHash).toHaveLength(64); // SHA256 hex
    });

    it('should extract rate limit info', () => {
      const recorder = new SimulationRecorder();

      recorder.record(
        'test',
        {
          method: 'GET',
          url: 'https://discord.com/api/v10/test',
          headers: new Headers(),
        },
        {
          status: 200,
          statusText: 'OK',
          headers: new Headers({
            'X-RateLimit-Bucket': 'abc123',
            'X-RateLimit-Remaining': '49',
            'X-RateLimit-Reset-After': '1.5',
          }),
          body: null,
        },
        100
      );

      const interactions = recorder.getInteractions();
      expect(interactions[0].rateLimit).toEqual({
        bucket: 'abc123',
        remaining: 49,
        resetAfter: 1.5,
      });
    });
  });

  describe('clear', () => {
    it('should clear all interactions', () => {
      const recorder = new SimulationRecorder();

      recorder.record(
        'test',
        { method: 'GET', url: 'http://test', headers: new Headers() },
        { status: 200, statusText: 'OK', headers: new Headers(), body: null },
        100
      );

      expect(recorder.getInteractions()).toHaveLength(1);
      recorder.clear();
      expect(recorder.getInteractions()).toHaveLength(0);
    });
  });

  describe('export', () => {
    it('should export as SimulationFile', () => {
      const recorder = new SimulationRecorder();

      recorder.record(
        'test',
        { method: 'GET', url: 'http://test', headers: new Headers() },
        { status: 200, statusText: 'OK', headers: new Headers(), body: null },
        100
      );

      const file = recorder.export();
      expect(file.version).toBe('1.0');
      expect(file.discordApiVersion).toBe('10');
      expect(file.interactions).toHaveLength(1);
      expect(file.created).toBeDefined();
    });

    it('should export as JSON string', () => {
      const recorder = new SimulationRecorder();
      const json = recorder.exportJson();
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});

describe('SimulationReplayer', () => {
  const createTestInteraction = (operation: string, method: string, body?: unknown) => ({
    id: generateMockSnowflake(),
    timestamp: new Date().toISOString(),
    operation,
    request: {
      method,
      url: '/test',
      headers: {},
      bodyHash: body ? 'hash123' : undefined,
      body,
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: { id: '123456789012345678', content: 'test' },
    },
    durationMs: 100,
  });

  describe('findMatch', () => {
    it('should find matching interaction in operation mode', () => {
      const interaction = createTestInteraction('webhook:execute', 'POST');
      const replayer = new SimulationReplayer([interaction]);

      const match = replayer.findMatch('webhook:execute', {
        method: 'POST',
        url: 'https://discord.com/api/v10/webhooks/123/token',
        headers: new Headers(),
      });

      expect(match).toBeDefined();
      expect(match?.operation).toBe('webhook:execute');
    });

    it('should not reuse interactions', () => {
      const interaction = createTestInteraction('webhook:execute', 'POST');
      const replayer = new SimulationReplayer([interaction]);

      const match1 = replayer.findMatch('webhook:execute', {
        method: 'POST',
        url: '/test',
        headers: new Headers(),
      });
      expect(match1).toBeDefined();

      const match2 = replayer.findMatch('webhook:execute', {
        method: 'POST',
        url: '/test',
        headers: new Headers(),
      });
      expect(match2).toBeUndefined();
    });

    it('should support relaxed matching', () => {
      const interaction = createTestInteraction('webhook:execute', 'POST');
      const replayer = new SimulationReplayer([interaction]);
      replayer.setMatchingMode('relaxed');

      const match = replayer.findMatch('webhook:execute', {
        method: 'GET', // Different method
        url: '/different/path',
        headers: new Headers(),
      });

      expect(match).toBeDefined();
    });

    it('should return undefined when no match', () => {
      const interaction = createTestInteraction('webhook:execute', 'POST');
      const replayer = new SimulationReplayer([interaction]);

      const match = replayer.findMatch('message:send', {
        method: 'POST',
        url: '/test',
        headers: new Headers(),
      });

      expect(match).toBeUndefined();
    });
  });

  describe('replay', () => {
    it('should return response for matching request', () => {
      const interaction = createTestInteraction('webhook:execute', 'POST');
      const replayer = new SimulationReplayer([interaction]);

      const response = replayer.replay('webhook:execute', {
        method: 'POST',
        url: '/test',
        headers: new Headers(),
      });

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should throw SimulationNoMatchError when no match', () => {
      const replayer = new SimulationReplayer([]);

      expect(() =>
        replayer.replay('webhook:execute', {
          method: 'POST',
          url: '/test',
          headers: new Headers(),
        })
      ).toThrow(SimulationNoMatchError);
    });

    it('should refresh snowflake IDs in response', () => {
      const originalId = '123456789012345678';
      const interaction = {
        ...createTestInteraction('test', 'POST'),
        response: {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { id: originalId, channel_id: '987654321098765432' },
        },
      };
      const replayer = new SimulationReplayer([interaction]);

      const response = replayer.replay('test', {
        method: 'POST',
        url: '/test',
        headers: new Headers(),
      });

      const body = response.body as { id: string; channel_id: string };
      expect(body.id).not.toBe(originalId);
      expect(body.channel_id).not.toBe('987654321098765432');
    });
  });

  describe('getRemainingCount', () => {
    it('should track remaining interactions', () => {
      const interactions = [
        createTestInteraction('test1', 'POST'),
        createTestInteraction('test2', 'POST'),
        createTestInteraction('test3', 'POST'),
      ];
      const replayer = new SimulationReplayer(interactions);

      expect(replayer.getRemainingCount()).toBe(3);

      replayer.findMatch('test1', { method: 'POST', url: '/', headers: new Headers() });
      expect(replayer.getRemainingCount()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should allow interactions to be reused', () => {
      const interaction = createTestInteraction('test', 'POST');
      const replayer = new SimulationReplayer([interaction]);

      replayer.findMatch('test', { method: 'POST', url: '/', headers: new Headers() });
      expect(replayer.getRemainingCount()).toBe(0);

      replayer.reset();
      expect(replayer.getRemainingCount()).toBe(1);
    });
  });

  describe('fromJson', () => {
    it('should load from JSON string', () => {
      const json = JSON.stringify({
        version: '1.0',
        created: new Date().toISOString(),
        discordApiVersion: '10',
        interactions: [createTestInteraction('test', 'POST')],
      });

      const replayer = SimulationReplayer.fromJson(json);
      expect(replayer.getRemainingCount()).toBe(1);
    });
  });
});

describe('SimulationLayer', () => {
  describe('disabled mode', () => {
    it('should report disabled state', () => {
      const layer = new SimulationLayer({ type: 'disabled' });
      expect(layer.isDisabled()).toBe(true);
      expect(layer.isRecording()).toBe(false);
      expect(layer.isReplay()).toBe(false);
    });

    it('should not record in disabled mode', () => {
      const layer = new SimulationLayer({ type: 'disabled' });
      layer.record(
        'test',
        { method: 'GET', url: '/', headers: new Headers() },
        { status: 200, statusText: 'OK', headers: new Headers(), body: null },
        100
      );
      expect(layer.getRecorder()).toBeUndefined();
    });
  });

  describe('recording mode', () => {
    it('should report recording state', () => {
      const layer = new SimulationLayer({ type: 'recording', path: '/tmp/test.json' });
      expect(layer.isRecording()).toBe(true);
      expect(layer.isDisabled()).toBe(false);
      expect(layer.isReplay()).toBe(false);
    });

    it('should record interactions', () => {
      const layer = new SimulationLayer({ type: 'recording', path: '/tmp/test.json' });
      layer.record(
        'test',
        { method: 'GET', url: '/', headers: new Headers() },
        { status: 200, statusText: 'OK', headers: new Headers(), body: { test: true } },
        100
      );
      expect(layer.getRecorder()?.getInteractions()).toHaveLength(1);
    });
  });

  describe('replay mode', () => {
    it('should report replay state', () => {
      const layer = new SimulationLayer({ type: 'replay', path: '/tmp/test.json' });
      expect(layer.isReplay()).toBe(true);
      expect(layer.isRecording()).toBe(false);
      expect(layer.isDisabled()).toBe(false);
    });
  });
});
