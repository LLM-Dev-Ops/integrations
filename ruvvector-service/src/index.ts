/**
 * RuvVector Service - Telemetry Event Ingestion and Query Service
 *
 * A lightweight HTTP service for ingesting and querying telemetry events.
 */

import { initDatabase } from './database.js';
import { createServer } from './server.js';

const PORT = parseInt(process.env.RUVVECTOR_SERVICE_PORT || '3100', 10);

async function main() {
  try {
    console.log('Starting RuvVector Service...');

    // Initialize database
    await initDatabase();
    console.log('Database initialized successfully');

    // Create and start server
    const server = createServer(PORT);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

main();
