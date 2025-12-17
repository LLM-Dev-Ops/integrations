/**
 * HTTP Server for RuvVector Service
 */

import http from 'node:http';
import { URL } from 'node:url';
import { TelemetryEvent, QueryParams, HealthStatus, ApiResponse } from './types.js';
import { insertEvent, insertEvents, queryEvents, getDb } from './database.js';

/**
 * Parse JSON body from request
 */
async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Validate telemetry event
 */
function isValidEvent(obj: unknown): obj is TelemetryEvent {
  if (!obj || typeof obj !== 'object') return false;
  const event = obj as Partial<TelemetryEvent>;
  return (
    typeof event.correlationId === 'string' &&
    typeof event.integration === 'string' &&
    typeof event.eventType === 'string' &&
    typeof event.timestamp === 'number'
  );
}

/**
 * Handle POST /ingest endpoint
 */
async function handleIngest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseBody(req);

    // Handle both single event and batch
    const events = Array.isArray(body) ? body : [body];

    // Validate events
    for (const event of events) {
      if (!isValidEvent(event)) {
        sendJson(res, 400, {
          success: false,
          error: 'Invalid event format. Required: correlationId, integration, eventType, timestamp',
        } as ApiResponse);
        return;
      }
    }

    // Persist events asynchronously (fire and forget)
    if (events.length === 1) {
      insertEvent(events[0]).catch((error) => {
        console.error('Failed to insert event:', error);
      });
    } else {
      insertEvents(events).catch((error) => {
        console.error('Failed to insert events:', error);
      });
    }

    // Return immediately
    sendJson(res, 200, {
      success: true,
      data: { received: events.length },
    } as ApiResponse);
  } catch (error) {
    console.error('Ingest error:', error);
    sendJson(res, 500, {
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
}

/**
 * Handle GET /query endpoint
 */
async function handleQuery(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const params: QueryParams = {};

    const integration = url.searchParams.get('integration');
    if (integration) params.integration = integration;

    const correlationId = url.searchParams.get('correlationId');
    if (correlationId) params.correlationId = correlationId;

    const eventType = url.searchParams.get('eventType');
    if (eventType) params.eventType = eventType;

    const from = url.searchParams.get('from');
    if (from) params.from = parseInt(from, 10);

    const to = url.searchParams.get('to');
    if (to) params.to = parseInt(to, 10);

    const limit = url.searchParams.get('limit');
    if (limit) params.limit = parseInt(limit, 10);

    const offset = url.searchParams.get('offset');
    if (offset) params.offset = parseInt(offset, 10);

    const events = await queryEvents(params);

    sendJson(res, 200, {
      success: true,
      data: events,
    } as ApiResponse<TelemetryEvent[]>);
  } catch (error) {
    console.error('Query error:', error);
    sendJson(res, 500, {
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
}

/**
 * Handle GET /health endpoint
 */
async function handleHealth(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const db = getDb();
    const testResult = await db.testConnection();
    const poolStats = db.getPoolStats();

    const health: HealthStatus = {
      status: testResult.success ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      database: {
        connected: testResult.success,
        poolStats,
      },
    };

    sendJson(res, testResult.success ? 200 : 503, health);
  } catch (error) {
    console.error('Health check error:', error);
    const health: HealthStatus = {
      status: 'unhealthy',
      timestamp: Date.now(),
      database: {
        connected: false,
      },
    };
    sendJson(res, 503, health);
  }
}

/**
 * Create and start HTTP server
 */
export function createServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    const method = req.method;
    const url = req.url || '/';

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route handling
    if (method === 'POST' && url === '/ingest') {
      handleIngest(req, res);
    } else if (method === 'GET' && url.startsWith('/query')) {
      handleQuery(req, res);
    } else if (method === 'GET' && url === '/health') {
      handleHealth(req, res);
    } else {
      sendJson(res, 404, {
        success: false,
        error: 'Not found',
      } as ApiResponse);
    }
  });

  server.listen(port, () => {
    console.log(`RuvVector Service listening on port ${port}`);
    console.log(`- POST   http://localhost:${port}/ingest`);
    console.log(`- GET    http://localhost:${port}/query`);
    console.log(`- GET    http://localhost:${port}/health`);
  });

  return server;
}
