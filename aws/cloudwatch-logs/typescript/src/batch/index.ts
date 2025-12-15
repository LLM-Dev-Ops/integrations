/**
 * AWS CloudWatch Logs Batch Module
 *
 * This module provides efficient batching of log events for CloudWatch Logs.
 */

export { BatchConfig, DEFAULT_BATCH_CONFIG, validateBatchConfig } from './config';
export { BatchBuffer, BatchBufferImpl, BatchMetrics, FlushFunction } from './buffer';
export { SequenceTokenManager } from './sequencing';
