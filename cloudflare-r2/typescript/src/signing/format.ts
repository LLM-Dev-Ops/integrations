/**
 * Date formatting utilities for S3 Signature V4
 */

/**
 * Format date as YYYYMMDD
 */
export function formatDateStamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format date as YYYYMMDDTHHmmssZ (ISO 8601 basic format)
 */
export function formatAmzDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Parse AMZ date string (YYYYMMDDTHHmmssZ) to Date object
 */
export function parseAmzDate(amzDate: string): Date {
  const year = parseInt(amzDate.substring(0, 4), 10);
  const month = parseInt(amzDate.substring(4, 6), 10) - 1;
  const day = parseInt(amzDate.substring(6, 8), 10);
  const hours = parseInt(amzDate.substring(9, 11), 10);
  const minutes = parseInt(amzDate.substring(11, 13), 10);
  const seconds = parseInt(amzDate.substring(13, 15), 10);
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
}
