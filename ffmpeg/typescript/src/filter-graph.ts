/**
 * FFmpeg Filter Graph Builder
 *
 * Provides a fluent API for building FFmpeg filter expressions.
 * Supports simple filters, chained filters, and complex filter graphs.
 *
 * @example Simple filter
 * ```typescript
 * const filter = new FilterGraph().scale(1920, 1080);
 * filter.toString(); // "scale=1920:1080"
 * ```
 *
 * @example Chained filters
 * ```typescript
 * const filter = new FilterGraph()
 *   .scale(1920, 1080)
 *   .crop(1920, 1080, 0, 0);
 * filter.toString(); // "scale=1920:1080,crop=1920:1080:0:0"
 * ```
 *
 * @example Complex filter with raw expression
 * ```typescript
 * const filter = new FilterGraph().raw("[0:v][1:v]overlay=10:10[out]");
 * filter.toString(); // "[0:v][1:v]overlay=10:10[out]"
 * ```
 */

import type { FilterNode, LoudnormParams } from "./types/index.js";

let filterIdCounter = 0;

/**
 * Generate a unique filter ID
 */
function generateFilterId(): string {
  return `filter_${filterIdCounter++}`;
}

/**
 * FilterGraph class for building FFmpeg filter expressions
 */
export class FilterGraph {
  private filters: FilterNode[] = [];

  /**
   * Add a filter to the graph
   *
   * @param name - Filter name (e.g., "scale", "crop", "fps")
   * @param params - Filter parameters as key-value pairs
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph()
   *   .addFilter("scale", { w: 1920, h: 1080 })
   *   .addFilter("crop", { w: 1920, h: 1080, x: 0, y: 0 });
   * ```
   */
  addFilter(name: string, params?: Record<string, unknown>): FilterGraph {
    const filter: FilterNode = {
      id: generateFilterId(),
      name,
      params: params ?? {},
    };
    this.filters.push(filter);
    return this;
  }

  /**
   * Chain multiple filters by name
   *
   * @param filterNames - Filter names to chain
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().chain("scale", "crop", "fps");
   * ```
   */
  chain(...filterNames: string[]): FilterGraph {
    for (const name of filterNames) {
      this.addFilter(name);
    }
    return this;
  }

  /**
   * Add a scale filter to resize video
   *
   * @param width - Target width in pixels
   * @param height - Target height in pixels
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().scale(1920, 1080);
   * // Result: "scale=1920:1080"
   * ```
   */
  scale(width: number, height: number): FilterGraph {
    return this.addFilter("scale", { w: width, h: height });
  }

  /**
   * Add a crop filter to crop video
   *
   * @param width - Crop width in pixels
   * @param height - Crop height in pixels
   * @param x - X offset (default: 0)
   * @param y - Y offset (default: 0)
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().crop(1920, 1080, 0, 0);
   * // Result: "crop=1920:1080:0:0"
   * ```
   */
  crop(width: number, height: number, x?: number, y?: number): FilterGraph {
    return this.addFilter("crop", {
      w: width,
      h: height,
      x: x ?? 0,
      y: y ?? 0,
    });
  }

  /**
   * Add an fps filter to set frame rate
   *
   * @param rate - Target frame rate
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().fps(30);
   * // Result: "fps=30"
   * ```
   */
  fps(rate: number): FilterGraph {
    return this.addFilter("fps", { fps: rate });
  }

  /**
   * Add a loudnorm filter for audio normalization
   *
   * @param params - Loudnorm parameters
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().loudnorm({
   *   I: -16,
   *   TP: -1.5,
   *   LRA: 11
   * });
   * // Result: "loudnorm=I=-16:TP=-1.5:LRA=11"
   * ```
   */
  loudnorm(params: LoudnormParams): FilterGraph {
    return this.addFilter("loudnorm", params);
  }

  /**
   * Add an overlay filter to overlay one video on another
   *
   * @param x - X position for overlay
   * @param y - Y position for overlay
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().overlay(10, 10);
   * // Result: "overlay=10:10"
   * ```
   */
  overlay(x: number, y: number): FilterGraph {
    return this.addFilter("overlay", { x, y });
  }

  /**
   * Add a raw filter string for complex custom filters
   *
   * Use this for complex filter graphs that require special syntax
   * or aren't supported by the convenience methods.
   *
   * @param filterString - Raw FFmpeg filter string
   * @returns This FilterGraph instance for chaining
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph().raw("[0:v][1:v]overlay=10:10[out]");
   * // Result: "[0:v][1:v]overlay=10:10[out]"
   * ```
   */
  raw(filterString: string): FilterGraph {
    this.filters.push({
      id: "raw",
      name: "raw",
      params: {},
      raw: filterString,
    });
    return this;
  }

  /**
   * Convert the filter graph to an FFmpeg filter string
   *
   * @returns FFmpeg filter string
   *
   * @example
   * ```typescript
   * const filter = new FilterGraph()
   *   .scale(1920, 1080)
   *   .crop(1920, 1080, 0, 0);
   * filter.toString(); // "scale=1920:1080,crop=1920:1080:0:0"
   * ```
   */
  toString(): string {
    if (this.filters.length === 0) {
      return "";
    }

    // Check for raw filter
    const rawFilter = this.filters.find((f) => f.raw);
    if (rawFilter) {
      return rawFilter.raw!;
    }

    // Build filter chain
    const parts = this.filters.map((f) => this.formatFilter(f));
    return parts.join(",");
  }

  /**
   * Format a single filter node
   *
   * @param filter - Filter node to format
   * @returns Formatted filter string
   */
  private formatFilter(filter: FilterNode): string {
    if (Object.keys(filter.params).length === 0) {
      return filter.name;
    }

    const paramStr = Object.entries(filter.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(":");

    return `${filter.name}=${paramStr}`;
  }
}
