import { MetricFamily, MetricType, MetricValue, HistogramValue, Labels } from '../types';

/**
 * Serializes metrics to Prometheus text exposition format v0.0.4.
 * See: https://prometheus.io/docs/instrumenting/exposition_formats/
 */
export class PrometheusTextSerializer {
  /**
   * Serialize metric families to Prometheus text format.
   */
  serialize(families: MetricFamily[]): string {
    let output = '';
    for (const family of families) {
      output += this.serializeFamily(family);
    }
    return output;
  }

  private serializeFamily(family: MetricFamily): string {
    let output = '';

    // # HELP line
    output += `# HELP ${family.name} ${escapeHelpText(family.help)}\n`;

    // # TYPE line
    output += `# TYPE ${family.name} ${family.type}\n`;

    // Metric lines
    for (const metric of family.metrics) {
      if (family.type === MetricType.Histogram) {
        output += this.serializeHistogram(family.name, metric as HistogramValue);
      } else {
        output += this.serializeMetric(family.name, metric as MetricValue);
      }
    }

    // Blank line between families
    output += '\n';
    return output;
  }

  private serializeMetric(name: string, metric: MetricValue): string {
    const labels = formatLabels(metric.labels);
    return `${name}${labels} ${formatValue(metric.value)}\n`;
  }

  private serializeHistogram(name: string, histogram: HistogramValue): string {
    let output = '';

    // Bucket lines (cumulative)
    // Note: buckets in HistogramValue are already cumulative from observe()
    for (const [le, count] of histogram.buckets.entries()) {
      const labels = formatLabelsWithLe(histogram.labels, le);
      output += `${name}_bucket${labels} ${count}\n`;
    }

    // Sum and count
    const baseLabels = formatLabels(histogram.labels);
    output += `${name}_sum${baseLabels} ${formatValue(histogram.sum)}\n`;
    output += `${name}_count${baseLabels} ${histogram.count}\n`;

    return output;
  }
}

/**
 * Escape help text according to Prometheus format.
 * Backslashes and newlines must be escaped.
 */
export function escapeHelpText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n');
}

/**
 * Escape label value according to Prometheus format.
 * Backslashes, quotes, and newlines must be escaped.
 */
export function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Format labels as Prometheus label string.
 * Returns empty string if no labels, otherwise returns {label1="value1",label2="value2"}
 */
export function formatLabels(labels: Labels): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) {
    return '';
  }

  // Sort labels for consistent output
  keys.sort();

  const labelPairs = keys.map(key => `${key}="${escapeLabelValue(labels[key])}"`);
  return `{${labelPairs.join(',')}}`;
}

/**
 * Format labels with additional 'le' label for histogram buckets.
 */
export function formatLabelsWithLe(labels: Labels, le: number): string {
  const labelsWithLe = { ...labels, le: formatLeValue(le) };
  return formatLabels(labelsWithLe);
}

/**
 * Format 'le' (less than or equal) value for histogram buckets.
 */
function formatLeValue(le: number): string {
  if (le === Infinity) {
    return '+Inf';
  }
  return formatValue(le);
}

/**
 * Format a numeric value according to Prometheus format.
 * Handles NaN, +Inf, -Inf, and regular numbers.
 */
export function formatValue(value: number): string {
  if (isNaN(value)) {
    return 'NaN';
  }

  if (!isFinite(value)) {
    return value > 0 ? '+Inf' : '-Inf';
  }

  // For integers, format without decimal point
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toString();
  }

  // For floating point, use default toString which handles scientific notation
  return value.toString();
}
