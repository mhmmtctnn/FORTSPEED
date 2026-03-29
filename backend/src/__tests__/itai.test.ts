/**
 * ITAI Hub Integration Tests
 *
 * SSO endpoint, trace ID propagation, API key validation testleri.
 */

import { buildApp } from '../app';
import { verifyHS256Token } from '../middleware/itai';
import crypto from 'crypto';

// --- JWT Helper ---

function createTestJWT(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

// --- Mock DB & Redis ---

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockPg = { query: mockQuery, connect: jest.fn() };
const mockRedis = {
  publish: jest.fn().mockResolvedValue(1),
  subscribe: jest.fn(),
  on: jest.fn(),
};

const TEST_SECRET = 'test-secret-key-for-itai-sso';

// --- SSO Disabled (ITAI_MODE=false) ---

describe('ITAI SSO — Disabled Mode', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({
      testing: true,
      itaiMode: false,
      mockPg,
      mockRedis,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/sso returns 403 when ITAI_MODE=false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('SSO_DISABLED');
  });

  it('GET / returns 200 HTML dashboard even when disabled', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('FORTSPEED NOC');
  });

  it('GET /health returns 200 with itai_mode false', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('healthy');
    expect(body.module).toBe('fortspeed-noc');
    expect(body.itai_mode).toBe(false);
  });
});

// --- SSO Enabled (ITAI_MODE=true) ---

describe('ITAI SSO — Enabled Mode', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    process.env.ITAI_JWT_SECRET = TEST_SECRET;
    app = await buildApp({
      testing: true,
      itaiMode: true,
      mockPg,
      mockRedis,
    });
    await app.ready();
  });

  afterAll(async () => {
    delete process.env.ITAI_JWT_SECRET;
    await app.close();
  });

  it('returns 401 when no Bearer token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/sso' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('SSO_MISSING_TOKEN');
  });

  it('returns 401 for invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('SSO_INVALID_TOKEN');
  });

  it('returns 401 for expired token', async () => {
    const token = createTestJWT(
      { sub: 'user1', exp: Math.floor(Date.now() / 1000) - 3600 },
      TEST_SECRET,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for wrong secret', async () => {
    const token = createTestJWT(
      { sub: 'user1', exp: Math.floor(Date.now() / 1000) + 3600 },
      'wrong-secret',
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 for valid token', async () => {
    const token = createTestJWT(
      {
        sub: 'admin',
        preferred_username: 'itai_admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      TEST_SECRET,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.data.username).toBe('itai_admin');
  });

  it('falls back to sub when preferred_username missing', async () => {
    const token = createTestJWT(
      { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.username).toBe('user-123');
  });

  it('GET /health returns 200 with itai_mode true', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('healthy');
    expect(body.itai_mode).toBe(true);
  });

  it('GET / returns 200 HTML dashboard', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('FORTSPEED NOC');
  });

  it('GET /?itai_token=<valid> sets itaiUser on request', async () => {
    const token = createTestJWT(
      {
        sub: 'admin',
        preferred_username: 'iframe_user',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      TEST_SECRET,
    );
    const res = await app.inject({
      method: 'GET',
      url: `/?itai_token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('GET /?itai_token=<expired> still returns 200 HTML (silent fail)', async () => {
    const token = createTestJWT(
      { sub: 'admin', exp: Math.floor(Date.now() / 1000) - 3600 },
      TEST_SECRET,
    );
    const res = await app.inject({
      method: 'GET',
      url: `/?itai_token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});

// --- Trace ID Propagation ---

describe('ITAI Trace ID', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({
      testing: true,
      itaiMode: true,
      mockPg,
      mockRedis,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes X-ITAI-Trace-ID from request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: {
        'x-itai-trace-id': 'trace-abc-123',
        authorization: 'Bearer fake',
      },
    });
    expect(res.headers['x-itai-trace-id']).toBe('trace-abc-123');
  });

  it('generates UUID when no trace ID provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      headers: { authorization: 'Bearer fake' },
    });
    const traceId = res.headers['x-itai-trace-id'] as string;
    expect(traceId).toBeDefined();
    expect(traceId.length).toBeGreaterThan(0);
  });
});

// --- JWT Verification Unit Tests ---

describe('verifyHS256Token', () => {
  const secret = 'unit-test-secret';

  it('returns payload for valid token', () => {
    const token = createTestJWT(
      { sub: 'test', exp: Math.floor(Date.now() / 1000) + 60 },
      secret,
    );
    const result = verifyHS256Token(token, secret);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe('test');
  });

  it('returns null for expired token', () => {
    const token = createTestJWT(
      { sub: 'test', exp: Math.floor(Date.now() / 1000) - 60 },
      secret,
    );
    expect(verifyHS256Token(token, secret)).toBeNull();
  });

  it('returns null for wrong secret', () => {
    const token = createTestJWT(
      { sub: 'test', exp: Math.floor(Date.now() / 1000) + 60 },
      'other-secret',
    );
    expect(verifyHS256Token(token, secret)).toBeNull();
  });

  it('returns null for missing exp', () => {
    const token = createTestJWT({ sub: 'test' }, secret);
    expect(verifyHS256Token(token, secret)).toBeNull();
  });

  it('returns null for malformed token', () => {
    expect(verifyHS256Token('not.a.jwt.at.all', secret)).toBeNull();
    expect(verifyHS256Token('', secret)).toBeNull();
    expect(verifyHS256Token('single-part', secret)).toBeNull();
  });
});
