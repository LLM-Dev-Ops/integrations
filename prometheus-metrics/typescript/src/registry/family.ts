import { MetricType, MetricFamily, MetricValue, HistogramValue } from '../types';

/**
 * Container for a family of metrics with the same name.
 * Implements the MetricFamily interface for storing and managing metrics.
 */
export class MetricFamilyImpl implements MetricFamily {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  private _metrics: (MetricValue | HistogramValue)[] = [];
  readonly unit: string | undefined;

  constructor(name: string, help: string, type: MetricType, unit?: string) {
    this.name = name;
    this.help = help;
    this.type = type;
    this.unit = unit ?? undefined;
  }

  get metrics(): (MetricValue | HistogramValue)[] {
    return this._metrics;
  }

  addMetric(metric: MetricValue | HistogramValue): void {
    this._metrics.push(metric);
  }

  clearMetrics(): void {
    this._metrics = [];
  }
}
