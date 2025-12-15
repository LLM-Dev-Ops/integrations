/**
 * Query parameter types for parameterized BigQuery queries.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

/**
 * Parameter type enumeration.
 *
 * Supports all BigQuery data types for query parameters.
 */
export enum ParameterType {
  STRING = "STRING",
  INT64 = "INT64",
  FLOAT64 = "FLOAT64",
  BOOL = "BOOL",
  BYTES = "BYTES",
  DATE = "DATE",
  DATETIME = "DATETIME",
  TIME = "TIME",
  TIMESTAMP = "TIMESTAMP",
  NUMERIC = "NUMERIC",
  BIGNUMERIC = "BIGNUMERIC",
  GEOGRAPHY = "GEOGRAPHY",
  JSON = "JSON",
  STRUCT = "STRUCT",
  ARRAY = "ARRAY",
}

/**
 * Parameter mode enumeration.
 */
export enum ParameterMode {
  POSITIONAL = "POSITIONAL",
  NAMED = "NAMED",
}

/**
 * Parameter type definition for STRUCT fields.
 */
export interface StructParameterType {
  /** Field name. */
  name: string;

  /** Field type. */
  type: QueryParameterType;

  /** Field description (optional). */
  description?: string;
}

/**
 * Query parameter type definition (recursive for STRUCT and ARRAY).
 */
export interface QueryParameterType {
  /** Parameter type. */
  type: ParameterType;

  /** Array element type (for ARRAY parameters). */
  arrayType?: QueryParameterType;

  /** Struct field types (for STRUCT parameters). */
  structTypes?: StructParameterType[];
}

/**
 * Query parameter value (recursive for STRUCT and ARRAY).
 */
export interface QueryParameterValue {
  /** Scalar value (for non-ARRAY, non-STRUCT types). */
  value?: string;

  /** Array values (for ARRAY parameters). */
  arrayValues?: QueryParameterValue[];

  /** Struct values (for STRUCT parameters). */
  structValues?: Record<string, QueryParameterValue>;
}

/**
 * Query parameter (positional or named).
 */
export interface QueryParameter {
  /** Parameter name (for named parameters). */
  name?: string;

  /** Parameter type. */
  parameterType: QueryParameterType;

  /** Parameter value. */
  parameterValue: QueryParameterValue;
}

/**
 * Container for query parameters.
 */
export interface QueryParameters {
  /** Parameter mode (positional or named). */
  mode: ParameterMode;

  /** Array of parameters. */
  parameters: QueryParameter[];
}

/**
 * Create a scalar parameter type.
 */
export function createScalarParameterType(type: ParameterType): QueryParameterType {
  return { type };
}

/**
 * Create an array parameter type.
 */
export function createArrayParameterType(elementType: QueryParameterType): QueryParameterType {
  return {
    type: ParameterType.ARRAY,
    arrayType: elementType,
  };
}

/**
 * Create a struct parameter type.
 */
export function createStructParameterType(
  fields: StructParameterType[]
): QueryParameterType {
  return {
    type: ParameterType.STRUCT,
    structTypes: fields,
  };
}

/**
 * Create a scalar parameter value.
 */
export function createScalarParameterValue(value: string): QueryParameterValue {
  return { value };
}

/**
 * Create an array parameter value.
 */
export function createArrayParameterValue(
  values: QueryParameterValue[]
): QueryParameterValue {
  return { arrayValues: values };
}

/**
 * Create a struct parameter value.
 */
export function createStructParameterValue(
  values: Record<string, QueryParameterValue>
): QueryParameterValue {
  return { structValues: values };
}

/**
 * Create a named query parameter.
 */
export function createNamedParameter(
  name: string,
  type: QueryParameterType,
  value: QueryParameterValue
): QueryParameter {
  return {
    name,
    parameterType: type,
    parameterValue: value,
  };
}

/**
 * Create a positional query parameter.
 */
export function createPositionalParameter(
  type: QueryParameterType,
  value: QueryParameterValue
): QueryParameter {
  return {
    parameterType: type,
    parameterValue: value,
  };
}

/**
 * Create a STRING parameter (named or positional).
 */
export function createStringParameter(name: string | undefined, value: string): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.STRING),
    parameterValue: createScalarParameterValue(value),
  };
}

/**
 * Create an INT64 parameter (named or positional).
 */
export function createInt64Parameter(
  name: string | undefined,
  value: number | bigint
): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.INT64),
    parameterValue: createScalarParameterValue(value.toString()),
  };
}

/**
 * Create a FLOAT64 parameter (named or positional).
 */
export function createFloat64Parameter(
  name: string | undefined,
  value: number
): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.FLOAT64),
    parameterValue: createScalarParameterValue(value.toString()),
  };
}

/**
 * Create a BOOL parameter (named or positional).
 */
export function createBoolParameter(name: string | undefined, value: boolean): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.BOOL),
    parameterValue: createScalarParameterValue(value.toString()),
  };
}

