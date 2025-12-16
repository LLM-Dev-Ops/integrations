/**
 * Tests for PrometheusTextSerializer.
 * Validates serialization against Prometheus text format specification.
 */

import { describe, it, expect } from 'vitest';
import { PrometheusTextSerializer } from '../prometheus-text';
import {
  escapeHelpText,
  escapeLabelValue,
  formatLabels,
  formatValue,
} from '../prometheus-text';
import { MetricType, MetricFamily, MetricValue, HistogramValue } from '../../types';

describe('PrometheusTextSerializer', () => {
  const serializer = new PrometheusTextSerializer();

  describe('escapeHelpText', () => {
    it('should escape backslashes', () => {
      expect(escapeHelpText('foo\\bar')).toBe('foo\\\\bar');
    });

    it('should escape newlines', () => {
      expect(escapeHelpText('foo\nbar')).toBe('foo\\nbar');
    });

    it('should handle multiple escapes', () => {
      expect(escapeHelpText('foo\\bar\nbaz')).toBe('foo\\\\bar\\nbaz');
    });
  });

  describe('escapeLabelValue', () => {
    it('should escape backslashes', () => {
      expect(escapeLabelValue('foo\\bar')).toBe('foo\\\\bar');
    });

    it('should escape quotes', () => {
      expect(escapeLabelValue('foo"bar')).toBe('foo\\"bar');
    });

    it('should escape newlines', () => {
      expect(escapeLabelValue('foo\nbar')).toBe('foo\\nbar');
    });

    it('should handle multiple escapes', () => {
      expect(escapeLabelValue('foo\\bar"baz\nqux')).toBe('foo\\\\bar\\"baz\\nqux');
    });
  });

  describe('formatLabels', () => {
    it('should return empty string for no labels', () => {
      expect(formatLabels({})).toBe('');
    });

    it('should format single label', () => {
      expect(formatLabels({ method: 'GET' })).toBe('{method="GET"}');
    });

    it('should format multiple labels in sorted order', () => {
      const labels = {
        status: '200',
        method: 'GET',
        path: '/api',
      };

      const result = formatLabels(labels);
      expect(result).toBe('{method="GET",path="/api",status="200"}');
    });

    it('should escape label values', () => {
      const labels = {
        message: 'hello "world"',
      };

      expect(formatLabels(labels)).toBe('{message="hello \\"world\\""}');
    });
  });

  describe('formatValue', () => {
    it('should format integers without decimal point', () => {
      expect(formatValue(42)).toBe('42');
      expect(formatValue(0)).toBe('0');
      expect(formatValue(-100)).toBe('-100');
    });

    it('should format floating point numbers', () => {
      expect(formatValue(3.14159)).toBe('3.14159');
      expect(formatValue(0.1)).toBe('0.1');
    });

    it('should handle NaN', () => {
      expect(formatValue(NaN)).toBe('NaN');
    });

    it('should handle positive infinity', () => {
      expect(formatValue(Infinity)).toBe('+Inf');
    });

    it('should handle negative infinity', () => {
      expect(formatValue(-Infinity)).toBe('-Inf');
    });
  });

  describe('serialize', () => {
    it('should serialize counter metric', () => {
      const family: MetricFamily = {
        name: 'test_counter',
        help: 'A test counter',
        type: MetricType.Counter,
        metrics: [
          {
            labels: {},
            value: 42,
          },
        ],
      };

      const output = serializer.serialize([family]);

      expect(output).toContain('# HELP test_counter A test counter');
      expect(output).toContain('# TYPE test_counter counter');
      expect(output).toContain('test_counter 42');
    });

    it('should serialize counter with labels', () => {
      const family: MetricFamily = {
        name: 'http_requests_total',
        help: 'Total HTTP requests',
        type: MetricType.Counter,
        metrics: [
          {
            labels: { method: 'GET', status: '200' },
            value: 1234,
          },
          {
            labels: { method: 'POST', status: '201' },
            value: 567,
          },
        ],
      };

      const output = serializer.serialize([family]);

      expect(output).toContain('# HELP http_requests_total Total HTTP requests');
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('http_requests_total{method="GET",status="200"} 1234');
      expect(output).toContain('http_requests_total{method="POST",status="201"} 567');
    });

    it('should serialize gauge metric', () => {
      const family: MetricFamily = {
        name: 'temperature_celsius',
        help: 'Current temperature',
        type: MetricType.Gauge,
        metrics: [
          {
            labels: {},
            value: 23.5,
          },
        ],
      };

      const output = serializer.serialize([family]);

      expect(output).toContain('# HELP temperature_celsius Current temperature');
      expect(output).toContain('# TYPE temperature_celsius gauge');
      expect(output).toContain('temperature_celsius 23.5');
    });

    it('should serialize histogram metric', () => {
      const buckets = new Map<number, number>();
      buckets.set(0.1, 10);
      buckets.set(0.5, 25);
      buckets.set(1.0, 40);
      buckets.set(Infinity, 50);

      const family: MetricFamily = {
        name: 'request_duration_seconds',
        help: 'Request duration',
        type: MetricType.Histogram,
        metrics: [
          {
            labels: {},
            buckets,
            sum: 12.5,
            count: 50,
          } as HistogramValue,
        ],
      };

      const output = serializer.serialize([family]);

      expect(output).toContain('# HELP request_duration_seconds Request duration');
      expect(output).toContain('# TYPE request_duration_seconds histogram');
      expect(output).toContain('request_duration_seconds_bucket{le="0.1"} 10');
      expect(output).toContain('request_duration_seconds_bucket{le="0.5"} 25');
      expect(output).toContain('request_duration_seconds_bucket{le="1"} 40');
      expect(output).toContain('request_duration_seconds_bucket{le="+Inf"} 50');
      expect(output).toContain('request_duration_seconds_sum 12.5');
      expect(output).toContain('request_duration_seconds_count 50');
    });

    it('should serialize histogram with labels', () => {
      const buckets = new Map<number, number>();
      buckets.set(0.1, 5);
      buckets.set(Infinity, 10);

      const family: MetricFamily = {
        name: 'request_duration_seconds',
        help: 'Request duration',
        type: MetricType.Histogram,
        metrics: [
          {
            labels: { method: 'GET' },
            buckets,
            sum: 2.5,
            count: 10,
          } as HistogramValue,
        ],
      };

      const output = serializer.serialize([family]);

      expect(output).toContain('request_duration_seconds_bucket{le="0.1",method="GET"} 5');
      expect(output).toContain('request_duration_seconds_bucket{le="+Inf",method="GET"} 10');
      expect(output).toContain('request_duration_seconds_sum{method="GET"} 2.5');
      expect(output).toContain('request_duration_seconds_count{method="GET"} 10');
    });

    it('should add blank lines between families', () => {
      const families: MetricFamily[] = [
        {
          name: 'metric1',
          help: 'First metric',
          type: MetricType.Counter,
          metrics: [{ labels: {}, value: 1 }],
        },
        {
          name: 'metric2',
          help: 'Second metric',
          type: MetricType.Gauge,
          metrics: [{ labels: {}, value: 2 }],
        },
      ];

      const output = serializer.serialize(families);

      // Should have blank lines separating families
      expect(output).toMatch(/metric1 1\n\n# HELP metric2/);
    });

    it('should escape help text', () => {
      const family: MetricFamily = {
        name: 'test',
        help: 'Line 1\nLine 2\\with\\backslashes',
        type: MetricType.Counter,
        metrics: [{ labels: {}, value: 1 }],
      };

      const output = serializer.serialize([family]);

      expect(output).toContain('# HELP test Line 1\\nLine 2\\\\with\\\\backslashes');
    });
  });
});
