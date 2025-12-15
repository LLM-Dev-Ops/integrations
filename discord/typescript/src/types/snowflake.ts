/**
 * Discord Snowflake ID type and utilities.
 *
 * Discord Snowflakes are 64-bit unsigned integers containing timestamp information.
 * Format: timestamp (42 bits) | worker (5 bits) | process (5 bits) | increment (12 bits)
 */

/** Discord epoch (2015-01-01T00:00:00.000Z) in milliseconds */
export const DISCORD_EPOCH = 1420070400000n;

/**
 * Represents a Discord Snowflake ID.
 * Stored as a string to avoid JavaScript number precision issues with 64-bit integers.
 */
export type Snowflake = string;

/**
 * Validates if a string is a valid Snowflake ID.
 * @param value - The value to validate
 * @returns True if the value is a valid Snowflake
 */
export function isValidSnowflake(value: unknown): value is Snowflake {
  if (typeof value !== 'string') return false;
  if (!/^\d{17,20}$/.test(value)) return false;
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a string or number into a Snowflake.
 * @param value - The value to parse
 * @returns The Snowflake string
 * @throws Error if the value is not a valid Snowflake
 */
export function parseSnowflake(value: string | number | bigint): Snowflake {
  const strValue = String(value);
  if (!isValidSnowflake(strValue)) {
    throw new Error(`Invalid Snowflake ID: ${value}`);
  }
  return strValue;
}

/**
 * Gets the Unix timestamp (in milliseconds) when a Snowflake was created.
 * @param snowflake - The Snowflake ID
 * @returns The creation timestamp in milliseconds
 */
export function getSnowflakeTimestamp(snowflake: Snowflake): number {
  const id = BigInt(snowflake);
  const timestamp = (id >> 22n) + DISCORD_EPOCH;
  return Number(timestamp);
}

/**
 * Gets the creation Date of a Snowflake.
 * @param snowflake - The Snowflake ID
 * @returns The creation Date
 */
export function getSnowflakeDate(snowflake: Snowflake): Date {
  return new Date(getSnowflakeTimestamp(snowflake));
}

/**
 * Generates a mock Snowflake ID for simulation purposes.
 * @param timestamp - Optional timestamp in milliseconds (defaults to now)
 * @returns A valid Snowflake ID
 */
export function generateMockSnowflake(timestamp?: number): Snowflake {
  const ts = timestamp ?? Date.now();
  const discordTs = BigInt(ts) - DISCORD_EPOCH;
  // Shift timestamp to position and add random bits for worker/process/increment
  const snowflake = (discordTs << 22n) | BigInt(Math.floor(Math.random() * 0x3fffff));
  return snowflake.toString();
}

/**
 * Compares two Snowflakes chronologically.
 * @param a - First Snowflake
 * @param b - Second Snowflake
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareSnowflakes(a: Snowflake, b: Snowflake): number {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  if (bigA < bigB) return -1;
  if (bigA > bigB) return 1;
  return 0;
}
