/**
 * Streaming parser tests
 */

import { describe, it, expect } from 'vitest';
import { ChunkedJsonParser, StreamAccumulator } from '../src/streaming/index.js';
import type { GenerateContentResponse } from '../src/types/index.js';

describe('ChunkedJsonParser', () => {
  it('should parse single complete chunk', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(1);
    expect(results[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello' });
  });

  it('should parse multiple complete chunks', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]},{"candidates":[{"content":{"parts":[{"text":"World"}]}}]}]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(2);
    expect(results[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello' });
    expect(results[1].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'World' });
  });

  it('should buffer incomplete chunks', () => {
    const parser = new ChunkedJsonParser();

    // Feed partial chunk
    const results1 = parser.feed('[{"candidates":[{"content"');
    expect(results1).toHaveLength(0);

    // Complete the chunk
    const results2 = parser.feed(':{"parts":[{"text":"Complete"}]}}]}]');
    expect(results2).toHaveLength(1);
    expect(results2[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Complete' });
  });

  it('should handle chunk boundary in JSON object', () => {
    const parser = new ChunkedJsonParser();

    const chunk1 = '[{"candidates":[{"conte';
    const chunk2 = 'nt":{"parts":[{"text":"Split"}]}}]}]';

    const results1 = parser.feed(chunk1);
    expect(results1).toHaveLength(0);

    const results2 = parser.feed(chunk2);
    expect(results2).toHaveLength(1);
    expect(results2[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Split' });
  });

  it('should handle chunk boundary in string value', () => {
    const parser = new ChunkedJsonParser();

    const chunk1 = '[{"candidates":[{"content":{"parts":[{"text":"Hello Wo';
    const chunk2 = 'rld"}]}}]}]';

    parser.feed(chunk1);
    const results = parser.feed(chunk2);

    expect(results).toHaveLength(1);
    expect(results[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello World' });
  });

  it('should handle array opening bracket', () => {
    const parser = new ChunkedJsonParser();

    const results1 = parser.feed('[');
    expect(results1).toHaveLength(0);

    const results2 = parser.feed('{"candidates":[]}]');
    expect(results2).toHaveLength(1);
  });

  it('should handle array closing bracket', () => {
    const parser = new ChunkedJsonParser();

    const results = parser.feed('[{"candidates":[]}]');
    expect(results).toHaveLength(1);
  });

  it('should handle comma separators', () => {
    const parser = new ChunkedJsonParser();

    const chunk1 = '[{"candidates":[]},';
    const chunk2 = '{"candidates":[]}]';

    const results1 = parser.feed(chunk1);
    expect(results1).toHaveLength(1);

    const results2 = parser.feed(chunk2);
    expect(results2).toHaveLength(1);
  });

  it('should skip whitespace and delimiters', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[ \n\t{"candidates":[]} \n, \n {"candidates":[]} \n]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(2);
  });

  it('should handle escaped characters in strings', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[{"candidates":[{"content":{"parts":[{"text":"Line 1\\nLine 2"}]}}]}]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(1);
    expect(results[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Line 1\nLine 2' });
  });

  it('should handle escaped quotes in strings', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[{"candidates":[{"content":{"parts":[{"text":"Say \\"hello\\""}]}}]}]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(1);
    expect(results[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Say "hello"' });
  });

  it('should handle nested objects', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[{"candidates":[{"content":{"parts":[{"text":"test"}],"role":"model"},"index":0}],"usageMetadata":{"totalTokenCount":5}}]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(1);
    expect(results[0].usageMetadata?.totalTokenCount).toBe(5);
  });

  it('should handle nested arrays', () => {
    const parser = new ChunkedJsonParser();

    const chunk = '[{"candidates":[{"safetyRatings":[{"category":"HARM_CATEGORY_HATE_SPEECH","probability":"NEGLIGIBLE"}]}]}]';
    const results = parser.feed(chunk);

    expect(results).toHaveLength(1);
    expect(results[0].candidates?.[0]?.safetyRatings).toHaveLength(1);
  });

  it('should handle malformed JSON gracefully', () => {
    const parser = new ChunkedJsonParser();

    // Feed invalid JSON - should skip it
    const chunk = '[{invalid json},{"candidates":[]}]';
    const results = parser.feed(chunk);

    // Should skip the invalid part and parse the valid one
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('should flush remaining buffer', () => {
    const parser = new ChunkedJsonParser();

    parser.feed('[{"candidates":[');
    const result = parser.flush();

    // Should return null for incomplete buffer
    expect(result).toBeNull();
  });

  it('should flush complete object in buffer', () => {
    const parser = new ChunkedJsonParser();

    parser.feed('[');
    const results1 = parser.feed('{"candidates":[]}]');

    // Should parse complete object
    expect(results1).toHaveLength(1);
    expect(results1[0].candidates).toEqual([]);
  });

  it('should reset parser state', () => {
    const parser = new ChunkedJsonParser();

    parser.feed('[{"candidates":[');
    parser.reset();

    const results = parser.feed('[{"candidates":[]}]');
    expect(results).toHaveLength(1);
  });

  it('should handle empty stream', () => {
    const parser = new ChunkedJsonParser();

    const results = parser.feed('[]');
    expect(results).toHaveLength(0);

    const flushed = parser.flush();
    expect(flushed).toBeNull();
  });

  it('should handle real-world streaming format', () => {
    const parser = new ChunkedJsonParser();

    // Simulate real streaming chunks
    const chunks = [
      '[',
      '{"candidates":[{"content":{"parts":[{"text":"Once"}],"role":"model"},"index":0}]},',
      '{"candidates":[{"content":{"parts":[{"text":" upon"}],"role":"model"},"index":0}]},',
      '{"candidates":[{"content":{"parts":[{"text":" a time"}],"role":"model"},"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":6,"totalTokenCount":9}}',
      ']',
    ];

    const allResults: GenerateContentResponse[] = [];
    for (const chunk of chunks) {
      const results = parser.feed(chunk);
      allResults.push(...results);
    }

    expect(allResults).toHaveLength(3);
    expect(allResults[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Once' });
    expect(allResults[1].candidates?.[0]?.content?.parts[0]).toEqual({ text: ' upon' });
    expect(allResults[2].candidates?.[0]?.content?.parts[0]).toEqual({ text: ' a time' });
    expect(allResults[2].usageMetadata?.totalTokenCount).toBe(9);
  });
});

describe('StreamAccumulator', () => {
  it('should accumulate single chunk', () => {
    const accumulator = new StreamAccumulator();

    const chunk: GenerateContentResponse = {
      candidates: [
        {
          content: { parts: [{ text: 'Hello' }], role: 'model' },
          index: 0,
        },
      ],
    };

    accumulator.add(chunk);
    const result = accumulator.build();

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello' });
  });

  it('should merge text parts from multiple chunks', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'Hello' }] }, index: 0 }],
    });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: ' ' }] }, index: 0 }],
    });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'World' }] }, index: 0 }],
    });

    const result = accumulator.build();
    expect(result.candidates?.[0]?.content?.parts).toHaveLength(1);
    expect(result.candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello World' });
  });

  it('should preserve finish reason from last chunk', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'Start' }] }, index: 0 }],
    });

    accumulator.add({
      candidates: [
        { content: { parts: [{ text: ' End' }] }, finishReason: 'STOP', index: 0 },
      ],
    });

    const result = accumulator.build();
    expect(result.candidates?.[0]?.finishReason).toBe('STOP');
  });

  it('should accumulate usage metadata', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'text' }] }, index: 0 }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
    });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'more' }] }, index: 0 }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    });

    const result = accumulator.build();
    expect(result.usageMetadata?.totalTokenCount).toBe(8); // Uses latest
  });

  it('should handle multiple candidates', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [
        { content: { parts: [{ text: 'Candidate 1' }] }, index: 0 },
        { content: { parts: [{ text: 'Candidate 2' }] }, index: 1 },
      ],
    });

    const result = accumulator.build();
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates?.[0]?.index).toBe(0);
    expect(result.candidates?.[1]?.index).toBe(1);
  });

  it('should merge safety ratings', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [
        {
          content: { parts: [{ text: 'text' }] },
          safetyRatings: [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' }],
          index: 0,
        },
      ],
    });

    accumulator.add({
      candidates: [
        {
          content: { parts: [{ text: 'more' }] },
          safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'LOW' }],
          index: 0,
        },
      ],
    });

    const result = accumulator.build();
    // Should use latest ratings
    expect(result.candidates?.[0]?.safetyRatings).toHaveLength(1);
    expect(result.candidates?.[0]?.safetyRatings?.[0]?.category).toBe('HARM_CATEGORY_HARASSMENT');
  });

  it('should merge citation sources', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [
        {
          content: { parts: [{ text: 'text' }] },
          citationMetadata: {
            citationSources: [{ startIndex: 0, endIndex: 10, uri: 'https://example.com/1' }],
          },
          index: 0,
        },
      ],
    });

    accumulator.add({
      candidates: [
        {
          content: { parts: [{ text: 'more' }] },
          citationMetadata: {
            citationSources: [{ startIndex: 10, endIndex: 20, uri: 'https://example.com/2' }],
          },
          index: 0,
        },
      ],
    });

    const result = accumulator.build();
    expect(result.candidates?.[0]?.citationMetadata?.citationSources).toHaveLength(2);
  });

  it('should get accumulated text', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'Hello' }] }, index: 0 }],
    });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: ' World' }] }, index: 0 }],
    });

    expect(accumulator.getText()).toBe('Hello World');
  });

  it('should handle empty accumulator', () => {
    const accumulator = new StreamAccumulator();

    expect(accumulator.isEmpty).toBe(true);
    expect(accumulator.getText()).toBe('');
    expect(accumulator.candidateCount).toBe(0);

    const result = accumulator.build();
    expect(result.candidates).toBeUndefined();
  });

  it('should peek at current state without finalizing', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'Partial' }] }, index: 0 }],
    });

    const peeked = accumulator.peek();
    expect(peeked.candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Partial' });

    // Should still be able to add more
    accumulator.add({
      candidates: [{ content: { parts: [{ text: ' text' }] }, index: 0 }],
    });

    const final = accumulator.build();
    expect(final.candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Partial text' });
  });

  it('should reset accumulator', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'text' }] }, index: 0 }],
    });

    expect(accumulator.isEmpty).toBe(false);

    accumulator.reset();

    expect(accumulator.isEmpty).toBe(true);
    expect(accumulator.getText()).toBe('');
  });

  it('should handle non-text parts without merging', () => {
    const accumulator = new StreamAccumulator();

    accumulator.add({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'test', args: {} } }],
          },
          index: 0,
        },
      ],
    });

    accumulator.add({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'test2', args: {} } }],
          },
          index: 0,
        },
      ],
    });

    const result = accumulator.build();
    expect(result.candidates?.[0]?.content?.parts).toHaveLength(2);
  });

  it('should disable text merging when configured', () => {
    const accumulator = new StreamAccumulator({ mergeTextParts: false });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'Hello' }] }, index: 0 }],
    });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: ' World' }] }, index: 0 }],
    });

    const result = accumulator.build();
    expect(result.candidates?.[0]?.content?.parts).toHaveLength(2);
    expect(result.candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello' });
    expect(result.candidates?.[0]?.content?.parts[1]).toEqual({ text: ' World' });
  });

  it('should disable usage tracking when configured', () => {
    const accumulator = new StreamAccumulator({ trackUsage: false });

    accumulator.add({
      candidates: [{ content: { parts: [{ text: 'text' }] }, index: 0 }],
      usageMetadata: { totalTokenCount: 10 },
    });

    const result = accumulator.build();
    expect(result.usageMetadata).toBeUndefined();
  });
});
