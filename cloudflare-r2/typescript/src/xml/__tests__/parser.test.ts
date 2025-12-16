/**
 * Tests for core XML parser utilities
 */

import {
  parseXml,
  buildXml,
  normalizeArray,
  cleanETag,
  parseDate,
  parseIntSafe,
  parseBooleanSafe,
} from '../parser';

describe('XML Parser', () => {
  describe('parseXml', () => {
    it('should parse simple XML', () => {
      const xml = '<Root><Value>test</Value></Root>';
      const result = parseXml<{ Root: { Value: string } }>(xml);
      expect(result.Root.Value).toBe('test');
    });

    it('should parse nested XML', () => {
      const xml = `
        <Root>
          <Parent>
            <Child>value</Child>
          </Parent>
        </Root>
      `;
      const result = parseXml<{ Root: { Parent: { Child: string } } }>(xml);
      expect(result.Root.Parent.Child).toBe('value');
    });

    it('should throw on invalid XML', () => {
      const invalidXml = '<Root><Unclosed>';
      expect(() => parseXml(invalidXml)).toThrow('Failed to parse XML');
    });
  });

  describe('buildXml', () => {
    it('should build simple XML', () => {
      const obj = { Root: { Value: 'test' } };
      const xml = buildXml(obj);
      expect(xml).toContain('<Root>');
      expect(xml).toContain('<Value>test</Value>');
      expect(xml).toContain('</Root>');
    });

    it('should build nested XML', () => {
      const obj = {
        Root: {
          Parent: {
            Child: 'value',
          },
        },
      };
      const xml = buildXml(obj);
      expect(xml).toContain('<Parent>');
      expect(xml).toContain('<Child>value</Child>');
    });

    it('should build array elements', () => {
      const obj = {
        Root: {
          Item: ['one', 'two', 'three'],
        },
      };
      const xml = buildXml(obj);
      expect(xml).toContain('<Item>one</Item>');
      expect(xml).toContain('<Item>two</Item>');
      expect(xml).toContain('<Item>three</Item>');
    });
  });

  describe('normalizeArray', () => {
    it('should return empty array for undefined', () => {
      expect(normalizeArray(undefined)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(normalizeArray(null as any)).toEqual([]);
    });

    it('should wrap single item in array', () => {
      expect(normalizeArray('single')).toEqual(['single']);
      expect(normalizeArray({ key: 'value' })).toEqual([{ key: 'value' }]);
    });

    it('should return array unchanged', () => {
      const arr = ['one', 'two', 'three'];
      expect(normalizeArray(arr)).toEqual(arr);
    });
  });

  describe('cleanETag', () => {
    it('should remove surrounding quotes', () => {
      expect(cleanETag('"abc123"')).toBe('abc123');
      expect(cleanETag('"def456ghi789"')).toBe('def456ghi789');
    });

    it('should handle ETag without quotes', () => {
      expect(cleanETag('abc123')).toBe('abc123');
    });

    it('should handle ETag with quotes in middle', () => {
      expect(cleanETag('ab"c"123')).toBe('ab"c"123');
    });

    it('should handle empty string', () => {
      expect(cleanETag('')).toBe('');
    });
  });

  describe('parseDate', () => {
    it('should parse ISO 8601 date', () => {
      const dateStr = '2024-01-15T10:30:00.000Z';
      const date = parseDate(dateStr);
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe(dateStr);
    });

    it('should parse date without milliseconds', () => {
      const dateStr = '2024-01-15T10:30:00Z';
      const date = parseDate(dateStr);
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January
      expect(date.getDate()).toBe(15);
    });

    it('should throw on invalid date', () => {
      expect(() => parseDate('invalid')).toThrow('Invalid date string');
      expect(() => parseDate('not-a-date')).toThrow('Invalid date string');
    });
  });

  describe('parseIntSafe', () => {
    it('should parse valid integers', () => {
      expect(parseIntSafe('123', 0)).toBe(123);
      expect(parseIntSafe('0', -1)).toBe(0);
      expect(parseIntSafe('999999', 0)).toBe(999999);
    });

    it('should return default for invalid input', () => {
      expect(parseIntSafe('invalid', 10)).toBe(10);
      expect(parseIntSafe('abc', 0)).toBe(0);
      expect(parseIntSafe('', 42)).toBe(42);
    });

    it('should return default for undefined', () => {
      expect(parseIntSafe(undefined, 100)).toBe(100);
    });

    it('should handle negative numbers', () => {
      expect(parseIntSafe('-123', 0)).toBe(-123);
    });
  });

  describe('parseBooleanSafe', () => {
    it('should parse "true" as true', () => {
      expect(parseBooleanSafe('true', false)).toBe(true);
      expect(parseBooleanSafe('TRUE', false)).toBe(true);
      expect(parseBooleanSafe('True', false)).toBe(true);
    });

    it('should parse "false" as false', () => {
      expect(parseBooleanSafe('false', true)).toBe(false);
      expect(parseBooleanSafe('FALSE', true)).toBe(false);
      expect(parseBooleanSafe('False', true)).toBe(false);
    });

    it('should return default for invalid input', () => {
      expect(parseBooleanSafe('invalid', true)).toBe(true);
      expect(parseBooleanSafe('invalid', false)).toBe(false);
      expect(parseBooleanSafe('1', false)).toBe(false);
      expect(parseBooleanSafe('0', true)).toBe(true);
    });

    it('should return default for undefined', () => {
      expect(parseBooleanSafe(undefined, true)).toBe(true);
      expect(parseBooleanSafe(undefined, false)).toBe(false);
    });
  });
});
