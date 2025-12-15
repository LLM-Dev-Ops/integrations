/**
 * BigQuery Job Types
 *
 * Represents jobs and job-related data structures.
 */

/**
 * Job state.
 */
export type JobState = "PENDING" | "RUNNING" | "DONE";

/**
 * Job error result.
 */
export interface JobErrorResult {
  reason: string;
  location?: string;
  message: string;
}

/**
 * Job status.
 */
export interface JobStatus {
  state: JobState;
  errorResult?: JobErrorResult;
  errors?: JobErrorResult[];
}

/**
 * Job reference.
 */
export interface JobReference {
  projectId: string;
  jobId: string;
  location?: string;
}

/**
 * Job statistics (common fields).
 */
export interface JobStatistics {
  creationTime: string;
  startTime?: string;
  endTime?: string;
  totalBytesProcessed?: string;
  totalBytesBilled?: string;
  totalSlotMs?: string;
  numChildJobs?: string;
  parentJobId?: string;
  scriptStatistics?: {
    stackFrames?: Array<{
      startLine?: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
      procedureId?: string;
      text?: string;
    }>;
    evaluationKind?: string;
  };
  reservationUsage?: Array<{
    name?: string;
    slotMs?: string;
  }>;
  query?: JobStatisticsQuery;
  load?: JobStatisticsLoad;
  extract?: JobStatisticsExtract;
  copy?: JobStatisticsCopy;
}

/**
 * Query job statistics.
 */
export interface JobStatisticsQuery {
  totalBytesProcessed?: string;
  totalBytesBilled?: string;
  billingTier?: number;
  cacheHit?: boolean;
  ddlOperationPerformed?: string;
  ddlTargetTable?: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };
  ddlTargetRoutine?: {
    projectId: string;
    datasetId: string;
    routineId: string;
  };
  ddlTargetRowAccessPolicy?: {
    projectId: string;
    datasetId: string;
    tableId: string;
    policyId: string;
  };
  ddlTargetDataset?: {
    projectId: string;
    datasetId: string;
  };
  statementType?: string;
  totalBytesBilledForQuery?: string;
  totalPartitionsProcessed?: string;
  estimatedBytesProcessed?: string;
  numDmlAffectedRows?: string;
  referencedTables?: Array<{
    projectId: string;
    datasetId: string;
    tableId: string;
  }>;
  schema?: {
    fields: Array<{
      name: string;
      type: string;
      mode?: string;
    }>;
  };
  totalSlotMs?: string;
  queryPlan?: Array<{
    name?: string;
    id?: string;
    status?: string;
    shuffleOutputBytes?: string;
    shuffleOutputBytesSpilled?: string;
    recordsRead?: string;
    recordsWritten?: string;
    parallelInputs?: string;
    completedParallelInputs?: string;
    startMs?: string;
    endMs?: string;
    slotMs?: string;
    waitMsAvg?: string;
    waitMsMax?: string;
    readMsAvg?: string;
    readMsMax?: string;
    writeMsAvg?: string;
    writeMsMax?: string;
    computeMsAvg?: string;
    computeMsMax?: string;
    waitRatioAvg?: number;
    waitRatioMax?: number;
    readRatioAvg?: number;
    readRatioMax?: number;
    computeRatioAvg?: number;
    computeRatioMax?: number;
    writeRatioAvg?: number;
    writeRatioMax?: number;
    steps?: Array<{
      kind?: string;
      substeps?: string[];
    }>;
  }>;
  timeline?: Array<{
    elapsedMs?: string;
    totalSlotMs?: string;
    pendingUnits?: string;
    completedUnits?: string;
    activeUnits?: string;
    estimatedRunnableUnits?: string;
  }>;
  undeclaredQueryParameters?: Array<{
    name?: string;
    parameterType?: {
      type: string;
      arrayType?: { type: string };
      structTypes?: Array<{
        name?: string;
        type: { type: string };
      }>;
    };
    parameterValue?: {
      value?: string;
      arrayValues?: Array<{ value?: string }>;
      structValues?: Record<string, { value?: string }>;
    };
  }>;
}

/**
 * Load job statistics.
 */
export interface JobStatisticsLoad {
  inputFiles?: string;
  inputFileBytes?: string;
  outputRows?: string;
  outputBytes?: string;
  badRecords?: string;
}

/**
 * Extract job statistics.
 */
export interface JobStatisticsExtract {
  destinationUriFileCounts?: string[];
}

/**
 * Copy job statistics.
 */
export interface JobStatisticsCopy {
  copiedRows?: string;
  copiedLogicalBytes?: string;
}

/**
 * Job configuration (common fields).
 */
export interface JobConfiguration {
  jobType: string;
  labels?: Record<string, string>;
  dryRun?: boolean;
  jobTimeoutMs?: string;
  query?: JobConfigurationQuery;
  load?: JobConfigurationLoad;
  extract?: JobConfigurationExtract;
  copy?: JobConfigurationCopy;
}

/**
 * Query job configuration.
 */
export interface JobConfigurationQuery {
  query: string;
  destinationTable?: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };
  createDisposition?: string;
  writeDisposition?: string;
  priority?: string;
  allowLargeResults?: boolean;
  useQueryCache?: boolean;
  useLegacySql?: boolean;
  maximumBytesBilled?: string;
  schemaUpdateOptions?: string[];
  timePartitioning?: {
    type?: string;
    expirationMs?: string;
    field?: string;
  };
  rangePartitioning?: {
    field?: string;
    range?: {
      start?: string;
      end?: string;
      interval?: string;
    };
  };
  clustering?: {
    fields?: string[];
  };
  defaultDataset?: {
    projectId: string;
    datasetId: string;
  };
  queryParameters?: Array<{
    name?: string;
    parameterType?: {
      type: string;
      arrayType?: { type: string };
      structTypes?: Array<{
        name?: string;
        type: { type: string };
      }>;
    };
    parameterValue?: {
      value?: string;
      arrayValues?: Array<{ value?: string }>;
      structValues?: Record<string, { value?: string }>;
    };
  }>;
}

/**
 * Load job configuration.
 */
export interface JobConfigurationLoad {
  sourceUris: string[];
  sourceFormat?: string;
  destinationTable: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };
  createDisposition?: string;
  writeDisposition?: string;
  autodetect?: boolean;
  schema?: {
    fields: Array<{
      name: string;
      type: string;
      mode?: string;
    }>;
  };
  maxBadRecords?: number;
  ignoreUnknownValues?: boolean;
  skipLeadingRows?: number;
  encoding?: string;
  quote?: string;
  fieldDelimiter?: string;
  allowJaggedRows?: boolean;
  allowQuotedNewlines?: boolean;
}

/**
 * Extract job configuration.
 */
export interface JobConfigurationExtract {
  sourceTable: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };
  destinationUris: string[];
  destinationFormat?: string;
  compression?: string;
  fieldDelimiter?: string;
  printHeader?: boolean;
}

/**
 * Copy job configuration.
 */
export interface JobConfigurationCopy {
  sourceTables: Array<{
    projectId: string;
    datasetId: string;
    tableId: string;
  }>;
  destinationTable: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };
  createDisposition?: string;
  writeDisposition?: string;
}

/**
 * BigQuery job.
 */
export interface Job {
  kind: string;
  etag: string;
  id: string;
  selfLink: string;
  user_email: string;
  jobReference: JobReference;
  configuration: JobConfiguration;
  status: JobStatus;
  statistics: JobStatistics;
}
