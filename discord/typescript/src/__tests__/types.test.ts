/**
 * Tests for Discord types.
 */

import {
  isValidSnowflake,
  parseSnowflake,
  getSnowflakeTimestamp,
  getSnowflakeDate,
  generateMockSnowflake,
  compareSnowflakes,
  DISCORD_EPOCH,
  EmbedBuilder,
  getEmbedCharacterCount,
  createButton,
  createActionRow,
  ButtonStyle,
  ComponentType,
  channelById,
  channelByName,
} from '../index.js';

describe('Snowflake', () => {
  describe('isValidSnowflake', () => {
    it('should return true for valid snowflakes', () => {
      expect(isValidSnowflake('123456789012345678')).toBe(true);
      expect(isValidSnowflake('00000000000000001')).toBe(true);
      expect(isValidSnowflake('99999999999999999999')).toBe(true);
    });

    it('should return false for invalid snowflakes', () => {
      expect(isValidSnowflake('')).toBe(false);
      expect(isValidSnowflake('abc')).toBe(false);
      expect(isValidSnowflake('123')).toBe(false); // Too short
      expect(isValidSnowflake(123456789012345678)).toBe(false); // Not a string
      expect(isValidSnowflake(null)).toBe(false);
      expect(isValidSnowflake(undefined)).toBe(false);
    });
  });

  describe('parseSnowflake', () => {
    it('should parse valid snowflake strings', () => {
      expect(parseSnowflake('123456789012345678')).toBe('123456789012345678');
    });

    it('should parse bigints', () => {
      expect(parseSnowflake(123456789012345678n)).toBe('123456789012345678');
    });

    it('should throw for invalid snowflakes', () => {
      expect(() => parseSnowflake('invalid')).toThrow('Invalid Snowflake ID');
    });
  });

  describe('getSnowflakeTimestamp', () => {
    it('should extract timestamp from snowflake', () => {
      // Known Discord snowflake with known creation time
      const snowflake = '175928847299117063'; // Discord epoch test
      const timestamp = getSnowflakeTimestamp(snowflake);
      expect(timestamp).toBeGreaterThan(Number(DISCORD_EPOCH));
    });
  });

  describe('getSnowflakeDate', () => {
    it('should return a Date object', () => {
      const snowflake = '175928847299117063';
      const date = getSnowflakeDate(snowflake);
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('generateMockSnowflake', () => {
    it('should generate valid snowflakes', () => {
      const snowflake = generateMockSnowflake();
      expect(isValidSnowflake(snowflake)).toBe(true);
    });

    it('should generate unique snowflakes', () => {
      const snowflakes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        snowflakes.add(generateMockSnowflake());
      }
      expect(snowflakes.size).toBe(100);
    });

    it('should respect provided timestamp', () => {
      const timestamp = Date.now();
      const snowflake = generateMockSnowflake(timestamp);
      const extractedTimestamp = getSnowflakeTimestamp(snowflake);
      // Should be within 1 second
      expect(Math.abs(extractedTimestamp - timestamp)).toBeLessThan(1000);
    });
  });

  describe('compareSnowflakes', () => {
    it('should compare snowflakes chronologically', () => {
      const older = generateMockSnowflake(Date.now() - 10000);
      const newer = generateMockSnowflake(Date.now());
      expect(compareSnowflakes(older, newer)).toBeLessThan(0);
      expect(compareSnowflakes(newer, older)).toBeGreaterThan(0);
    });

    it('should return 0 for equal snowflakes', () => {
      const snowflake = generateMockSnowflake();
      expect(compareSnowflakes(snowflake, snowflake)).toBe(0);
    });
  });
});

describe('Embed', () => {
  describe('EmbedBuilder', () => {
    it('should build a basic embed', () => {
      const embed = new EmbedBuilder()
        .title('Test Title')
        .description('Test Description')
        .build();

      expect(embed.title).toBe('Test Title');
      expect(embed.description).toBe('Test Description');
    });

    it('should build a full embed', () => {
      const embed = new EmbedBuilder()
        .title('Alert')
        .description('Something happened')
        .url('https://example.com')
        .color(0xff0000)
        .timestamp(new Date('2025-01-01'))
        .footer('Footer text', 'https://example.com/icon.png')
        .image('https://example.com/image.png')
        .thumbnail('https://example.com/thumb.png')
        .author('Author Name', 'https://example.com', 'https://example.com/author.png')
        .addField('Field 1', 'Value 1', true)
        .addField('Field 2', 'Value 2', false)
        .build();

      expect(embed.title).toBe('Alert');
      expect(embed.description).toBe('Something happened');
      expect(embed.url).toBe('https://example.com');
      expect(embed.color).toBe(0xff0000);
      expect(embed.timestamp).toBe('2025-01-01T00:00:00.000Z');
      expect(embed.footer?.text).toBe('Footer text');
      expect(embed.image?.url).toBe('https://example.com/image.png');
      expect(embed.thumbnail?.url).toBe('https://example.com/thumb.png');
      expect(embed.author?.name).toBe('Author Name');
      expect(embed.fields).toHaveLength(2);
    });

    it('should handle timestamp as string', () => {
      const embed = new EmbedBuilder()
        .timestamp('2025-01-01T12:00:00.000Z')
        .build();

      expect(embed.timestamp).toBe('2025-01-01T12:00:00.000Z');
    });

    it('should use current time when timestamp() called without argument', () => {
      const before = new Date().toISOString();
      const embed = new EmbedBuilder().timestamp().build();
      const after = new Date().toISOString();

      expect(embed.timestamp).toBeDefined();
      expect(embed.timestamp! >= before).toBe(true);
      expect(embed.timestamp! <= after).toBe(true);
    });
  });

  describe('getEmbedCharacterCount', () => {
    it('should count all text fields', () => {
      const embed = new EmbedBuilder()
        .title('Title') // 5
        .description('Description') // 11
        .footer('Footer') // 6
        .author('Author') // 6
        .addField('Name', 'Value') // 4 + 5 = 9
        .build();

      expect(getEmbedCharacterCount(embed)).toBe(37);
    });

    it('should return 0 for empty embed', () => {
      expect(getEmbedCharacterCount({})).toBe(0);
    });
  });
});

describe('Component', () => {
  describe('createButton', () => {
    it('should create a primary button', () => {
      const button = createButton({
        style: ButtonStyle.Primary,
        label: 'Click Me',
        customId: 'btn_click',
      });

      expect(button.type).toBe(ComponentType.Button);
      expect(button.style).toBe(ButtonStyle.Primary);
      expect(button.label).toBe('Click Me');
      expect(button.custom_id).toBe('btn_click');
    });

    it('should create a link button', () => {
      const button = createButton({
        style: ButtonStyle.Link,
        label: 'Visit',
        url: 'https://example.com',
      });

      expect(button.style).toBe(ButtonStyle.Link);
      expect(button.url).toBe('https://example.com');
    });

    it('should handle emoji buttons', () => {
      const button = createButton({
        style: ButtonStyle.Secondary,
        emoji: { name: '👍' },
        customId: 'thumbs_up',
      });

      expect(button.emoji).toEqual({ name: '👍' });
    });
  });

  describe('createActionRow', () => {
    it('should create an action row with buttons', () => {
      const buttons = [
        createButton({ style: ButtonStyle.Primary, label: 'Yes', customId: 'yes' }),
        createButton({ style: ButtonStyle.Danger, label: 'No', customId: 'no' }),
      ];

      const row = createActionRow(buttons);

      expect(row.type).toBe(ComponentType.ActionRow);
      expect(row.components).toHaveLength(2);
    });
  });
});

describe('Channel', () => {
  describe('channelById', () => {
    it('should create a channel target by ID', () => {
      const target = channelById('123456789012345678');
      expect(target.type).toBe('id');
      expect(target).toHaveProperty('id', '123456789012345678');
    });
  });

  describe('channelByName', () => {
    it('should create a channel target by name', () => {
      const target = channelByName('alerts');
      expect(target.type).toBe('name');
      expect(target).toHaveProperty('name', 'alerts');
    });
  });
});
