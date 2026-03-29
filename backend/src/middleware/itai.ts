/**
 * ITAI Hub Integration Middleware
 *
 * ITAI_MODE=true oldugunda aktif:
 *  - SSO endpoint (POST /auth/sso) — JWT dogrulama ile session olusturma
 *  - Trace ID propagation (X-ITAI-Trace-ID header)
 *  - iframe cookie ayarlari (SameSite=None, Secure)
 *  - API key dogrulama (adapter cagirilari icin)
 *
 * ITAI_MODE=false (standalone) → SSO 403 doner, diger middleware'ler pasif.
 */

import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export const ITAI_MODE = process.env.ITAI_MODE?.toLowerCase() === 'true';

function getJwtSecret(): string {
  return process.env.ITAI_JWT_SECRET || '';
}

function getApiKey(): string {
  return process.env.FORTSPEED_API_KEY || '';
}

// --- JWT HS256 Verification ---

function base64UrlDecode(str: string): Buffer {
  // Base64url → Base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

export function verifyHS256Token(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerJson = base64UrlDecode(parts[0]).toString('utf8');
    const header = JSON.parse(headerJson);
    if (header.alg !== 'HS256') return null;

    // Verify signature
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(signingInput)
      .digest();
    const actualSig = base64UrlDecode(parts[2]);

    if (expectedSig.length !== actualSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

    const payloadJson = base64UrlDecode(parts[1]).toString('utf8');
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (!payload.exp) return null;
    if (Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// --- Middleware Registration ---

export async function registerItaiMiddleware(
  fastify: FastifyInstance,
  opts: { itaiMode?: boolean } = {},
): Promise<void> {
  const isItaiMode = opts.itaiMode ?? ITAI_MODE;

  // Decorate request with trace ID
  fastify.decorateRequest('itaiTraceId', '');

  // SSO Endpoint — always registered, returns 403 when disabled
  fastify.post('/auth/sso', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isItaiMode) {
      return reply.status(403).send({
        status: 'error',
        message: 'SSO disabled',
        code: 'SSO_DISABLED',
      });
    }

    const authHeader = request.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        status: 'error',
        message: 'Missing Bearer token',
        code: 'SSO_MISSING_TOKEN',
      });
    }

    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return reply.status(500).send({
        status: 'error',
        message: 'SSO not configured',
        code: 'SSO_NOT_CONFIGURED',
      });
    }

    const token = authHeader.slice(7);
    const payload = verifyHS256Token(token, jwtSecret);

    if (!payload) {
      return reply.status(401).send({
        status: 'error',
        message: 'Invalid or expired token',
        code: 'SSO_INVALID_TOKEN',
      });
    }

    const username =
      (payload.preferred_username as string) ||
      (payload.sub as string) ||
      'itai_user';

    fastify.log.info(`SSO login successful for user: ${username}`);

    return reply.send({
      status: 'success',
      data: { session: 'created', username },
      timestamp: new Date().toISOString(),
    });
  });

  if (!isItaiMode) {
    fastify.log.info('ITAI_MODE is disabled — middleware inactive.');
    return;
  }

  if (!getJwtSecret()) {
    fastify.log.error(
      'ITAI_MODE is enabled but ITAI_JWT_SECRET is not set!',
    );
  }

  fastify.log.info('ITAI_MODE is enabled — registering middleware.');

  // Trace ID propagation + SSO auto-login via query param
  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Trace ID
      const traceId =
        (request.headers['x-itai-trace-id'] as string) ||
        crypto.randomUUID();
      (request as any).itaiTraceId = traceId;

      // SSO auto-login via itai_token query param (iframe first load)
      const query = request.query as Record<string, string>;
      const itaiToken = query?.itai_token;
      if (itaiToken) {
        const jwtSecret = getJwtSecret();
        if (jwtSecret) {
          const payload = verifyHS256Token(itaiToken, jwtSecret);
          if (payload) {
            const username =
              (payload.preferred_username as string) ||
              (payload.sub as string) ||
              'itai_user';
            fastify.log.info(`SSO auto-login via query param for user: ${username}`);
            // Decorate request with SSO user info for downstream use
            (request as any).itaiSsoUser = username;
            (request as any).itaiSsoPayload = payload;
          } else {
            fastify.log.warn('SSO query param token verification failed.');
          }
        }
      }
    },
  );

  fastify.addHook(
    'onSend',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      _payload: unknown,
    ) => {
      const traceId = (request as any).itaiTraceId;
      if (traceId) {
        reply.header('X-ITAI-Trace-ID', traceId);
      }
      // iframe cookie headers
      reply.header(
        'Set-Cookie',
        `SameSite=None; Secure; HttpOnly; Path=/`,
      );
      return _payload;
    },
  );
}

// --- API Key Validation Helper ---

export function validateApiKey(request: FastifyRequest): boolean {
  const apiKey = getApiKey();
  if (!ITAI_MODE || !apiKey) return true;

  const authHeader = request.headers.authorization || '';
  const apiKeyHeader = request.headers['x-api-key'] as string || '';

  let clientKey = '';
  if (authHeader.startsWith('Bearer ')) {
    clientKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    clientKey = apiKeyHeader;
  }

  if (!clientKey) return false;

  try {
    const expected = Buffer.from(apiKey);
    const actual = Buffer.from(clientKey);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
