/**
 * Query Engine Module
 *
 * Query building, execution, and parameter binding utilities.
 * @module @llmdevops/snowflake-integration/query
 */

// Query builder exports
export {
  QueryBuilder,
  query,
  Query,
  QueryExecutionMode,
} from './builder.js';

// Query executor exports
export {
  QueryExecutor,
  createQueryExecutor,
  QueryExecutionFn,
  AsyncQuerySubmissionFn,
  StatusPollingFn,
  QueryCancellationFn,
  RawQueryResult,
  QueryExecutionOptions,
  RetryConfig,
} from './executor.js';

// Async query handle exports
export {
  AsyncQueryHandle,
  createAsyncQueryHandle,
  StatusPoller,
  QueryCanceller,
  WaitOptions,
} from './async-handle.js';

// Parameter binding exports
export {
  ParameterBinding,
  createPositionalBinding,
  createNamedBinding,
  addPositionalParam,
  addNamedParam,
  getParameter,
  getParameterValues,
  toSdkBinds,
  validateBinding,
  fromRawValues,
} from './params.js';
