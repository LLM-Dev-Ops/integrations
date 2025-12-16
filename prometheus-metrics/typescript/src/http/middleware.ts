import { MetricsHandler, HandlerConfig } from './handler';

/**
 * Minimal MetricsRegistry interface.
 */
interface MetricsRegistry {
  gather(): Promise<any[]>;
}

/**
 * Minimal serializer interface.
 */
interface Serializer {
  serialize(metrics: any[]): string;
}

/**
 * Express request interface (minimal).
 */
interface ExpressRequest {
  headers: {
    accept?: string;
    'accept-encoding'?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Express response interface (minimal).
 */
interface ExpressResponse {
  status(code: number): ExpressResponse;
  setHeader(name: string, value: string): void;
  send(body: string | Buffer): void;
}

/**
 * Fastify request interface (minimal).
 */
interface FastifyRequest {
  headers: {
    accept?: string;
    'accept-encoding'?: string;
    [key: string]: string | string[] | undefined;
  };
}

/**
 * Fastify reply interface (minimal).
 */
interface FastifyReply {
  code(statusCode: number): FastifyReply;
  header(name: string, value: string): FastifyReply;
  send(payload: string | Buffer): FastifyReply;
}

/**
 * Create Express middleware for metrics endpoint.
 */
export function createExpressMiddleware(
  registry: MetricsRegistry,
  prometheusSerializer: Serializer,
  openMetricsSerializer: Serializer,
  config?: HandlerConfig
) {
  const handler = new MetricsHandler(
    registry,
    prometheusSerializer,
    openMetricsSerializer,
    config
  );

  return async (req: ExpressRequest, res: ExpressResponse) => {
    const response = await handler.handle({
      accept: req.headers['accept'],
      acceptEncoding: req.headers['accept-encoding']
    });

    res.status(response.status);
    for (const [key, value] of Object.entries(response.headers)) {
      res.setHeader(key, value);
    }
    res.send(response.body);
  };
}

/**
 * Create Fastify route handler.
 */
export function createFastifyHandler(
  registry: MetricsRegistry,
  prometheusSerializer: Serializer,
  openMetricsSerializer: Serializer,
  config?: HandlerConfig
) {
  const handler = new MetricsHandler(
    registry,
    prometheusSerializer,
    openMetricsSerializer,
    config
  );

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const accept = Array.isArray(request.headers.accept)
      ? request.headers.accept[0]
      : request.headers.accept;
    const acceptEncoding = Array.isArray(request.headers['accept-encoding'])
      ? request.headers['accept-encoding'][0]
      : request.headers['accept-encoding'];

    const response = await handler.handle({
      accept,
      acceptEncoding
    });

    reply.code(response.status);
    for (const [key, value] of Object.entries(response.headers)) {
      reply.header(key, value);
    }
    return reply.send(response.body);
  };
}
