/**
 * Query Service Module
 *
 * Re-exports for BigQuery query service.
 */

export { QueryService } from "./service.js";
export type {
  QueryRequest,
  QueryResponse,
  Job,
  CostEstimate,
  GetQueryResultsOptions,
  JobReference,
  DatasetReference,
  TableReference,
  QueryPriority,
  ParameterMode,
  QueryParameterValue,
  QueryParameters,
} from "./types.js";