/**
 * Create a DATE parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - Date value (YYYY-MM-DD format or Date object).
 */
export function createDateParameter(
  name: string | undefined,
  value: string | Date
): QueryParameter {
  const dateStr =
    typeof value === "string" ? value : value.toISOString().split("T")[0] ?? "";
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.DATE),
    parameterValue: createScalarParameterValue(dateStr),
  };
}

/**
 * Create a TIMESTAMP parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - Timestamp value (RFC 3339 format or Date object).
 */
export function createTimestampParameter(
  name: string | undefined,
  value: string | Date
): QueryParameter {
  const timestampStr = typeof value === "string" ? value : value.toISOString();
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.TIMESTAMP),
    parameterValue: createScalarParameterValue(timestampStr),
  };
}

/**
 * Create a DATETIME parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - Datetime value (YYYY-MM-DD HH:MM:SS format or Date object).
 */
export function createDatetimeParameter(
  name: string | undefined,
  value: string | Date
): QueryParameter {
  const datetimeStr =
    typeof value === "string"
      ? value
      : value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.DATETIME),
    parameterValue: createScalarParameterValue(datetimeStr),
  };
}

/**
 * Create a TIME parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - Time value (HH:MM:SS format).
 */
export function createTimeParameter(name: string | undefined, value: string): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.TIME),
    parameterValue: createScalarParameterValue(value),
  };
}

/**
 * Create a BYTES parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - Base64-encoded bytes.
 */
export function createBytesParameter(name: string | undefined, value: string): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.BYTES),
    parameterValue: createScalarParameterValue(value),
  };
}

/**
 * Create a NUMERIC parameter (named or positional).
 */
export function createNumericParameter(
  name: string | undefined,
  value: string | number
): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.NUMERIC),
    parameterValue: createScalarParameterValue(value.toString()),
  };
}

/**
 * Create a BIGNUMERIC parameter (named or positional).
 */
export function createBignumericParameter(
  name: string | undefined,
  value: string | number
): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.BIGNUMERIC),
    parameterValue: createScalarParameterValue(value.toString()),
  };
}

/**
 * Create a GEOGRAPHY parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - WKT (Well-Known Text) representation of geography.
 */
export function createGeographyParameter(
  name: string | undefined,
  value: string
): QueryParameter {
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.GEOGRAPHY),
    parameterValue: createScalarParameterValue(value),
  };
}

/**
 * Create a JSON parameter (named or positional).
 *
 * @param name - Parameter name (for named parameters).
 * @param value - JSON string or object.
 */
export function createJsonParameter(
  name: string | undefined,
  value: string | object
): QueryParameter {
  const jsonStr = typeof value === "string" ? value : JSON.stringify(value);
  return {
    name,
    parameterType: createScalarParameterType(ParameterType.JSON),
    parameterValue: createScalarParameterValue(jsonStr),
  };
}

/**
 * Serialize query parameter to BigQuery JSON format.
 */
export function serializeQueryParameter(param: QueryParameter): Record<string, unknown> {
  const json: Record<string, unknown> = {
    parameterType: serializeQueryParameterType(param.parameterType),
    parameterValue: serializeQueryParameterValue(param.parameterValue),
  };

  if (param.name) {
    json.name = param.name;
  }

  return json;
}

/**
 * Serialize query parameter type to BigQuery JSON format.
 */
export function serializeQueryParameterType(type: QueryParameterType): Record<string, unknown> {
  const json: Record<string, unknown> = {
    type: type.type,
  };

  if (type.arrayType) {
    json.arrayType = serializeQueryParameterType(type.arrayType);
  }

  if (type.structTypes) {
    json.structTypes = type.structTypes.map((field) => ({
      name: field.name,
      type: serializeQueryParameterType(field.type),
      description: field.description,
    }));
  }

  return json;
}

/**
 * Serialize query parameter value to BigQuery JSON format.
 */
export function serializeQueryParameterValue(value: QueryParameterValue): Record<string, unknown> {
  const json: Record<string, unknown> = {};

  if (value.value !== undefined) {
    json.value = value.value;
  }

  if (value.arrayValues) {
    json.arrayValues = value.arrayValues.map(serializeQueryParameterValue);
  }

  if (value.structValues) {
    const structValues: Record<string, Record<string, unknown>> = {};
    for (const [key, val] of Object.entries(value.structValues)) {
      structValues[key] = serializeQueryParameterValue(val);
    }
    json.structValues = structValues;
  }

  return json;
}

/**
 * Serialize query parameters to BigQuery JSON format.
 */
export function serializeQueryParameters(params: QueryParameters): {
  parameterMode: string;
  queryParameters: Record<string, unknown>[];
} {
  return {
    parameterMode: params.mode,
    queryParameters: params.parameters.map(serializeQueryParameter),
  };
}
