"use strict";
/**
 * Telemetry Emitter Module
 *
 * A shared module for sending telemetry events to the ruvvector-service /ingest endpoint.
 *
 * Features:
 * - Non-blocking fire-and-forget pattern (fails open - never blocks integrations)
 * - Exponential backoff retry with configurable attempts
 * - Singleton pattern for shared usage across integrations
 * - Never throws exceptions that could affect integrations
 * - Configurable endpoint via RUVVECTOR_INGEST_URL environment variable
 *
 * @example
 * ```typescript
 * import { TelemetryEmitter } from '@integrations/telemetry-emitter';
 *
 * const emitter = TelemetryEmitter.getInstance();
 *
 * // Emit a request start event
 * emitter.emitRequestStart('anthropic', 'correlation-123', {
 *   model: 'claude-3-5-sonnet-20241022',
 *   endpoint: '/v1/messages',
 * });
 *
 * // Emit a request complete event
 * emitter.emitRequestComplete('anthropic', 'correlation-123', {
 *   statusCode: 200,
 *   tokensUsed: 150,
 * });
 *
 * // Emit an error event
 * emitter.emitError('anthropic', 'correlation-123', new Error('API Error'), {
 *   statusCode: 500,
 * });
 *
 * // Emit a latency event
 * emitter.emitLatency('anthropic', 'correlation-123', 450, {
 *   endpoint: '/v1/messages',
 * });
 *
 * // Or emit a custom event
 * emitter.emit({
 *   correlationId: 'correlation-123',
 *   integration: 'anthropic',
 *   provider: 'claude-3-5-sonnet-20241022',
 *   eventType: 'request_start',
 *   timestamp: Date.now(),
 *   metadata: { custom: 'data' },
 * });
 * ```
 *
 * @module @integrations/telemetry-emitter
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryEmitter = void 0;
// Export main class
var emitter_js_1 = require("./emitter.js");
Object.defineProperty(exports, "TelemetryEmitter", { enumerable: true, get: function () { return emitter_js_1.TelemetryEmitter; } });
//# sourceMappingURL=index.js.map