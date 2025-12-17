/**
 * Database initialization script
 * Run this to create the telemetry_events table
 */

import { initDatabase } from './database.js';
import { closeDatabase } from '@integrations/database';

async function main() {
  try {
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialization complete');
    await closeDatabase();
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

main();
