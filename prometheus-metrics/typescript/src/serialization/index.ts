/**
 * Serialization module for Prometheus and OpenMetrics formats.
 */

export { PrometheusTextSerializer } from './prometheus-text';
export { OpenMetricsSerializer } from './openmetrics';
export {
  escapeHelpText,
  escapeLabelValue,
  formatLabels,
  formatValue,
} from './prometheus-text';

export type OutputFormat = 'prometheus' | 'openmetrics';

/**
 * Factory function to create a serializer for the specified format.
 */
export function createSerializer(
  format: OutputFormat
): PrometheusTextSerializer | OpenMetricsSerializer {
  switch (format) {
    case 'prometheus':
      return new PrometheusTextSerializer();
    case 'openmetrics':
      return new OpenMetricsSerializer();
    default:
      throw new Error(`Unknown output format: ${format}`);
  }
}
