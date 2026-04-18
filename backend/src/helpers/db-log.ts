import { FastifyInstance } from 'fastify';

export type DbLogFn = (
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
  message: string,
  context?: unknown
) => Promise<void>;

export function createDbLog(fastify: FastifyInstance): DbLogFn {
  return async (severity, message, context) => {
    try {
      await fastify.pg.query(
        `INSERT INTO SystemLogs (Severity, Message, Context) VALUES ($1, $2, $3)`,
        [severity, message, context ? JSON.stringify(context) : null]
      );
    } catch (e: any) {
      fastify.log.error(e, 'Failed to write to SystemLogs');
    }
  };
}
