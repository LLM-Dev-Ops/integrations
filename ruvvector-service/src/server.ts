/**
 * HTTP Server for RuvVector Service
 */

import http from 'node:http';
import { TelemetryEvent, HealthStatus, ApiResponse } from './types.js';
import { insertEvent, insertEvents, queryEvents, getDb } from './database.js';
import { HttpError, MAX_BODY_BYTES, parseQueryParams, validatePayload } from './validation.js';

/**
 * Parse JSON body from request
 */
export async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  const contentType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        reject(new HttpError(413, `request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(data);
    });
    req.on('end', () => {
      if (settled) return;
      const body = Buffer.concat(chunks).toString('utf8');
      if (body.trim().length === 0) return reject(new HttpError(400, 'request body must not be empty'));
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, 'request body must be valid JSON'));
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
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle POST /ingest endpoint
 */
async function handleIngest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const events = validatePayload(await parseBody(req));
    if (events.length === 1) {
      await insertEvent(events[0]);
    } else {
      await insertEvents(events);
    }
    sendJson(res, 200, {
      success: true,
      data: { received: events.length },
    } as ApiResponse);
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('Ingest error:', error);
    sendJson(res, error instanceof HttpError ? error.status : 500, {
      success: false,
      error: error instanceof HttpError ? error.message : 'Internal server error',
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
    const events = await queryEvents(parseQueryParams(req.url || '/query'));
    sendJson(res, 200, {
      success: true,
      data: events,
    } as ApiResponse<TelemetryEvent[]>);
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('Query error:', error);
    sendJson(res, error instanceof HttpError ? error.status : 500, {
      success: false,
      error: error instanceof HttpError ? error.message : 'Internal server error',
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
    const path = url.split('?', 1)[0];

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
    if (method === 'POST' && path === '/ingest') {
      handleIngest(req, res);
    } else if (method === 'GET' && path === '/query') {
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
