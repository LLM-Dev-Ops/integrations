/**
 * Tests for Discord configuration.
 */

import {
  DiscordConfigBuilder,
  SecretString,
  parseWebhookUrl,
  buildWebhookUrl,
  DISCORD_API_BASE_URL,
  NoAuthenticationError,
  ConfigurationError,
} from '../index.js';

describe('SecretString', () => {
  it('should hide value in toString()', () => {
    const secret = new SecretString('my-secret-token');
    expect(secret.toString()).toBe('[REDACTED]');
  });

  it('should hide value in JSON', () => {
    const secret = new SecretString('my-secret-token');
    expect(JSON.stringify({ token: secret })).toBe('{"token":"[REDACTED]"}');
  });

  it('should expose value with expose()', () => {
    const secret = new SecretString('my-secret-token');
    expect(secret.expose()).toBe('my-secret-token');
  });
});

describe('DiscordConfigBuilder', () => {
  describe('basic configuration', () => {
    it('should build config with bot token', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('my-bot-token')
        .build();

      expect(config.botToken).toBe('my-bot-token');
      expect(config.defaultWebhookUrl).toBeUndefined();
      expect(config.baseUrl).toBe(DISCORD_API_BASE_URL);
    });

    it('should build config with webhook URL', () => {
      const config = new DiscordConfigBuilder()
        .withWebhook('https://discord.com/api/webhooks/123456789012345678/abcdef-token')
        .build();

      expect(config.defaultWebhookUrl).toBe('https://discord.com/api/webhooks/123456789012345678/abcdef-token');
      expect(config.botToken).toBeUndefined();
    });

    it('should build config with both auth methods', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('my-token')
        .withWebhook('https://discord.com/api/webhooks/123456789012345678/token')
        .build();

      expect(config.botToken).toBe('my-token');
      expect(config.defaultWebhookUrl).toBe('https://discord.com/api/webhooks/123456789012345678/token');
    });
  });

  describe('validation', () => {
    it('should throw NoAuthenticationError without auth', () => {
      expect(() => new DiscordConfigBuilder().build()).toThrow(NoAuthenticationError);
    });

    it('should throw ConfigurationError for empty bot token', () => {
      expect(() => new DiscordConfigBuilder().withBotToken('')).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for invalid webhook URL', () => {
      expect(() =>
        new DiscordConfigBuilder().withWebhook('https://example.com/not-a-webhook')
      ).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for HTTP base URL', () => {
      const builder = new DiscordConfigBuilder().withBotToken('token');
      expect(() => builder.withBaseUrl('http://discord.com')).toThrow(ConfigurationError);
    });
  });

  describe('channel routing', () => {
    it('should add channel routes', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withChannelRoute('alerts', '123456789012345678')
        .withChannelRoute('deployments', '234567890123456789')
        .build();

      expect(config.channelRouting.get('alerts')).toBe('123456789012345678');
      expect(config.channelRouting.get('deployments')).toBe('234567890123456789');
    });

    it('should add multiple routes at once', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withChannelRoutes({
          alerts: '123456789012345678',
          deployments: '234567890123456789',
        })
        .build();

      expect(config.channelRouting.size).toBe(2);
    });

    it('should throw for empty route name', () => {
      expect(() =>
        new DiscordConfigBuilder().withBotToken('token').withChannelRoute('', '123')
      ).toThrow(ConfigurationError);
    });
  });

  describe('simulation mode', () => {
    it('should set recording mode', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withRecording('/path/to/recordings.json')
        .build();

      expect(config.simulationMode.type).toBe('recording');
      expect((config.simulationMode as { type: 'recording'; path: string }).path).toBe('/path/to/recordings.json');
    });

    it('should set replay mode', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withReplay('/path/to/recordings.json')
        .build();

      expect(config.simulationMode.type).toBe('replay');
    });

    it('should default to disabled', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .build();

      expect(config.simulationMode.type).toBe('disabled');
    });
  });

  describe('rate limit config', () => {
    it('should use default rate limit config', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .build();

      expect(config.rateLimitConfig.globalLimit).toBe(50);
      expect(config.rateLimitConfig.queueTimeout).toBe(30000);
      expect(config.rateLimitConfig.maxQueueSize).toBe(1000);
    });

    it('should allow custom rate limit config', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withRateLimitConfig({
          globalLimit: 25,
          queueTimeout: 60000,
        })
        .build();

      expect(config.rateLimitConfig.globalLimit).toBe(25);
      expect(config.rateLimitConfig.queueTimeout).toBe(60000);
      expect(config.rateLimitConfig.maxQueueSize).toBe(1000); // Unchanged
    });
  });

  describe('retry config', () => {
    it('should use default retry config', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .build();

      expect(config.retryConfig.maxRetries).toBe(3);
      expect(config.retryConfig.initialBackoffMs).toBe(1000);
    });

    it('should allow custom retry config', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withRetryConfig({
          maxRetries: 5,
          initialBackoffMs: 500,
        })
        .build();

      expect(config.retryConfig.maxRetries).toBe(5);
      expect(config.retryConfig.initialBackoffMs).toBe(500);
    });
  });

  describe('other options', () => {
    it('should set custom base URL', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withBaseUrl('https://custom-discord-proxy.com/api/v10')
        .build();

      expect(config.baseUrl).toBe('https://custom-discord-proxy.com/api/v10');
    });

    it('should strip trailing slash from base URL', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withBaseUrl('https://discord.com/api/v10/')
        .build();

      expect(config.baseUrl).toBe('https://discord.com/api/v10');
    });

    it('should set request timeout', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withRequestTimeout(60000)
        .build();

      expect(config.requestTimeoutMs).toBe(60000);
    });

    it('should throw for non-positive timeout', () => {
      expect(() =>
        new DiscordConfigBuilder().withBotToken('token').withRequestTimeout(0)
      ).toThrow(ConfigurationError);
    });

    it('should set user agent', () => {
      const config = new DiscordConfigBuilder()
        .withBotToken('token')
        .withUserAgent('CustomBot/1.0')
        .build();

      expect(config.userAgent).toBe('CustomBot/1.0');
    });
  });

  describe('fromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should load bot token from environment', () => {
      process.env.DISCORD_BOT_TOKEN = 'env-token';

      const config = DiscordConfigBuilder.fromEnv().build();
      expect(config.botToken).toBe('env-token');
    });

    it('should load webhook URL from environment', () => {
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/token';

      const config = DiscordConfigBuilder.fromEnv().build();
      expect(config.defaultWebhookUrl).toBe('https://discord.com/api/webhooks/123/token');
    });
  });
});

