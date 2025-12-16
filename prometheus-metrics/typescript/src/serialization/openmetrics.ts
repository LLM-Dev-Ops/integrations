import { MetricFamily, MetricType, MetricValue, HistogramValue } from '../types';
import {
  escapeHelpText,
  escapeLabelValue,
  formatLabels,
  formatLabelsWithLe,
  formatValue,
} from './prometheus-text';

/**
 * Serializes metrics to OpenMetrics format.
 * See: https://github.com/OpenObservability/OpenMetrics/blob/main/specification/OpenMetrics.md
 *
 * Key differences from Prometheus text format:
 * - Counters need _total suffix
 * - EOF marker at end
 * - Different type name for "untyped" (uses "unknown")
 * - Support for UNIT metadata
 * - Support for timestamps
 */
export class OpenMetricsSerializer {
  /**
   * Serialize metric families to OpenMetrics format.
   */
  serialize(families: MetricFamily[]): string {
    let output = '';

    for (const family of families) {
      output += this.serializeFamily(family);
    }

    // OpenMetrics requires EOF marker
    output += '# EOF\n';

    return output;
  }

  private serializeFamily(family: MetricFamily): string {
    let output = '';

    // # HELP line
    output += `# HELP ${family.name} ${escapeHelpText(family.help)}\n`;

    // # TYPE line (OpenMetrics uses "unknown" instead of "untyped")
    const typeStr = family.type === MetricType.Untyped ? 'unknown' : family.type;
    output += `# TYPE ${family.name} ${typeStr}\n`;

    // # UNIT line if applicable
    if (family.unit) {
      output += `# UNIT ${family.name} ${family.unit}\n`;
    }

    // Metric lines
    for (const metric of family.metrics) {
      if (family.type === MetricType.Histogram) {
        output += this.serializeHistogram(family.name, metric as HistogramValue);
      } else {
        output += this.serializeMetric(family.name, family.type, metric as MetricValue);
      }
    }

    return output;
  }

  private serializeMetric(name: string, type: MetricType, metric: MetricValue): string {
    // OpenMetrics counters need _total suffix
    const metricName = type === MetricType.Counter ? `${name}_total` : name;

    const labels = formatLabels(metric.labels);
    let line = `${metricName}${labels} ${formatValue(metric.value)}`;

    // Add timestamp if present
    if (metric.timestamp !== undefined) {
      line += ` ${metric.timestamp}`;
    }

    return line + '\n';
  }

  private serializeHistogram(name: string, histogram: HistogramValue): string {
    let output = '';

    // Bucket lines (cumulative)
    for (const [le, count] of histogram.buckets.entries()) {
      const labels = formatLabelsWithLe(histogram.labels, le);
      let line = `${name}_bucket${labels} ${count}`;

      if (histogram.timestamp !== undefined) {
        line += ` ${histogram.timestamp}`;
      }

      output += line + '\n';
    }

    // Sum and count
    const baseLabels = formatLabels(histogram.labels);

    let sumLine = `${name}_sum${baseLabels} ${formatValue(histogram.sum)}`;
    if (histogram.timestamp !== undefined) {
      sumLine += ` ${histogram.timestamp}`;
    }
    output += sumLine + '\n';

    let countLine = `${name}_count${baseLabels} ${histogram.count}`;
    if (histogram.timestamp !== undefined) {
      countLine += ` ${histogram.timestamp}`;
    }
    output += countLine + '\n';

    return output;
  }
}
