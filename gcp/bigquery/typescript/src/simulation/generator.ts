/**
 * Test data generator for BigQuery schemas and rows.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import {
  TableSchema,
  TableFieldSchema,
  FieldType,
  FieldMode,
} from "../types/schema.js";
import { TableRow, TableCell } from "../types/row.js";
import { Job, JobReference } from "../services/query/types.js";
import { JobState } from "./types.js";

/**
 * Generate a table schema with random fields.
 *
 * @param fields - Number of fields to generate
 * @param depth - Nesting depth for STRUCT fields (default: 0)
 * @returns Generated table schema
 */
export function generateSchema(fields: number, depth: number = 0): TableSchema {
  const fieldSchemas: TableFieldSchema[] = [];

  for (let i = 0; i < fields; i++) {
    fieldSchemas.push(generateField(`field_${i}`, depth));
  }

  return {
    fields: fieldSchemas,
  };
}

/**
 * Generate a single field schema.
 */
function generateField(name: string, depth: number): TableFieldSchema {
  const types = [
    FieldType.STRING,
    FieldType.INTEGER,
    FieldType.FLOAT,
    FieldType.BOOLEAN,
    FieldType.TIMESTAMP,
    FieldType.DATE,
  ];

  // Add STRUCT type if we haven't reached max depth
  if (depth > 0) {
    types.push(FieldType.STRUCT);
  }

  const type = types[Math.floor(Math.random() * types.length)]!;
  const mode = Math.random() > 0.8 ? FieldMode.REPEATED : FieldMode.NULLABLE;

  const field: TableFieldSchema = {
    name,
    type,
    mode,
  };

  // Generate nested fields for STRUCT types
  if (type === FieldType.STRUCT && depth > 0) {
    const nestedFieldCount = Math.floor(Math.random() * 3) + 1;
    field.fields = [];
    for (let i = 0; i < nestedFieldCount; i++) {
      field.fields.push(generateField(`nested_${i}`, depth - 1));
    }
  }

  return field;
}

/**
 * Generate rows matching a schema.
 *
 * @param schema - Table schema
 * @param count - Number of rows to generate
 * @returns Generated rows
 */
export function generateRows(schema: TableSchema, count: number): TableRow[] {
  const rows: TableRow[] = [];

  for (let i = 0; i < count; i++) {
    rows.push(generateRow(schema));
  }

  return rows;
}

/**
 * Generate a single row matching a schema.
 */
function generateRow(schema: TableSchema): TableRow {
  const cells: TableCell[] = [];

  for (const field of schema.fields) {
    cells.push({
      v: generateValue(field),
    });
  }

  return {
    f: cells,
  };
}

/**
 * Generate a random value for a field type.
 *
 * @param fieldType - Field type
 * @returns Random value appropriate for the type
 */
export function randomValue(fieldType: FieldType): unknown {
  switch (fieldType) {
    case FieldType.STRING:
      return randomString(10);

    case FieldType.INTEGER:
    case FieldType.INT64:
      return randomInt(0, 1000000);

    case FieldType.FLOAT:
    case FieldType.FLOAT64:
      return randomFloat(0, 1000000);

    case FieldType.NUMERIC:
    case FieldType.BIGNUMERIC:
      return randomFloat(0, 1000000).toFixed(2);

    case FieldType.BOOLEAN:
    case FieldType.BOOL:
      return Math.random() > 0.5;

    case FieldType.TIMESTAMP:
      return new Date(
        Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)
      ).toISOString();

    case FieldType.DATE:
      return new Date(
        Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)
      ).toISOString().split("T")[0];

    case FieldType.TIME:
      return `${padZero(randomInt(0, 23))}:${padZero(randomInt(0, 59))}:${padZero(randomInt(0, 59))}`;

    case FieldType.DATETIME:
      return new Date(
        Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)
      ).toISOString().replace("T", " ").replace("Z", "");

    case FieldType.BYTES:
      return Buffer.from(randomString(20)).toString("base64");

    case FieldType.GEOGRAPHY:
      return `POINT(${randomFloat(-180, 180)} ${randomFloat(-90, 90)})`;

    case FieldType.JSON:
      return JSON.stringify({
        key: randomString(5),
        value: randomInt(0, 100),
      });

    default:
      return null;
  }
}

/**
 * Generate a value for a field (considering mode and nested fields).
 */
function generateValue(field: TableFieldSchema): unknown {
  // Handle REPEATED fields
  if (field.mode === FieldMode.REPEATED) {
    const count = Math.floor(Math.random() * 5) + 1;
    const values: unknown[] = [];
    for (let i = 0; i < count; i++) {
      values.push(generateSingleValue(field));
    }
    return values;
  }

  // Handle NULLABLE fields (20% chance of null)
  if (field.mode === FieldMode.NULLABLE && Math.random() < 0.2) {
    return null;
  }

  return generateSingleValue(field);
}

/**
 * Generate a single value for a field.
 */
function generateSingleValue(field: TableFieldSchema): unknown {
  // Handle STRUCT types
  if (field.type === FieldType.STRUCT && field.fields) {
    const obj: Record<string, unknown> = {};
    for (const nestedField of field.fields) {
      obj[nestedField.name] = generateValue(nestedField);
    }
    return obj;
  }

  return randomValue(field.type);
}

/**
 * Generate a mock job with specified state.
 *
 * @param status - Job state
 * @returns Generated job
 */
export function generateJob(status: JobState): Job {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const projectId = "test-project";
  const location = "US";

  const job: Job = {
    jobReference: {
      projectId,
      jobId,
      location,
    },
    status: {
      state: status,
    },
    configuration: {
      query: {
        query: "SELECT * FROM test_table",
        useLegacySql: false,
      },
    },
  };

  // Add statistics for DONE jobs
  if (status === "DONE") {
    const now = Date.now();
    const startTime = now - 5000;
    const creationTime = startTime - 1000;

    job.statistics = {
      creationTime: creationTime.toString(),
      startTime: startTime.toString(),
      endTime: now.toString(),
      totalBytesProcessed: randomInt(1000, 1000000000).toString(),
      totalBytesBilled: randomInt(1000, 1000000000).toString(),
      query: {
        totalBytesProcessed: randomInt(1000, 1000000000).toString(),
        totalBytesBilled: randomInt(1000, 1000000000).toString(),
        cacheHit: Math.random() > 0.5,
        billingTier: 1,
      },
    };
  } else if (status === "RUNNING") {
    const now = Date.now();
    const startTime = now - 2000;
    const creationTime = startTime - 1000;

    job.statistics = {
      creationTime: creationTime.toString(),
      startTime: startTime.toString(),
    };
  } else if (status === "PENDING") {
    const creationTime = Date.now();

    job.statistics = {
      creationTime: creationTime.toString(),
    };
  }

  return job;
}

/**
 * Generate a random string.
 */
function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random integer in range [min, max).
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Generate a random float in range [min, max).
 */
function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Pad a number with leading zero if needed.
 */
function padZero(num: number): string {
  return num.toString().padStart(2, "0");
}