describe('parseWebhookUrl', () => {
  it('should parse discord.com webhook URLs', () => {
    const result = parseWebhookUrl('https://discord.com/api/webhooks/123456789012345678/abcdef-token');
    expect(result.webhookId).toBe('123456789012345678');
    expect(result.webhookToken).toBe('abcdef-token');
  });

  it('should parse discordapp.com webhook URLs', () => {
    const result = parseWebhookUrl('https://discordapp.com/api/webhooks/123456789012345678/xyz-token-123');
    expect(result.webhookId).toBe('123456789012345678');
    expect(result.webhookToken).toBe('xyz-token-123');
  });

  it('should throw for invalid URLs', () => {
    expect(() => parseWebhookUrl('https://example.com/webhooks')).toThrow(ConfigurationError);
    expect(() => parseWebhookUrl('not-a-url')).toThrow(ConfigurationError);
  });
});

describe('buildWebhookUrl', () => {
  it('should build a webhook URL', () => {
    const url = buildWebhookUrl('123456789012345678', 'my-token');
    expect(url).toBe('https://discord.com/api/v10/webhooks/123456789012345678/my-token');
  });

  it('should use custom base URL', () => {
    const url = buildWebhookUrl('123', 'token', 'https://custom.com/api');
    expect(url).toBe('https://custom.com/api/webhooks/123/token');
  });
});
